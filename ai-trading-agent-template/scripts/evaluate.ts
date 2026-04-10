import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import type { ScoreStoryPayload } from "../src/metrics/index";

interface MatrixParameterSnapshot {
  maxTradeUsd: number;
  maxTradesPerHour: number;
  maxSlippageBps: number;
  indicatorLookback: number;
  minTrendStrengthBps: number;
  maxBullishRsi: number;
  minBearishRsi: number;
  minConfidence: number;
  minExpectedEdgeBps: number;
  breakerMaxConsecutiveLosses: number;
  breakerMaxDailyLossUsd: number;
}

interface OneShotGateProfile {
  minCheckpointCount: number;
  maxCheckpointCount: number;
  minFillCount: number;
  maxFillCount: number;
  minNetPnlUsd: number;
  maxDrawdownBps: number;
  minValidationCoveragePct: number;
  minValidationScore: number;
  minReputationScore: number;
  minReputationFeedbackCount: number;
  minReputationDistinctRaterCount: number;
  requireValidationRegistry: boolean;
  requireReputationRegistry: boolean;
}

interface CandidateMetrics {
  agentId: string | null;
  checkpointCount: number | null;
  fillCount: number | null;
  netPnlUsd: number | null;
  maxDrawdownBps: number | null;
  compositeScore: number | null;
  averageValidationScore: number | null;
  validationSource: string | null;
  validationCoveragePct: number | null;
  averageReputationScore: number | null;
  reputationSource: string | null;
  reputationFeedbackCount: number | null;
  reputationDistinctRaterCount: number | null;
  freshScoreWindowRecommended: boolean | null;
  freshScoreWindowReason: string | null;
}

interface CandidateGateChecks {
  checkpointDepth: boolean;
  fillDepth: boolean;
  positivePnl: boolean;
  drawdownLimit: boolean;
  validationSource: boolean;
  validationCoverage: boolean;
  validationQuality: boolean;
  reputationSource: boolean;
  reputationQuality: boolean;
  reputationDepth: boolean;
  reputationDiversity: boolean;
}

interface CandidateGateEvaluation {
  pass: boolean;
  checks: CandidateGateChecks;
  reasons: string[];
}

interface TraceQuality {
  traceCount: number;
  fallbackCount: number;
  fallbackRatePct: number;
  modelCount: number;
  qualitativeStability: string;
}

interface RunSummary {
  generatedAt: string;
  runLabel: string;
  parameters: MatrixParameterSnapshot;
  metrics: CandidateMetrics;
  gate: CandidateGateEvaluation;
  traceQuality: TraceQuality;
  sourceFiles: {
    metrics: string | null;
    phase2Evidence: string | null;
    replaySummary: string | null;
  };
}

interface RankedRunSummary extends RunSummary {
  rank: number;
}

interface EvaluationResults {
  generatedAt: string;
  currentRunLabel: string;
  matrixProfile: {
    maxTradeUsdValues: number[];
    maxTradesPerHourValues: number[];
    maxSlippageBpsValues: number[];
    indicatorLookbackValues: number[];
    minTrendStrengthBpsValues: number[];
    maxBullishRsiValues: number[];
    minBearishRsiValues: number[];
    minConfidenceValues: number[];
    minExpectedEdgeBpsValues: number[];
    breakerMaxConsecutiveLossesValues: number[];
    breakerMaxDailyLossUsdValues: number[];
    expectedCombinationCount: number;
    observedRunCount: number;
  };
  gateProfile: OneShotGateProfile;
  winnerSelectionRule: string;
  freshScoreWindowRecommendation: {
    recommended: boolean;
    reason: string;
  };
  winner: RankedRunSummary | null;
  candidates: RankedRunSummary[];
}

interface Phase2EvidencePayload {
  runtimeEvidence?: {
    checkpointCount?: number;
    fillCount?: number;
    reputationFeedbackCount?: number;
    reputationDistinctRaterCount?: number;
  };
}

interface PlannerTraceRow {
  model?: string;
  usedFallback?: boolean;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function parseNumberList(value: string | undefined, fallback: number[]): number[] {
  if (!value || !value.trim()) {
    return fallback;
  }
  const parsed = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));
  if (parsed.length === 0) {
    return fallback;
  }
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const valueEntry of parsed) {
    if (!seen.has(valueEntry)) {
      seen.add(valueEntry);
      unique.push(valueEntry);
    }
  }
  return unique;
}

function resolveRunLabel(): string {
  const configured = (process.env.RUN_LABEL || process.env.MATRIX_RUN_LABEL || "").trim();
  if (configured.length > 0) {
    return configured.replace(/[^a-zA-Z0-9._-]/g, "-");
  }
  return new Date().toISOString().replace(/[.:]/g, "-");
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readJsonLines<T>(filePath: string): T[] {
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
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((row): row is T => row !== null);
}

function buildTraceQuality(traces: PlannerTraceRow[]): TraceQuality {
  const fallbackCount = traces.filter((trace) => trace.usedFallback === true).length;
  const fallbackRatePct = traces.length > 0
    ? Math.round((fallbackCount / traces.length) * 10_000) / 100
    : 0;
  const modelCount = new Set(
    traces
      .map((trace) => trace.model)
      .filter((model): model is string => typeof model === "string" && model.trim().length > 0)
  ).size;
  const qualitativeStability = fallbackRatePct <= 20
    ? "stable planner traces"
    : fallbackRatePct <= 40
      ? "moderate fallback pressure"
      : "high fallback pressure";

  return {
    traceCount: traces.length,
    fallbackCount,
    fallbackRatePct,
    modelCount,
    qualitativeStability,
  };
}

function evaluateGate(metrics: CandidateMetrics, gateProfile: OneShotGateProfile): CandidateGateEvaluation {
  const checkpointDepth = metrics.checkpointCount !== null
    && metrics.checkpointCount >= gateProfile.minCheckpointCount
    && metrics.checkpointCount <= gateProfile.maxCheckpointCount;
  const fillDepth = metrics.fillCount !== null
    && metrics.fillCount >= gateProfile.minFillCount
    && metrics.fillCount <= gateProfile.maxFillCount;
  const positivePnl = metrics.netPnlUsd !== null && metrics.netPnlUsd > gateProfile.minNetPnlUsd;
  const drawdownLimit = metrics.maxDrawdownBps !== null && metrics.maxDrawdownBps <= gateProfile.maxDrawdownBps;
  const validationSource = gateProfile.requireValidationRegistry
    ? metrics.validationSource === "validation-registry"
    : metrics.validationSource !== null;
  const validationCoverage = metrics.validationCoveragePct !== null
    && metrics.validationCoveragePct >= gateProfile.minValidationCoveragePct;
  const validationQuality = metrics.averageValidationScore !== null
    && metrics.averageValidationScore >= gateProfile.minValidationScore;
  const reputationSource = gateProfile.requireReputationRegistry
    ? metrics.reputationSource === "reputation-registry"
    : metrics.reputationSource !== null;
  const reputationQuality = metrics.averageReputationScore !== null
    && metrics.averageReputationScore >= gateProfile.minReputationScore;
  const reputationDepth = metrics.reputationFeedbackCount !== null
    && metrics.reputationFeedbackCount >= gateProfile.minReputationFeedbackCount;
  const reputationDiversity = metrics.reputationDistinctRaterCount !== null
    && metrics.reputationDistinctRaterCount >= gateProfile.minReputationDistinctRaterCount;

  const checks: CandidateGateChecks = {
    checkpointDepth,
    fillDepth,
    positivePnl,
    drawdownLimit,
    validationSource,
    validationCoverage,
    validationQuality,
    reputationSource,
    reputationQuality,
    reputationDepth,
    reputationDiversity,
  };

  const reasons: string[] = [];
  if (!checkpointDepth) reasons.push(`checkpointCount must be within ${gateProfile.minCheckpointCount}-${gateProfile.maxCheckpointCount}`);
  if (!fillDepth) reasons.push(`fillCount must be within ${gateProfile.minFillCount}-${gateProfile.maxFillCount}`);
  if (!positivePnl) reasons.push(`netPnlUsd must be greater than ${gateProfile.minNetPnlUsd}`);
  if (!drawdownLimit) reasons.push(`maxDrawdownBps must be <= ${gateProfile.maxDrawdownBps}`);
  if (!validationSource) reasons.push("validationSource must be validation-registry");
  if (!validationCoverage) reasons.push(`validationCoveragePct must be >= ${gateProfile.minValidationCoveragePct}`);
  if (!validationQuality) reasons.push(`averageValidationScore must be >= ${gateProfile.minValidationScore}`);
  if (!reputationSource) reasons.push("reputationSource must be reputation-registry");
  if (!reputationQuality) reasons.push(`averageReputationScore must be >= ${gateProfile.minReputationScore}`);
  if (!reputationDepth) reasons.push(`reputationFeedbackCount must be >= ${gateProfile.minReputationFeedbackCount}`);
  if (!reputationDiversity) reasons.push(`reputationDistinctRaterCount must be >= ${gateProfile.minReputationDistinctRaterCount}`);

  return {
    pass: reasons.length === 0,
    checks,
    reasons,
  };
}

function listRunSummaries(runsDir: string): RunSummary[] {
  if (!fs.existsSync(runsDir)) {
    return [];
  }

  const entries = fs.readdirSync(runsDir, { withFileTypes: true });
  const summaries: RunSummary[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const summaryPath = path.join(runsDir, entry.name, "run-summary.json");
    const summary = readJson<RunSummary>(summaryPath);
    if (summary) {
      summaries.push(summary);
    }
  }

  return summaries;
}

function metricValue(value: number | null, fallback: number): number {
  return value === null ? fallback : value;
}

function sortCandidates(candidates: RunSummary[]): RunSummary[] {
  return candidates.slice().sort((a, b) => {
    if (a.gate.pass !== b.gate.pass) {
      return a.gate.pass ? -1 : 1;
    }

    const compositeA = metricValue(a.metrics.compositeScore, Number.NEGATIVE_INFINITY);
    const compositeB = metricValue(b.metrics.compositeScore, Number.NEGATIVE_INFINITY);
    if (compositeA !== compositeB) {
      return compositeB - compositeA;
    }

    const pnlA = metricValue(a.metrics.netPnlUsd, Number.NEGATIVE_INFINITY);
    const pnlB = metricValue(b.metrics.netPnlUsd, Number.NEGATIVE_INFINITY);
    if (pnlA !== pnlB) {
      return pnlB - pnlA;
    }

    const ddA = metricValue(a.metrics.maxDrawdownBps, Number.POSITIVE_INFINITY);
    const ddB = metricValue(b.metrics.maxDrawdownBps, Number.POSITIVE_INFINITY);
    if (ddA !== ddB) {
      return ddA - ddB;
    }

    return b.generatedAt.localeCompare(a.generatedAt);
  });
}

function formatValue(value: number | null, digits = 2): string {
  if (value === null) {
    return "n/a";
  }
  return value.toFixed(digits);
}

async function main() {
  const cwd = process.cwd();
  const runsDir = path.join(cwd, "artifacts", "runs");
  const metricsPath = path.join(cwd, "metrics.json");
  const phase2EvidencePath = path.join(cwd, "phase2-evidence.json");
  const replaySummaryPath = path.join(cwd, "replay-summary.json");
  const plannerTracesPath = path.join(cwd, "planner-traces.jsonl");
  const evaluationOutputPath = path.join(cwd, "evaluation-results.json");
  const winnerOutputPath = path.join(cwd, "winner-run.json");

  const runLabel = resolveRunLabel();
  const parameters: MatrixParameterSnapshot = {
    maxTradeUsd: parseNumber(process.env.PLANNER_MAX_TRADE_USD, 100),
    maxTradesPerHour: parseNumber(process.env.PLANNER_MAX_TRADES_PER_HOUR, 6),
    maxSlippageBps: parseNumber(process.env.PLANNER_MAX_SLIPPAGE_BPS, 50),
    indicatorLookback: parseNumber(process.env.PLANNER_INDICATOR_LOOKBACK, 80),
    minTrendStrengthBps: parseNumber(process.env.INDICATOR_MIN_TREND_BPS, 1),
    maxBullishRsi: parseNumber(process.env.INDICATOR_MAX_BULLISH_RSI, 72),
    minBearishRsi: parseNumber(process.env.INDICATOR_MIN_BEARISH_RSI, 28),
    minConfidence: parseNumber(process.env.PLANNER_MIN_CONFIDENCE, 0.6),
    minExpectedEdgeBps: parseNumber(process.env.PLANNER_MIN_EXPECTED_EDGE_BPS, 12),
    breakerMaxConsecutiveLosses: Math.round(parseNumber(process.env.BREAKER_MAX_CONSECUTIVE_LOSSES, 3)),
    breakerMaxDailyLossUsd: parseNumber(process.env.BREAKER_MAX_DAILY_LOSS_USD, 200),
  };

  const gateProfile: OneShotGateProfile = {
    minCheckpointCount: parseNumber(process.env.PHASE2_MIN_CHECKPOINTS, 30),
    maxCheckpointCount: parseNumber(process.env.PHASE2_MAX_CHECKPOINTS, 60),
    minFillCount: parseNumber(process.env.PHASE2_MIN_FILLS, 5),
    maxFillCount: parseNumber(process.env.PHASE2_MAX_FILLS, 15),
    minNetPnlUsd: parseNumber(process.env.PHASE2_MIN_NET_PNL_USD, 0.01),
    maxDrawdownBps: parseNumber(process.env.PHASE2_MAX_DRAWDOWN_BPS, 500),
    minValidationCoveragePct: parseNumber(process.env.PHASE2_MIN_VALIDATION_COVERAGE_PCT, 70),
    minValidationScore: parseNumber(process.env.PHASE2_MIN_VALIDATION_SCORE, 82),
    minReputationScore: parseNumber(process.env.PHASE2_MIN_REPUTATION_SCORE, 90),
    minReputationFeedbackCount: parseNumber(process.env.PHASE2_MIN_REPUTATION_FEEDBACK_COUNT, 6),
    minReputationDistinctRaterCount: parseNumber(process.env.PHASE2_MIN_REPUTATION_DISTINCT_RATERS, 3),
    requireValidationRegistry: parseBoolean(process.env.PHASE2_REQUIRE_VALIDATION_REGISTRY, true),
    requireReputationRegistry: parseBoolean(process.env.PHASE2_REQUIRE_REPUTATION_REGISTRY, true),
  };

  const matrixProfile = {
    maxTradeUsdValues: parseNumberList(process.env.MATRIX_MAX_TRADE_USD_VALUES, [40, 55, 70]),
    maxTradesPerHourValues: parseNumberList(process.env.MATRIX_MAX_TRADES_PER_HOUR_VALUES, [4, 6, 8]),
    maxSlippageBpsValues: parseNumberList(process.env.MATRIX_MAX_SLIPPAGE_BPS_VALUES, [30, 50]),
    indicatorLookbackValues: parseNumberList(process.env.MATRIX_INDICATOR_LOOKBACK_VALUES, [70, 90, 110]),
    minTrendStrengthBpsValues: parseNumberList(process.env.MATRIX_MIN_TREND_BPS_VALUES, [1, 2, 4]),
    maxBullishRsiValues: parseNumberList(process.env.MATRIX_MAX_BULLISH_RSI_VALUES, [68, 72, 76]),
    minBearishRsiValues: parseNumberList(process.env.MATRIX_MIN_BEARISH_RSI_VALUES, [24, 28, 32]),
    minConfidenceValues: parseNumberList(process.env.MATRIX_MIN_CONFIDENCE_VALUES, [0.52, 0.58, 0.64]),
    minExpectedEdgeBpsValues: parseNumberList(process.env.MATRIX_MIN_EXPECTED_EDGE_BPS_VALUES, [2, 4, 6]),
    breakerMaxConsecutiveLossesValues: parseNumberList(process.env.MATRIX_BREAKER_MAX_CONSECUTIVE_LOSSES_VALUES, [2, 3, 4]),
    breakerMaxDailyLossUsdValues: parseNumberList(process.env.MATRIX_BREAKER_MAX_DAILY_LOSS_USD_VALUES, [150, 200, 300]),
  };

  const metricsPayload = readJson<ScoreStoryPayload>(metricsPath);
  const phase2Payload = readJson<Phase2EvidencePayload>(phase2EvidencePath);
  const traces = readJsonLines<PlannerTraceRow>(plannerTracesPath);

  const metricsSummary = metricsPayload?.summary;
  const phase2Runtime = phase2Payload?.runtimeEvidence;
  const candidateMetrics: CandidateMetrics = {
    agentId: stringOrNull(metricsSummary?.agentId),
    checkpointCount: numberOrNull(metricsSummary?.checkpointCount) ?? numberOrNull(phase2Runtime?.checkpointCount),
    fillCount: numberOrNull(metricsSummary?.fillCount) ?? numberOrNull(phase2Runtime?.fillCount),
    netPnlUsd: numberOrNull(metricsSummary?.netPnlUsd),
    maxDrawdownBps: numberOrNull(metricsSummary?.maxDrawdownBps),
    compositeScore: numberOrNull(metricsSummary?.compositeScore),
    averageValidationScore: numberOrNull(metricsSummary?.averageValidationScore),
    validationSource: stringOrNull(metricsSummary?.validationSource),
    validationCoveragePct: numberOrNull(metricsSummary?.validationCoveragePct),
    averageReputationScore: numberOrNull(metricsSummary?.averageReputationScore),
    reputationSource: stringOrNull(metricsSummary?.reputationSource),
    reputationFeedbackCount: numberOrNull(metricsSummary?.reputationFeedbackCount)
      ?? numberOrNull(phase2Runtime?.reputationFeedbackCount),
    reputationDistinctRaterCount: numberOrNull((phase2Runtime as { reputationDistinctRaterCount?: unknown } | undefined)?.reputationDistinctRaterCount),
    freshScoreWindowRecommended: typeof metricsSummary?.freshScoreWindowRecommended === "boolean"
      ? metricsSummary.freshScoreWindowRecommended
      : null,
    freshScoreWindowReason: stringOrNull(metricsSummary?.freshScoreWindowReason),
  };

  const traceQuality = buildTraceQuality(traces);
  const runSummary: RunSummary = {
    generatedAt: new Date().toISOString(),
    runLabel,
    parameters,
    metrics: candidateMetrics,
    gate: evaluateGate(candidateMetrics, gateProfile),
    traceQuality,
    sourceFiles: {
      metrics: fs.existsSync(metricsPath) ? "metrics.json" : null,
      phase2Evidence: fs.existsSync(phase2EvidencePath) ? "phase2-evidence.json" : null,
      replaySummary: fs.existsSync(replaySummaryPath) ? "replay-summary.json" : null,
    },
  };

  const runDir = path.join(runsDir, runLabel);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(path.join(runDir, "run-summary.json"), JSON.stringify(runSummary, null, 2));
  if (fs.existsSync(metricsPath)) {
    fs.copyFileSync(metricsPath, path.join(runDir, "metrics.json"));
  }
  if (fs.existsSync(phase2EvidencePath)) {
    fs.copyFileSync(phase2EvidencePath, path.join(runDir, "phase2-evidence.json"));
  }
  if (fs.existsSync(replaySummaryPath)) {
    fs.copyFileSync(replaySummaryPath, path.join(runDir, "replay-summary.json"));
  }

  const candidates = sortCandidates(listRunSummaries(runsDir));
  const rankedCandidates: RankedRunSummary[] = candidates.map((candidate, index) => ({
    rank: index + 1,
    ...candidate,
  }));
  const winner = rankedCandidates.find((candidate) => candidate.gate.pass) || null;

  const expectedCombinationCount = matrixProfile.maxTradeUsdValues.length
    * matrixProfile.maxTradesPerHourValues.length
    * matrixProfile.maxSlippageBpsValues.length
    * matrixProfile.indicatorLookbackValues.length
    * matrixProfile.minTrendStrengthBpsValues.length
    * matrixProfile.maxBullishRsiValues.length
    * matrixProfile.minBearishRsiValues.length
    * matrixProfile.minConfidenceValues.length
    * matrixProfile.minExpectedEdgeBpsValues.length
    * matrixProfile.breakerMaxConsecutiveLossesValues.length
    * matrixProfile.breakerMaxDailyLossUsdValues.length;

  const output: EvaluationResults = {
    generatedAt: new Date().toISOString(),
    currentRunLabel: runLabel,
    matrixProfile: {
      ...matrixProfile,
      expectedCombinationCount,
      observedRunCount: rankedCandidates.length,
    },
    gateProfile,
    winnerSelectionRule: "gate pass required, then compositeScore DESC, then netPnlUsd DESC, then maxDrawdownBps ASC",
    freshScoreWindowRecommendation: {
      recommended: candidateMetrics.freshScoreWindowRecommended ?? false,
      reason: candidateMetrics.freshScoreWindowReason || (candidateMetrics.freshScoreWindowRecommended ? "current history is tightening the policy" : "current score window looks usable"),
    },
    winner,
    candidates: rankedCandidates,
  };

  fs.writeFileSync(evaluationOutputPath, JSON.stringify(output, null, 2));
  if (winner) {
    fs.writeFileSync(winnerOutputPath, JSON.stringify(winner, null, 2));
  }

  console.log("\nOne-Shot Matrix Evaluation");
  console.log("==========================");
  console.log(`Current run:            ${runLabel}`);
  console.log(`Expected combinations:  ${expectedCombinationCount}`);
  console.log(`Observed run summaries: ${rankedCandidates.length}`);
  if (winner) {
    console.log(`Winner:                 ${winner.runLabel}`);
    console.log(`Winner composite:       ${formatValue(winner.metrics.compositeScore)}`);
    console.log(`Winner net PnL:         ${formatValue(winner.metrics.netPnlUsd)} USD`);
    console.log(`Winner drawdown:        ${formatValue(winner.metrics.maxDrawdownBps, 0)} bps`);
  } else {
    console.log("Winner:                 none (no run satisfied all hard gates)");
  }

  console.log("\nTop Candidates");
  console.log("--------------");
  for (const candidate of rankedCandidates.slice(0, 5)) {
    console.log(
      `#${candidate.rank} ${candidate.runLabel} | gate=${candidate.gate.pass} | composite=${formatValue(candidate.metrics.compositeScore)} | pnl=${formatValue(candidate.metrics.netPnlUsd)} | dd=${formatValue(candidate.metrics.maxDrawdownBps, 0)} bps | ${candidate.traceQuality.qualitativeStability}`
    );
  }
  console.log(`\nFresh Window: ${output.freshScoreWindowRecommendation.recommended ? "recommended" : "keep-current"}`);
  console.log(`Reason: ${output.freshScoreWindowRecommendation.reason}`);
  console.log(`\nWrote: ${evaluationOutputPath}`);
  if (winner) {
    console.log(`Wrote: ${winnerOutputPath}`);
  }
}

main().catch((error) => {
  console.error("[evaluate] Failed:", error);
  process.exit(1);
});
