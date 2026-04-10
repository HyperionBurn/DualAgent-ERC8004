import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { buildScoreStory } from "../src/metrics/index";

function optionalBigInt(value: string | undefined): bigint | undefined {
  if (!value) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function countDistinctReputationRaters(filePath: string): number {
  if (!fs.existsSync(filePath)) {
    return 0;
  }

  const raters = new Set<string>();
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    try {
      const row = JSON.parse(trimmed) as { rater?: unknown };
      if (typeof row.rater === "string" && row.rater.trim().length > 0) {
        raters.add(row.rater.trim().toLowerCase());
      }
    } catch {
      continue;
    }
  }

  return raters.size;
}

async function main() {
  const cwd = process.cwd();
  const checkpointsFile = path.join(cwd, process.env.CHECKPOINT_FILE || "checkpoints.jsonl");
  const fillsFile = path.join(cwd, process.env.FILLS_FILE || "fills.jsonl");
  const reputationEvidenceFile = path.join(cwd, process.env.REPUTATION_FEEDBACK_FILE || "reputation-feedback.jsonl");
  const outputFile = path.join(cwd, process.env.METRICS_OUTPUT_FILE || "metrics.json");
  const submissionStrict = (process.env.SUBMISSION_STRICT || "false").toLowerCase() === "true";
  const strictRequireReputationRegistry = (process.env.PHASE2_REQUIRE_REPUTATION_REGISTRY || "true").toLowerCase() !== "false";
  const strictMinReputationFeedbackCount = Number(process.env.PHASE2_MIN_REPUTATION_FEEDBACK_COUNT || "6");
  const strictMinDistinctRaters = Number(process.env.PHASE2_MIN_REPUTATION_DISTINCT_RATERS || "3");
  const distinctRaterCount = countDistinctReputationRaters(reputationEvidenceFile);

  const rpcUrl = process.env.SEPOLIA_RPC_URL;
  const validationRegistryAddress = process.env.VALIDATION_REGISTRY_ADDRESS;
  const agentId = optionalBigInt(process.env.AGENT_ID);
  const chainId = Number(process.env.CHAIN_ID || "11155111");
  const useOnchainValidation = Boolean(rpcUrl && validationRegistryAddress && agentId !== undefined);
  const provider = useOnchainValidation
    ? new ethers.JsonRpcProvider(rpcUrl as string, chainId, { staticNetwork: true })
    : undefined;

  const payload = await buildScoreStory({
    checkpointsFile,
    fillsFile,
    mode: process.env.EXECUTION_MODE,
    provider,
    validationRegistryAddress,
    reputationRegistryAddress: process.env.REPUTATION_REGISTRY_ADDRESS,
    reputationEvidenceFile,
    agentId,
    strictAgentId: agentId !== undefined,
  });

  if (submissionStrict && payload.summary.validationSource !== "validation-registry") {
    throw new Error(
      `SUBMISSION_STRICT=true requires validationSource=validation-registry (got ${payload.summary.validationSource})`
    );
  }

  if (submissionStrict && strictRequireReputationRegistry && payload.summary.reputationSource !== "reputation-registry") {
    throw new Error(
      `SUBMISSION_STRICT=true requires reputationSource=reputation-registry (got ${payload.summary.reputationSource})`
    );
  }

  if (submissionStrict && payload.summary.reputationFeedbackCount < strictMinReputationFeedbackCount) {
    throw new Error(
      `SUBMISSION_STRICT=true requires reputationFeedbackCount>=${strictMinReputationFeedbackCount} (got ${payload.summary.reputationFeedbackCount})`
    );
  }

  if (submissionStrict && distinctRaterCount < strictMinDistinctRaters) {
    throw new Error(
      `SUBMISSION_STRICT=true requires distinct reputation raters>=${strictMinDistinctRaters} (got ${distinctRaterCount})`
    );
  }

  fs.writeFileSync(outputFile, JSON.stringify(payload, null, 2));

  console.log("\nScore Story Metrics");
  console.log("===================");
  console.log(`Agent ID:             ${payload.summary.agentId}`);
  console.log(`Mode:                 ${payload.summary.mode}`);
  console.log(`Net PnL:              $${payload.summary.netPnlUsd.toFixed(2)}`);
  console.log(`Max Drawdown:         ${payload.summary.maxDrawdownBps} bps`);
  console.log(`Composite Score:      ${payload.summary.compositeScore.toFixed(2)}`);
  console.log(`Risk-Adj PnL Score:   ${payload.summary.riskAdjustedProfitabilityScore.toFixed(2)}`);
  console.log(`Drawdown Score:       ${payload.summary.drawdownControlScore.toFixed(2)}`);
  console.log(`Validation Score:     ${payload.summary.averageValidationScore.toFixed(2)} (${payload.summary.validationSource})`);
  console.log(`Reputation Score:     ${payload.summary.averageReputationScore.toFixed(2)} (${payload.summary.reputationSource})`);
  console.log(`Reputation Feedbacks: ${payload.summary.reputationFeedbackCount}`);
  console.log(`Distinct Raters:      ${distinctRaterCount}`);
  console.log(`Fresh Window:         ${payload.summary.freshScoreWindowRecommended ? "recommended" : "keep-current"}`);
  console.log(`Window Reason:        ${payload.summary.freshScoreWindowReason}`);
  console.log(`Latest Validation:    ${payload.summary.latestValidationSignalSummary}`);
  console.log(`Checkpoints:          ${payload.summary.checkpointCount}`);
  console.log(`Fills:                ${payload.summary.fillCount}`);
  console.log(`Recent Flow:          ${payload.summary.recentFlow}`);
  console.log(`\nWrote: ${outputFile}\n`);
}

main().catch((error) => {
  console.error("[metrics] Failed to compute score story:", error);
  process.exit(1);
});
