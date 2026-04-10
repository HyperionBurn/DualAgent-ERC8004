import type { TradeDecision } from "../types/index";
import type { IndicatorSnapshot } from "../tools/indicators";

export interface ValidationAttestationInput {
  decision: TradeDecision;
  indicatorSnapshot?: IndicatorSnapshot;
  fillExecuted: boolean;
  defaultEdgeThresholdBps?: number;
}

export interface ValidationAttestationScore {
  score: number;
  notes: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function computeValidationAttestationScore(input: ValidationAttestationInput): ValidationAttestationScore {
  const confidence = clamp(finiteNumber(input.decision.confidence, 0.5), 0, 1);
  const decisionEdge = finiteNumber(input.decision.decisionContext?.netEdgeBps, Number.NaN);
  const indicatorEdge = finiteNumber(input.indicatorSnapshot?.netEdgeBps, 0);
  const netEdgeBps = Number.isFinite(decisionEdge) ? decisionEdge : indicatorEdge;
  const edgeThresholdBps = Math.max(
    0.5,
    finiteNumber(
      input.decision.decisionContext?.edgeThresholdBps,
      finiteNumber(input.defaultEdgeThresholdBps, 8)
    )
  );

  const riskGateStatus = String(input.decision.decisionContext?.riskGateStatus || "").toLowerCase();
  const blockedByRiskGate = /block|breaker|reject|cap|guardrail|floor/.test(riskGateStatus);
  const regimeConfidence = clamp(finiteNumber(input.indicatorSnapshot?.regimeConfidence, 0.5), 0, 1);
  const holdWithCleanEdge = input.decision.action === "HOLD"
    && netEdgeBps >= edgeThresholdBps
    && !blockedByRiskGate;
  const tradeWithoutCleanEdge = input.decision.action !== "HOLD"
    && netEdgeBps < edgeThresholdBps;

  let score = 45 + (confidence * 30);

  if (netEdgeBps >= edgeThresholdBps + 8) {
    score += 16;
  } else if (netEdgeBps >= edgeThresholdBps) {
    score += 12;
  } else if (netEdgeBps >= edgeThresholdBps * 0.6) {
    score += 9;
  } else {
    score += 5;
  }

  if (input.decision.action === "HOLD") {
    if (blockedByRiskGate) {
      score += 18;
    } else if (holdWithCleanEdge) {
      score += 6;
    } else {
      score += 10;
    }
  } else {
    if (blockedByRiskGate) {
      score += 6;
    } else if (tradeWithoutCleanEdge) {
      score += 8;
    } else {
      score += 14;
    }
  }

  if (input.fillExecuted && input.decision.action !== "HOLD") {
    score += 15;
  } else if (input.decision.action === "HOLD") {
    score += holdWithCleanEdge ? 6 : 10;
  } else {
    score += 3;
  }

  if (regimeConfidence >= 0.7) {
    score += 5;
  } else if (regimeConfidence >= 0.55) {
    score += 3;
  } else if (regimeConfidence >= 0.45) {
    score += 2;
  }

  const boundedScore = clamp(Math.round(score), 1, 99);
  const edgeSurplusBps = Math.max(0, netEdgeBps - edgeThresholdBps);
  const notes = [
    `conf=${Math.round(confidence * 100)}`,
    `netEdge=${netEdgeBps.toFixed(2)}`,
    `surplus=${edgeSurplusBps.toFixed(2)}`,
    `gate=${edgeThresholdBps.toFixed(2)}`,
    `fill=${input.fillExecuted}`,
    `holdMiss=${holdWithCleanEdge}`,
    `risk=${riskGateStatus || "none"}`,
    `regime=${regimeConfidence.toFixed(2)}`,
  ].join(" ");

  return {
    score: boundedScore,
    notes,
  };
}
