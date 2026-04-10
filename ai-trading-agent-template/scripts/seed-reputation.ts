import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";

function requireEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function readFills(fillsPath: string): Array<{ txid?: string; timestamp?: number }> {
  if (!fs.existsSync(fillsPath)) {
    return [];
  }

  return fs.readFileSync(fillsPath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line) as { txid?: string; timestamp?: number };
      } catch {
        return {};
      }
    });
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const reputationAddress = requireEnv("REPUTATION_REGISTRY_ADDRESS");
  const agentId = BigInt(requireEnv("AGENT_ID"));
  const fundingPerRaterEth = Number(process.env.REPUTATION_SEED_FUNDING_ETH || "0.002");
  const ratingsToSeed = Math.max(1, Number(process.env.REPUTATION_SEED_COUNT || "6"));
  const fixedScoreRaw = (process.env.REPUTATION_FEEDBACK_SCORE || "").trim();
  const fixedScore = fixedScoreRaw ? Number(fixedScoreRaw) : null;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const owner = new ethers.Wallet(privateKey, provider);
  const reputationAbi = [
    "function submitFeedback(uint256 agentId, uint8 score, bytes32 outcomeRef, string comment, uint8 feedbackType) external",
  ] as const;
  const fillsPath = path.join(process.cwd(), process.env.FILLS_FILE || "fills.jsonl");
  const feedbackPath = path.join(process.cwd(), process.env.REPUTATION_FEEDBACK_FILE || "reputation-feedback.jsonl");
  const fills = readFills(fillsPath);

  console.log("\nReputation Seed");
  console.log("===============");
  console.log(`Agent ID: ${agentId.toString()}`);
  console.log(`Owner:    ${owner.address}`);
  console.log(`Seeders:  ${ratingsToSeed}`);
  console.log(`Funding:  ${fundingPerRaterEth} ETH/rater\n`);
  if (fixedScore !== null && Number.isFinite(fixedScore)) {
    console.log(`Fixed score: ${fixedScore}`);
  }

  for (let i = 0; i < ratingsToSeed; i += 1) {
    console.log(`[Loop] i=${i}, creating random wallet...`);
    const rater = ethers.Wallet.createRandom().connect(provider);
    console.log(`[Loop] Wallet created: ${rater.address}`);
    const targetFundingWei = ethers.parseEther(String(fundingPerRaterEth));
    let raterBalance = await provider.getBalance(rater.address);
    console.log(`[Seed ${i+1}] Seeding with rater ${rater.address}`);

    if (raterBalance < ethers.parseEther("0.001")) {
      console.log(`[Seed ${i+1}] Supplying funding to rater...`);
      const fundTx = await owner.sendTransaction({
        to: rater.address,
        value: ethers.parseEther(fundingPerRaterEth.toString()),
      });
      await fundTx.wait();
      raterBalance = await provider.getBalance(rater.address);
    }

    const fill = fills[i];
    const basis = fill
      ? `${fill.txid || "fill"}:${fill.timestamp || Date.now()}:${i}`
      : `manual:${Date.now()}:${i}`;
    const outcomeRef = ethers.keccak256(ethers.toUtf8Bytes(basis));
    const score = fixedScore !== null && Number.isFinite(fixedScore)
      ? Math.max(1, Math.min(100, Math.round(fixedScore)))
      : Math.min(100, 80 + (i * 4));
    const comment = `Objective feedback seed #${i + 1} for step-2-5 run window`;

    const repWithSigner = new ethers.Contract(reputationAddress, reputationAbi, rater) as any;
    console.log(`[Seed ${i+1}] Submitting feedback tx...`);
    const tx = await repWithSigner.submitFeedback(agentId, score, outcomeRef, comment, 3);
    console.log(`[Seed ${i+1}] Tx sent, wait for receipt...`);
    const receipt = await tx.wait();

    const row = {
      timestamp: Math.floor(Date.now() / 1000),
      agentId: agentId.toString(),
      rater: rater.address,
      score,
      feedbackType: "GENERAL",
      outcomeRef,
      txid: fill?.txid || null,
      reputationTxHash: receipt.hash,
      source: "seed-reputation-script",
    };
    fs.appendFileSync(feedbackPath, JSON.stringify(row) + "\n");

    console.log(`seeded ${i + 1}/${ratingsToSeed} | rater=${rater.address} | tx=${receipt.hash}`);
  }

  console.log(`\nWrote: ${feedbackPath}`);
}

main().catch((error) => {
  console.error("[seed-reputation] Failed:", error);
  process.exit(1);
});
