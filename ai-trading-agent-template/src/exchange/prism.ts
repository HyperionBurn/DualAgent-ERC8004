import axios from "axios";
import { MarketData } from "../types/index";

interface PrismPriceResponse {
  object?: string;
  symbol?: string;
  price_usd?: number | string;
  volume_24h?: number | string;
  change_24h_pct?: number | string;
  warnings?: string[];
}

interface PrismRequestOptions {
  params?: Record<string, string | number | boolean | null | undefined>;
  cacheKey?: string;
  cacheTtlMs?: number;
  forceFresh?: boolean;
  headers?: Record<string, string>;
}

interface PrismTickerOptions {
  forceFresh?: boolean;
}

interface PrismCacheEntry<T> {
  value: T;
  cachedAt: number;
  expiresAt: number;
}

interface PrismHttpResponse<T> {
  status: number;
  data: T;
  headers?: Record<string, unknown>;
}

interface PrismAttemptError extends Error {
  retryAt?: number;
  status?: number;
}

interface PrismCooldownState {
  active: boolean;
  disabledUntil: number;
  remainingMs: number;
  reason: string;
}

interface KrakenTickerEntry {
  a?: string[];
  b?: string[];
  c?: string[];
  h?: string[];
  l?: string[];
  p?: string[];
  v?: string[];
}

export class PrismMarketClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fallbackToKraken: boolean;
  private readonly syntheticSpreadBps: number;
  private readonly defaultCacheTtlMs: number;
  private readonly requestBudgetPerMinute: number;
  private readonly requestWindowMs: number;
  private readonly rateLimitCooldownMs: number;
  private readonly resolveCacheTtlMs: number;
  private readonly technicalCacheTtlMs: number;
  private readonly microstructureCacheTtlMs: number;
  private readonly historicalCacheTtlMs: number;
  private readonly requestCache = new Map<string, PrismCacheEntry<unknown>>();
  private readonly inFlightRequests = new Map<string, Promise<unknown>>();
  private requestWindowStartedAt = Date.now();
  private requestsInWindow = 0;
  private prismCooldownUntil = 0;
  private prismCooldownReason = "";
  private warnedKrakenFallback = false;

  constructor() {
    this.apiKey = (process.env.PRISM_API_KEY || "").trim();
    this.baseUrl = (process.env.PRISM_API_BASE_URL || "https://api.prismapi.ai").trim().replace(/\/$/, "");
    this.timeoutMs = parseNumberEnv("PRISM_TIMEOUT_MS", 12_000);
    this.syntheticSpreadBps = parseNumberEnv("PRISM_SYNTHETIC_SPREAD_BPS", 1);
    this.defaultCacheTtlMs = parsePositiveNumberEnv("PRISM_CACHE_TTL_MS", 60_000);
    this.requestBudgetPerMinute = parsePositiveNumberEnv("PRISM_MAX_REQUESTS_PER_MINUTE", 12);
    this.requestWindowMs = 60_000;
    this.rateLimitCooldownMs = parsePositiveNumberEnv("PRISM_RATE_LIMIT_COOLDOWN_MS", 15 * 60_000);
    this.resolveCacheTtlMs = 6 * 60 * 60_000;
    this.technicalCacheTtlMs = 2 * 60_000;
    this.microstructureCacheTtlMs = 15_000;
    this.historicalCacheTtlMs = 10 * 60_000;
    this.fallbackToKraken = (process.env.PRISM_FALLBACK_TO_KRAKEN || "true").toLowerCase() !== "false";

    if (!this.apiKey) {
      throw new Error("[prism] PRISM_API_KEY is required when MARKET_DATA_MODE=prism");
    }

    console.log(`[prism] Live market feed enabled (${this.baseUrl})`);
    console.log(`[prism] Local cache enabled (default TTL ${Math.round(this.defaultCacheTtlMs / 1000)}s; budget ${this.requestBudgetPerMinute}/min)`);
    if (this.fallbackToKraken) {
      console.log("[prism] Fallback to Kraken public ticker is enabled");
    }
    console.log(`[prism] Local cooldown after rate limits: ${Math.round(this.rateLimitCooldownMs / 1000)}s`);
  }

  async getTicker(pair: string, options: PrismTickerOptions = {}): Promise<MarketData> {
    const symbol = pairToPrismSymbol(pair);
    const forceFresh = options.forceFresh === true;
    const requestOptions: PrismRequestOptions = forceFresh
      ? {
        cacheKey: `crypto/price:${symbol}`,
        forceFresh: true,
        cacheTtlMs: 0,
        params: {
          _: Date.now(),
        },
        headers: {
          "Cache-Control": "no-cache, no-store, max-age=0",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
      : {
        cacheKey: `crypto/price:${symbol}`,
      };

    try {
      const data = await this.queryPrismJson<PrismPriceResponse>(
        `/crypto/price/${encodeURIComponent(symbol)}`,
        requestOptions
      );

      return this.toMarketData(pair, symbol, data);
    } catch (error) {
      if (!this.fallbackToKraken) {
        throw error;
      }

      if (!this.warnedKrakenFallback) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[prism] API request failed; using Kraken public ticker fallback. Reason: ${message}`);
        this.warnedKrakenFallback = true;
      }

      return this.fetchKrakenPublicTicker(pair);
    }
  }

  async queryPrismJson<T>(path: string, options: PrismRequestOptions = {}): Promise<T> {
    const cacheKey = options.cacheKey || buildCacheKey(path, options.params);
    const ttlMs = options.cacheTtlMs ?? this.getCacheTtlMs(path);
    const useLocalCache = !options.forceFresh && ttlMs > 0;

    if (useLocalCache) {
      const cached = this.getCachedValue<T>(cacheKey);
      if (cached) {
        return cached.value;
      }

      const inFlight = this.inFlightRequests.get(cacheKey) as Promise<T> | undefined;
      if (inFlight) {
        return inFlight;
      }
    }

    const cooldown = this.getCooldownState();
    if (cooldown.active) {
      throw createPrismAttemptError(
        `[prism] temporarily paused until ${new Date(cooldown.disabledUntil).toISOString()}; ${cooldown.reason || "previous rate limit"}`,
        cooldown.disabledUntil
      );
    }

    const budgetRetryAt = this.reserveLocalBudget();
    if (budgetRetryAt) {
      this.setCooldown(budgetRetryAt, "local Prism request budget exhausted");
      throw createPrismAttemptError(
        `[prism] local request budget exhausted; retry after ${new Date(budgetRetryAt).toISOString()}`,
        budgetRetryAt
      );
    }

    const request = this.fetchPrismJson<T>(path, options, cacheKey, ttlMs).finally(() => {
      this.inFlightRequests.delete(cacheKey);
    });

    if (useLocalCache) {
      this.inFlightRequests.set(cacheKey, request as Promise<unknown>);
    }
    return request;
  }

  private async fetchKrakenPublicTicker(pair: string): Promise<MarketData> {
    const { data } = await axios.get("https://api.kraken.com/0/public/Ticker", {
      params: { pair },
      timeout: this.timeoutMs,
    });

    if (Array.isArray(data?.error) && data.error.length > 0) {
      throw new Error(`[prism] Kraken fallback ticker error: ${data.error.join(", ")}`);
    }

    const result = (data?.result ?? {}) as Record<string, KrakenTickerEntry>;
    const ticker = result[pair] ?? result[Object.keys(result)[0]];

    if (!ticker) {
      throw new Error(`[prism] Kraken fallback returned no ticker data for pair: ${pair}`);
    }

    const price = toFiniteNumber(ticker.c?.[0]);
    const bid = toFiniteNumber(ticker.b?.[0]);
    const ask = toFiniteNumber(ticker.a?.[0]);
    const volume = toFiniteNumber(ticker.v?.[1]);
    const vwap = toFiniteNumber(ticker.p?.[1], price);
    const high = toFiniteNumber(ticker.h?.[1], price);
    const low = toFiniteNumber(ticker.l?.[1], price);

    return {
      pair,
      price: round2(price),
      quotePriceUsd: price,
      bid: round2(bid),
      ask: round2(ask),
      volume: round2(volume),
      vwap: round2(vwap),
      high: round2(high),
      low: round2(low),
      timestamp: Date.now(),
    };
  }

  private async fetchPrismJson<T>(path: string, options: PrismRequestOptions, cacheKey: string, ttlMs: number): Promise<T> {
    const response = await axios.get<T>(`${this.baseUrl}${path}`, {
      headers: {
        "X-API-Key": this.apiKey,
        ...(options.forceFresh
          ? {
            "Cache-Control": "no-cache, no-store, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
          }
          : {}),
        ...(options.headers || {}),
      },
      params: options.params,
      timeout: this.timeoutMs,
      validateStatus: () => true,
    }) as unknown as PrismHttpResponse<T>;

    if (response.status >= 200 && response.status < 300) {
      if (ttlMs > 0 && !options.forceFresh) {
        this.setCachedValue(cacheKey, response.data, ttlMs);
      }
      return response.data;
    }

    const retryAt = this.extractRetryAt(response);
    if (retryAt) {
      this.setCooldown(retryAt, `Prism rate limit response for ${path}`);
    }

    throw createPrismAttemptError(this.describeHttpError(path, response), retryAt ?? undefined, response.status);
  }

  private toMarketData(pair: string, symbol: string, data: PrismPriceResponse): MarketData {
    const price = toFiniteNumber(data.price_usd);
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error(`[prism] Invalid price_usd for ${symbol}`);
    }

    const spreadBps = Math.max(0, this.syntheticSpreadBps);
    const halfSpread = (price * spreadBps) / 10_000 / 2;
    const bid = Math.max(0, price - halfSpread);
    const ask = price + halfSpread;
    const volume = toFiniteNumber(data.volume_24h, 0);
    const changePct = toFiniteNumber(data.change_24h_pct, 0);
    const swing = Math.abs(changePct) / 100 / 2;

    return {
      pair,
      price: round2(price),
      quotePriceUsd: price,
      bid: round2(bid),
      ask: round2(ask),
      volume: round2(volume),
      vwap: round2(price),
      high: round2(price * (1 + swing)),
      low: round2(Math.max(0, price * (1 - swing))),
      timestamp: Date.now(),
    };
  }

  private getCacheTtlMs(path: string): number {
    if (path.startsWith("/resolve/") || path.startsWith("/identity/") || path.startsWith("/families/")) {
      return this.resolveCacheTtlMs;
    }

    if (path.startsWith("/technicals/") || path.startsWith("/signals/") || path.startsWith("/risk/")) {
      return this.technicalCacheTtlMs;
    }

    if (path.startsWith("/orderbook/") || path.startsWith("/trades/")) {
      return this.microstructureCacheTtlMs;
    }

    if (path.startsWith("/historical/")) {
      return this.historicalCacheTtlMs;
    }

    return this.defaultCacheTtlMs;
  }

  private getCachedValue<T>(cacheKey: string): PrismCacheEntry<T> | null {
    const entry = this.requestCache.get(cacheKey) as PrismCacheEntry<T> | undefined;
    if (!entry) {
      return null;
    }

    if (entry.expiresAt <= Date.now()) {
      this.requestCache.delete(cacheKey);
      return null;
    }

    return entry;
  }

  private setCachedValue<T>(cacheKey: string, value: T, ttlMs: number): void {
    if (ttlMs <= 0) {
      this.requestCache.delete(cacheKey);
      return;
    }

    const now = Date.now();
    this.requestCache.set(cacheKey, {
      value,
      cachedAt: now,
      expiresAt: now + ttlMs,
    });
  }

  private reserveLocalBudget(): number | null {
    const now = Date.now();
    if (now - this.requestWindowStartedAt >= this.requestWindowMs) {
      this.requestWindowStartedAt = now;
      this.requestsInWindow = 0;
    }

    if (this.requestsInWindow >= this.requestBudgetPerMinute) {
      return this.requestWindowStartedAt + this.requestWindowMs;
    }

    this.requestsInWindow += 1;
    return null;
  }

  private getCooldownState(): PrismCooldownState {
    const now = Date.now();
    if (this.prismCooldownUntil <= now) {
      this.prismCooldownUntil = 0;
      this.prismCooldownReason = "";
      return {
        active: false,
        disabledUntil: 0,
        remainingMs: 0,
        reason: "",
      };
    }

    return {
      active: true,
      disabledUntil: this.prismCooldownUntil,
      remainingMs: this.prismCooldownUntil - now,
      reason: this.prismCooldownReason,
    };
  }

  private setCooldown(retryAt: number, reason: string): void {
    if (!Number.isFinite(retryAt) || retryAt <= 0) {
      return;
    }

    if (retryAt > this.prismCooldownUntil) {
      this.prismCooldownUntil = retryAt;
      this.prismCooldownReason = reason;
    }
  }

  private extractRetryAt(response: PrismHttpResponse<unknown>): number | null {
    const headers = isRecord(response.headers) ? response.headers : null;
    const payload = isRecord(response.data) ? response.data : null;
    const candidates: unknown[] = [
      headers?.["retry-after"],
      headers?.["Retry-After"],
      headers?.["x-ratelimit-reset"],
      headers?.["X-RateLimit-Reset"],
      payload?.retry_after,
      payload?.retryAfter,
      payload?.rateLimitReset,
      payload?.rate_limit_reset,
    ];

    for (const candidate of candidates) {
      const retryAt = parseRetryAt(candidate);
      if (retryAt) {
        return retryAt;
      }
    }

    const message = this.extractMessage(response).toLowerCase();
    if (message.includes("rate limit")) {
      return Date.now() + this.rateLimitCooldownMs;
    }

    if (response.status === 429) {
      return Date.now() + this.rateLimitCooldownMs;
    }

    return null;
  }

  private describeHttpError(path: string, response: PrismHttpResponse<unknown>): string {
    const retryAt = this.extractRetryAt(response);
    if (retryAt) {
      return `[prism] rate limit hit for ${path}; retry after ${new Date(retryAt).toISOString()}`;
    }

    const message = this.extractMessage(response);
    if (message) {
      return `[prism] request failed for ${path}: ${message}`;
    }

    return `[prism] request failed for ${path} with HTTP ${response.status}`;
  }

  private extractMessage(response: PrismHttpResponse<unknown>): string {
    if (!isRecord(response.data)) {
      return "";
    }

    const message = response.data.message ?? response.data.detail ?? response.data.error;
    if (typeof message === "string") {
      return message;
    }

    if (Array.isArray(message)) {
      return message
        .map((entry) => (typeof entry === "string" ? entry : ""))
        .filter(Boolean)
        .join(", ");
    }

    return "";
  }
}

function pairToPrismSymbol(pair: string): string {
  const normalized = pair.toUpperCase();
  const knownQuotes = ["USD", "USDT", "USDC", "EUR", "GBP", "JPY", "AUD", "CAD"];

  for (const quote of knownQuotes) {
    if (normalized.endsWith(quote) && normalized.length > quote.length) {
      const base = normalized.slice(0, normalized.length - quote.length);
      return normalizeBaseSymbol(base);
    }
  }

  return normalizeBaseSymbol(normalized);
}

function normalizeBaseSymbol(base: string): string {
  if (base === "XBT") return "BTC";
  return base;
}

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePositiveNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function buildCacheKey(path: string, params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) {
    return path;
  }

  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");

  return query ? `${path}?${query}` : path;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseRetryAt(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }

    return value >= 1e12 ? Math.round(value) : Date.now() + Math.round(value * 1000);
  }

  const text = String(value).trim();
  if (!text) {
    return null;
  }

  const parsedNumber = Number(text);
  if (Number.isFinite(parsedNumber) && parsedNumber > 0) {
    return parsedNumber >= 1e12 ? Math.round(parsedNumber) : Date.now() + Math.round(parsedNumber * 1000);
  }

  const parsedDate = Date.parse(text);
  return Number.isFinite(parsedDate) ? parsedDate : null;
}

function createPrismAttemptError(message: string, retryAt?: number, status?: number): PrismAttemptError {
  const error = new Error(message) as PrismAttemptError;
  if (retryAt) {
    error.retryAt = retryAt;
  }
  if (status) {
    error.status = status;
  }
  return error;
}

function toFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
