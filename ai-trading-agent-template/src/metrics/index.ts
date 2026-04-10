import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { ValidationRegistryClient } from "../onchain/validationRegistry";
import { ReputationRegistryClient } from "../onchain/reputationRegistry";
import { buildArtifactIdentityReport } from "../submission/artifacts";
import { TradeCheckpoint, TradeFill } from "../types/index";

export interface ScoreStoryOptions {
  checkpointsFile?: string;
  fillsFile?: string;
  tracesFile?: string;
  mode?: string;
  recentLimit?: number;
  baselineCapitalUsd?: number;
  provider?: ethers.Provider;
  validationRegistryAddress?: string;
  reputationRegistryAddress?: string;
  reputationEvidenceFile?: string;
  agentId?: bigint;
  strictAgentId?: boolean;
}

export interface RecentAction {
  timestamp: number;
  action: "BUY" | "SELL" | "HOLD";
  pair: string;
  amountUsd: number;
  confidence: number;
  reasoning: string;
}

export interface ValidationSummary {
  source: "validation-registry" | "registry-unavailable";
  averageScore: number;
  attestationCount: number;
  coveragePct: number;
}

export interface ReputationSummary {
  source: "reputation-registry" | "feedback-log" | "none";
  averageScore: number;
  feedbackCount: number;
}

export interface ScoreStorySummary {
  agentId: string;
  mode: string;
  netPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  maxDrawdownBps: number;
  currentDrawdownBps: number;
  drawdownHeadroomBps: number;
  currentEquityUsd: number;
  peakEquityUsd: number;
  cppiScale: number;
  cppiFloorUsd: number;
  cppiCushionUsd: number;
  averageValidationScore: number;
  validationSource: ValidationSummary["source"];
  validationCoveragePct: number;
  averageReputationScore: number;
  reputationSource: ReputationSummary["source"];
  reputationFeedbackCount: number;
  latestValidationConfidence: number;
  latestValidationEdgeSurplusBps: number;
  latestValidationRiskGateStatus: string;
  latestValidationFillExecuted: boolean;
  latestValidationRegimeConfidence: number;
  latestValidationSignalSummary: string;
  riskAdjustedProfitabilityScore: number;
  drawdownControlScore: number;
  validationQualityScore: number;
  objectiveReputationScore: number;
  compositeScore: number;
  freshScoreWindowRecommended: boolean;
  freshScoreWindowReason: string;
  checkpointCount: number;
  fillCount: number;
  openPositionBase: number;
  recentFlow: string;
}

export interface LeaderboardEntry {
  rank: number;
  agentId: string;
  netPnlUsd: number;
  maxDrawdownBps: number;
  validationScore: number;
  reputationScore: number;
  compositeScore: number;
  checkpointCount: number;
}

export interface ScoreStoryPayload {
  generatedAt: string;
  files: {
    checkpointsFile: string;
    fillsFile: string;
  };
  summary: ScoreStorySummary;
  leaderboard: LeaderboardEntry[];
  recentActions: RecentAction[];
}

interface PositionState {
  basePosition: number;
  avgEntryPrice: number;
  realizedPnlUsd: number;
}

interface PerformanceSummary {
  netPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  maxDrawdownBps: number;
  openPositionBase: number;
}

export interface PerformanceSnapshot extends PerformanceSummary {
  currentDrawdownBps: number;
  peakEquityUsd: number;
  currentEquityUsd: number;
  lastPriceUsd: number;
}

interface ReputationFeedbackEvidence {
  agentId: string;
  score: number;
  feedbackType: string;
  outcomeRef: string;
  timestamp: number;
}

export function readJsonLines<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((v): v is T => v !== null);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function toNumber(v: unknown, fallback = 0): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000;
}

function normalizeScore(v: number): number {
  return round2(clamp(v, 0, 100));
}

function normalizeCheckpoint(raw: unknown): TradeCheckpoint | null {
  if (!raw || typeof raw !== "object") return null;
  const cp = raw as Record<string, unknown>;

  const action = String(cp.action || "").toUpperCase();
  if (action !== "BUY" && action !== "SELL" && action !== "HOLD") return null;

  const reasoning = String(cp.reasoning ?? "");
  return {
    agentId: String(cp.agentId ?? ""),
    timestamp: toNumber(cp.timestamp),
    action,
    asset: String(cp.asset ?? "XBT"),
    pair: String(cp.pair ?? "XBTUSD"),
    amountUsd: toNumber(cp.amountUsd),
    priceUsd: toNumber(cp.priceUsd),
    reasoning,
    reasoningHash: String(cp.reasoningHash ?? ethers.keccak256(ethers.toUtf8Bytes(reasoning))),
    confidence: clamp(toNumber(cp.confidence, 0.5), 0, 1),
    intentHash: String(cp.intentHash ?? ethers.ZeroHash),
    signature: String(cp.signature ?? ""),
    signerAddress: String(cp.signerAddress ?? ""),
    checkpointHash: typeof cp.checkpointHash === "string" ? cp.checkpointHash : undefined,
  };
}

function normalizeFill(raw: unknown): TradeFill | null {
  if (!raw || typeof raw !== "object") return null;
  const fill = raw as Record<string, unknown>;

  const action = String(fill.action || "").toUpperCase();
  if (action !== "BUY" && action !== "SELL") return null;

  return {
    timestamp: toNumber(fill.timestamp),
    agentId: String(fill.agentId ?? ""),
    pair: String(fill.pair ?? "XBTUSD"),
    action,
    amountUsd: toNumber(fill.amountUsd),
    priceUsd: toNumber(fill.priceUsd),
    volumeBase: toNumber(fill.volumeBase),
    intentHash: String(fill.intentHash ?? ethers.ZeroHash),
    txid: String(fill.txid ?? ""),
    order: String(fill.order ?? ""),
    mode: String(fill.mode ?? "mock"),
  };
}

function normalizeReputationFeedback(raw: unknown): ReputationFeedbackEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;

  const score = toNumber(entry.score, NaN);
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return null;
  }

  const agentId = String(entry.agentId ?? "").trim();
  if (!agentId) {
    return null;
  }

  return {
    agentId,
    score,
    feedbackType: String(entry.feedbackType ?? ""),
    outcomeRef: String(entry.outcomeRef ?? ""),
    timestamp: toNumber(entry.timestamp),
  };
}

export function loadCheckpoints(checkpointsFile: string): TradeCheckpoint[] {
  const parsed = readJsonLines<unknown>(checkpointsFile)
    .map(normalizeCheckpoint)
    .filter((cp): cp is TradeCheckpoint => cp !== null);
  parsed.sort((a, b) => a.timestamp - b.timestamp);
  return parsed;
}

export function loadFills(fillsFile: string): TradeFill[] {
  const parsed = readJsonLines<unknown>(fillsFile)
    .map(normalizeFill)
    .filter((fill): fill is TradeFill => fill !== null);
  parsed.sort((a, b) => a.timestamp - b.timestamp);
  return parsed;
}

function applyFill(fill: TradeFill, state: PositionState): void {
  const qty = fill.volumeBase > 0
    ? fill.volumeBase
    : (fill.priceUsd > 0 ? fill.amountUsd / fill.priceUsd : 0);

  if (qty <= 0) return;

  if (fill.action === "BUY") {
    const nextPosition = state.basePosition + qty;
    const weightedCost = (state.avgEntryPrice * state.basePosition) + (fill.priceUsd * qty);
    state.basePosition = nextPosition;
    state.avgEntryPrice = nextPosition > 0 ? weightedCost / nextPosition : 0;
    return;
  }

  const sellQty = Math.min(qty, state.basePosition);
  state.realizedPnlUsd += (fill.priceUsd - state.avgEntryPrice) * sellQty;
  state.basePosition -= sellQty;

  if (state.basePosition <= 1e-12) {
    state.basePosition = 0;
    state.avgEntryPrice = 0;
  }
}

function computeMaxDrawdownBps(equityCurve: number[]): number {
  if (equityCurve.length === 0) return 0;

  let peak = equityCurve[0];
  let maxDrawdown = 0;
  for (const equity of equityCurve) {
    if (equity > peak) peak = equity;
    if (peak <= 0) continue;
    const dd = (peak - equity) / peak;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  return Math.round(maxDrawdown * 10_000);
}

function computeRiskAdjustedProfitabilityScore(netPnlUsd: number, maxDrawdownBps: number, baselineCapitalUsd: number): number {
  const baseline = Math.max(1, baselineCapitalUsd);
  const pnlRatio = netPnlUsd / baseline;
  const drawdownRatio = Math.max(maxDrawdownBps / 10_000, 0.01);
  const ratio = pnlRatio / drawdownRatio;
  return normalizeScore(50 + ratio * 20);
}

function computeDrawdownControlScore(maxDrawdownBps: number): number {
  return normalizeScore(100 - (maxDrawdownBps / 50));
}

function computeCompositeScore(scores: {
  riskAdjustedProfitabilityScore: number;
  drawdownControlScore: number;
  validationQualityScore: number;
  objectiveReputationScore: number;
}): number {
  return round2(
    (scores.riskAdjustedProfitabilityScore * 0.4)
    + (scores.drawdownControlScore * 0.25)
    + (scores.validationQualityScore * 0.2)
    + (scores.objectiveReputationScore * 0.15)
  );
}

export function computePerformanceSnapshot(
  checkpoints: TradeCheckpoint[],
  fills: TradeFill[],
  baselineCapitalUsd: number,
  currentPriceUsd?: number
): PerformanceSnapshot {
  const state: PositionState = {
    basePosition: 0,
    avgEntryPrice: 0,
    realizedPnlUsd: 0,
  };

  if (checkpoints.length === 0 && fills.length === 0) {
    return {
      netPnlUsd: 0,
      realizedPnlUsd: 0,
      unrealizedPnlUsd: 0,
      maxDrawdownBps: 0,
      currentDrawdownBps: 0,
      peakEquityUsd: baselineCapitalUsd,
      currentEquityUsd: baselineCapitalUsd,
      lastPriceUsd: currentPriceUsd ?? 0,
      openPositionBase: 0,
    };
  }

  const equityCurve: number[] = [baselineCapitalUsd];
  let fillIdx = 0;

  for (const cp of checkpoints) {
    while (fillIdx < fills.length && fills[fillIdx].timestamp <= cp.timestamp) {
      applyFill(fills[fillIdx], state);
      fillIdx++;
    }

    const unrealized = state.basePosition * (cp.priceUsd - state.avgEntryPrice);
    equityCurve.push(baselineCapitalUsd + state.realizedPnlUsd + unrealized);
  }

  while (fillIdx < fills.length) {
    applyFill(fills[fillIdx], state);
    fillIdx++;
  }

  const lastPrice = currentPriceUsd
    ?? (checkpoints.length > 0
      ? checkpoints[checkpoints.length - 1].priceUsd
      : fills.length > 0
        ? fills[fills.length - 1].priceUsd
        : 0);

  const unrealizedPnlUsd = state.basePosition * (lastPrice - state.avgEntryPrice);
  const endingEquity = baselineCapitalUsd + state.realizedPnlUsd + unrealizedPnlUsd;
  const netPnlUsd = endingEquity - baselineCapitalUsd;
  equityCurve.push(endingEquity);
  const peakEquityUsd = equityCurve.reduce((peak, equity) => Math.max(peak, equity), baselineCapitalUsd);
  const currentDrawdownBps = peakEquityUsd > 0
    ? Math.round(Math.max(0, ((peakEquityUsd - endingEquity) / peakEquityUsd) * 10_000))
    : 0;

  return {
    netPnlUsd,
    realizedPnlUsd: state.realizedPnlUsd,
    unrealizedPnlUsd,
    maxDrawdownBps: computeMaxDrawdownBps(equityCurve),
    currentDrawdownBps,
    peakEquityUsd,
    currentEquityUsd: endingEquity,
    lastPriceUsd: lastPrice,
    openPositionBase: state.basePosition,
  };
}

async function computeValidationSummary(
  checkpoints: TradeCheckpoint[],
  options: ScoreStoryOptions
): Promise<ValidationSummary> {
  const fallbackScores = checkpoints.map((cp) => Math.round(clamp(cp.confidence, 0, 1) * 100));
  const fallbackAverage = fallbackScores.length > 0
    ? fallbackScores.reduce((sum, score) => sum + score, 0) / fallbackScores.length
    : 0;

  const fallback: ValidationSummary = {
    source: "registry-unavailable",
    averageScore: round2(fallbackAverage),
    attestationCount: fallbackScores.length,
    coveragePct: checkpoints.length > 0 ? 100 : 0,
  };

  if (!options.provider || !options.validationRegistryAddress || options.agentId === undefined) {
    return fallback;
  }

  try {
    const validation = new ValidationRegistryClient(options.validationRegistryAddress, options.provider);
    const attestations = await validation.getAttestations(options.agentId);

    const checkpointHashes = new Set(
      checkpoints
        .map((cp) => (cp as TradeCheckpoint & { checkpointHash?: string }).checkpointHash)
        .filter((hash): hash is string => typeof hash === "string" && hash.length > 0)
        .map((hash) => hash.toLowerCase())
    );

    const relevant = checkpointHashes.size > 0
      ? attestations.filter((att) => checkpointHashes.has(att.checkpointHash.toLowerCase()))
      : attestations;

    const sourceAttestations = relevant.length > 0 ? relevant : attestations;
    if (sourceAttestations.length === 0) {
      return fallback;
    }

    const averageScore = sourceAttestations.reduce((sum, att) => sum + att.score, 0) / sourceAttestations.length;
    const attestedHashes = new Set(relevant.map((att) => att.checkpointHash.toLowerCase()));
    const coverage = relevant.length > 0 && checkpoints.length > 0
      ? (attestedHashes.size / checkpoints.length) * 100
      : 0;

    return {
      source: "validation-registry",
      averageScore: round2(averageScore),
      attestationCount: sourceAttestations.length,
      coveragePct: round2(coverage),
    };
  } catch {
    return fallback;
  }
}

async function computeReputationSummary(
  detectedAgentId: string,
  options: ScoreStoryOptions
): Promise<ReputationSummary> {
  const reputationEvidenceFile = options.reputationEvidenceFile ?? path.join(process.cwd(), "reputation-feedback.jsonl");
  const fallbackFeedback = readJsonLines<unknown>(reputationEvidenceFile)
    .map(normalizeReputationFeedback)
    .filter((entry): entry is ReputationFeedbackEvidence => entry !== null)
    .filter((entry) => entry.agentId === detectedAgentId);

  const fallbackAverage = fallbackFeedback.length > 0
    ? fallbackFeedback.reduce((sum, entry) => sum + entry.score, 0) / fallbackFeedback.length
    : 0;

  const fallback: ReputationSummary = {
    source: fallbackFeedback.length > 0 ? "feedback-log" : "none",
    averageScore: round2(fallbackAverage),
    feedbackCount: fallbackFeedback.length,
  };

  if (!options.provider || !options.reputationRegistryAddress || options.agentId === undefined) {
    return fallback;
  }

  try {
    const reputation = new ReputationRegistryClient(options.reputationRegistryAddress, options.provider);
    const averageScore = await reputation.getAverageScore(options.agentId);
    const summary = await reputation.getReputationSummary(options.agentId);
    if (!Number.isFinite(summary.feedbackCount) || summary.feedbackCount <= 0) {
      return fallback;
    }

    return {
      source: "reputation-registry",
      averageScore: round2(averageScore),
      feedbackCount: Math.max(0, Math.round(summary.feedbackCount)),
    };
  } catch {
    return fallback;
  }
}

function buildRecentActions(checkpoints: TradeCheckpoint[], limit: number): RecentAction[] {
  return checkpoints
    .slice(-Math.max(1, limit))
    .reverse()
    .map((cp) => ({
      timestamp: cp.timestamp,
      action: cp.action,
      pair: cp.pair,
      amountUsd: round2(cp.amountUsd),
      confidence: round2(cp.confidence),
      reasoning: cp.reasoning,
    }));
}

function buildRecentFlow(actions: RecentAction[]): string {
  if (actions.length === 0) return "No decisions yet";
  return actions
    .slice(0, 5)
    .map((a) => a.action)
    .join(" -> ");
}

function buildLatestValidationSignalSummary(checkpoints: TradeCheckpoint[], fills: TradeFill[]): {
  confidence: number;
  edgeSurplusBps: number;
  riskGateStatus: string;
  fillExecuted: boolean;
  regimeConfidence: number;
  summary: string;
} {
  const latestCheckpoint = checkpoints[checkpoints.length - 1];
  if (!latestCheckpoint) {
    return {
      confidence: 0,
      edgeSurplusBps: 0,
      riskGateStatus: "none",
      fillExecuted: false,
      regimeConfidence: 0,
      summary: "No validation signal available",
    };
  }

  const decisionContext = latestCheckpoint.decisionContext || {};
  const edgeThresholdBps = round2(toNumber(decisionContext.edgeThresholdBps, 0));
  const netEdgeBps = round2(toNumber(decisionContext.netEdgeBps, 0));
  const edgeSurplusBps = round2(Math.max(0, netEdgeBps - edgeThresholdBps));
  const confidence = round2(latestCheckpoint.confidence);
  const riskGateStatus = String(decisionContext.riskGateStatus || "none");
  const regimeConfidence = round2(toNumber(decisionContext.regimeConfidence, 0));
  const intentHash = String(latestCheckpoint.intentHash || "").toLowerCase();
  const fillExecuted = latestCheckpoint.action !== "HOLD"
    && intentHash.length > 0
    && fills.some((fill) => String(fill.intentHash || "").toLowerCase() === intentHash);

  return {
    confidence,
    edgeSurplusBps,
    riskGateStatus,
    fillExecuted,
    regimeConfidence,
    summary: `conf=${confidence.toFixed(2)} edgeSurplus=${edgeSurplusBps.toFixed(2)}bps risk=${riskGateStatus} fill=${fillExecuted} regime=${regimeConfidence.toFixed(2)}`,
  };
}

function uniqueAgentIds(values: Array<{ agentId: string }>): string[] {
  return Array.from(new Set(values.map((value) => value.agentId).filter((agentId) => agentId.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

function assertStrictAgentIdentity(
  expectedAgentId: string,
  checkpoints: TradeCheckpoint[],
  fills: TradeFill[],
  reputationFeedback: ReputationFeedbackEvidence[]
): void {
  const checkpointAgentIds = uniqueAgentIds(checkpoints);
  const fillAgentIds = uniqueAgentIds(fills);
  const reputationAgentIds = uniqueAgentIds(reputationFeedback);
  const issues: string[] = [];

  if (checkpointAgentIds.some((agentId) => agentId !== expectedAgentId)) {
    issues.push(`checkpoints belong to ${checkpointAgentIds.join(", ")}, expected ${expectedAgentId}`);
  }
  if (fillAgentIds.some((agentId) => agentId !== expectedAgentId)) {
    issues.push(`fills belong to ${fillAgentIds.join(", ")}, expected ${expectedAgentId}`);
  }
  if (reputationAgentIds.some((agentId) => agentId !== expectedAgentId)) {
    issues.push(`reputation evidence belongs to ${reputationAgentIds.join(", ")}, expected ${expectedAgentId}`);
  }

  if (issues.length > 0) {
    throw new Error(`Strict agent identity failed: ${issues.join("; ")}`);
  }
}

export async function buildScoreStory(options: ScoreStoryOptions = {}): Promise<ScoreStoryPayload> {
  const cwd = process.cwd();
  const checkpointsFile = options.checkpointsFile ?? path.join(cwd, "checkpoints.jsonl");
  const fillsFile = options.fillsFile ?? path.join(cwd, "fills.jsonl");
  const artifactDir = path.dirname(checkpointsFile);
  const tracesFile = options.tracesFile ?? path.join(artifactDir, "planner-traces.jsonl");
  const mode = (options.mode ?? process.env.EXECUTION_MODE ?? "mock").toLowerCase();
  const baselineCapitalUsd = options.baselineCapitalUsd ?? toNumber(process.env.METRICS_BASELINE_USD, 10_000);

  const checkpoints = loadCheckpoints(checkpointsFile);
  const fills = loadFills(fillsFile);
  const reputationEvidenceFile = options.reputationEvidenceFile ?? path.join(artifactDir, "reputation-feedback.jsonl");
  const reputationFeedback = readJsonLines<unknown>(reputationEvidenceFile)
    .map(normalizeReputationFeedback)
    .filter((entry): entry is ReputationFeedbackEvidence => entry !== null);

  const detectedAgentId = options.agentId?.toString()
    ?? checkpoints[checkpoints.length - 1]?.agentId
    ?? fills[fills.length - 1]?.agentId
    ?? String(process.env.AGENT_ID ?? "0");

  const strictAgentId = options.strictAgentId ?? options.agentId !== undefined;
  if (strictAgentId) {
    const artifactIdentity = buildArtifactIdentityReport({
      expectedAgentId: detectedAgentId,
      checkpointsFile,
      fillsFile,
      tracesFile,
      reputationEvidenceFile,
    });
    if (!artifactIdentity.pass) {
      throw new Error(`Strict agent identity failed: ${artifactIdentity.failReasons.join("; ")}`);
    }

    assertStrictAgentIdentity(detectedAgentId, checkpoints, fills, reputationFeedback);
  }

  const performance = computePerformanceSnapshot(checkpoints, fills, baselineCapitalUsd);
  const cppiFloorRatio = clamp(toNumber(process.env.CPPI_FLOOR_RATIO, 0.95), 0.8, 0.99);
  const cppiMultiplier = clamp(toNumber(process.env.CPPI_MULTIPLIER, 1), 0.1, 3);
  const cppiFloorUsd = performance.peakEquityUsd * cppiFloorRatio;
  const cppiCushionUsd = Math.max(0, performance.currentEquityUsd - cppiFloorUsd);
  const cppiCushionSpan = Math.max(1, performance.peakEquityUsd - cppiFloorUsd);
  const cppiScale = clamp((cppiCushionUsd / cppiCushionSpan) * cppiMultiplier, 0, 1);
  const drawdownBudgetBps = Math.round(toNumber(process.env.PHASE2_MAX_DRAWDOWN_BPS, 500));
  const drawdownHeadroomBps = Math.max(0, drawdownBudgetBps - performance.currentDrawdownBps);
  const validation = await computeValidationSummary(checkpoints, options);
  const reputation = await computeReputationSummary(detectedAgentId, options);

  const riskAdjustedProfitabilityScore = computeRiskAdjustedProfitabilityScore(
    performance.netPnlUsd,
    performance.maxDrawdownBps,
    baselineCapitalUsd
  );
  const drawdownControlScore = computeDrawdownControlScore(performance.maxDrawdownBps);
  const validationQualityScore = normalizeScore(validation.averageScore);
  const objectiveReputationScore = normalizeScore(reputation.averageScore);
  const validationPressure = clamp((82 - validation.averageScore) / 30, 0, 1);
  const reputationPressure = clamp((90 - reputation.averageScore) / 40, 0, 1);
  const trustPressure = clamp((validationPressure * 0.7) + (reputationPressure * 0.3), 0, 1);
  const freshScoreWindowRecommended = trustPressure >= 0.35
    && (validation.averageScore < 82 || reputation.averageScore < 90);
  const freshScoreWindowReason = freshScoreWindowRecommended
    ? `validation ${validation.averageScore.toFixed(2)}/82 and reputation ${reputation.averageScore.toFixed(2)}/90 are still pressuring the current window (${trustPressure.toFixed(2)})`
    : `validation ${validation.averageScore.toFixed(2)}/82 and reputation ${reputation.averageScore.toFixed(2)}/90 are within the current window (${trustPressure.toFixed(2)})`;
  const compositeScore = computeCompositeScore({
    riskAdjustedProfitabilityScore,
    drawdownControlScore,
    validationQualityScore,
    objectiveReputationScore,
  });

  const recentActions = buildRecentActions(checkpoints, options.recentLimit ?? 8);
  const latestValidationSignal = buildLatestValidationSignalSummary(checkpoints, fills);

  const summary: ScoreStorySummary = {
    agentId: detectedAgentId,
    mode,
    netPnlUsd: round2(performance.netPnlUsd),
    realizedPnlUsd: round2(performance.realizedPnlUsd),
    unrealizedPnlUsd: round2(performance.unrealizedPnlUsd),
    maxDrawdownBps: performance.maxDrawdownBps,
    currentDrawdownBps: performance.currentDrawdownBps,
    drawdownHeadroomBps,
    currentEquityUsd: round2(performance.currentEquityUsd),
    peakEquityUsd: round2(performance.peakEquityUsd),
    cppiScale: round2(cppiScale),
    cppiFloorUsd: round2(cppiFloorUsd),
    cppiCushionUsd: round2(cppiCushionUsd),
    averageValidationScore: round2(validation.averageScore),
    validationSource: validation.source,
    validationCoveragePct: round2(validation.coveragePct),
    averageReputationScore: round2(reputation.averageScore),
    reputationSource: reputation.source,
    reputationFeedbackCount: reputation.feedbackCount,
    latestValidationConfidence: latestValidationSignal.confidence,
    latestValidationEdgeSurplusBps: latestValidationSignal.edgeSurplusBps,
    latestValidationRiskGateStatus: latestValidationSignal.riskGateStatus,
    latestValidationFillExecuted: latestValidationSignal.fillExecuted,
    latestValidationRegimeConfidence: latestValidationSignal.regimeConfidence,
    latestValidationSignalSummary: latestValidationSignal.summary,
    riskAdjustedProfitabilityScore,
    drawdownControlScore,
    validationQualityScore,
    objectiveReputationScore,
    compositeScore,
    freshScoreWindowRecommended,
    freshScoreWindowReason,
    checkpointCount: checkpoints.length,
    fillCount: fills.length,
    openPositionBase: round6(performance.openPositionBase),
    recentFlow: buildRecentFlow(recentActions),
  };

  const leaderboard: LeaderboardEntry[] = [
    {
      rank: 1,
      agentId: summary.agentId,
      netPnlUsd: summary.netPnlUsd,
      maxDrawdownBps: summary.maxDrawdownBps,
      validationScore: summary.averageValidationScore,
      reputationScore: summary.averageReputationScore,
      compositeScore: summary.compositeScore,
      checkpointCount: summary.checkpointCount,
    },
  ];

  return {
    generatedAt: new Date().toISOString(),
    files: {
      checkpointsFile,
      fillsFile,
    },
    summary,
    leaderboard,
    recentActions,
  };
}
