/**
 * Run the trading agent.
 *
 * Usage:
 *   npx ts-node scripts/run-agent.ts
 *
 * Prerequisites:
 *   - Contracts deployed and addresses in .env
 *   - AGENT_ID set in .env (run register-agent.ts first)
 *   - Set EXECUTION_MODE:
 *       - mock   (default): no exchange credentials required
 *       - kraken: uses Kraken CLI/API credentials
 *
 * What it does:
 *   1. Loads the deployed contract addresses
 *   2. Connects the agent to selected exchange adapter + on-chain contracts
 *   3. Starts polling the market at POLL_INTERVAL_MS (default 1 minute)
 *   4. Each tick: decide → validate → explain → checkpoint → (optionally) trade
 *   5. Appends signed checkpoints to checkpoints.jsonl
 */

import { acquireSingleInstanceLock } from "./shared/single-instance";

const runAgentServiceName = (process.env.RUN_AGENT_SERVICE_NAME || "run-agent").trim() || "run-agent";
const runtimeLock = acquireSingleInstanceLock(runAgentServiceName);
console.log(`[lock] Single-instance lock acquired (${runAgentServiceName}): ${runtimeLock.lockFilePath}`);

import("../src/agent/index").catch((error) => {
	runtimeLock.release();
	console.error("[run-agent] Bootstrap failed:", error);
	process.exit(1);
});
