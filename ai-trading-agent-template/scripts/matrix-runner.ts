import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";

const TS_NODE_BIN = require.resolve("ts-node/dist/bin.js");

const RUN_WINDOW_ARTIFACT_FILES = [
  "checkpoints.jsonl",
  "fills.jsonl",
  "planner-traces.jsonl",
  "metrics.json",
  "replay-summary.json",
  "evaluation-results.json",
  "winner-run.json",
  "equity-report.json",
  "phase2-evidence.json",
  "submission-manifest.json",
];

interface MatrixCombo {
  maxTradeUsd: number;
  maxTradesPerHour: number;
  maxSlippageBps: number;
  indicatorLookback: number;
  minTrendStrengthBps: number;
  maxBullishRsi: number;
  minBearishRsi: number;
  minTradeIntervalMs: number;
  minConfidence: number;
  minExpectedEdgeBps: number;
  breakerMaxConsecutiveLosses: number;
  breakerMaxDailyLossUsd: number;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

function parseNumberList(value: string | undefined, fallback: number[]): number[] {
  if (!value || !value.trim()) {
    return fallback;
  }

  const parsed = value
    .split(",")
    .map((entry) => Number(entry.trim()))
    .filter((entry) => Number.isFinite(entry));

  if (parsed.length === 0) {
    return fallback;
  }

  const seen = new Set<number>();
  const unique: number[] = [];
  for (const valueEntry of parsed) {
    if (!seen.has(valueEntry)) {
      seen.add(valueEntry);
      unique.push(valueEntry);
    }
  }

  return unique;
}

function cartesianProduct(values: {
  maxTradeUsd: number[];
  maxTradesPerHour: number[];
  maxSlippageBps: number[];
  indicatorLookback: number[];
  minTrendStrengthBps: number[];
  maxBullishRsi: number[];
  minBearishRsi: number[];
  minTradeIntervalMs: number[];
  minConfidence: number[];
  minExpectedEdgeBps: number[];
  breakerMaxConsecutiveLosses: number[];
  breakerMaxDailyLossUsd: number[];
}): MatrixCombo[] {
  const combos: MatrixCombo[] = [];
  for (const maxTradeUsd of values.maxTradeUsd) {
    for (const maxTradesPerHour of values.maxTradesPerHour) {
      for (const maxSlippageBps of values.maxSlippageBps) {
        for (const indicatorLookback of values.indicatorLookback) {
          for (const minTrendStrengthBps of values.minTrendStrengthBps) {
            for (const maxBullishRsi of values.maxBullishRsi) {
              for (const minBearishRsi of values.minBearishRsi) {
                for (const minTradeIntervalMs of values.minTradeIntervalMs) {
                  for (const minConfidence of values.minConfidence) {
                    for (const minExpectedEdgeBps of values.minExpectedEdgeBps) {
                      for (const breakerMaxConsecutiveLosses of values.breakerMaxConsecutiveLosses) {
                        for (const breakerMaxDailyLossUsd of values.breakerMaxDailyLossUsd) {
                          combos.push({
                            maxTradeUsd,
                            maxTradesPerHour,
                            maxSlippageBps,
                            indicatorLookback,
                            minTrendStrengthBps,
                            maxBullishRsi,
                            minBearishRsi,
                            minTradeIntervalMs,
                            minConfidence,
                            minExpectedEdgeBps,
                            breakerMaxConsecutiveLosses,
                            breakerMaxDailyLossUsd,
                          });
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return combos;
}

function removeFileIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function resetRunWindowArtifacts(cwd: string, preserveFiles: Set<string>): void {
  for (const fileName of RUN_WINDOW_ARTIFACT_FILES) {
    if (preserveFiles.has(fileName)) {
      continue;
    }
    removeFileIfExists(path.join(cwd, fileName));
  }
}

function cleanRunSummariesByPrefix(cwd: string, labelPrefix: string): void {
  const runsDir = path.join(cwd, "artifacts", "runs");
  if (!fs.existsSync(runsDir)) {
    return;
  }

  const prefix = `${labelPrefix}-`;
  for (const entry of fs.readdirSync(runsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith(prefix)) {
      continue;
    }
    fs.rmSync(path.join(runsDir, entry.name), { recursive: true, force: true });
  }
}

function buildChildEnv(envOverrides: Record<string, string>): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") {
      childEnv[key] = value;
    }
  }

  for (const [key, value] of Object.entries(envOverrides)) {
    if (typeof value === "string") {
      childEnv[key] = value;
    }
  }

  return childEnv;
}

function runTsScript(scriptFile: string, envOverrides: Record<string, string>): void {
  const childEnv = buildChildEnv(envOverrides);
  const result = spawnSync(
    process.execPath,
    [TS_NODE_BIN, scriptFile],
    {
      stdio: "inherit",
      cwd: process.cwd(),
      env: childEnv,
    }
  );

  if (result.error) {
    throw new Error(
      `[matrix-runner] Failed to spawn ${scriptFile}: ${result.error.message}`
    );
  }

  if (result.status !== 0) {
    const signalSuffix = result.signal ? ` (signal: ${result.signal})` : "";
    throw new Error(
      `[matrix-runner] ${scriptFile} exited with code ${result.status ?? -1}${signalSuffix}`
    );
  }
}

async function main() {
  const cwd = process.cwd();
  const matrixProfile = {
    maxTradeUsd: parseNumberList(process.env.MATRIX_MAX_TRADE_USD_VALUES, [40, 55, 70]),
    maxTradesPerHour: parseNumberList(process.env.MATRIX_MAX_TRADES_PER_HOUR_VALUES, [4, 6, 8]),
    maxSlippageBps: parseNumberList(process.env.MATRIX_MAX_SLIPPAGE_BPS_VALUES, [30, 50]),
    indicatorLookback: parseNumberList(process.env.MATRIX_INDICATOR_LOOKBACK_VALUES, [70, 90, 110]),
    minTrendStrengthBps: parseNumberList(process.env.MATRIX_MIN_TREND_BPS_VALUES, [1, 2, 4]),
    maxBullishRsi: parseNumberList(process.env.MATRIX_MAX_BULLISH_RSI_VALUES, [68, 72, 76]),
    minBearishRsi: parseNumberList(process.env.MATRIX_MIN_BEARISH_RSI_VALUES, [24, 28, 32]),
    minTradeIntervalMs: parseNumberList(process.env.MATRIX_MIN_TRADE_INTERVAL_MS_VALUES, [15_000, 20_000, 30_000]),
    minConfidence: parseNumberList(process.env.MATRIX_MIN_CONFIDENCE_VALUES, [0.52, 0.58, 0.64]),
    minExpectedEdgeBps: parseNumberList(process.env.MATRIX_MIN_EXPECTED_EDGE_BPS_VALUES, [2, 4, 6]),
    breakerMaxConsecutiveLosses: parseNumberList(process.env.MATRIX_BREAKER_MAX_CONSECUTIVE_LOSSES_VALUES, [2, 3, 4]),
    breakerMaxDailyLossUsd: parseNumberList(process.env.MATRIX_BREAKER_MAX_DAILY_LOSS_USD_VALUES, [150, 200, 300]),
  };

  const maxRuns = Math.max(1, Math.floor(parseNumber(process.env.MATRIX_MAX_RUNS, 40)));
  const ticksPerRun = Math.max(1, Math.floor(parseNumber(process.env.MATRIX_TICKS_PER_RUN, 40)));
  const labelPrefix = (process.env.MATRIX_RUN_LABEL_PREFIX || "rank1").trim() || "rank1";
  const continueOnError = parseBoolean(process.env.MATRIX_CONTINUE_ON_ERROR, true);
  const seedReputation = parseBoolean(process.env.MATRIX_SEED_REPUTATION, false);
  const finalizeSubmission = parseBoolean(process.env.MATRIX_FINALIZE_SUBMISSION, false);
  const resetArtifactsPerRun = parseBoolean(process.env.MATRIX_RESET_ARTIFACTS, true);
  const cleanPrefixRunSummaries = parseBoolean(process.env.MATRIX_CLEAN_PREFIX_RUNS, true);
  const preserveReputationEvidence = parseBoolean(process.env.MATRIX_PRESERVE_REPUTATION_EVIDENCE, true);

  const allCombos = cartesianProduct(matrixProfile);
  const plannedCombos = allCombos.slice(0, maxRuns);

  if (plannedCombos.length === 0) {
    throw new Error("[matrix-runner] No parameter combinations were generated");
  }

  console.log("\nRank-1 Matrix Runner");
  console.log("====================");
  console.log(`Planned combinations: ${plannedCombos.length}/${allCombos.length}`);
  console.log(`Ticks per run:        ${ticksPerRun}`);
  console.log(`Continue on error:    ${continueOnError}`);
  console.log(`Seed reputation:      ${seedReputation}`);
  console.log(`Finalize submission:  ${finalizeSubmission}`);
  console.log(`Reset artifacts/run:  ${resetArtifactsPerRun}`);
  console.log(`Clean prefix runs:    ${cleanPrefixRunSummaries}`);

  if (seedReputation) {
    console.log("\n[pre] Seeding reputation evidence...");
    runTsScript("scripts/seed-reputation.ts", {});
  }

  if (cleanPrefixRunSummaries) {
    cleanRunSummariesByPrefix(cwd, labelPrefix);
  }

  let completedRuns = 0;
  for (let index = 0; index < plannedCombos.length; index += 1) {
    const combo = plannedCombos[index];
    const runLabel = `${labelPrefix}-${String(index + 1).padStart(3, "0")}`;

    if (resetArtifactsPerRun) {
      const preserveFiles = new Set<string>();
      if (preserveReputationEvidence) {
        preserveFiles.add("reputation-feedback.jsonl");
      }
      resetRunWindowArtifacts(cwd, preserveFiles);
    }

    const minNetEdgeBps = Math.max(0, combo.minExpectedEdgeBps - 1);
    const envOverrides: Record<string, string> = {
      TRADING_STRATEGY: (process.env.TRADING_STRATEGY || "indicator").trim() || "indicator",
      RUN_LABEL: runLabel,
      PLANNER_MAX_TRADE_USD: String(combo.maxTradeUsd),
      PLANNER_MAX_TRADES_PER_HOUR: String(combo.maxTradesPerHour),
      PLANNER_MAX_SLIPPAGE_BPS: String(combo.maxSlippageBps),
      PLANNER_INDICATOR_LOOKBACK: String(combo.indicatorLookback),
      INDICATOR_MIN_TREND_BPS: String(combo.minTrendStrengthBps),
      INDICATOR_MAX_BULLISH_RSI: String(combo.maxBullishRsi),
      INDICATOR_MIN_BEARISH_RSI: String(combo.minBearishRsi),
      INDICATOR_MIN_TRADE_INTERVAL_MS: String(combo.minTradeIntervalMs),
      PLANNER_MIN_CONFIDENCE: String(combo.minConfidence),
      PLANNER_MIN_EXPECTED_EDGE_BPS: String(combo.minExpectedEdgeBps),
      INDICATOR_MIN_NET_EDGE_BPS: String(Math.max(0, combo.minExpectedEdgeBps)),
      DUAL_GATE_MIN_NET_EDGE_BPS: String(minNetEdgeBps),
      BREAKER_MAX_CONSECUTIVE_LOSSES: String(combo.breakerMaxConsecutiveLosses),
      BREAKER_MAX_DAILY_LOSS_USD: String(combo.breakerMaxDailyLossUsd),
      RUN_AGENT_TICKS: String(ticksPerRun),
    };

    console.log(`\n[run ${index + 1}/${plannedCombos.length}] ${runLabel}`);
    console.log(`  maxTradeUsd=${combo.maxTradeUsd} maxTradesPerHour=${combo.maxTradesPerHour} maxSlippageBps=${combo.maxSlippageBps}`);
    console.log(`  lookback=${combo.indicatorLookback} minTrendStrengthBps=${combo.minTrendStrengthBps} maxBullishRsi=${combo.maxBullishRsi} minBearishRsi=${combo.minBearishRsi} minTradeIntervalMs=${combo.minTradeIntervalMs}`);
    console.log(`  minConfidence=${combo.minConfidence} minExpectedEdgeBps=${combo.minExpectedEdgeBps} breakerLosses=${combo.breakerMaxConsecutiveLosses} breakerDailyLoss=${combo.breakerMaxDailyLossUsd}`);

    try {
      runTsScript("scripts/run-agent.ts", envOverrides);
      runTsScript("scripts/metrics.ts", envOverrides);
      runTsScript("scripts/replay.ts", envOverrides);
      runTsScript("scripts/report-equity.ts", envOverrides);
      runTsScript("scripts/phase2-evidence.ts", envOverrides);
      runTsScript("scripts/evaluate.ts", envOverrides);
      completedRuns += 1;
    } catch (error) {
      console.error(`[matrix-runner] Run ${runLabel} failed:`, error instanceof Error ? error.message : String(error));
      if (!continueOnError) {
        throw error;
      }
    }
  }

  console.log(`\nCompleted runs: ${completedRuns}/${plannedCombos.length}`);

  if (finalizeSubmission) {
    console.log("\n[finalize] Regenerating strict submission manifest...");
    runTsScript("scripts/submission-manifest.ts", {});
  }

  console.log("\n[matrix-runner] Done");
}

main().catch((error) => {
  console.error("[matrix-runner] Failed:", error);
  process.exit(1);
});
