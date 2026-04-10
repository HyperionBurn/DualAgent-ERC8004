import * as fs from "fs";
import * as path from "path";
import { resolveSubmissionPublicLinks } from "./public-links";

export interface SubmissionManifestLinks {
  githubRepository: string | null;
  demoUrl: string | null;
  videoUrl: string | null;
  slidesUrl: string | null;
}

export interface SubmissionManifestEvidence {
  sharedContracts: string | null;
  capitalProof: string | null;
  registrationProof: string | null;
  metrics: string | null;
  equityReport: string | null;
  reputationFeedback: string | null;
  phase2Evidence: string | null;
}

export interface SubmissionManifestProofSummary {
  selectedRunLabel: string | null;
  oneShotGatePass: boolean | null;
  validationSource: string | null;
  validationCoveragePct: number | null;
  reputationSource: string | null;
  reputationFeedbackCount: number | null;
}

export interface SubmissionManifestPayload {
  generatedAt: string;
  links: SubmissionManifestLinks;
  evidence: SubmissionManifestEvidence;
  proofSummary: SubmissionManifestProofSummary;
  readiness: {
    hasAllRequiredLinks: boolean;
    hasAllRequiredEvidence: boolean;
    missingFields: string[];
    missingEvidenceFiles: string[];
    strictMode: boolean;
  };
}

function value(env: NodeJS.ProcessEnv, name: string): string {
  return (env[name] || "").trim();
}

function requiredLink(valueOrEmpty: string): string | null {
  return valueOrEmpty.length > 0 ? valueOrEmpty : null;
}

function requiredLinkOrNull(valueOrEmpty: string | null | undefined): string | null {
  if (!valueOrEmpty) {
    return null;
  }
  return requiredLink(valueOrEmpty);
}

function relPathIfExists(cwd: string, fileName: string): string | null {
  return fs.existsSync(path.join(cwd, fileName)) ? fileName : null;
}

function readOptionalJson(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

export function buildSubmissionManifest(
  cwd: string,
  env: NodeJS.ProcessEnv,
  allowMissing: boolean
): SubmissionManifestPayload {
  const phase2Evidence = readOptionalJson(path.join(cwd, "phase2-evidence.json"));
  const winnerRun = readOptionalJson(path.join(cwd, "winner-run.json"));
  const publicLinks = resolveSubmissionPublicLinks(cwd, env);

  const links: SubmissionManifestLinks = {
    githubRepository: requiredLinkOrNull(publicLinks.githubRepository),
    demoUrl: requiredLinkOrNull(publicLinks.demoUrl),
    videoUrl: requiredLinkOrNull(publicLinks.videoUrl),
    slidesUrl: requiredLinkOrNull(publicLinks.slidesUrl),
  };

  const missingFields: string[] = [];
  if (!links.githubRepository) missingFields.push("SUBMISSION_GITHUB_URL");
  if (!links.demoUrl) missingFields.push("DEMO_URL");
  if (!links.videoUrl) missingFields.push("DEMO_VIDEO_URL");
  if (!links.slidesUrl) missingFields.push("DEMO_SLIDES_URL");

  const evidence: SubmissionManifestEvidence = {
    sharedContracts: relPathIfExists(cwd, "shared-contracts.json"),
    capitalProof: relPathIfExists(cwd, "capital-proof.json"),
    registrationProof: relPathIfExists(cwd, "registration-proof.json"),
    metrics: relPathIfExists(cwd, "metrics.json"),
    equityReport: relPathIfExists(cwd, "equity-report.json"),
    reputationFeedback: relPathIfExists(cwd, "reputation-feedback.jsonl"),
    phase2Evidence: relPathIfExists(cwd, "phase2-evidence.json"),
  };

  const runtimeEvidence = asRecord(phase2Evidence?.runtimeEvidence);
  const metricsSummary = asRecord(runtimeEvidence?.metricsSummary);
  const runContext = asRecord(phase2Evidence?.runContext);
  const winnerGate = asRecord(winnerRun?.gate);

  const proofSummary: SubmissionManifestProofSummary = {
    selectedRunLabel: asString(winnerRun?.runLabel) || asString(runContext?.runLabel),
    oneShotGatePass: asBoolean(winnerGate?.pass),
    validationSource: asString(metricsSummary?.validationSource),
    validationCoveragePct: asNumber(metricsSummary?.validationCoveragePct),
    reputationSource: asString(metricsSummary?.reputationSource),
    reputationFeedbackCount: asNumber(metricsSummary?.reputationFeedbackCount),
  };

  const missingEvidenceFiles = Object.entries(evidence)
    .filter(([, file]) => !file)
    .map(([name]) => name);

  return {
    generatedAt: new Date().toISOString(),
    links,
    evidence,
    proofSummary,
    readiness: {
      hasAllRequiredLinks: missingFields.length === 0,
      hasAllRequiredEvidence: missingEvidenceFiles.length === 0,
      missingFields,
      missingEvidenceFiles,
      strictMode: !allowMissing,
    },
  };
}

export function assertSubmissionManifestReady(manifest: SubmissionManifestPayload): void {
  const readiness = manifest.readiness;
  if (!readiness.strictMode) {
    return;
  }

  if (!readiness.hasAllRequiredLinks || !readiness.hasAllRequiredEvidence) {
    const reasons: string[] = [];
    if (readiness.missingFields.length > 0) {
      reasons.push(`missing links: ${readiness.missingFields.join(", ")}`);
    }
    if (readiness.missingEvidenceFiles.length > 0) {
      reasons.push(`missing evidence: ${readiness.missingEvidenceFiles.join(", ")}`);
    }
    throw new Error(`Submission manifest is incomplete (${reasons.join("; ")})`);
  }
}
