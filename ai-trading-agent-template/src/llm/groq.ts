import axios from "axios";
import type { OpenRouterCompletionRequest, OpenRouterCompletionResult, OpenRouterModelPool } from "./openrouter";

interface GroqChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string }>;
    };
  }>;
  error?: unknown;
}

interface GroqHttpResponse {
  status: number;
  data: GroqChatResponse;
  headers?: Record<string, unknown>;
}

interface GroqAttemptError extends Error {
  retryAt?: number;
}

export interface GroqCooldownState {
  active: boolean;
  disabledUntil: number;
  remainingMs: number;
  reason: string;
}

const DEFAULT_MODEL_POOL: OpenRouterModelPool = {
  primary: "openai/gpt-oss-20b",
  secondary: "llama-3.3-70b-versatile",
  fallback: "llama-3.1-8b-instant",
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

let groqCooldownUntil = 0;
let groqCooldownReason = "";

export function getGroqCooldownState(): GroqCooldownState {
  const now = Date.now();
  if (groqCooldownUntil <= now) {
    groqCooldownUntil = 0;
    groqCooldownReason = "";
    return {
      active: false,
      disabledUntil: 0,
      remainingMs: 0,
      reason: "",
    };
  }

  return {
    active: true,
    disabledUntil: groqCooldownUntil,
    remainingMs: groqCooldownUntil - now,
    reason: groqCooldownReason,
  };
}

function setGroqCooldown(retryAt: number, reason: string): void {
  if (!Number.isFinite(retryAt) || retryAt <= 0) {
    return;
  }

  if (retryAt > groqCooldownUntil) {
    groqCooldownUntil = retryAt;
    groqCooldownReason = reason;
  }
}

export function getGroqModelPool(overrides: Partial<OpenRouterModelPool> = {}): OpenRouterModelPool {
  return {
    primary: overrides.primary || process.env.GROQ_MODEL_PRIMARY || DEFAULT_MODEL_POOL.primary,
    secondary: overrides.secondary || process.env.GROQ_MODEL_SECONDARY || DEFAULT_MODEL_POOL.secondary,
    fallback: overrides.fallback || process.env.GROQ_MODEL_FALLBACK || DEFAULT_MODEL_POOL.fallback,
  };
}

function getGroqApiKey(): string {
  return (process.env.GROQ_API_KEY || "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function extractRateLimitRetryAt(response: GroqHttpResponse): number | null {
  const error = isRecord(response.data?.error) ? response.data.error : null;
  const metadata = error && isRecord(error.metadata) ? error.metadata : null;
  const headers = metadata && isRecord(metadata.headers) ? metadata.headers : null;
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";

  const candidates: unknown[] = [
    headers?.["retry-after"],
    headers?.["Retry-After"],
    response.headers?.["retry-after"],
    response.headers?.["Retry-After"],
    headers?.["x-ratelimit-reset"],
    headers?.["X-RateLimit-Reset"],
    response.headers?.["x-ratelimit-reset"],
    response.headers?.["X-RateLimit-Reset"],
  ];

  for (const candidate of candidates) {
    const retryAt = parseRetryAt(candidate);
    if (retryAt) {
      return retryAt;
    }
  }

  if (message.includes("rate limit")) {
    return Date.now() + 60 * 60 * 1000;
  }

  if (response.status === 429 || Number(error?.code) === 429) {
    return Date.now() + 60 * 60 * 1000;
  }

  return null;
}

function createAttemptError(message: string, retryAt?: number): GroqAttemptError {
  const error = new Error(message) as GroqAttemptError;
  if (retryAt) {
    error.retryAt = retryAt;
  }
  return error;
}

async function callGroqChat(
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

  let response: GroqHttpResponse | null = null;

  for (let index = 0; index < payloads.length; index += 1) {
    response = (await axios.post<GroqChatResponse>(
      "https://api.groq.com/openai/v1/chat/completions",
      payloads[index],
      {
        headers: {
          Authorization: `Bearer ${getGroqApiKey()}`,
          "Content-Type": "application/json",
        },
        timeout: 45_000,
        validateStatus: () => true,
      }
    )) as unknown as GroqHttpResponse;

    if (response.status >= 200 && response.status < 300) {
      break;
    }

    const rateLimitRetryAt = response.status === 429 ? extractRateLimitRetryAt(response) : null;
    const message = rateLimitRetryAt
      ? `[groq] rate limit hit for model ${model}; retry after ${new Date(rateLimitRetryAt).toISOString()}`
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
    throw createAttemptError(`[groq] request failed for model ${model}: ${message}`);
  }

  const choice = response.data?.choices?.[0];
  const text = typeof choice?.message?.content === "string"
    ? choice.message.content
    : Array.isArray(choice?.message?.content)
      ? choice.message.content.map((part: { text?: string }) => part.text || "").join("")
      : "";

  if (!text.trim()) {
    throw createAttemptError(`[groq] empty completion from model ${model}`);
  }

  return {
    text: extractJsonPayload(text),
    model,
    keyLabel: "groq",
    attempt,
  };
}

export async function requestGroqJson(options: OpenRouterCompletionRequest): Promise<OpenRouterCompletionResult> {
  const cooldown = getGroqCooldownState();
  if (cooldown.active) {
    throw new Error(
      `[groq] temporarily paused until ${new Date(cooldown.disabledUntil).toISOString()}; ${cooldown.reason || "previous rate limit"}`
    );
  }

  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error("No Groq API key configured. Set GROQ_API_KEY.");
  }

  const modelPool = getGroqModelPool(options.modelPool);
  const attempts = [modelPool.primary, modelPool.secondary, modelPool.fallback].filter((model, index, array) => array.indexOf(model) === index);
  const failures: string[] = [];
  let maxRetryAt = 0;
  let rateLimitReason = "";

  for (let index = 0; index < attempts.length; index += 1) {
    const model = attempts[index] || modelPool.fallback;

    try {
      return await callGroqChat(model, options.systemPrompt, options.userPrompt, options, index + 1);
    } catch (error) {
      const retryAt = error && typeof error === "object" && "retryAt" in error
        ? Number((error as GroqAttemptError).retryAt)
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
    setGroqCooldown(maxRetryAt, rateLimitReason || "Groq rate limit exceeded");
    throw new Error(rateLimitReason || `[groq] rate limit active until ${new Date(maxRetryAt).toISOString()}`);
  }

  throw new Error(`[groq] all attempts failed: ${failures.join(" | ")}`);
}
