import * as dotenv from "dotenv";

dotenv.config();

import { ethers } from "ethers";

const VAULT_ABI = [
  "function allocate(uint256 agentId, uint256 amount) external",
  "function getBalance(uint256 agentId) external view returns (uint256)",
  "function unallocatedBalance() external view returns (uint256)",
  "function totalVaultBalance() external view returns (uint256)",
];

function requireEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const privateKey = requireEnv("PRIVATE_KEY");
  const vaultAddress = requireEnv("HACKATHON_VAULT_ADDRESS");
  const agentIdRaw = requireEnv("AGENT_ID");

  const allocationEth = Number(process.env.SANDBOX_CAPITAL_ETH || "0.25");
  if (!Number.isFinite(allocationEth) || allocationEth <= 0) {
    throw new Error("SANDBOX_CAPITAL_ETH must be a positive number");
  }

  const agentId = BigInt(agentIdRaw);
  const amountWei = ethers.parseEther(allocationEth.toString());

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const vault = new ethers.Contract(vaultAddress, VAULT_ABI, signer);

  const unallocatedBefore: bigint = await vault.unallocatedBalance();
  const totalBefore: bigint = await vault.totalVaultBalance();
  const agentBefore: bigint = await vault.getBalance(agentId);

  if (unallocatedBefore < amountWei) {
    throw new Error(
      `Vault has insufficient unallocated capital. Unallocated=${ethers.formatEther(unallocatedBefore)} ETH, requested=${allocationEth} ETH`
    );
  }

  console.log(`\nAllocator: ${signer.address}`);
  console.log(`Vault:     ${vaultAddress}`);
  console.log(`Agent ID:  ${agentId}`);
  console.log(`Allocate:  ${allocationEth} ETH`);
  console.log(`Unalloc:   ${ethers.formatEther(unallocatedBefore)} ETH`);
  console.log(`Total:     ${ethers.formatEther(totalBefore)} ETH`);

  const tx = await vault.allocate(agentId, amountWei);
  console.log(`\n[capital] Allocation tx: ${tx.hash}`);
  await tx.wait();

  const agentAfter: bigint = await vault.getBalance(agentId);
  const unallocatedAfter: bigint = await vault.unallocatedBalance();

  console.log("[capital] Sandbox capital allocated");
  console.log(`[capital] Agent balance: ${ethers.formatEther(agentBefore)} -> ${ethers.formatEther(agentAfter)} ETH`);
  console.log(`[capital] Unallocated:  ${ethers.formatEther(unallocatedBefore)} -> ${ethers.formatEther(unallocatedAfter)} ETH`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
