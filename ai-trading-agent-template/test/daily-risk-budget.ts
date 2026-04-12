import { expect } from "chai";
import { createDailyBudgetDecisionContext, evaluateDailyRiskBudget, formatDailyRiskBudgetSummary } from "../src/agent/daily-risk-budget";
import type { DecisionContext } from "../src/types/index";

describe("daily risk budget policy", function () {
  it("stays healthy when daily loss is comfortably below the threshold", function () {
    const policy = evaluateDailyRiskBudget({
      maxDailyLossUsd: 100,
      dailyLossUsd: 25,
      breakerActive: false,
      breakerReason: null,
      consecutiveLosses: 0,
      cppiScale: 1,
      volatilityThrottleActive: false,
      volatilityPct: null,
    });

    expect(policy.status).to.equal("healthy");
    expect(policy.multiplier).to.equal(1);
    expect(policy.remainingBudgetUsd).to.equal(75);
    expect(policy.utilizationPct).to.equal(0.25);
  });

  it("throttles as the daily budget approaches exhaustion", function () {
    const policy = evaluateDailyRiskBudget({
      maxDailyLossUsd: 100,
      dailyLossUsd: 72,
      breakerActive: false,
      breakerReason: null,
      consecutiveLosses: 1,
      cppiScale: 0.9,
      volatilityThrottleActive: true,
      volatilityPct: 3.1,
    });

    expect(policy.status).to.equal("throttled");
    expect(policy.multiplier).to.be.lessThan(1);
    expect(policy.multiplier).to.be.greaterThan(0.15);
    expect(policy.reason).to.contain("daily budget");
  });

  it("blocks once the daily budget is exhausted or the breaker is active", function () {
    const exhausted = evaluateDailyRiskBudget({
      maxDailyLossUsd: 100,
      dailyLossUsd: 100,
      breakerActive: false,
      breakerReason: null,
      consecutiveLosses: 3,
      cppiScale: 0.4,
      volatilityThrottleActive: false,
      volatilityPct: null,
    });

    const breakerBlocked = evaluateDailyRiskBudget({
      maxDailyLossUsd: 100,
      dailyLossUsd: 40,
      breakerActive: true,
      breakerReason: "loss-streak-3",
      consecutiveLosses: 3,
      cppiScale: 0.4,
      volatilityThrottleActive: false,
      volatilityPct: null,
    });

    expect(exhausted.status).to.equal("blocked");
    expect(exhausted.multiplier).to.equal(0);
    expect(breakerBlocked.status).to.equal("blocked");
    expect(breakerBlocked.reason).to.contain("breaker:");
  });

  it("surfaces the budget context in a summary and decision context", function () {
    const policy = evaluateDailyRiskBudget({
      maxDailyLossUsd: 100,
      dailyLossUsd: 60,
      breakerActive: false,
      breakerReason: null,
      consecutiveLosses: 0,
      cppiScale: 1,
      volatilityThrottleActive: false,
      volatilityPct: null,
    });

    const baseContext: DecisionContext = { riskGateStatus: "pre-check" };
    const context = createDailyBudgetDecisionContext(baseContext, policy, 100);

    expect(context.dailyBudgetStatus).to.equal(policy.status);
    expect(context.dailyBudgetLimitUsd).to.equal(100);
    expect(formatDailyRiskBudgetSummary(policy)).to.contain("dailyBudget=");
  });
});
