import { MarketData } from "../types/index";

export interface MarketSnapshot {
  pair: string;
  price: number;
  bid: number;
  ask: number;
  spreadBps: number;
  midPrice: number;
  rangePct: number;
  premiumVsVwapPct: number;
  volatilityHint: "low" | "moderate" | "elevated";
}

export function buildMarketSnapshot(market: MarketData): MarketSnapshot {
  const midPrice = (market.bid + market.ask) / 2;
  const spreadBps = midPrice > 0 ? ((market.ask - market.bid) / midPrice) * 10_000 : 0;
  const rangePct = market.price > 0 ? ((market.high - market.low) / market.price) * 100 : 0;
  const premiumVsVwapPct = market.vwap > 0 ? ((market.price - market.vwap) / market.vwap) * 100 : 0;

  let volatilityHint: MarketSnapshot["volatilityHint"] = "low";
  if (rangePct > 4 || Math.abs(premiumVsVwapPct) > 1.5) {
    volatilityHint = "elevated";
  } else if (rangePct > 1.5 || Math.abs(premiumVsVwapPct) > 0.5) {
    volatilityHint = "moderate";
  }

  return {
    pair: market.pair,
    price: market.price,
    bid: market.bid,
    ask: market.ask,
    spreadBps: round2(spreadBps),
    midPrice: round2(midPrice),
    rangePct: round2(rangePct),
    premiumVsVwapPct: round2(premiumVsVwapPct),
    volatilityHint,
  };
}

export function renderMarketSnapshot(snapshot: MarketSnapshot): string {
  return [
    `${snapshot.pair} price=${formatUsd(snapshot.price)} bid=${formatUsd(snapshot.bid)} ask=${formatUsd(snapshot.ask)}`,
    `spread=${snapshot.spreadBps.toFixed(2)}bps mid=${formatUsd(snapshot.midPrice)} range=${snapshot.rangePct.toFixed(2)}%`,
    `vwap premium=${snapshot.premiumVsVwapPct.toFixed(2)}% volatility=${snapshot.volatilityHint}`,
  ].join(" | ");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
