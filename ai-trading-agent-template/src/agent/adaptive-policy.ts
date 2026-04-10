import * as fs from "fs";
import * as path from "path";
import { ReputationRegistryClient } from "../onchain/reputationRegistry";
import { ValidationRegistryClient } from "../onchain/validationRegistry";

export interface AdaptiveRuntimePolicyInput {
  agentId: bigint;
  validationRegistry: ValidationRegistryClient;
  reputationRegistry?: ReputationRegistryClient | null;
  reputationEvidenceFile?: string;
  baseConfidenceFloor: number;
  baseEdgeFloorBps: number;
  baseTradeAmountUsd: number;
  baseProbeAmountUsd: number;
  baseTradeIntervalMs: number;
  targetValidationScore?: number;
  targetReputationScore?: number;
}

export interface AdaptiveRuntimePolicy {
  validationAverageScore: number;
  validationRecentAverageScore: number;
  validationAttestationCount: number;
  reputationAverageScore: number;
  reputationRecentAverageScore: number;
  reputationFeedbackCount: number;
  reputationDistinctRaterCount: number;
  confidenceFloor: number;
  edgeFloorBps: number;
  tradeAmountUsd: number;
  probeAmountUsd: number;
  probeMinConfidence: number;
  minTradeIntervalMs: number;
  maxTradesPerHour: number;
  freshScoreWindowRecommended: boolean;
  freshScoreWindowReason: string;
  summary: string;
}

interface LocalFeedbackRow {
  agentId?: string;
  rater?: string;
  score?: number;
  timestamp?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function blend(primary: number, recent: number, recentWeight = 0.55): number {
  return (primary * (1 - recentWeight)) + (recent * recentWeight);
}

function lastValues<T>(values: T[], count: number): T[] {
  if (values.length <= count) {
    return [...values];
  }

  return values.slice(values.length - count);
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function sortByTimestamp<T extends { timestamp?: number }>(values: T[]): T[] {
  return [...values].sort((left, right) => finiteNumber(left.timestamp) - finiteNumber(right.timestamp));
}

function readJsonLines(filePath: string): LocalFeedbackRow[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line) as LocalFeedbackRow;
      } catch {
        return null;
      }
    })
    .filter((row): row is LocalFeedbackRow => row !== null)
    .filter((row) => typeof row.score === "number" && Number.isFinite(row.score));
}

function loadLocalFeedback(agentId: string, filePath: string): LocalFeedbackRow[] {
  return readJsonLines(filePath)
    .filter((row) => String(row.agentId ?? "").trim() === agentId)
    .map((row) => ({
      agentId: String(row.agentId ?? agentId),
      rater: typeof row.rater === "string" ? row.rater : undefined,
      score: finiteNumber(row.score, 0),
      timestamp: finiteNumber(row.timestamp, 0),
    }));
}

function formatSummary(input: {
  validationAverageScore: number;
  validationRecentAverageScore: number;
  validationAttestationCount: number;
  reputationAverageScore: number;
  reputationRecentAverageScore: number;
  reputationFeedbackCount: number;
  reputationDistinctRaterCount: number;
  confidenceFloor: number;
  edgeFloorBps: number;
  tradeAmountUsd: number;
  probeAmountUsd: number;
  minTradeIntervalMs: number;
  pressure: number;
  freshScoreWindowRecommended: boolean;
}): string {
  return [
    `validation=${input.validationAverageScore.toFixed(2)} recent=${input.validationRecentAverageScore.toFixed(2)} count=${input.validationAttestationCount}`,
    `reputation=${input.reputationAverageScore.toFixed(2)} recent=${input.reputationRecentAverageScore.toFixed(2)} count=${input.reputationFeedbackCount} raters=${input.reputationDistinctRaterCount}`,
    `floors conf=${input.confidenceFloor.toFixed(2)} edge=${input.edgeFloorBps}bps pressure=${input.pressure.toFixed(2)}`,
    `size trade=${input.tradeAmountUsd.toFixed(2)}usd probe=${input.probeAmountUsd.toFixed(2)}usd cooldown=${Math.round(input.minTradeIntervalMs / 1000)}s window=${input.freshScoreWindowRecommended ? "refresh" : "keep"}`,
  ].join(" | ");
}

export function applyAdaptiveRuntimeHints(policy: AdaptiveRuntimePolicy): void {
  process.env.ADAPTIVE_POLICY_SUMMARY = policy.summary;
  process.env.INDICATOR_MIN_CONFIDENCE = policy.confidenceFloor.toFixed(4);
  process.env.INDICATOR_MIN_NET_EDGE_BPS = String(policy.edgeFloorBps);
  process.env.INDICATOR_TRADE_AMOUNT_USD = policy.tradeAmountUsd.toFixed(2);
  process.env.INDICATOR_MIN_TRADE_INTERVAL_MS = String(policy.minTradeIntervalMs);
  process.env.PLANNER_MIN_CONFIDENCE = policy.confidenceFloor.toFixed(4);
  process.env.PLANNER_MIN_EXPECTED_EDGE_BPS = String(policy.edgeFloorBps);
  process.env.PLANNER_MAX_TRADE_USD = policy.tradeAmountUsd.toFixed(2);
  process.env.PLANNER_MAX_TRADES_PER_HOUR = String(policy.maxTradesPerHour);
  process.env.DUAL_GATE_MIN_NET_EDGE_BPS = String(policy.edgeFloorBps);
  process.env.DUAL_GATE_PROBE_USD = policy.probeAmountUsd.toFixed(2);
  process.env.DUAL_GATE_PROBE_MIN_CONFIDENCE = policy.probeMinConfidence.toFixed(4);
  process.env.ADAPTIVE_POLICY_FRESH_SCORE_WINDOW_RECOMMENDED = policy.freshScoreWindowRecommended ? "true" : "false";
  process.env.ADAPTIVE_POLICY_FRESH_SCORE_WINDOW_REASON = policy.freshScoreWindowReason;
}

export async function buildAdaptiveRuntimePolicy(input: AdaptiveRuntimePolicyInput): Promise<AdaptiveRuntimePolicy> {
  const validationTarget = input.targetValidationScore ?? 82;
  const reputationTarget = input.targetReputationScore ?? 90;
  const reputationEvidenceFile = input.reputationEvidenceFile ?? path.join(process.cwd(), "reputation-feedback.jsonl");

  const [attestations, validationAverageFromChain] = await Promise.all([
    input.validationRegistry.getAttestations(input.agentId).catch(() => []),
    input.validationRegistry.getAverageScore(input.agentId).catch(() => 0),
  ]);

  const validationScores = sortByTimestamp(attestations)
    .map((attestation) => finiteNumber(attestation.score, 0))
    .filter((score) => Number.isFinite(score) && score >= 0 && score <= 100);
  const validationAverageScore = validationScores.length > 0 ? average(validationScores) : validationAverageFromChain;
  const validationRecentAverageScore = validationScores.length > 0 ? average(lastValues(validationScores, 6)) : validationAverageScore;
  const validationAttestationCount = validationScores.length;
  const validationBlend = blend(validationAverageScore, validationRecentAverageScore, 0.55);

  let reputationRows: LocalFeedbackRow[] = [];
  let reputationAverageScore = 0;

  if (input.reputationRegistry) {
    try {
      const [history, averageScore] = await Promise.all([
        input.reputationRegistry.getFeedbackHistory(input.agentId),
        input.reputationRegistry.getAverageScore(input.agentId),
      ]);

      reputationRows = history
        .map((entry) => ({
          agentId: input.agentId.toString(),
          rater: entry.rater,
          score: finiteNumber(entry.score, 0),
          timestamp: finiteNumber(entry.timestamp, 0),
        }))
        .filter((entry) => Number.isFinite(entry.score) && entry.score >= 0 && entry.score <= 100);
      reputationAverageScore = averageScore;
    } catch {
      reputationRows = [];
      reputationAverageScore = 0;
    }
  }

  if (reputationRows.length === 0) {
    reputationRows = loadLocalFeedback(input.agentId.toString(), reputationEvidenceFile);
    reputationAverageScore = reputationRows.length > 0
      ? average(reputationRows.map((entry) => finiteNumber(entry.score, 0)))
      : 0;
  }

  reputationRows = sortByTimestamp(reputationRows);
  const reputationRecentAverageScore = reputationRows.length > 0
    ? average(lastValues(reputationRows.map((entry) => finiteNumber(entry.score, 0)), 6))
    : reputationAverageScore;
  const reputationFeedbackCount = reputationRows.length;
  const reputationDistinctRaterCount = new Set(
    reputationRows
      .map((entry) => (typeof entry.rater === "string" ? entry.rater.trim() : ""))
      .filter((rater) => rater.length > 0)
  ).size;
  const reputationBlend = blend(reputationAverageScore, reputationRecentAverageScore, 0.55);

  const validationPressure = clamp((validationTarget - validationBlend) / 30, 0, 1);
  const reputationPressure = clamp((reputationTarget - reputationBlend) / 40, 0, 1);
  const pressure = clamp((validationPressure * 0.7) + (reputationPressure * 0.3), 0, 1);
  const freshScoreWindowRecommended = (
    (validationAverageScore < validationTarget || reputationAverageScore < reputationTarget)
    && pressure >= 0.35
    && (confidenceFloorWouldTighten(input.baseConfidenceFloor, pressure, edgeFloorWouldTighten(input.baseEdgeFloorBps, pressure)))
  );
  const freshScoreWindowReason = freshScoreWindowRecommended
    ? `validation/reputation history is still under target (validation ${validationBlend.toFixed(2)}/${validationTarget}, reputation ${reputationBlend.toFixed(2)}/${reputationTarget}) and policy pressure=${pressure.toFixed(2)} is tightening the next run`
    : `current window is usable (validation ${validationBlend.toFixed(2)}/${validationTarget}, reputation ${reputationBlend.toFixed(2)}/${reputationTarget}, pressure=${pressure.toFixed(2)})`;

  const confidenceFloor = clamp(
    input.baseConfidenceFloor + (pressure * 0.18),
    Math.max(0.54, input.baseConfidenceFloor),
    0.84
  );
  const edgeFloorBps = Math.round(clamp(input.baseEdgeFloorBps + (pressure * 5), 1, 18));
  const tradeSizeMultiplier = clamp(1 - (pressure * 0.35), 0.45, 1.05);
  const tradeAmountUsd = round2(Math.max(10, input.baseTradeAmountUsd * tradeSizeMultiplier));
  const probeAmountUsd = round2(Math.max(10, Math.min(tradeAmountUsd, input.baseProbeAmountUsd * tradeSizeMultiplier)));
  const probeMinConfidence = clamp(confidenceFloor - 0.05, 0.6, 0.85);
  const minTradeIntervalMs = Math.round(clamp(input.baseTradeIntervalMs + (pressure * 45_000), 15_000, 150_000));
  const maxTradesPerHour = Math.max(1, Math.floor(3_600_000 / minTradeIntervalMs));

  return {
    validationAverageScore: round2(validationAverageScore),
    validationRecentAverageScore: round2(validationRecentAverageScore),
    validationAttestationCount,
    reputationAverageScore: round2(reputationAverageScore),
    reputationRecentAverageScore: round2(reputationRecentAverageScore),
    reputationFeedbackCount,
    reputationDistinctRaterCount,
    confidenceFloor: round2(confidenceFloor),
    edgeFloorBps,
    tradeAmountUsd,
    probeAmountUsd,
    probeMinConfidence: round2(probeMinConfidence),
    minTradeIntervalMs,
    maxTradesPerHour,
    freshScoreWindowRecommended,
    freshScoreWindowReason,
    summary: formatSummary({
      validationAverageScore: round2(validationAverageScore),
      validationRecentAverageScore: round2(validationRecentAverageScore),
      validationAttestationCount,
      reputationAverageScore: round2(reputationAverageScore),
      reputationRecentAverageScore: round2(reputationRecentAverageScore),
      reputationFeedbackCount,
      reputationDistinctRaterCount,
      confidenceFloor: round2(confidenceFloor),
      edgeFloorBps,
      tradeAmountUsd,
      probeAmountUsd,
      minTradeIntervalMs,
      pressure,
      freshScoreWindowRecommended,
    }),
  };
}

function confidenceFloorWouldTighten(baseConfidenceFloor: number, pressure: number, edgeTightened: boolean): boolean {
  const projectedConfidenceFloor = baseConfidenceFloor + (pressure * 0.18);
  return projectedConfidenceFloor > baseConfidenceFloor + 0.08 || edgeTightened;
}

function edgeFloorWouldTighten(baseEdgeFloorBps: number, pressure: number): boolean {
  const projectedEdgeFloor = Math.round(clamp(baseEdgeFloorBps + (pressure * 5), 2, 18));
  return projectedEdgeFloor > baseEdgeFloorBps + 1;
}
