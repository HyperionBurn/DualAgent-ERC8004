import { TradeAction, TradeDecision } from "../types/index";

export const PLANNER_PROMPT_VERSION = "2026-04-06-schema-hardening";

export const PLANNER_REQUIRED_FIELDS = [
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
] as const;

export const PLANNER_TOOL_NAMES = [
  "market_snapshot",
  "risk_snapshot",
  "recent_memory",
  "paper_preview",
  "checkpoint_summary",
  "indicator_snapshot",
] as const;

export type PlannerToolName = typeof PLANNER_TOOL_NAMES[number];

export interface PlannerToolCall {
  name: PlannerToolName;
  arguments: Record<string, unknown>;
  purpose: string;
}

export interface PlannerResponse {
  version: 1;
  promptVersion: string;
  pair: string;
  asset: string;
  action: TradeAction;
  amountUsd: number;
  confidence: number;
  reasoning: string;
  riskNotes: string[];
  toolCalls: PlannerToolCall[];
  shouldExecute: boolean;
  maxSlippageBps: number;
  deadlineSeconds: number;
}

export interface PlannerValidationResult {
  ok: boolean;
  errors: string[];
  value?: PlannerResponse;
}

export interface PlannerContextPreview {
  marketSummary: string;
  indicatorSummary: string;
  riskSummary: string;
  memorySummary: string;
  executionSummary: string;
  checkpointSummary: string;
  adaptivePolicySummary?: string;
  availableTools: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (isPlainObject(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  const parseCandidate = (candidate: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(candidate);
      return isPlainObject(parsed) ? parsed : null;
    } catch {
      return null;
    }
  };

  const direct = parseCandidate(trimmed);
  if (direct) {
    return direct;
  }

  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    const extracted = trimmed.slice(first, last + 1);
    const extractedParsed = parseCandidate(extracted);
    if (extractedParsed) {
      return extractedParsed;
    }

    // Common model artifact: trailing commas before object/array close.
    const cleaned = extracted.replace(/,\s*([}\]])/g, "$1");
    const cleanedParsed = parseCandidate(cleaned);
    if (cleanedParsed) {
      return cleanedParsed;
    }
  }

  return null;
}

function findPlannerCandidate(value: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 4) {
    return null;
  }

  const objectValue = parseJsonObject(value);
  if (!objectValue) {
    return null;
  }

  const hasPlannerShape = PLANNER_REQUIRED_FIELDS.some((key) => Object.prototype.hasOwnProperty.call(objectValue, key));
  if (hasPlannerShape) {
    return objectValue;
  }

  const wrapperKeys = ["response", "final", "plan", "output", "result", "draft", "planner", "data", "message"];
  for (const key of wrapperKeys) {
    const nested = findPlannerCandidate(objectValue[key], depth + 1);
    if (nested) {
      return nested;
    }
  }

  for (const nestedValue of Object.values(objectValue)) {
    const nested = findPlannerCandidate(nestedValue, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const cleaned = value
      .trim()
      .replace(/[,$]/g, "")
      .replace(/%$/, "")
      .replace(/[a-zA-Z]+$/g, "");
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }

  return null;
}

function coerceTradeAction(value: unknown): TradeAction | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "BUY" || normalized === "SELL" || normalized === "HOLD") {
    return normalized;
  }

  if (normalized === "LONG" || normalized === "OPEN_LONG") {
    return "BUY";
  }

  if (normalized === "SHORT" || normalized === "OPEN_SHORT") {
    return "SELL";
  }

  return null;
}

function coerceNumberFromValues(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = coerceNumber(value);
    if (numeric !== null) {
      return numeric;
    }
  }

  return null;
}

function summarizeRecord(record: Record<string, unknown> | null, prefix: string): string[] {
  if (!record) {
    return [];
  }

  return Object.entries(record)
    .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .map(([key, value]) => `${prefix}.${key}=${value}`);
}

function looksLikeTradingPair(value: string): boolean {
  const normalized = value.trim().toUpperCase();
  return normalized.endsWith("USD") || normalized.endsWith("USDT") || normalized.includes("/");
}

function canonicalizePairSymbol(value: string): string {
  let normalized = value.trim().toUpperCase().replace(/[\/_-]/g, "");
  if (normalized.startsWith("BTC")) {
    normalized = `XBT${normalized.slice(3)}`;
  }
  return normalized;
}

export function isSparsePlannerResponse(input: unknown): boolean {
  const candidate = findPlannerCandidate(input);
  if (!candidate) {
    return false;
  }

  const keys = new Set(Object.keys(candidate));
  const missingRequiredCount = PLANNER_REQUIRED_FIELDS.filter((field) => !keys.has(field)).length;
  const hasLegacyOrderShape = (keys.has("amount") || keys.has("volume") || keys.has("order")) && !keys.has("amountUsd");
  const missingNarrative = !keys.has("reasoning") || !keys.has("riskNotes");
  const sparseShape = keys.size <= 6;

  return hasLegacyOrderShape || missingRequiredCount >= 5 || (sparseShape && missingNarrative);
}

function extractPairFromOrder(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const upper = value.toUpperCase();
  const match = upper.match(/\b([A-Z]{3,6}USDT?)\b/);
  if (!match || !match[1]) {
    return null;
  }

  return canonicalizePairSymbol(match[1]);
}

function normalizeToolCalls(value: unknown): PlannerToolCall[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const normalized: PlannerToolCall[] = [];

  for (const entry of value) {
    if (isPlainObject(entry)) {
      const name =
        typeof entry.name === "string"
          ? entry.name.trim()
          : typeof entry.tool === "string"
            ? entry.tool.trim()
            : typeof entry.type === "string"
              ? entry.type.trim()
              : "";
      const purpose =
        typeof entry.purpose === "string"
          ? entry.purpose.trim()
          : typeof entry.reason === "string"
            ? entry.reason.trim()
            : typeof entry.why === "string"
              ? entry.why.trim()
              : "";
      const argumentsObject =
        isPlainObject(entry.arguments)
          ? entry.arguments
          : isPlainObject(entry.args)
            ? entry.args
            : {};
      if (name && PLANNER_TOOL_NAMES.includes(name as PlannerToolName)) {
        normalized.push({
          name: name as PlannerToolName,
          arguments: argumentsObject,
          purpose: purpose || `planner request for ${name}`,
        });
        continue;
      }
    }

    if (typeof entry === "string") {
      const text = entry.trim();
      if (!text) {
        continue;
      }

      const lower = text.toLowerCase();
      const name =
        PLANNER_TOOL_NAMES.find((candidate) => lower.includes(candidate))
        || PLANNER_TOOL_NAMES.find((candidate) => lower.includes(candidate.replace(/_/g, " ")))
        || "market_snapshot";
      normalized.push({
        name,
        arguments: {},
        purpose: text,
      });
      continue;
    }
  }

  return normalized;
}

function normalizePlannerResponse(input: Record<string, unknown>, fallbackPair?: string): Record<string, unknown> | null {
  const versionValue = input.version;
  const version =
    versionValue === undefined ||
    versionValue === null ||
    versionValue === 1 ||
    versionValue === "1" ||
    versionValue === "1.0" ||
    versionValue === "1.0.0"
      ? 1
      : coerceNumber(versionValue) === 1
        ? 1
        : null;

  const promptVersion = typeof input.promptVersion === "string" && input.promptVersion.trim().length > 0
    ? input.promptVersion.trim()
    : PLANNER_PROMPT_VERSION;

  const execution = isPlainObject(input.execution) ? input.execution : null;
  const risk = isPlainObject(input.risk) ? input.risk : null;

  const pairSource = typeof input.pair === "string" && input.pair.trim().length > 0
    ? input.pair
    : typeof input.context === "string" && input.context.trim().length > 0
      ? input.context
    : typeof input.symbol === "string" && input.symbol.trim().length > 0
      ? input.symbol
      : typeof input.market === "string" && input.market.trim().length > 0
        ? input.market
      : typeof input.asset === "string" && input.asset.trim().length > 0 && looksLikeTradingPair(input.asset)
        ? input.asset
      : typeof execution?.pair === "string" && execution.pair.trim().length > 0
        ? execution.pair
      : typeof execution?.order === "string" && execution.order.trim().length > 0
        ? extractPairFromOrder(execution.order)
        : extractPairFromOrder(input.order)
        ? extractPairFromOrder(input.order)
      : fallbackPair && fallbackPair.trim().length > 0
        ? fallbackPair
      : null;
  const pair = pairSource ? canonicalizePairSymbol(pairSource) : null;
  const asset = typeof input.asset === "string" && input.asset.trim().length > 0
    ? looksLikeTradingPair(input.asset) ? canonicalizePairSymbol(input.asset).replace(/USDT?$/i, "") : input.asset.trim().toUpperCase()
    : pair
      ? pair.replace(/USD$/i, "")
      : null;
  const actionFromOrder =
    typeof input.order === "string" && input.order.trim().length > 0
      ? input.order.trim().split(/\s+/)[0]?.toUpperCase()
      : null;
  const action =
    coerceTradeAction(input.action)
    || coerceTradeAction(execution?.action)
    || (actionFromOrder && ["BUY", "SELL", "HOLD"].includes(actionFromOrder) ? actionFromOrder as TradeAction : null);
  const amountUsd = coerceNumberFromValues(
    input.amountUsd,
    input.amount,
    execution?.amountUsd,
    execution?.amount,
    execution?.notional,
    execution?.sizeUsd
  );
  const confidenceRaw = coerceNumber(input.confidence);
  const confidence = confidenceRaw === null
    ? 0.5
    : confidenceRaw > 1 && confidenceRaw <= 100
      ? confidenceRaw / 100
      : confidenceRaw;
  const summarizedKeys = Object.keys(input).slice(0, 6).join(", ");
  const legacyOrderText = typeof input.order === "string" ? input.order.trim() : "";
  const reasoningSource = typeof input.reasoning === "string" && input.reasoning.trim().length > 0
    ? input.reasoning
    : typeof input.reason === "string" && input.reason.trim().length > 0
      ? input.reason
      : typeof input.rationale === "string" && input.rationale.trim().length > 0
        ? input.rationale
      : typeof input.description === "string" && input.description.trim().length > 0
        ? input.description
      : typeof input.notes === "string" && input.notes.trim().length > 0
        ? input.notes
      : null;
  const reasoning = reasoningSource
    ? reasoningSource.trim()
    : action === "HOLD"
      ? legacyOrderText
        ? `Planner returned HOLD without rationale (legacy order field: ${legacyOrderText}).`
        : summarizedKeys.length > 0
          ? `Planner returned HOLD without rationale (payload keys: ${summarizedKeys}).`
          : "Planner returned HOLD without an explicit rationale."
      : action !== null
        ? `Planner returned a ${action} proposal without an explicit rationale.`
      : null;
  const riskNotes = Array.isArray(input.riskNotes)
    ? input.riskNotes.every((entry) => typeof entry === "string")
      ? input.riskNotes.map((entry) => entry.trim())
      : null
    : typeof input.riskNotes === "string" && input.riskNotes.trim().length > 0
      ? [input.riskNotes.trim()]
      : summarizeRecord(risk, "risk").length > 0
        ? summarizeRecord(risk, "risk")
      : reasoning
        ? [reasoning]
      : null;
  const toolCalls = normalizeToolCalls(input.toolCalls ?? input.tool_requests ?? input.toolRequests) ?? [];
  const shouldExecute = coerceBoolean(input.shouldExecute)
    ?? (action !== null && action !== "HOLD" && amountUsd !== null && amountUsd > 0);
  const maxSlippageBps = coerceNumberFromValues(input.maxSlippageBps, risk?.maxSlippageBps, risk?.maxSlippage, risk?.maxSlippagePoints) ?? 50;
  const deadlineSeconds = coerceNumberFromValues(input.deadlineSeconds, execution?.deadlineSeconds, input.deadline, input.ttlSeconds) ?? 300;

  if (
    version === null ||
    !pair ||
    !asset ||
    action === null ||
    amountUsd === null ||
    confidence === null ||
    !reasoning ||
    !riskNotes ||
    !toolCalls ||
    shouldExecute === null ||
    maxSlippageBps === null ||
    deadlineSeconds === null
  ) {
    return null;
  }

  return {
    version,
    promptVersion,
    pair,
    asset,
    action,
    amountUsd,
    confidence,
    reasoning,
    riskNotes,
    toolCalls,
    shouldExecute,
    maxSlippageBps,
    deadlineSeconds,
  };
}

function validateToolCall(value: unknown, index: number, errors: string[]): value is PlannerToolCall {
  if (!isPlainObject(value)) {
    errors.push(`toolCalls[${index}] must be an object`);
    return false;
  }

  const allowedKeys = ["name", "arguments", "purpose"];
  if (!hasOnlyKeys(value, allowedKeys)) {
    errors.push(`toolCalls[${index}] contains unsupported fields`);
    return false;
  }

  if (typeof value.name !== "string" || !PLANNER_TOOL_NAMES.includes(value.name as PlannerToolName)) {
    errors.push(`toolCalls[${index}].name must be one of ${PLANNER_TOOL_NAMES.join(", ")}`);
    return false;
  }

  if (!isPlainObject(value.arguments)) {
    errors.push(`toolCalls[${index}].arguments must be an object`);
    return false;
  }

  if (typeof value.purpose !== "string" || value.purpose.trim().length === 0) {
    errors.push(`toolCalls[${index}].purpose must be a non-empty string`);
    return false;
  }

  return true;
}

export function validatePlannerResponse(input: unknown, fallbackPair?: string): PlannerValidationResult {
  const errors: string[] = [];

  const candidate = findPlannerCandidate(input);
  if (!candidate) {
    return { ok: false, errors: ["planner response must contain a valid JSON object"] };
  }

  const normalized = normalizePlannerResponse(candidate, fallbackPair);
  if (!normalized) {
    return {
      ok: false,
      errors: ["planner response could not be normalized to the expected schema"],
    };
  }

  if (!hasOnlyKeys(normalized, [...PLANNER_REQUIRED_FIELDS])) {
    errors.push("planner response contains unsupported fields");
  }

  if (normalized.version !== 1) {
    errors.push("version must be 1");
  }

  if (typeof normalized.promptVersion !== "string" || normalized.promptVersion.trim().length === 0) {
    errors.push("promptVersion must be a non-empty string");
  }

  if (typeof normalized.pair !== "string" || normalized.pair.trim().length === 0) {
    errors.push("pair must be a non-empty string");
  }

  if (typeof normalized.asset !== "string" || normalized.asset.trim().length === 0) {
    errors.push("asset must be a non-empty string");
  }

  if (normalized.action !== "BUY" && normalized.action !== "SELL" && normalized.action !== "HOLD") {
    errors.push("action must be BUY, SELL, or HOLD");
  }

  if (typeof normalized.amountUsd !== "number" || !Number.isFinite(normalized.amountUsd) || normalized.amountUsd < 0) {
    errors.push("amountUsd must be a non-negative number");
  }

  if (typeof normalized.confidence !== "number" || !Number.isFinite(normalized.confidence) || normalized.confidence < 0 || normalized.confidence > 1) {
    errors.push("confidence must be a number between 0 and 1");
  }

  if (typeof normalized.reasoning !== "string" || normalized.reasoning.trim().length === 0) {
    errors.push("reasoning must be a non-empty string");
  }

  if (!isStringArray(normalized.riskNotes)) {
    errors.push("riskNotes must be an array of strings");
  }

  if (!Array.isArray(normalized.toolCalls)) {
    errors.push("toolCalls must be an array");
  } else {
    normalized.toolCalls.forEach((call, index) => validateToolCall(call, index, errors));
  }

  if (typeof normalized.shouldExecute !== "boolean") {
    errors.push("shouldExecute must be a boolean");
  }

  if (typeof normalized.maxSlippageBps !== "number" || !Number.isFinite(normalized.maxSlippageBps) || normalized.maxSlippageBps < 0) {
    errors.push("maxSlippageBps must be a non-negative number");
  }

  if (typeof normalized.deadlineSeconds !== "number" || !Number.isFinite(normalized.deadlineSeconds) || normalized.deadlineSeconds <= 0) {
    errors.push("deadlineSeconds must be a positive number");
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    errors: [],
    value: {
      version: 1,
      promptVersion: String(normalized.promptVersion),
      pair: String(normalized.pair),
      asset: String(normalized.asset),
      action: normalized.action as TradeAction,
      amountUsd: Number(normalized.amountUsd),
      confidence: Number(normalized.confidence),
      reasoning: String(normalized.reasoning),
      riskNotes: normalized.riskNotes as string[],
      toolCalls: normalized.toolCalls as PlannerToolCall[],
      shouldExecute: Boolean(normalized.shouldExecute),
      maxSlippageBps: Number(normalized.maxSlippageBps),
      deadlineSeconds: Number(normalized.deadlineSeconds),
    },
  };
}

export function plannerResponseToTradeDecision(response: PlannerResponse): TradeDecision {
  const amount = response.action === "HOLD" || !response.shouldExecute ? 0 : response.amountUsd;

  return {
    action: response.action,
    asset: response.asset,
    pair: response.pair,
    amount,
    confidence: response.confidence,
    reasoning: response.reasoning,
  };
}

export function buildPlannerSystemPrompt(): string {
  return [
    "You are a bounded trading planner for a paper-only agent.",
    "Return exactly one JSON object and no markdown, code fences, or extra commentary.",
    "Return the planner object directly. Do not wrap it in response, plan, draft, final, output, result, or message.",
    `Required top-level fields (exact): ${PLANNER_REQUIRED_FIELDS.join(", ")}.`,
    "Use only BUY, SELL, or HOLD as the action field. Do not emit PAPER_PREVIEW or any preview wrapper as the final action.",
    "Do not emit legacy execution-preview fields like amount, volume, or order as top-level output.",
    "Follow the schema exactly. Reject unsupported fields. Never output live-trading instructions.",
    "Optimize for positive expectancy and selective trade capture, not inactivity.",
    "Ground decisions in real technical signals including EMA trend, MACD momentum, RSI regime, Bollinger position, breakout context, spread, and VWAP premium.",
    "Only propose BUY/SELL when estimated edge comfortably exceeds spread and fee drag; otherwise return HOLD.",
    "Prefer BUY or SELL when trend, spread, VWAP, regime confidence, and recent checkpoint context align; use HOLD only when the edge is weak, warmup-bound, or conflicting.",
    "Raise confidence only when the signal is genuinely stronger. A disciplined HOLD is a valid outcome and can score well when risk is blocking execution.",
    "If the setup is good but borderline, use a modest paper trade rather than forcing full size, but never weaken the edge gate.",
    "deadlineSeconds must always be a positive number greater than 0.",
    `Allowed tool requests: ${PLANNER_TOOL_NAMES.join(", ")}.`,
    `promptVersion: ${PLANNER_PROMPT_VERSION}.`,
  ].join(" ");
}

export function buildPlannerContextPrompt(context: PlannerContextPreview): string {
  const lines = [
    "Planner context:",
    `- Market: ${context.marketSummary}`,
    `- Indicators: ${context.indicatorSummary}`,
    `- Risk: ${context.riskSummary}`,
    `- Memory: ${context.memorySummary}`,
    `- Execution: ${context.executionSummary}`,
    `- Checkpoints: ${context.checkpointSummary}`,
    context.adaptivePolicySummary ? `- Adaptive policy: ${context.adaptivePolicySummary}` : null,
    `- Available tools: ${context.availableTools.join(", ")}`,
    "paper_preview is a tool name only, not a planner action.",
    "Never return legacy flat payloads like {action, amount, volume, order}; those are invalid for final output.",
    "Always set deadlineSeconds to a positive number (for example 300 for HOLD).",
    "If the setup is favorable, risk limits are intact, and edge comfortably clears the threshold, prefer a modest paper trade rather than defaulting to HOLD.",
    "If expected edge is not meaningfully above spread and fees, return HOLD.",
    "Confidence should only rise when the signal, regime, and edge are all strengthening together.",
    "Return your final JSON object with the required schema fields.",
  ].filter((line): line is string => line !== null);

  return lines.join("\n");
}
