import { DecisionContext } from "../types/index";

export type DailyRiskBudgetStatus = "healthy" | "throttled" | "blocked";

export interface DailyRiskBudgetInput {
  maxDailyLossUsd: number;
  dailyLossUsd: number;
  breakerActive: boolean;
  breakerReason: string | null;
  consecutiveLosses: number;
  cppiScale: number;
  volatilityThrottleActive: boolean;
  volatilityPct: number | null;
}

export interface DailyRiskBudgetPolicy {
  status: DailyRiskBudgetStatus;
  multiplier: number;
  remainingBudgetUsd: number;
  utilizationPct: number;
  reason: string;
}

const THROTTLE_START_PCT = 0.55;
const THROTTLE_FLOOR_MULTIPLIER = 0.2;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function evaluateDailyRiskBudget(input: DailyRiskBudgetInput): DailyRiskBudgetPolicy {
  const budgetUsd = Number.isFinite(input.maxDailyLossUsd) ? Math.max(0, input.maxDailyLossUsd) : 0;
  const lossUsd = Number.isFinite(input.dailyLossUsd) ? Math.max(0, input.dailyLossUsd) : 0;
  const remainingBudgetUsd = Math.max(0, budgetUsd - lossUsd);
  const utilizationPct = budgetUsd > 0 ? clamp(lossUsd / budgetUsd, 0, 1) : 1;

  if (budgetUsd <= 0) {
    return {
      status: "blocked",
      multiplier: 0,
      remainingBudgetUsd: 0,
      utilizationPct: 1,
      reason: "daily budget unavailable",
    };
  }

  if (input.breakerActive) {
    return {
      status: "blocked",
      multiplier: 0,
      remainingBudgetUsd,
      utilizationPct,
      reason: `breaker:${input.breakerReason || "active"}`,
    };
  }

  if (remainingBudgetUsd <= 0) {
    return {
      status: "blocked",
      multiplier: 0,
      remainingBudgetUsd: 0,
      utilizationPct: 1,
      reason: "daily budget exhausted",
    };
  }

  if (utilizationPct < THROTTLE_START_PCT) {
    const mildRiskNote = input.volatilityThrottleActive && typeof input.volatilityPct === "number"
      ? ` | volatility=${input.volatilityPct.toFixed(2)}%`
      : "";

    return {
      status: "healthy",
      multiplier: 1,
      remainingBudgetUsd,
      utilizationPct,
      reason: `daily budget healthy${mildRiskNote}`,
    };
  }

  const throttleSpan = Math.max(0.0001, 1 - THROTTLE_START_PCT);
  const normalized = clamp((utilizationPct - THROTTLE_START_PCT) / throttleSpan, 0, 1);
  const cppiAdjustment = clamp(input.cppiScale, 0.2, 1);
  const volatilityAdjustment = input.volatilityThrottleActive ? 0.85 : 1;
  const multiplier = clamp(
    (1 - (normalized * 0.8)) * cppiAdjustment * volatilityAdjustment,
    THROTTLE_FLOOR_MULTIPLIER,
    1
  );

  const volatilityNote = input.volatilityThrottleActive && typeof input.volatilityPct === "number"
    ? ` | volatility=${input.volatilityPct.toFixed(2)}%`
    : "";

  return {
    status: "throttled",
    multiplier,
    remainingBudgetUsd,
    utilizationPct,
    reason: `daily budget ${utilizationPct.toFixed(2)} used, cppi=${input.cppiScale.toFixed(3)}${volatilityNote}`,
  };
}

export function formatDailyRiskBudgetSummary(policy: DailyRiskBudgetPolicy): string {
  return [
    `dailyBudget=${policy.status}`,
    `remaining=$${policy.remainingBudgetUsd.toFixed(2)}`,
    `used=${(policy.utilizationPct * 100).toFixed(1)}%`,
    `multiplier=${policy.multiplier.toFixed(3)}`,
  ].join(" ");
}

export function createDailyBudgetDecisionContext(
  existing: DecisionContext | undefined,
  policy: DailyRiskBudgetPolicy,
  budgetLimitUsd: number
): DecisionContext {
  return {
    ...(existing || {}),
    dailyBudgetStatus: policy.status,
    dailyBudgetLimitUsd: budgetLimitUsd,
    dailyBudgetRemainingUsd: policy.remainingBudgetUsd,
    dailyBudgetUtilizationPct: policy.utilizationPct,
    dailyBudgetMultiplier: policy.multiplier,
    dailyBudgetReason: policy.reason,
  };
}