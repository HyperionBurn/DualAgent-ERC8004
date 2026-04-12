import type { DecisionContext } from "../types/index";
import type { IndicatorSnapshot, MarketRegime } from "../tools/indicators";

export type RegimeSizingStatus = "expanded" | "held" | "reduced";

export interface RegimeSizingInput {
  indicatorSnapshot: Pick<IndicatorSnapshot, "regimeLabel" | "regimeConfidence" | "trendStrengthBps" | "spreadBps" | "vwapPremiumPct" | "realizedVolPct">;
  currentAmountUsd: number;
}

export interface RegimeSizingPolicy {
  status: RegimeSizingStatus;
  multiplier: number;
  reason: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function regimeBaseFactor(regimeLabel: MarketRegime, regimeConfidence: number): number {
  const confidence = clamp(regimeConfidence, 0, 1);

  switch (regimeLabel) {
    case "trend-up":
    case "trend-down":
      return 1 + clamp((confidence - 0.7) * 0.3, 0, 0.12);
    case "range":
      return 0.96 + clamp((0.65 - confidence) * 0.07, 0, 0.04);
    case "volatile-chop":
      return 0.72 + clamp(confidence * 0.05, 0, 0.05);
    default:
      return 1;
  }
}

function trendFactor(trendStrengthBps: number | null, regimeLabel: MarketRegime, regimeConfidence: number): number {
  if (trendStrengthBps === null || !Number.isFinite(trendStrengthBps)) {
    return regimeLabel.startsWith("trend") && regimeConfidence >= 0.75 ? 1.03 : 0.99;
  }

  const normalized = clamp((trendStrengthBps - 0.6) / 3, 0, 1);
  if (regimeLabel === "trend-up" || regimeLabel === "trend-down") {
    return 1 + clamp(0.01 + (normalized * 0.09), 0.01, 0.1);
  }

  return 1 - clamp(0.04 + (1 - normalized) * 0.02, 0.04, 0.06);
}

function spreadFactor(spreadBps: number): number {
  if (!Number.isFinite(spreadBps)) {
    return 1;
  }

  if (spreadBps <= 1.5) return 1.02;
  if (spreadBps <= 3) return 1;
  if (spreadBps <= 5) return 0.92;
  return 0.84;
}

function vwapFactor(regimeLabel: MarketRegime, vwapPremiumPct: number): number {
  if (!Number.isFinite(vwapPremiumPct)) {
    return 1;
  }

  const premiumMagnitude = Math.abs(vwapPremiumPct);
  const boost = clamp(premiumMagnitude * 0.3, 0, 0.08);
  const penalty = clamp(premiumMagnitude * 0.45, 0, 0.12);

  if (regimeLabel === "trend-up") {
    return vwapPremiumPct >= 0 ? 1 + boost : 1 - penalty;
  }

  if (regimeLabel === "trend-down") {
    return vwapPremiumPct <= 0 ? 1 + boost : 1 - penalty;
  }

  return 1 - clamp(premiumMagnitude * 0.2, 0, 0.06);
}

function volatilityFactor(realizedVolPct: number | null): number {
  if (realizedVolPct === null || !Number.isFinite(realizedVolPct)) {
    return 1;
  }

  if (realizedVolPct >= 4) return 0.74;
  if (realizedVolPct >= 3) return 0.84;
  if (realizedVolPct >= 2) return 0.94;
  return 1;
}

export function evaluateRegimeAwareSizing(input: RegimeSizingInput): RegimeSizingPolicy {
  const base = regimeBaseFactor(input.indicatorSnapshot.regimeLabel, input.indicatorSnapshot.regimeConfidence);
  const trend = trendFactor(input.indicatorSnapshot.trendStrengthBps, input.indicatorSnapshot.regimeLabel, input.indicatorSnapshot.regimeConfidence);
  const spread = spreadFactor(input.indicatorSnapshot.spreadBps);
  const vwap = vwapFactor(input.indicatorSnapshot.regimeLabel, input.indicatorSnapshot.vwapPremiumPct);
  const volatility = volatilityFactor(input.indicatorSnapshot.realizedVolPct);

  const rawMultiplier = clamp(base * trend * spread * vwap * volatility, 0.35, 1.35);
  const multiplier = round4(rawMultiplier);
  const currentAmount = Number.isFinite(input.currentAmountUsd) ? Math.max(0, input.currentAmountUsd) : 0;

  let status: RegimeSizingStatus = "held";
  if (multiplier > 1.05) {
    status = "expanded";
  } else if (multiplier < 0.95) {
    status = "reduced";
  }

  const reason = [
    `regime=${input.indicatorSnapshot.regimeLabel}@${input.indicatorSnapshot.regimeConfidence.toFixed(2)}`,
    `trend=${input.indicatorSnapshot.trendStrengthBps !== null ? input.indicatorSnapshot.trendStrengthBps.toFixed(2) : "n/a"}bps`,
    `spread=${input.indicatorSnapshot.spreadBps.toFixed(2)}bps`,
    `vwapPremium=${input.indicatorSnapshot.vwapPremiumPct.toFixed(4)}%`,
    `vol=${input.indicatorSnapshot.realizedVolPct !== null ? input.indicatorSnapshot.realizedVolPct.toFixed(4) : "n/a"}%`,
    `amount=${currentAmount.toFixed(2)}usd`,
  ].join(" ");

  return {
    status,
    multiplier,
    reason,
  };
}

export function createRegimeSizingDecisionContext(
  existing: DecisionContext | undefined,
  policy: RegimeSizingPolicy
): DecisionContext {
  return {
    ...(existing || {}),
    regimeSizingStatus: policy.status,
    regimeSizingMultiplier: policy.multiplier,
    regimeSizingReason: policy.reason,
  };
}

export function formatRegimeSizingSummary(policy: RegimeSizingPolicy): string {
  return `regimeSizing=${policy.status} multiplier=${policy.multiplier.toFixed(4)} reason=${policy.reason}`;
}