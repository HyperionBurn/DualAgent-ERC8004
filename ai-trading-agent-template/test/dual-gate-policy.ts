import { expect } from "chai";
import { describe, it } from "mocha";
import { applyDualGatePolicy } from "../src/agent/strategy";
import type { IndicatorSnapshot } from "../src/tools/indicators";
import type { TradeDecision } from "../src/types/index";

function buildSnapshot(overrides: Partial<IndicatorSnapshot> = {}): IndicatorSnapshot {
  return {
    sampleCount: 80,
    lookback: 80,
    emaFast: 65010,
    emaSlow: 64950,
    macdLine: 0.1,
    macdSignal: 0.08,
    macdHistogram: 0.02,
    rsi14: 54,
    bollingerMid: 64980,
    bollingerUpper: 65240,
    bollingerLower: 64720,
    bollingerZScore: 0.2,
    breakoutPositionPct: 63,
    realizedVolPct: 1.6,
    spreadBps: 1.2,
    vwapPremiumPct: 0.12,
    trendStrengthBps: 10,
    signalScore: 1.8,
    bias: "bullish",
    regimeLabel: "trend-up",
    regimeConfidence: 0.72,
    expectedEdgeBps: 20,
    costDragBps: 10,
    netEdgeBps: 10,
    netEdgePass: true,
    confidenceHint: 0.72,
    notes: [],
    ...overrides,
  };
}

function buildDecision(overrides: Partial<TradeDecision> = {}): TradeDecision {
  return {
    action: "BUY",
    asset: "XBT",
    pair: "XBTUSD",
    amount: 100,
    confidence: 0.62,
    reasoning: "planner buy signal",
    ...overrides,
  };
}

describe("dual-gate policy", function () {
  it("blocks a trade when deterministic side disagrees and probe is not allowed", function () {
    const snapshot = buildSnapshot({
      bias: "bearish",
      signalScore: -2,
      regimeLabel: "trend-down",
      netEdgeBps: 11,
      netEdgePass: true,
    });

    const result = applyDualGatePolicy({
      decision: buildDecision({ action: "BUY", confidence: 0.45, amount: 120 }),
      indicatorSnapshot: snapshot,
      options: {
        enabled: true,
        minNetEdgeBps: 8,
        probeAmountUsd: 0,
        probeMinConfidence: 0.7,
      },
    });

    expect(result.status).to.equal("blocked");
    expect(result.decision.action).to.equal("HOLD");
    expect(result.decision.amount).to.equal(0);
  });

  it("reduces trade size on agreement when confidence is modest", function () {
    const snapshot = buildSnapshot({
      bias: "bullish",
      signalScore: 1.7,
      netEdgeBps: 9,
      netEdgePass: true,
    });

    const result = applyDualGatePolicy({
      decision: buildDecision({ action: "BUY", confidence: 0.68, amount: 100 }),
      indicatorSnapshot: snapshot,
      options: {
        enabled: true,
        minNetEdgeBps: 8,
        probeAmountUsd: 25,
        probeMinConfidence: 0.66,
      },
    });

    expect(result.agreement).to.equal(true);
    expect(result.decision.action).to.equal("BUY");
    expect(result.decision.amount).to.be.lessThan(100);
    expect(result.status).to.equal("reduced-confidence");
  });
});
