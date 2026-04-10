import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";
import { countJsonLines, readJson, readJsonLines, buildArtifactIdentityReport, ArtifactIdentityReport } from "../src/submission/artifacts";
import { resolveSubmissionPublicLinks } from "../src/submission/public-links";
import { buildRouterEnforcementEvidence, buildSharedContractSnapshot, RouterEnforcementEvidence, SharedContractSnapshot } from "../src/submission/shared";
import { evaluatePhase2Readiness } from "../src/submission/phase2";
import { isReputationLoopEnabled, isSubmissionStrict } from "../src/runtime/profile";
import type { SubmissionManifestPayload } from "../src/submission/manifest";

interface RegistrationProof {
  chainId?: number;
  registryAddress?: string;
  operatorWallet?: string;
  agentSigner?: string;
  agentWallet?: string;
  agentId?: string;
  registrationTxHash?: string;
  signatureProof?: { valid?: boolean; nonce?: string; contentHash?: string };
}

interface CapitalProof {
  chainId?: number;
  vaultAddress?: string;
  claimer?: string;
  agentId?: string;
  claimTxHash?: string;
  allocatedAfterEth?: number;
}

interface ScoreStorySummary {
  agentId?: string;
  netPnlUsd?: number;
  averageValidationScore?: number;
  validationSource?: string;
  validationCoveragePct?: number;
  averageReputationScore?: number;
  reputationSource?: string;
  reputationFeedbackCount?: number;
  compositeScore?: number;
  maxDrawdownBps?: number;
}

interface ScoreStoryPayload {
  summary?: ScoreStorySummary;
}

interface EquityReportPayload {
  generatedAt?: string;
  agentId?: string;
  drawdownEvidence?: {
    asOfIso?: string;
    maxDrawdownBps?: number;
    currentDrawdownBps?: number;
    currentEquityUsd?: number;
    peakEquityUsd?: number;
  };
  guardrails?: {
    active?: boolean;
  };
}

function requiredAsset(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim().length > 0);
}

function defaultArtifactIdentityReport(reason: string): ArtifactIdentityReport {
  return {
    expectedAgentId: "",
    checkpoints: { file: "", found: false, count: 0, agentIds: [], missingAgentIdRows: 0 },
    fills: { file: "", found: false, count: 0, agentIds: [], missingAgentIdRows: 0 },
    traces: { file: "", found: false, count: 0, agentIds: [], missingAgentIdRows: 0 },
    reputation: { file: "", found: false, count: 0, agentIds: [], missingAgentIdRows: 0 },
    pass: false,
    failReasons: [reason],
  };
}

function defaultRouterEvidence(reason: string): RouterEnforcementEvidence {
  return {
    agentId: "",
    agentWallet: "",
    pair: process.env.TRADING_PAIR || "XBTUSD",
    guardrails: null,
    tradeRecord: null,
    currentNonce: null,
    domainSeparator: null,
    smallTrade: null,
    oversizedTrade: null,
    queryError: reason,
  };
}

function isArtifactStale(isoTimestamp: string | undefined, maxAgeMinutes: number): boolean {
  if (!isoTimestamp) return true;
  const parsed = Date.parse(isoTimestamp);
  if (!Number.isFinite(parsed)) return true;
  return (Date.now() - parsed) > (maxAgeMinutes * 60_000);
}

function envBoolean(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] || "").trim().toLowerCase();
  if (!raw) return fallback;
  if (raw === "1" || raw === "true" || raw === "yes" || raw === "on") return true;
  if (raw === "0" || raw === "false" || raw === "no" || raw === "off") return false;
  return fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = (process.env[name] || "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const cwd = process.cwd();
  const expectedChainId = 11155111;
  const maxArtifactAgeMinutes = Number(process.env.PHASE2_MAX_ARTIFACT_AGE_MINUTES || "1440");
  const configuredChainId = process.env.CHAIN_ID || String(expectedChainId);
  const enforceOneShotGates = envBoolean("PHASE2_ENFORCE_ONE_SHOT_GATES", true);
  const oneShotThresholds = {
    enforceOneShot: enforceOneShotGates,
    minCheckpointCount: envNumber("PHASE2_MIN_CHECKPOINTS", 30),
    maxCheckpointCount: envNumber("PHASE2_MAX_CHECKPOINTS", 60),
    minFillCount: envNumber("PHASE2_MIN_FILLS", 5),
    maxFillCount: envNumber("PHASE2_MAX_FILLS", 15),
    minNetPnlUsd: envNumber("PHASE2_MIN_NET_PNL_USD", 0.01),
    maxDrawdownBps: envNumber("PHASE2_MAX_DRAWDOWN_BPS", 500),
    minValidationCoveragePct: envNumber("PHASE2_MIN_VALIDATION_COVERAGE_PCT", 70),
    minValidationScore: envNumber("PHASE2_MIN_VALIDATION_SCORE", 82),
    minReputationScore: envNumber("PHASE2_MIN_REPUTATION_SCORE", 90),
    requireValidationRegistry: envBoolean("PHASE2_REQUIRE_VALIDATION_REGISTRY", true),
    minReputationFeedbackCount: envNumber("PHASE2_MIN_REPUTATION_FEEDBACK_COUNT", 6),
    minReputationDistinctRaterCount: envNumber("PHASE2_MIN_REPUTATION_DISTINCT_RATERS", 3),
    requireReputationRegistry: envBoolean("PHASE2_REQUIRE_REPUTATION_REGISTRY", true),
  };
  const submissionStrict = isSubmissionStrict(process.env);
  const reputationLoopEnabled = isReputationLoopEnabled(process.env);
  const runContext = {
    runLabel: (process.env.RUN_LABEL || process.env.MATRIX_RUN_LABEL || "").trim() || null,
    parameters: {
      maxTradeUsd: envNumber("PLANNER_MAX_TRADE_USD", 100),
      maxTradesPerHour: envNumber("PLANNER_MAX_TRADES_PER_HOUR", 6),
      maxSlippageBps: envNumber("PLANNER_MAX_SLIPPAGE_BPS", 50),
      minConfidence: envNumber("PLANNER_MIN_CONFIDENCE", 0.6),
    },
  };

  const sharedContractsPath = path.join(cwd, "shared-contracts.json");
  const capitalProofPath = path.join(cwd, "capital-proof.json");
  const registrationPath = path.join(cwd, "registration-proof.json");
  const submissionManifestPath = path.join(cwd, "submission-manifest.json");
  const metricsPath = path.join(cwd, process.env.METRICS_OUTPUT_FILE || "metrics.json");
  const checkpointsPath = path.join(cwd, process.env.CHECKPOINT_FILE || "checkpoints.jsonl");
  const fillsPath = path.join(cwd, process.env.FILLS_FILE || "fills.jsonl");
  const tracesPath = path.join(cwd, process.env.PLANNER_TRACES_FILE || "planner-traces.jsonl");
  const reputationEvidencePath = path.join(cwd, process.env.REPUTATION_FEEDBACK_FILE || "reputation-feedback.jsonl");
  const equityReportPath = path.join(cwd, process.env.EQUITY_REPORT_FILE || "equity-report.json");
  const publicLinks = resolveSubmissionPublicLinks(cwd, process.env);

  const registration = readJson<RegistrationProof>(registrationPath);
  const capitalProof = readJson<CapitalProof>(capitalProofPath);
  const submissionManifest = readJson<SubmissionManifestPayload>(submissionManifestPath);
  const metrics = readJson<ScoreStoryPayload>(metricsPath);
  const equityReport = readJson<EquityReportPayload>(equityReportPath);

  const checkpointCount = countJsonLines(checkpointsPath);
  const fillCount = countJsonLines(fillsPath);
  const traceCount = countJsonLines(tracesPath);
  const reputationFeedbackCount = countJsonLines(reputationEvidencePath);
  const reputationFeedbackRows = readJsonLines<Record<string, unknown>>(reputationEvidencePath);
  const distinctReputationRaters = Array.from(
    new Set(
      reputationFeedbackRows
        .map((row) => (typeof row.rater === "string" ? row.rater.trim().toLowerCase() : ""))
        .filter((value) => value.length > 0)
    )
  );
  const reputationDistinctRaterCount = distinctReputationRaters.length;
  const checkpoints = readJsonLines<Record<string, unknown>>(checkpointsPath);
  const checkpointsWithHash = checkpoints.filter(
    (checkpoint) => typeof checkpoint.checkpointHash === "string" && checkpoint.checkpointHash.length > 0
  ).length;

  const rpcUrl = process.env.SEPOLIA_RPC_URL || "";
  const pair = process.env.TRADING_PAIR || "XBTUSD";
  const agentIdRaw = registration?.agentId || process.env.AGENT_ID || null;
  const agentWallet = registration?.agentWallet || process.env.AGENT_WALLET_ADDRESS || null;
  const provider = rpcUrl
    ? new ethers.JsonRpcProvider(rpcUrl, Number(configuredChainId), { staticNetwork: true })
    : null;

  let sharedContracts = readJson<SharedContractSnapshot>(sharedContractsPath);
  if (provider) {
    sharedContracts = await buildSharedContractSnapshot(provider, {
      agentRegistry: process.env.AGENT_REGISTRY_ADDRESS || null,
      hackathonVault: process.env.HACKATHON_VAULT_ADDRESS || null,
      riskRouter: process.env.RISK_ROUTER_ADDRESS || null,
      reputationRegistry: process.env.REPUTATION_REGISTRY_ADDRESS || null,
      validationRegistry: process.env.VALIDATION_REGISTRY_ADDRESS || null,
    }, expectedChainId);
    fs.writeFileSync(sharedContractsPath, JSON.stringify(sharedContracts, null, 2));
  }

  const artifactIdentity = agentIdRaw
    ? buildArtifactIdentityReport({
      expectedAgentId: agentIdRaw,
      checkpointsFile: checkpointsPath,
      fillsFile: fillsPath,
      tracesFile: tracesPath,
      reputationEvidenceFile: reputationEvidencePath,
    })
    : defaultArtifactIdentityReport("AGENT_ID is missing");

  const routerEvidence = provider && agentIdRaw && agentWallet && process.env.RISK_ROUTER_ADDRESS
    ? await buildRouterEnforcementEvidence({
      provider,
      routerAddress: process.env.RISK_ROUTER_ADDRESS,
      agentId: BigInt(agentIdRaw),
      agentWallet,
      pair,
    })
    : defaultRouterEvidence("Missing RPC URL, AGENT_ID, agentWallet, or RISK_ROUTER_ADDRESS");

  const drawdownEvidence = {
    file: equityReportPath,
    found: Boolean(equityReport?.drawdownEvidence),
    stale: isArtifactStale(equityReport?.generatedAt || equityReport?.drawdownEvidence?.asOfIso, maxArtifactAgeMinutes),
    report: equityReport?.drawdownEvidence || null,
  };

  const githubUrl = publicLinks.githubRepository || submissionManifest?.links.githubRepository || null;
  const demoUrl = publicLinks.demoUrl || submissionManifest?.links.demoUrl || null;
  const videoUrl = publicLinks.videoUrl || submissionManifest?.links.videoUrl || null;
  const slidesUrl = publicLinks.slidesUrl || submissionManifest?.links.slidesUrl || null;

  const metricSummary = metrics?.summary || null;
  const evidenceDepth = {
    enabled: enforceOneShotGates,
    minCheckpointCount: oneShotThresholds.minCheckpointCount,
    maxCheckpointCount: oneShotThresholds.maxCheckpointCount,
    checkpointCount,
    checkpointRangePass: checkpointCount >= oneShotThresholds.minCheckpointCount && checkpointCount <= oneShotThresholds.maxCheckpointCount,
    minFillCount: oneShotThresholds.minFillCount,
    maxFillCount: oneShotThresholds.maxFillCount,
    fillCount,
    fillRangePass: fillCount >= oneShotThresholds.minFillCount && fillCount <= oneShotThresholds.maxFillCount,
  };
  const netPnlUsd = typeof metricSummary?.netPnlUsd === "number" ? metricSummary.netPnlUsd : null;
  const maxDrawdownObservedBps = typeof metricSummary?.maxDrawdownBps === "number"
    ? metricSummary.maxDrawdownBps
    : (typeof equityReport?.drawdownEvidence?.maxDrawdownBps === "number" ? equityReport.drawdownEvidence.maxDrawdownBps : null);
  const runQuality = {
    enabled: enforceOneShotGates,
    minNetPnlUsd: oneShotThresholds.minNetPnlUsd,
    maxDrawdownBps: oneShotThresholds.maxDrawdownBps,
    netPnlUsd,
    maxDrawdownObservedBps,
    pnlPass: netPnlUsd !== null && netPnlUsd > oneShotThresholds.minNetPnlUsd,
    drawdownPass: maxDrawdownObservedBps !== null && maxDrawdownObservedBps <= oneShotThresholds.maxDrawdownBps,
  };

  const evaluation = evaluatePhase2Readiness({
    expectedChainId,
    sharedContracts: {
      found: Boolean(sharedContracts),
      chainId: sharedContracts?.chainId ?? null,
      isSepolia: Boolean(sharedContracts?.isSepolia),
      allContractsPresent: Boolean(sharedContracts?.allContractsPresent),
    },
    capitalProof: {
      found: Boolean(capitalProof),
      chainId: capitalProof?.chainId ?? null,
      txHash: capitalProof?.claimTxHash || null,
      allocatedAfterEth: capitalProof?.allocatedAfterEth ?? null,
    },
    registration: {
      found: Boolean(registration),
      chainId: registration?.chainId ?? null,
      agentId: registration?.agentId || null,
      agentWallet: registration?.agentWallet || null,
      registrationTxHash: registration?.registrationTxHash || null,
      signatureProofValid: Boolean(registration?.signatureProof?.valid),
    },
    submissionManifest: {
      found: Boolean(submissionManifest),
      hasAllRequiredLinks: Boolean(submissionManifest?.readiness.hasAllRequiredLinks),
      hasAllRequiredEvidence: Boolean(submissionManifest?.readiness.hasAllRequiredEvidence),
      missingFields: submissionManifest?.readiness.missingFields || [],
      missingEvidenceFiles: submissionManifest?.readiness.missingEvidenceFiles || [],
    },
    artifactIdentity: {
      pass: artifactIdentity.pass,
      failReasons: artifactIdentity.failReasons,
    },
    runtimeEvidence: {
      checkpointCount,
      checkpointsWithHash,
      fillCount,
      reputationFeedbackCount,
      reputationDistinctRaterCount,
      metricsFound: Boolean(metrics?.summary),
      metricsSummary: metricSummary,
    },
    routerEnforcement: {
      queryError: routerEvidence.queryError,
      currentNonce: routerEvidence.currentNonce,
      tradeRecord: routerEvidence.tradeRecord,
      domainSeparator: routerEvidence.domainSeparator,
      smallTrade: routerEvidence.smallTrade ? {
        approved: routerEvidence.smallTrade.approved,
        reason: routerEvidence.smallTrade.reason,
      } : null,
      oversizedTrade: routerEvidence.oversizedTrade ? {
        approved: routerEvidence.oversizedTrade.approved,
        reason: routerEvidence.oversizedTrade.reason,
      } : null,
      guardrails: routerEvidence.guardrails ? { active: routerEvidence.guardrails.active } : null,
    },
    drawdownEvidence: {
      found: drawdownEvidence.found,
      stale: drawdownEvidence.stale,
      maxDrawdownBps: equityReport?.drawdownEvidence?.maxDrawdownBps ?? null,
      currentDrawdownBps: equityReport?.drawdownEvidence?.currentDrawdownBps ?? null,
      currentEquityUsd: equityReport?.drawdownEvidence?.currentEquityUsd ?? null,
    },
    thresholds: oneShotThresholds,
  });

  const evidence = {
    generatedAt: new Date().toISOString(),
    phase: "phase-2-free-faucet-public-testnet-proof",
    environment: {
      expectedChainId,
      configuredChainId,
      executionMode: process.env.EXECUTION_MODE || "mock",
      marketDataMode: process.env.MARKET_DATA_MODE || process.env.EXECUTION_MODE || "mock",
      plannerProvider: process.env.LLM_PROVIDER || null,
      rpcConfigured: Boolean(rpcUrl),
      reputationLoopEnabled,
      submissionStrict,
      maxArtifactAgeMinutes,
      oneShotThresholds,
    },
    runContext,
    sharedContracts: {
      file: sharedContractsPath,
      found: Boolean(sharedContracts),
      snapshot: sharedContracts || null,
    },
    capitalProof: {
      file: capitalProofPath,
      found: Boolean(capitalProof),
      proof: capitalProof || null,
    },
    registration: {
      file: registrationPath,
      found: Boolean(registration),
      proof: registration || null,
    },
    submissionManifest: {
      file: submissionManifestPath,
      found: Boolean(submissionManifest),
      readiness: submissionManifest?.readiness || null,
    },
    demoAssets: {
      githubUrl,
      demoUrl,
      videoUrl,
      slidesUrl,
    },
    artifactIdentity,
    runtimeEvidence: {
      checkpointsFile: checkpointsPath,
      checkpointCount,
      checkpointsWithHash,
      fillsFile: fillsPath,
      fillCount,
      tracesFile: tracesPath,
      traceCount,
      reputationFeedbackFile: reputationEvidencePath,
      reputationFeedbackCount,
      reputationDistinctRaterCount,
      distinctReputationRaters,
      metricsFile: metricsPath,
      metricsFound: Boolean(metrics?.summary),
      metricsSummary: metricSummary,
    },
    routerEnforcement: routerEvidence,
    drawdownEvidence,
    evidenceDepth: {
      ...evidenceDepth,
      pass: !evidenceDepth.enabled || (evidenceDepth.checkpointRangePass && evidenceDepth.fillRangePass),
      reasons: evidenceDepth.enabled
        ? [
          ...(evidenceDepth.checkpointRangePass ? [] : [`checkpointCount must be within ${oneShotThresholds.minCheckpointCount}-${oneShotThresholds.maxCheckpointCount}`]),
          ...(evidenceDepth.fillRangePass ? [] : [`fillCount must be within ${oneShotThresholds.minFillCount}-${oneShotThresholds.maxFillCount}`]),
        ]
        : [],
    },
    runQuality: {
      ...runQuality,
      pass: !runQuality.enabled || (runQuality.pnlPass && runQuality.drawdownPass),
      reasons: runQuality.enabled
        ? [
          ...(runQuality.pnlPass ? [] : [`netPnlUsd must be greater than ${oneShotThresholds.minNetPnlUsd}`]),
          ...(runQuality.drawdownPass ? [] : [`maxDrawdownBps must be <= ${oneShotThresholds.maxDrawdownBps}`]),
        ]
        : [],
    },
    checks: evaluation.checks,
    failReasons: evaluation.failReasons,
    readyForSubmission: evaluation.readyForSubmission,
  };

  const outPath = path.join(cwd, "phase2-evidence.json");
  fs.writeFileSync(outPath, JSON.stringify(evidence, null, 2));

  console.log("\nPhase 2 Evidence Summary");
  console.log("========================");
  console.log(`Shared Sepolia contracts: ${evaluation.checks.strictSepoliaProofIntegrity.pass}`);
  console.log(`Capital proof ready:      ${evaluation.checks.capitalClaimProof.pass}`);
  console.log(`Registration proof:       ${evaluation.checks.registrationProofCompleteness.pass}`);
  console.log(`Artifact identity:        ${evaluation.checks.artifactIdentityIntegrity.pass}`);
  console.log(`Manifest ready:           ${evaluation.checks.submissionAssetManifesting.pass}`);
  console.log(`Validation evidence:      ${evaluation.checks.validationEvidenceCoverage.pass}`);
  console.log(`Composite score output:   ${evaluation.checks.compositeScoreOutput.pass}`);
  console.log(`Objective reputation:     ${evaluation.checks.reputationEvidence.pass}`);
  console.log(`Evidence depth:           ${evaluation.checks.evidenceDepth.pass}`);
  console.log(`Run quality:              ${evaluation.checks.runQuality.pass}`);
  console.log(`Router enforcement:       ${evaluation.checks.routerEnforcement.pass}`);
  console.log(`Drawdown evidence:        ${evaluation.checks.drawdownEvidence.pass}`);
  console.log(`Checkpoint count:         ${checkpointCount}`);
  console.log(`Fill count:               ${fillCount}`);
  if (runContext.runLabel) {
    console.log(`Run label:                ${runContext.runLabel}`);
  }
  console.log(`\nFail reasons: ${evaluation.failReasons.length}`);
  for (const reason of evaluation.failReasons) {
    console.log(`- ${reason}`);
  }
  console.log(`\nWrote: ${outPath}\n`);
}

main().catch((error) => {
  console.error("[phase2-evidence] Failed:", error);
  process.exit(1);
});
