import type { DashboardTrace } from "../lib/api";

interface TraceFeedProps {
  traces: DashboardTrace[];
}

export default function TraceFeed({ traces }: TraceFeedProps) {
  return (
    <section className="panel panel-feed panel-traces">
      <div className="panel-head">
        <span>Planner Traces</span>
        <span className="panel-count">{traces.length}</span>
      </div>
      <div className="feed-list">
        {traces.slice(0, 6).map((trace, index) => (
          <article className="feed-item trace-item" key={`${trace.timestamp}-${index}`}>
            <div className="feed-item-top">
              <strong>{trace.model}</strong>
              <span className={trace.usedFallback ? "chip warning" : "chip accent"}>{trace.keyLabel}</span>
              <span>{trace.decision.action}</span>
            </div>
            <p>{trace.decision.reasoning}</p>
            <div className="feed-meta">
              <span>{trace.pair}</span>
              <span>{trace.usedFallback ? "fallback" : trace.keyLabel}</span>
            </div>
          </article>
        ))}
        {traces.length === 0 ? <div className="empty-state">No planner traces yet.</div> : null}
      </div>
    </section>
  );
}
