import * as path from "path";
import { loadCheckpoints } from "../metrics/index";
import { MarketData, TradeAction } from "../types/index";

export type IndicatorBias = "bullish" | "bearish" | "neutral";
export type MarketRegime = "trend-up" | "trend-down" | "range" | "volatile-chop";

export interface IndicatorSnapshot {
  sampleCount: number;
  lookback: number;
  emaFast: number | null;
  emaSlow: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
  rsi14: number | null;
  bollingerMid: number | null;
  bollingerUpper: number | null;
  bollingerLower: number | null;
  bollingerZScore: number | null;
  breakoutPositionPct: number | null;
  realizedVolPct: number | null;
  spreadBps: number;
  vwapPremiumPct: number;
  trendStrengthBps: number | null;
  signalScore: number;
  bias: IndicatorBias;
  regimeLabel: MarketRegime;
  regimeConfidence: number;
  expectedEdgeBps: number;
  costDragBps: number;
  netEdgeBps: number;
  netEdgePass: boolean;
  confidenceHint: number;
  notes: string[];
}

export interface IndicatorSnapshotInput {
  market: MarketData;
  checkpointsFile?: string;
  lookback?: number;
}

const FAST_EMA_PERIOD = 8;
const SLOW_EMA_PERIOD = 21;
const MACD_FAST_PERIOD = 12;
const MACD_SLOW_PERIOD = 26;
const MACD_SIGNAL_PERIOD = 9;
const RSI_PERIOD = 14;
const BOLLINGER_PERIOD = 20;

export function buildIndicatorSnapshot(input: IndicatorSnapshotInput): IndicatorSnapshot {
  const lookback = normalizeLookback(input.lookback ?? 80);
  const checkpointsFile = input.checkpointsFile || path.join(process.cwd(), "checkpoints.jsonl");
  const checkpoints = loadCheckpoints(checkpointsFile);

  const historicalPrices = checkpoints
    .map((checkpoint) => checkpoint.priceUsd)
    .filter((value) => Number.isFinite(value) && value > 0);

  const priceSeries = [...historicalPrices, input.market.price].slice(-lookback);

  const emaFast = computeEma(priceSeries, FAST_EMA_PERIOD);
  const emaSlow = computeEma(priceSeries, SLOW_EMA_PERIOD);
  const macd = computeMacd(priceSeries);
  const rsi14 = computeRsi(priceSeries, RSI_PERIOD);
  const bollinger = computeBollinger(priceSeries, BOLLINGER_PERIOD);
  const breakoutPositionPct = computeBreakoutPosition(priceSeries, BOLLINGER_PERIOD);
  const realizedVolPct = computeRealizedVolatility(priceSeries);

  const spreadBps = computeSpreadBps(input.market);
  const vwapPremiumPct = input.market.vwap > 0
    ? ((input.market.price - input.market.vwap) / input.market.vwap) * 100
    : 0;
  const trendStrengthBps = emaFast !== null && emaSlow !== null && input.market.price > 0
    ? Math.abs((emaFast - emaSlow) / input.market.price) * 10_000
    : null;

  const signalScore = computeSignalScore({
    emaFast,
    emaSlow,
    macdHistogram: macd.histogram,
    rsi14,
    breakoutPositionPct,
    vwapPremiumPct,
    spreadBps,
    realizedVolPct,
  });

  const biasThreshold = parseBoundedEnvNumber("INDICATOR_BIAS_THRESHOLD", 0.4, 0.3, 2.5);
  const bias: IndicatorBias = signalScore >= biasThreshold
    ? "bullish"
    : signalScore <= -biasThreshold
      ? "bearish"
      : "neutral";

  const regime = classifyMarketRegime({
    bias,
    realizedVolPct,
    trendStrengthBps,
    breakoutPositionPct,
  });

  const expectedEdgeBps = computeExpectedEdgeBps({
    signalScore,
    trendStrengthBps,
    breakoutPositionPct,
    vwapPremiumPct,
    regimeConfidence: regime.confidence,
    realizedVolPct,
  });
  const assumedFeeBps = parseBoundedEnvNumber("PLANNER_ASSUMED_FEE_BPS", 2, 0, 50);
  const defaultSlippage = parseBoundedEnvNumber(
    "PLANNER_MAX_SLIPPAGE_BPS",
    50,
    0,
    500
  ) / 10;
  const assumedSlippageBps = parseBoundedEnvNumber(
    "PLANNER_ASSUMED_SLIPPAGE_BPS",
    Math.max(1, defaultSlippage / 2),
    0,
    100
  );
  const costDragBps = spreadBps + assumedFeeBps + assumedSlippageBps;
  const netEdgeBps = expectedEdgeBps - costDragBps;
  const minNetEdgeBps = parseBoundedEnvNumber("INDICATOR_MIN_NET_EDGE_BPS", 3, 0, 200);
  const netEdgePass = netEdgeBps >= minNetEdgeBps;

  const confidenceHint = computeConfidenceHint(signalScore, trendStrengthBps, priceSeries.length);

  const notes: string[] = [];
  if (priceSeries.length < SLOW_EMA_PERIOD) {
    notes.push(`indicator warmup ${priceSeries.length}/${SLOW_EMA_PERIOD} samples`);
  }
  if (spreadBps > 3) {
    notes.push(`spread widened to ${spreadBps.toFixed(2)}bps`);
  }
  if (realizedVolPct !== null && realizedVolPct > 2.5) {
    notes.push(`high short-horizon volatility ${realizedVolPct.toFixed(2)}%`);
  }
  if (!netEdgePass) {
    notes.push(`net edge ${netEdgeBps.toFixed(2)}bps below gate ${minNetEdgeBps.toFixed(2)}bps`);
  }

  return {
    sampleCount: priceSeries.length,
    lookback,
    emaFast: round2OrNull(emaFast),
    emaSlow: round2OrNull(emaSlow),
    macdLine: round4OrNull(macd.line),
    macdSignal: round4OrNull(macd.signal),
    macdHistogram: round4OrNull(macd.histogram),
    rsi14: round2OrNull(rsi14),
    bollingerMid: round2OrNull(bollinger.mid),
    bollingerUpper: round2OrNull(bollinger.upper),
    bollingerLower: round2OrNull(bollinger.lower),
    bollingerZScore: round4OrNull(bollinger.zScore),
    breakoutPositionPct: round2OrNull(breakoutPositionPct),
    realizedVolPct: round4OrNull(realizedVolPct),
    spreadBps: round2(spreadBps),
    vwapPremiumPct: round4(vwapPremiumPct),
    trendStrengthBps: round4OrNull(trendStrengthBps),
    signalScore: round4(signalScore),
    bias,
    regimeLabel: regime.label,
    regimeConfidence: round4(regime.confidence),
    expectedEdgeBps: round4(expectedEdgeBps),
    costDragBps: round4(costDragBps),
    netEdgeBps: round4(netEdgeBps),
    netEdgePass,
    confidenceHint: round4(confidenceHint),
    notes,
  };
}

export function renderIndicatorSnapshot(snapshot: IndicatorSnapshot): string {
  return [
    `samples=${snapshot.sampleCount}/${snapshot.lookback} bias=${snapshot.bias} regime=${snapshot.regimeLabel}@${snapshot.regimeConfidence.toFixed(2)} score=${snapshot.signalScore.toFixed(2)} confHint=${snapshot.confidenceHint.toFixed(2)}`,
    `ema(8/21)=${formatNullable(snapshot.emaFast, 2)}/${formatNullable(snapshot.emaSlow, 2)} trend=${formatNullable(snapshot.trendStrengthBps, 2)}bps`,
    `macd=${formatNullable(snapshot.macdLine, 4)}/${formatNullable(snapshot.macdSignal, 4)} hist=${formatNullable(snapshot.macdHistogram, 4)} rsi14=${formatNullable(snapshot.rsi14, 2)}`,
    `bollingerZ=${formatNullable(snapshot.bollingerZScore, 4)} breakout=${formatNullable(snapshot.breakoutPositionPct, 2)}% vol=${formatNullable(snapshot.realizedVolPct, 4)}%`,
    `edge expected=${snapshot.expectedEdgeBps.toFixed(2)}bps cost=${snapshot.costDragBps.toFixed(2)}bps net=${snapshot.netEdgeBps.toFixed(2)}bps pass=${snapshot.netEdgePass}`,
    `spread=${snapshot.spreadBps.toFixed(2)}bps vwapPremium=${snapshot.vwapPremiumPct.toFixed(4)}%`,
    snapshot.notes.length > 0 ? `notes=${snapshot.notes.join("; ")}` : "notes=none",
  ].join(" | ");
}

export function deriveIndicatorAction(
  snapshot: IndicatorSnapshot,
  minNetEdgeBps = parseBoundedEnvNumber("INDICATOR_MIN_NET_EDGE_BPS", 8, 0, 200)
): TradeAction {
  if (!snapshot.netEdgePass || snapshot.netEdgeBps < minNetEdgeBps) {
    return "HOLD";
  }

  if (snapshot.bias === "bullish") {
    return "BUY";
  }

  if (snapshot.bias === "bearish") {
    return "SELL";
  }

  return "HOLD";
}

function normalizeLookback(lookback: number): number {
  if (!Number.isFinite(lookback) || lookback < 10) {
    return 80;
  }
  return Math.min(300, Math.floor(lookback));
}

function computeSpreadBps(market: MarketData): number {
  if (!Number.isFinite(market.price) || market.price <= 0) {
    return 0;
  }
  return ((market.ask - market.bid) / market.price) * 10_000;
}

function computeEma(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const alpha = 2 / (period + 1);
  let ema = average(values.slice(0, period));
  for (let i = period; i < values.length; i += 1) {
    ema = (values[i] - ema) * alpha + ema;
  }

  return ema;
}

function computeMacd(values: number[]): { line: number | null; signal: number | null; histogram: number | null } {
  if (values.length < MACD_SLOW_PERIOD) {
    return { line: null, signal: null, histogram: null };
  }

  const fastSeries = computeEmaSeries(values, MACD_FAST_PERIOD);
  const slowSeries = computeEmaSeries(values, MACD_SLOW_PERIOD);
  const macdSeries: number[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const fast = fastSeries[i];
    const slow = slowSeries[i];
    if (fast === null || slow === null) {
      continue;
    }
    macdSeries.push(fast - slow);
  }

  const line = macdSeries.length > 0 ? macdSeries[macdSeries.length - 1] : null;
  const signal = computeEma(macdSeries, MACD_SIGNAL_PERIOD);
  const histogram = line !== null && signal !== null ? line - signal : null;

  return { line, signal, histogram };
}

function computeEmaSeries(values: number[], period: number): Array<number | null> {
  const series: Array<number | null> = Array(values.length).fill(null);
  if (values.length < period) {
    return series;
  }

  const alpha = 2 / (period + 1);
  let ema = average(values.slice(0, period));
  series[period - 1] = ema;

  for (let i = period; i < values.length; i += 1) {
    ema = (values[i] - ema) * alpha + ema;
    series[i] = ema;
  }

  return series;
}

function computeRsi(values: number[], period: number): number | null {
  if (values.length <= period) {
    return null;
  }

  const startIndex = values.length - period;
  let gains = 0;
  let losses = 0;

  for (let i = startIndex; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) {
      gains += delta;
    } else {
      losses += Math.abs(delta);
    }
  }

  const averageGain = gains / period;
  const averageLoss = losses / period;
  if (averageLoss === 0) {
    return 100;
  }

  const relativeStrength = averageGain / averageLoss;
  return 100 - (100 / (1 + relativeStrength));
}

function computeBollinger(values: number[], period: number): {
  mid: number | null;
  upper: number | null;
  lower: number | null;
  zScore: number | null;
} {
  if (values.length < period) {
    return {
      mid: null,
      upper: null,
      lower: null,
      zScore: null,
    };
  }

  const window = values.slice(-period);
  const mid = average(window);
  const variance = window.reduce((acc, value) => acc + Math.pow(value - mid, 2), 0) / period;
  const standardDeviation = Math.sqrt(variance);
  const upper = mid + (2 * standardDeviation);
  const lower = mid - (2 * standardDeviation);
  const latest = window[window.length - 1];
  const zScore = standardDeviation > 0 ? (latest - mid) / standardDeviation : 0;

  return {
    mid,
    upper,
    lower,
    zScore,
  };
}

function computeBreakoutPosition(values: number[], period: number): number | null {
  if (values.length < period) {
    return null;
  }

  const window = values.slice(-period);
  const highest = Math.max(...window);
  const lowest = Math.min(...window);
  const range = highest - lowest;

  if (range <= 0) {
    return 50;
  }

  const latest = window[window.length - 1];
  return ((latest - lowest) / range) * 100;
}

function computeRealizedVolatility(values: number[]): number | null {
  if (values.length < 5) {
    return null;
  }

  const returns: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] <= 0 || values[i] <= 0) {
      continue;
    }
    returns.push(Math.log(values[i] / values[i - 1]));
  }

  if (returns.length < 4) {
    return null;
  }

  const meanReturn = average(returns);
  const variance = returns.reduce((acc, value) => acc + Math.pow(value - meanReturn, 2), 0) / (returns.length - 1);
  const standardDeviation = Math.sqrt(Math.max(variance, 0));
  const annualizationFactor = Math.sqrt(Math.min(returns.length, 24));

  return standardDeviation * annualizationFactor * 100;
}

function computeSignalScore(input: {
  emaFast: number | null;
  emaSlow: number | null;
  macdHistogram: number | null;
  rsi14: number | null;
  breakoutPositionPct: number | null;
  vwapPremiumPct: number;
  spreadBps: number;
  realizedVolPct: number | null;
}): number {
  let score = 0;

  if (input.emaFast !== null && input.emaSlow !== null) {
    score += input.emaFast > input.emaSlow ? 1.2 : -1.2;
  }

  if (input.macdHistogram !== null) {
    score += input.macdHistogram > 0 ? 1.0 : -1.0;
  }

  if (input.rsi14 !== null) {
    if (input.rsi14 < 35) {
      score += 0.6;
    } else if (input.rsi14 > 65) {
      score -= 0.6;
    } else if (input.rsi14 >= 45 && input.rsi14 <= 58) {
      score += 0.2;
    }
  }

  if (input.breakoutPositionPct !== null) {
    if (input.breakoutPositionPct > 65) {
      score += 0.5;
    } else if (input.breakoutPositionPct < 35) {
      score -= 0.5;
    }
  }

  if (input.vwapPremiumPct > 0.1) {
    score += 0.3;
  } else if (input.vwapPremiumPct < -0.1) {
    score -= 0.3;
  }

  if (input.spreadBps > 3) {
    score -= 0.4;
  }

  if (input.realizedVolPct !== null && input.realizedVolPct > 2.5) {
    score -= 0.2;
  }

  return score;
}

function computeExpectedEdgeBps(input: {
  signalScore: number;
  trendStrengthBps: number | null;
  breakoutPositionPct: number | null;
  vwapPremiumPct: number;
  regimeConfidence: number;
  realizedVolPct: number | null;
}): number {
  const signalContribution = Math.max(0, Math.abs(input.signalScore)) * 4.8;
  const trendContribution = input.trendStrengthBps === null
    ? 0
    : Math.min(28, input.trendStrengthBps * 0.75);
  const breakoutContribution = input.breakoutPositionPct === null
    ? 0
    : Math.max(0, Math.abs(input.breakoutPositionPct - 50) * 0.26);
  const vwapContribution = Math.min(14, Math.abs(input.vwapPremiumPct) * 105);
  const regimeContribution = Math.max(0, Math.min(6, (input.regimeConfidence - 0.5) * 16));
  const volatilityPenalty = input.realizedVolPct === null
    ? 0
    : input.realizedVolPct > 3.0
      ? (input.realizedVolPct - 3.0) * 2.8
      : 0;

  return Math.max(0, signalContribution + trendContribution + breakoutContribution + vwapContribution + regimeContribution - volatilityPenalty);
}

function classifyMarketRegime(input: {
  bias: IndicatorBias;
  realizedVolPct: number | null;
  trendStrengthBps: number | null;
  breakoutPositionPct: number | null;
}): { label: MarketRegime; confidence: number } {
  const volatility = input.realizedVolPct ?? 0;
  const trend = input.trendStrengthBps ?? 0;

  if (volatility >= 2.8 && trend < 8) {
    return {
      label: "volatile-chop",
      confidence: clamp(0.58 + (Math.min(volatility, 5) - 2.8) * 0.1, 0.45, 0.92),
    };
  }

  if (input.bias === "bullish" && trend >= 6) {
    const breakoutBias = input.breakoutPositionPct === null ? 0 : Math.max(0, (input.breakoutPositionPct - 50) / 50);
    return {
      label: "trend-up",
      confidence: clamp(0.56 + Math.min(0.26, trend / 75) + (breakoutBias * 0.08), 0.45, 0.94),
    };
  }

  if (input.bias === "bearish" && trend >= 6) {
    const breakoutBias = input.breakoutPositionPct === null ? 0 : Math.max(0, (50 - input.breakoutPositionPct) / 50);
    return {
      label: "trend-down",
      confidence: clamp(0.56 + Math.min(0.26, trend / 75) + (breakoutBias * 0.08), 0.45, 0.94),
    };
  }

  return {
    label: "range",
    confidence: clamp(0.48 + Math.max(0, 2.4 - volatility) * 0.05, 0.35, 0.88),
  };
}

function computeConfidenceHint(signalScore: number, trendStrengthBps: number | null, sampleCount: number): number {
  const trendContribution = trendStrengthBps === null
    ? 0
    : Math.min(0.2, trendStrengthBps / 150);
  const scoreContribution = Math.min(0.28, Math.abs(signalScore) / 8);

  let confidence = 0.46 + trendContribution + scoreContribution;
  if (sampleCount < 30) {
    confidence -= 0.08;
  }

  return clamp(confidence, 0.35, 0.9);
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((acc, value) => acc + value, 0);
  return total / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatNullable(value: number | null, precision: number): string {
  if (value === null || !Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(precision);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function round2OrNull(value: number | null): number | null {
  return value === null ? null : round2(value);
}

function round4OrNull(value: number | null): number | null {
  return value === null ? null : round4(value);
}

function parseBoundedEnvNumber(name: string, fallback: number, min: number, max: number): number {
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
