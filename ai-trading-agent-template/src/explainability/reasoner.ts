/**
 * Human-readable trade explanation formatter.
 *
 * Every trade decision gets a plain-language explanation that answers:
 *  - What did the agent decide to do?
 *  - Why? (from the strategy's reasoning field)
 *  - How confident was it?
 *  - What was the market context at the time?
 *
 * These explanations are also hashed into the EIP-712 checkpoint so they're
 * cryptographically tied to the on-chain record.
 */

import { MarketData, TradeCheckpoint, TradeDecision } from "../types/index";
import { formatAgeLabel, formatTimestampLabel } from "../freshness";

/**
 * Produce a single human-readable explanation string for a trade decision.
 */
export function formatExplanation(decision: TradeDecision, market: MarketData): string {
  const action = decision.action;
  const pair = market.pair;
  const price = market.price.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const confidencePct = (decision.confidence * 100).toFixed(0);
  const spread = (((market.ask - market.bid) / market.price) * 100).toFixed(4);
  const time = new Date().toISOString();
  const quoteTimestampLabel = formatTimestampLabel(market.timestamp);
  const quoteAgeLabel = formatAgeLabel(Date.now() - market.timestamp);
  const context = decision.decisionContext;
  const contextSection = context
    ? [
      `  Decision context:`,
      `    regime=${context.regimeLabel ?? "n/a"} (conf=${formatMaybeNumber(context.regimeConfidence, 2)})`,
      `    edge expected=${formatMaybeNumber(context.expectedEdgeBps, 2)}bps cost=${formatMaybeNumber(context.costDragBps, 2)}bps net=${formatMaybeNumber(context.netEdgeBps, 2)}bps threshold=${formatMaybeNumber(context.edgeThresholdBps, 2)}bps`,
      `    gates dual=${context.dualGateStatus ?? "n/a"} risk=${context.riskGateStatus ?? "n/a"}`,
      `    execution=${context.executionIntent ?? "n/a"} cppiScale=${formatMaybeNumber(context.cppiScale, 3)} breaker=${context.breakerState ?? "n/a"}`,
      `    sizing=${context.regimeSizingStatus ?? "n/a"} multiplier=${formatMaybeNumber(context.regimeSizingMultiplier, 3)} reason=${context.regimeSizingReason ?? "n/a"}`,
      `    budget=${context.dailyBudgetStatus ?? "n/a"} remaining=${formatMaybeNumber(context.dailyBudgetRemainingUsd, 2)}usd limit=${formatMaybeNumber(context.dailyBudgetLimitUsd, 2)}usd used=${formatMaybeNumber((context.dailyBudgetUtilizationPct ?? NaN) * 100, 1)}% multiplier=${formatMaybeNumber(context.dailyBudgetMultiplier, 3)}`,
    ].join("\n")
    : "";

  if (action === "HOLD") {
    return (
      `[${time}] HOLD ${pair} @ ${price}\n` +
      `  Confidence: ${confidencePct}%\n` +
      `  Reason: ${decision.reasoning}\n` +
      `  Market snapshot: ${quoteTimestampLabel} (age ${quoteAgeLabel})\n` +
      `${contextSection ? `${contextSection}\n` : ""}` +
      `  Market: bid=${market.bid}, ask=${market.ask}, spread=${spread}%, vol=${market.volume.toFixed(2)}`
    );
  }

  const amountStr = decision.amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });

  return (
    `[${time}] ${action} ${pair} — ${amountStr} @ ${price}\n` +
    `  Confidence: ${confidencePct}%\n` +
    `  Reason: ${decision.reasoning}\n` +
    `  Market snapshot: ${quoteTimestampLabel} (age ${quoteAgeLabel})\n` +
    `${contextSection ? `${contextSection}\n` : ""}` +
    `  Market context: 24h high=${market.high}, low=${market.low}, VWAP=${market.vwap.toFixed(2)}\n` +
    `  Spread: ${spread}% | Volume: ${market.volume.toFixed(2)}`
  );
}

/**
 * Format a checkpoint for console output — useful for live monitoring.
 */
export function formatCheckpointLog(checkpoint: TradeCheckpoint): string {
  const context = checkpoint.decisionContext;
  const quoteTimestampLabel = formatTimestampLabel(checkpoint.quoteTimestamp ?? checkpoint.timestamp * 1000);
  const quoteAgeLabel = formatAgeLabel(Date.now() - (checkpoint.quoteTimestamp ?? checkpoint.timestamp * 1000));
  const contextSummary = context
    ? `\n  Context:  regime=${context.regimeLabel ?? "n/a"} edge=${formatMaybeNumber(context.netEdgeBps, 2)}bps gate=${context.riskGateStatus ?? "n/a"} sizing=${context.regimeSizingStatus ?? "n/a"} budget=${context.dailyBudgetStatus ?? "n/a"}`
    : "";
  return (
    `\n${"─".repeat(72)}\n` +
    `CHECKPOINT — ${checkpoint.action} ${checkpoint.pair}\n` +
    `  Agent:     ${checkpoint.agentId}\n` +
    `  Timestamp: ${new Date(checkpoint.timestamp * 1000).toISOString()}\n` +
    `  Quote:     ${quoteTimestampLabel} (age ${quoteAgeLabel})\n` +
    `  Amount:    $${checkpoint.amountUsd}\n` +
    `  Price:     $${checkpoint.priceUsd}\n` +
    `  Confidence: ${(checkpoint.confidence * 100).toFixed(0)}%\n` +
    `  Reasoning: ${checkpoint.reasoning}\n` +
    `${contextSummary}` +
    `  Sig:       ${checkpoint.signature.slice(0, 20)}...${checkpoint.signature.slice(-10)}\n` +
    `  Signer:    ${checkpoint.signerAddress}\n` +
    `${"─".repeat(72)}\n`
  );
}

function formatMaybeNumber(value: number | undefined, precision: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "n/a";
  }
  return value.toFixed(precision);
}
