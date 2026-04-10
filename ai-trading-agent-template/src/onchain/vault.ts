/**
 * HackathonVault — TypeScript integration layer
 *
 * Updated for ERC-721 agentId (bigint/uint256).
 *
 * Note on hackathon infrastructure:
 * The shared ERC-8004 challenge vault exposes `claimAllocation(agentId)` on
 * Sepolia. The local template still supports the older `allocate(...)` flow for
 * offline testing, but Path A should use the shared claim path.
 */

import { ethers } from "ethers";

const VAULT_ABI = [
  "function allocatedCapital(uint256 agentId) external view returns (uint256)",
  "function getBalance(uint256 agentId) external view returns (uint256)",
  "function totalVaultBalance() external view returns (uint256)",
  "function unallocatedBalance() external view returns (uint256)",
  "function claimAllocation(uint256 agentId) external",
  "function deposit() external payable",
  "function allocate(uint256 agentId, uint256 amount) external",
  "function release(uint256 agentId, uint256 amount) external",
  "event CapitalAllocated(uint256 indexed agentId, uint256 amount)",
  "event CapitalReleased(uint256 indexed agentId, uint256 amount)",
];

export class VaultClient {
  private contract: ethers.Contract;

  constructor(vaultAddress: string, signerOrProvider: ethers.Signer | ethers.Provider) {
    this.contract = new ethers.Contract(vaultAddress, VAULT_ABI, signerOrProvider);
  }

  async getAllocatedCapital(agentId: bigint): Promise<bigint> {
    return this.contract.getBalance(agentId);
  }

  async getTotalBalance(): Promise<bigint> {
    return this.contract.totalVaultBalance();
  }

  async getUnallocatedBalance(): Promise<bigint> {
    return this.contract.unallocatedBalance();
  }

  async claimAllocation(agentId: bigint): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.claimAllocation(agentId);
    return tx.wait();
  }

  async allocate(agentId: bigint, amountWei: bigint): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.allocate(agentId, amountWei);
    return tx.wait();
  }

  async release(agentId: bigint, amountWei: bigint): Promise<ethers.TransactionReceipt> {
    const tx = await this.contract.release(agentId, amountWei);
    return tx.wait();
  }

  async hasSufficientCapital(
    agentId: bigint,
    tradeAmountUsd: number,
    ethPriceUsd: number
  ): Promise<boolean> {
    const allocated = await this.getAllocatedCapital(agentId);
    const allocatedEth = parseFloat(ethers.formatEther(allocated));
    return allocatedEth * ethPriceUsd >= tradeAmountUsd;
  }
}
