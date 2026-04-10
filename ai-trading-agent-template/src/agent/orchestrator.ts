import { PlannerTurnInput, PlannerTurnResult, runPlannerTurn } from "./planner";
import { TradeDecision } from "../types/index";
import { plannerResponseToTradeDecision } from "../llm/schemas";

export async function runAgentPlanner(input: PlannerTurnInput): Promise<PlannerTurnResult> {
  console.log("[orchestrator] Spinning up Ensemble Agent Consensus (Agent 1 & subAgent)...");
  
  // Run both agents in parallel
  const [primaryResult, secondaryResult] = await Promise.all([
    runPlannerTurn(input),
    runPlannerTurn(input) // groq 2nd llm
  ]);

  if (primaryResult.decision.action === "HOLD" && secondaryResult.decision.action === "HOLD") {
    return primaryResult;
  }

  const primaryAction = primaryResult.decision.action;
  const secondaryAction = secondaryResult.decision.action;

  console.log(`[orchestrator] primary: ${primaryAction}, subAgent: ${secondaryAction}`);

  // Consensus required!
  if (primaryAction !== "HOLD" && primaryAction === secondaryAction) {
    console.log(`[orchestrator] 🤝 CONSENSUS REACHED: Both agents agree on ${primaryAction}`);
    // Return primary as the decision maker, but with averaged confidence
    primaryResult.decision.confidence = (primaryResult.decision.confidence + secondaryResult.decision.confidence) / 2;
    primaryResult.toolResults += "\n[Ensemble Feedback]: SubAgent reached consensus on this directional trade.";
    return primaryResult;
  }

  // Conflict or one says HOLD
  console.log(`[orchestrator] ⚠️ CONSENSUS FAILED: primary wants ${primaryAction}, subAgent wants ${secondaryAction}. Defaulting to HOLD safety.`);
  
  const holdDecision: TradeDecision = {
    action: "HOLD",
    asset: input.pair.replace(/USD$/i, ""),
    pair: input.pair,
    amount: 0,
    confidence: Math.max(primaryResult.decision.confidence, secondaryResult.decision.confidence),
    reasoning: `Ensemble consensus failed. Primary: ${primaryAction}, SubAgent: ${secondaryAction}. Reverted to HOLD for safety.`,
  };

  return {
    ...primaryResult,
    decision: holdDecision,
    model: `ensemble-${primaryResult.model}`,
    keyLabel: "ensemble",
    usedFallback: true,
    toolResults: `Ensemble disagreed. Primary: ${primaryResult.decision.reasoning} | SubAgent: ${secondaryResult.decision.reasoning}`,
  };
}
