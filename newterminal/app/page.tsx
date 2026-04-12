'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { TopBar } from '@/components/trading/top-bar';
import { MarketContext } from '@/components/trading/market-context';
import { StatusPanel } from '@/components/trading/status-panel';
import { MetricCard } from '@/components/trading/metric-card';
import { EquityChart } from '@/components/trading/equity-chart';
import { RiskPanel } from '@/components/trading/risk-panel';
import { ValidationProofs } from '@/components/trading/validation-proofs';
import { CheckpointFeed } from '@/components/trading/checkpoint-feed';
import { TraceFeed } from '@/components/trading/trace-feed';
import { NotificationToast } from '@/components/trading/notification-toast';
import { Footer } from '@/components/trading/footer';
import { useTradeNotifications } from '@/hooks/use-trade-notifications';
import {
  loadDashboardSnapshot,
  loadMarketContext,
  loadAttestations,
  stopAgent,
} from '@/lib/api';
import {
  mockSnapshot,
  mockMarketContext,
  mockAttestations,
  priceHistory,
} from '@/lib/mock-data';
import type { ConnectionStatus, DashboardSnapshot, DashboardMarketContext, Attestation } from '@/lib/trading-types';

// How often to poll the live API (ms) — matches original dashboard's 4s interval
const POLL_INTERVAL = 4000;
const MARKET_CONTEXT_INTERVAL = 10000;
const ATTESTATION_INTERVAL = 6000;

export default function TradingConsole() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [marketContext, setMarketContext] = useState<DashboardMarketContext>(mockMarketContext);
  const [attestations, setAttestations] = useState<Attestation[]>(mockAttestations);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');
  const [latency, setLatency] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isStopping, setIsStopping] = useState(false);
  const [leftRailCollapsed, setLeftRailCollapsed] = useState(false);
  const [rightRailCollapsed, setRightRailCollapsed] = useState(false);
  const [useMockFallback, setUseMockFallback] = useState(false);
  const consecutiveErrorsRef = useRef(0);

  // --- Uptime calculation ---
  const agentStartTimeRef = useRef<Date | null>(null);
  const [uptime, setUptime] = useState('');
  const [checkpointCount, setCheckpointCount] = useState(0);
  const [tradeCount, setTradeCount] = useState(0);

  useEffect(() => {
    if (snapshot?.status?.agentRunning && !agentStartTimeRef.current) {
      agentStartTimeRef.current = new Date();
    }
    if (!snapshot?.status?.agentRunning) {
      agentStartTimeRef.current = null;
      setUptime('');
    }
  }, [snapshot?.status?.agentRunning]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (agentStartTimeRef.current) {
        const elapsed = Math.floor((Date.now() - agentStartTimeRef.current.getTime()) / 1000);
        const h = Math.floor(elapsed / 3600);
        const m = Math.floor((elapsed % 3600) / 60);
        setUptime(h > 0 ? `${h}h ${m}m` : `${m}m`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (snapshot) {
      setCheckpointCount(snapshot.checkpoints.length);
      setTradeCount(snapshot.checkpoints.filter((cp) => cp.action !== 'HOLD').length);
    }
  }, [snapshot]);

  // --- Trade notifications ---
  const { latestNotification, unreadCount, requestPermission, clearLatestNotification } = useTradeNotifications(
    snapshot?.checkpoints ?? []
  );

  // --- Live data polling ---
  useEffect(() => {
    let mounted = true;

    async function refreshSnapshot() {
      const start = Date.now();
      try {
        const data = await loadDashboardSnapshot();
        if (!mounted) return;

        const elapsed = Date.now() - start;
        setLatency(elapsed);
        consecutiveErrorsRef.current = 0;
        setConnectionStatus(elapsed > 2000 ? 'degraded' : 'connected');

        // Only set snapshot if we got meaningful data
        if (data.status || data.checkpoints.length > 0 || data.metrics) {
          setSnapshot(data);
          setUseMockFallback(false);
        } else if (!snapshot) {
          // First load with empty data — use mock
          setSnapshot(mockSnapshot);
          setUseMockFallback(true);
        }
        setLastUpdated(new Date());
      } catch {
        if (!mounted) return;
        consecutiveErrorsRef.current++;
        if (consecutiveErrorsRef.current >= 3) {
          setConnectionStatus('disconnected');
          // Fall back to mock data so the dashboard still looks good
          if (!snapshot) {
            setSnapshot(mockSnapshot);
            setUseMockFallback(true);
          }
        }
      }
    }

    async function refreshMarketContext() {
      try {
        const data = await loadMarketContext();
        if (mounted) {
          setMarketContext(data);
        }
      } catch {
        // Keep previous data on failure
      }
    }

    async function refreshAttestations() {
      try {
        const data = await loadAttestations();
        if (mounted) {
          setAttestations(data.length > 0 ? data : mockAttestations);
        }
      } catch {
        // Keep previous data on failure
      }
    }

    // Initial load
    void refreshSnapshot();
    void refreshMarketContext();
    void refreshAttestations();

    // Set up polling intervals
    const snapshotTimer = setInterval(() => void refreshSnapshot(), POLL_INTERVAL);
    const marketTimer = setInterval(() => void refreshMarketContext(), MARKET_CONTEXT_INTERVAL);
    const attestationTimer = setInterval(() => void refreshAttestations(), ATTESTATION_INTERVAL);

    return () => {
      mounted = false;
      clearInterval(snapshotTimer);
      clearInterval(marketTimer);
      clearInterval(attestationTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStopAgent = useCallback(async () => {
    setIsStopping(true);
    try {
      const result = await stopAgent();
      // Refresh snapshot after stopping
      const data = await loadDashboardSnapshot();
      setSnapshot(data);
      if (result.message) {
        // Could show a toast here
      }
    } catch {
      // Even if the API call fails, optimistically update UI
      setSnapshot(prev => prev ? {
        ...prev,
        status: prev.status ? { ...prev.status, agentRunning: false } : null,
      } : prev);
    } finally {
      setIsStopping(false);
    }
  }, []);

  // Calculate price change percentage from checkpoint data
  const priceChangePct = useMemo(() => {
    if (!snapshot) return 0;
    const cps = snapshot.checkpoints;
    if (cps.length < 2) return 0;
    const sorted = [...cps].sort((a, b) => a.timestamp - b.timestamp);
    const first = sorted[0].priceUsd;
    const last = snapshot.price?.price ?? sorted[sorted.length - 1].priceUsd;
    return first > 0 ? ((last - first) / first) * 100 : 0;
  }, [snapshot]);

  // Generate sparkline data from checkpoint prices (fallback to mock priceHistory)
  const pnlSparkline = useMemo(() => {
    if (!snapshot || snapshot.checkpoints.length < 2) return priceHistory.slice(-20);
    return [...snapshot.checkpoints]
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-20)
      .map(cp => cp.priceUsd);
  }, [snapshot]);

  if (!snapshot) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-secondary skeleton-shimmer" />
          <p className="text-muted-foreground">Connecting to agent...</p>
        </div>
      </div>
    );
  }

  if (!snapshot.status) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-secondary skeleton-shimmer" />
          <p className="text-muted-foreground">Waiting for agent status...</p>
          {useMockFallback && (
            <button
              onClick={() => setSnapshot(mockSnapshot)}
              className="px-4 py-2 text-sm bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
            >
              Load Demo Data
            </button>
          )}
        </div>
      </div>
    );
  }

  const { status, checkpoints, traces, metrics } = snapshot;
  const currentPrice = snapshot.price?.price ?? 0;
  const drawdownBps = status.risk?.drawdownEvidence?.currentDrawdownBps ?? 0;

  return (
    <div className="min-h-screen flex flex-col relative z-10">
      {/* Top Bar */}
      <TopBar 
        agentId={status.agentId}
        connectionStatus={connectionStatus}
        latency={latency}
        isDemo={useMockFallback}
        unreadNotificationCount={unreadCount}
        onBellClick={requestPermission}
        uptime={uptime}
        checkpointCount={checkpointCount}
        tradeCount={tradeCount}
      />

      {/* Trade Notification Toast */}
      <NotificationToast
        notification={latestNotification}
        onDismiss={clearLatestNotification}
      />

      {/* Market Context Strip */}
      <div className="px-4 py-3">
        <MarketContext data={marketContext} />
      </div>

      {/* Main Content - Three Column Layout */}
      <main className="flex-1 px-4 pb-4">
        <div className="flex gap-4 h-full">
          {/* Left Rail - Status & Quick Metrics */}
          <aside className={`transition-all duration-300 ${leftRailCollapsed ? 'w-12' : 'w-72'} flex-shrink-0 space-y-4`}>
            {!leftRailCollapsed && (
              <>
                <StatusPanel 
                  status={status}
                  onStopAgent={handleStopAgent}
                  isStopping={isStopping}
                />
              </>
            )}
            <button
              onClick={() => setLeftRailCollapsed(!leftRailCollapsed)}
              className="w-full p-2 text-xs text-muted-foreground hover:text-foreground glass-panel rounded-lg transition-colors"
            >
              {leftRailCollapsed ? '→' : '← Collapse'}
            </button>
          </aside>

          {/* Center - Main Canvas */}
          <div className="flex-1 space-y-4 min-w-0">
            {/* Equity Chart */}
            <EquityChart 
              checkpoints={checkpoints}
              currentPrice={currentPrice}
              priceChange={priceChangePct}
            />

            {/* Metrics Row */}
            <div className="grid grid-cols-4 gap-4">
              <MetricCard
                label="Composite Score"
                value={metrics?.summary.compositeScore != null ? metrics.summary.compositeScore.toFixed(1) : '—'}
                tone={
                  (metrics?.summary.compositeScore ?? 0) >= 80 ? 'good' :
                  (metrics?.summary.compositeScore ?? 0) >= 50 ? 'warn' : 'bad'
                }
                progress={metrics?.summary.compositeScore != null ? metrics.summary.compositeScore : undefined}
                detail="Risk-adjusted performance"
              />
              <MetricCard
                label="Net PnL"
                value={metrics?.summary.netPnlUsd != null ? metrics.summary.netPnlUsd.toFixed(2) : '—'}
                prefix="$"
                tone={(metrics?.summary.netPnlUsd ?? 0) >= 0 ? 'good' : 'bad'}
                sparklineData={pnlSparkline}
                detail={metrics?.summary.realizedPnlUsd != null ? `Realized: $${metrics.summary.realizedPnlUsd.toFixed(2)}` : undefined}
              />
              <MetricCard
                label="Max Drawdown"
                value={metrics?.summary.maxDrawdownBps != null ? metrics.summary.maxDrawdownBps : '—'}
                suffix=" bps"
                tone={
                  (metrics?.summary.maxDrawdownBps ?? 0) < 300 ? 'good' :
                  (metrics?.summary.maxDrawdownBps ?? 0) < 600 ? 'warn' : 'bad'
                }
                detail={`Current: ${drawdownBps} bps`}
              />
              <MetricCard
                label="Reputation"
                value={metrics?.summary.averageReputationScore != null ? metrics.summary.averageReputationScore.toFixed(1) : '—'}
                suffix="/100"
                tone={
                  (metrics?.summary.averageReputationScore ?? 0) >= 80 ? 'good' :
                  (metrics?.summary.averageReputationScore ?? 0) >= 50 ? 'warn' : 'bad'
                }
                detail={`${metrics?.summary.reputationFeedbackCount ?? 0} feedback`}
              />
            </div>

            {/* Dual Feeds */}
            <div className="grid grid-cols-2 gap-4 min-h-[400px]">
              <CheckpointFeed checkpoints={checkpoints} />
              <TraceFeed traces={traces} />
            </div>
          </div>

          {/* Right Rail - Risk & Validation */}
          <aside className={`transition-all duration-300 ${rightRailCollapsed ? 'w-12' : 'w-80'} flex-shrink-0 space-y-4`}>
            {!rightRailCollapsed && (
              <>
                {status.risk ? (
                  <RiskPanel risk={status.risk} />
                ) : (
                  <div className="glass-panel rounded-xl p-4 text-center">
                    <p className="text-xs text-muted-foreground">Risk data unavailable</p>
                  </div>
                )}
                <ValidationProofs attestations={attestations} />
              </>
            )}
            <button
              onClick={() => setRightRailCollapsed(!rightRailCollapsed)}
              className="w-full p-2 text-xs text-muted-foreground hover:text-foreground glass-panel rounded-lg transition-colors"
            >
              {rightRailCollapsed ? '←' : 'Collapse →'}
            </button>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <Footer 
        status={status}
        lastUpdated={lastUpdated}
        drawdownBps={drawdownBps}
        maxDrawdownBps={status.risk?.guardrails?.maxDrawdownBps || undefined}
      />
    </div>
  );
}
