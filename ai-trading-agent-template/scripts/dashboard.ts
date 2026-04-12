/**
 * Trading Agent Dashboard — Express server with embedded UI
 *
 * Usage:
 *   npx ts-node scripts/dashboard.ts
 *
 * Opens a live dashboard at http://localhost:3000
 * Run alongside npm run run-agent in a separate terminal.
 */

import * as dotenv from "dotenv";
const envFilePath = (process.env.ENV_FILE || process.env.DOTENV_CONFIG_PATH || "").trim();
dotenv.config(envFilePath ? { path: envFilePath } : undefined);

import express from "express";
import axios from "axios";
import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { buildScoreStory } from "../src/metrics/index";
import { buildFreshnessSummary, sortCheckpointsByFreshness } from "../src/freshness";
import { acquireSingleInstanceLock, getSingleInstanceLockSnapshot, stopSingleInstanceService } from "./shared/single-instance";
import { getConfiguredPlannerProvider } from "../src/llm/provider";
import { ValidationRegistryClient } from "../src/onchain/validationRegistry";

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;
const dashboardServiceName = (process.env.DASHBOARD_SERVICE_NAME || "dashboard").trim() || "dashboard";
const runAgentServiceName = (process.env.RUN_AGENT_SERVICE_NAME || "run-agent").trim() || "run-agent";
const CHECKPOINTS_FILE = path.join(process.cwd(), process.env.CHECKPOINT_FILE || "checkpoints.jsonl");
const FILLS_FILE = path.join(process.cwd(), process.env.FILLS_FILE || "fills.jsonl");
const PLANNER_TRACES_FILE = path.join(process.cwd(), process.env.PLANNER_TRACES_FILE || "planner-traces.jsonl");
const REPUTATION_FEEDBACK_FILE = path.join(process.cwd(), process.env.REPUTATION_FEEDBACK_FILE || "reputation-feedback.jsonl");
const REPUTATION_CONTEXT_FILE = path.join(process.cwd(), process.env.REPUTATION_CONTEXT_FILE || "reputation-context.jsonl");
const EQUITY_REPORT_FILE = path.join(process.cwd(), process.env.EQUITY_REPORT_FILE || "equity-report.json");
const PHASE2_EVIDENCE_FILE = path.join(process.cwd(), process.env.PHASE2_EVIDENCE_FILE || "phase2-evidence.json");
const runtimeLock = acquireSingleInstanceLock(dashboardServiceName);

console.log(`[lock] Single-instance lock acquired (${dashboardServiceName}): ${runtimeLock.lockFilePath}`);

app.disable("etag");

const metricsChainId = Number(process.env.CHAIN_ID || "11155111");
const useOnchainValidationMetrics = Boolean(
  process.env.SEPOLIA_RPC_URL
  && process.env.VALIDATION_REGISTRY_ADDRESS
  && process.env.AGENT_ID
);

const metricsProvider = useOnchainValidationMetrics
  ? new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL as string, metricsChainId, { staticNetwork: true })
  : undefined;
const metricsAgentId = (() => {
  try {
    return process.env.AGENT_ID ? BigInt(process.env.AGENT_ID) : undefined;
  } catch {
    return undefined;
  }
})();
const expectedAgentId = process.env.AGENT_ID?.trim() || null;

function readJsonLines<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  return raw.split("\n").map((line) => {
    try {
      return JSON.parse(line) as T;
    } catch {
      return null;
    }
  }).filter((value): value is T => value !== null);
}

function readJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function readReadinessSnapshot() {
  const payload = readJson<Record<string, unknown>>(PHASE2_EVIDENCE_FILE);
  if (!payload) {
    return null;
  }

  const readyForSubmission = asRecord(payload.readyForSubmission);
  const evidenceDepth = asRecord(payload.evidenceDepth);
  const runQuality = asRecord(payload.runQuality);
  const runContext = asRecord(payload.runContext);

  return {
    allChecksPassed: asBoolean(readyForSubmission?.allChecksPassed),
    failReasons: asStringArray(payload.failReasons),
    runLabel: asString(runContext?.runLabel),
    evidenceDepth: evidenceDepth ? {
      enabled: asBoolean(evidenceDepth.enabled) ?? false,
      pass: asBoolean(evidenceDepth.pass) ?? false,
      minCheckpointCount: asNumber(evidenceDepth.minCheckpointCount),
      maxCheckpointCount: asNumber(evidenceDepth.maxCheckpointCount),
      checkpointCount: asNumber(evidenceDepth.checkpointCount),
      checkpointRangePass: asBoolean(evidenceDepth.checkpointRangePass),
      minFillCount: asNumber(evidenceDepth.minFillCount),
      maxFillCount: asNumber(evidenceDepth.maxFillCount),
      fillCount: asNumber(evidenceDepth.fillCount),
      fillRangePass: asBoolean(evidenceDepth.fillRangePass),
      reasons: asStringArray(evidenceDepth.reasons),
    } : null,
    runQuality: runQuality ? {
      enabled: asBoolean(runQuality.enabled) ?? false,
      pass: asBoolean(runQuality.pass) ?? false,
      minNetPnlUsd: asNumber(runQuality.minNetPnlUsd),
      maxDrawdownBps: asNumber(runQuality.maxDrawdownBps),
      netPnlUsd: asNumber(runQuality.netPnlUsd),
      maxDrawdownObservedBps: asNumber(runQuality.maxDrawdownObservedBps),
      pnlPass: asBoolean(runQuality.pnlPass),
      drawdownPass: asBoolean(runQuality.drawdownPass),
      reasons: asStringArray(runQuality.reasons),
    } : null,
  };
}

function readRiskSnapshot() {
  const report = readJson<Record<string, unknown>>(EQUITY_REPORT_FILE);
  if (!report) {
    return null;
  }

  const drawdownEvidence = (report.drawdownEvidence && typeof report.drawdownEvidence === "object")
    ? report.drawdownEvidence as Record<string, unknown>
    : null;
  const guardrails = (report.guardrails && typeof report.guardrails === "object")
    ? report.guardrails as Record<string, unknown>
    : null;

  if (!drawdownEvidence && !guardrails) {
    return null;
  }

  return {
    guardrails: guardrails ? {
      maxPositionUsd: typeof guardrails.maxPositionUsd === "number" ? guardrails.maxPositionUsd : null,
      maxDrawdownBps: typeof guardrails.maxDrawdownBps === "number" ? guardrails.maxDrawdownBps : null,
      maxTradesPerHour: typeof guardrails.maxTradesPerHour === "number" ? guardrails.maxTradesPerHour : null,
      active: typeof guardrails.active === "boolean" ? guardrails.active : null,
      defaultCapUsd: typeof guardrails.defaultCapUsd === "number" ? guardrails.defaultCapUsd : null,
    } : null,
    drawdownEvidence: drawdownEvidence ? {
      maxDrawdownBps: typeof drawdownEvidence.maxDrawdownBps === "number" ? drawdownEvidence.maxDrawdownBps : null,
      currentDrawdownBps: typeof drawdownEvidence.currentDrawdownBps === "number" ? drawdownEvidence.currentDrawdownBps : null,
      currentEquityUsd: typeof drawdownEvidence.currentEquityUsd === "number" ? drawdownEvidence.currentEquityUsd : null,
      peakEquityUsd: typeof drawdownEvidence.peakEquityUsd === "number" ? drawdownEvidence.peakEquityUsd : null,
      asOfTimestamp: typeof drawdownEvidence.asOfTimestamp === "number" ? drawdownEvidence.asOfTimestamp : null,
    } : null,
    cppi: report.cppi && typeof report.cppi === "object" ? {
      floorRatio: asNumber((report.cppi as Record<string, unknown>).floorRatio),
      multiplier: asNumber((report.cppi as Record<string, unknown>).multiplier),
      floorEquityUsd: asNumber((report.cppi as Record<string, unknown>).floorEquityUsd),
      cushionUsd: asNumber((report.cppi as Record<string, unknown>).cushionUsd),
      cushionRatio: asNumber((report.cppi as Record<string, unknown>).cushionRatio),
      scale: asNumber((report.cppi as Record<string, unknown>).scale),
    } : null,
    runtimeRiskControls: report.runtimeRiskControls && typeof report.runtimeRiskControls === "object" ? {
      breakerActive: asBoolean((report.runtimeRiskControls as Record<string, unknown>).breakerActive),
      breakerReason: asString((report.runtimeRiskControls as Record<string, unknown>).breakerReason),
      consecutiveLosses: asNumber((report.runtimeRiskControls as Record<string, unknown>).consecutiveLosses),
      dailyLossUsd: asNumber((report.runtimeRiskControls as Record<string, unknown>).dailyLossUsd),
      volatilityThrottleActive: asBoolean((report.runtimeRiskControls as Record<string, unknown>).volatilityThrottleActive),
      volatilityPct: asNumber((report.runtimeRiskControls as Record<string, unknown>).volatilityPct),
      appliedTradeScale: asNumber((report.runtimeRiskControls as Record<string, unknown>).appliedTradeScale),
    } : null,
  };
}

function readReputationContextSummary(agentId: string | null) {
  const feedbackRows = filterRowsByAgentId(readJsonLines<Record<string, unknown>>(REPUTATION_FEEDBACK_FILE), agentId);
  const contextRows = filterRowsByAgentId(readJsonLines<Record<string, unknown>>(REPUTATION_CONTEXT_FILE), agentId);

  const latestFeedback = feedbackRows.length > 0 ? feedbackRows[feedbackRows.length - 1] : null;
  const latestFailureContext = contextRows.length > 0 ? contextRows[contextRows.length - 1] : null;

  return {
    feedbackCount: feedbackRows.length,
    failureContextCount: contextRows.length,
    latestFeedback: latestFeedback ? {
      timestamp: asNumber(latestFeedback.timestamp),
      score: asNumber(latestFeedback.score),
      feedbackType: asString(latestFeedback.feedbackType),
      txid: asString(latestFeedback.txid),
      intentHash: asString(latestFeedback.intentHash),
    } : null,
    latestFailureContext: latestFailureContext ? {
      timestamp: asNumber(latestFailureContext.timestamp),
      action: asString(latestFailureContext.action),
      pair: asString(latestFailureContext.pair),
      deltaNetPnlUsd: asNumber(latestFailureContext.deltaNetPnlUsd),
      cppiScale: asNumber(latestFailureContext.cppiScale),
      breakerState: asString(latestFailureContext.breakerState),
      txid: asString(latestFailureContext.txid),
      intentHash: asString(latestFailureContext.intentHash),
    } : null,
  };
}

function filterRowsByAgentId<T extends Record<string, unknown>>(rows: T[], agentId: string | null): T[] {
  if (!agentId) return rows;
  return rows.filter((row) => String(row.agentId ?? "").trim() === agentId);
}

function setFreshResponseHeaders(res: express.Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, max-age=0, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
}

function enrichCheckpointRow(row: Record<string, unknown>): Record<string, unknown> {
  const freshness = buildFreshnessSummary(row);
  return {
    ...row,
    snapshotKey: freshness.identity,
    freshness,
  };
}

function loadFreshCheckpoints(): Record<string, unknown>[] {
  const rows = filterRowsByAgentId(readJsonLines<Record<string, unknown>>(CHECKPOINTS_FILE), expectedAgentId);
  return sortCheckpointsByFreshness(rows).slice(0, 50).map(enrichCheckpointRow);
}

app.use("/api", (_req, res, next) => {
  setFreshResponseHeaders(res);
  next();
});

function inferStrategy(): string {
  const explicit = (process.env.TRADING_STRATEGY || "").trim().toLowerCase();
  const plannerTraces = readJsonLines<{ model?: string; keyLabel?: string }>(PLANNER_TRACES_FILE);
  const hasLivePlannerTrace = plannerTraces.some((trace) => trace.model && trace.model !== "fallback/hold" && trace.keyLabel && trace.keyLabel !== "fallback");
  const provider = getConfiguredPlannerProvider();

  if (explicit === "llm") {
    return "llm";
  }

  if (explicit === "momentum") {
    return "momentum";
  }

  if (explicit === "indicator") {
    return "indicator";
  }

  if (hasLivePlannerTrace) {
    return "llm";
  }

  if (provider) {
    return "llm";
  }

  return "indicator";
}

// ─── API ─────────────────────────────────────────────────────────────────────

// --- External Macro Context Integration ---
let marketContextCache = {
  fearGreed: { value: "—", class: "—" },
  networkGas: "—",
  depthTilt: "—",
  fundingRate: "—",
  timestamp: 0,
};

async function fetchMarketContext() {
  try {
    // Fear & Greed
    axios.get("https://api.alternative.me/fng/?limit=1")
      .then((res: any) => {
        const data = res.data;
        if (data && data.data && data.data[0]) {
          marketContextCache.fearGreed = {
            value: data.data[0].value,
            class: data.data[0].value_classification
          };
        }
      })
      .catch(() => {});

    // Binance Depth (BTCUSDT)
    axios.get("https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=20")
      .then((res: any) => {
        const data = res.data;
        if (data && data.bids && data.asks) {
          const bidVolume = data.bids.reduce((acc: number, val: string[]) => acc + parseFloat(val[1]), 0);
          const askVolume = data.asks.reduce((acc: number, val: string[]) => acc + parseFloat(val[1]), 0);
          const ratio = (bidVolume / (askVolume || 1)).toFixed(2);
          marketContextCache.depthTilt = ratio + "x " + (bidVolume > askVolume ? "BID" : "ASK");
        }
      })
      .catch(() => {});

    // Binance Funding Rate
    axios.get("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT")
      .then((res: any) => {
        const data = res.data;
        if (data && typeof data.lastFundingRate !== "undefined") {
          marketContextCache.fundingRate = (parseFloat(data.lastFundingRate) * 100).toFixed(4) + "%";
        }
      })
      .catch(() => {});

    // Network Gas
    if (metricsProvider) {
      metricsProvider.getFeeData()
        .then(data => {
          if (data && data.gasPrice) {
            marketContextCache.networkGas = ethers.formatUnits(data.gasPrice, "gwei").substring(0, 5) + " gwei";
          }
        })
        .catch(() => {});
    }

    marketContextCache.timestamp = Date.now();
  } catch (error) {
    console.error("[cache] background market context poll failed", error);
  }
}

// Start polling immediately and then every 60s
fetchMarketContext();
setInterval(fetchMarketContext, 60000);

app.get("/api/market-context", (_req, res) => {
  res.json(marketContextCache);
});


app.get("/api/status", (_req, res) => {
  const mode = (process.env.EXECUTION_MODE || "mock").toLowerCase();
  const strategy = inferStrategy();
  // Check both agent 5 and agent 53 lock files for running status
  const agent5Runtime = getSingleInstanceLockSnapshot("run-agent-5");
  const agent53Runtime = getSingleInstanceLockSnapshot("run-agent-53");
  const defaultRuntime = getSingleInstanceLockSnapshot(runAgentServiceName);
  const agentRunning = agent5Runtime.isRunning || agent53Runtime.isRunning || defaultRuntime.isRunning;
  const primaryRuntime = agent5Runtime.isRunning ? agent5Runtime : agent53Runtime.isRunning ? agent53Runtime : defaultRuntime;
  const riskSnapshot = readRiskSnapshot();
  const readinessSnapshot = readReadinessSnapshot();
  const reputationContext = readReputationContextSummary(expectedAgentId);
  res.json({
    agentId:       process.env.AGENT_ID ?? "—",
    wallet:        process.env.AGENT_WALLET_PRIVATE_KEY ? "(agent hot wallet)" : process.env.PRIVATE_KEY ? "(operator wallet)" : "—",
    pair:          process.env.TRADING_PAIR ?? "XBTUSD",
    mode,
    marketMode:    process.env.MARKET_DATA_MODE ?? mode,
    strategy,
    plannerProvider: strategy === "llm" ? getConfiguredPlannerProvider() ?? "none" : "disabled",
    sandbox:       mode === "kraken" ? process.env.KRAKEN_SANDBOX !== "false" : true,
    agentRunning:  agentRunning,
    agentRuntimePid: primaryRuntime.metadata?.pid ?? null,
    risk: riskSnapshot,
    reputationContext,
    readiness: readinessSnapshot,
    contracts: {
      agentRegistry:      process.env.AGENT_REGISTRY_ADDRESS ?? null,
      hackathonVault:     process.env.HACKATHON_VAULT_ADDRESS ?? null,
      riskRouter:         process.env.RISK_ROUTER_ADDRESS ?? null,
      reputationRegistry: process.env.REPUTATION_REGISTRY_ADDRESS ?? null,
      validationRegistry: process.env.VALIDATION_REGISTRY_ADDRESS ?? null,
    },
  });
});

app.post("/api/agent/stop", async (_req, res) => {
  try {
    const result = await stopSingleInstanceService(runAgentServiceName);
    res.status(result.stopped ? 200 : 409).json({
      ok: result.stopped,
      ...result,
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      stopped: false,
      message: error instanceof Error ? error.message : "Failed to stop agent",
    });
  }
});

app.get("/api/checkpoints", (_req, res) => {
  res.json(loadFreshCheckpoints());
});

app.get("/api/price", (_req, res) => {
  const latest = loadFreshCheckpoints()[0];
  if (!latest) {
    res.json({ price: null, quotePriceUsd: null, timestamp: null, quoteTimestamp: null, snapshotKey: null, freshness: null });
    return;
  }

  res.json({
    price: latest.priceUsd ?? null,
    quotePriceUsd: latest.quotePriceUsd ?? latest.priceUsd ?? null,
    timestamp: latest.timestamp ?? null,
    quoteTimestamp: latest.quoteTimestamp ?? null,
    snapshotKey: latest.snapshotKey ?? null,
    freshness: latest.freshness ?? null,
  });
});

app.get("/api/traces", (_req, res) => {
  // Read traces from both agent 5 and agent 53 files for multi-agent dashboard
  const traceFiles = [
    PLANNER_TRACES_FILE,
    path.join(process.cwd(), "planner-traces-5.jsonl"),
    path.join(process.cwd(), "planner-traces-53.jsonl"),
  ];
  const all: Record<string, unknown>[] = [];
  for (const tf of traceFiles) {
    if (fs.existsSync(tf)) {
      all.push(...readJsonLines<Record<string, unknown>>(tf));
    }
  }
  // Sort by timestamp descending, take last 50
  all.sort((a, b) => ((b.timestamp as number) ?? 0) - ((a.timestamp as number) ?? 0));
  res.json(all.slice(0, 50));
});

app.get("/api/metrics", async (_req, res) => {
  try {
    const payload = await buildScoreStory({
      checkpointsFile: CHECKPOINTS_FILE,
      fillsFile: FILLS_FILE,
      mode: process.env.EXECUTION_MODE,
      provider: metricsProvider,
      validationRegistryAddress: process.env.VALIDATION_REGISTRY_ADDRESS,
      reputationRegistryAddress: process.env.REPUTATION_REGISTRY_ADDRESS,
      reputationEvidenceFile: REPUTATION_FEEDBACK_FILE,
      agentId: metricsAgentId,
      recentLimit: 8,
    });

    res.json(payload);
  } catch (error) {
    res.status(500).json({
      error: "Failed to compute metrics",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

app.get("/api/attestations", async (_req, res) => {
  try {
    if (!useOnchainValidationMetrics || !metricsProvider || !metricsAgentId || !process.env.VALIDATION_REGISTRY_ADDRESS) {
      res.json([]);
      return;
    }
    const validation = new ValidationRegistryClient(process.env.VALIDATION_REGISTRY_ADDRESS, metricsProvider);
    const attestations = await validation.getAttestations(metricsAgentId);
    
    // Reverse them to show newest first
    res.json(attestations.reverse().slice(0, 50).map(a => ({
      agentId: a.agentId.toString(),
      validator: a.validator,
      checkpointHash: a.checkpointHash,
      score: a.score,
      proofType: a.proofType,
      proof: a.proof,
      notes: a.notes,
      timestamp: a.timestamp,
    })));
  } catch (error) {
    console.error("[server] Failed to fetch attestations:", error);
    res.json([]);
  }
});

// ─── HTML ────────────────────────────────────────────────────────────────────

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=Syne:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg:        #f0f2f5;
    --bg2:       #ffffff;
    --bg3:       #f7f8fa;
    --border:    #dde1e7;
    --border2:   #c8cdd6;
    --text:      #111827;
    --muted:     #6b7280;
    --accent:    #0070f3;
    --accent2:   #0057c2;
    --buy:       #059669;
    --buy-dim:   #05966915;
    --sell:      #dc2626;
    --sell-dim:  #dc262615;
    --hold:      #6b7280;
    --hold-dim:  #6b728010;
    --gold:      #b45309;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    min-height: 100vh;
    overflow-x: hidden;
  }

  /* Subtle top border accent */
  body::before {
    content: '';
    position: fixed;
    top: 0; left: 0; right: 0;
    height: 3px;
    background: linear-gradient(90deg, var(--accent), #6366f1);
    z-index: 9999;
  }

  /* Header */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg2);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .logo {
    font-family: 'Syne', sans-serif;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .logo-dot {
    width: 8px; height: 8px;
    background: var(--accent);
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.4; }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .badge {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    padding: 3px 8px;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .badge-sandbox { background: #fef3c7; color: var(--gold); border: 1px solid #fcd34d; }
  .badge-live    { background: #d1fae5; color: var(--buy);  border: 1px solid #6ee7b7; }

  .last-update {
    color: var(--muted);
    font-size: 11px;
  }

  /* Grid layout */
  .grid {
    display: grid;
    grid-template-columns: 280px 1fr;
    grid-template-rows: auto 1fr;
    gap: 1px;
    background: var(--border);
    height: calc(100vh - 53px);
  }

  .panel {
    background: var(--bg2);
    overflow: hidden;
  }

  .panel-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-family: 'Syne', sans-serif;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-header .count {
    background: var(--bg3);
    border: 1px solid var(--border2);
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    color: var(--accent);
  }

  /* Left sidebar */
  .sidebar {
    grid-row: 1 / 3;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
  }

  /* Price hero */
  .price-hero {
    padding: 24px 16px 20px;
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, #e8f0fe 0%, var(--bg2) 100%);
  }

  .price-label {
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .price-value {
    font-family: 'Syne', sans-serif;
    font-size: 32px;
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.02em;
    line-height: 1;
    transition: color 0.3s;
  }

  .price-value.up   { color: var(--buy); }
  .price-value.down { color: var(--sell); }

  .price-change {
    font-size: 11px;
    margin-top: 6px;
    color: var(--muted);
  }

  .price-freshness {
    font-size: 10px;
    margin-top: 4px;
    color: var(--accent2);
    letter-spacing: 0.04em;
  }

  .price-change.up   { color: var(--buy); }
  .price-change.down { color: var(--sell); }

  /* Decision display */
  .decision-display {
    padding: 16px;
    border-bottom: 1px solid var(--border);
  }

  .decision-label {
    font-size: 10px;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .decision-badge {
    font-family: 'Syne', sans-serif;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.05em;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .decision-badge.BUY  { color: var(--buy); }
  .decision-badge.SELL { color: var(--sell); }
  .decision-badge.HOLD { color: var(--hold); }

  .decision-badge::before {
    content: '';
    display: block;
    width: 10px; height: 10px;
    border-radius: 50%;
  }
  .decision-badge.BUY::before  { background: var(--buy);  box-shadow: 0 0 12px var(--buy); }
  .decision-badge.SELL::before { background: var(--sell); box-shadow: 0 0 12px var(--sell); }
  .decision-badge.HOLD::before { background: var(--hold); }

  .decision-reasoning {
    margin-top: 10px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.6;
    border-left: 2px solid var(--border2);
    padding-left: 10px;
  }

  /* Agent info */
  .agent-info {
    padding: 16px;
    flex: 1;
    border-bottom: 1px solid var(--border);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }

  .info-row:last-child { border-bottom: none; }

  .info-key   { color: var(--muted); font-size: 11px; }
  .info-value { color: var(--text);  font-size: 11px; font-weight: 500; }
  .info-value.accent { color: var(--accent); }

  /* Mini chart */
  .chart-panel {
    padding: 0;
    height: 120px;
    position: relative;
  }

  .chart-panel canvas {
    width: 100% !important;
    height: 100% !important;
  }

  /* Main area */
  .main-area {
    display: flex;
    flex-direction: column;
  }

  /* Feed */
  .feed {
    flex: 1;
    overflow-y: auto;
    padding: 0;
  }

  .feed::-webkit-scrollbar { width: 4px; }
  .feed::-webkit-scrollbar-track { background: transparent; }
  .feed::-webkit-scrollbar-thumb { background: var(--border2); border-radius: 2px; }

  /* Checkpoint card */
  .checkpoint-card {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
    display: grid;
    grid-template-columns: 80px 1fr auto;
    gap: 12px;
    align-items: start;
    transition: background 0.15s;
    animation: slideIn 0.3s ease;
  }

  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-8px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .checkpoint-card:hover { background: var(--bg3); }

  .checkpoint-card.BUY  { border-left: 2px solid var(--buy); }
  .checkpoint-card.SELL { border-left: 2px solid var(--sell); }
  .checkpoint-card.HOLD { border-left: 2px solid var(--border2); }

  .card-action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .action-pill {
    font-family: 'Syne', sans-serif;
    font-size: 11px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 3px;
    letter-spacing: 0.05em;
    width: 54px;
    text-align: center;
  }

  .action-pill.BUY  { background: var(--buy-dim);  color: var(--buy);  border: 1px solid var(--buy)40; }
  .action-pill.SELL { background: var(--sell-dim); color: var(--sell); border: 1px solid var(--sell)40; }
  .action-pill.HOLD { background: var(--hold-dim); color: var(--hold); border: 1px solid var(--border2); }

  .card-time {
    font-size: 10px;
    color: var(--muted);
    text-align: center;
  }

  .card-freshness {
    margin-top: 4px;
    font-size: 9px;
    line-height: 1.4;
    color: var(--accent2);
    text-align: center;
    white-space: normal;
  }

  .card-body { min-width: 0; }

  .card-price {
    font-family: 'Syne', sans-serif;
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 4px;
  }

  .card-reasoning {
    color: var(--muted);
    font-size: 11px;
    line-height: 1.5;
    margin-bottom: 6px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-confidence {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .confidence-bar-bg {
    flex: 1;
    height: 2px;
    background: var(--border2);
    border-radius: 1px;
    overflow: hidden;
  }

  .confidence-bar-fill {
    height: 100%;
    border-radius: 1px;
    background: var(--accent);
    transition: width 0.5s ease;
  }

  .confidence-val {
    font-size: 10px;
    color: var(--muted);
    width: 28px;
    text-align: right;
  }

  .card-sig {
    font-size: 10px;
    color: var(--border2);
    white-space: nowrap;
    padding-top: 2px;
    writing-mode: initial;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Empty state */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: var(--muted);
    gap: 8px;
  }

  .empty-icon { font-size: 32px; opacity: 0.3; }

  /* Connection status */
  .conn-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: var(--buy);
    animation: pulse 2s infinite;
    display: inline-block;
    margin-right: 6px;
  }

  .conn-dot.error { background: var(--sell); animation: none; }
</style>
</head>
<body>

<header>
  <div class="logo">
    <div class="logo-dot"></div>
    AGENT TERMINAL
  </div>
  <div class="header-right">
    <span id="mode-badge" class="badge badge-sandbox">SANDBOX</span>
    <span class="last-update"><span class="conn-dot" id="conn-dot"></span><span id="last-update-time">connecting...</span></span>
  </div>
</header>

<div class="grid">

  <!-- Sidebar -->
  <div class="sidebar panel">

    <div class="price-hero">
      <div class="price-label">BTC / USD</div>
      <div class="price-value" id="price-display">—</div>
      <div class="price-change" id="price-change"></div>
      <div class="price-freshness" id="price-freshness">Waiting for first quote...</div>
    </div>

    <div class="decision-display">
      <div class="decision-label">Last Decision</div>
      <div class="decision-badge HOLD" id="decision-badge">HOLD</div>
      <div class="decision-reasoning" id="decision-reasoning">Waiting for first tick...</div>
    </div>

    <div class="agent-info">
      <div class="panel-header" style="padding: 0 0 10px; border: none;">Agent Info</div>
      <div class="info-row">
        <span class="info-key">Agent ID</span>
        <span class="info-value accent" id="info-agent-id">—</span>
      </div>
      <div class="info-row">
        <span class="info-key">Wallet</span>
        <span class="info-value" id="info-wallet">—</span>
      </div>
      <div class="info-row">
        <span class="info-key">Pair</span>
        <span class="info-value" id="info-pair">—</span>
      </div>
      <div class="info-row">
        <span class="info-key">Network</span>
        <span class="info-value accent">Sepolia</span>
      </div>
      <div class="info-row">
        <span class="info-key">Interval</span>
        <span class="info-value">1m</span>
      </div>
      <div class="info-row">
        <span class="info-key">Checkpoints</span>
        <span class="info-value accent" id="info-total">0</span>
      </div>

      <div class="panel-header" style="padding: 14px 0 10px; border: none;">Score Story</div>
      <div class="info-row">
        <span class="info-key">Net PnL</span>
        <span class="info-value accent" id="metric-net-pnl">—</span>
      </div>
      <div class="info-row">
        <span class="info-key">Max Drawdown</span>
        <span class="info-value" id="metric-drawdown">—</span>
      </div>
      <div class="info-row">
        <span class="info-key">Validation</span>
        <span class="info-value" id="metric-validation">—</span>
      </div>
      <div class="info-row">
        <span class="info-key">Fills</span>
        <span class="info-value" id="metric-fills">0</span>
      </div>
      <div class="info-row">
        <span class="info-key">Recent Flow</span>
        <span class="info-value" id="metric-flow">—</span>
      </div>
      <div class="info-row">
        <span class="info-key">Source</span>
        <span class="info-value" id="metric-source">—</span>
      </div>
    </div>

    <div class="panel chart-panel">
      <canvas id="price-chart"></canvas>
    </div>

  </div>

  <!-- Main feed -->
  <div class="main-area panel">
    <div class="panel-header">
      Recent Checkpoints
      <span class="count" id="feed-count">0</span>
    </div>
    <div class="feed" id="feed">
      <div class="empty">
        <div class="empty-icon">⬡</div>
        <div>Waiting for agent data...</div>
        <div style="font-size:10px; margin-top:4px;">Run <code>npm run run-agent</code> in another terminal</div>
      </div>
    </div>
  </div>

</div>

<script>
const fmt = n => n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtTime = ts => {
  const d = new Date(typeof ts === 'number' && ts < 1e12 ? ts * 1000 : ts);
  return d.toLocaleTimeString('en-US', { hour12: false });
};
const truncate = (s, n=16) => s ? s.slice(0, 6) + '...' + s.slice(-4) : '—';

const fetchFreshJson = async (url) => {
  const requestUrl = url.includes('?') ? url + '&_=' + Date.now() : url + '?_=' + Date.now();
  const response = await fetch(requestUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error('Request failed: ' + requestUrl + ' (' + response.status + ')');
  }
  return response.json();
};

const ensureTimestampMs = value => {
  if (value == null) return null;
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  return numericValue > 0 && numericValue < 1e12 ? numericValue * 1000 : numericValue;
};

const ensureNumeric = value => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : null;
};

const formatAgeLabel = ms => {
  if (ms == null || !Number.isFinite(ms)) return 'n/a';
  const normalized = Math.max(0, ms);
  if (normalized < 1000) return '0s';
  const totalSeconds = Math.floor(normalized / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return hours + 'h ' + minutes + 'm';
  if (minutes > 0) return minutes + 'm ' + seconds + 's';
  return seconds + 's';
};

const formatTimestampLabel = timestampMs => {
  if (timestampMs == null) return '—';
  const d = new Date(timestampMs);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString('en-US', { hour12: false });
};

const buildFreshness = (cp) => {
  const freshness = cp?.freshness || {};
  const quoteTimestampMs = ensureTimestampMs(freshness.quoteTimestampMs ?? cp?.quoteTimestamp ?? cp?.timestamp);
  const checkpointTimestampMs = ensureTimestampMs(freshness.checkpointTimestampMs ?? cp?.timestamp);
  const quotePriceUsd = ensureNumeric(cp?.quotePriceUsd ?? freshness.quotePriceUsd ?? cp?.priceUsd);
  const displayPriceUsd = ensureNumeric(cp?.priceUsd);
  const now = Date.now();
  const identity = freshness.identity
    || cp?.snapshotKey
    || cp?.checkpointHash
    || cp?.signature
    || [quoteTimestampMs ?? 'na', checkpointTimestampMs ?? 'na', cp?.agentId ?? 'na', cp?.pair ?? 'na', cp?.action ?? 'na', cp?.priceUsd ?? 'na'].join('|');

  return {
    identity,
    quoteTimestampLabel: freshness.quoteTimestampLabel || formatTimestampLabel(quoteTimestampMs),
    quoteAgeLabel: freshness.quoteAgeLabel || formatAgeLabel(quoteTimestampMs == null ? null : now - quoteTimestampMs),
    checkpointTimestampLabel: freshness.checkpointTimestampLabel || formatTimestampLabel(checkpointTimestampMs),
    checkpointAgeLabel: freshness.checkpointAgeLabel || formatAgeLabel(checkpointTimestampMs == null ? null : now - checkpointTimestampMs),
    quotePriceUsd,
    displayPriceUsd,
  };
};

let prevSnapshotKey = null;
let prevDistinctPrice = null;
let prevQuotePrice = null;
let priceHistory = [];

// ── Status ───────────────────────────────────────────────────────────────────
async function loadStatus() {
  try {
    const s = await fetchFreshJson('/api/status');
    document.getElementById('info-agent-id').textContent = s.agentId ?? '—';
    document.getElementById('info-pair').textContent = s.pair ?? 'XBTUSD';

    const badge = document.getElementById('mode-badge');
    if (!s.sandbox) {
      badge.textContent = 'LIVE';
      badge.className = 'badge badge-live';
    }
  } catch(e) {}
}

// ── Metrics ─────────────────────────────────────────────────────────────────
async function loadMetrics() {
  try {
    const payload = await fetchFreshJson('/api/metrics');
    const summary = payload.summary || {};

    const pnlValue = Number(summary.netPnlUsd || 0);
    const pnlText = (pnlValue >= 0 ? '+' : '') + fmt(pnlValue);
    const pnlEl = document.getElementById('metric-net-pnl');
    pnlEl.textContent = pnlText;
    pnlEl.style.color = pnlValue >= 0 ? 'var(--buy)' : 'var(--sell)';

    document.getElementById('metric-drawdown').textContent = String(summary.maxDrawdownBps ?? 0) + ' bps';
    document.getElementById('metric-validation').textContent = Number(summary.averageValidationScore || 0).toFixed(1) + '/100';
    document.getElementById('metric-fills').textContent = String(summary.fillCount ?? 0);
    document.getElementById('metric-flow').textContent = summary.recentFlow || 'No decisions yet';

    const source = summary.validationSource || 'validation-unavailable';
    const coverage = Number(summary.validationCoveragePct || 0).toFixed(1);
    document.getElementById('metric-source').textContent = source + ' (' + coverage + '%)';
  } catch (e) {
    // Metrics are non-critical for the live feed; keep the dashboard responsive.
  }
}

// ── Checkpoints ───────────────────────────────────────────────────────────────
async function loadCheckpoints() {
  try {
    const cps = await fetchFreshJson('/api/checkpoints');

    document.getElementById('conn-dot').className = 'conn-dot';
    document.getElementById('last-update-time').textContent = 'updated ' + new Date().toLocaleTimeString('en-US', { hour12: false });
    document.getElementById('feed-count').textContent = cps.length;
    document.getElementById('info-total').textContent = cps.length;

    if (cps.length === 0) {
      document.getElementById('price-display').textContent = '—';
      document.getElementById('price-change').textContent = '';
      document.getElementById('price-freshness').textContent = 'Waiting for first quote...';
      prevSnapshotKey = null;
      prevDistinctPrice = null;
      prevQuotePrice = null;
      return;
    }

    // Update price
    const latest = cps[0];
    const freshness = buildFreshness(latest);
    const snapshotKey = freshness.identity;
    const price = freshness.displayPriceUsd;
    const quotePrice = freshness.quotePriceUsd;
    const isNewSnapshot = snapshotKey !== prevSnapshotKey;

    const priceEl = document.getElementById('price-display');
    const changeEl = document.getElementById('price-change');
    const freshnessEl = document.getElementById('price-freshness');

    priceEl.textContent = fmt(price);
    priceEl.className = 'price-value';
    if (isNewSnapshot) {
      if (prevDistinctPrice !== null && prevSnapshotKey !== null && price !== null) {
        const pct = ((price - prevDistinctPrice) / prevDistinctPrice * 100).toFixed(3);
        if (price > prevDistinctPrice) { priceEl.classList.add('up'); changeEl.className = 'price-change up'; changeEl.textContent = '+' + pct + '%'; }
        else if (price < prevDistinctPrice) { priceEl.classList.add('down'); changeEl.className = 'price-change down'; changeEl.textContent = pct + '%'; }
        else {
          const rawChanged = quotePrice !== null && prevQuotePrice !== null && Math.abs(quotePrice - prevQuotePrice) >= 0.000001;
          if (rawChanged && prevQuotePrice !== 0) {
            const rawBps = ((quotePrice - prevQuotePrice) / prevQuotePrice) * 10000;
            const rawSign = rawBps > 0 ? '+' : '';
            changeEl.textContent = 'new quote • rounded unchanged (' + rawSign + rawBps.toFixed(2) + ' bps raw)';
          } else {
            changeEl.textContent = 'new quote • rounded unchanged';
          }
          changeEl.className = 'price-change';
        }
      } else {
        changeEl.textContent = '';
        changeEl.className = 'price-change';
      }
      prevDistinctPrice = price;
      prevQuotePrice = quotePrice;
      prevSnapshotKey = snapshotKey;
    } else {
      changeEl.textContent = 'same quote snapshot';
      changeEl.className = 'price-change';
    }
    const hasRawDelta = quotePrice !== null && price !== null && Math.abs(quotePrice - price) >= 0.000001;
    const rawLabel = hasRawDelta ? ' • raw $' + quotePrice.toFixed(6) : '';
    freshnessEl.textContent = 'Quoted ' + freshness.quoteTimestampLabel + ' • age ' + freshness.quoteAgeLabel + rawLabel;

    // Update chart data
    priceHistory = cps.slice(0, 20).map(c => c.priceUsd).reverse();
    drawChart();

    // Update decision
    const dec = latest.action;
    const decEl = document.getElementById('decision-badge');
    decEl.textContent = dec;
    decEl.className = 'decision-badge ' + dec;

    // Update wallet from first checkpoint
    if (latest.signerAddress) {
      document.getElementById('info-wallet').textContent = truncate(latest.signerAddress);
    }

    document.getElementById('decision-reasoning').textContent = latest.reasoning ?? '—';

    // Render feed
    const feed = document.getElementById('feed');
    feed.innerHTML = cps.map(cp => {
      const rowFreshness = buildFreshness(cp);
      const rowQuotePrice = rowFreshness.quotePriceUsd;
      const rowDisplayPrice = rowFreshness.displayPriceUsd;
      const rowHasRawDelta = rowQuotePrice !== null && rowDisplayPrice !== null && Math.abs(rowQuotePrice - rowDisplayPrice) >= 0.000001;
      const rowRawLabel = rowHasRawDelta ? ' • raw $' + rowQuotePrice.toFixed(6) : '';
      const conf = Math.round((cp.confidence ?? 0.5) * 100);
      const barColor = cp.action === 'BUY' ? 'var(--buy)' : cp.action === 'SELL' ? 'var(--sell)' : 'var(--hold)';
      return \`
        <div class="checkpoint-card \${cp.action}">
          <div class="card-action">
            <div class="action-pill \${cp.action}">\${cp.action}</div>
            <div class="card-time">Checkpoint \${fmtTime(cp.timestamp)}</div>
            <div class="card-freshness">Quote \${rowFreshness.quoteTimestampLabel} • age \${rowFreshness.quoteAgeLabel}\${rowRawLabel}</div>
          </div>
          <div class="card-body">
            <div class="card-price">\${fmt(cp.priceUsd)}</div>
            <div class="card-reasoning" title="\${(cp.reasoning||'').replace(/"/g,'&quot;')}">\${cp.reasoning ?? '—'}</div>
            <div class="card-confidence">
              <div class="confidence-bar-bg">
                <div class="confidence-bar-fill" style="width:\${conf}%; background:\${barColor}"></div>
              </div>
              <div class="confidence-val">\${conf}%</div>
            </div>
          </div>
          <div class="card-sig">\${truncate(cp.signature ?? '')}</div>
        </div>
      \`;
    }).join('');

  } catch(e) {
    document.getElementById('conn-dot').className = 'conn-dot error';
    document.getElementById('last-update-time').textContent = 'connection error';
  }
}

// ── Mini chart ────────────────────────────────────────────────────────────────
function drawChart() {
  const canvas = document.getElementById('price-chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth;
  const H = canvas.offsetHeight;
  canvas.width = W;
  canvas.height = H;

  if (priceHistory.length < 2) return;

  const min = Math.min(...priceHistory);
  const max = Math.max(...priceHistory);
  const range = max - min || 1;
  const pad = 12;

  const x = i => pad + (i / (priceHistory.length - 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - min) / range) * (H - pad * 2);

  ctx.clearRect(0, 0, W, H);

  // Fill
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(0,112,243,0.12)');
  grad.addColorStop(1, 'rgba(0,112,243,0)');

  ctx.beginPath();
  ctx.moveTo(x(0), y(priceHistory[0]));
  for (let i = 1; i < priceHistory.length; i++) ctx.lineTo(x(i), y(priceHistory[i]));
  ctx.lineTo(x(priceHistory.length - 1), H);
  ctx.lineTo(x(0), H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(x(0), y(priceHistory[0]));
  for (let i = 1; i < priceHistory.length; i++) ctx.lineTo(x(i), y(priceHistory[i]));
  ctx.strokeStyle = 'rgba(0,112,243,0.9)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Last dot
  const lx = x(priceHistory.length - 1);
  const ly = y(priceHistory[priceHistory.length - 1]);
  ctx.beginPath();
  ctx.arc(lx, ly, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#0070f3';
  ctx.fill();
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadStatus();
loadCheckpoints();
loadMetrics();
setInterval(() => {
  loadCheckpoints();
  loadMetrics();
}, 5000);
window.addEventListener('resize', drawChart);
</script>
</body>
</html>`;

app.get("/", (_req, res) => {
  setFreshResponseHeaders(res);
  res.send(HTML);
});

app.listen(PORT, () => {
  console.log(`\n  Dashboard running at http://localhost:${PORT}`);
  console.log(`  Run "npm run run-agent" in another terminal to feed it data.\n`);
});
