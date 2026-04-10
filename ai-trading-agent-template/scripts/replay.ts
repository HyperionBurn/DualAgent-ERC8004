import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { buildScoreStory, loadCheckpoints, loadFills } from "../src/metrics/index";

function optionalBigInt(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

interface PlannerTrace {
  timestamp: number;
  pair: string;
  priceUsd: number;
  model: string;
  keyLabel: string;
  usedFallback: boolean;
  decision: { action: string; amount: number; confidence: number; reasoning: string };
  promptVersion?: string;
  toolResults?: string;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveRunLabel(): string {
  const configured = (process.env.RUN_LABEL || process.env.MATRIX_RUN_LABEL || "").trim();
  if (configured) {
    return configured;
  }
  return new Date().toISOString().replace(/[.:]/g, "-");
}

function readJsonLines<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) {
    return [];
  }

  return raw
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((value): value is T => value !== null);
}

async function main() {
  const cwd = process.cwd();
  const checkpointsFile = path.join(cwd, "checkpoints.jsonl");
  const fillsFile = path.join(cwd, "fills.jsonl");
  const plannerTracesFile = path.join(cwd, "planner-traces.jsonl");
  const replaySummaryFile = path.join(cwd, "replay-summary.json");
  const submissionStrict = (process.env.SUBMISSION_STRICT || "false").toLowerCase() === "true";
  const agentId = optionalBigInt(process.env.AGENT_ID);
  const runLabel = resolveRunLabel();
  const parameterSnapshot = {
    maxTradeUsd: parseNumber(process.env.PLANNER_MAX_TRADE_USD, 100),
    maxTradesPerHour: parseNumber(process.env.PLANNER_MAX_TRADES_PER_HOUR, 6),
    maxSlippageBps: parseNumber(process.env.PLANNER_MAX_SLIPPAGE_BPS, 50),
    minConfidence: parseNumber(process.env.PLANNER_MIN_CONFIDENCE, 0.6),
  };

  if (submissionStrict && agentId === undefined) {
    throw new Error("SUBMISSION_STRICT=true requires AGENT_ID to be set");
  }

  const checkpoints = loadCheckpoints(checkpointsFile);
  const fills = loadFills(fillsFile);
  const traces = readJsonLines<PlannerTrace>(plannerTracesFile);
  const scoreStory = await buildScoreStory({
    checkpointsFile,
    fillsFile,
    mode: process.env.EXECUTION_MODE,
    recentLimit: 10,
    agentId,
    strictAgentId: submissionStrict || agentId !== undefined,
  });

  console.log("Replay Summary");
  console.log("==============");
  console.log(`Run Label:   ${runLabel}`);
  console.log(`Checkpoints: ${checkpoints.length}`);
  console.log(`Fills:       ${fills.length}`);
  console.log(`Traces:      ${traces.length}`);
  console.log(`Net PnL:     $${scoreStory.summary.netPnlUsd.toFixed(2)}`);
  console.log(`Drawdown:    ${scoreStory.summary.maxDrawdownBps} bps`);
  console.log(`Recent Flow:  ${scoreStory.summary.recentFlow}`);

  if (traces.length > 0) {
    console.log("\nRecent Planner Traces");
    console.log("=====================");
    traces.slice(-5).forEach((trace) => {
      console.log(
        `${new Date(trace.timestamp * 1000).toISOString()} | ${trace.model} | key=${trace.keyLabel} | ${trace.decision.action} ${trace.pair} | fallback=${trace.usedFallback}`
      );
    });
  }

  const fallbackCount = traces.filter((trace) => trace.usedFallback).length;
  const fallbackRatePct = traces.length > 0
    ? Math.round((fallbackCount / traces.length) * 10_000) / 100
    : 0;
  const replaySummary = {
    generatedAt: new Date().toISOString(),
    runLabel,
    parameters: parameterSnapshot,
    counts: {
      checkpoints: checkpoints.length,
      fills: fills.length,
      traces: traces.length,
      fallbackCount,
      fallbackRatePct,
    },
    scoreSummary: {
      agentId: scoreStory.summary.agentId,
      netPnlUsd: scoreStory.summary.netPnlUsd,
      maxDrawdownBps: scoreStory.summary.maxDrawdownBps,
      compositeScore: scoreStory.summary.compositeScore,
      validationSource: scoreStory.summary.validationSource,
      reputationSource: scoreStory.summary.reputationSource,
      reputationFeedbackCount: scoreStory.summary.reputationFeedbackCount,
      checkpointCount: scoreStory.summary.checkpointCount,
      fillCount: scoreStory.summary.fillCount,
      recentFlow: scoreStory.summary.recentFlow,
    },
  };
  fs.writeFileSync(replaySummaryFile, JSON.stringify(replaySummary, null, 2));
  console.log(`\nWrote:      ${replaySummaryFile}`);
}

main().catch((error) => {
  console.error("[replay] Failed:", error);
  process.exit(1);
});
