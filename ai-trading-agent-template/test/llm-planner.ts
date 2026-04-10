import { expect } from "chai";
import { buildMarketSnapshot } from "../src/tools/market";
import { buildRiskSnapshot } from "../src/tools/risk";
import { plannerResponseToTradeDecision, validatePlannerResponse } from "../src/llm/schemas";

describe("LLM planner schema", function () {
  it("accepts a valid response and maps it to a trade decision", function () {
    const response = {
      version: 1,
      promptVersion: "2026-04-03-groq",
      pair: "XBTUSD",
      asset: "XBT",
      action: "BUY",
      amountUsd: 125,
      confidence: 0.82,
      reasoning: "Momentum and liquidity look acceptable.",
      riskNotes: ["spread is tight"],
      toolCalls: [],
      shouldExecute: true,
      maxSlippageBps: 50,
      deadlineSeconds: 300,
    };

    const result = validatePlannerResponse(response);
    expect(result.ok).to.equal(true);
    expect(result.value).to.not.equal(undefined);

    const decision = plannerResponseToTradeDecision(result.value!);
    expect(decision.action).to.equal("BUY");
    expect(decision.amount).to.equal(125);
  });

  it("accepts and ignores extra fields", function () {
    const result = validatePlannerResponse({
      version: 1,
      promptVersion: "2026-04-03-groq",
      pair: "XBTUSD",
      asset: "XBT",
      action: "HOLD",
      amountUsd: 0,
      confidence: 0.5,
      reasoning: "Hold.",
      riskNotes: [],
      toolCalls: [],
      shouldExecute: false,
      maxSlippageBps: 50,
      deadlineSeconds: 300,
      extra: true,
    });

    expect(result.ok).to.equal(true);
    expect(result.value).to.not.equal(undefined);
    expect(result.value!.action).to.equal("HOLD");
  });

  it("rejects non-positive deadlineSeconds", function () {
    const result = validatePlannerResponse({
      version: 1,
      promptVersion: "2026-04-03-groq",
      pair: "XBTUSD",
      asset: "XBT",
      action: "HOLD",
      amountUsd: 0,
      confidence: 0.5,
      reasoning: "Hold.",
      riskNotes: [],
      toolCalls: [],
      shouldExecute: false,
      maxSlippageBps: 50,
      deadlineSeconds: 0,
    });

    expect(result.ok).to.equal(false);
    expect(result.errors).to.include("deadlineSeconds must be a positive number");
  });

  it("normalizes the Groq planner preview wrapper", function () {
    const result = validatePlannerResponse({
      planner: {
        action: "PAPER_PREVIEW",
        amount: 50,
        confidence: 60,
        context: "XBTUSD",
        description: "Modest paper trade to test favorable setup",
        execution: {
          mode: "kraken",
          action: "BUY",
          amount: 50,
          volume: 0,
          order: "buy 0.00000000 XBTUSD",
        },
        risk: {
          maxTrade: 100,
          maxSlippage: 50,
          netNotional: 0,
        },
        tools: {},
      },
    });

    expect(result.ok).to.equal(true);
    expect(result.value).to.not.equal(undefined);
    expect(result.value!.action).to.equal("BUY");
    expect(result.value!.pair).to.equal("XBTUSD");
    expect(result.value!.amountUsd).to.equal(50);
    expect(result.value!.confidence).to.equal(0.6);
    expect(result.value!.shouldExecute).to.equal(true);
  });

  it("normalizes the Groq flat BUY response", function () {
    const result = validatePlannerResponse({
      action: "BUY",
      amount: 50,
      volume: 0.000775,
      confidence: 60,
      notes: "Paper trade with modest risk exposure",
    }, "XBTUSD");

    expect(result.ok).to.equal(true);
    expect(result.value).to.not.equal(undefined);
    expect(result.value!.action).to.equal("BUY");
    expect(result.value!.pair).to.equal("XBTUSD");
    expect(result.value!.amountUsd).to.equal(50);
    expect(result.value!.confidence).to.equal(0.6);
    expect(result.value!.reasoning).to.equal("Paper trade with modest risk exposure");
    expect(result.value!.shouldExecute).to.equal(true);
  });

  it("normalizes a terse Groq BUY response without reasoning", function () {
    const result = validatePlannerResponse({
      action: "BUY",
      amount: 50,
      confidence: 80,
    }, "XBTUSD");

    expect(result.ok).to.equal(true);
    expect(result.value).to.not.equal(undefined);
    expect(result.value!.action).to.equal("BUY");
    expect(result.value!.pair).to.equal("XBTUSD");
    expect(result.value!.amountUsd).to.equal(50);
    expect(result.value!.confidence).to.equal(0.8);
    expect(result.value!.reasoning).to.equal("Planner returned a BUY proposal without an explicit rationale.");
    expect(result.value!.shouldExecute).to.equal(true);
  });

  it("builds market and risk snapshots for prompt context", function () {
    const marketSnapshot = buildMarketSnapshot({
      pair: "XBTUSD",
      price: 65000,
      bid: 64995,
      ask: 65005,
      volume: 500,
      vwap: 64990,
      high: 65600,
      low: 64400,
      timestamp: Date.now(),
    });

    const riskSnapshot = buildRiskSnapshot({
      executionMode: "mock",
      marketMode: "kraken",
      sandbox: true,
      reputationLoop: false,
    });

    expect(marketSnapshot.spreadBps).to.be.greaterThan(0);
    expect(riskSnapshot.guardrailNotes.length).to.be.greaterThan(0);
  });
});
