import type { DashboardStatus } from "../lib/api";

interface StatusChipsProps {
  status: DashboardStatus;
}

export default function StatusChips({ status }: StatusChipsProps) {
  const drawdownBps = status.risk?.drawdownEvidence?.currentDrawdownBps;
  const maxDrawdownBps = status.risk?.guardrails?.maxDrawdownBps;
  const guardrailsActive = status.risk?.guardrails?.active;

  return (
    <div className="status-chips">
      <span className="chip accent">{status.mode}</span>
      <span className="chip">market {status.marketMode ?? status.mode}</span>
      <span className="chip">provider {status.plannerProvider ?? "none"}</span>
      <span className="chip">strategy {status.strategy ?? "momentum"}</span>
      <span className={status.sandbox ? "chip warning" : "chip danger"}>
        {status.sandbox ? "paper" : "live"}
      </span>
      <span className={status.agentRunning ? "chip accent" : "chip danger"}>
        {status.agentRunning ? "running" : "stopped"}
      </span>
      {typeof drawdownBps === "number" ? (
        <span className={typeof maxDrawdownBps === "number" && drawdownBps > maxDrawdownBps ? "chip danger" : "chip warning"}>
          local dd {drawdownBps}bps
        </span>
      ) : null}
      {guardrailsActive === true ? <span className="chip accent">router guardrails</span> : null}
      {typeof status.agentRuntimePid === "number" ? <span className="chip">pid {status.agentRuntimePid}</span> : null}
      <span className="chip">agent {status.agentId}</span>
    </div>
  );
}
