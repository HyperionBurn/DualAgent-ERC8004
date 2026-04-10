interface MetricCardProps {
  label: string;
  value: string;
  tone?: "accent" | "good" | "warn" | "bad" | "muted";
  detail?: string;
}

export default function MetricCard({ label, value, tone = "accent", detail }: MetricCardProps) {
  return (
    <section className={`metric-card tone-${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {detail ? <div className="metric-detail">{detail}</div> : null}
    </section>
  );
}
