import type { DashboardCheckpoint } from "../lib/api";

interface CheckpointFeedProps {
  checkpoints: DashboardCheckpoint[];
}

export default function CheckpointFeed({ checkpoints }: CheckpointFeedProps) {
  return (
    <section className="panel panel-feed">
      <div className="panel-head">
        <span>Checkpoints</span>
        <span className="panel-count">{checkpoints.length}</span>
      </div>
      <div className="feed-list">
        {checkpoints.slice(0, 6).map((checkpoint, index) => (
          <article className="feed-item" key={`${checkpoint.intentHash}-${index}`}>
            <div className="feed-item-top">
              <strong className={`action-${checkpoint.action.toLowerCase()}`}>{checkpoint.action}</strong>
              <span>{checkpoint.pair}</span>
              <span>{Math.round(checkpoint.confidence * 100)}%</span>
            </div>
            <p>{checkpoint.reasoning}</p>
            <div className="feed-meta">
              <span>${checkpoint.priceUsd.toFixed(2)}</span>
              <span>{new Date(checkpoint.timestamp * 1000).toLocaleTimeString()}</span>
            </div>
          </article>
        ))}
        {checkpoints.length === 0 ? <div className="empty-state">No checkpoints yet.</div> : null}
      </div>
    </section>
  );
}
