/**
 * Deploy all five contracts to Sepolia.
 *
 * Deploys (in order — later contracts depend on AgentRegistry address):
 *   1. AgentRegistry        (ERC-721 identity)
 *   2. HackathonVault       (capital management)
 *   3. RiskRouter           (trade validation — needs AgentRegistry)
 *   4. ReputationRegistry   (feedback + reputation — needs AgentRegistry)
 *   5. ValidationRegistry   (attestations — needs AgentRegistry)
 *
 * Usage:
 *   npx hardhat run scripts/deploy.ts --network sepolia
 *
 * After running: copy the printed addresses into your .env
 */

import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

type VerifyResult = "verified" | "already-verified" | "skipped" | "failed";

interface ContractDeploymentRecord {
  address: string;
  deploymentTxHash: string;
  deploymentBlock: number;
  verifyArgs: Array<string | boolean>;
  verification: VerifyResult;
}

function shouldVerify(): boolean {
  return process.argv.includes("--verify") || process.env.AUTO_VERIFY === "true";
}

async function verifyContract(
  hardhatRuntime: any,
  networkName: string,
  record: ContractDeploymentRecord,
  contractName: string
): Promise<VerifyResult> {
  if (networkName !== "sepolia") return "skipped";
  if (!process.env.ETHERSCAN_API_KEY) return "skipped";

  try {
    await hardhatRuntime.run("verify:verify", {
      address: record.address,
      constructorArguments: record.verifyArgs,
    });
    console.log(`   Verified ${contractName}`);
    return "verified";
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.toLowerCase().includes("already verified")) {
      console.log(`   ${contractName} already verified`);
      return "already-verified";
    }
    console.warn(`   Verification failed for ${contractName}: ${msg}`);
    return "failed";
  }
}

async function toDeploymentRecord(
  contract: any,
  verifyArgs: Array<string | boolean>
): Promise<ContractDeploymentRecord> {
  const tx = contract.deploymentTransaction();
  const receipt = tx ? await tx.wait() : null;
  return {
    address: await contract.getAddress(),
    deploymentTxHash: tx?.hash || "",
    deploymentBlock: Number(receipt?.blockNumber || 0),
    verifyArgs,
    verification: "skipped",
  };
}

async function main() {
  const hardhatRuntime = hre as any;
  const { ethers } = hardhatRuntime;
  const [deployer] = await ethers.getSigners();
  const net = await ethers.provider.getNetwork();
  const chainId = Number(net.chainId);
  const networkName = hardhatRuntime.network.name as string;
  const autoVerify = shouldVerify();
  const strictSepolia = networkName === "sepolia";
  const isActualSepolia = chainId === 11155111;

  console.log(`\nDeploying with account: ${deployer.address}`);
  console.log(`Network: ${networkName} (chainId=${chainId})`);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH\n`);

  if (strictSepolia && !isActualSepolia) {
    throw new Error(
      "Refusing deployment: requested network is sepolia but provider chainId is not 11155111. "
      + "Check SEPOLIA_RPC_URL and retry."
    );
  }

  // 1. AgentRegistry (ERC-721)
  console.log("1/5 Deploying AgentRegistry (ERC-721)...");
  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const registry = await AgentRegistry.deploy();
  await registry.waitForDeployment();
  const registryRecord = await toDeploymentRecord(registry, []);
  const registryAddress = registryRecord.address;
  console.log(`   AgentRegistry: ${registryAddress}`);

  // 2. HackathonVault
  console.log("2/5 Deploying HackathonVault...");
  const HackathonVault = await ethers.getContractFactory("HackathonVault");
  const vault = await HackathonVault.deploy();
  await vault.waitForDeployment();
  const vaultRecord = await toDeploymentRecord(vault, []);
  const vaultAddress = vaultRecord.address;
  console.log(`   HackathonVault: ${vaultAddress}`);

  // 3. RiskRouter (needs AgentRegistry)
  console.log("3/5 Deploying RiskRouter...");
  const RiskRouter = await ethers.getContractFactory("RiskRouter");
  const router = await RiskRouter.deploy(registryAddress);
  await router.waitForDeployment();
  const routerRecord = await toDeploymentRecord(router, [registryAddress]);
  const routerAddress = routerRecord.address;
  console.log(`   RiskRouter: ${routerAddress}`);

  // 4. ReputationRegistry (needs AgentRegistry)
  console.log("4/5 Deploying ReputationRegistry...");
  const ReputationRegistry = await ethers.getContractFactory("ReputationRegistry");
  const reputation = await ReputationRegistry.deploy(registryAddress);
  await reputation.waitForDeployment();
  const reputationRecord = await toDeploymentRecord(reputation, [registryAddress]);
  const reputationAddress = reputationRecord.address;
  console.log(`   ReputationRegistry: ${reputationAddress}`);

  // 5. ValidationRegistry (needs AgentRegistry, open validation for hackathon)
  console.log("5/5 Deploying ValidationRegistry...");
  const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
  const validation = await ValidationRegistry.deploy(registryAddress, true); // openValidation=true
  await validation.waitForDeployment();
  const validationRecord = await toDeploymentRecord(validation, [registryAddress, true]);
  const validationAddress = validationRecord.address;
  console.log(`   ValidationRegistry: ${validationAddress}`);

  const contractRecords: Record<string, ContractDeploymentRecord> = {
    AgentRegistry: registryRecord,
    HackathonVault: vaultRecord,
    RiskRouter: routerRecord,
    ReputationRegistry: reputationRecord,
    ValidationRegistry: validationRecord,
  };

  if (autoVerify && strictSepolia && isActualSepolia) {
    console.log("\nVerifying contracts on Etherscan...");
    for (const [name, record] of Object.entries(contractRecords)) {
      record.verification = await verifyContract(hardhatRuntime, networkName, record, name);
    }
  }

  // Save deployed.json
  const deployed = {
    network: networkName,
    chainId,
    isSepolia: isActualSepolia,
    requestedNetwork: networkName,
    providerChainId: chainId,
    verificationRequested: autoVerify,
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,

    // Legacy flat keys kept for compatibility with existing scripts
    AgentRegistry: registryAddress,
    HackathonVault: vaultAddress,
    RiskRouter: routerAddress,
    ReputationRegistry: reputationAddress,
    ValidationRegistry: validationAddress,

    contracts: contractRecords,
  };
  const outPath = path.join(process.cwd(), "deployed.json");
  fs.writeFileSync(outPath, JSON.stringify(deployed, null, 2));
  console.log(`\nSaved to: ${outPath}`);

  // .env additions
  console.log("\n── Add these to your .env ──────────────────────────────────────────");
  console.log(`AGENT_REGISTRY_ADDRESS=${registryAddress}`);
  console.log(`HACKATHON_VAULT_ADDRESS=${vaultAddress}`);
  console.log(`RISK_ROUTER_ADDRESS=${routerAddress}`);
  console.log(`REPUTATION_REGISTRY_ADDRESS=${reputationAddress}`);
  console.log(`VALIDATION_REGISTRY_ADDRESS=${validationAddress}`);
  console.log("────────────────────────────────────────────────────────────────────\n");

  if (networkName === "sepolia") {
    console.log("Verify on Etherscan:");
    console.log(`  npx hardhat verify --network sepolia ${registryAddress}`);
    console.log(`  npx hardhat verify --network sepolia ${vaultAddress}`);
    console.log(`  npx hardhat verify --network sepolia ${routerAddress} "${registryAddress}"`);
    console.log(`  npx hardhat verify --network sepolia ${reputationAddress} "${registryAddress}"`);
    console.log(`  npx hardhat verify --network sepolia ${validationAddress} "${registryAddress}" true`);
  } else {
    console.log(`No Etherscan verification step for network: ${networkName}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
