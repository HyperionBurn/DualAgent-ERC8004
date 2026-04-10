import { loadCheckpoints } from "../metrics/index";
import { TradeCheckpoint } from "../types/index";

export interface CheckpointSnapshot {
  checkpointCount: number;
  latestCheckpoint?: TradeCheckpoint;
  recentCheckpointSummaries: string[];
}

export function buildCheckpointSnapshot(checkpointsFile: string, limit = 5): CheckpointSnapshot {
  const checkpoints = loadCheckpoints(checkpointsFile);
  const recent = checkpoints.slice(-limit);
  return {
    checkpointCount: checkpoints.length,
    latestCheckpoint: checkpoints[checkpoints.length - 1],
    recentCheckpointSummaries: recent.map((checkpoint) => {
      return `${checkpoint.action} ${checkpoint.pair} @ $${checkpoint.priceUsd.toFixed(2)} conf=${Math.round(checkpoint.confidence * 100)}%`;
    }),
  };
}

export function renderCheckpointSnapshot(snapshot: CheckpointSnapshot): string {
  return [
    `count=${snapshot.checkpointCount}`,
    snapshot.latestCheckpoint ? `latest=${snapshot.latestCheckpoint.action} ${snapshot.latestCheckpoint.pair} @ $${snapshot.latestCheckpoint.priceUsd.toFixed(2)}` : "latest=none",
    snapshot.recentCheckpointSummaries.length > 0 ? `recent=${snapshot.recentCheckpointSummaries.join(" || ")}` : "recent=none",
  ].join(" | ");
}
