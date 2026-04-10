export function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  const normalized = (value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") return true;
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") return false;
  return fallback;
}

export function isSubmissionStrict(env: NodeJS.ProcessEnv = process.env): boolean {
  return parseBooleanEnv(env.SUBMISSION_STRICT, false);
}

export function isReputationLoopEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return isSubmissionStrict(env) || parseBooleanEnv(env.ENABLE_REPUTATION_LOOP, false);
}