/**
 * Telegram Alert Bot — real-time trade notifications for FluxAgent
 *
 * Sends formatted BUY/SELL alerts to Telegram when the agent executes a trade.
 * Fully non-fatal: failures never crash the agent loop.
 *
 * Config via .env:
 *   TELEGRAM_ALERTS=true
 *   TELEGRAM_BOT_TOKEN=<from @BotFather>
 *   TELEGRAM_CHAT_ID=<from getUpdates>
 */

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";
const ENABLED = (process.env.TELEGRAM_ALERTS || "false").toLowerCase() === "true";

/** Subset of TradeCheckpoint fields used for the alert payload. */
export interface TelegramAlert {
  agentId: string;
  action: string;
  pair: string;
  amountUsd: number;
  priceUsd: number;
  confidence: number;
  reasoning: string;
  intentHash: string;
  timestamp: number;
  decisionContext?: {
    regimeLabel?: string;
    regimeConfidence?: number;
    expectedEdgeBps?: number;
    costDragBps?: number;
    netEdgeBps?: number;
    dualGateStatus?: string;
    riskGateStatus?: string;
    executionIntent?: string;
    cppiScale?: number;
    breakerState?: string;
  };
}

/**
 * Build an HTML-formatted Telegram message from the alert payload.
 * Respects Telegram's 4096-char message limit.
 */
function formatAlert(alert: TelegramAlert): string {
  const emoji = alert.action === "BUY" ? "🟢" : alert.action === "SELL" ? "🔴" : "⚪️";
  const confPct = Math.round(alert.confidence * 100);
  const edge = alert.decisionContext?.expectedEdgeBps ?? 0;
  const netEdge = alert.decisionContext?.netEdgeBps ?? 0;
  const regime = alert.decisionContext?.regimeLabel ?? "unknown";
  const gate = alert.decisionContext?.dualGateStatus ?? "n/a";
  const scale = alert.decisionContext?.cppiScale?.toFixed(2) ?? "1.00";
  const breaker = alert.decisionContext?.breakerState ?? "clear";
  const riskGate = alert.decisionContext?.riskGateStatus ?? "n/a";
  const time = new Date(alert.timestamp * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const lines = [
    `${emoji} <b>FluxAgent #${alert.agentId}</b>`,
    "",
    `<b>${alert.action}</b> $${alert.amountUsd.toFixed(2)} @ $${alert.priceUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
    `Confidence: <b>${confPct}%</b>`,
    "",
    "<b>Signal:</b>",
    `  Regime: <code>${regime}</code>`,
    `  Edge: <code>${edge.toFixed(1)} bps</code> (net ${netEdge.toFixed(1)} bps)`,
    `  Dual gate: <code>${gate}</code>`,
    `  Risk gate: <code>${riskGate}</code>`,
    `  CPPI scale: <code>${scale}</code>`,
    `  Breaker: <code>${breaker}</code>`,
    "",
    "<b>Reasoning:</b>",
    truncate(alert.reasoning, 350),
    "",
    `🔗 Intent: <code>${alert.intentHash.slice(0, 20)}…</code>`,
    `🕐 ${time}`,
  ];

  const text = lines.join("\n");

  // Telegram max message length is 4096 characters
  return text.length > 4090 ? text.slice(0, 4087) + "…" : text;
}

/** Truncate a string to maxLength, breaking at the last space. */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  const cut = str.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut) + "…";
}

/**
 * Send a trade alert to Telegram.
 *
 * - Silently returns if TELEGRAM_ALERTS is not enabled.
 * - Skips HOLD actions (only BUY/SELL trigger alerts).
 * - Wraps all I/O in try/catch — failures are non-fatal.
 */
export async function sendTelegramAlert(alert: TelegramAlert): Promise<void> {
  if (!ENABLED || !BOT_TOKEN || !CHAT_ID) return;
  if (alert.action === "HOLD") return;

  const text = formatAlert(alert);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s hard timeout

    const res = await fetch(
      `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: CHAT_ID,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        signal: controller.signal,
      },
    );

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[telegram] API returned ${res.status}: ${body.slice(0, 120)}`);
    }
  } catch (e: any) {
    // Non-fatal — never let Telegram failures crash the agent loop
    console.warn("[telegram] Alert failed (non-fatal):", e?.message ?? e);
  }
}
