import * as path from "path";
import { ethers } from "ethers";
import { computePerformanceSnapshot, loadCheckpoints, loadFills } from "../metrics/index";
import { buildArtifactIdentityReport } from "./artifacts";
import { readSharedRouterState } from "./shared";

export interface EquityReportPayload {
  generatedAt: string;
  reason: string;
  agentId: string;
  pair: string;
  baselineCapitalUsd: number;
  files: {
    checkpointsFile: string;
    fillsFile: string;
  };
  performance: {
    netPnlUsd: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
    openPositionBase: number;
  };
  drawdownEvidence: {
    source: "local-derived";
    asOfTimestamp: number;
    asOfIso: string;
    lastPriceUsd: number;
    peakEquityUsd: number;
    currentEquityUsd: number;
    maxDrawdownBps: number;
    currentDrawdownBps: number;
  };
  cppi: {
    floorRatio: number;
    multiplier: number;
    floorEquityUsd: number;
    cushionUsd: number;
    cushionRatio: number;
    scale: number;
  };
  guardrails: {
    source: "shared-router-riskParams";
    maxPositionUsd: number;
    maxDrawdownBps: number;
    maxTradesPerHour: number;
    active: boolean;
    defaultCapUsd: number;
  } | null;
  tradeRecord: {
    count: string;
    windowStart: string;
  } | null;
  router: {
    address: string;
    currentNonce: string | null;
    domainSeparator: string | null;
    queryError: string | null;
  };
  runtimeRiskControls?: {
    breakerActive: boolean;
    breakerReason: string | null;
    consecutiveLosses: number;
    dailyLossUsd: number;
    volatilityThrottleActive: boolean;
    volatilityPct: number | null;
    appliedTradeScale: number;
  };
}

export async function buildEquityReportPayload(options: {
  agentId: bigint;
  pair: string;
  baselineCapitalUsd: number;
  provider: ethers.Provider;
  routerAddress: string;
  checkpointsFile?: string;
  fillsFile?: string;
  tracesFile?: string;
  reputationEvidenceFile?: string;
  currentPriceUsd?: number;
  reason?: string;
  strictAgentId?: boolean;
  runtimeRiskControls?: EquityReportPayload["runtimeRiskControls"];
}): Promise<EquityReportPayload> {
  const checkpointsFile = options.checkpointsFile ?? path.join(process.cwd(), "checkpoints.jsonl");
  const fillsFile = options.fillsFile ?? path.join(process.cwd(), "fills.jsonl");
  const artifactDir = path.dirname(checkpointsFile);
  const tracesFile = options.tracesFile ?? path.join(artifactDir, "planner-traces.jsonl");
  const reputationEvidenceFile = options.reputationEvidenceFile ?? path.join(artifactDir, "reputation-feedback.jsonl");
  const checkpoints = loadCheckpoints(checkpointsFile);
  const fills = loadFills(fillsFile);
  const expectedAgentId = options.agentId.toString();
  const strictAgentId = options.strictAgentId ?? true;

  if (strictAgentId) {
    const artifactIdentity = buildArtifactIdentityReport({
      expectedAgentId,
      checkpointsFile,
      fillsFile,
      tracesFile,
      reputationEvidenceFile,
    });
    if (!artifactIdentity.pass) {
      throw new Error(`Strict agent identity failed: ${artifactIdentity.failReasons.join("; ")}`);
    }
  }

  const performance = computePerformanceSnapshot(
    checkpoints,
    fills,
    options.baselineCapitalUsd,
    options.currentPriceUsd
  );
  const routerState = await readSharedRouterState({
    provider: options.provider,
    routerAddress: options.routerAddress,
    agentId: options.agentId,
  });

  const cppiFloorRatio = parseBoundedNumberEnv("CPPI_FLOOR_RATIO", 0.95, 0.8, 0.99);
  const cppiMultiplier = parseBoundedNumberEnv("CPPI_MULTIPLIER", 1, 0.1, 3);
  const floorEquityUsd = performance.peakEquityUsd * cppiFloorRatio;
  const cushionUsd = Math.max(0, performance.currentEquityUsd - floorEquityUsd);
  const cushionSpan = Math.max(1, performance.peakEquityUsd - floorEquityUsd);
  const cushionRatio = cushionUsd / cushionSpan;
  const scale = Math.max(0, Math.min(1, cushionRatio * cppiMultiplier));
  const now = new Date();

  return {
    generatedAt: now.toISOString(),
    reason: options.reason ?? "manual-report",
    agentId: expectedAgentId,
    pair: options.pair,
    baselineCapitalUsd: options.baselineCapitalUsd,
    files: {
      checkpointsFile,
      fillsFile,
    },
    performance: {
      netPnlUsd: Number(performance.netPnlUsd.toFixed(2)),
      realizedPnlUsd: Number(performance.realizedPnlUsd.toFixed(2)),
      unrealizedPnlUsd: Number(performance.unrealizedPnlUsd.toFixed(2)),
      openPositionBase: Number(performance.openPositionBase.toFixed(8)),
    },
    drawdownEvidence: {
      source: "local-derived",
      asOfTimestamp: Math.floor(now.getTime() / 1000),
      asOfIso: now.toISOString(),
      lastPriceUsd: Number(performance.lastPriceUsd.toFixed(2)),
      peakEquityUsd: Number(performance.peakEquityUsd.toFixed(2)),
      currentEquityUsd: Number(performance.currentEquityUsd.toFixed(2)),
      maxDrawdownBps: performance.maxDrawdownBps,
      currentDrawdownBps: performance.currentDrawdownBps,
    },
    cppi: {
      floorRatio: Number(cppiFloorRatio.toFixed(4)),
      multiplier: Number(cppiMultiplier.toFixed(3)),
      floorEquityUsd: Number(floorEquityUsd.toFixed(2)),
      cushionUsd: Number(cushionUsd.toFixed(2)),
      cushionRatio: Number(cushionRatio.toFixed(4)),
      scale: Number(scale.toFixed(4)),
    },
    guardrails: routerState.guardrails,
    tradeRecord: routerState.tradeRecord,
    router: {
      address: options.routerAddress,
      currentNonce: routerState.currentNonce,
      domainSeparator: routerState.domainSeparator,
      queryError: routerState.queryError,
    },
    runtimeRiskControls: options.runtimeRiskControls,
  };
}

function parseBoundedNumberEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = (process.env[name] || "").trim();
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, parsed));
}
