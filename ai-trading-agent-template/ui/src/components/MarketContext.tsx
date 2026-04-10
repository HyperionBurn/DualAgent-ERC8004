import { useEffect, useState } from "react";
import { loadMarketContext, type DashboardMarketContext } from "../lib/api";

export default function MarketContext() {
  const [context, setContext] = useState<DashboardMarketContext | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetch() {
      try {
        const data = await loadMarketContext();
        if (mounted && data) {
          setContext(data);
        }
      } catch (err) {
        // fail silently to remain subtle
      }
    }

    fetch();
    const timer = setInterval(fetch, 10000); // Poll every 10s

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  if (!context) return null;

  return (
    <div className="macro-context-strip">
      <div className="macro-item">
        <span className="macro-label">NTWK BASE FEE:</span>
        <span className="macro-val">{context.networkGas}</span>
      </div>
      <div className="macro-divider" />
      <div className="macro-item">
        <span className="macro-label">FEAR/GREED:</span>
        <span className={`macro-val color-${context.fearGreed.class.toLowerCase().replace(/\s+/g, '-')}`}>
          {context.fearGreed.value} ({context.fearGreed.class})
        </span>
      </div>
      <div className="macro-divider" />
      <div className="macro-item">
        <span className="macro-label">ORDER TILT:</span>
        <span className="macro-val">{context.depthTilt}</span>
      </div>
      <div className="macro-divider" />
      <div className="macro-item">
        <span className="macro-label">FUNDING RATE:</span>
        <span className="macro-val">{context.fundingRate}</span>
      </div>
    </div>
  );
}
