import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildIndicatorSnapshot } from "../src/tools/indicators";

interface CheckpointRow {
  agentId: string;
  timestamp: number;
  action: "BUY" | "SELL" | "HOLD";
  asset: string;
  pair: string;
  amountUsd: number;
  priceUsd: number;
  reasoning: string;
  confidence: number;
  intentHash: string;
  signerAddress: string;
}

function writeCheckpoints(filePath: string, prices: number[]): void {
  const now = Math.floor(Date.now() / 1000);
  const rows: CheckpointRow[] = prices.map((price, index) => ({
    agentId: "5",
    timestamp: now - ((prices.length - index) * 30),
    action: "HOLD",
    asset: "XBT",
    pair: "XBTUSD",
    amountUsd: 0,
    priceUsd: price,
    reasoning: "test",
    confidence: 0.5,
    intentHash: "0x" + "0".repeat(64),
    signerAddress: "0x" + "1".repeat(40),
  }));

  fs.writeFileSync(filePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

describe("indicator snapshot", function () {
  let tempDir = "";

  beforeEach(function () {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "indicator-test-"));
  });

  afterEach(function () {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("detects a bullish regime from rising checkpoint prices", function () {
    const filePath = path.join(tempDir, "checkpoints.jsonl");
    const prices = Array.from({ length: 60 }, (_, index) => 60_000 + (index * 25));
    writeCheckpoints(filePath, prices);

    const snapshot = buildIndicatorSnapshot({
      checkpointsFile: filePath,
      lookback: 80,
      market: {
        pair: "XBTUSD",
        price: 61_600,
        bid: 61_597,
        ask: 61_603,
        volume: 1000,
        vwap: 61_300,
        high: 61_700,
        low: 60_800,
        timestamp: Date.now(),
      },
    });

    expect(snapshot.sampleCount).to.be.greaterThan(50);
    expect(snapshot.emaFast).to.not.equal(null);
    expect(snapshot.emaSlow).to.not.equal(null);
    expect(snapshot.rsi14).to.not.equal(null);
    expect(snapshot.signalScore).to.be.greaterThan(0);
    expect(snapshot.bias).to.equal("bullish");
  });

  it("detects a bearish regime from falling checkpoint prices", function () {
    const filePath = path.join(tempDir, "checkpoints.jsonl");
    const prices = Array.from({ length: 60 }, (_, index) => 64_000 - (index * 20));
    writeCheckpoints(filePath, prices);

    const snapshot = buildIndicatorSnapshot({
      checkpointsFile: filePath,
      lookback: 80,
      market: {
        pair: "XBTUSD",
        price: 62_700,
        bid: 62_697,
        ask: 62_703,
        volume: 900,
        vwap: 63_050,
        high: 63_200,
        low: 62_500,
        timestamp: Date.now(),
      },
    });

    expect(snapshot.sampleCount).to.be.greaterThan(50);
    expect(snapshot.signalScore).to.be.lessThan(0);
    expect(snapshot.bias).to.equal("bearish");
  });
});
