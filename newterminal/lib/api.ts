// FluxAgent Trading Console - Live API Client
// Connects to the real trading agent backend (Express server from scripts/dashboard.ts)

import type {
  DashboardSnapshot,
  DashboardStatus,
  DashboardPrice,
  DashboardCheckpoint,
  DashboardTrace,
  DashboardMetrics,
  DashboardMarketContext,
  Attestation,
} from './trading-types';

// The API base URL can be configured via NEXT_PUBLIC_API_BASE_URL env var
// In development, Next.js rewrites proxy /api/* to the backend
const API_BASE = (typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_API_BASE_URL || '').replace(/\/$/, '')
  : '').replace(/\/$/, '');

async function loadJson<T>(path: string): Promise<T> {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed for ${path}: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

/**
 * Normalize a timestamp that may be in seconds (Unix) to milliseconds.
 * The backend (dashboard.ts) returns timestamps in seconds.
 */
function ensureMs(ts: number): number {
  return ts > 1e12 ? ts : ts * 1000;
}

/** Normalize all timestamps in the snapshot from seconds → milliseconds */
function normalizeSnapshotTimestamps(data: DashboardSnapshot): DashboardSnapshot {
  // Price
  if (data.price) {
    if (data.price.timestamp != null) data.price.timestamp = ensureMs(data.price.timestamp);
  }
  // Checkpoints
  for (const cp of data.checkpoints) {
    cp.timestamp = ensureMs(cp.timestamp);
  }
  // Traces
  for (const tr of data.traces) {
    tr.timestamp = ensureMs(tr.timestamp);
  }
  // Metrics
  if (data.metrics) {
    for (const action of data.metrics.recentActions) {
      action.timestamp = ensureMs(action.timestamp);
    }
  }
  // Status risk timestamps
  if (data.status?.risk?.drawdownEvidence?.asOfTimestamp != null) {
    data.status.risk.drawdownEvidence.asOfTimestamp = ensureMs(data.status.risk.drawdownEvidence.asOfTimestamp);
  }
  if (data.status?.reputationContext?.latestFeedback?.timestamp != null) {
    data.status.reputationContext.latestFeedback.timestamp = ensureMs(data.status.reputationContext.latestFeedback.timestamp);
  }
  if (data.status?.reputationContext?.latestFailureContext?.timestamp != null) {
    data.status.reputationContext.latestFailureContext.timestamp = ensureMs(data.status.reputationContext.latestFailureContext.timestamp);
  }
  return data;
}

/**
 * Normalize attestation timestamps from seconds → milliseconds
 */
function normalizeAttestationTimestamps(atts: Attestation[]): Attestation[] {
  for (const a of atts) {
    a.timestamp = ensureMs(a.timestamp);
  }
  return atts;
}

/**
 * Load the full dashboard snapshot from 5 parallel API calls.
 * Uses Promise.allSettled so individual endpoint failures don't break the whole dashboard.
 * This exactly mirrors the original Vite dashboard's loadDashboardSnapshot().
 */
export async function loadDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [status, price, checkpoints, traces, metrics] = await Promise.allSettled([
    loadJson<DashboardStatus>('/api/status'),
    loadJson<DashboardPrice>('/api/price'),
    loadJson<DashboardCheckpoint[]>('/api/checkpoints'),
    loadJson<DashboardTrace[]>('/api/traces'),
    loadJson<DashboardMetrics>('/api/metrics'),
  ]);

  const snapshot: DashboardSnapshot = {
    status: status.status === 'fulfilled' ? status.value : null,
    price: price.status === 'fulfilled' ? price.value : null,
    checkpoints: checkpoints.status === 'fulfilled' ? checkpoints.value : [],
    traces: traces.status === 'fulfilled' ? traces.value : [],
    metrics: metrics.status === 'fulfilled' ? metrics.value : null,
  };

  return normalizeSnapshotTimestamps(snapshot);
}

/** Load macro market context (separate endpoint, slower polling) */
export async function loadMarketContext(): Promise<DashboardMarketContext> {
  return loadJson<DashboardMarketContext>('/api/market-context');
}

/** Load on-chain attestation proofs */
export async function loadAttestations(): Promise<Attestation[]> {
  const attestations = await loadJson<Attestation[]>('/api/attestations');
  return normalizeAttestationTimestamps(attestations);
}

/** Send stop signal to the live agent process */
export interface AgentStopResult {
  ok: boolean;
  stopped: boolean;
  serviceName: string;
  lockFilePath: string;
  pid: number | null;
  message: string;
}

export async function stopAgent(): Promise<AgentStopResult> {
  const response = await fetch(`${API_BASE}/api/agent/stop`, {
    method: 'POST',
  });

  const payload = await response.json().catch(() => null) as AgentStopResult | null;
  if (!response.ok) {
    throw new Error(payload?.message || `Request failed for /api/agent/stop: ${response.status}`);
  }

  if (!payload) {
    throw new Error('Agent stop response was empty');
  }

  return payload;
}
