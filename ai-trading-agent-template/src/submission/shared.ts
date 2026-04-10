import { ethers } from "ethers";

export interface SharedContractAddresses {
  agentRegistry: string | null;
  hackathonVault: string | null;
  riskRouter: string | null;
  reputationRegistry: string | null;
  validationRegistry: string | null;
}

export interface SharedContractRecord {
  address: string | null;
  codePresent: boolean;
  codeHash: string | null;
}

export interface SharedContractSnapshot {
  generatedAt: string;
  expectedChainId: number;
  chainId: number;
  isSepolia: boolean;
  allContractsPresent: boolean;
  contracts: Record<keyof SharedContractAddresses, SharedContractRecord>;
}

export interface RouterGuardrailsSnapshot {
  source: "shared-router-riskParams";
  maxPositionUsd: number;
  maxDrawdownBps: number;
  maxTradesPerHour: number;
  active: boolean;
  defaultCapUsd: number;
}

export interface RouterTradeRecordSnapshot {
  count: string;
  windowStart: string;
}

export interface RouterStateSnapshot {
  agentId: string;
  guardrails: RouterGuardrailsSnapshot | null;
  tradeRecord: RouterTradeRecordSnapshot | null;
  currentNonce: string | null;
  domainSeparator: string | null;
  queryError: string | null;
}

export interface RouterSimulationSnapshot {
  amountUsd: number;
  approved: boolean;
  reason: string;
}

export interface RouterEnforcementEvidence extends RouterStateSnapshot {
  agentWallet: string;
  pair: string;
  smallTrade: RouterSimulationSnapshot | null;
  oversizedTrade: RouterSimulationSnapshot | null;
}

const SHARED_ROUTER_READ_ABI = [
  "function riskParams(uint256 agentId) external view returns (uint256 maxPositionUsdScaled, uint256 maxDrawdownBps, uint256 maxTradesPerHour, bool active)",
  "function simulateIntent((uint256 agentId, address agentWallet, string pair, string action, uint256 amountUsdScaled, uint256 maxSlippageBps, uint256 nonce, uint256 deadline) intent) external view returns (bool approved, string reason)",
  "function getIntentNonce(uint256 agentId) external view returns (uint256)",
  "function getTradeRecord(uint256 agentId) external view returns (uint256 count, uint256 windowStart)",
  "function domainSeparator() external view returns (bytes32)",
] as const;

function normalizeAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return ethers.getAddress(value);
  } catch {
    return null;
  }
}

function normalizeSimulationResult(result: unknown): { approved: boolean; reason: string } {
  if (Array.isArray(result)) {
    return {
      approved: Boolean(result[0]),
      reason: typeof result[1] === "string" ? result[1] : "",
    };
  }

  if (result && typeof result === "object") {
    const record = result as { approved?: unknown; reason?: unknown; 0?: unknown; 1?: unknown };
    return {
      approved: Boolean(record.approved ?? record[0]),
      reason: typeof record.reason === "string" ? record.reason : typeof record[1] === "string" ? record[1] : "",
    };
  }

  return { approved: false, reason: "Simulation returned no result" };
}

export async function buildSharedContractSnapshot(
  provider: ethers.Provider,
  addresses: SharedContractAddresses,
  expectedChainId = 11155111
): Promise<SharedContractSnapshot> {
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const contractEntries = Object.entries(addresses) as Array<[keyof SharedContractAddresses, string | null]>;
  const contracts = {} as Record<keyof SharedContractAddresses, SharedContractRecord>;

  for (const [name, rawAddress] of contractEntries) {
    const address = normalizeAddress(rawAddress);
    if (!address) {
      contracts[name] = {
        address: rawAddress ?? null,
        codePresent: false,
        codeHash: null,
      };
      continue;
    }

    const code = await provider.getCode(address);
    const codePresent = code !== "0x";
    contracts[name] = {
      address,
      codePresent,
      codeHash: codePresent ? ethers.keccak256(code) : null,
    };
  }

  const allContractsPresent = Object.values(contracts).every((entry) => entry.codePresent);

  return {
    generatedAt: new Date().toISOString(),
    expectedChainId,
    chainId,
    isSepolia: chainId === expectedChainId,
    allContractsPresent,
    contracts,
  };
}

export async function readSharedRouterState(options: {
  provider: ethers.Provider;
  routerAddress: string;
  agentId: bigint;
}): Promise<RouterStateSnapshot> {
  const router = new ethers.Contract(options.routerAddress, SHARED_ROUTER_READ_ABI, options.provider);

  try {
    const [params, tradeRecord, nonce, domainSeparator] = await Promise.all([
      router.riskParams(options.agentId),
      router.getTradeRecord(options.agentId),
      router.getIntentNonce(options.agentId),
      router.domainSeparator(),
    ]);

    return {
      agentId: options.agentId.toString(),
      guardrails: {
        source: "shared-router-riskParams",
        maxPositionUsd: Number(params.maxPositionUsdScaled ?? params[0] ?? 0n) / 100,
        maxDrawdownBps: Number(params.maxDrawdownBps ?? params[1] ?? 0n),
        maxTradesPerHour: Number(params.maxTradesPerHour ?? params[2] ?? 0n),
        active: Boolean(params.active ?? params[3] ?? false),
        defaultCapUsd: 1000,
      },
      tradeRecord: {
        count: String(tradeRecord.count ?? tradeRecord[0] ?? "0"),
        windowStart: String(tradeRecord.windowStart ?? tradeRecord[1] ?? "0"),
      },
      currentNonce: String(nonce),
      domainSeparator: typeof domainSeparator === "string" ? domainSeparator : null,
      queryError: null,
    };
  } catch (error) {
    return {
      agentId: options.agentId.toString(),
      guardrails: null,
      tradeRecord: null,
      currentNonce: null,
      domainSeparator: null,
      queryError: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function buildRouterEnforcementEvidence(options: {
  provider: ethers.Provider;
  routerAddress: string;
  agentId: bigint;
  agentWallet: string;
  pair: string;
  smallTradeUsd?: number;
  oversizedTradeUsd?: number;
}): Promise<RouterEnforcementEvidence> {
  const state = await readSharedRouterState({
    provider: options.provider,
    routerAddress: options.routerAddress,
    agentId: options.agentId,
  });

  const router = new ethers.Contract(options.routerAddress, SHARED_ROUTER_READ_ABI, options.provider);
  const smallTradeUsd = options.smallTradeUsd ?? 50;
  const oversizedTradeUsd = options.oversizedTradeUsd ?? 5000;

  if (state.queryError) {
    return {
      ...state,
      agentWallet: options.agentWallet,
      pair: options.pair,
      smallTrade: null,
      oversizedTrade: null,
    };
  }

  const nonce = BigInt(state.currentNonce || "0");
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 300);

  const buildIntent = (amountUsd: number) => ({
    agentId: options.agentId,
    agentWallet: options.agentWallet,
    pair: options.pair,
    action: "BUY",
    amountUsdScaled: BigInt(Math.round(amountUsd * 100)),
    maxSlippageBps: 50n,
    nonce,
    deadline,
  });

  try {
    const [smallResult, oversizedResult] = await Promise.all([
      router.simulateIntent(buildIntent(smallTradeUsd)),
      router.simulateIntent(buildIntent(oversizedTradeUsd)),
    ]);

    const smallTrade = normalizeSimulationResult(smallResult);
    const oversizedTrade = normalizeSimulationResult(oversizedResult);

    return {
      ...state,
      agentWallet: options.agentWallet,
      pair: options.pair,
      smallTrade: {
        amountUsd: smallTradeUsd,
        approved: smallTrade.approved,
        reason: smallTrade.reason,
      },
      oversizedTrade: {
        amountUsd: oversizedTradeUsd,
        approved: oversizedTrade.approved,
        reason: oversizedTrade.reason,
      },
    };
  } catch (error) {
    return {
      ...state,
      agentWallet: options.agentWallet,
      pair: options.pair,
      smallTrade: null,
      oversizedTrade: null,
      queryError: error instanceof Error ? error.message : String(error),
    };
  }
}
