import { TradeFill } from "../types/index";

export interface RiskSnapshot {
  executionMode: string;
  marketMode: string;
  sandbox: boolean;
  reputationLoop: boolean;
  recentNetNotionalUsd: number;
  maxTradeUsd: number;
  maxSlippageBps: number;
  maxTradesPerHour: number;
  estimatedTradesLastHour: number;
  dualGateEnabled: boolean;
  dualGateProbeUsd: number;
  minExpectedEdgeBps: number;
  minTradeConfidence: number;
  circuitBreakerEnabled: boolean;
  circuitBreakerMaxConsecutiveLosses: number;
  circuitBreakerMaxDailyLossUsd: number;
  circuitBreakerPauseMs: number;
  volatilityThrottlePct: number;
  guardrailNotes: string[];
}

export interface RiskSnapshotInput {
  executionMode: string;
  marketMode: string;
  sandbox: boolean;
  reputationLoop: boolean;
  recentFills?: TradeFill[];
  maxTradeUsd?: number;
  maxSlippageBps?: number;
  maxTradesPerHour?: number;
}

export function buildRiskSnapshot(input: RiskSnapshotInput): RiskSnapshot {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const estimatedTradesLastHour = (input.recentFills || []).filter((fill) => fill.timestamp >= nowSeconds - 3600).length;
  const maxTradesPerHour = Math.max(1, Math.round(input.maxTradesPerHour ?? 10));

  const recentNetNotionalUsd = (input.recentFills || []).reduce((sum, fill) => {
    return sum + (fill.action === "BUY" ? fill.amountUsd : -fill.amountUsd);
  }, 0);

  const guardrailNotes = [
    input.sandbox ? "paper trading enabled" : "live execution path enabled",
    input.reputationLoop ? "reputation loop enabled" : "reputation loop disabled",
    input.executionMode === "kraken" ? "Kraken execution adapter selected" : "mock/paper execution adapter selected",
    input.marketMode === "prism"
      ? "live Prism market feed enabled"
      : input.marketMode === "kraken"
        ? "live Kraken market feed enabled"
        : "synthetic market feed enabled",
    `hourly cap awareness: ${estimatedTradesLastHour}/${maxTradesPerHour} trades observed in rolling hour`,
    `dual-gate=${(process.env.DUAL_GATE_ENABLED || "true").toLowerCase() !== "false"} probeUsd=${parseBoundedNumberEnv("DUAL_GATE_PROBE_USD", 30, 1, 1000).toFixed(2)}`,
    `breaker thresholds: lossStreak<=${Math.round(parseBoundedNumberEnv("BREAKER_MAX_CONSECUTIVE_LOSSES", 3, 1, 20))} dailyLoss<=${parseBoundedNumberEnv("BREAKER_MAX_DAILY_LOSS_USD", 200, 10, 20000).toFixed(2)}USD`,
  ];

  const dualGateEnabled = (process.env.DUAL_GATE_ENABLED || "true").toLowerCase() !== "false";
  const dualGateProbeUsd = parseBoundedNumberEnv("DUAL_GATE_PROBE_USD", 30, 1, 1000);
  const minExpectedEdgeBps = parseBoundedNumberEnv("PLANNER_MIN_EXPECTED_EDGE_BPS", 12, 0, 200);
  const minTradeConfidence = parseBoundedNumberEnv("PLANNER_MIN_CONFIDENCE", 0.58, 0.3, 0.95);
  const circuitBreakerEnabled = (process.env.CIRCUIT_BREAKER_ENABLED || "true").toLowerCase() !== "false";
  const circuitBreakerMaxConsecutiveLosses = Math.round(parseBoundedNumberEnv("BREAKER_MAX_CONSECUTIVE_LOSSES", 3, 1, 20));
  const circuitBreakerMaxDailyLossUsd = parseBoundedNumberEnv("BREAKER_MAX_DAILY_LOSS_USD", 200, 10, 20000);
  const circuitBreakerPauseMs = parseBoundedNumberEnv("BREAKER_PAUSE_MS", 300000, 10000, 3600000);
  const volatilityThrottlePct = parseBoundedNumberEnv("BREAKER_VOLATILITY_THROTTLE_PCT", 2.8, 0.1, 15);

  return {
    executionMode: input.executionMode,
    marketMode: input.marketMode,
    sandbox: input.sandbox,
    reputationLoop: input.reputationLoop,
    recentNetNotionalUsd: round2(recentNetNotionalUsd),
    maxTradeUsd: input.maxTradeUsd ?? 100,
    maxSlippageBps: input.maxSlippageBps ?? 50,
    maxTradesPerHour,
    estimatedTradesLastHour,
    dualGateEnabled,
    dualGateProbeUsd,
    minExpectedEdgeBps,
    minTradeConfidence,
    circuitBreakerEnabled,
    circuitBreakerMaxConsecutiveLosses,
    circuitBreakerMaxDailyLossUsd,
    circuitBreakerPauseMs,
    volatilityThrottlePct,
    guardrailNotes,
  };
}

export function renderRiskSnapshot(snapshot: RiskSnapshot): string {
  return [
    `execution=${snapshot.executionMode} market=${snapshot.marketMode} sandbox=${snapshot.sandbox}`,
    `reputation=${snapshot.reputationLoop} netNotional=${snapshot.recentNetNotionalUsd.toFixed(2)}USD`,
    `maxTrade=${snapshot.maxTradeUsd.toFixed(2)}USD maxSlippage=${snapshot.maxSlippageBps}bps maxTradesPerHour=${snapshot.maxTradesPerHour}`,
    `dualGate=${snapshot.dualGateEnabled} probe=${snapshot.dualGateProbeUsd.toFixed(2)}USD minEdge=${snapshot.minExpectedEdgeBps.toFixed(2)}bps minConf=${snapshot.minTradeConfidence.toFixed(2)}`,
    `breaker=${snapshot.circuitBreakerEnabled} maxLossStreak=${snapshot.circuitBreakerMaxConsecutiveLosses} dailyLoss=${snapshot.circuitBreakerMaxDailyLossUsd.toFixed(2)}USD pause=${Math.round(snapshot.circuitBreakerPauseMs / 1000)}s volThrottle=${snapshot.volatilityThrottlePct.toFixed(2)}%`,
    `notes=${snapshot.guardrailNotes.join("; ")}`,
  ].join(" | ");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseBoundedNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] || "").trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}
