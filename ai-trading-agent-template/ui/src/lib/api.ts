export interface DashboardRiskGuardrails {
  maxPositionUsd: number | null;
  maxDrawdownBps: number | null;
  maxTradesPerHour: number | null;
  active: boolean | null;
  defaultCapUsd: number | null;
}

export interface DashboardDrawdownEvidence {
  maxDrawdownBps: number | null;
  currentDrawdownBps: number | null;
  currentEquityUsd: number | null;
  peakEquityUsd: number | null;
  asOfTimestamp: number | null;
}

export interface DashboardRiskStatus {
  guardrails: DashboardRiskGuardrails | null;
  drawdownEvidence: DashboardDrawdownEvidence | null;
  cppi?: {
    floorRatio: number | null;
    multiplier: number | null;
    floorEquityUsd: number | null;
    cushionUsd: number | null;
    cushionRatio: number | null;
    scale: number | null;
  } | null;
  runtimeRiskControls?: {
    breakerActive: boolean | null;
    breakerReason: string | null;
    consecutiveLosses: number | null;
    dailyLossUsd: number | null;
    volatilityThrottleActive: boolean | null;
    volatilityPct: number | null;
    appliedTradeScale: number | null;
  } | null;
}

export interface DashboardReputationContext {
  feedbackCount: number;
  failureContextCount: number;
  latestFeedback: {
    timestamp: number | null;
    score: number | null;
    feedbackType: string | null;
    txid: string | null;
    intentHash: string | null;
  } | null;
  latestFailureContext: {
    timestamp: number | null;
    action: string | null;
    pair: string | null;
    deltaNetPnlUsd: number | null;
    cppiScale: number | null;
    breakerState: string | null;
    txid: string | null;
    intentHash: string | null;
  } | null;
}

export interface DashboardEvidenceDepthStatus {
  enabled: boolean;
  pass: boolean;
  minCheckpointCount: number | null;
  maxCheckpointCount: number | null;
  checkpointCount: number | null;
  checkpointRangePass: boolean | null;
  minFillCount: number | null;
  maxFillCount: number | null;
  fillCount: number | null;
  fillRangePass: boolean | null;
  reasons: string[];
}

export interface DashboardRunQualityStatus {
  enabled: boolean;
  pass: boolean;
  minNetPnlUsd: number | null;
  maxDrawdownBps: number | null;
  netPnlUsd: number | null;
  maxDrawdownObservedBps: number | null;
  pnlPass: boolean | null;
  drawdownPass: boolean | null;
  reasons: string[];
}

export interface DashboardReadinessStatus {
  allChecksPassed: boolean | null;
  failReasons: string[];
  runLabel: string | null;
  evidenceDepth: DashboardEvidenceDepthStatus | null;
  runQuality: DashboardRunQualityStatus | null;
}

export interface DashboardStatus {
  agentId: string;
  wallet: string;
  pair: string;
  mode: string;
  marketMode?: string;
  strategy?: string;
  plannerProvider?: string;
  sandbox: boolean;
  agentRunning?: boolean;
  agentRuntimePid?: number | null;
  risk?: DashboardRiskStatus | null;
  reputationContext?: DashboardReputationContext | null;
  readiness?: DashboardReadinessStatus | null;
  contracts: Record<string, string | null>;
}

export interface DashboardPrice {
  price: number | null;
  timestamp?: number | null;
}

export interface DashboardCheckpoint {
  timestamp: number;
  action: string;
  pair: string;
  amountUsd: number;
  priceUsd: number;
  reasoning: string;
  confidence: number;
  intentHash: string;
  signerAddress: string;
  checkpointHash?: string;
  model?: string;
  keyLabel?: string;
  promptVersion?: string;
}

export interface DashboardTrace {
  agentId?: string;
  timestamp: number;
  pair: string;
  priceUsd: number;
  model: string;
  keyLabel: string;
  usedFallback: boolean;
  decision: {
    action: string;
    amount: number;
    confidence: number;
    reasoning: string;
  };
  promptVersion?: string;
  toolResults?: string;
}

export interface DashboardMetricSummary {
  agentId: string;
  mode: string;
  netPnlUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  maxDrawdownBps: number;
  averageValidationScore: number;
  validationSource: string;
  validationCoveragePct: number;
  averageReputationScore: number;
  reputationSource: string;
  reputationFeedbackCount: number;
  riskAdjustedProfitabilityScore: number;
  drawdownControlScore: number;
  validationQualityScore: number;
  objectiveReputationScore: number;
  compositeScore: number;
  checkpointCount: number;
  fillCount: number;
  openPositionBase: number;
  recentFlow: string;
}

export interface DashboardMetrics {
  generatedAt: string;
  summary: DashboardMetricSummary;
  leaderboard: Array<{ rank: number; agentId: string; netPnlUsd: number; maxDrawdownBps: number; validationScore: number; reputationScore: number; compositeScore: number; checkpointCount: number }>;
  recentActions: Array<{ timestamp: number; action: string; pair: string; amountUsd: number; confidence: number; reasoning: string }>;
}

export interface DashboardMarketContext {
  fearGreed: { value: string; class: string };
  networkGas: string;
  depthTilt: string;
  fundingRate: string;
  timestamp: number;
}

export interface DashboardSnapshot {
  status: DashboardStatus | null;
  price: DashboardPrice | null;
  checkpoints: DashboardCheckpoint[];
  traces: DashboardTrace[];
  metrics: DashboardMetrics | null;
}

export interface AgentStopResult {
  ok: boolean;
  stopped: boolean;
  serviceName: string;
  lockFilePath: string;
  pid: number | null;
  message: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");

async function loadJson<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function loadDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [status, price, checkpoints, traces, metrics] = await Promise.allSettled([
    loadJson<DashboardStatus>("/api/status"),
    loadJson<DashboardPrice>("/api/price"),
    loadJson<DashboardCheckpoint[]>("/api/checkpoints"),
    loadJson<DashboardTrace[]>("/api/traces"),
    loadJson<DashboardMetrics>("/api/metrics"),
  ]);

  return {
    status: status.status === "fulfilled" ? status.value : null,
    price: price.status === "fulfilled" ? price.value : null,
    checkpoints: checkpoints.status === "fulfilled" ? checkpoints.value : [],
    traces: traces.status === "fulfilled" ? traces.value : [],
    metrics: metrics.status === "fulfilled" ? metrics.value : null,
  };
}

export async function stopAgent(): Promise<AgentStopResult> {
  const response = await fetch(`${API_BASE}/api/agent/stop`, {
    method: "POST",
  });

  const payload = await response.json().catch(() => null) as AgentStopResult | null;
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed for /api/agent/stop: ${response.status}`);
  }

  if (!payload) {
    throw new Error("Agent stop response was empty");
  }

  return payload;
}

export async function loadMarketContext(): Promise<DashboardMarketContext> {
  return loadJson<DashboardMarketContext>("/api/market-context");
}
