import * as path from "path";
import { loadCheckpoints, loadFills } from "../metrics/index";
import { TradeCheckpoint, TradeFill } from "../types/index";

export interface RecentMemorySnapshot {
  checkpointCount: number;
  fillCount: number;
  recentCheckpoints: TradeCheckpoint[];
  recentFills: TradeFill[];
  latestCheckpoint?: TradeCheckpoint;
  latestFill?: TradeFill;
  recentCheckpointSummaries: string[];
  recentFillSummaries: string[];
}

export interface RecentMemoryInput {
  checkpointsFile?: string;
  fillsFile?: string;
  limit?: number;
}

export function buildRecentMemorySnapshot(input: RecentMemoryInput = {}): RecentMemorySnapshot {
  const checkpointsFile = input.checkpointsFile || path.join(process.cwd(), "checkpoints.jsonl");
  const fillsFile = input.fillsFile || path.join(process.cwd(), "fills.jsonl");
  const limit = input.limit ?? 6;

  const checkpoints = loadCheckpoints(checkpointsFile);
  const fills = loadFills(fillsFile);
  const recentCheckpoints = checkpoints.slice(-limit);
  const recentFills = fills.slice(-limit);

  return {
    checkpointCount: checkpoints.length,
    fillCount: fills.length,
    recentCheckpoints,
    recentFills: recentFills,
    latestCheckpoint: checkpoints[checkpoints.length - 1],
    latestFill: fills[fills.length - 1],
    recentCheckpointSummaries: recentCheckpoints.map(formatCheckpointSummary),
    recentFillSummaries: recentFills.map(formatFillSummary),
  };
}

export function renderRecentMemorySnapshot(snapshot: RecentMemorySnapshot): string {
  return [
    `checkpoints=${snapshot.checkpointCount} fills=${snapshot.fillCount}`,
    snapshot.latestCheckpoint ? `latest checkpoint: ${formatCheckpointSummary(snapshot.latestCheckpoint)}` : "latest checkpoint: none",
    snapshot.latestFill ? `latest fill: ${formatFillSummary(snapshot.latestFill)}` : "latest fill: none",
    snapshot.recentCheckpointSummaries.length > 0 ? `recent checkpoints: ${snapshot.recentCheckpointSummaries.join(" || ")}` : "recent checkpoints: none",
    snapshot.recentFillSummaries.length > 0 ? `recent fills: ${snapshot.recentFillSummaries.join(" || ")}` : "recent fills: none",
  ].join(" | ");
}

function formatCheckpointSummary(checkpoint: TradeCheckpoint): string {
  return `${checkpoint.action} ${checkpoint.pair} @ $${checkpoint.priceUsd.toFixed(2)} conf=${Math.round(checkpoint.confidence * 100)}%`;
}

function formatFillSummary(fill: TradeFill): string {
  return `${fill.action} ${fill.pair} $${fill.amountUsd.toFixed(2)} @ $${fill.priceUsd.toFixed(2)} mode=${fill.mode}`;
}
