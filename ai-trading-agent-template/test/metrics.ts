import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildScoreStory } from "../src/metrics/index";

function writeJsonLines(filePath: string, rows: unknown[]): void {
  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

describe("metrics score story", function () {
  let tempDir = "";

  beforeEach(function () {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "score-story-"));
  });

  afterEach(function () {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("builds composite score story with reputation feedback evidence", async function () {
    const now = Math.floor(Date.now() / 1000);
    const checkpointsFile = path.join(tempDir, "checkpoints.jsonl");
    const fillsFile = path.join(tempDir, "fills.jsonl");
    const reputationFile = path.join(tempDir, "reputation-feedback.jsonl");

    writeJsonLines(checkpointsFile, [
      {
        agentId: "7",
        timestamp: now - 120,
        action: "BUY",
        asset: "XBT",
        pair: "XBTUSD",
        amountUsd: 100,
        priceUsd: 65000,
        reasoning: "Momentum and spread support a small long.",
        confidence: 0.7,
        intentHash: "0x" + "1".repeat(64),
        signerAddress: "0x" + "2".repeat(40),
        checkpointHash: "0x" + "3".repeat(64),
      },
      {
        agentId: "7",
        timestamp: now - 60,
        action: "HOLD",
        asset: "XBT",
        pair: "XBTUSD",
        amountUsd: 0,
        priceUsd: 65250,
        reasoning: "Edge is moderate; preserve risk budget.",
        confidence: 0.6,
        intentHash: "0x" + "4".repeat(64),
        signerAddress: "0x" + "2".repeat(40),
        checkpointHash: "0x" + "5".repeat(64),
      },
    ]);

    writeJsonLines(fillsFile, [
      {
        timestamp: now - 110,
        agentId: "7",
        pair: "XBTUSD",
        action: "BUY",
        amountUsd: 100,
        priceUsd: 65000,
        volumeBase: 100 / 65000,
        intentHash: "0x" + "1".repeat(64),
        txid: "MOCK-1",
        order: "buy 0.00153846 XBTUSD @ market",
        mode: "mock",
      },
    ]);

    writeJsonLines(reputationFile, [
      {
        timestamp: now - 50,
        agentId: "7",
        score: 80,
        feedbackType: "TRADE_EXECUTION",
        outcomeRef: "0x" + "6".repeat(64),
      },
      {
        timestamp: now - 40,
        agentId: "7",
        score: 60,
        feedbackType: "TRADE_EXECUTION",
        outcomeRef: "0x" + "7".repeat(64),
      },
    ]);

    const payload = await buildScoreStory({
      checkpointsFile,
      fillsFile,
      reputationEvidenceFile: reputationFile,
      baselineCapitalUsd: 10_000,
      mode: "mock",
      recentLimit: 4,
    });

    expect(payload.summary.agentId).to.equal("7");
    expect(payload.summary.reputationSource).to.equal("feedback-log");
    expect(payload.summary.averageReputationScore).to.equal(70);
    expect(payload.summary.reputationFeedbackCount).to.equal(2);
    expect(payload.summary.latestValidationSignalSummary).to.include("conf=");
    expect(payload.summary.latestValidationSignalSummary).to.include("fill=");
    expect(payload.summary.compositeScore).to.be.greaterThan(0);
    expect(payload.summary.validationCoveragePct).to.equal(100);
    expect(payload.leaderboard[0].compositeScore).to.equal(payload.summary.compositeScore);
  });

  it("returns neutral reputation when no feedback evidence exists", async function () {
    const now = Math.floor(Date.now() / 1000);
    const checkpointsFile = path.join(tempDir, "checkpoints.jsonl");
    const fillsFile = path.join(tempDir, "fills.jsonl");

    writeJsonLines(checkpointsFile, [
      {
        agentId: "9",
        timestamp: now - 60,
        action: "HOLD",
        asset: "XBT",
        pair: "XBTUSD",
        amountUsd: 0,
        priceUsd: 64000,
        reasoning: "No strong edge.",
        confidence: 0.5,
        intentHash: "0x" + "8".repeat(64),
        signerAddress: "0x" + "2".repeat(40),
        checkpointHash: "0x" + "9".repeat(64),
      },
    ]);
    writeJsonLines(fillsFile, []);

    const payload = await buildScoreStory({
      checkpointsFile,
      fillsFile,
      baselineCapitalUsd: 10_000,
      mode: "mock",
    });

    expect(payload.summary.reputationSource).to.equal("none");
    expect(payload.summary.averageReputationScore).to.equal(0);
    expect(payload.summary.reputationFeedbackCount).to.equal(0);
  });

  it("fails in strict mode when artifacts mix agent identities", async function () {
    const now = Math.floor(Date.now() / 1000);
    const checkpointsFile = path.join(tempDir, "checkpoints.jsonl");
    const fillsFile = path.join(tempDir, "fills.jsonl");

    writeJsonLines(checkpointsFile, [
      {
        agentId: "5",
        timestamp: now - 60,
        action: "HOLD",
        asset: "XBT",
        pair: "XBTUSD",
        amountUsd: 0,
        priceUsd: 64000,
        reasoning: "No strong edge.",
        confidence: 0.5,
        intentHash: "0x" + "8".repeat(64),
        signerAddress: "0x" + "2".repeat(40),
        checkpointHash: "0x" + "9".repeat(64),
      },
    ]);

    writeJsonLines(fillsFile, [
      {
        timestamp: now - 50,
        agentId: "0",
        pair: "XBTUSD",
        action: "BUY",
        amountUsd: 50,
        priceUsd: 64000,
        volumeBase: 50 / 64000,
        intentHash: "0x" + "1".repeat(64),
        txid: "MOCK-MISMATCH",
        order: "buy 0.00078125 XBTUSD @ market",
        mode: "mock",
      },
    ]);

    let rejected = false;
    try {
      await buildScoreStory({
        checkpointsFile,
        fillsFile,
        baselineCapitalUsd: 10_000,
        mode: "mock",
        agentId: 5n,
      });
    } catch (error) {
      rejected = true;
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.contain("Strict agent identity failed");
    }

    expect(rejected).to.equal(true);
  });

  it("fails in strict mode when planner traces omit the submission agent identity", async function () {
    const now = Math.floor(Date.now() / 1000);
    const checkpointsFile = path.join(tempDir, "checkpoints.jsonl");
    const fillsFile = path.join(tempDir, "fills.jsonl");
    const tracesFile = path.join(tempDir, "planner-traces.jsonl");

    writeJsonLines(checkpointsFile, [
      {
        agentId: "5",
        timestamp: now - 60,
        action: "HOLD",
        asset: "XBT",
        pair: "XBTUSD",
        amountUsd: 0,
        priceUsd: 64000,
        reasoning: "No strong edge.",
        confidence: 0.5,
        intentHash: "0x" + "8".repeat(64),
        signerAddress: "0x" + "2".repeat(40),
        checkpointHash: "0x" + "9".repeat(64),
      },
    ]);
    writeJsonLines(fillsFile, []);
    writeJsonLines(tracesFile, [
      {
        timestamp: now - 59,
        pair: "XBTUSD",
        priceUsd: 64000,
        model: "openai/gpt-oss-20b",
        keyLabel: "primary",
        usedFallback: false,
        decision: {
          action: "HOLD",
          amount: 0,
          confidence: 0.5,
          reasoning: "No strong edge.",
        },
      },
    ]);

    let rejected = false;
    try {
      await buildScoreStory({
        checkpointsFile,
        fillsFile,
        tracesFile,
        baselineCapitalUsd: 10_000,
        mode: "mock",
        agentId: 5n,
      });
    } catch (error) {
      rejected = true;
      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.contain("rows without agentId");
    }

    expect(rejected).to.equal(true);
  });
});
