import { expect } from "chai";
import { createRegimeSizingDecisionContext, evaluateRegimeAwareSizing, formatRegimeSizingSummary } from "../src/agent/regime-sizing";
import type { DecisionContext } from "../src/types/index";

describe("regime-aware sizing", function () {
  it("expands size in a strong trend regime", function () {
    const policy = evaluateRegimeAwareSizing({
      indicatorSnapshot: {
        regimeLabel: "trend-up",
        regimeConfidence: 0.86,
        trendStrengthBps: 3.4,
        spreadBps: 1.1,
        vwapPremiumPct: 0.12,
        realizedVolPct: 1.3,
      },
      currentAmountUsd: 100,
    });

    expect(policy.status).to.equal("expanded");
    expect(policy.multiplier).to.be.greaterThan(1);
    expect(policy.multiplier).to.be.lessThan(1.35);
  });

  it("holds near full size for a stable regime setup", function () {
    const policy = evaluateRegimeAwareSizing({
      indicatorSnapshot: {
        regimeLabel: "trend-up",
        regimeConfidence: 0.66,
        trendStrengthBps: 0.5,
        spreadBps: 3,
        vwapPremiumPct: 0.01,
        realizedVolPct: 1,
      },
      currentAmountUsd: 100,
    });

    expect(policy.status).to.equal("held");
    expect(policy.multiplier).to.be.greaterThan(0.97);
    expect(policy.multiplier).to.be.lessThan(1.03);
  });

  it("reduces size in volatile chop", function () {
    const policy = evaluateRegimeAwareSizing({
      indicatorSnapshot: {
        regimeLabel: "volatile-chop",
        regimeConfidence: 0.52,
        trendStrengthBps: 0.3,
        spreadBps: 4.8,
        vwapPremiumPct: -0.18,
        realizedVolPct: 4.4,
      },
      currentAmountUsd: 100,
    });

    expect(policy.status).to.equal("reduced");
    expect(policy.multiplier).to.be.lessThan(0.9);
    expect(policy.reason).to.contain("volatile-chop");
  });

  it("surfaces the regime sizing context", function () {
    const policy = evaluateRegimeAwareSizing({
      indicatorSnapshot: {
        regimeLabel: "range",
        regimeConfidence: 0.58,
        trendStrengthBps: 1.4,
        spreadBps: 2.1,
        vwapPremiumPct: 0.02,
        realizedVolPct: 1.8,
      },
      currentAmountUsd: 75,
    });

    const context: DecisionContext = createRegimeSizingDecisionContext({ riskGateStatus: "pre-check" }, policy);
    expect(context.regimeSizingStatus).to.equal(policy.status);
    expect(context.regimeSizingMultiplier).to.equal(policy.multiplier);
    expect(formatRegimeSizingSummary(policy)).to.contain("regimeSizing=");
  });
});
