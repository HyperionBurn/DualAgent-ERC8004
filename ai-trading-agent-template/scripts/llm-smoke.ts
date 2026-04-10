import * as dotenv from "dotenv";
dotenv.config();

import { MockExchangeClient } from "../src/exchange/mock";
import { runAgentPlanner } from "../src/agent/orchestrator";

async function main() {
  const pair = process.env.TRADING_PAIR || "XBTUSD";
  const market = await new MockExchangeClient().getTicker(pair);

  const result = await runAgentPlanner({
    market,
    pair,
    executionMode: (process.env.EXECUTION_MODE || "mock").toLowerCase(),
    marketMode: (process.env.MARKET_DATA_MODE || process.env.EXECUTION_MODE || "mock").toLowerCase(),
    sandbox: (process.env.KRAKEN_SANDBOX || "true").toLowerCase() !== "false",
    reputationLoop: (process.env.ENABLE_REPUTATION_LOOP || "false").toLowerCase() === "true",
    checkpointsFile: process.env.CHECKPOINTS_FILE,
    fillsFile: process.env.FILLS_FILE,
    recentLimit: Number(process.env.PLANNER_RECENT_LIMIT || "6"),
    maxTradeUsd: Number(process.env.PLANNER_MAX_TRADE_USD || "100"),
    maxSlippageBps: Number(process.env.PLANNER_MAX_SLIPPAGE_BPS || "50"),
  });

  console.log(JSON.stringify({
    pair,
    marketPrice: market.price,
    model: result.model,
    keyLabel: result.keyLabel,
    usedFallback: result.usedFallback,
    decision: result.decision,
    promptVersion: result.plannerResponse.promptVersion,
    toolResults: result.toolResults,
  }, null, 2));
}

main().catch((error) => {
  console.error("[llm-smoke] Failed:", error);
  process.exit(1);
});
