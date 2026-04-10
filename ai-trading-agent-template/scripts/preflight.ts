import * as dotenv from "dotenv";
import { getConfiguredPlannerProvider } from "../src/llm/provider";
import * as path from "path";
import { buildArtifactIdentityReport } from "../src/submission/artifacts";
import { isReputationLoopEnabled, isSubmissionStrict } from "../src/runtime/profile";

dotenv.config();

type Mode = "deploy" | "register" | "deploy-sepolia" | "register-sepolia" | "claim";
type ExecutionMode = "mock" | "kraken";
type MarketDataMode = "mock" | "kraken" | "prism";

const modeArg = (process.argv[2] || "deploy").toLowerCase();
if (
  modeArg !== "deploy"
  && modeArg !== "register"
  && modeArg !== "deploy-sepolia"
  && modeArg !== "register-sepolia"
  && modeArg !== "claim"
  && modeArg !== "run-agent"
) {
  console.error("Invalid mode. Use: deploy, register, deploy-sepolia, register-sepolia, claim, or run-agent");
  process.exit(1);
}

const mode = modeArg as Mode | "run-agent";

const errors: string[] = [];
const warnings: string[] = [];
const submissionStrict = isSubmissionStrict(process.env);

function value(name: string): string {
  return (process.env[name] || "").trim();
}

function isPlaceholder(v: string): boolean {
  if (!v) return true;
  return (
    v.includes("YOUR_") ||
    v.includes("<YOUR") ||
    v.includes("YOUR_INFURA_KEY") ||
    v.includes("YOUR_OPERATOR_WALLET_PRIVATE_KEY") ||
    v.includes("YOUR_AGENT_HOT_WALLET_PRIVATE_KEY")
  );
}

function isHexPrivateKey(v: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(v);
}

function isAddress(v: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(v);
}

function requireRpcUrl() {
  const rpc = value("SEPOLIA_RPC_URL");
  if (isPlaceholder(rpc)) {
    errors.push("SEPOLIA_RPC_URL is missing or still a placeholder");
    return;
  }
  if (!/^https?:\/\//i.test(rpc)) {
    errors.push("SEPOLIA_RPC_URL must start with http:// or https://");
  }
}

function requireNonLocalRpc() {
  const rpc = value("SEPOLIA_RPC_URL").toLowerCase();
  if (!rpc) {
    errors.push("SEPOLIA_RPC_URL is missing");
    return;
  }
  if (rpc.includes("127.0.0.1") || rpc.includes("localhost")) {
    errors.push("SEPOLIA_RPC_URL points to localhost but Phase 2 requires real Sepolia RPC");
  }
}

function requirePrivateKey() {
  const pk = value("PRIVATE_KEY");
  if (isPlaceholder(pk)) {
    errors.push("PRIVATE_KEY is missing or still a placeholder");
    return;
  }
  if (!isHexPrivateKey(pk)) {
    errors.push("PRIVATE_KEY must be a 32-byte hex key (0x + 64 hex chars)");
  }

  // Hardhat default account private key. Valid format, but usually unfunded on Sepolia.
  if (pk.toLowerCase() === "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") {
    warnings.push("PRIVATE_KEY is the Hardhat default test key and is typically unfunded on Sepolia");
  }
}

function requireAgentWalletKey() {
  const agentPk = value("AGENT_WALLET_PRIVATE_KEY");
  if (!agentPk) return;
  if (isPlaceholder(agentPk)) {
    errors.push("AGENT_WALLET_PRIVATE_KEY is set but still a placeholder");
    return;
  }
  if (!isHexPrivateKey(agentPk)) {
    errors.push("AGENT_WALLET_PRIVATE_KEY must be a 32-byte hex key (0x + 64 hex chars)");
  }
}

function requireAddress(name: string) {
  const v = value(name);
  if (!v) {
    errors.push(`${name} is missing`);
    return;
  }
  if (!isAddress(v)) {
    errors.push(`${name} must be a valid 0x Ethereum address`);
  }
}

function validateOptionalChainId() {
  const raw = value("CHAIN_ID");
  if (!raw) return;
  if (!/^\d+$/.test(raw)) {
    errors.push("CHAIN_ID must be a positive integer when provided");
  }
}

function requireSepoliaChainIdWhenSet() {
  const raw = value("CHAIN_ID");
  if (!raw) return;
  if (!/^\d+$/.test(raw)) {
    errors.push("CHAIN_ID must be a positive integer when provided");
    return;
  }
  if (raw !== "11155111") {
    errors.push("CHAIN_ID must be 11155111 for deploy-sepolia/register-sepolia/claim");
  }
}

function requireEtherscanApiKey() {
  const apiKey = value("ETHERSCAN_API_KEY");
  if (!apiKey || isPlaceholder(apiKey)) {
    errors.push("ETHERSCAN_API_KEY is required for deploy-sepolia verification flow");
  }
}

function requireAgentId() {
  const raw = value("AGENT_ID");
  if (!raw) {
    warnings.push("AGENT_ID is missing; runtime will attempt to resolve or register identity automatically");
    return;
  }
  try {
    const parsed = BigInt(raw);
    if (parsed < 0n) {
      errors.push("AGENT_ID must be >= 0");
    }
  } catch {
    errors.push("AGENT_ID must be a valid integer");
  }
}

function getExecutionMode(): ExecutionMode {
  const raw = (value("EXECUTION_MODE") || "mock").toLowerCase();
  if (raw === "mock" || raw === "kraken") {
    return raw;
  }
  errors.push("EXECUTION_MODE must be either 'mock' or 'kraken'");
  return "mock";
}

function getMarketDataMode(executionMode: ExecutionMode): MarketDataMode {
  const raw = (value("MARKET_DATA_MODE") || executionMode || "mock").toLowerCase();
  if (raw === "mock" || raw === "kraken" || raw === "prism") {
    return raw;
  }

  errors.push("MARKET_DATA_MODE must be one of: 'mock', 'kraken', or 'prism'");
  return "mock";
}

function requireKrakenCredsForLiveMode() {
  const sandbox = (value("KRAKEN_SANDBOX") || "true").toLowerCase() !== "false";
  const apiKey = value("KRAKEN_API_KEY");
  const apiSecret = value("KRAKEN_API_SECRET");

  if (sandbox) {
    if (!apiKey || !apiSecret || isPlaceholder(apiKey) || isPlaceholder(apiSecret)) {
      warnings.push("KRAKEN_SANDBOX=true and Kraken credentials are missing/placeholders (allowed in sandbox paper mode)");
    }
    return;
  }

  if (!apiKey || isPlaceholder(apiKey)) {
    errors.push("KRAKEN_API_KEY is required when EXECUTION_MODE=kraken and KRAKEN_SANDBOX=false");
  }
  if (!apiSecret || isPlaceholder(apiSecret)) {
    errors.push("KRAKEN_API_SECRET is required when EXECUTION_MODE=kraken and KRAKEN_SANDBOX=false");
  }
}

function requirePrismApiKey() {
  const apiKey = value("PRISM_API_KEY");
  if (!apiKey || isPlaceholder(apiKey)) {
    errors.push("PRISM_API_KEY is required when MARKET_DATA_MODE=prism");
    return;
  }

  if (!apiKey.startsWith("prism_sk_")) {
    warnings.push("PRISM_API_KEY does not match expected prism_sk_ format; verify key source");
  }
}

function requirePrismTrafficSettings() {
  const cacheTtl = value("PRISM_CACHE_TTL_MS");
  if (cacheTtl) {
    const parsed = Number(cacheTtl);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push("PRISM_CACHE_TTL_MS must be a positive number when provided");
    } else if (parsed < 30_000) {
      warnings.push("PRISM_CACHE_TTL_MS is below 30000; Prism request volume will be higher");
    }
  }

  const budget = value("PRISM_MAX_REQUESTS_PER_MINUTE");
  if (budget) {
    const parsed = Number(budget);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push("PRISM_MAX_REQUESTS_PER_MINUTE must be a positive number when provided");
    } else if (parsed > 30) {
      warnings.push("PRISM_MAX_REQUESTS_PER_MINUTE is above 30; ensure your Prism plan can absorb that traffic");
    }
  }

  const cooldown = value("PRISM_RATE_LIMIT_COOLDOWN_MS");
  if (cooldown) {
    const parsed = Number(cooldown);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      errors.push("PRISM_RATE_LIMIT_COOLDOWN_MS must be a positive number when provided");
    }
  }
}

function requireGroqApiKey() {
  const apiKey = value("GROQ_API_KEY");
  if (!apiKey || isPlaceholder(apiKey)) {
    errors.push("GROQ_API_KEY is required when using the Groq planner");
  }
}

function requireOpenRouterPlannerKeys() {
  const apiKeyA = value("OPENROUTER_API_KEY_A") || value("OPENROUTER_API_KEY");
  const apiKeyB = value("OPENROUTER_API_KEY_B");

  if ((!apiKeyA || isPlaceholder(apiKeyA)) && (!apiKeyB || isPlaceholder(apiKeyB))) {
    errors.push("At least one OpenRouter API key is required when using the OpenRouter planner");
  }
}

function validatePlannerProvider() {
  const strategy = value("TRADING_STRATEGY").toLowerCase();
  if (strategy && strategy !== "llm" && strategy !== "momentum" && strategy !== "indicator") {
    errors.push("TRADING_STRATEGY must be one of: llm, momentum, indicator");
    return;
  }

  const provider = getConfiguredPlannerProvider();
  const plannerEnabled = strategy === "llm"
    ? true
    : (strategy === "momentum" || strategy === "indicator")
      ? false
      : Boolean(provider);

  if (!plannerEnabled) {
    return;
  }

  if (provider === "groq") {
    requireGroqApiKey();
    return;
  }

  if (provider === "openrouter") {
    requireOpenRouterPlannerKeys();
    return;
  }

  errors.push("LLM planner is enabled but no provider is configured. Set LLM_PROVIDER=groq with GROQ_API_KEY, or add OpenRouter API keys. If you want deterministic indicators, set TRADING_STRATEGY=indicator.");
}

function validateOptionalReputationScore() {
  const raw = value("REPUTATION_FEEDBACK_SCORE");
  if (!raw) return;
  if (!/^\d+$/.test(raw)) {
    errors.push("REPUTATION_FEEDBACK_SCORE must be an integer from 1 to 100 when provided");
    return;
  }
  const score = Number(raw);
  if (score < 1 || score > 100) {
    errors.push("REPUTATION_FEEDBACK_SCORE must be between 1 and 100 when provided");
  }
}

function requireReputationLoopConfig() {
  const explicitEnabled = value("ENABLE_REPUTATION_LOOP").toLowerCase() === "true";
  const enabled = isReputationLoopEnabled(process.env);
  if (submissionStrict && !explicitEnabled) {
    warnings.push("SUBMISSION_STRICT=true will run with the reputation loop enabled for submission parity");
  }
  if (!enabled) return;

  requireAddress("REPUTATION_REGISTRY_ADDRESS");

  const raterPk = value("REPUTATION_RATER_PRIVATE_KEY");
  if (!raterPk || isPlaceholder(raterPk)) {
    errors.push("REPUTATION_RATER_PRIVATE_KEY is required when ENABLE_REPUTATION_LOOP=true");
  } else if (!isHexPrivateKey(raterPk)) {
    errors.push("REPUTATION_RATER_PRIVATE_KEY must be a 32-byte hex key (0x + 64 hex chars)");
  }

  validateOptionalReputationScore();

  const privateKey = value("PRIVATE_KEY").toLowerCase();
  const agentWalletKey = value("AGENT_WALLET_PRIVATE_KEY").toLowerCase();
  const agentSignerKey = value("AGENT_SIGNER_PRIVATE_KEY").toLowerCase();
  const raterLower = raterPk.toLowerCase();
  if (raterLower && (raterLower === privateKey || raterLower === agentWalletKey || raterLower === agentSignerKey)) {
    const message = "REPUTATION_RATER_PRIVATE_KEY matches operator/agent signer key; on-chain self-rating checks will reject feedback";
    if (submissionStrict) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }
}

function requireArtifactIdentity() {
  const agentId = value("AGENT_ID");
  if (!agentId) return;

  const checkpointsFile = path.join(process.cwd(), value("CHECKPOINT_FILE") || "checkpoints.jsonl");
  const fillsFile = path.join(process.cwd(), value("FILLS_FILE") || "fills.jsonl");
  const tracesFile = path.join(process.cwd(), value("PLANNER_TRACES_FILE") || "planner-traces.jsonl");
  const reputationEvidenceFile = path.join(process.cwd(), value("REPUTATION_FEEDBACK_FILE") || "reputation-feedback.jsonl");

  const report = buildArtifactIdentityReport({
    expectedAgentId: agentId,
    checkpointsFile,
    fillsFile,
    tracesFile,
    reputationEvidenceFile,
  });

  if (!report.pass) {
    errors.push(`Artifact identity mismatch: ${report.failReasons.join("; ")}`);
  }
}

requireRpcUrl();
requirePrivateKey();
requireAgentWalletKey();
validateOptionalChainId();

if (mode === "deploy-sepolia" || mode === "register-sepolia") {
  requireNonLocalRpc();
  requireSepoliaChainIdWhenSet();

  const pk = value("PRIVATE_KEY");
  if (pk.toLowerCase() === "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") {
    errors.push("PRIVATE_KEY is the default Hardhat key and cannot be used for Sepolia phase execution");
  }
}

if (mode === "deploy-sepolia") {
  requireEtherscanApiKey();
}

if (mode === "register") {
  requireAddress("AGENT_REGISTRY_ADDRESS");
  const router = value("RISK_ROUTER_ADDRESS");
  if (router && !isAddress(router)) {
    errors.push("RISK_ROUTER_ADDRESS must be a valid 0x Ethereum address when provided");
  }
}

if (mode === "register-sepolia") {
  requireAddress("AGENT_REGISTRY_ADDRESS");
  const router = value("RISK_ROUTER_ADDRESS");
  if (router && !isAddress(router)) {
    errors.push("RISK_ROUTER_ADDRESS must be a valid 0x Ethereum address when provided");
  }

  const agentWalletAddress = value("AGENT_WALLET_ADDRESS");
  if (agentWalletAddress && !isAddress(agentWalletAddress)) {
    errors.push("AGENT_WALLET_ADDRESS must be a valid 0x Ethereum address when provided");
  }

  const signerPk = value("AGENT_SIGNER_PRIVATE_KEY");
  if (signerPk && !isHexPrivateKey(signerPk)) {
    errors.push("AGENT_SIGNER_PRIVATE_KEY must be a 32-byte hex key (0x + 64 hex chars)");
  }
}

if (mode === "claim") {
  requireNonLocalRpc();
  requireSepoliaChainIdWhenSet();
  requireAddress("AGENT_REGISTRY_ADDRESS");
  requireAddress("HACKATHON_VAULT_ADDRESS");
  requireAddress("RISK_ROUTER_ADDRESS");
  requireAddress("REPUTATION_REGISTRY_ADDRESS");
  requireAddress("VALIDATION_REGISTRY_ADDRESS");
  requireAgentId();
}

if (mode === "run-agent") {
  requireAddress("AGENT_REGISTRY_ADDRESS");
  requireAddress("HACKATHON_VAULT_ADDRESS");
  requireAddress("RISK_ROUTER_ADDRESS");
  requireAddress("VALIDATION_REGISTRY_ADDRESS");
  requireAgentId();
  requireReputationLoopConfig();
  requireArtifactIdentity();

  const executionMode = getExecutionMode();
  const marketDataMode = getMarketDataMode(executionMode);
  if (executionMode === "kraken") {
    requireKrakenCredsForLiveMode();
  }
  if (marketDataMode === "prism") {
    requirePrismApiKey();
    requirePrismTrafficSettings();
  }

  validatePlannerProvider();
}

console.log(`Preflight checks for ${mode}`);

if (warnings.length) {
  console.log("Warnings:");
  for (const w of warnings) {
    console.log(`- ${w}`);
  }
}

if (errors.length) {
  console.error("Failed checks:");
  for (const e of errors) {
    console.error(`- ${e}`);
  }
  process.exit(1);
}

console.log("All required checks passed.");
