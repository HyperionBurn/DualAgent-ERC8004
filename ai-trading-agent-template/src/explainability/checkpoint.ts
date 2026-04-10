/**
 * EIP-712 Signed Checkpoints
 *
 * Produces machine-verifiable artifacts for every trade decision. The checkpoint
 * is signed by the agent's agentWallet (the hot wallet registered in AgentRegistry).
 *
 * Key change from v1: agentId is now a uint256 (ERC-721 token ID), not bytes32.
 * The checkpoint hash (EIP-712 digest) is also submitted to the ValidationRegistry
 * so validators can score the agent's decisions on-chain.
 */

import { ethers } from "ethers";
import { MarketData, TradeCheckpoint, TradeDecision } from "../types/index";

const ERC1271_ABI = [
  "function isValidSignature(bytes32 hash, bytes signature) external view returns (bytes4)",
];
const ERC1271_MAGICVALUE = "0x1626ba7e";

// ─────────────────────────────────────────────────────────────────────────────
// EIP-712 domain and type definitions
// ─────────────────────────────────────────────────────────────────────────────

export function buildDomain(registryAddress: string, chainId: number): ethers.TypedDataDomain {
  return {
    name: "AITradingAgent",
    version: "1",
    chainId,
    verifyingContract: registryAddress,
  };
}

export const CHECKPOINT_TYPES = {
  TradeCheckpoint: [
    { name: "agentId",           type: "uint256" }, // ERC-721 token ID
    { name: "timestamp",         type: "uint256" },
    { name: "action",            type: "string"  },
    { name: "asset",             type: "string"  },
    { name: "pair",              type: "string"  },
    { name: "amountUsdScaled",   type: "uint256" }, // amountUsd * 100
    { name: "priceUsdScaled",    type: "uint256" }, // priceUsd * 100
    { name: "reasoningHash",     type: "bytes32" }, // keccak256(reasoning)
    { name: "confidenceScaled",  type: "uint256" }, // confidence * 1000
    { name: "intentHash",        type: "bytes32" }, // hash of the approved TradeIntent
  ],
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Generate a signed checkpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an EIP-712 signed checkpoint for a trade decision.
 * Signed by the agent's agentWallet (hot wallet).
 *
 * @param agentId          ERC-721 token ID (uint256)
 * @param decision         Trade decision from the strategy
 * @param market           Market data at decision time
 * @param intentHash       Hash of the approved TradeIntent (or "0x00...00" for HOLD)
 * @param agentWalletSigner The agent's hot wallet (registered in AgentRegistry)
 * @param registryAddress  AgentRegistry contract address (for EIP-712 domain)
 * @param chainId          Chain ID (11155111 for Sepolia)
 */
export async function generateCheckpoint(
  agentId: bigint,
  decision: TradeDecision,
  market: MarketData,
  intentHash: string,
  agentWalletSigner: ethers.Signer,
  registryAddress: string,
  chainId: number,
  signerIdentity?: string
): Promise<TradeCheckpoint> {
  const timestamp = Math.floor(Date.now() / 1000);
  const reasoningHash = ethers.keccak256(ethers.toUtf8Bytes(decision.reasoning));

  const value = {
    agentId,
    timestamp:          BigInt(timestamp),
    action:             decision.action,
    asset:              decision.asset,
    pair:               decision.pair,
    amountUsdScaled:    BigInt(Math.round(decision.amount * 100)),
    priceUsdScaled:     BigInt(Math.round(market.price * 100)),
    reasoningHash,
    confidenceScaled:   BigInt(Math.round(decision.confidence * 1000)),
    intentHash:         intentHash as `0x${string}`,
  };

  const domain = buildDomain(registryAddress, chainId);
  const types = CHECKPOINT_TYPES as unknown as Record<string, ethers.TypedDataField[]>;
  const signature = await agentWalletSigner.signTypedData(domain, types, value);

  // The EIP-712 digest — this is what gets submitted to the ValidationRegistry
  const checkpointHash = ethers.TypedDataEncoder.hash(domain, types, value);

  return {
    agentId: agentId.toString(),
    timestamp,
    quoteTimestamp: market.timestamp,
    quotePriceUsd: market.quotePriceUsd ?? market.price,
    action:      decision.action,
    asset:       decision.asset,
    pair:        decision.pair,
    amountUsd:   decision.amount,
    priceUsd:    market.price,
    reasoning:   decision.reasoning,
    reasoningHash,
    confidence:  decision.confidence,
    intentHash,
    signature,
    signerAddress: signerIdentity ?? await agentWalletSigner.getAddress(),
    checkpointHash,  // extra field — not in the interface but appended to JSON
    decisionContext: decision.decisionContext,
  } as TradeCheckpoint & { checkpointHash: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Verify a checkpoint
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Verify a checkpoint's EIP-712 signature recovers to expectedSigner.
 */
export function verifyCheckpoint(
  checkpoint: TradeCheckpoint & { checkpointHash?: string },
  registryAddress: string,
  chainId: number,
  expectedSigner: string
): boolean {
  const domain = buildDomain(registryAddress, chainId);
  const value = {
    agentId:          BigInt(checkpoint.agentId),
    timestamp:        BigInt(checkpoint.timestamp),
    action:           checkpoint.action,
    asset:            checkpoint.asset,
    pair:             checkpoint.pair,
    amountUsdScaled:  BigInt(Math.round(checkpoint.amountUsd * 100)),
    priceUsdScaled:   BigInt(Math.round(checkpoint.priceUsd * 100)),
    reasoningHash:    checkpoint.reasoningHash as `0x${string}`,
    confidenceScaled: BigInt(Math.round(checkpoint.confidence * 1000)),
    intentHash:       checkpoint.intentHash as `0x${string}`,
  };

  const types = CHECKPOINT_TYPES as unknown as Record<string, ethers.TypedDataField[]>;
  const recovered = ethers.verifyTypedData(domain, types, value, checkpoint.signature);
  return recovered.toLowerCase() === expectedSigner.toLowerCase();
}

/**
 * Verify checkpoint signatures against either EOA signers or ERC-1271 wallets.
 * Uses EOA recovery first, then falls back to IERC1271.isValidSignature.
 */
export async function verifyCheckpointWithContractSupport(
  checkpoint: TradeCheckpoint,
  registryAddress: string,
  chainId: number,
  expectedSigner: string,
  provider: ethers.Provider
): Promise<boolean> {
  if (verifyCheckpoint(checkpoint, registryAddress, chainId, expectedSigner)) {
    return true;
  }

  const code = await provider.getCode(expectedSigner);
  if (!code || code === "0x") {
    return false;
  }

  try {
    const digest = computeCheckpointHash(checkpoint, registryAddress, chainId);
    const verifier = new ethers.Contract(expectedSigner, ERC1271_ABI, provider);
    const result: string = await verifier.isValidSignature.staticCall(digest, checkpoint.signature);
    return result.toLowerCase() === ERC1271_MAGICVALUE;
  } catch {
    return false;
  }
}

/**
 * Verify that the plain-text reasoning string matches its hash in the checkpoint.
 * Prevents tampering with the explanation after signing.
 */
export function verifyReasoningIntegrity(checkpoint: TradeCheckpoint): boolean {
  const expected = ethers.keccak256(ethers.toUtf8Bytes(checkpoint.reasoning));
  return expected === checkpoint.reasoningHash;
}

/**
 * Compute the EIP-712 digest for a checkpoint (for ValidationRegistry submission).
 */
export function computeCheckpointHash(
  checkpoint: TradeCheckpoint,
  registryAddress: string,
  chainId: number
): string {
  const domain = buildDomain(registryAddress, chainId);
  const value = {
    agentId:          BigInt(checkpoint.agentId),
    timestamp:        BigInt(checkpoint.timestamp),
    action:           checkpoint.action,
    asset:            checkpoint.asset,
    pair:             checkpoint.pair,
    amountUsdScaled:  BigInt(Math.round(checkpoint.amountUsd * 100)),
    priceUsdScaled:   BigInt(Math.round(checkpoint.priceUsd * 100)),
    reasoningHash:    checkpoint.reasoningHash as `0x${string}`,
    confidenceScaled: BigInt(Math.round(checkpoint.confidence * 1000)),
    intentHash:       checkpoint.intentHash as `0x${string}`,
  };
  const types = CHECKPOINT_TYPES as unknown as Record<string, ethers.TypedDataField[]>;
  return ethers.TypedDataEncoder.hash(domain, types, value);
}
