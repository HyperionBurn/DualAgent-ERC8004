import * as fs from "fs";

export interface PlannerTraceArtifact {
  agentId?: string;
  timestamp?: number;
  pair?: string;
  priceUsd?: number;
}

export interface ArtifactIdentityBucket {
  file: string;
  found: boolean;
  count: number;
  agentIds: string[];
  missingAgentIdRows: number;
}

export interface ArtifactIdentityReport {
  expectedAgentId: string;
  checkpoints: ArtifactIdentityBucket;
  fills: ArtifactIdentityBucket;
  traces: ArtifactIdentityBucket;
  reputation: ArtifactIdentityBucket;
  pass: boolean;
  failReasons: string[];
}

function exists(filePath: string): boolean {
  return fs.existsSync(filePath);
}

export function readJson<T>(filePath: string): T | null {
  if (!exists(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

export function readJsonLines<T>(filePath: string): T[] {
  if (!exists(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  return raw
    .split("\n")
    .map((line) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is T => entry !== null);
}

export function countJsonLines(filePath: string): number {
  if (!exists(filePath)) return 0;
  return fs.readFileSync(filePath, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .length;
}

function normalizeAgentId(value: unknown): string | null {
  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function buildBucket(
  file: string,
  rows: Record<string, unknown>[],
  agentField = "agentId"
): ArtifactIdentityBucket {
  const agentIds: string[] = [];
  let missingAgentIdRows = 0;

  for (const row of rows) {
    const agentId = normalizeAgentId(row[agentField]);
    if (!agentId) {
      missingAgentIdRows++;
      continue;
    }
    agentIds.push(agentId);
  }

  return {
    file,
    found: exists(file),
    count: rows.length,
    agentIds: uniqueSorted(agentIds),
    missingAgentIdRows,
  };
}

function appendIdentityFailures(
  expectedAgentId: string,
  label: string,
  bucket: ArtifactIdentityBucket,
  failReasons: string[]
): void {
  if (bucket.missingAgentIdRows > 0) {
    failReasons.push(`${label} contains ${bucket.missingAgentIdRows} rows without agentId`);
  }

  if (bucket.agentIds.length > 1) {
    failReasons.push(`${label} contains mixed agentIds (${bucket.agentIds.join(", ")})`);
  }

  if (bucket.agentIds.length === 1 && bucket.agentIds[0] !== expectedAgentId) {
    failReasons.push(`${label} belongs to agent ${bucket.agentIds[0]}, expected ${expectedAgentId}`);
  }

  if (bucket.agentIds.length > 1 || bucket.agentIds.some((agentId) => agentId !== expectedAgentId)) {
    return;
  }

  if (bucket.count > 0 && bucket.agentIds.length === 0) {
    failReasons.push(`${label} has rows but no valid agentId values`);
  }
}

export function buildArtifactIdentityReport(options: {
  expectedAgentId: string;
  checkpointsFile: string;
  fillsFile: string;
  tracesFile: string;
  reputationEvidenceFile: string;
}): ArtifactIdentityReport {
  const checkpointRows = readJsonLines<Record<string, unknown>>(options.checkpointsFile);
  const fillRows = readJsonLines<Record<string, unknown>>(options.fillsFile);
  const traceRows = readJsonLines<Record<string, unknown>>(options.tracesFile);
  const reputationRows = readJsonLines<Record<string, unknown>>(options.reputationEvidenceFile);

  const checkpoints = buildBucket(options.checkpointsFile, checkpointRows);
  const fills = buildBucket(options.fillsFile, fillRows);
  const traces = buildBucket(options.tracesFile, traceRows);
  const reputation = buildBucket(options.reputationEvidenceFile, reputationRows);

  const failReasons: string[] = [];
  appendIdentityFailures(options.expectedAgentId, "checkpoints", checkpoints, failReasons);
  appendIdentityFailures(options.expectedAgentId, "fills", fills, failReasons);
  appendIdentityFailures(options.expectedAgentId, "planner traces", traces, failReasons);
  appendIdentityFailures(options.expectedAgentId, "reputation evidence", reputation, failReasons);

  return {
    expectedAgentId: options.expectedAgentId,
    checkpoints,
    fills,
    traces,
    reputation,
    pass: failReasons.length === 0,
    failReasons,
  };
}
