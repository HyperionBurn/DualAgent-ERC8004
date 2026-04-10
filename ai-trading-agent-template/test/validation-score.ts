import { expect } from "chai";
import { computeValidationAttestationScore } from "../src/agent/validation-score";
import type { TradeDecision } from "../src/types/index";

function buildDecision(overrides: Partial<TradeDecision> = {}): TradeDecision {
  return {
    action: "BUY",
    asset: "XBT",
    pair: "XBTUSD",
    amount: 100,
    confidence: 0.7,
    reasoning: "test decision",
    decisionContext: {
      netEdgeBps: 14,
      edgeThresholdBps: 8,
      riskGateStatus: "clear",
    },
    ...overrides,
  };
}

describe("validation attestation score", function () {
  it("rewards coherent executed trades", function () {
    const outcome = computeValidationAttestationScore({
      decision: buildDecision(),
      fillExecuted: true,
      defaultEdgeThresholdBps: 8,
    });

    expect(outcome.score).to.be.greaterThan(70);
    expect(outcome.score).to.be.lessThan(100);
  });

  it("keeps blocked HOLD decisions in bounded range", function () {
    const outcome = computeValidationAttestationScore({
      decision: buildDecision({
        action: "HOLD",
        amount: 0,
        confidence: 0.49,
        decisionContext: {
          netEdgeBps: 6,
          edgeThresholdBps: 8,
          riskGateStatus: "breaker:loss-streak-3",
        },
      }),
      fillExecuted: false,
      defaultEdgeThresholdBps: 8,
    });

    expect(outcome.score).to.be.greaterThan(45);
    expect(outcome.score).to.be.lessThan(95);
  });
});
