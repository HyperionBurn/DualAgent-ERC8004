import { useEffect, useMemo, useRef, useState } from "react";
import MetricCard from "./components/MetricCard";
import StatusChips from "./components/StatusChips";
import CheckpointFeed from "./components/CheckpointFeed";
import TraceFeed from "./components/TraceFeed";
import EquityChart from "./components/EquityChart";
import ValidationProofs from "./components/ValidationProofs";
import MarketContext from "./components/MarketContext";
import { loadDashboardSnapshot, stopAgent, type DashboardSnapshot } from "./lib/api";

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
}

function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUsd(Math.abs(value))}`;
}

function formatBps(value: number): string {
  return `${value.toLocaleString("en-US")} bps`;
}

function formatRange(minValue: number | null | undefined, maxValue: number | null | undefined): string {
  if (typeof minValue !== "number" || typeof maxValue !== "number") {
    return "n/a";
  }
  return `${minValue}-${maxValue}`;
}

export default function App() {
  const mountedRef = useRef(true);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [isStopping, setIsStopping] = useState(false);
  const [controlMessage, setControlMessage] = useState<string | null>(null);
  const [controlError, setControlError] = useState<string | null>(null);

  async function refreshSnapshot() {
    try {
      const next = await loadDashboardSnapshot();
      if (!mountedRef.current) {
        return;
      }
      setSnapshot(next);
      setError(null);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (caught) {
      if (!mountedRef.current) {
        return;
      }
      setError(caught instanceof Error ? caught.message : "Failed to load dashboard data");
    }
  }

  async function handleStopAgent() {
    if (isStopping || snapshot?.status?.agentRunning === false) {
      return;
    }

    setIsStopping(true);
    setControlError(null);
    setControlMessage(null);

    try {
      const result = await stopAgent();
      if (!mountedRef.current) {
        return;
      }
      setControlMessage(result.message);
      await refreshSnapshot();
    } catch (caught) {
      if (!mountedRef.current) {
        return;
      }
      setControlError(caught instanceof Error ? caught.message : "Failed to stop agent");
    } finally {
      if (mountedRef.current) {
        setIsStopping(false);
      }
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    void refreshSnapshot();
    const timer = window.setInterval(() => {
      void refreshSnapshot();
    }, 4000);

    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, []);

  if (!snapshot) {
    return (
      <main className="shell shell-loading">
        <div className="hero-card loading-card">
          <div className="eyebrow">GLM Trading Console</div>
          <h1>Booting planner, metrics, and trace channels.</h1>
          <p>Waiting for dashboard data.</p>
        </div>
      </main>
    );
  }

  const latestCheckpoint = snapshot.checkpoints[0];
  const previousCheckpoint = snapshot.checkpoints[1];
  const priceNow = snapshot.price?.price ?? latestCheckpoint?.priceUsd ?? 0;
  const priceChangePct = previousCheckpoint && latestCheckpoint && previousCheckpoint.priceUsd > 0
    ? ((latestCheckpoint.priceUsd - previousCheckpoint.priceUsd) / previousCheckpoint.priceUsd) * 100
    : 0;

  const summary = snapshot.metrics?.summary;
  const agentRunning = snapshot.status?.agentRunning ?? false;
  const riskStatus = snapshot.status?.risk;
  const readinessStatus = snapshot.status?.readiness;
  const reputationContext = snapshot.status?.reputationContext;
  const currentDrawdownBps = riskStatus?.drawdownEvidence?.currentDrawdownBps;
  const guardrailDrawdownBps = riskStatus?.guardrails?.maxDrawdownBps;

  return (
    <main className="shell">
      <MarketContext />
      <section className="hero-card">
        <div className="hero-copy">
          <div className="eyebrow">FluxAgent Ensemble Console</div>
          <h1>Multi-Agent Consensus Verification</h1>
          <p>
            {summary
              ? `Composite ${summary.compositeScore.toFixed(1)} | ${summary.recentFlow}`
              : "Verifying live ticks with dual-LLM guardrails."}
          </p>
          {snapshot.status ? <StatusChips status={snapshot.status} /> : null}
          <div className="hero-actions">
            <button
              type="button"
              className="stop-agent-button"
              onClick={() => void handleStopAgent()}
              disabled={isStopping || !agentRunning}
            >
              {isStopping ? "Stopping agent..." : agentRunning ? "Stop agent" : "Agent stopped"}
            </button>
            <div className="hero-control-copy">
              <span className={agentRunning ? "control-pill running" : "control-pill stopped"}>
                {agentRunning ? "running" : "stopped"}
              </span>
              <span className="control-text">
                {controlError || controlMessage || (agentRunning ? "Send a stop signal to the live agent process." : "The agent process is not running.")}
              </span>
            </div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="price-block">
            <span className="price-label">Live Pair Convergence</span>
            <strong className="price-value">{priceNow ? formatUsd(priceNow) : "—"}</strong>
            <span className={priceChangePct >= 0 ? "price-delta up" : "price-delta down"}>
              {priceChangePct >= 0 ? "+" : ""}{priceChangePct.toFixed(2)}%
            </span>
          </div>
        </div>
      </section>

      <section className="masterclass-grid">
        <EquityChart checkpoints={snapshot.checkpoints} />
        <ValidationProofs />
      </section>

      <section className="metrics-grid">
        <MetricCard
          label="Composite Score"
          value={summary ? summary.compositeScore.toFixed(2) : "—"}
          tone={summary ? (summary.compositeScore >= 70 ? "good" : summary.compositeScore >= 50 ? "warn" : "bad") : "muted"}
          detail={summary
            ? `Risk-adjusted ${summary.riskAdjustedProfitabilityScore.toFixed(1)} · Drawdown ${summary.drawdownControlScore.toFixed(1)}`
            : undefined}
        />
        <MetricCard
          label="Net PnL"
          value={summary ? formatSignedUsd(summary.netPnlUsd) : "—"}
          tone={(summary?.netPnlUsd ?? 0) >= 0 ? "good" : "bad"}
          detail={summary ? `Realized ${formatSignedUsd(summary.realizedPnlUsd)} · Unrealized ${formatSignedUsd(summary.unrealizedPnlUsd)}` : undefined}
        />
        <MetricCard
          label="Drawdown"
          value={summary ? formatBps(summary.maxDrawdownBps) : "—"}
          tone={summary && summary.maxDrawdownBps < 1000 ? "good" : "warn"}
          detail={summary
            ? `Validation ${summary.averageValidationScore.toFixed(1)} (${summary.validationSource})`
            : undefined}
        />
        <MetricCard
          label="Reputation"
          value={summary ? summary.averageReputationScore.toFixed(1) : "—"}
          tone={summary && summary.averageReputationScore >= 60 ? "good" : "warn"}
          detail={summary
            ? `${summary.reputationSource} · ${summary.reputationFeedbackCount} feedbacks`
            : `Model ${snapshot.traces[0]?.model ?? snapshot.status?.strategy ?? "momentum"}`}
        />
      </section>

      <section className="layout-grid">
        <CheckpointFeed checkpoints={snapshot.checkpoints} />
        <TraceFeed traces={snapshot.traces} />
      </section>

      <footer className="footer-bar">
        <span>{snapshot.status?.agentId ? `Agent ${snapshot.status.agentId}` : "Agent not registered yet"}</span>
        <span>{snapshot.status?.marketMode ?? snapshot.status?.mode ?? "mock"} feed</span>
        {typeof currentDrawdownBps === "number" ? (
          <span>
            Local drawdown {currentDrawdownBps} bps
            {typeof guardrailDrawdownBps === "number" ? ` / limit ${guardrailDrawdownBps} bps` : ""}
          </span>
        ) : null}
        {reputationContext?.latestFailureContext?.deltaNetPnlUsd ? (
          <span>
            Last failure delta {formatSignedUsd(reputationContext.latestFailureContext.deltaNetPnlUsd)}
          </span>
        ) : null}
        <span>{lastUpdated ? `Updated ${lastUpdated}` : "Waiting for update"}</span>
        {error ? <span className="error-pill">{error}</span> : null}
      </footer>
    </main>
  );
}
