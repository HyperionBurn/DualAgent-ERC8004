import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { buildEquityReportPayload } from "../src/submission/equity";

function requireEnv(name: string): string {
  const v = (process.env[name] || "").trim();
  if (!v) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

async function main() {
  const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
  const routerAddress = requireEnv("RISK_ROUTER_ADDRESS");
  const agentIdRaw = requireEnv("AGENT_ID");
  const chainId = Number(process.env.CHAIN_ID || "11155111");
  if (!Number.isFinite(chainId) || chainId <= 0) {
    throw new Error("CHAIN_ID must be a positive integer");
  }

  const agentId = BigInt(agentIdRaw);
  const provider = new ethers.JsonRpcProvider(rpcUrl, chainId, { staticNetwork: true });

  const baselineCapitalUsd = Number(process.env.METRICS_BASELINE_USD || "10000");
  if (!Number.isFinite(baselineCapitalUsd) || baselineCapitalUsd <= 0) {
    throw new Error("METRICS_BASELINE_USD must be a positive number");
  }

  const payload = await buildEquityReportPayload({
    agentId,
    pair: process.env.TRADING_PAIR || "XBTUSD",
    baselineCapitalUsd,
    provider,
    routerAddress,
    reason: "manual-report",
    strictAgentId: true,
  });
  const outPath = path.join(process.cwd(), "equity-report.json");
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

  console.log("\nEquity Report");
  console.log("=============");
  console.log(`Agent ID:         ${payload.agentId}`);
  console.log(`Pair:             ${payload.pair}`);
  console.log(`Current equity:   $${payload.drawdownEvidence.currentEquityUsd.toFixed(2)}`);
  console.log(`Peak equity:      $${payload.drawdownEvidence.peakEquityUsd.toFixed(2)}`);
  console.log(`Max drawdown:     ${payload.drawdownEvidence.maxDrawdownBps} bps`);
  console.log(`Current drawdown: ${payload.drawdownEvidence.currentDrawdownBps} bps`);
  console.log(`CPPI scale:       ${payload.cppi.scale.toFixed(3)} (floor=${payload.cppi.floorEquityUsd.toFixed(2)}, cushion=${payload.cppi.cushionUsd.toFixed(2)})`);
  if (payload.runtimeRiskControls) {
    console.log(`Breaker:          ${payload.runtimeRiskControls.breakerActive} (${payload.runtimeRiskControls.breakerReason || "clear"})`);
  }
  console.log(`Guardrails:       ${payload.guardrails ? `${payload.guardrails.maxPositionUsd.toFixed(2)} USD max position, ${payload.guardrails.maxTradesPerHour} trades/hr` : "unavailable"}`);
  console.log(`Router nonce:     ${payload.router.currentNonce ?? "unavailable"}`);
  console.log(`Wrote:            ${outPath}`);
}

main().catch((error) => {
  console.error("[report-equity] Failed:", error);
  process.exit(1);
});
