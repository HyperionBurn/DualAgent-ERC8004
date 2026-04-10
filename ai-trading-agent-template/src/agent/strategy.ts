/**
 * TradingStrategy interface + example implementations.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * HOW TO SWAP IN YOUR OWN MODEL
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. Create a class that implements TradingStrategy
 * 2. In your analyze() method, call your LLM / algorithm with the MarketData
 * 3. Return a TradeDecision — the rest of the agent picks it up automatically
 *
 * Example with Claude:
 *   import Anthropic from "@anthropic-ai/sdk";
 *   class ClaudeStrategy implements TradingStrategy { ... }
 *
 * Example with Groq:
 *   import Groq from "groq-sdk";
 *   class GroqStrategy implements TradingStrategy { ... }
 * ─────────────────────────────────────────────────────────────────────────────
 */

import * as path from "path";
import { DecisionContext, MarketData, TradeAction, TradeDecision, TradingStrategy } from "../types/index";
import { PlannerTurnResult } from "./planner";
import { runAgentPlanner } from "./orchestrator";
import { getConfiguredPlannerProvider } from "../llm/provider";
import { buildIndicatorSnapshot, deriveIndicatorAction, IndicatorSnapshot } from "../tools/indicators";

export type StrategyMode = "llm" | "momentum" | "indicator";

export interface DualGatePolicyOptions {
  enabled: boolean;
  minNetEdgeBps: number;
  probeAmountUsd: number;
  probeMinConfidence: number;
}

export interface DualGatePolicyResult {
  decision: TradeDecision;
  deterministicAction: TradeAction;
  agreement: boolean;
  status: "full-size" | "reduced-probe" | "reduced-confidence" | "blocked" | "disabled";
  reason: string;
  sizeMultiplier: number;
}

const DEFAULT_DUAL_GATE_OPTIONS: DualGatePolicyOptions = {
  enabled: true,
  minNetEdgeBps: 8,
  probeAmountUsd: 30,
  probeMinConfidence: 0.66,
};

// ─────────────────────────────────────────────────────────────────────────────
// Simple momentum strategy (no LLM — good for testing the template)
// ─────────────────────────────────────────────────────────────────────────────

export class MomentumStrategy implements TradingStrategy {
  private priceHistory: number[] = [];
  private readonly windowSize: number;
  private readonly tradeAmountUsd: number;

  constructor(windowSize = 5, tradeAmountUsd = 100) {
    this.windowSize = windowSize;
    this.tradeAmountUsd = tradeAmountUsd;
  }

  async analyze(data: MarketData): Promise<TradeDecision> {
    this.priceHistory.push(data.price);
    if (this.priceHistory.length > this.windowSize) {
      this.priceHistory.shift();
    }

    if (this.priceHistory.length < this.windowSize) {
      return {
        action: "HOLD",
        asset: data.pair.replace("USD", ""),
        pair: data.pair,
        amount: 0,
        confidence: 0.5,
        reasoning: `Warming up: have ${this.priceHistory.length}/${this.windowSize} price samples. Holding.`,
      };
    }

    const first = this.priceHistory[0];
    const last = this.priceHistory[this.priceHistory.length - 1];
    const changePct = ((last - first) / first) * 100;
    const spread = ((data.ask - data.bid) / data.price) * 100;

    let action: TradeDecision["action"] = "HOLD";
    let confidence = 0.5;
    let reasoning = "";

    if (changePct > 0.5 && spread < 0.1) {
      action = "BUY";
      confidence = Math.min(0.9, 0.5 + Math.abs(changePct) / 10);
      reasoning = `Upward momentum: price rose ${changePct.toFixed(2)}% over last ${this.windowSize} ticks. Spread is tight at ${spread.toFixed(3)}%. Buying.`;
    } else if (changePct < -0.5) {
      action = "SELL";
      confidence = Math.min(0.9, 0.5 + Math.abs(changePct) / 10);
      reasoning = `Downward momentum: price fell ${Math.abs(changePct).toFixed(2)}% over last ${this.windowSize} ticks. Selling to avoid further loss.`;
    } else {
      reasoning = `No clear momentum (${changePct.toFixed(2)}% change). Holding current position.`;
    }

    return {
      action,
      asset: data.pair.replace("USD", ""),
      pair: data.pair,
      amount: action === "HOLD" ? 0 : this.tradeAmountUsd,
      confidence,
      reasoning,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Indicator strategy (non-LLM) with EMA/MACD/RSI/Bollinger signal fusion
// ─────────────────────────────────────────────────────────────────────────────

export class IndicatorStrategy implements TradingStrategy {
  private readonly checkpointsFile: string;
  private readonly lookback: number;
  private readonly baseTradeAmountUsd: number;
  private readonly minSignalScore: number;
  private readonly baseMinConfidence: number;
  private readonly maxSpreadBps: number;
  private readonly minTrendStrengthBps: number;
  private readonly maxBullishRsi: number;
  private readonly minBearishRsi: number;
  private readonly baseMinTradeIntervalMs: number;
  private readonly baseMinNetEdgeBps: number;
  private lastTradeAtMs = 0;

  constructor() {
    this.checkpointsFile = process.env.CHECKPOINTS_FILE || path.join(process.cwd(), "checkpoints.jsonl");
    this.lookback = parseBoundedNumberEnv("INDICATOR_LOOKBACK", 90, 10, 300);
    this.baseTradeAmountUsd = parseBoundedNumberEnv("INDICATOR_TRADE_AMOUNT_USD", Number(process.env.PLANNER_MAX_TRADE_USD || "100"), 1, 5000);
    this.minSignalScore = parseBoundedNumberEnv("INDICATOR_MIN_SIGNAL_SCORE", 0.4, 0.3, 5);
    this.baseMinConfidence = parseBoundedNumberEnv("INDICATOR_MIN_CONFIDENCE", 0.5, 0.3, 0.95);
    this.baseMinNetEdgeBps = parseBoundedNumberEnv("INDICATOR_MIN_NET_EDGE_BPS", 3, 0, 200);
    this.maxSpreadBps = parseBoundedNumberEnv("INDICATOR_MAX_SPREAD_BPS", 3, 0.2, 25);
    this.minTrendStrengthBps = parseBoundedNumberEnv("INDICATOR_MIN_TREND_BPS", 0.5, 0, 100);
    this.maxBullishRsi = parseBoundedNumberEnv("INDICATOR_MAX_BULLISH_RSI", 78, 40, 95);
    this.minBearishRsi = parseBoundedNumberEnv("INDICATOR_MIN_BEARISH_RSI", 22, 5, 60);
    this.baseMinTradeIntervalMs = parseBoundedNumberEnv("INDICATOR_MIN_TRADE_INTERVAL_MS", 15_000, 10_000, 3_600_000);
  }

  async analyze(data: MarketData): Promise<TradeDecision> {
    const snapshot = buildIndicatorSnapshot({
      market: data,
      checkpointsFile: this.checkpointsFile,
      lookback: this.lookback,
    });

    const asset = data.pair.replace(/USD$/i, "");
    const tradeAmountUsd = parseBoundedNumberEnv("INDICATOR_TRADE_AMOUNT_USD", this.baseTradeAmountUsd, 1, 5000);
    const minConfidence = parseBoundedNumberEnv("INDICATOR_MIN_CONFIDENCE", this.baseMinConfidence, 0.3, 0.95);
    const minNetEdgeBps = parseBoundedNumberEnv("INDICATOR_MIN_NET_EDGE_BPS", this.baseMinNetEdgeBps, 0, 200);
    const minTradeIntervalMs = parseBoundedNumberEnv("INDICATOR_MIN_TRADE_INTERVAL_MS", this.baseMinTradeIntervalMs, 10_000, 3_600_000);

    if (snapshot.sampleCount < 15) {
      return {
        action: "HOLD",
        asset,
        pair: data.pair,
        amount: 0,
        confidence: 0.45,
        reasoning: `Indicator warmup (${snapshot.sampleCount}/15 samples). Waiting for sufficient history before trading.`,
      };
    }

    const spreadOk = snapshot.spreadBps <= this.maxSpreadBps;
    const trendStrengthBps = snapshot.trendStrengthBps ?? 0;
    const trendOk = trendStrengthBps >= this.minTrendStrengthBps;
    const edgeSurplusBps = Math.max(0, snapshot.netEdgeBps - minNetEdgeBps);
    const confidence = clamp(
      Math.max(
        snapshot.confidenceHint,
        0.42 + (Math.abs(snapshot.signalScore) / 5.5) + (edgeSurplusBps / 120) + (Math.max(snapshot.regimeConfidence - 0.5, 0) * 0.3)
      ),
      0.35,
      0.95
    );
    const bullishContinuationOverride = snapshot.rsi14 !== null
      && snapshot.rsi14 > this.maxBullishRsi
      && snapshot.signalScore >= this.minSignalScore + 0.7
      && snapshot.netEdgeBps >= minNetEdgeBps + 8
      && (snapshot.macdHistogram ?? 0) >= 0.8
      && snapshot.regimeLabel !== "volatile-chop";
    const bearishContinuationOverride = snapshot.rsi14 !== null
      && snapshot.rsi14 < this.minBearishRsi
      && snapshot.signalScore <= -(this.minSignalScore + 0.7)
      && snapshot.netEdgeBps >= minNetEdgeBps + 8
      && (snapshot.macdHistogram ?? 0) <= -0.8
      && snapshot.regimeLabel !== "volatile-chop";
    const bullishRsiOk = snapshot.rsi14 === null
      || snapshot.rsi14 <= this.maxBullishRsi
      || (snapshot.regimeLabel === "trend-up" && snapshot.regimeConfidence >= 0.65 && snapshot.signalScore >= this.minSignalScore + 0.4)
      || bullishContinuationOverride;
    const bearishRsiOk = snapshot.rsi14 === null
      || snapshot.rsi14 >= this.minBearishRsi
      || (snapshot.regimeLabel === "trend-down" && snapshot.regimeConfidence >= 0.65 && snapshot.signalScore <= -(this.minSignalScore + 0.4))
      || bearishContinuationOverride;

    const bullishSetup = snapshot.bias === "bullish"
      && snapshot.signalScore >= this.minSignalScore
      && snapshot.netEdgePass
      && snapshot.netEdgeBps >= minNetEdgeBps
      && spreadOk
      && trendOk
      && confidence >= minConfidence
      && bullishRsiOk;

    const bearishSetup = snapshot.bias === "bearish"
      && snapshot.signalScore <= -this.minSignalScore
      && snapshot.netEdgePass
      && snapshot.netEdgeBps >= minNetEdgeBps
      && spreadOk
      && trendOk
      && confidence >= minConfidence
      && bearishRsiOk;

    const holdNotes: string[] = [];

    let action: TradeDecision["action"] = "HOLD";
    if (bullishSetup) {
      action = "BUY";
    } else if (bearishSetup) {
      action = "SELL";
    }

    const nowMs = Date.now();
    if (action !== "HOLD" && nowMs - this.lastTradeAtMs < minTradeIntervalMs) {
      action = "HOLD";
      holdNotes.push(`cooldown active (${Math.round((minTradeIntervalMs - (nowMs - this.lastTradeAtMs)) / 1000)}s remaining)`);
    }
    if (action !== "HOLD") {
      this.lastTradeAtMs = nowMs;
    }

    const amount = action === "HOLD" ? 0 : tradeAmountUsd;
    if (!spreadOk) {
      holdNotes.push(`spread ${snapshot.spreadBps.toFixed(2)}bps > ${this.maxSpreadBps.toFixed(2)}bps`);
    }
    if (!trendOk) {
      holdNotes.push(`trend ${trendStrengthBps.toFixed(2)}bps < ${this.minTrendStrengthBps.toFixed(2)}bps`);
    }
    if (confidence < minConfidence) {
      holdNotes.push(`confidence ${confidence.toFixed(2)} < ${minConfidence.toFixed(2)}`);
    }
    if (!snapshot.netEdgePass || snapshot.netEdgeBps < minNetEdgeBps) {
      holdNotes.push(`net edge ${snapshot.netEdgeBps.toFixed(2)}bps < ${minNetEdgeBps.toFixed(2)}bps`);
    }
    if (snapshot.bias === "bullish" && !bullishRsiOk) {
      holdNotes.push(`RSI ${snapshot.rsi14?.toFixed(2) ?? "n/a"} too hot for bullish entry (max ${this.maxBullishRsi.toFixed(2)})`);
    }
    if (snapshot.bias === "bearish" && !bearishRsiOk) {
      holdNotes.push(`RSI ${snapshot.rsi14?.toFixed(2) ?? "n/a"} too cold for bearish entry (min ${this.minBearishRsi.toFixed(2)})`);
    }

    const decisionContext: DecisionContext = {
      regimeLabel: snapshot.regimeLabel,
      regimeConfidence: snapshot.regimeConfidence,
      expectedEdgeBps: snapshot.expectedEdgeBps,
      costDragBps: snapshot.costDragBps,
      netEdgeBps: snapshot.netEdgeBps,
      edgeThresholdBps: minNetEdgeBps,
      riskGateStatus: action === "HOLD" ? (holdNotes.length > 0 ? holdNotes.join("; ") : "no-trade") : "edge-pass",
      executionIntent: action === "HOLD" ? "stand-down" : `${action.toLowerCase()}-signal`,
    };

    const reasoning = [
      `Indicator bias=${snapshot.bias} regime=${snapshot.regimeLabel}@${snapshot.regimeConfidence.toFixed(2)} score=${snapshot.signalScore.toFixed(2)} conf=${confidence.toFixed(2)}.`,
      `EMA8/21=${formatMaybeNumber(snapshot.emaFast, 2)}/${formatMaybeNumber(snapshot.emaSlow, 2)}, MACD hist=${formatMaybeNumber(snapshot.macdHistogram, 4)}, RSI14=${formatMaybeNumber(snapshot.rsi14, 2)}.`,
      `Expected edge ${snapshot.expectedEdgeBps.toFixed(2)}bps - cost drag ${snapshot.costDragBps.toFixed(2)}bps = net ${snapshot.netEdgeBps.toFixed(2)}bps (threshold ${minNetEdgeBps.toFixed(2)}bps).`,
      `Breakout=${formatMaybeNumber(snapshot.breakoutPositionPct, 2)}%, spread=${snapshot.spreadBps.toFixed(2)}bps, VWAP premium=${snapshot.vwapPremiumPct.toFixed(4)}%.`,
      action === "HOLD"
        ? `No execution: ${holdNotes.length > 0 ? holdNotes.join("; ") : "signal not strong enough for risk-adjusted trade."}`
        : `${action} setup confirmed by indicator stack with risk gates satisfied.`,
    ].join(" ");

    return {
      action,
      asset,
      pair: data.pair,
      amount,
      confidence: action === "HOLD"
        ? Math.min(confidence, Math.max(0.5, minConfidence - 0.02))
        : confidence,
      reasoning,
      decisionContext,
    };
  }
}

export function applyDualGatePolicy(input: {
  decision: TradeDecision;
  indicatorSnapshot: IndicatorSnapshot;
  options?: Partial<DualGatePolicyOptions>;
}): DualGatePolicyResult {
  const options: DualGatePolicyOptions = {
    ...DEFAULT_DUAL_GATE_OPTIONS,
    ...input.options,
  };

  const deterministicAction = deriveIndicatorAction(input.indicatorSnapshot, options.minNetEdgeBps);
  const tradeRequested = input.decision.action !== "HOLD" && input.decision.amount > 0;

  if (!options.enabled || !tradeRequested) {
    return {
      decision: input.decision,
      deterministicAction,
      agreement: input.decision.action === deterministicAction,
      status: "disabled",
      reason: options.enabled ? "dual-gate skipped (no actionable trade)" : "dual-gate disabled",
      sizeMultiplier: 1,
    };
  }

  const agreement = deterministicAction !== "HOLD" && deterministicAction === input.decision.action;
  if (!agreement) {
    const highConfidencePlannerTrust = input.decision.confidence >= 0.68;
    const canProbe = (
      (input.decision.confidence >= Math.max(0.50, options.probeMinConfidence - 0.16)
      && options.probeAmountUsd > 0
      && input.indicatorSnapshot.netEdgeBps > -2)
      || highConfidencePlannerTrust
    );

    if (!canProbe) {
      return {
        decision: {
          ...input.decision,
          action: "HOLD",
          amount: 0,
          reasoning: `${input.decision.reasoning} [DUAL-GATE blocked: planner=${input.decision.action} deterministic=${deterministicAction}.]`,
          decisionContext: {
            ...input.decision.decisionContext,
            dualGateStatus: `blocked:planner=${input.decision.action}/deterministic=${deterministicAction}`,
            riskGateStatus: "dual-gate-block",
            executionIntent: "hold-blocked",
          },
        },
        deterministicAction,
        agreement: false,
        status: "blocked",
        reason: `planner=${input.decision.action} deterministic=${deterministicAction}`,
        sizeMultiplier: 0,
      };
    }

    const probeAmount = round2(Math.max(1, Math.min(input.decision.amount, options.probeAmountUsd)));
    return {
      decision: {
        ...input.decision,
        amount: probeAmount,
        reasoning: `${input.decision.reasoning} [DUAL-GATE reduced to probe ${probeAmount.toFixed(2)}USD: planner=${input.decision.action} deterministic=${deterministicAction}.]`,
        decisionContext: {
          ...input.decision.decisionContext,
          dualGateStatus: `reduced-probe:planner=${input.decision.action}/deterministic=${deterministicAction}`,
          riskGateStatus: "dual-gate-probe",
          executionIntent: `${input.decision.action.toLowerCase()}-probe`,
        },
      },
      deterministicAction,
      agreement: false,
      status: "reduced-probe",
      reason: `planner=${input.decision.action} deterministic=${deterministicAction}; probeAmountUsd=${probeAmount.toFixed(2)}`,
      sizeMultiplier: probeAmount / Math.max(input.decision.amount, 1),
    };
  }

  let scaledAmount = input.decision.amount;
  let status: DualGatePolicyResult["status"] = "full-size";
  let reason = "planner and deterministic signal agree";
  if (input.decision.confidence < options.probeMinConfidence + 0.08) {
    scaledAmount = round2(input.decision.amount * 0.75);
    status = "reduced-confidence";
    reason = `agreement with modest confidence (${input.decision.confidence.toFixed(2)})`;
  }

  if (input.indicatorSnapshot.netEdgeBps < options.minNetEdgeBps + 4) {
    scaledAmount = round2(Math.min(scaledAmount, input.decision.amount * 0.65));
    status = "reduced-confidence";
    reason = `agreement with thin net edge (${input.indicatorSnapshot.netEdgeBps.toFixed(2)}bps)`;
  }

  const sizeMultiplier = Math.max(0, Math.min(1, scaledAmount / Math.max(input.decision.amount, 1)));
  const decision = scaledAmount < input.decision.amount
    ? {
      ...input.decision,
      amount: scaledAmount,
      reasoning: `${input.decision.reasoning} [DUAL-GATE size-adjusted to ${scaledAmount.toFixed(2)}USD: ${reason}.]`,
      decisionContext: {
        ...input.decision.decisionContext,
        dualGateStatus: `agreement-reduced:sizeMultiplier=${sizeMultiplier.toFixed(2)}`,
        riskGateStatus: "dual-gate-agree-reduced",
      },
    }
    : {
      ...input.decision,
      decisionContext: {
        ...input.decision.decisionContext,
        dualGateStatus: "agreement-full-size",
        riskGateStatus: "dual-gate-agree",
      },
    };

  return {
    decision,
    deterministicAction,
    agreement: true,
    status,
    reason,
    sizeMultiplier,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM-backed strategy stub — replace the body of analyze() with your model call
// ─────────────────────────────────────────────────────────────────────────────

export class LLMStrategy implements TradingStrategy {
  public lastPlannerResult: PlannerTurnResult | null = null;

  async analyze(data: MarketData): Promise<TradeDecision> {
    const plannerResult = await runAgentPlanner({
      market: data,
      pair: data.pair,
      executionMode: (process.env.EXECUTION_MODE || "mock").toLowerCase(),
      marketMode: (process.env.MARKET_DATA_MODE || process.env.EXECUTION_MODE || "mock").toLowerCase(),
      sandbox: (process.env.KRAKEN_SANDBOX || "true").toLowerCase() !== "false",
      reputationLoop: (process.env.ENABLE_REPUTATION_LOOP || "false").toLowerCase() === "true",
      maxTradesPerHour: Number(process.env.PLANNER_MAX_TRADES_PER_HOUR || process.env.MAX_TRADES_PER_HOUR || "10"),
      checkpointsFile: process.env.CHECKPOINTS_FILE,
      fillsFile: process.env.FILLS_FILE,
      recentLimit: Number(process.env.PLANNER_RECENT_LIMIT || "6"),
      maxTradeUsd: Number(process.env.PLANNER_MAX_TRADE_USD || "100"),
      maxSlippageBps: Number(process.env.PLANNER_MAX_SLIPPAGE_BPS || "50"),
    });

    this.lastPlannerResult = plannerResult;
    return plannerResult.decision;
  }
}

export function resolveStrategyMode(): StrategyMode {
  const forced = (process.env.TRADING_STRATEGY || "").trim().toLowerCase();
  if (forced === "llm" || forced === "momentum" || forced === "indicator") {
    return forced;
  }

  return "indicator";
}

export function shouldUseLLMStrategy(): boolean {
  return resolveStrategyMode() === "llm";
}

export function createDefaultStrategy(): TradingStrategy {
  const mode = resolveStrategyMode();

  if (mode === "llm") {
    return new LLMStrategy();
  }

  if (mode === "momentum") {
    return new MomentumStrategy(5, 100);
  }

  return new IndicatorStrategy();
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

  return clamp(parsed, min, max);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatMaybeNumber(value: number | null, precision: number): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(precision);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
