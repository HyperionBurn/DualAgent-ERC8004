import { MarketData, TradeDecision } from "../types/index";

export interface PaperExecutionPreview {
  action: TradeDecision["action"];
  amountUsd: number;
  estimatedVolumeBase: number;
  estimatedOrderLabel: string;
  executionMode: string;
}

export function buildPaperExecutionPreview(decision: TradeDecision, market: MarketData, executionMode: string): PaperExecutionPreview {
  const estimatedVolumeBase = market.price > 0 ? decision.amount / market.price : 0;
  return {
    action: decision.action,
    amountUsd: round2(decision.amount),
    estimatedVolumeBase: round8(estimatedVolumeBase),
    estimatedOrderLabel: `${decision.action.toLowerCase()} ${estimatedVolumeBase.toFixed(8)} ${market.pair}`,
    executionMode,
  };
}

export function renderPaperExecutionPreview(preview: PaperExecutionPreview): string {
  return [
    `mode=${preview.executionMode}`,
    `exampleDecision=${preview.action}`,
    `exampleNotionalUsd=${preview.amountUsd.toFixed(2)}USD`,
    `exampleBaseSize=${preview.estimatedVolumeBase.toFixed(8)}`,
    `exampleOrderLabel=${preview.estimatedOrderLabel}`,
  ].join(" | ");
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round8(value: number): number {
  return Math.round(value * 100_000_000) / 100_000_000;
}
