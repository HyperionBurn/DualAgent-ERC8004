import { expect } from "chai";
import { ethers } from "ethers";
import { buildFreshnessSummary, formatFreshnessSummary, getCheckpointFreshnessKey, sortCheckpointsByFreshness } from "../src/freshness";
import { generateCheckpoint } from "../src/explainability/checkpoint";
import { formatCheckpointLog } from "../src/explainability/reasoner";
import { MarketData, TradeDecision } from "../src/types/index";

describe("dashboard freshness", function () {
  it("preserves the market quote timestamp in generated checkpoints", async function () {
    const signer = ethers.Wallet.createRandom();
    const decision: TradeDecision = {
      action: "BUY",
      asset: "XBT",
      pair: "XBTUSD",
      amount: 100,
      confidence: 0.72,
      reasoning: "fresh market quote",
    };
    const market: MarketData = {
      pair: "XBTUSD",
      price: 65000,
      quotePriceUsd: 65000.123456,
      bid: 64990,
      ask: 65010,
      volume: 1000,
      vwap: 64980,
      high: 65100,
      low: 64800,
      timestamp: 1710000000123,
    };

    const checkpoint = await generateCheckpoint(
      5n,
      decision,
      market,
      "0x" + "1".repeat(64),
      signer,
      "0x" + "2".repeat(40),
      11155111
    );

    expect(checkpoint.quoteTimestamp).to.equal(market.timestamp);
    expect(checkpoint.quotePriceUsd).to.equal(market.quotePriceUsd);
    expect(formatCheckpointLog(checkpoint)).to.include("Quote:");
    expect(formatCheckpointLog(checkpoint)).to.include("age");
  });

  it("sorts checkpoint rows by quote freshness before checkpoint time", function () {
    const rows = [
      {
        agentId: "5",
        timestamp: 1710000001,
        quoteTimestamp: 1710000005000,
        quotePriceUsd: 65001.111111,
        action: "HOLD",
        asset: "XBT",
        pair: "XBTUSD",
        amountUsd: 0,
        priceUsd: 65001,
        reasoning: "older",
        confidence: 0.5,
        signature: "0x" + "1".repeat(128),
        signerAddress: "0x" + "2".repeat(40),
        checkpointHash: "0xaaa",
      },
      {
        agentId: "5",
        timestamp: 1710000002,
        quoteTimestamp: 1710000015000,
        quotePriceUsd: 65005.123456,
        action: "BUY",
        asset: "XBT",
        pair: "XBTUSD",
        amountUsd: 50,
        priceUsd: 65005,
        reasoning: "newest quote",
        confidence: 0.6,
        signature: "0x" + "3".repeat(128),
        signerAddress: "0x" + "4".repeat(40),
        checkpointHash: "0xbbb",
      },
      {
        agentId: "5",
        timestamp: 1710000003,
        action: "SELL",
        asset: "XBT",
        pair: "XBTUSD",
        amountUsd: 75,
        priceUsd: 65008,
        reasoning: "fallback timestamp",
        confidence: 0.7,
        signature: "0x" + "5".repeat(128),
        signerAddress: "0x" + "6".repeat(40),
        checkpointHash: "0xccc",
      },
    ] as Array<Record<string, unknown>>;

    const sorted = sortCheckpointsByFreshness(rows);
    expect(sorted[0].quoteTimestamp).to.equal(1710000015000);
    expect(sorted[1].quoteTimestamp).to.equal(1710000005000);
    expect(getCheckpointFreshnessKey(sorted[0])).to.equal("quote|XBTUSD|1710000015000|65005.123456");
  });

  it("uses quote identity over checkpoint hash for duplicate snapshots", function () {
    const first = {
      pair: "XBTUSD",
      quoteTimestamp: 1710000015000,
      quotePriceUsd: 65005.123456,
      checkpointHash: "0xaaa",
      timestamp: 1710000002,
    };
    const second = {
      pair: "XBTUSD",
      quoteTimestamp: 1710000015000,
      quotePriceUsd: 65005.123456,
      checkpointHash: "0xbbb",
      timestamp: 1710000003,
    };

    expect(getCheckpointFreshnessKey(first)).to.equal(getCheckpointFreshnessKey(second));
  });

  it("builds readable freshness labels", function () {
    const summary = buildFreshnessSummary(
      {
        pair: "XBTUSD",
        quoteTimestamp: 1710000000000,
        timestamp: 1710000001,
        checkpointHash: "0xabc",
        priceUsd: 65000,
      },
      1710000060000
    );

    expect(summary.identity).to.equal("quote|XBTUSD|1710000000000|65000.000000");
    expect(summary.quoteTimestampLabel).to.not.equal("n/a");
    expect(summary.quoteAgeLabel).to.equal("1m 0s");
    expect(formatFreshnessSummary({ quoteTimestamp: 1710000000000, timestamp: 1710000001, checkpointHash: "0xabc" }, 1710000060000)).to.include("quote ");
  });
});
