/**
 * Kraken CLI client
 *
 * Wraps the Kraken CLI binary (https://github.com/kraken-oss/kraken-cli) instead
 * of rolling our own HTTP/HMAC client. The CLI handles all exchange plumbing:
 *   - Cryptographic nonce management
 *   - HMAC-SHA512 request signing
 *   - Rate-limit retries
 *   - Paper-trading sandbox (--sandbox flag)
 *
 * Prerequisites:
 *   1. Install the Kraken CLI:
 *      curl -sSL https://github.com/kraken-oss/kraken-cli/releases/latest/download/install.sh | sh
 *      (or download the binary for your platform from the releases page)
 *   2. Set KRAKEN_API_KEY and KRAKEN_API_SECRET in .env
 *   3. Set KRAKEN_SANDBOX=true for paper trading
 *
 * The CLI also ships with a built-in MCP server for AI agent integration.
 * See the KrakenMCPClient below for the MCP-based approach.
 *
 * CLI docs: https://github.com/kraken-oss/kraken-cli
 */

import { execFile } from "child_process";
import { promisify } from "util";
import axios from "axios";
import { KrakenOrder, KrakenOrderResult, MarketData } from "../types/index";

const execFileAsync = promisify(execFile);
const KRAKEN_CLI_TIMEOUT_MS = Math.max(5_000, Number(process.env.KRAKEN_CLI_TIMEOUT_MS || "45000"));
const SANDBOX_FALLBACK_TO_LOCAL_PAPER = (process.env.KRAKEN_SANDBOX_FALLBACK_TO_LOCAL_PAPER || "true").toLowerCase() !== "false";

interface ExecFailure extends NodeJS.ErrnoException {
  killed?: boolean;
  signal?: NodeJS.Signals | null;
  cmd?: string;
}

function parseCommandArgs(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];

  const tokens: string[] = [];
  const pattern = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|[^\s]+/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(trimmed)) !== null) {
    const token = match[1] ?? match[2] ?? match[0];
    tokens.push(token.replace(/\\(["'])/g, "$1"));
  }

  return tokens;
}

// Path to the kraken CLI binary. Override with KRAKEN_CLI_PATH env var
// if the binary is not on PATH.
//
// KRAKEN_CLI_ARGS can be used to prepend launcher args before normal Kraken
// command arguments, which is useful when Kraken is installed inside WSL.
// Example:
//   KRAKEN_CLI_PATH=C:\\Windows\\System32\\wsl.exe
//   KRAKEN_CLI_ARGS=-d Ubuntu -- kraken
//
// NOTE: These are resolved lazily via getters because dotenv.config() runs
// after module-level imports are hoisted, so process.env may not be populated
// at module evaluation time.
function getKrakenBin(): string {
  return process.env.KRAKEN_CLI_PATH || "kraken";
}

function getKrakenBinArgs(): string[] {
  return parseCommandArgs(process.env.KRAKEN_CLI_ARGS || "");
}

export class KrakenClient {
  private readonly sandbox: boolean;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private warnedTickerFallback = false;
  private warnedSandboxOrderFallback = false;

  constructor() {
    this.sandbox = process.env.KRAKEN_SANDBOX === "true";
    this.apiKey = process.env.KRAKEN_API_KEY || "";
    this.apiSecret = process.env.KRAKEN_API_SECRET || "";

    if (!this.apiKey || !this.apiSecret) {
      console.warn("[kraken] No API credentials set — private commands will fail");
    }
    if (this.sandbox) {
      console.log("[kraken] Running in SANDBOX (paper trading) mode");
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core CLI runner
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Execute a Kraken CLI command and return parsed JSON output.
   *
   * The CLI is invoked as:
   *   kraken [--sandbox] [--api-key KEY --api-secret SECRET] <subcommand> [args...]
   *
   * All output is JSON by default when --json flag is passed.
   */
  private async run(subcommand: string[], isPrivate = false): Promise<unknown> {
    const krakenBin = getKrakenBin();
    const krakenBinArgs = getKrakenBinArgs();
    const args: string[] = [...krakenBinArgs];

    if (isPrivate && !this.sandbox) {
      args.push("--api-key", this.apiKey, "--api-secret", this.apiSecret);
    }

    args.push(...subcommand);
    args.push("-o", "json");

    try {
      const { stdout } = await execFileAsync(krakenBin, args, { timeout: KRAKEN_CLI_TIMEOUT_MS });
      return JSON.parse(stdout.trim());
    } catch (err: unknown) {
      const failure = err as ExecFailure;

      // If CLI binary not found, surface a helpful error
      if (failure.code === "ENOENT") {
        throw new Error(
          `[kraken] Kraken CLI binary not found at "${krakenBin}".\n` +
          `Install it from https://github.com/kraken-oss/kraken-cli or set KRAKEN_CLI_PATH`
        );
      }

      if (failure.killed && failure.signal === "SIGTERM") {
        throw new Error(
          `[kraken] CLI command timed out after ${KRAKEN_CLI_TIMEOUT_MS}ms: ${krakenBin} ${args.join(" ")}`
        );
      }

      throw err;
    }
  }

  private isCliTimeoutError(error: unknown): boolean {
    if (!(error instanceof Error)) {
      return false;
    }
    return /timed out/i.test(error.message) || /ETIMEDOUT/i.test(error.message);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Market data (public — no auth)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Fetch live ticker data for a trading pair.
   *
   * CLI equivalent:
   *   kraken --json ticker --pair XBTUSD
   */
  async getTicker(pair: string): Promise<MarketData> {
    try {
      const result = await this.run(["ticker", pair]) as KrakenTickerResponse;
      const data = (result.result ?? result) as Record<string, KrakenTickerEntry>;
      const t = data[pair] ?? data[Object.keys(data)[0]];
      if (!t) throw new Error(`[kraken] No ticker data for pair: ${pair}`);
      return this.mapTickerToMarketData(pair, t);
    } catch (error) {
      if (!this.warnedTickerFallback) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[kraken] CLI ticker failed; using public REST fallback. Reason: ${message}`);
        this.warnedTickerFallback = true;
      }

      const { data } = await axios.get("https://api.kraken.com/0/public/Ticker", {
        params: { pair },
        timeout: 15_000,
      });

      if (Array.isArray(data?.error) && data.error.length > 0) {
        throw new Error(`[kraken] Public ticker error: ${data.error.join(", ")}`);
      }

      const result = (data?.result ?? {}) as Record<string, KrakenTickerEntry>;
      const t = result[pair] ?? result[Object.keys(result)[0]];
      if (!t) throw new Error(`[kraken] No public ticker data for pair: ${pair}`);
      return this.mapTickerToMarketData(pair, t);
    }
  }

  private mapTickerToMarketData(pair: string, ticker: KrakenTickerEntry): MarketData {
    return {
      pair,
      price: parseFloat(ticker.c?.[0] ?? ticker.last ?? ticker.price ?? "0"),
      bid: parseFloat(ticker.b?.[0] ?? ticker.bid ?? "0"),
      ask: parseFloat(ticker.a?.[0] ?? ticker.ask ?? "0"),
      volume: parseFloat(ticker.v?.[1] ?? ticker.volume ?? "0"),
      vwap: parseFloat(ticker.p?.[1] ?? ticker.vwap ?? "0"),
      high: parseFloat(ticker.h?.[1] ?? ticker.high ?? "0"),
      low: parseFloat(ticker.l?.[1] ?? ticker.low ?? "0"),
      timestamp: Date.now(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Trading (private — requires API key)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Place a market or limit order.
   *
   * CLI equivalent:
   *   kraken --json order add --pair XBTUSD --type buy --ordertype market --volume 0.001
   *
   * In sandbox mode the CLI uses paper trading — no real funds are affected.
   */
  async placeOrder(order: KrakenOrder): Promise<KrakenOrderResult> {
    let args: string[];
    if (this.sandbox) {
      // Paper trading: kraken paper buy <PAIR> <VOL> [--type limit --price P]
      args = ["paper", order.type, order.pair, order.volume];
      if (order.ordertype === "limit" && order.price) args.push("--type", "limit", "--price", order.price);
    } else {
      args = ["order", "buy" === order.type ? "buy" : "sell", order.pair, order.volume, "--type", order.ordertype];
      if (order.price) args.push("--price", order.price);
    }

    let result: KrakenOrderResponse;
    try {
      result = await this.run(args, !this.sandbox) as KrakenOrderResponse;
    } catch (error) {
      if (this.sandbox && SANDBOX_FALLBACK_TO_LOCAL_PAPER && this.isCliTimeoutError(error)) {
        if (!this.warnedSandboxOrderFallback) {
          console.warn("[kraken] Sandbox CLI order timed out; falling back to local paper fill simulation.");
          this.warnedSandboxOrderFallback = true;
        }
        const syntheticTxId = `SANDBOX-LOCAL-${Date.now()}`;
        return {
          txid: [syntheticTxId],
          descr: {
            order: `${order.type} ${order.volume} ${order.pair} @ ${order.ordertype}${order.price ? ` ${order.price}` : ""}`,
          },
        };
      }
      throw error;
    }

    if (result.error?.length) {
      throw new Error(`[kraken] Order error: ${result.error.join(", ")}`);
    }

    return {
      txid: result.result?.txid ?? [`${this.sandbox ? "SANDBOX" : "ORDER"}-${Date.now()}`],
      descr: result.result?.descr ?? { order: `${order.type} ${order.volume} ${order.pair}` },
    };
  }

  /**
   * Get open orders.
   *
   * CLI equivalent:
   *   kraken --json order list
   */
  async getOpenOrders(): Promise<Record<string, unknown>> {
    const result = await this.run(["order", "list"], true) as { result?: Record<string, unknown> };
    return result.result ?? {};
  }

  /**
   * Get account balance.
   *
   * CLI equivalent:
   *   kraken --json balance
   */
  async getBalance(): Promise<Record<string, string>> {
    const result = await this.run(["balance"], true) as { result?: Record<string, string> };
    return result.result ?? {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Kraken MCP client (alternative — for agents using the MCP protocol directly)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The Kraken CLI ships with a built-in MCP server that exposes Kraken operations
 * as structured tools for AI agents. This is the preferred integration if your
 * agent already uses the Model Context Protocol.
 *
 * Start the MCP server:
 *   kraken mcp serve --port 8080
 *
 * The server exposes tools like:
 *   - kraken_ticker   { pair: string }
 *   - kraken_balance  {}
 *   - kraken_order    { pair, type, ordertype, volume }
 *
 * For LangChain/Claude tool use, wire the MCP server as a tool provider.
 * For direct use, call the MCP server via HTTP as shown below.
 *
 * See: https://github.com/kraken-oss/kraken-cli#mcp-server
 */
export class KrakenMCPClient {
  private readonly baseUrl: string;

  constructor(port = 8080) {
    this.baseUrl = `http://localhost:${port}`;
    console.log(`[kraken-mcp] Connecting to MCP server at ${this.baseUrl}`);
    console.log(`[kraken-mcp] Start server with: kraken mcp serve --port ${port}`);
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(toolName: string, params: Record<string, unknown>): Promise<unknown> {
    // Dynamic import to keep axios optional if only CLI mode is used
    const axios = (await import("axios")).default;
    const { data } = await axios.post(`${this.baseUrl}/tools/${toolName}`, params);
    return data;
  }

  async getTicker(pair: string): Promise<MarketData> {
    const result = await this.callTool("kraken_ticker", { pair }) as KrakenTickerResponse;
    const t = result.result?.[pair] ?? result.result?.[Object.keys(result.result ?? {})[0]];
    if (!t) throw new Error(`[kraken-mcp] No ticker data for pair: ${pair}`);
    return {
      pair,
      price: parseFloat(t.c?.[0] ?? t.last ?? "0"),
      bid: parseFloat(t.b?.[0] ?? t.bid ?? "0"),
      ask: parseFloat(t.a?.[0] ?? t.ask ?? "0"),
      volume: parseFloat(t.v?.[1] ?? t.volume ?? "0"),
      vwap: parseFloat(t.p?.[1] ?? t.vwap ?? "0"),
      high: parseFloat((t.h?.[1] ?? (t as Record<string, unknown>).high ?? "0") as string),
      low: parseFloat((t.l?.[1] ?? (t as Record<string, unknown>).low ?? "0") as string),
      timestamp: Date.now(),
    };
  }

  async placeOrder(order: KrakenOrder): Promise<KrakenOrderResult> {
    const result = await this.callTool("kraken_order", { ...order }) as KrakenOrderResponse;
    return {
      txid: result.result?.txid ?? [`MCP-${Date.now()}`],
      descr: result.result?.descr ?? { order: `${order.type} ${order.volume} ${order.pair}` },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types for CLI response shapes
// ─────────────────────────────────────────────────────────────────────────────

interface KrakenTickerResponse {
  error?: string[];
  result?: Record<string, KrakenTickerEntry>;
}

interface KrakenTickerEntry {
  a?: string[];
  b?: string[];
  c?: string[];
  v?: string[];
  p?: string[];
  h?: string[];
  l?: string[];
  last?: string;
  price?: string;
  bid?: string;
  ask?: string;
  volume?: string;
  vwap?: string;
  high?: string;
  low?: string;
}

interface KrakenOrderResponse {
  error?: string[];
  result?: {
    txid: string[];
    descr: { order: string };
  };
}
