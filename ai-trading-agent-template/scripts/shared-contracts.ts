import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { buildSharedContractSnapshot } from "../src/submission/shared";

function requireEnv(name: string): string {
  const value = (process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const chainId = Number(process.env.CHAIN_ID || "11155111");
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });

  const snapshot = await buildSharedContractSnapshot(provider, {
    agentRegistry: process.env.AGENT_REGISTRY_ADDRESS || null,
    hackathonVault: process.env.HACKATHON_VAULT_ADDRESS || null,
    riskRouter: process.env.RISK_ROUTER_ADDRESS || null,
    reputationRegistry: process.env.REPUTATION_REGISTRY_ADDRESS || null,
    validationRegistry: process.env.VALIDATION_REGISTRY_ADDRESS || null,
  });

  const outPath = path.join(process.cwd(), "shared-contracts.json");
  fs.writeFileSync(outPath, JSON.stringify(snapshot, null, 2));

  console.log("\nShared Contract Snapshot");
  console.log("========================");
  console.log(`Chain ID: ${snapshot.chainId}`);
  console.log(`Sepolia:  ${snapshot.isSepolia}`);
  console.log(`All code present: ${snapshot.allContractsPresent}`);
  console.log(`Wrote: ${outPath}\n`);
}

main().catch((error) => {
  console.error("[shared-contracts] Failed:", error);
  process.exit(1);
});
