import * as path from "path";
import { MarketData, TradeDecision } from "../types/index";
import {
  buildPlannerContextPrompt,
  buildPlannerSystemPrompt,
  isSparsePlannerResponse,
  plannerResponseToTradeDecision,
  PLANNER_PROMPT_VERSION,
  PLANNER_REQUIRED_FIELDS,
  PlannerResponse,
  validatePlannerResponse,
} from "../llm/schemas";
import { PlannerToolContext, renderToolResults } from "../tools/index";
import { buildMarketSnapshot, renderMarketSnapshot } from "../tools/market";
import { buildRiskSnapshot, renderRiskSnapshot } from "../tools/risk";
import { buildRecentMemorySnapshot, renderRecentMemorySnapshot } from "../tools/memory";
import { buildPaperExecutionPreview, renderPaperExecutionPreview } from "../tools/execution";
import { buildCheckpointSnapshot, renderCheckpointSnapshot } from "../tools/checkpoints";
import { buildIndicatorSnapshot, deriveIndicatorAction, renderIndicatorSnapshot } from "../tools/indicators";
import { formatPlannerProvider, resolvePlannerProvider, type PlannerProvider } from "../llm/provider";
import { getGroqCooldownState, requestGroqJson } from "../llm/groq";
import { getOpenRouterCooldownState, requestOpenRouterJson, type OpenRouterCompletionRequest, type OpenRouterCompletionResult } from "../llm/openrouter";

export interface PlannerTurnInput {
  market: MarketData;
  pair: string;
  executionMode: string;
  marketMode: string;
  sandbox: boolean;
  reputationLoop: boolean;
  maxTradesPerHour?: number;
  checkpointsFile?: string;
  fillsFile?: string;
  recentLimit?: number;
  maxTradeUsd?: number;
  maxSlippageBps?: number;
}

export interface PlannerTurnResult {
  decision: TradeDecision;
  plannerResponse: PlannerResponse;
  rawResponse: string;
  model: string;
  keyLabel: string;
  usedFallback: boolean;
  toolResults: string;
}

function getPlannerProvider(): PlannerProvider {
  return resolvePlannerProvider();
}

function getPlannerProviderCooldown(provider: PlannerProvider) {
  return provider === "groq" ? getGroqCooldownState() : getOpenRouterCooldownState();
}

async function requestPlannerJson(provider: PlannerProvider, options: OpenRouterCompletionRequest): Promise<OpenRouterCompletionResult> {
  return provider === "groq" ? requestGroqJson(options) : requestOpenRouterJson(options);
}

function buildContext(input: PlannerTurnInput) {
  const checkpointsFile = input.checkpointsFile || path.join(process.cwd(), "checkpoints.jsonl");
  const fillsFile = input.fillsFile || path.join(process.cwd(), "fills.jsonl");
  const recentLimit = input.recentLimit ?? 6;
  const indicatorLookbackRaw = Number(process.env.PLANNER_INDICATOR_LOOKBACK || "80");
  const indicatorLookback = Number.isFinite(indicatorLookbackRaw) && indicatorLookbackRaw >= 10
    ? Math.floor(indicatorLookbackRaw)
    : 80;

  const marketSnapshot = buildMarketSnapshot(input.market);
  const memorySnapshot = buildRecentMemorySnapshot({ checkpointsFile, fillsFile, limit: recentLimit });
  const indicatorSnapshot = buildIndicatorSnapshot({
    market: input.market,
    checkpointsFile,
    lookback: indicatorLookback,
  });
  const riskSnapshot = buildRiskSnapshot({
    executionMode: input.executionMode,
    marketMode: input.marketMode,
    sandbox: input.sandbox,
    reputationLoop: input.reputationLoop,
    maxTradesPerHour: input.maxTradesPerHour,
    maxTradeUsd: input.maxTradeUsd,
    maxSlippageBps: input.maxSlippageBps,
    recentFills: memorySnapshot.recentFills,
  });
  const executionPreview = buildPaperExecutionPreview({
    action: "HOLD",
    asset: input.pair.replace(/USD$/i, ""),
    pair: input.pair,
    amount: 0,
    confidence: 0,
    reasoning: "planner preview",
  }, input.market, input.executionMode);
  const checkpointSnapshot = buildCheckpointSnapshot(checkpointsFile, recentLimit);
  const adaptivePolicySummary = (process.env.ADAPTIVE_POLICY_SUMMARY || "").trim();

  return {
    marketSnapshot,
    indicatorSnapshot,
    riskSnapshot,
    memorySnapshot,
    executionPreview,
    checkpointSnapshot,
    adaptivePolicySummary: adaptivePolicySummary.length > 0 ? adaptivePolicySummary : undefined,
    checkpointsFile,
    fillsFile,
    recentLimit,
  };
}

function buildToolContext(input: PlannerTurnInput, currentDecision: TradeDecision): PlannerToolContext {
  return {
    market: input.market,
    executionMode: input.executionMode,
    marketMode: input.marketMode,
    sandbox: input.sandbox,
    reputationLoop: input.reputationLoop,
    maxTradesPerHour: input.maxTradesPerHour,
    checkpointsFile: input.checkpointsFile,
    fillsFile: input.fillsFile,
    recentLimit: input.recentLimit,
    currentDecision,
  };
}

function buildUserPrompt(input: PlannerTurnInput, context: ReturnType<typeof buildContext>, extraToolResults?: string): string {
  const previewDecision: TradeDecision = {
    action: "HOLD",
    asset: input.pair.replace(/USD$/i, ""),
    pair: input.pair,
    amount: 0,
    confidence: 0,
    reasoning: "planner preview",
  };

  const plannerContext = buildPlannerContextPrompt({
    marketSummary: renderMarketSnapshot(context.marketSnapshot),
    indicatorSummary: renderIndicatorSnapshot(context.indicatorSnapshot),
    riskSummary: renderRiskSnapshot(context.riskSnapshot),
    memorySummary: renderRecentMemorySnapshot(context.memorySnapshot),
    executionSummary: renderPaperExecutionPreview(buildPaperExecutionPreview(previewDecision, input.market, input.executionMode)),
    checkpointSummary: renderCheckpointSnapshot(context.checkpointSnapshot),
    adaptivePolicySummary: context.adaptivePolicySummary,
    availableTools: ["market_snapshot", "risk_snapshot", "recent_memory", "paper_preview", "checkpoint_summary", "indicator_snapshot"],
  });

  const base = [
    plannerContext,
    extraToolResults ? `Tool results:\n${extraToolResults}` : "Tool results: none",
    `Current market pair: ${input.pair}`,
    `Planner prompt version: ${PLANNER_PROMPT_VERSION}`,
    `Required JSON keys: ${PLANNER_REQUIRED_FIELDS.join(", ")}`,
    "Do not emit legacy top-level keys like amount, volume, or order.",
    "deadlineSeconds must be a positive number greater than 0.",
    "Return the final JSON object now.",
  ].join("\n\n");

  return base;
}

function buildPlannerRequest(systemPrompt: string, userPrompt: string): OpenRouterCompletionRequest {
  return {
    systemPrompt,
    userPrompt,
    maxTokens: 900,
    temperature: 0,
    appTitle: "GLM Trading Agent",
    appUrl: process.env.OPENROUTER_APP_URL,
    categories: ["trading", "agentic", "paper-trading"],
  };
}

function buildSparseRepairPrompt(
  input: PlannerTurnInput,
  context: ReturnType<typeof buildContext>,
  stage: "draft" | "final",
  previousJson: string
): string {
  return [
    buildUserPrompt(input, context),
    `Your previous ${stage} planner response omitted required schema fields.`,
    `Previous JSON:\n${previousJson}`,
    `Rewrite it with exactly these top-level fields: ${PLANNER_REQUIRED_FIELDS.join(", ")}.`,
    "Do not emit legacy fields like amount, volume, or order.",
    "If action is HOLD, keep amountUsd=0 and shouldExecute=false and include specific reasoning tied to market/risk context.",
    "If action is BUY or SELL, include positive amountUsd and confidence in the [0,1] range.",
    "Set deadlineSeconds to a positive number greater than 0.",
    "Return only one JSON object.",
  ].join("\n\n");
}

async function repairSparsePlannerResponse(
  provider: PlannerProvider,
  input: PlannerTurnInput,
  context: ReturnType<typeof buildContext>,
  systemPrompt: string,
  completion: OpenRouterCompletionResult,
  stage: "draft" | "final"
): Promise<OpenRouterCompletionResult> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(completion.text);
  } catch {
    return completion;
  }

  if (!isSparsePlannerResponse(parsed)) {
    return completion;
  }

  const repaired = await requestPlannerJson(
    provider,
    buildPlannerRequest(systemPrompt, buildSparseRepairPrompt(input, context, stage, completion.text))
  );
  debugPlannerPayload(`${stage}-repair`, repaired.text);
  return repaired;
}

function critiquePlannerResponse(
  response: PlannerResponse,
  input: PlannerTurnInput,
  context: ReturnType<typeof buildContext>
): string[] {
  const issues: string[] = [];
  const baseMinTradeConfidence = Number(process.env.PLANNER_MIN_CONFIDENCE || "0.58");
  const baseMinExpectedEdgeBps = Number(process.env.PLANNER_MIN_EXPECTED_EDGE_BPS || "12");
  const breakerActive = (process.env.PLANNER_RUNTIME_BREAKER_ACTIVE || "false").toLowerCase() === "true";
  const volatilityThrottlePct = Number(process.env.BREAKER_VOLATILITY_THROTTLE_PCT || "2.8");
  const volatilityElevated = (context.indicatorSnapshot.realizedVolPct ?? 0) >= volatilityThrottlePct;
  const minTradeConfidence = clamp(
    baseMinTradeConfidence
      + (breakerActive ? 0.08 : 0)
      + (volatilityElevated ? 0.05 : 0),
    0.35,
    0.95
  );
  const minExpectedEdgeBps = baseMinExpectedEdgeBps
    + (breakerActive ? 6 : 0)
    + (volatilityElevated ? 4 : 0);

  const canonicalizePair = (pair: string): string => {
    let normalized = pair.trim().toUpperCase().replace(/[\/_-]/g, "");
    if (normalized.startsWith("BTC")) {
      normalized = `XBT${normalized.slice(3)}`;
    }
    return normalized;
  };

  if (canonicalizePair(response.pair) !== canonicalizePair(input.pair)) {
    issues.push("pair mismatch");
  }
  if (response.action === "HOLD" && response.amountUsd > 0) {
    issues.push("hold response must not allocate capital");
  }
  if (response.action !== "HOLD" && response.amountUsd <= 0) {
    issues.push("action requires a positive amountUsd");
  }
  if (response.action !== "HOLD" && (!Number.isFinite(response.confidence) || response.confidence < minTradeConfidence)) {
    issues.push("confidence is too low for a trade proposal");
  }
  if (response.action !== "HOLD" && Number.isFinite(input.maxTradeUsd) && input.maxTradeUsd !== undefined && response.amountUsd > input.maxTradeUsd) {
    issues.push("trade proposal exceeds maxTradeUsd guardrail");
  }
  if (response.maxSlippageBps < 0 || response.maxSlippageBps > (input.maxSlippageBps ?? 200)) {
    issues.push("maxSlippageBps is outside the allowed guardrail");
  }

  if (response.action !== "HOLD") {
    const spreadBps = input.market.price > 0
      ? ((input.market.ask - input.market.bid) / input.market.price) * 10_000
      : 0;
    const vwapBiasBps = input.market.vwap > 0
      ? Math.abs((input.market.price - input.market.vwap) / input.market.vwap) * 10_000
      : 0;
    const confidenceEdgeBps = Math.max(0, (response.confidence - 0.5) * 250);
    const estimatedEdgeBps = confidenceEdgeBps + vwapBiasBps - spreadBps;
    const modelNetEdgeBps = context.indicatorSnapshot.netEdgeBps;
    const deterministicAction = deriveIndicatorAction(context.indicatorSnapshot, minExpectedEdgeBps);
    const dualGateEnabled = (process.env.DUAL_GATE_ENABLED || "true").toLowerCase() !== "false";

    if (modelNetEdgeBps < minExpectedEdgeBps) {
      issues.push(
        `indicator net edge ${modelNetEdgeBps.toFixed(2)}bps below threshold ${minExpectedEdgeBps.toFixed(2)}bps`
      );
    }

    if (estimatedEdgeBps < minExpectedEdgeBps) {
      issues.push(
        `estimated edge ${estimatedEdgeBps.toFixed(2)}bps below threshold ${minExpectedEdgeBps.toFixed(2)}bps`
      );
    }

    if (dualGateEnabled && deterministicAction !== "HOLD" && deterministicAction !== response.action) {
      issues.push(`dual-gate mismatch planner=${response.action} deterministic=${deterministicAction}`);
    }
  }

  return issues;
}

function fallbackHoldDecision(input: PlannerTurnInput, reason: string): PlannerTurnResult {
  const response: PlannerResponse = {
    version: 1,
    promptVersion: PLANNER_PROMPT_VERSION,
    pair: input.pair,
    asset: input.pair.replace(/USD$/i, ""),
    action: "HOLD",
    amountUsd: 0,
    confidence: 0.5,
    reasoning: reason,
    riskNotes: [reason],
    toolCalls: [],
    shouldExecute: false,
    maxSlippageBps: input.maxSlippageBps ?? 50,
    deadlineSeconds: 300,
  };

  return {
    decision: plannerResponseToTradeDecision(response),
    plannerResponse: response,
    rawResponse: JSON.stringify(response),
    model: "fallback/hold",
    keyLabel: "fallback",
    usedFallback: true,
    toolResults: reason,
  };
}

function debugPlannerPayload(label: string, text: string): void {
  if ((process.env.DEBUG_PLANNER || "").toLowerCase() === "true") {
    console.log(`[planner-debug] ${label}: ${text}`);
  }
}

export async function runPlannerTurn(input: PlannerTurnInput): Promise<PlannerTurnResult> {
  const provider = getPlannerProvider();
  const providerCooldown = getPlannerProviderCooldown(provider);
  if (providerCooldown.active) {
    return fallbackHoldDecision(
      input,
      `${formatPlannerProvider(provider)} temporarily paused until ${new Date(providerCooldown.disabledUntil).toISOString()}; using HOLD fallback.`
    );
  }

  const context = buildContext(input);
  const systemPrompt = buildPlannerSystemPrompt();

  try {
    let draftResponse = await requestPlannerJson(provider, buildPlannerRequest(systemPrompt, buildUserPrompt(input, context)));

    debugPlannerPayload("draft", draftResponse.text);

    draftResponse = await repairSparsePlannerResponse(provider, input, context, systemPrompt, draftResponse, "draft");

    const draftParsed = JSON.parse(draftResponse.text);
    const draftValidation = validatePlannerResponse(draftParsed, input.pair);
    if (!draftValidation.ok || !draftValidation.value) {
      return fallbackHoldDecision(input, `draft planner response failed validation: ${draftValidation.errors.join("; ")}`);
    }

    const draftPlannerResponse = draftValidation.value;
    const draftDecision = plannerResponseToTradeDecision(draftPlannerResponse);
    const draftIssues = critiquePlannerResponse(draftPlannerResponse, input, context);
    if (draftIssues.length > 0) {
      return fallbackHoldDecision(input, `planner critique blocked execution: ${draftIssues.join("; ")}`);
    }

    if (draftPlannerResponse.toolCalls.length === 0) {
      return {
        decision: draftDecision,
        plannerResponse: draftPlannerResponse,
        rawResponse: draftResponse.text,
        model: draftResponse.model,
        keyLabel: draftResponse.keyLabel,
        usedFallback: false,
        toolResults: "No additional tools were requested.",
      };
    }

    const toolContext = buildToolContext(input, draftDecision);
    const toolResults = renderToolResults(draftPlannerResponse.toolCalls, toolContext);

    let finalResponse = await requestPlannerJson(provider, buildPlannerRequest(systemPrompt, buildUserPrompt(input, context, toolResults)));

    debugPlannerPayload("final", finalResponse.text);

    finalResponse = await repairSparsePlannerResponse(provider, input, context, systemPrompt, finalResponse, "final");

    const finalParsed = JSON.parse(finalResponse.text);
    const finalValidation = validatePlannerResponse(finalParsed, input.pair);
    if (!finalValidation.ok || !finalValidation.value) {
      return fallbackHoldDecision(input, `final planner response failed validation: ${finalValidation.errors.join("; ")}`);
    }

    const issues = critiquePlannerResponse(finalValidation.value, input, context);
    if (issues.length > 0) {
      return fallbackHoldDecision(input, `planner critique blocked execution: ${issues.join("; ")}`);
    }

    const response = finalValidation.value;
    const decision = plannerResponseToTradeDecision(response);

    return {
      decision,
      plannerResponse: response,
      rawResponse: finalResponse.text,
      model: finalResponse.model,
      keyLabel: finalResponse.keyLabel,
      usedFallback: false,
      toolResults,
    };
  } catch (error) {
    const cooldown = getPlannerProviderCooldown(provider);
    if (cooldown.active) {
      return fallbackHoldDecision(
        input,
        `${formatPlannerProvider(provider)} temporarily paused until ${new Date(cooldown.disabledUntil).toISOString()}; using HOLD fallback.`
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("[openrouter]")) {
      return fallbackHoldDecision(input, "OpenRouter unavailable; using HOLD fallback.");
    }
    if (message.startsWith("[groq]")) {
      return fallbackHoldDecision(input, "Groq unavailable; using HOLD fallback.");
    }

    return fallbackHoldDecision(input, message);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
