import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { VaultClient } from "../src/onchain/vault";

async function resolveLatestCapitalAllocationTxHash(
  provider: ethers.Provider,
  vaultAddress: string,
  agentId: bigint
): Promise<string | null> {
  const iface = new ethers.Interface([
    "event CapitalAllocated(uint256 indexed agentId, uint256 amount)",
  ]);
  const fragment = iface.getEvent("CapitalAllocated");
  if (!fragment) {
    return null;
  }
  const topics = iface.encodeFilterTopics(fragment, [agentId]);
  const latestBlock = await provider.getBlockNumber();
  const chunkSize = 10;
  const maxScanBlocks = 2_000;
  const floor = Math.max(0, latestBlock - maxScanBlocks + 1);

  for (let toBlock = latestBlock; toBlock >= floor; toBlock -= chunkSize) {
    const fromBlock = Math.max(floor, toBlock - chunkSize + 1);

    try {
      const logs = await provider.getLogs({
        address: vaultAddress,
        topics,
        fromBlock,
        toBlock,
      });

      if (logs.length > 0) {
        return logs[logs.length - 1].transactionHash ?? null;
      }
    } catch {
      // Ignore provider-specific range/rate errors and keep searching.
    }
  }

  return null;
}

function requireEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const vaultAddress = requireEnv("HACKATHON_VAULT_ADDRESS");
  const agentIdRaw = requireEnv("AGENT_ID");

  const agentId = BigInt(agentIdRaw);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  const signer = new ethers.Wallet(privateKey, provider);
  const vault = new VaultClient(vaultAddress, signer);

  const balanceBefore = await vault.getAllocatedCapital(agentId);
  const totalBefore = await vault.getTotalBalance();
  const unallocatedBefore = await vault.getUnallocatedBalance();

  console.log(`\nAllocator: ${signer.address}`);
  console.log(`Vault:     ${vaultAddress}`);
  console.log(`Agent ID:  ${agentId}`);
  console.log(`Before:    ${ethers.formatEther(balanceBefore)} ETH`);
  console.log("Claiming shared sandbox capital...");

  let claimStatus: "claimed" | "already-claimed" = "claimed";
  let claimError: string | null = null;
  let claimTxHash: string | null = null;
  try {
    const receipt = await vault.claimAllocation(agentId);
    claimTxHash = receipt.hash;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes("already claimed")) {
      claimStatus = "already-claimed";
      claimError = message;
      console.log("[capital] Allocation already claimed; generating proof from existing vault state.");
    } else {
      throw error;
    }
  }

  if (!claimTxHash) {
    try {
      claimTxHash = await resolveLatestCapitalAllocationTxHash(provider, vaultAddress, agentId);
    } catch (error) {
      const lookupError = error instanceof Error ? error.message : String(error);
      claimError = claimError ? `${claimError}; logLookup=${lookupError}` : `logLookup=${lookupError}`;
    }
  }

  const balanceAfter = await vault.getAllocatedCapital(agentId);
  const totalAfter = await vault.getTotalBalance();
  const unallocatedAfter = await vault.getUnallocatedBalance();
  const outPath = path.join(process.cwd(), "capital-proof.json");
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        chainId: Number(network.chainId),
        vaultAddress,
        claimer: signer.address,
        agentId: agentId.toString(),
        claimStatus,
        claimTxHash,
        claimError,
        allocatedBeforeEth: Number(ethers.formatEther(balanceBefore)),
        allocatedAfterEth: Number(ethers.formatEther(balanceAfter)),
        claimedDeltaEth: Number(ethers.formatEther(balanceAfter - balanceBefore)),
        totalVaultBalanceBeforeEth: Number(ethers.formatEther(totalBefore)),
        totalVaultBalanceAfterEth: Number(ethers.formatEther(totalAfter)),
        unallocatedBeforeEth: Number(ethers.formatEther(unallocatedBefore)),
        unallocatedAfterEth: Number(ethers.formatEther(unallocatedAfter)),
      },
      null,
      2
    )
  );
  if (claimTxHash) {
    console.log(`[capital] Allocation tx: ${claimTxHash}`);
  } else {
    console.log("[capital] Allocation tx: unavailable (no CapitalAllocated event found for this agent)");
  }
  console.log(`[capital] Agent balance: ${ethers.formatEther(balanceBefore)} -> ${ethers.formatEther(balanceAfter)} ETH`);
  console.log(`[capital] Proof file: ${outPath}`);
  if (claimStatus === "claimed") {
    console.log("[capital] Shared sandbox capital claimed");
  } else {
    console.log("[capital] Shared sandbox capital was already claimed; proof refreshed");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
