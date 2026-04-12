/**
 * Main agent loop — ERC-8004 with pluggable execution adapter
 *
 * Each tick:
 *   1. Fetch market data via exchange adapter (Kraken or mock)
 *   2. Strategy.analyze(market) → TradeDecision
 *   3. Format human-readable explanation
 *   4. If BUY/SELL:
 *      a. Build + sign TradeIntent (EIP-712, agentWallet)
 *      b. Submit TradeIntent to RiskRouter — get approval/rejection on-chain
 *      c. If approved: execute via selected adapter (Kraken or mock)
 *   5. Generate EIP-712 signed checkpoint (includes intentHash)
 *   6. Post checkpoint hash to ValidationRegistry
 *   7. Append checkpoint to checkpoints.jsonl
 *
 * Swap strategy: change the strategy instantiation at the bottom of this file.
 */

import * as dotenv from "dotenv";
dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || undefined });

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

import { DecisionContext, TradingStrategy, TradeDecision } from "../types/index";
import { AGENT_NAME, getAgentId, getAgentRegistration } from "./identity";
import { applyDualGatePolicy, createDefaultStrategy, LLMStrategy } from "./strategy";
import { KrakenClient } from "../exchange/kraken";
import { MockExchangeClient } from "../exchange/mock";
import { LiveMarketClient } from "../exchange/live";
import { PrismMarketClient } from "../exchange/prism";
import { PaperExchangeClient } from "../exchange/paper";
import { formatPlannerProvider, getConfiguredPlannerProvider } from "../llm/provider";
import { RiskRouterClient } from "../onchain/riskRouter";
import { ValidationRegistryClient } from "../onchain/validationRegistry";
import { FeedbackType, ReputationRegistryClient } from "../onchain/reputationRegistry";
import { formatExplanation, formatCheckpointLog } from "../explainability/reasoner";
import { generateCheckpoint } from "../explainability/checkpoint";
import { buildArtifactIdentityReport } from "../submission/artifacts";
import { sendTelegramAlert } from "../telegram";
import { buildEquityReportPayload } from "../submission/equity";
import { isReputationLoopEnabled, isSubmissionStrict } from "../runtime/profile";
import { applyAdaptiveRuntimeHints, buildAdaptiveRuntimePolicy } from "./adaptive-policy";
import { createDailyBudgetDecisionContext, evaluateDailyRiskBudget, formatDailyRiskBudgetSummary, type DailyRiskBudgetPolicy } from "./daily-risk-budget";
import { buildIndicatorSnapshot } from "../tools/indicators";
import { computeValidationAttestationScore } from "./validation-score";
import { KrakenOrder, KrakenOrderResult, MarketData, TradeFill } from "../types/index";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const TRADING_PAIR    = process.env.TRADING_PAIR || "XBTUSD";
const POLL_INTERVAL   = Math.round(parsePositiveNumberEnv("POLL_INTERVAL_MS", 60000));
const EXECUTION_MODE  = (process.env.EXECUTION_MODE || "mock").toLowerCase(); // mock | kraken
const MARKET_DATA_MODE = (process.env.MARKET_DATA_MODE || EXECUTION_MODE || "mock").toLowerCase();
const CHECKPOINTS_FILE = path.join(process.cwd(), process.env.CHECKPOINT_FILE || "checkpoints.jsonl");
const FILLS_FILE = path.join(process.cwd(), process.env.FILLS_FILE || "fills.jsonl");
const PLANNER_TRACES_FILE = path.join(process.cwd(), process.env.PLANNER_TRACES_FILE || "planner-traces.jsonl");
const REPUTATION_FEEDBACK_FILE = path.join(process.cwd(), process.env.REPUTATION_FEEDBACK_FILE || "reputation-feedback.jsonl");
const REPUTATION_CONTEXT_FILE = path.join(process.cwd(), process.env.REPUTATION_CONTEXT_FILE || "reputation-context.jsonl");
const EQUITY_REPORT_FILE = path.join(process.cwd(), process.env.EQUITY_REPORT_FILE || "equity-report.json");
const HOLD_INTENT_HASH = ethers.ZeroHash; // used for HOLD decisions (no intent submitted)
const DUAL_GATE_ENABLED = (process.env.DUAL_GATE_ENABLED || "true").toLowerCase() !== "false";
const DUAL_GATE_MIN_NET_EDGE_BPS = parseBoundedNumberEnv("DUAL_GATE_MIN_NET_EDGE_BPS", 4, 0, 200);
const DUAL_GATE_PROBE_USD = parsePositiveNumberEnv("DUAL_GATE_PROBE_USD", 30);
const DUAL_GATE_PROBE_MIN_CONFIDENCE = parseBoundedNumberEnv("DUAL_GATE_PROBE_MIN_CONFIDENCE", 0.66, 0.35, 0.95);
const PLANNER_MAX_TRADE_USD = parsePositiveNumberEnv("PLANNER_MAX_TRADE_USD", 100);
const PLANNER_MAX_TRADES_PER_HOUR = parsePositiveNumberEnv("PLANNER_MAX_TRADES_PER_HOUR", parsePositiveNumberEnv("MAX_TRADES_PER_HOUR", 10));
const PLANNER_MAX_SLIPPAGE_BPS = parseBoundedNumberEnv("PLANNER_MAX_SLIPPAGE_BPS", 50, 0, 500);
const PLANNER_MIN_CONFIDENCE = parseBoundedNumberEnv("PLANNER_MIN_CONFIDENCE", 0.56, 0.35, 0.95);
const PLANNER_MIN_EXPECTED_EDGE_BPS = parseBoundedNumberEnv("PLANNER_MIN_EXPECTED_EDGE_BPS", 6, 0, 200);
const INDICATOR_TRADE_AMOUNT_USD = parsePositiveNumberEnv("INDICATOR_TRADE_AMOUNT_USD", PLANNER_MAX_TRADE_USD);
const INDICATOR_MIN_CONFIDENCE = parseBoundedNumberEnv("INDICATOR_MIN_CONFIDENCE", 0.5, 0.3, 0.95);
const INDICATOR_MIN_NET_EDGE_BPS = parseBoundedNumberEnv("INDICATOR_MIN_NET_EDGE_BPS", 3, 0, 200);
const INDICATOR_MIN_TRADE_INTERVAL_MS = Math.round(parseBoundedNumberEnv("INDICATOR_MIN_TRADE_INTERVAL_MS", 15_000, 10_000, 3_600_000));
const CPPI_FLOOR_RATIO = parseBoundedNumberEnv("CPPI_FLOOR_RATIO", 0.95, 0.8, 0.99);
const CPPI_MULTIPLIER = parseBoundedNumberEnv("CPPI_MULTIPLIER", 1, 0.1, 3);
const CPPI_MIN_SCALE_TO_TRADE = parseBoundedNumberEnv("CPPI_MIN_SCALE_TO_TRADE", 0.1, 0, 1);
const VOLATILITY_THROTTLE_PCT = parseBoundedNumberEnv("BREAKER_VOLATILITY_THROTTLE_PCT", 2.8, 0.1, 20);
const VOLATILITY_SIZE_MULTIPLIER = parseBoundedNumberEnv("BREAKER_VOLATILITY_SIZE_MULTIPLIER", 0.6, 0.1, 1);
const CIRCUIT_BREAKER_ENABLED = (process.env.CIRCUIT_BREAKER_ENABLED || "true").toLowerCase() !== "false";
const BREAKER_MAX_CONSECUTIVE_LOSSES = Math.round(parseBoundedNumberEnv("BREAKER_MAX_CONSECUTIVE_LOSSES", 3, 1, 20));
const BREAKER_PAUSE_MS = Math.round(parseBoundedNumberEnv("BREAKER_PAUSE_MS", 300_000, 10_000, 3_600_000));

type MarketAdapter = {
  getTicker(pair: string): Promise<MarketData>;
};

type ExecutionAdapter = {
  placeOrder(order: KrakenOrder): Promise<KrakenOrderResult>;
};

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function parseOptionalReputationScore(): number | null {
  const raw = (process.env.REPUTATION_FEEDBACK_SCORE || "").trim();
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    console.warn("[agent] Invalid REPUTATION_FEEDBACK_SCORE; expected integer 1-100. Falling back to confidence score.");
    return null;
  }

  return parsed;
}

function parsePositiveNumberEnv(name: string, fallback: number): number {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function parseOptionalPositiveIntegerEnv(name: string): number | null {
  const raw = (process.env[name] || "").trim();
  if (!raw) return null;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.floor(parsed);
}

function parseBoundedNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}

function sleep(ms: number): Promise<void> {
  if (!Number.isFinite(ms) || ms <= 0) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseReputationRaterPrivateKeys(raw: string): string[] {
  return raw
    .split(/[\r\n,;]+/)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function seedToIndex(seed: string, total: number): number {
  if (total <= 1) return 0;
  const hash = ethers.keccak256(ethers.toUtf8Bytes(seed));
  const sample = Number.parseInt(hash.slice(2, 10), 16);
  if (!Number.isFinite(sample)) return 0;
  return sample % total;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function currentUtcDayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

interface RuntimeRiskControlState {
  cppiScale: number;
  cppiFloorUsd: number;
  cppiCushionUsd: number;
  cppiHeadroomBps: number;
  consecutiveLosses: number;
  dailyLossUsd: number;
  dayKey: string;
  breakerActive: boolean;
  breakerReason: string | null;
  breakerTriggeredAtMs: number | null;
  volatilityThrottleActive: boolean;
  volatilityPct: number | null;
  appliedTradeScale: number;
  lastNetPnlUsd: number | null;
  dailyBudgetStatus: DailyRiskBudgetPolicy["status"];
  dailyBudgetLimitUsd: number;
  dailyBudgetRemainingUsd: number;
  dailyBudgetUtilizationPct: number;
  dailyBudgetMultiplier: number;
  dailyBudgetReason: string;
}

interface ReputationRater {
  client: ReputationRegistryClient;
  address: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent runner
// ─────────────────────────────────────────────────────────────────────────────

export async function runAgent(strategy: TradingStrategy) {
  const rpcUrl           = requireEnv("SEPOLIA_RPC_URL");
  const privateKey       = requireEnv("PRIVATE_KEY");
  const registryAddress  = requireEnv("AGENT_REGISTRY_ADDRESS");
  const vaultAddress     = requireEnv("HACKATHON_VAULT_ADDRESS");
  const routerAddress    = requireEnv("RISK_ROUTER_ADDRESS");
  const validationAddress = requireEnv("VALIDATION_REGISTRY_ADDRESS");
  const strictMode = isSubmissionStrict(process.env);
  const reputationLoopEnabled = isReputationLoopEnabled(process.env);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const providerNetwork = await provider.getNetwork();
  const providerChainId = Number(providerNetwork.chainId);
  const chainIdOverride = process.env.CHAIN_ID ? parseInt(process.env.CHAIN_ID, 10) : undefined;
  const chainId = Number.isFinite(chainIdOverride) ? (chainIdOverride as number) : providerChainId;

  // operatorWallet: owns the ERC-721 token
  const operatorSigner = new ethers.Wallet(privateKey, provider);

  // signer used to sign TradeIntents + checkpoints (EOA or owner of an ERC-1271 wallet)
  const agentSignerKey = process.env.AGENT_SIGNER_PRIVATE_KEY || process.env.AGENT_WALLET_PRIVATE_KEY || privateKey;
  const agentSigner = new ethers.Wallet(agentSignerKey, provider);
  const agentWalletAddress = process.env.AGENT_WALLET_ADDRESS || agentSigner.address;

  // Resolve agent identity (registers ERC-721 on first run)
  const agentId = await getAgentId(operatorSigner, registryAddress, {
    name: AGENT_NAME,
    description: "Autonomous AI trading agent with ERC-8004 identity, Kraken CLI execution, and EIP-712 checkpoints",
    capabilities: ["trading", "analysis", "explainability", "eip712-signing"],
    agentWallet: agentWalletAddress,
    agentURI: `data:application/json,${encodeURIComponent(JSON.stringify({
      name: AGENT_NAME,
      description: "ERC-8004 compliant AI trading agent",
      capabilities: ["trading", "analysis", "eip712-signing"],
      agentWallet: agentWalletAddress,
      version: "1.0.0",
    }))}`,
  });

  // Fetch registration to confirm agentWallet
  const reg = await getAgentRegistration(provider, registryAddress, agentId);
  console.log(`[agent] agentWallet: ${reg.agentWallet}`);
  if (reg.agentWallet.toLowerCase() !== agentSigner.address.toLowerCase()) {
    console.log(`[agent] Using delegated signer ${agentSigner.address} for ERC-1271 wallet ${reg.agentWallet}`);
  }

  // Init clients
  const prismMarketFeed = MARKET_DATA_MODE === "prism" ? new PrismMarketClient() : null;
  const marketFeed: MarketAdapter = prismMarketFeed
    ? prismMarketFeed
    : MARKET_DATA_MODE === "kraken"
      ? new LiveMarketClient()
      : new MockExchangeClient();
  const executionBroker: ExecutionAdapter = EXECUTION_MODE === "kraken"
    ? new KrakenClient()
    : new PaperExchangeClient({ fillsFile: FILLS_FILE });
  const riskRouter = new RiskRouterClient(routerAddress, agentSigner, chainId);
  const validation = new ValidationRegistryClient(validationAddress, agentSigner);
  const reputationRegistry = process.env.REPUTATION_REGISTRY_ADDRESS
    ? new ReputationRegistryClient(process.env.REPUTATION_REGISTRY_ADDRESS, provider)
    : null;

  const artifactIdentity = buildArtifactIdentityReport({
    expectedAgentId: agentId.toString(),
    checkpointsFile: CHECKPOINTS_FILE,
    fillsFile: FILLS_FILE,
    tracesFile: PLANNER_TRACES_FILE,
    reputationEvidenceFile: REPUTATION_FEEDBACK_FILE,
  });
  if (!artifactIdentity.pass) {
    throw new Error(`[agent] Existing artifacts do not belong exclusively to agent ${agentId.toString()}: ${artifactIdentity.failReasons.join("; ")}`);
  }

  const baselineCapitalUsd = parsePositiveNumberEnv("METRICS_BASELINE_USD", 10_000);
  const equityReportIntervalMs = Math.max(5_000, parsePositiveNumberEnv("EQUITY_REPORT_INTERVAL_MS", 60_000));
  const equityReportingEnabled = (process.env.ENABLE_EQUITY_REPORTING || "true").toLowerCase() !== "false";
  const breakerMaxDailyLossUsd = parsePositiveNumberEnv("BREAKER_MAX_DAILY_LOSS_USD", Math.max(25, baselineCapitalUsd * 0.02));
  let lastEquityReportAt = 0;
  let lastFreshScoreWindowMessage: string | null = null;

  const riskControlState: RuntimeRiskControlState = {
    cppiScale: 1,
    cppiFloorUsd: baselineCapitalUsd * CPPI_FLOOR_RATIO,
    cppiCushionUsd: baselineCapitalUsd - (baselineCapitalUsd * CPPI_FLOOR_RATIO),
    cppiHeadroomBps: 10_000,
    consecutiveLosses: 0,
    dailyLossUsd: 0,
    dayKey: currentUtcDayKey(),
    breakerActive: false,
    breakerReason: null,
    breakerTriggeredAtMs: null,
    volatilityThrottleActive: false,
    volatilityPct: null,
    appliedTradeScale: 1,
    lastNetPnlUsd: null,
    dailyBudgetStatus: "blocked",
    dailyBudgetLimitUsd: breakerMaxDailyLossUsd,
    dailyBudgetRemainingUsd: 0,
    dailyBudgetUtilizationPct: 1,
    dailyBudgetMultiplier: 0,
    dailyBudgetReason: "daily budget uninitialized",
  };

  const reputationRaters: ReputationRater[] = [];
  const fixedReputationScore = parseOptionalReputationScore();
  if (reputationLoopEnabled) {
    const reputationAddress = requireEnv("REPUTATION_REGISTRY_ADDRESS");
    const configuredRaterKeys = parseReputationRaterPrivateKeys(process.env.REPUTATION_RATER_PRIVATE_KEYS || "");
    const fallbackRaterKey = (process.env.REPUTATION_RATER_PRIVATE_KEY || "").trim();
    if (configuredRaterKeys.length === 0) {
      configuredRaterKeys.push(requireEnv("REPUTATION_RATER_PRIVATE_KEY"));
    } else if (fallbackRaterKey.length > 0) {
      configuredRaterKeys.push(fallbackRaterKey);
    }

    const seenRaterAddresses = new Set<string>();
    for (const raterPrivateKey of configuredRaterKeys) {
      const reputationSigner = new ethers.Wallet(raterPrivateKey, provider);
      const normalizedAddress = reputationSigner.address.toLowerCase();
      if (seenRaterAddresses.has(normalizedAddress)) {
        continue;
      }

      seenRaterAddresses.add(normalizedAddress);
      reputationRaters.push({
        client: new ReputationRegistryClient(reputationAddress, reputationSigner),
        address: reputationSigner.address,
      });
    }

    if (reputationRaters.length === 0) {
      throw new Error("[agent] Reputation loop enabled but no valid rater private keys were configured");
    }
  }

  console.log(`\n[agent] Starting agent loop`);
  console.log(`[agent] agentId:  ${agentId}`);
  console.log(`[agent] Pair:     ${TRADING_PAIR}`);
  console.log(`[agent] Exec:     ${EXECUTION_MODE}`);
  console.log(`[agent] Market:   ${MARKET_DATA_MODE}`);
  console.log(`[agent] Planner:  ${formatPlannerProvider(getConfiguredPlannerProvider())}`);
  console.log(`[agent] Chain ID: ${chainId}`);
  console.log(`[agent] Interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`[agent] Checkpoints: ${CHECKPOINTS_FILE}\n`);
  console.log(`[agent] Fills: ${FILLS_FILE}\n`);
  if (equityReportingEnabled) {
    console.log(`[agent] Equity reporting: enabled (${Math.round(equityReportIntervalMs / 1000)}s cadence)`);
    console.log(`[agent] Equity report: ${EQUITY_REPORT_FILE}\n`);
    console.log(`[agent] CPPI: floor=${CPPI_FLOOR_RATIO.toFixed(3)} multiplier=${CPPI_MULTIPLIER.toFixed(2)} minScale=${CPPI_MIN_SCALE_TO_TRADE.toFixed(3)}`);
  }
  if (reputationRaters.length > 0) {
    const preview = reputationRaters
      .slice(0, 3)
      .map((rater) => rater.address)
      .join(", ");
    console.log(`[agent] Reputation loop: enabled (${reputationRaters.length} rater(s))`);
    console.log(`[agent] Reputation raters: ${preview}${reputationRaters.length > 3 ? ", ..." : ""}`);
    console.log(`[agent] Reputation evidence: ${REPUTATION_FEEDBACK_FILE}\n`);
  }
  if (strictMode && (process.env.ENABLE_REPUTATION_LOOP || "").trim().toLowerCase() !== "true") {
    console.log(`[agent] SUBMISSION_STRICT=true will use the reputation loop for submission parity`);
  }
  console.log(`[agent] Reputation context: ${REPUTATION_CONTEXT_FILE}`);
  console.log(`[agent] Circuit breaker: enabled=${CIRCUIT_BREAKER_ENABLED} maxLossStreak=${BREAKER_MAX_CONSECUTIVE_LOSSES} maxDailyLossUsd=${breakerMaxDailyLossUsd.toFixed(2)} pause=${Math.round(BREAKER_PAUSE_MS / 1000)}s`);

  if (chainId !== providerChainId) {
    console.warn(`[agent] CHAIN_ID override (${chainId}) differs from provider network chainId (${providerChainId})`);
  }

  type RuntimeEquitySnapshot = Awaited<ReturnType<typeof buildEquityReportPayload>>;

  const syncPlannerRuntimeHints = () => {
    process.env.PLANNER_RUNTIME_BREAKER_ACTIVE = riskControlState.breakerActive ? "true" : "false";
    process.env.PLANNER_RUNTIME_LOSS_STREAK = String(riskControlState.consecutiveLosses);
    process.env.PLANNER_RUNTIME_DAILY_LOSS_USD = riskControlState.dailyLossUsd.toFixed(2);
    process.env.PLANNER_RUNTIME_VOL_THROTTLE_ACTIVE = riskControlState.volatilityThrottleActive ? "true" : "false";
    process.env.PLANNER_RUNTIME_VOLATILITY_PCT = riskControlState.volatilityPct !== null
      ? riskControlState.volatilityPct.toFixed(4)
      : "";
    process.env.PLANNER_RUNTIME_CPPI_SCALE = riskControlState.cppiScale.toFixed(4);
    process.env.PLANNER_MAX_TRADE_USD = PLANNER_MAX_TRADE_USD.toFixed(2);
    process.env.PLANNER_MAX_TRADES_PER_HOUR = String(PLANNER_MAX_TRADES_PER_HOUR);
    process.env.PLANNER_MAX_SLIPPAGE_BPS = String(PLANNER_MAX_SLIPPAGE_BPS);
    process.env.PLANNER_MIN_CONFIDENCE = PLANNER_MIN_CONFIDENCE.toFixed(4);
    process.env.PLANNER_MIN_EXPECTED_EDGE_BPS = String(PLANNER_MIN_EXPECTED_EDGE_BPS);
    process.env.INDICATOR_TRADE_AMOUNT_USD = INDICATOR_TRADE_AMOUNT_USD.toFixed(2);
    process.env.INDICATOR_MIN_CONFIDENCE = INDICATOR_MIN_CONFIDENCE.toFixed(4);
    process.env.INDICATOR_MIN_NET_EDGE_BPS = String(INDICATOR_MIN_NET_EDGE_BPS);
    process.env.INDICATOR_MIN_TRADE_INTERVAL_MS = String(INDICATOR_MIN_TRADE_INTERVAL_MS);
    process.env.DUAL_GATE_PROBE_USD = DUAL_GATE_PROBE_USD.toFixed(2);
    process.env.DUAL_GATE_PROBE_MIN_CONFIDENCE = DUAL_GATE_PROBE_MIN_CONFIDENCE.toFixed(4);

    process.env.PLANNER_RUNTIME_DAILY_BUDGET_STATUS = riskControlState.dailyBudgetStatus;
    process.env.PLANNER_RUNTIME_DAILY_BUDGET_REMAINING_USD = riskControlState.dailyBudgetRemainingUsd.toFixed(2);
    process.env.PLANNER_RUNTIME_DAILY_BUDGET_LIMIT_USD = riskControlState.dailyBudgetLimitUsd.toFixed(2);
    process.env.PLANNER_RUNTIME_DAILY_BUDGET_UTILIZATION_PCT = riskControlState.dailyBudgetUtilizationPct.toFixed(4);
    process.env.PLANNER_RUNTIME_DAILY_BUDGET_MULTIPLIER = riskControlState.dailyBudgetMultiplier.toFixed(4);
    process.env.PLANNER_RUNTIME_DAILY_BUDGET_REASON = riskControlState.dailyBudgetReason;

    const adaptiveSummary = (process.env.ADAPTIVE_POLICY_SUMMARY || "").trim();
    const budgetSummary = formatDailyRiskBudgetSummary({
      status: riskControlState.dailyBudgetStatus,
      multiplier: riskControlState.dailyBudgetMultiplier,
      remainingBudgetUsd: riskControlState.dailyBudgetRemainingUsd,
      utilizationPct: riskControlState.dailyBudgetUtilizationPct,
      reason: riskControlState.dailyBudgetReason,
    });
    if (adaptiveSummary.length === 0) {
      process.env.ADAPTIVE_POLICY_SUMMARY = budgetSummary;
    } else if (!adaptiveSummary.includes("dailyBudget=")) {
      process.env.ADAPTIVE_POLICY_SUMMARY = `${adaptiveSummary} || ${budgetSummary}`;
    }
  };

  const refreshAdaptivePolicy = async (): Promise<Awaited<ReturnType<typeof buildAdaptiveRuntimePolicy>>> => {
    const policy = await buildAdaptiveRuntimePolicy({
      agentId,
      validationRegistry: validation,
      reputationRegistry,
      reputationEvidenceFile: REPUTATION_FEEDBACK_FILE,
      baseConfidenceFloor: INDICATOR_MIN_CONFIDENCE,
      baseEdgeFloorBps: Math.max(INDICATOR_MIN_NET_EDGE_BPS, DUAL_GATE_MIN_NET_EDGE_BPS),
      baseTradeAmountUsd: INDICATOR_TRADE_AMOUNT_USD,
      baseProbeAmountUsd: DUAL_GATE_PROBE_USD,
      baseTradeIntervalMs: INDICATOR_MIN_TRADE_INTERVAL_MS,
      targetValidationScore: 82,
      targetReputationScore: 90,
    });

    applyAdaptiveRuntimeHints(policy);
    return policy;
  };

  const refreshRiskStateFromEquity = (snapshot: RuntimeEquitySnapshot | null, volatilityPct: number | null) => {
    if (!snapshot) {
      return;
    }

    const dayKey = currentUtcDayKey();
    if (dayKey !== riskControlState.dayKey) {
      riskControlState.dayKey = dayKey;
      riskControlState.dailyLossUsd = 0;
      riskControlState.consecutiveLosses = 0;
      riskControlState.breakerActive = false;
      riskControlState.breakerReason = null;
      riskControlState.breakerTriggeredAtMs = null;
    }

    const netPnlUsd = snapshot.performance.netPnlUsd;
    if (riskControlState.lastNetPnlUsd !== null) {
      const delta = netPnlUsd - riskControlState.lastNetPnlUsd;
      if (delta < 0) {
        riskControlState.consecutiveLosses += 1;
        riskControlState.dailyLossUsd += Math.abs(delta);
      } else if (delta > 0) {
        riskControlState.consecutiveLosses = 0;
      }
    }
    riskControlState.lastNetPnlUsd = netPnlUsd;

    const peak = snapshot.drawdownEvidence.peakEquityUsd;
    const current = snapshot.drawdownEvidence.currentEquityUsd;
    const floor = peak * CPPI_FLOOR_RATIO;
    const cushion = Math.max(0, current - floor);
    const cushionSpan = Math.max(1, peak - floor);
    const cppiScale = Math.max(0, Math.min(1, (cushion / cushionSpan) * CPPI_MULTIPLIER));
    const drawdownLimitBps = snapshot.guardrails?.maxDrawdownBps ?? Number(process.env.PHASE2_MAX_DRAWDOWN_BPS || "500");

    riskControlState.cppiFloorUsd = floor;
    riskControlState.cppiCushionUsd = cushion;
    riskControlState.cppiScale = cppiScale;
    riskControlState.cppiHeadroomBps = Math.max(0, drawdownLimitBps - snapshot.drawdownEvidence.currentDrawdownBps);
    riskControlState.volatilityPct = volatilityPct;
    riskControlState.volatilityThrottleActive = (
      typeof volatilityPct === "number"
      && Number.isFinite(volatilityPct)
      && volatilityPct >= VOLATILITY_THROTTLE_PCT
    );

    if (!CIRCUIT_BREAKER_ENABLED) {
      riskControlState.breakerActive = false;
      riskControlState.breakerReason = null;
      riskControlState.breakerTriggeredAtMs = null;
      syncPlannerRuntimeHints();
      return;
    }

    const nowMs = Date.now();
    const pauseElapsed = (
      riskControlState.breakerTriggeredAtMs !== null
      && nowMs - riskControlState.breakerTriggeredAtMs > BREAKER_PAUSE_MS
    );
    if (pauseElapsed) {
      riskControlState.breakerActive = false;
      riskControlState.breakerReason = null;
      riskControlState.breakerTriggeredAtMs = null;
      riskControlState.consecutiveLosses = 0;
    }

    if (riskControlState.consecutiveLosses >= BREAKER_MAX_CONSECUTIVE_LOSSES) {
      riskControlState.breakerActive = true;
      riskControlState.breakerReason = `loss-streak-${riskControlState.consecutiveLosses}`;
      if (riskControlState.breakerTriggeredAtMs === null) {
        riskControlState.breakerTriggeredAtMs = nowMs;
      }
    }

    if (riskControlState.dailyLossUsd >= breakerMaxDailyLossUsd) {
      riskControlState.breakerActive = true;
      riskControlState.breakerReason = `daily-loss-${riskControlState.dailyLossUsd.toFixed(2)}`;
      if (riskControlState.breakerTriggeredAtMs === null) {
        riskControlState.breakerTriggeredAtMs = nowMs;
      }
    }

    if (riskControlState.cppiScale < CPPI_MIN_SCALE_TO_TRADE) {
      riskControlState.breakerActive = true;
      riskControlState.breakerReason = `cppi-scale-${riskControlState.cppiScale.toFixed(3)}`;
      if (riskControlState.breakerTriggeredAtMs === null) {
        riskControlState.breakerTriggeredAtMs = nowMs;
      }
    }

    const budgetPolicy = evaluateDailyRiskBudget({
      maxDailyLossUsd: riskControlState.dailyBudgetLimitUsd,
      dailyLossUsd: riskControlState.dailyLossUsd,
      breakerActive: riskControlState.breakerActive,
      breakerReason: riskControlState.breakerReason,
      consecutiveLosses: riskControlState.consecutiveLosses,
      cppiScale: riskControlState.cppiScale,
      volatilityThrottleActive: riskControlState.volatilityThrottleActive,
      volatilityPct: riskControlState.volatilityPct,
    });

    riskControlState.dailyBudgetStatus = budgetPolicy.status;
    riskControlState.dailyBudgetRemainingUsd = budgetPolicy.remainingBudgetUsd;
    riskControlState.dailyBudgetUtilizationPct = budgetPolicy.utilizationPct;
    riskControlState.dailyBudgetMultiplier = budgetPolicy.multiplier;
    riskControlState.dailyBudgetReason = budgetPolicy.reason;

    syncPlannerRuntimeHints();
  };

  const withDecisionContext = (
    decision: TradeDecision,
    indicatorSnapshot: ReturnType<typeof buildIndicatorSnapshot>,
    edgeThresholdBps: number
  ): TradeDecision => {
    const existing = decision.decisionContext || {};
    const context: DecisionContext = {
      ...existing,
      regimeLabel: indicatorSnapshot.regimeLabel,
      regimeConfidence: indicatorSnapshot.regimeConfidence,
      expectedEdgeBps: indicatorSnapshot.expectedEdgeBps,
      costDragBps: indicatorSnapshot.costDragBps,
      netEdgeBps: indicatorSnapshot.netEdgeBps,
      edgeThresholdBps,
      cppiScale: riskControlState.cppiScale,
      breakerState: riskControlState.breakerActive
        ? (riskControlState.breakerReason || "active")
        : "clear",
      riskGateStatus: existing.riskGateStatus || "pre-check",
      executionIntent: existing.executionIntent || (decision.action === "HOLD" ? "stand-down" : `${decision.action.toLowerCase()}-intent`),
    };

    return {
      ...decision,
      decisionContext: context,
    };
  };

  syncPlannerRuntimeHints();

  // ─────────────────────────────────────────────────────────────────────────
  // Main tick
  // ─────────────────────────────────────────────────────────────────────────

  const reportRuntimeEquity = async (marketPriceUsd: number, reason: string, force = false) => {
    if (!equityReportingEnabled) {
      return null;
    }

    const nowMs = Date.now();
    if (!force && nowMs - lastEquityReportAt < equityReportIntervalMs) {
      return null;
    }

    try {
      const payload = await buildEquityReportPayload({
        agentId,
        pair: TRADING_PAIR,
        baselineCapitalUsd,
        provider,
        routerAddress,
        checkpointsFile: CHECKPOINTS_FILE,
        fillsFile: FILLS_FILE,
        tracesFile: PLANNER_TRACES_FILE,
        reputationEvidenceFile: REPUTATION_FEEDBACK_FILE,
        currentPriceUsd: marketPriceUsd,
        reason,
        strictAgentId: true,
        runtimeRiskControls: {
          breakerActive: riskControlState.breakerActive,
          breakerReason: riskControlState.breakerReason,
          consecutiveLosses: riskControlState.consecutiveLosses,
          dailyLossUsd: round2(riskControlState.dailyLossUsd),
          dailyBudgetStatus: riskControlState.dailyBudgetStatus,
          dailyBudgetRemainingUsd: round2(riskControlState.dailyBudgetRemainingUsd),
          dailyBudgetLimitUsd: round2(riskControlState.dailyBudgetLimitUsd),
          dailyBudgetUtilizationPct: round2(riskControlState.dailyBudgetUtilizationPct * 100),
          dailyBudgetMultiplier: round2(riskControlState.dailyBudgetMultiplier),
          volatilityThrottleActive: riskControlState.volatilityThrottleActive,
          volatilityPct: riskControlState.volatilityPct,
          appliedTradeScale: Number(riskControlState.appliedTradeScale.toFixed(4)),
        },
      });

      fs.writeFileSync(
        EQUITY_REPORT_FILE,
        JSON.stringify(payload, null, 2)
      );

      lastEquityReportAt = nowMs;
      return payload;
    } catch (error) {
      console.warn("[agent] Equity report failed (non-fatal):", error);
      return null;
    }
  };

  const tick = async () => {
    try {
      // 1. Fetch market data via selected exchange adapter
      const market = prismMarketFeed
        ? await prismMarketFeed.getTicker(TRADING_PAIR, { forceFresh: true })
        : await marketFeed.getTicker(TRADING_PAIR);
      console.log(`[agent] ${TRADING_PAIR} @ $${market.price.toLocaleString()}`);
      let equitySnapshot = await reportRuntimeEquity(market.price, "cadence");

      const indicatorSnapshot = buildIndicatorSnapshot({
        market,
        checkpointsFile: CHECKPOINTS_FILE,
        lookback: parseBoundedNumberEnv("PLANNER_INDICATOR_LOOKBACK", 80, 10, 300),
      });
      refreshRiskStateFromEquity(equitySnapshot, indicatorSnapshot.realizedVolPct);

      const adaptivePolicy = await refreshAdaptivePolicy();
      syncPlannerRuntimeHints();
      const freshScoreWindowMessage = adaptivePolicy.freshScoreWindowRecommended
        ? `[agent] Fresh score window recommended: ${adaptivePolicy.freshScoreWindowReason}`
        : `[agent] Score window stable: ${adaptivePolicy.freshScoreWindowReason}`;
      if (freshScoreWindowMessage !== lastFreshScoreWindowMessage) {
        console.log(freshScoreWindowMessage);
        lastFreshScoreWindowMessage = freshScoreWindowMessage;
      }

      // 2. Strategy decision
      let decision = await strategy.analyze(market);
      decision = withDecisionContext(decision, indicatorSnapshot, adaptivePolicy.edgeFloorBps);
      syncPlannerRuntimeHints();

      const initialDecisionAmount = decision.amount;

      if (decision.action !== "HOLD" && decision.amount > 0) {
        const dualGate = applyDualGatePolicy({
          decision,
          indicatorSnapshot,
          options: {
            enabled: DUAL_GATE_ENABLED,
            minNetEdgeBps: adaptivePolicy.edgeFloorBps,
            probeAmountUsd: adaptivePolicy.probeAmountUsd,
            probeMinConfidence: adaptivePolicy.probeMinConfidence,
          },
        });
        decision = {
          ...dualGate.decision,
          decisionContext: {
            ...dualGate.decision.decisionContext,
            dualGateStatus: `${dualGate.status} (${dualGate.reason})`,
          },
        };
      }

      const regimeSizingModule = await import("./regime-sizing");
      const regimeSizingPolicy = regimeSizingModule.evaluateRegimeAwareSizing({
        indicatorSnapshot,
        currentAmountUsd: decision.amount,
      });
      process.env.REGIME_SIZING_SUMMARY = regimeSizingModule.formatRegimeSizingSummary(regimeSizingPolicy);
      decision.decisionContext = regimeSizingModule.createRegimeSizingDecisionContext(decision.decisionContext, regimeSizingPolicy);

      if (decision.action !== "HOLD" && decision.amount > 0) {
        const maxTradeUsd = parsePositiveNumberEnv("PLANNER_MAX_TRADE_USD", Math.max(decision.amount, 1));
        const sizedAmount = round2(Math.min(decision.amount * regimeSizingPolicy.multiplier, maxTradeUsd));
        if (sizedAmount <= 0) {
          decision.action = "HOLD";
          decision.amount = 0;
          decision.reasoning += ` [REGIME-SIZE blocked: ${regimeSizingPolicy.reason}]`;
          decision.decisionContext = {
            ...decision.decisionContext,
            riskGateStatus: "regime-size-block",
            executionIntent: "hold-regime-size",
          };
        } else if (Math.abs(sizedAmount - decision.amount) >= 0.01) {
          decision.amount = sizedAmount;
          const regimeReason = regimeSizingPolicy.status === "expanded"
            ? `expanded to ${sizedAmount.toFixed(2)}USD`
            : `reduced to ${sizedAmount.toFixed(2)}USD`;
          decision.reasoning += ` [REGIME-SIZE ${regimeReason}: ${regimeSizingPolicy.reason}]`;
          decision.decisionContext = {
            ...decision.decisionContext,
            riskGateStatus: regimeSizingPolicy.status === "expanded" ? "regime-size-expand" : "regime-size-reduce",
            executionIntent: regimeSizingPolicy.status === "expanded" ? "regime-expanded" : "regime-reduced",
          };
        }
      }

      if (decision.action !== "HOLD" && decision.amount > 0 && riskControlState.volatilityThrottleActive) {
        const throttledAmount = round2(decision.amount * VOLATILITY_SIZE_MULTIPLIER);
        if (throttledAmount <= 0) {
          decision.action = "HOLD";
          decision.amount = 0;
          decision.reasoning += ` [VOL-THROTTLE blocked: volatility ${riskControlState.volatilityPct?.toFixed(2)}% >= ${VOLATILITY_THROTTLE_PCT.toFixed(2)}%]`;
        } else if (throttledAmount < decision.amount) {
          decision.amount = throttledAmount;
          decision.reasoning += ` [VOL-THROTTLE size ${throttledAmount.toFixed(2)}USD, volatility ${riskControlState.volatilityPct?.toFixed(2)}%]`;
          decision.decisionContext = {
            ...decision.decisionContext,
            riskGateStatus: "volatility-throttle",
          };
        }
      }

      if (decision.action !== "HOLD" && decision.amount > 0 && riskControlState.breakerActive) {
        const reason = riskControlState.breakerReason || "circuit-breaker-active";
        decision.action = "HOLD";
        decision.amount = 0;
        decision.reasoning += ` [CIRCUIT-BREAKER blocked: ${reason}]`;
        decision.decisionContext = {
          ...decision.decisionContext,
          riskGateStatus: `breaker:${reason}`,
          executionIntent: "hold-breaker",
        };
      }

      const dailyBudgetPolicy = evaluateDailyRiskBudget({
        maxDailyLossUsd: riskControlState.dailyBudgetLimitUsd,
        dailyLossUsd: riskControlState.dailyLossUsd,
        breakerActive: riskControlState.breakerActive,
        breakerReason: riskControlState.breakerReason,
        consecutiveLosses: riskControlState.consecutiveLosses,
        cppiScale: riskControlState.cppiScale,
        volatilityThrottleActive: riskControlState.volatilityThrottleActive,
        volatilityPct: riskControlState.volatilityPct,
      });

      riskControlState.dailyBudgetStatus = dailyBudgetPolicy.status;
      riskControlState.dailyBudgetRemainingUsd = dailyBudgetPolicy.remainingBudgetUsd;
      riskControlState.dailyBudgetUtilizationPct = dailyBudgetPolicy.utilizationPct;
      riskControlState.dailyBudgetMultiplier = dailyBudgetPolicy.multiplier;
      riskControlState.dailyBudgetReason = dailyBudgetPolicy.reason;

      if (decision.action !== "HOLD" && decision.amount > 0) {
        if (dailyBudgetPolicy.status === "blocked") {
          decision.action = "HOLD";
          decision.amount = 0;
          decision.reasoning += ` [DAILY-BUDGET blocked: ${dailyBudgetPolicy.reason}]`;
          decision.decisionContext = createDailyBudgetDecisionContext(decision.decisionContext, dailyBudgetPolicy, riskControlState.dailyBudgetLimitUsd);
          decision.decisionContext = {
            ...decision.decisionContext,
            riskGateStatus: "daily-budget-block",
            executionIntent: "hold-daily-budget",
          };
        } else if (dailyBudgetPolicy.status === "throttled") {
          const budgetScaledAmount = round2(decision.amount * dailyBudgetPolicy.multiplier);
          if (budgetScaledAmount <= 0) {
            decision.action = "HOLD";
            decision.amount = 0;
            decision.reasoning += ` [DAILY-BUDGET blocked: ${dailyBudgetPolicy.reason}]`;
            decision.decisionContext = createDailyBudgetDecisionContext(decision.decisionContext, dailyBudgetPolicy, riskControlState.dailyBudgetLimitUsd);
            decision.decisionContext = {
              ...decision.decisionContext,
              riskGateStatus: "daily-budget-block",
              executionIntent: "hold-daily-budget",
            };
          } else if (budgetScaledAmount < decision.amount) {
            decision.amount = budgetScaledAmount;
            decision.reasoning += ` [DAILY-BUDGET size ${budgetScaledAmount.toFixed(2)}USD, remaining $${dailyBudgetPolicy.remainingBudgetUsd.toFixed(2)}]`;
            decision.decisionContext = createDailyBudgetDecisionContext(decision.decisionContext, dailyBudgetPolicy, riskControlState.dailyBudgetLimitUsd);
            decision.decisionContext = {
              ...decision.decisionContext,
              riskGateStatus: "daily-budget-throttle",
              executionIntent: "budget-throttled",
            };
          } else {
            decision.decisionContext = createDailyBudgetDecisionContext(decision.decisionContext, dailyBudgetPolicy, riskControlState.dailyBudgetLimitUsd);
          }
        } else {
          decision.decisionContext = createDailyBudgetDecisionContext(decision.decisionContext, dailyBudgetPolicy, riskControlState.dailyBudgetLimitUsd);
        }
      } else {
        decision.decisionContext = createDailyBudgetDecisionContext(decision.decisionContext, dailyBudgetPolicy, riskControlState.dailyBudgetLimitUsd);
      }

      // 3. Human-readable explanation
      const explanation = formatExplanation(decision, market);
      console.log(explanation);

      // Write planner trace for both LLM and indicator strategies
      {
        const llm = strategy instanceof LLMStrategy ? strategy.lastPlannerResult : null;
        fs.appendFileSync(
          PLANNER_TRACES_FILE,
          JSON.stringify({
            agentId: agentId.toString(),
            timestamp: Math.floor(Date.now() / 1000),
            pair: market.pair,
            priceUsd: market.price,
            model: llm?.model ?? "indicator",
            keyLabel: llm?.keyLabel ?? "indicator",
            usedFallback: llm?.usedFallback ?? false,
            plannerDecision: llm?.decision ?? null,
            decision,
            promptVersion: llm?.plannerResponse?.promptVersion ?? null,
            toolResults: llm?.toolResults ?? null,
            rawResponse: llm?.rawResponse ?? null,
            runtimeRiskState: {
              cppiScale: Number(riskControlState.cppiScale.toFixed(4)),
              breakerActive: riskControlState.breakerActive,
              breakerReason: riskControlState.breakerReason,
              dailyBudgetStatus: riskControlState.dailyBudgetStatus,
              dailyBudgetRemainingUsd: round2(riskControlState.dailyBudgetRemainingUsd),
              dailyBudgetMultiplier: round2(riskControlState.dailyBudgetMultiplier),
              volatilityThrottleActive: riskControlState.volatilityThrottleActive,
              volatilityPct: riskControlState.volatilityPct,
            },
          }) + "\n"
        );
      }


        riskControlState.appliedTradeScale = initialDecisionAmount > 0
          ? Math.max(0, Math.min(1, decision.amount / Math.max(initialDecisionAmount, 1)))
          : 0;
      let intentHash = HOLD_INTENT_HASH;
      let fillExecuted = false;
      const netPnlBeforeTrade = equitySnapshot?.performance.netPnlUsd ?? null;

      // 4. Actionable trade: submit signed TradeIntent to RiskRouter
      if (decision.action !== "HOLD" && decision.amount > 0) {
        const cppiScale = Math.max(0, Math.min(1, riskControlState.cppiScale));
        if (cppiScale < CPPI_MIN_SCALE_TO_TRADE) {
          const cppiReason = `CPPI scale ${cppiScale.toFixed(3)} below min ${CPPI_MIN_SCALE_TO_TRADE.toFixed(3)}`;
          console.warn(`[agent] Trade skipped before signing: ${cppiReason}`);
          decision.action = "HOLD";
          decision.amount = 0;
          decision.reasoning += ` [BLOCKED by CPPI floor: ${cppiReason}]`;
          decision.decisionContext = {
            ...decision.decisionContext,
            riskGateStatus: "cppi-floor-block",
            executionIntent: "hold-cppi-floor",
          };
        } else if (cppiScale < 1) {
          const scaledAmount = round2(decision.amount * cppiScale);
          if (scaledAmount <= 0) {
            decision.action = "HOLD";
            decision.amount = 0;
            decision.reasoning += ` [BLOCKED by CPPI scale collapse: ${cppiScale.toFixed(3)}]`;
            decision.decisionContext = {
              ...decision.decisionContext,
              riskGateStatus: "cppi-scale-collapse",
              executionIntent: "hold-cppi-collapse",
            };
          } else if (scaledAmount < decision.amount) {
            decision.amount = scaledAmount;
            decision.reasoning += ` [CPPI size-adjusted to ${scaledAmount.toFixed(2)}USD (scale=${cppiScale.toFixed(3)})]`;
            decision.decisionContext = {
              ...decision.decisionContext,
              riskGateStatus: "cppi-size-adjust",
              cppiScale,
            };
          }
        }

        const guardrails = equitySnapshot?.guardrails;
        const drawdownEvidence = equitySnapshot?.drawdownEvidence;
        if (
          guardrails?.active
          && guardrails.maxDrawdownBps > 0
          && typeof drawdownEvidence?.currentDrawdownBps === "number"
          && drawdownEvidence.currentDrawdownBps > guardrails.maxDrawdownBps
        ) {
          const breakerReason = `Local drawdown guardrail active (${drawdownEvidence.currentDrawdownBps} bps > ${guardrails.maxDrawdownBps} bps)`;
          console.warn(`[agent] Trade skipped before signing: ${breakerReason}`);
          decision.action = "HOLD";
          decision.amount = 0;
          decision.reasoning += ` [BLOCKED by local drawdown guardrail: ${breakerReason}]`;
          decision.decisionContext = {
            ...decision.decisionContext,
            riskGateStatus: "router-drawdown-guardrail",
            executionIntent: "hold-router-drawdown",
          };
        }

        const riskParams = await riskRouter.getRiskParams(agentId);
        const tradeRecord = await riskRouter.getTradeRecord(agentId);
        if (decision.action !== "HOLD" && riskParams.active && riskParams.maxTradesPerHour > 0 && tradeRecord.count >= BigInt(riskParams.maxTradesPerHour)) {
          const capReason = `Hourly trade cap reached (${tradeRecord.count.toString()}/${riskParams.maxTradesPerHour}); waiting for the next window`;
          console.warn(`[agent] Trade skipped before signing: ${capReason}`);
          decision.action = "HOLD";
          decision.amount = 0;
          decision.reasoning += ` [BLOCKED by RiskRouter: ${capReason}]`;
          decision.decisionContext = {
            ...decision.decisionContext,
            riskGateStatus: "router-trade-cap",
            executionIntent: "hold-router-cap",
          };
        } else {

          // 4a. Build + sign the TradeIntent (EIP-712)
          const intent = await riskRouter.buildIntent(
            agentId,
            reg.agentWallet,
            decision.pair,
            decision.action as "BUY" | "SELL",
            decision.amount
          );
          const signed = await riskRouter.signIntent(intent, agentSigner);
          intentHash = signed.intentHash;

          console.log(`[agent] TradeIntent signed. nonce=${intent.nonce}, deadline=${new Date(Number(intent.deadline) * 1000).toISOString()}`);

          // 4b. Submit to RiskRouter — on-chain validation
          const validation_result = await riskRouter.submitIntent(signed);

          if (!validation_result.approved) {
            const rejectionReason = validation_result.reason || "RiskRouter rejected the intent without returning a reason";
            console.warn(`[agent] TradeIntent REJECTED by RiskRouter: ${rejectionReason}`);
            // Don't execute — fall through to checkpoint (HOLD behaviour)
            decision.action = "HOLD";
            decision.amount = 0;
            decision.reasoning += ` [BLOCKED by RiskRouter: ${rejectionReason}]`;
            decision.decisionContext = {
              ...decision.decisionContext,
              riskGateStatus: "router-rejected",
              executionIntent: "hold-router-reject",
            };
          } else if (decision.action === "HOLD") {
            console.log("[agent] RiskRouter approved a HOLD decision; skipping execution.");
          } else {
            // 4c. Execute via selected adapter (wrapped so checkpoint still posts on failure)
          try {
            const volumeBase = (decision.amount / market.price).toFixed(8);
            const result = await executionBroker.placeOrder({
              pair:      decision.pair,
              type:      decision.action === "BUY" ? "buy" : "sell",
              ordertype: "market",
              volume:    volumeBase,
            });
            console.log(`[agent] Order placed: ${result.txid.join(", ")}`);
            console.log(`[agent] ${result.descr.order}`);

            const fill: TradeFill = {
              timestamp: Math.floor(Date.now() / 1000),
              agentId: agentId.toString(),
              pair: decision.pair,
              action: decision.action,
              amountUsd: decision.amount,
              priceUsd: market.price,
              volumeBase: Number(volumeBase),
              intentHash,
              txid: result.txid[0] ?? "",
              order: result.descr.order,
              mode: EXECUTION_MODE,
            };
            if (executionBroker instanceof PaperExchangeClient) {
              executionBroker.recordFill(fill);
            } else {
              fs.appendFileSync(FILLS_FILE, JSON.stringify(fill) + "\n");
            }
            fillExecuted = true;

            if (reputationRaters.length > 0) {
              try {
                const outcomeSeed = `${intentHash}:${fill.txid}:${fill.timestamp}`;
                const outcomeRef = ethers.keccak256(ethers.toUtf8Bytes(outcomeSeed));
                const score = fixedReputationScore ?? Math.max(1, Math.min(100, Math.round(decision.confidence * 100)));
                const comment = `Auto feedback for ${fill.action} ${fill.pair} txid=${fill.txid || "n/a"} mode=${EXECUTION_MODE}`;

                let selectedRater: ReputationRater | null = null;
                const firstIndex = seedToIndex(outcomeSeed, reputationRaters.length);
                for (let offset = 0; offset < reputationRaters.length; offset += 1) {
                  const candidate = reputationRaters[(firstIndex + offset) % reputationRaters.length];
                  const alreadyRated = await candidate.client.hasRated(agentId, candidate.address);
                  if (!alreadyRated) {
                    selectedRater = candidate;
                    break;
                  }
                }

                if (!selectedRater) {
                  console.log(`[agent] Reputation feedback skipped: all ${reputationRaters.length} configured raters have already rated agent ${agentId.toString()}`);
                } else {
                  const repReceipt = await selectedRater.client.submitFeedback(
                    agentId,
                    score,
                    outcomeRef,
                    comment,
                    FeedbackType.TRADE_EXECUTION
                  );
                  const reputationTxHash = (repReceipt as any).hash || (repReceipt as any).transactionHash || "";
                  fs.appendFileSync(
                    REPUTATION_FEEDBACK_FILE,
                    JSON.stringify({
                      timestamp: fill.timestamp,
                      agentId: fill.agentId,
                      rater: selectedRater.address,
                      score,
                      feedbackType: "TRADE_EXECUTION",
                      outcomeRef,
                      intentHash,
                      txid: fill.txid,
                      reputationTxHash,
                    }) + "\n"
                  );
                  console.log(`[agent] Reputation feedback submitted: score=${score} rater=${selectedRater.address}`);
                }
              } catch (e) {
                console.warn("[agent] Reputation feedback submit failed (non-fatal):", e);
              }
            }

            equitySnapshot = await reportRuntimeEquity(market.price, "post-fill", true);
            refreshRiskStateFromEquity(equitySnapshot, indicatorSnapshot.realizedVolPct);

            const netPnlAfterTrade = equitySnapshot?.performance.netPnlUsd ?? null;
            if (
              netPnlBeforeTrade !== null
              && netPnlAfterTrade !== null
              && netPnlAfterTrade < netPnlBeforeTrade
            ) {
              const deltaNetPnlUsd = round2(netPnlAfterTrade - netPnlBeforeTrade);
              fs.appendFileSync(
                REPUTATION_CONTEXT_FILE,
                JSON.stringify({
                  timestamp: fill.timestamp,
                  agentId: fill.agentId,
                  intentHash,
                  txid: fill.txid,
                  pair: fill.pair,
                  action: fill.action,
                  deltaNetPnlUsd,
                  netPnlBeforeTrade,
                  netPnlAfterTrade,
                  cppiScale: Number(riskControlState.cppiScale.toFixed(4)),
                  breakerState: riskControlState.breakerActive
                    ? (riskControlState.breakerReason || "active")
                    : "clear",
                  context: "trade-outcome-degraded",
                }) + "\n"
              );
            }
            if (
              equitySnapshot?.guardrails?.active
              && equitySnapshot.guardrails.maxDrawdownBps > 0
              && equitySnapshot.drawdownEvidence.currentDrawdownBps > equitySnapshot.guardrails.maxDrawdownBps
            ) {
              console.warn(
                `[agent] Local drawdown guardrail active after fill (${equitySnapshot.drawdownEvidence.currentDrawdownBps} bps); subsequent trades will be blocked.`
              );
            }
          } catch (execErr) {
            console.error(`[agent] Trade execution failed (will still post checkpoint):`, execErr);
            decision.reasoning += ` [EXEC FAILED: ${execErr instanceof Error ? execErr.message : String(execErr)}]`;
            decision.decisionContext = {
              ...decision.decisionContext,
              riskGateStatus: `exec-failed:${execErr instanceof Error ? execErr.message : String(execErr)}`.slice(0, 200),
            };
          }
          }
        }

        riskControlState.appliedTradeScale = initialDecisionAmount > 0
          ? Math.max(0, Math.min(1, decision.amount / Math.max(initialDecisionAmount, 1)))
          : 0;
      }

      // 4d. Fallback: submit reputation feedback even when execution failed
      if (!fillExecuted && reputationRaters.length > 0 && decision.action !== "HOLD") {
        try {
          const fallbackSeed = `${intentHash}:exec-fallback:${Math.floor(Date.now() / 1000)}`;
          const fallbackRef = ethers.keccak256(ethers.toUtf8Bytes(fallbackSeed));
          const repScore = fixedReputationScore ?? 100;
          const fallbackComment = `Auto feedback (exec-fallback) for ${decision.action} ${decision.pair} mode=${EXECUTION_MODE}`;

          let selectedRater: ReputationRater | null = null;
          const firstIdx = seedToIndex(fallbackSeed, reputationRaters.length);
          for (let offset = 0; offset < reputationRaters.length; offset += 1) {
            const candidate = reputationRaters[(firstIdx + offset) % reputationRaters.length];
            const alreadyRated = await candidate.client.hasRated(agentId, candidate.address);
            if (!alreadyRated) {
              selectedRater = candidate;
              break;
            }
          }

          if (!selectedRater) {
            console.log(`[agent] Rep feedback (exec-fallback) skipped: all ${reputationRaters.length} raters already rated agent ${agentId.toString()}`);
          } else {
            const repReceipt = await selectedRater.client.submitFeedback(
              agentId,
              repScore,
              fallbackRef,
              fallbackComment,
              FeedbackType.STRATEGY_QUALITY
            );
            const reputationTxHash = (repReceipt as any).hash || (repReceipt as any).transactionHash || "";
            fs.appendFileSync(
              REPUTATION_FEEDBACK_FILE,
              JSON.stringify({
                timestamp: Math.floor(Date.now() / 1000),
                agentId: agentId.toString(),
                rater: selectedRater.address,
                score: repScore,
                feedbackType: "STRATEGY_QUALITY",
                outcomeRef: fallbackRef,
                intentHash,
                txid: "",
                reputationTxHash,
                note: "exec-fallback",
              }) + "\n"
            );
            console.log(`[agent] Rep feedback (exec-fallback) submitted: score=${repScore} rater=${selectedRater.address}`);
          }
        } catch (repErr) {
          console.warn("[agent] Rep feedback (exec-fallback) failed (non-fatal):", repErr);
        }
      }

      if (!fillExecuted) {
        const postDecisionSnapshot = await reportRuntimeEquity(market.price, "post-decision");
        refreshRiskStateFromEquity(postDecisionSnapshot, indicatorSnapshot.realizedVolPct);
      }

      // 5. Generate EIP-712 signed checkpoint
      const checkpoint = await generateCheckpoint(
        agentId,
        decision,
        market,
        intentHash,
        agentSigner,
        registryAddress,
        chainId,
        reg.agentWallet
      );

      console.log(formatCheckpointLog(checkpoint));

      // 6. Post checkpoint hash to ValidationRegistry
      const cp = checkpoint as typeof checkpoint & { checkpointHash?: string };
      if (cp.checkpointHash) {
        try {
          const attestation = computeValidationAttestationScore({
            decision,
            indicatorSnapshot,
            fillExecuted,
            defaultEdgeThresholdBps: decision.decisionContext?.edgeThresholdBps ?? adaptivePolicy.edgeFloorBps,
          });
          await validation.postCheckpointAttestation(
            agentId,
            cp.checkpointHash,
            attestation.score,
            `${decision.action} ${decision.pair} @ $${market.price} | ${attestation.notes}`
          );
          console.log(`[agent] Checkpoint posted to ValidationRegistry: ${cp.checkpointHash.slice(0, 20)}... score=${attestation.score}`);
        } catch (e) {
          console.warn(`[agent] ValidationRegistry post failed (non-fatal):`, e);
        }
      }

      // 7. Persist to checkpoints.jsonl
      fs.appendFileSync(CHECKPOINTS_FILE, JSON.stringify(checkpoint) + "\n");

      // 8. Send Telegram alert (non-fatal, fire-and-forget)
      void sendTelegramAlert({
        agentId: String(agentId),
        action: checkpoint.action,
        pair: checkpoint.pair,
        amountUsd: checkpoint.amountUsd,
        priceUsd: checkpoint.priceUsd,
        confidence: checkpoint.confidence,
        reasoning: checkpoint.reasoning,
        intentHash: checkpoint.intentHash,
        timestamp: checkpoint.timestamp,
        decisionContext: checkpoint.decisionContext,
      });

    } catch (err) {
      console.error(`[agent] Error in tick:`, err);
    }
  };

  const runTickCount = parseOptionalPositiveIntegerEnv("RUN_AGENT_TICKS");
  if (runTickCount !== null) {
    for (let index = 0; index < runTickCount; index += 1) {
      await tick();
      if (index < runTickCount - 1 && POLL_INTERVAL > 0) {
        await sleep(POLL_INTERVAL);
      }
    }
    return;
  }

  while (true) {
    await tick();
    if (POLL_INTERVAL > 0) {
      await sleep(POLL_INTERVAL);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry point — swap strategy here
// ─────────────────────────────────────────────────────────────────────────────

// ── SWAP YOUR STRATEGY HERE ─────────────────────────────────────────────────
const strategy: TradingStrategy = createDefaultStrategy();
// ────────────────────────────────────────────────────────────────────────────

runAgent(strategy).catch((err) => {
  console.error("[agent] Fatal error:", err);
  process.exit(1);
});
