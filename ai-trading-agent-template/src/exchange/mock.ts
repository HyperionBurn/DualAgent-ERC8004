import { KrakenOrder, KrakenOrderResult, MarketData } from "../types/index";

/**
 * Mock exchange adapter for ERC-only hackathon mode.
 *
 * Produces deterministic synthetic market ticks and mock order receipts so the
 * on-chain identity/risk/validation flow can run without Kraken credentials.
 */
export class MockExchangeClient {
  private readonly baseVolume: number;
  private readonly spreadBps: number;
  private readonly volatilityBps: number;
  private readonly trendBps: number;
  private price: number;

  constructor() {
    this.price = parseEnvNumber("MOCK_BASE_PRICE", 65000);
    this.baseVolume = parseEnvNumber("MOCK_BASE_VOLUME", 1200);
    this.spreadBps = parseEnvNumber("MOCK_SPREAD_BPS", 2);
    this.volatilityBps = parseEnvNumber("MOCK_VOLATILITY_BPS", 30);
    this.trendBps = parseEnvNumber("MOCK_TREND_BPS", 0);

    console.log("[mock-exchange] Enabled synthetic market mode");
    console.log(
      `[mock-exchange] basePrice=$${this.price.toFixed(2)} vol=${this.volatilityBps}bps trend=${this.trendBps}bps spread=${this.spreadBps}bps`
    );
  }

  async getTicker(pair: string): Promise<MarketData> {
    const drift = this.trendBps / 10_000;
    const noise = ((Math.random() * 2 - 1) * this.volatilityBps) / 10_000;
    this.price = Math.max(1, this.price * (1 + drift + noise));

    const halfSpread = this.price * (this.spreadBps / 10_000) / 2;
    const bid = this.price - halfSpread;
    const ask = this.price + halfSpread;

    const daySwing = this.price * (this.volatilityBps / 10_000) * 8;
    const volumeNoise = 1 + (Math.random() * 0.3 - 0.15);

    return {
      pair,
      price: round2(this.price),
      bid: round2(bid),
      ask: round2(ask),
      volume: round2(this.baseVolume * volumeNoise),
      vwap: round2(this.price * (1 - 0.001 + Math.random() * 0.002)),
      high: round2(this.price + daySwing),
      low: round2(this.price - daySwing),
      timestamp: Date.now(),
    };
  }

  async placeOrder(order: KrakenOrder): Promise<KrakenOrderResult> {
    const txid = `MOCK-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
    return {
      txid: [txid],
      descr: {
        order: `${order.type} ${order.volume} ${order.pair} @ ${order.ordertype}${order.price ? ` ${order.price}` : ""}`,
      },
    };
  }
}

function parseEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
