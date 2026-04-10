import axios from "axios";

interface OpenRouterChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  error?: unknown;
}

interface OpenRouterHttpResponse {
  status: number;
  data: OpenRouterChatResponse;
  headers?: Record<string, unknown>;
}

interface OpenRouterAttemptError extends Error {
  retryAt?: number;
}

export interface OpenRouterCredential {
  apiKey: string;
  label: "A" | "B";
}

export interface OpenRouterModelPool {
  primary: string;
  secondary: string;
  fallback: string;
}

export interface OpenRouterCompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  modelPool?: Partial<OpenRouterModelPool>;
  maxTokens?: number;
  temperature?: number;
  appTitle?: string;
  appUrl?: string;
  categories?: string[];
}

export interface OpenRouterCompletionResult {
  text: string;
  model: string;
  keyLabel: "A" | "B" | "fallback" | "groq";
  attempt: number;
}

export interface OpenRouterRequestState {
  attempts: number;
  modelPool: OpenRouterModelPool;
  credentials: OpenRouterCredential[];
}

export interface OpenRouterCooldownState {
  active: boolean;
  disabledUntil: number;
  remainingMs: number;
  reason: string;
}

const DEFAULT_MODEL_POOL: OpenRouterModelPool = {
  primary: "qwen/qwen3.6-plus:free",
  secondary: "stepfun/step-3.5-flash:free",
  fallback: "openrouter/free",
};

const STRUCTURED_FORMAT_UNSUPPORTED_RE = /response_format|json_object|json_schema|unsupported|strict/i;

const PLANNER_JSON_SCHEMA = {
  name: "planner_response",
  schema: {
    type: "object",
    additionalProperties: false,
    required: [
      "version",
      "promptVersion",
      "pair",
      "asset",
      "action",
      "amountUsd",
      "confidence",
      "reasoning",
      "riskNotes",
      "toolCalls",
      "shouldExecute",
      "maxSlippageBps",
      "deadlineSeconds",
    ],
    properties: {
      version: { type: "number", enum: [1] },
      promptVersion: { type: "string" },
      pair: { type: "string" },
      asset: { type: "string" },
      action: { type: "string", enum: ["BUY", "SELL", "HOLD"] },
      amountUsd: { type: "number" },
      confidence: { type: "number" },
      reasoning: { type: "string" },
      riskNotes: {
        type: "array",
        items: { type: "string" },
      },
      toolCalls: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "arguments", "purpose"],
          properties: {
            name: {
              type: "string",
              enum: ["market_snapshot", "risk_snapshot", "recent_memory", "paper_preview", "checkpoint_summary"],
            },
            arguments: {
              type: "object",
              additionalProperties: true,
            },
            purpose: { type: "string" },
          },
        },
      },
      shouldExecute: { type: "boolean" },
      maxSlippageBps: { type: "number" },
      deadlineSeconds: { type: "number", exclusiveMinimum: 0 },
    },
  },
  strict: true,
};

let requestCounter = 0;
let openRouterCooldownUntil = 0;
let openRouterCooldownReason = "";

export function getOpenRouterCooldownState(): OpenRouterCooldownState {
  const now = Date.now();
  if (openRouterCooldownUntil <= now) {
    openRouterCooldownUntil = 0;
    openRouterCooldownReason = "";
    return {
      active: false,
      disabledUntil: 0,
      remainingMs: 0,
      reason: "",
    };
  }

  return {
    active: true,
    disabledUntil: openRouterCooldownUntil,
    remainingMs: openRouterCooldownUntil - now,
    reason: openRouterCooldownReason,
  };
}

function setOpenRouterCooldown(retryAt: number, reason: string): void {
  if (!Number.isFinite(retryAt) || retryAt <= 0) {
    return;
  }

  if (retryAt > openRouterCooldownUntil) {
    openRouterCooldownUntil = retryAt;
    openRouterCooldownReason = reason;
  }
}

export function getOpenRouterModelPool(overrides: Partial<OpenRouterModelPool> = {}): OpenRouterModelPool {
  return {
    primary: overrides.primary || process.env.OPENROUTER_MODEL_PRIMARY || DEFAULT_MODEL_POOL.primary,
    secondary: overrides.secondary || process.env.OPENROUTER_MODEL_SECONDARY || DEFAULT_MODEL_POOL.secondary,
    fallback: overrides.fallback || process.env.OPENROUTER_MODEL_FALLBACK || DEFAULT_MODEL_POOL.fallback,
  };
}

export function getOpenRouterCredentials(): OpenRouterCredential[] {
  const credentials: OpenRouterCredential[] = [];
  const apiKeyA = (process.env.OPENROUTER_API_KEY_A || process.env.OPENROUTER_API_KEY || "").trim();
  const apiKeyB = (process.env.OPENROUTER_API_KEY_B || "").trim();

  if (apiKeyA) {
    credentials.push({ apiKey: apiKeyA, label: "A" });
  }
  if (apiKeyB && apiKeyB !== apiKeyA) {
    credentials.push({ apiKey: apiKeyB, label: "B" });
  }

  return credentials;
}

function nextCredential(credentials: OpenRouterCredential[]): OpenRouterCredential | null {
  if (credentials.length === 0) {
    return null;
  }

  const credential = credentials[requestCounter % credentials.length];
  requestCounter += 1;
  return credential;
}

function extractJsonPayload(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    return fenced[1].trim();
  }

  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return text.slice(first, last + 1).trim();
  }

  return text.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRetryAtMs(value: unknown): number | null {
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

function extractRateLimitRetryAt(response: OpenRouterHttpResponse): number | null {
  const error = isRecord(response.data?.error) ? response.data.error : null;
  const metadata = error && isRecord(error.metadata) ? error.metadata : null;
  const headers = metadata && isRecord(metadata.headers) ? metadata.headers : null;
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";

  const candidates: unknown[] = [
    headers?.["X-RateLimit-Reset"],
    headers?.["x-ratelimit-reset"],
    response.headers?.["x-ratelimit-reset"],
    headers?.["Retry-After"],
    headers?.["retry-after"],
    response.headers?.["retry-after"],
    error?.retry_after,
    error?.retryAfter,
  ];

  for (const candidate of candidates) {
    const retryAt = toRetryAtMs(candidate);
    if (retryAt) {
      return retryAt;
    }
  }

  if (message.includes("free-models-per-day")) {
    return Date.now() + 24 * 60 * 60 * 1000;
  }

  if (response.status === 429 || Number(error?.code) === 429) {
    return Date.now() + 60 * 60 * 1000;
  }

  return null;
}

function formatRateLimitMessage(model: string, keyLabel: OpenRouterCredential["label"], retryAt: number): string {
  return `[openrouter] rate limit hit for model ${model} with key ${keyLabel}; retry after ${new Date(retryAt).toISOString()}`;
}

function createAttemptError(message: string, retryAt?: number): OpenRouterAttemptError {
  const error = new Error(message) as OpenRouterAttemptError;
  if (retryAt) {
    error.retryAt = retryAt;
  }
  return error;
}

function buildHeaders(credential: OpenRouterCredential, options: OpenRouterCompletionRequest): Record<string, string> {
  return {
    Authorization: `Bearer ${credential.apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": options.appUrl || process.env.OPENROUTER_APP_URL || "http://localhost",
    "X-OpenRouter-Title": options.appTitle || process.env.OPENROUTER_APP_TITLE || "GLM Trading Agent",
    "X-OpenRouter-Categories": (options.categories || ["trading", "agentic", "paper-trading"]).join(","),
  };
}

async function callOpenRouterChat(
  credential: OpenRouterCredential,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  options: OpenRouterCompletionRequest,
  attempt: number
): Promise<OpenRouterCompletionResult> {
  const basePayload = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 900,
  };

  const payloads = [
    {
      ...basePayload,
      response_format: {
        type: "json_schema" as const,
        json_schema: PLANNER_JSON_SCHEMA,
      },
    },
    {
      ...basePayload,
      response_format: { type: "json_object" as const },
    },
    basePayload,
  ];

  let response: OpenRouterHttpResponse | null = null;

  for (let index = 0; index < payloads.length; index += 1) {
    response = (await axios.post<OpenRouterChatResponse>(
      "https://openrouter.ai/api/v1/chat/completions",
      payloads[index],
      {
        headers: buildHeaders(credential, options),
        timeout: 45_000,
        validateStatus: () => true,
      }
    )) as unknown as OpenRouterHttpResponse;

    if (response.status >= 200 && response.status < 300) {
      break;
    }

    const rateLimitRetryAt = response.status === 429 ? extractRateLimitRetryAt(response) : null;
    const message = rateLimitRetryAt
      ? formatRateLimitMessage(model, credential.label, rateLimitRetryAt)
      : response.data && typeof response.data === "object" && "error" in response.data
        ? JSON.stringify(response.data.error)
        : `HTTP ${response.status}`;

    const unsupportedStructuredMode =
      index < payloads.length - 1
      && response.status >= 400
      && STRUCTURED_FORMAT_UNSUPPORTED_RE.test(message);

    if (!unsupportedStructuredMode) {
      throw createAttemptError(message, rateLimitRetryAt ?? undefined);
    }
  }

  if (!response || response.status < 200 || response.status >= 300) {
    const message = response && response.data && typeof response.data === "object" && "error" in response.data
      ? JSON.stringify(response.data.error)
      : `HTTP ${response?.status ?? "unknown"}`;
    throw new Error(`[openrouter] request failed for model ${model} with key ${credential.label}: ${message}`);
  }

  const choice = response.data?.choices?.[0];
  const text = typeof choice?.message?.content === "string"
    ? choice.message.content
    : Array.isArray(choice?.message?.content)
      ? choice.message.content.map((part: { text?: string }) => part.text || "").join("")
      : "";

  if (!text.trim()) {
    throw new Error(`[openrouter] empty completion from model ${model} with key ${credential.label}`);
  }

  return {
    text: extractJsonPayload(text),
    model,
    keyLabel: credential.label,
    attempt,
  };
}

export async function requestOpenRouterJson(options: OpenRouterCompletionRequest): Promise<OpenRouterCompletionResult> {
  const cooldown = getOpenRouterCooldownState();
  if (cooldown.active) {
    throw new Error(
      `[openrouter] temporarily paused until ${new Date(cooldown.disabledUntil).toISOString()}; ${cooldown.reason || "previous rate limit"}`
    );
  }

  const credentials = getOpenRouterCredentials();
  if (credentials.length === 0) {
    throw new Error("No OpenRouter API keys configured. Set OPENROUTER_API_KEY_A and/or OPENROUTER_API_KEY_B.");
  }

  const modelPool = getOpenRouterModelPool(options.modelPool);
  const attempts = [modelPool.primary, modelPool.secondary, modelPool.fallback].filter((model, index, array) => array.indexOf(model) === index);
  const failures: string[] = [];
  let maxRetryAt = 0;
  let rateLimitReason = "";

  for (let index = 0; index < attempts.length; index += 1) {
    const credential = nextCredential(credentials);
    if (!credential) {
      break;
    }

    const model = attempts[index] || modelPool.fallback;

    try {
      return await callOpenRouterChat(credential, model, options.systemPrompt, options.userPrompt, options, index + 1);
    } catch (error) {
      const retryAt = error && typeof error === "object" && "retryAt" in error
        ? Number((error as OpenRouterAttemptError).retryAt)
        : null;
      const message = error instanceof Error ? error.message : String(error);

      if (retryAt && Number.isFinite(retryAt) && retryAt > maxRetryAt) {
        maxRetryAt = retryAt;
        rateLimitReason = message;
      }

      failures.push(message);
    }
  }

  if (maxRetryAt > Date.now()) {
    setOpenRouterCooldown(maxRetryAt, rateLimitReason || "OpenRouter rate limit exceeded");
    throw new Error(rateLimitReason || `[openrouter] rate limit active until ${new Date(maxRetryAt).toISOString()}`);
  }

  throw new Error(`[openrouter] all attempts failed: ${failures.join(" | ")}`);
}
