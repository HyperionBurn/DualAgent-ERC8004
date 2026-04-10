export interface FreshnessRecord extends Record<string, unknown> {
  quoteTimestamp?: unknown;
  quotePriceUsd?: unknown;
  timestamp?: unknown;
  checkpointHash?: unknown;
  signature?: unknown;
  agentId?: unknown;
  pair?: unknown;
  action?: unknown;
  priceUsd?: unknown;
}

export interface CheckpointFreshnessSummary {
  identity: string;
  quoteTimestampMs: number | null;
  quoteTimestampLabel: string;
  quoteAgeMs: number | null;
  quoteAgeLabel: string;
  checkpointTimestampMs: number | null;
  checkpointTimestampLabel: string;
  checkpointAgeMs: number | null;
  checkpointAgeLabel: string;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function toTimestampMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 && value < 1e12 ? value * 1000 : value;
  }

  if (typeof value === "bigint") {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }
    return numericValue > 0 && numericValue < 1e12 ? numericValue * 1000 : numericValue;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return null;
    }
    return numericValue > 0 && numericValue < 1e12 ? numericValue * 1000 : numericValue;
  }

  return null;
}

export function resolveQuoteTimestampMs(record: FreshnessRecord): number | null {
  return toTimestampMs(record.quoteTimestamp)
    ?? toTimestampMs(record.timestamp);
}

export function resolveCheckpointTimestampMs(record: FreshnessRecord): number | null {
  return toTimestampMs(record.timestamp);
}

export function getCheckpointFreshnessKey(record: FreshnessRecord): string {
  const quoteTimestampMs = resolveQuoteTimestampMs(record);
  const pair = readString(record.pair) ?? "na";
  const quotePriceUsd = readNumber(record.quotePriceUsd) ?? readNumber(record.priceUsd);

  // Prefer quote identity so repeated checkpoint writes of the same quote are not treated as new snapshots.
  if (quoteTimestampMs !== null) {
    return [
      "quote",
      pair,
      quoteTimestampMs,
      quotePriceUsd === null ? "na" : quotePriceUsd.toFixed(6),
    ].join("|");
  }

  const checkpointHash = readString(record.checkpointHash);
  if (checkpointHash) {
    return checkpointHash;
  }

  const signature = readString(record.signature);
  if (signature) {
    return signature;
  }

  const checkpointTimestampMs = resolveCheckpointTimestampMs(record);
  const agentId = readString(record.agentId);
  const action = readString(record.action);
  const priceUsd = quotePriceUsd !== null
    ? quotePriceUsd.toFixed(6)
    : "na";

  return [
    quoteTimestampMs ?? "na",
    checkpointTimestampMs ?? "na",
    agentId ?? "na",
    pair ?? "na",
    action ?? "na",
    priceUsd,
  ].join("|");
}

export function formatTimestampLabel(timestampMs: number | null): string {
  if (timestampMs === null) {
    return "n/a";
  }

  const date = new Date(timestampMs);
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${date.toLocaleTimeString("en-US", { hour12: false })}`;
}

export function formatAgeLabel(ageMs: number | null): string {
  if (ageMs === null || !Number.isFinite(ageMs)) {
    return "n/a";
  }

  const normalized = Math.max(0, ageMs);
  if (normalized < 1000) {
    return "0s";
  }

  const totalSeconds = Math.floor(normalized / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

export function buildFreshnessSummary(record: FreshnessRecord, nowMs = Date.now()): CheckpointFreshnessSummary {
  const quoteTimestampMs = resolveQuoteTimestampMs(record);
  const checkpointTimestampMs = resolveCheckpointTimestampMs(record);
  const quoteAgeMs = quoteTimestampMs === null ? null : Math.max(0, nowMs - quoteTimestampMs);
  const checkpointAgeMs = checkpointTimestampMs === null ? null : Math.max(0, nowMs - checkpointTimestampMs);

  return {
    identity: getCheckpointFreshnessKey(record),
    quoteTimestampMs,
    quoteTimestampLabel: formatTimestampLabel(quoteTimestampMs),
    quoteAgeMs,
    quoteAgeLabel: formatAgeLabel(quoteAgeMs),
    checkpointTimestampMs,
    checkpointTimestampLabel: formatTimestampLabel(checkpointTimestampMs),
    checkpointAgeMs,
    checkpointAgeLabel: formatAgeLabel(checkpointAgeMs),
  };
}

export function formatFreshnessSummary(record: FreshnessRecord, nowMs = Date.now()): string {
  const summary = buildFreshnessSummary(record, nowMs);
  if (summary.quoteTimestampMs === null) {
    return "quote freshness unavailable";
  }

  return `quote ${summary.quoteTimestampLabel} • age ${summary.quoteAgeLabel}`;
}

export function sortCheckpointsByFreshness<T extends FreshnessRecord>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const bQuote = resolveQuoteTimestampMs(b) ?? Number.NEGATIVE_INFINITY;
    const aQuote = resolveQuoteTimestampMs(a) ?? Number.NEGATIVE_INFINITY;
    if (bQuote !== aQuote) {
      return bQuote - aQuote;
    }

    const bCheckpoint = resolveCheckpointTimestampMs(b) ?? Number.NEGATIVE_INFINITY;
    const aCheckpoint = resolveCheckpointTimestampMs(a) ?? Number.NEGATIVE_INFINITY;
    if (bCheckpoint !== aCheckpoint) {
      return bCheckpoint - aCheckpoint;
    }

    return getCheckpointFreshnessKey(b).localeCompare(getCheckpointFreshnessKey(a));
  });
}
