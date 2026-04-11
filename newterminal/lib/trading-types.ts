// FluxAgent Trading Console - Data Contracts

export interface DashboardSnapshot {
  status: DashboardStatus | null;
  price: DashboardPrice | null;
  checkpoints: DashboardCheckpoint[];
  traces: DashboardTrace[];
  metrics: DashboardMetrics | null;
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

export interface DashboardRiskStatus {
  guardrails: {
    maxPositionUsd: number | null;
    maxDrawdownBps: number | null;
    maxTradesPerHour: number | null;
    active: boolean | null;
    defaultCapUsd: number | null;
  } | null;
  drawdownEvidence: {
    maxDrawdownBps: number | null;
    currentDrawdownBps: number | null;
    currentEquityUsd: number | null;
    peakEquityUsd: number | null;
    asOfTimestamp: number | null;
  } | null;
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

export interface DashboardReadinessStatus {
  allChecksPassed: boolean | null;
  failReasons: string[];
  runLabel: string | null;
  evidenceDepth: {
    enabled: boolean;
    pass: boolean;
    checkpointCount: number | null;
    fillCount: number | null;
  } | null;
  runQuality: {
    enabled: boolean;
    pass: boolean;
    netPnlUsd: number | null;
    maxDrawdownObservedBps: number | null;
  } | null;
}

export interface DashboardPrice {
  price: number | null;
  timestamp?: number | null;
}

export interface DashboardCheckpoint {
  timestamp: number;
  action: 'BUY' | 'SELL' | 'HOLD';
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
  decisionContext?: Record<string, unknown>;
  freshness?: Record<string, unknown>;
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

export interface DashboardMetrics {
  generatedAt: string;
  summary: DashboardMetricSummary;
  leaderboard: Array<{
    rank: number;
    agentId: string;
    netPnlUsd: number;
    maxDrawdownBps: number;
    validationScore: number;
    reputationScore: number;
    compositeScore: number;
    checkpointCount: number;
  }>;
  recentActions: Array<{
    timestamp: number;
    action: string;
    pair: string;
    amountUsd: number;
    confidence: number;
    reasoning: string;
  }>;
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

export interface DashboardMarketContext {
  fearGreed: { value: string; class: string };
  networkGas: string;
  depthTilt: string;
  fundingRate: string;
  timestamp: number;
}

export interface Attestation {
  agentId?: string;
  timestamp: number;
  checkpointHash?: string;
  intentHash?: string;
  validator: string;
  score: number;
  proofType?: number;
  proof?: string;
  notes?: string;
  txid?: string;
}

export type ConnectionStatus = 'connected' | 'degraded' | 'disconnected';
export type ActionType = 'BUY' | 'SELL' | 'HOLD';
