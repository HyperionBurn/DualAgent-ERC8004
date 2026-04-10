import * as dotenv from "dotenv";
dotenv.config();

import hre from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const hardhatRuntime = hre as any;
  const { ethers } = hardhatRuntime;
  const [deployer] = await ethers.getSigners();
  const agentRegistryAddress = (process.env.AGENT_REGISTRY_ADDRESS || "").trim();

  if (!agentRegistryAddress) {
    throw new Error("Missing AGENT_REGISTRY_ADDRESS");
  }

  console.log(`\nDeploying ValidationRegistry with signer: ${deployer.address}`);
  console.log(`AgentRegistry: ${agentRegistryAddress}`);

  const ValidationRegistry = await ethers.getContractFactory("ValidationRegistry");
  const validation = await ValidationRegistry.deploy(agentRegistryAddress, true);
  await validation.waitForDeployment();

  const validationRegistryAddress = await validation.getAddress();
  const owner = await validation.owner();
  const openValidation = await validation.openValidation();
  const network = await ethers.provider.getNetwork();

  const deployment = {
    generatedAt: new Date().toISOString(),
    chainId: Number(network.chainId),
    deployer: deployer.address,
    agentRegistryAddress,
    validationRegistryAddress,
    owner,
    openValidation,
  };

  const outPath = path.join(process.cwd(), "validation-registry-deployment.json");
  fs.writeFileSync(outPath, JSON.stringify(deployment, null, 2));

  console.log("\nValidationRegistry deployed");
  console.log(JSON.stringify(deployment, null, 2));
  console.log(`\nWrote: ${outPath}`);
}

main().catch((error) => {
  console.error("[deploy-validation-registry] Failed:", error);
  process.exit(1);
});