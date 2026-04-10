/**
 * Register your AI agent on-chain via ERC-8004 (ERC-721 mint).
 *
 * Usage:
 *   npx ts-node scripts/register-agent.ts
 *
 * Prerequisites:
 *   - Shared Sepolia contract addresses in .env
 *   - AGENT_REGISTRY_ADDRESS in .env
 *   - PRIVATE_KEY + SEPOLIA_RPC_URL in .env
 *
 * What it does:
 *   1. Mints an ERC-721 token to your wallet — this is your agent's on-chain identity
 *   2. Registers agentWallet (hot wallet for signing)
 *   3. Prints the agentId (token ID) — add it to .env as AGENT_ID
 *   4. Optionally sets risk params on the RiskRouter
 */

import * as dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { AGENT_NAME, getAgentId } from "../src/agent/identity";

const AGENT_REGISTRY_ABI = [
  "function getSigningNonce(uint256 agentId) external view returns (uint256)",
  "function verifyAgentSignature(uint256 agentId, bytes32 contentHash, bytes signature) external view returns (bool)",
  "event AgentRegistered(uint256 indexed agentId, address indexed operatorWallet, address indexed agentWallet, string name)",
];

const AGENT_MESSAGE_TYPES = {
  AgentMessage: [
    { name: "agentId", type: "uint256" },
    { name: "agentWallet", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "contentHash", type: "bytes32" },
  ],
} as const;

function isTxHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function positiveNumberFromEnv(name: string, fallback: number): number {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

async function resolveRegistrationTxHash(
  registry: ethers.Contract,
  agentId: bigint,
  candidateTxHash: unknown
): Promise<string | null> {
  if (isTxHash(candidateTxHash)) {
    return candidateTxHash;
  }

  try {
    const filter = (registry as any).filters.AgentRegistered(agentId);
    const logs = await registry.queryFilter(filter, 0, "latest");
    if (logs.length > 0) {
      return logs[logs.length - 1].transactionHash;
    }
  } catch {
    // best-effort fallback; caller will enforce required tx hash
  }

  return null;
}

async function main() {
  const rpcUrl          = process.env.SEPOLIA_RPC_URL;
  const privateKey      = process.env.PRIVATE_KEY;
  const registryAddress = process.env.AGENT_REGISTRY_ADDRESS;
  const routerAddress   = process.env.RISK_ROUTER_ADDRESS;
  const configuredAgentWallet = process.env.AGENT_WALLET_ADDRESS;

  if (!rpcUrl)          throw new Error("Missing SEPOLIA_RPC_URL");
  if (!privateKey)      throw new Error("Missing PRIVATE_KEY");
  if (!registryAddress) throw new Error("Missing AGENT_REGISTRY_ADDRESS — add the shared Sepolia address to .env");

  const provider       = new ethers.JsonRpcProvider(rpcUrl);
  const operatorSigner = new ethers.Wallet(privateKey, provider);

  // Agent signer key: use AGENT_SIGNER_PRIVATE_KEY, then AGENT_WALLET_PRIVATE_KEY, then operator key
  const agentSignerKey = process.env.AGENT_SIGNER_PRIVATE_KEY || process.env.AGENT_WALLET_PRIVATE_KEY || privateKey;
  const agentSigner = new ethers.Wallet(agentSignerKey);
  const agentWalletAddress = configuredAgentWallet || agentSigner.address;

  console.log(`\nOperator wallet: ${operatorSigner.address}`);
  console.log(`Agent wallet:    ${agentWalletAddress}`);
  console.log(`Agent signer:    ${agentSigner.address}`);
  console.log(`AgentRegistry:   ${registryAddress}\n`);

  // Register agent (mints ERC-721)
  const agentId = await getAgentId(operatorSigner, registryAddress, {
    name: AGENT_NAME,
    description: "Autonomous AI trading agent with ERC-8004 identity, Kraken CLI execution, and EIP-712 checkpoints",
    capabilities: ["trading", "analysis", "explainability", "eip712-signing"],
    agentWallet: agentWalletAddress,
    agentURI: `data:application/json,${encodeURIComponent(JSON.stringify({
      name: AGENT_NAME,
      version: "1.0.0",
      agentWallet: agentWalletAddress,
      capabilities: ["trading", "analysis", "eip712-signing"],
    }))}`,
  });

  const registry = new ethers.Contract(registryAddress, AGENT_REGISTRY_ABI, provider);
  const chain = await provider.getNetwork();
  const nonce = await registry.getSigningNonce(agentId);
  const content = `phase2-registration-proof:${agentId.toString()}:${Date.now()}`;
  const contentHash = ethers.keccak256(ethers.toUtf8Bytes(content));
  const signature = await agentSigner.signTypedData(
    {
      name: "AgentRegistry",
      version: "1",
      chainId: Number(chain.chainId),
      verifyingContract: registryAddress,
    },
    AGENT_MESSAGE_TYPES as unknown as Record<string, ethers.TypedDataField[]>,
    {
      agentId,
      agentWallet: agentWalletAddress,
      nonce,
      contentHash,
    }
  );
  const signatureValid = await registry.verifyAgentSignature(agentId, contentHash, signature);

  if (!signatureValid) {
    throw new Error("Registration proof failed: typed-signature verification returned false");
  }

  const evidencePath = path.join(process.cwd(), "registration-proof.json");
  const identityFilePath = path.join(process.cwd(), "agent-id.json");
  const identityFile = fs.existsSync(identityFilePath)
    ? JSON.parse(fs.readFileSync(identityFilePath, "utf8"))
    : null;

  const registrationTxHash = await resolveRegistrationTxHash(
    registry,
    agentId,
    identityFile?.txHash ?? null
  );
  if (!registrationTxHash) {
    throw new Error("Registration proof failed: could not resolve registration transaction hash");
  }

  const evidence = {
    generatedAt: new Date().toISOString(),
    chainId: Number(chain.chainId),
    registryAddress,
    operatorWallet: operatorSigner.address,
    agentSigner: agentSigner.address,
    agentWallet: agentWalletAddress,
    agentId: agentId.toString(),
    registrationTxHash,
    signatureProof: {
      nonce: nonce.toString(),
      contentHash,
      valid: true,
    },
  };
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2));

  console.log(`\nAgent registered!`);
  console.log(`agentId (ERC-721 token ID): ${agentId}`);
  console.log(`signature proof valid: ${signatureValid}`);
  console.log(`registration proof: ${evidencePath}`);
  console.log(`\nAdd to .env:`);
  console.log(`  AGENT_ID=${agentId}`);
  if (configuredAgentWallet) {
    console.log(`  AGENT_WALLET_ADDRESS=${configuredAgentWallet}`);
  }
  if (process.env.AGENT_SIGNER_PRIVATE_KEY) {
    console.log(`  AGENT_SIGNER_PRIVATE_KEY=${process.env.AGENT_SIGNER_PRIVATE_KEY}`);
  } else if (process.env.AGENT_WALLET_PRIVATE_KEY && process.env.AGENT_WALLET_PRIVATE_KEY !== privateKey) {
    console.log(`  AGENT_WALLET_PRIVATE_KEY=${process.env.AGENT_WALLET_PRIVATE_KEY}`);
  }

  // Optionally configure risk params
  if (routerAddress) {
    const RISK_ROUTER_ABI = [
      "function setRiskParams(uint256 agentId, uint256 maxPositionUsdScaled, uint256 maxDrawdownBps, uint256 maxTradesPerHour) external",
    ];
    const defaultMaxPositionUsd = positiveNumberFromEnv("DEFAULT_MAX_POSITION_USD", 350);
    const defaultMaxDrawdownBps = Math.round(positiveNumberFromEnv("DEFAULT_MAX_DRAWDOWN_BPS", 500));
    const defaultMaxTradesPerHour = Math.round(positiveNumberFromEnv("DEFAULT_MAX_TRADES_PER_HOUR", 6));

    const router = new ethers.Contract(routerAddress, RISK_ROUTER_ABI, operatorSigner);

    console.log(`\nSetting default risk params on RiskRouter...`);
    const txNonce = await provider.getTransactionCount(operatorSigner.address, "pending");
    const tx = await router.setRiskParams(
      agentId,
      BigInt(Math.round(defaultMaxPositionUsd * 100)),
      BigInt(defaultMaxDrawdownBps),
      BigInt(defaultMaxTradesPerHour),
      { nonce: txNonce }
    );
    await tx.wait();
    console.log(
      `Risk params set: maxPosition=$${defaultMaxPositionUsd.toFixed(2)}, maxDrawdown=${(defaultMaxDrawdownBps / 100).toFixed(2)}%, maxTrades/hr=${defaultMaxTradesPerHour}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
