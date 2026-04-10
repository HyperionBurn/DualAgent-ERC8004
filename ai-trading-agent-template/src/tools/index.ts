import { PlannerToolCall } from "../llm/schemas";
import { MarketData, TradeDecision } from "../types/index";
import { buildMarketSnapshot, renderMarketSnapshot } from "./market";
import { buildRiskSnapshot, renderRiskSnapshot } from "./risk";
import { buildRecentMemorySnapshot, renderRecentMemorySnapshot } from "./memory";
import { buildPaperExecutionPreview, renderPaperExecutionPreview } from "./execution";
import { buildCheckpointSnapshot, renderCheckpointSnapshot } from "./checkpoints";
import { buildIndicatorSnapshot, renderIndicatorSnapshot } from "./indicators";

export interface PlannerToolContext {
  market: MarketData;
  executionMode: string;
  marketMode: string;
  sandbox: boolean;
  reputationLoop: boolean;
  maxTradesPerHour?: number;
  checkpointsFile?: string;
  fillsFile?: string;
  recentLimit?: number;
  currentDecision?: TradeDecision;
}

export function listPlannerToolNames(): string[] {
  return ["market_snapshot", "risk_snapshot", "recent_memory", "paper_preview", "checkpoint_summary", "indicator_snapshot"];
}

export function executePlannerToolCall(call: PlannerToolCall, context: PlannerToolContext): string {
  switch (call.name) {
    case "market_snapshot":
      return renderMarketSnapshot(buildMarketSnapshot(context.market));
    case "risk_snapshot":
      return renderRiskSnapshot(buildRiskSnapshot({
        executionMode: context.executionMode,
        marketMode: context.marketMode,
        sandbox: context.sandbox,
        reputationLoop: context.reputationLoop,
        maxTradesPerHour: context.maxTradesPerHour,
      }));
    case "recent_memory":
      return renderRecentMemorySnapshot(buildRecentMemorySnapshot({
        checkpointsFile: context.checkpointsFile,
        fillsFile: context.fillsFile,
        limit: context.recentLimit,
      }));
    case "paper_preview":
      if (!context.currentDecision) {
        return "paper preview unavailable: no current decision provided";
      }
      return renderPaperExecutionPreview(buildPaperExecutionPreview(context.currentDecision, context.market, context.executionMode));
    case "checkpoint_summary":
      return renderCheckpointSnapshot(buildCheckpointSnapshot(context.checkpointsFile || "checkpoints.jsonl", context.recentLimit));
    case "indicator_snapshot":
      return renderIndicatorSnapshot(buildIndicatorSnapshot({
        market: context.market,
        checkpointsFile: context.checkpointsFile,
      }));
    default:
      return `unsupported tool: ${call.name}`;
  }
}

export function renderToolResults(calls: PlannerToolCall[], context: PlannerToolContext): string {
  if (calls.length === 0) {
    return "No additional tools were requested.";
  }

  return calls.map((call, index) => {
    const result = executePlannerToolCall(call, context);
    return `Tool ${index + 1} (${call.name})\nPurpose: ${call.purpose}\nArgs: ${JSON.stringify(call.arguments)}\nResult: ${result}`;
  }).join("\n\n");
}
