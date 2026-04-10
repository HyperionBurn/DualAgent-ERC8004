export type PlannerProvider = "groq" | "openrouter";

function normalize(value: string | undefined): string {
  return (value || "").trim().toLowerCase();
}

function hasValue(value: string | undefined): boolean {
  return Boolean((value || "").trim());
}

export function getExplicitPlannerProvider(): PlannerProvider | null {
  const provider = normalize(process.env.LLM_PROVIDER);
  if (provider === "groq" || provider === "openrouter") {
    return provider;
  }

  return null;
}

export function hasGroqApiKey(): boolean {
  return hasValue(process.env.GROQ_API_KEY);
}

export function hasOpenRouterApiKey(): boolean {
  return hasValue(process.env.OPENROUTER_API_KEY_A)
    || hasValue(process.env.OPENROUTER_API_KEY_B)
    || hasValue(process.env.OPENROUTER_API_KEY);
}

export function getConfiguredPlannerProvider(): PlannerProvider | null {
  const explicit = getExplicitPlannerProvider();
  if (explicit) {
    return explicit;
  }

  if (hasGroqApiKey()) {
    return "groq";
  }

  if (hasOpenRouterApiKey()) {
    return "openrouter";
  }

  return null;
}

export function resolvePlannerProvider(): PlannerProvider {
  return getConfiguredPlannerProvider() || "openrouter";
}

export function formatPlannerProvider(provider: PlannerProvider | null): string {
  if (provider === "groq") {
    return "Groq";
  }

  if (provider === "openrouter") {
    return "OpenRouter";
  }

  return "none";
}
