export interface Phase2CheckResult {
  pass: boolean;
  reason: string;
}

export interface Phase2MetricsSummary {
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

export interface Phase2OneShotThresholds {
  enforceOneShot?: boolean;
  minCheckpointCount?: number;
  maxCheckpointCount?: number;
  minFillCount?: number;
  maxFillCount?: number;
  minNetPnlUsd?: number;
  maxDrawdownBps?: number;
  minValidationCoveragePct?: number;
  minValidationScore?: number;
  minReputationScore?: number;
  requireValidationRegistry?: boolean;
  minReputationFeedbackCount?: number;
  minReputationDistinctRaterCount?: number;
  requireReputationRegistry?: boolean;
}

export interface Phase2ReadinessInputs {
  expectedChainId: number;
  sharedContracts: {
    found: boolean;
    chainId: number | null;
    isSepolia: boolean;
    allContractsPresent: boolean;
  };
  capitalProof: {
    found: boolean;
    chainId: number | null;
    txHash: string | null;
    allocatedAfterEth: number | null;
  };
  registration: {
    found: boolean;
    chainId: number | null;
    agentId: string | null;
    agentWallet: string | null;
    registrationTxHash: string | null;
    signatureProofValid: boolean;
  };
  submissionManifest: {
    found: boolean;
    hasAllRequiredLinks: boolean;
    hasAllRequiredEvidence: boolean;
    missingFields: string[];
    missingEvidenceFiles: string[];
  };
  artifactIdentity: {
    pass: boolean;
    failReasons: string[];
  };
  runtimeEvidence: {
    checkpointCount: number;
    checkpointsWithHash: number;
    fillCount: number;
    reputationFeedbackCount: number;
    reputationDistinctRaterCount?: number;
    metricsFound: boolean;
    metricsSummary: Phase2MetricsSummary | null;
  };
  routerEnforcement: {
    queryError: string | null;
    currentNonce: string | null;
    tradeRecord: { count: string; windowStart: string } | null;
    domainSeparator: string | null;
    smallTrade: { approved: boolean; reason: string } | null;
    oversizedTrade: { approved: boolean; reason: string } | null;
    guardrails: { active: boolean } | null;
  };
  drawdownEvidence: {
    found: boolean;
    stale: boolean;
    maxDrawdownBps: number | null;
    currentDrawdownBps: number | null;
    currentEquityUsd: number | null;
  };
  thresholds?: Phase2OneShotThresholds;
}

export interface Phase2EvaluationResult {
  checks: Record<string, Phase2CheckResult>;
  failReasons: string[];
  readyForSubmission: {
    hasSharedSepoliaContracts: boolean;
    hasCapitalProof: boolean;
    hasRegistrationProof: boolean;
    hasArtifactIdentityIntegrity: boolean;
    hasSubmissionAssets: boolean;
    hasValidationEvidence: boolean;
    hasCompositeScoreOutput: boolean;
    hasObjectiveReputation: boolean;
    hasRouterEnforcement: boolean;
    hasDrawdownEvidence: boolean;
    hasEvidenceDepth: boolean;
    hasRunQuality: boolean;
    allChecksPassed: boolean;
  };
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function numberOrFallback(value: number | undefined, fallback: number): number {
  return isFiniteNumber(value) ? (value as number) : fallback;
}

function formatRange(minValue: number, maxValue: number): string {
  if (!Number.isFinite(maxValue)) {
    return `>=${minValue}`;
  }
  return `${minValue}-${maxValue}`;
}

export function evaluatePhase2Readiness(inputs: Phase2ReadinessInputs): Phase2EvaluationResult {
  const metrics = inputs.runtimeEvidence.metricsSummary;
  const enforceOneShot = Boolean(inputs.thresholds?.enforceOneShot);
  const minCheckpointCount = numberOrFallback(inputs.thresholds?.minCheckpointCount, enforceOneShot ? 30 : 1);
  const maxCheckpointCount = numberOrFallback(inputs.thresholds?.maxCheckpointCount, enforceOneShot ? 60 : Number.POSITIVE_INFINITY);
  const minFillCount = numberOrFallback(inputs.thresholds?.minFillCount, enforceOneShot ? 5 : 1);
  const maxFillCount = numberOrFallback(inputs.thresholds?.maxFillCount, enforceOneShot ? 15 : Number.POSITIVE_INFINITY);
  const minNetPnlUsd = numberOrFallback(inputs.thresholds?.minNetPnlUsd, enforceOneShot ? 0.01 : Number.NEGATIVE_INFINITY);
  const maxDrawdownBps = numberOrFallback(inputs.thresholds?.maxDrawdownBps, enforceOneShot ? 500 : Number.POSITIVE_INFINITY);
  const minValidationCoveragePct = numberOrFallback(inputs.thresholds?.minValidationCoveragePct, enforceOneShot ? 70 : 1);
  const minValidationScore = numberOrFallback(inputs.thresholds?.minValidationScore, enforceOneShot ? 82 : 1);
  const minReputationScore = numberOrFallback(inputs.thresholds?.minReputationScore, enforceOneShot ? 90 : 1);
  const requireValidationRegistry = inputs.thresholds?.requireValidationRegistry ?? true;
  const minReputationFeedbackCount = numberOrFallback(inputs.thresholds?.minReputationFeedbackCount, enforceOneShot ? 6 : 1);
  const minReputationDistinctRaterCount = numberOrFallback(inputs.thresholds?.minReputationDistinctRaterCount, enforceOneShot ? 3 : 0);
  const requireReputationRegistry = inputs.thresholds?.requireReputationRegistry ?? enforceOneShot;

  const checkpointRangePass = inputs.runtimeEvidence.checkpointCount >= minCheckpointCount
    && inputs.runtimeEvidence.checkpointCount <= maxCheckpointCount;
  const fillRangePass = inputs.runtimeEvidence.fillCount >= minFillCount
    && inputs.runtimeEvidence.fillCount <= maxFillCount;
  const evidenceDepthPass = enforceOneShot ? (checkpointRangePass && fillRangePass) : true;

  const netPnlUsd = isFiniteNumber(metrics?.netPnlUsd) ? (metrics?.netPnlUsd as number) : null;
  const observedDrawdownBps = isFiniteNumber(metrics?.maxDrawdownBps)
    ? (metrics?.maxDrawdownBps as number)
    : (isFiniteNumber(inputs.drawdownEvidence.maxDrawdownBps) ? (inputs.drawdownEvidence.maxDrawdownBps as number) : null);
  const netPnlPass = netPnlUsd !== null && netPnlUsd > minNetPnlUsd;
  const drawdownPass = observedDrawdownBps !== null && observedDrawdownBps <= maxDrawdownBps;
  const runQualityPass = enforceOneShot ? (netPnlPass && drawdownPass) : true;

  const validationCoveragePct = isFiniteNumber(metrics?.validationCoveragePct)
    ? (metrics?.validationCoveragePct as number)
    : null;
  const validationScore = isFiniteNumber(metrics?.averageValidationScore)
    ? (metrics?.averageValidationScore as number)
    : null;
  const validationSourcePass = requireValidationRegistry
    ? metrics?.validationSource === "validation-registry"
    : Boolean(metrics?.validationSource);
  const validationQualityPass = validationScore !== null && validationScore >= minValidationScore;

  const reputationScore = isFiniteNumber(metrics?.averageReputationScore)
    ? (metrics?.averageReputationScore as number)
    : null;
  const reputationQualityPass = reputationScore !== null && reputationScore >= minReputationScore;

  const sharedContractsPass = Boolean(
    inputs.sharedContracts.found
    && inputs.sharedContracts.chainId === inputs.expectedChainId
    && inputs.sharedContracts.isSepolia
    && inputs.sharedContracts.allContractsPresent
  );

  const capitalProofPass = Boolean(
    inputs.capitalProof.found
    && inputs.capitalProof.chainId === inputs.expectedChainId
    && inputs.capitalProof.txHash
    && isFiniteNumber(inputs.capitalProof.allocatedAfterEth)
    && (inputs.capitalProof.allocatedAfterEth as number) > 0
  );

  const registrationProofPass = Boolean(
    inputs.registration.found
    && inputs.registration.chainId === inputs.expectedChainId
    && inputs.registration.agentId
    && inputs.registration.agentWallet
    && inputs.registration.registrationTxHash
    && inputs.registration.signatureProofValid
  );

  const artifactIdentityPass = inputs.artifactIdentity.pass;

  const submissionManifestPass = Boolean(
    inputs.submissionManifest.found
    && inputs.submissionManifest.hasAllRequiredLinks
    && inputs.submissionManifest.hasAllRequiredEvidence
  );

  const validationEvidencePass = Boolean(
    inputs.runtimeEvidence.checkpointCount > 0
    && inputs.runtimeEvidence.checkpointsWithHash === inputs.runtimeEvidence.checkpointCount
    && metrics
    && validationSourcePass
    && validationCoveragePct !== null
    && validationCoveragePct >= minValidationCoveragePct
    && validationQualityPass
  );

  const compositeScoreOutputPass = Boolean(
    metrics
    && metrics.agentId === inputs.registration.agentId
    && isFiniteNumber(metrics.compositeScore)
    && isFiniteNumber(metrics.averageValidationScore)
    && isFiniteNumber(metrics.averageReputationScore)
    && isFiniteNumber(metrics.maxDrawdownBps)
  );

  const reputationPass = Boolean(
    inputs.runtimeEvidence.reputationFeedbackCount >= minReputationFeedbackCount
    && numberOrFallback(inputs.runtimeEvidence.reputationDistinctRaterCount, 0) >= minReputationDistinctRaterCount
    && metrics
    && reputationQualityPass
    && (requireReputationRegistry
      ? metrics.reputationSource === "reputation-registry"
      : (metrics.reputationSource === "reputation-registry" || metrics.reputationSource === "feedback-log"))
    && isFiniteNumber(metrics.averageReputationScore)
    && (metrics.averageReputationScore as number) > 0
    && isFiniteNumber(metrics.reputationFeedbackCount)
    && (metrics.reputationFeedbackCount as number) >= minReputationFeedbackCount
  );

  const routerEnforcementPass = Boolean(
    !inputs.routerEnforcement.queryError
    && inputs.routerEnforcement.currentNonce !== null
    && inputs.routerEnforcement.tradeRecord !== null
    && inputs.routerEnforcement.domainSeparator
    && inputs.routerEnforcement.guardrails
    && inputs.routerEnforcement.smallTrade?.approved === true
    && inputs.routerEnforcement.oversizedTrade?.approved === false
    && typeof inputs.routerEnforcement.oversizedTrade.reason === "string"
    && inputs.routerEnforcement.oversizedTrade.reason.trim().length > 0
  );

  const drawdownEvidencePass = Boolean(
    inputs.drawdownEvidence.found
    && !inputs.drawdownEvidence.stale
    && isFiniteNumber(inputs.drawdownEvidence.maxDrawdownBps)
    && isFiniteNumber(inputs.drawdownEvidence.currentDrawdownBps)
    && isFiniteNumber(inputs.drawdownEvidence.currentEquityUsd)
  );

  const checks: Record<string, Phase2CheckResult> = {
    strictSepoliaProofIntegrity: {
      pass: sharedContractsPass,
      reason: sharedContractsPass
        ? "Shared Sepolia contracts are snapshotted with live bytecode checks"
        : "Shared-contract snapshot is missing, off-chain, or lacks deployed bytecode",
    },
    capitalClaimProof: {
      pass: capitalProofPass,
      reason: capitalProofPass
        ? "Capital claim proof includes Sepolia tx hash and positive allocated balance"
        : "capital-proof.json is missing or does not prove a successful Sepolia allocation",
    },
    registrationProofCompleteness: {
      pass: registrationProofPass,
      reason: registrationProofPass
        ? "Registration proof includes matching Sepolia identity and valid typed-signature proof"
        : "Registration proof is missing, invalid, or not tied to the submission agent on Sepolia",
    },
    artifactIdentityIntegrity: {
      pass: artifactIdentityPass,
      reason: artifactIdentityPass
        ? "All runtime artifacts belong to the configured agent"
        : inputs.artifactIdentity.failReasons.join("; ") || "Runtime artifacts mix multiple agent identities",
    },
    submissionAssetManifesting: {
      pass: submissionManifestPass,
      reason: submissionManifestPass
        ? "Submission manifest includes all required public links and evidence files"
        : `Submission manifest is incomplete (missing links: ${inputs.submissionManifest.missingFields.join(", ") || "none"}; missing evidence: ${inputs.submissionManifest.missingEvidenceFiles.join(", ") || "none"})`,
    },
    validationEvidenceCoverage: {
      pass: validationEvidencePass,
      reason: validationEvidencePass
        ? `Current checkpoints are backed by validation evidence with >= ${minValidationCoveragePct}% coverage and >= ${minValidationScore} score`
        : `Validation evidence is missing, stale, below ${minValidationCoveragePct}% coverage, below ${minValidationScore} score, or using a non-approved source`,
    },
    compositeScoreOutput: {
      pass: compositeScoreOutputPass,
      reason: compositeScoreOutputPass
        ? "metrics.json contains a coherent score story for the submission agent"
        : "metrics.json is missing required score fields or is tied to the wrong agent",
    },
    reputationEvidence: {
      pass: reputationPass,
      reason: reputationPass
        ? `Objective reputation evidence is present with >= ${minReputationScore} score, >= ${minReputationFeedbackCount} feedback records, and >= ${minReputationDistinctRaterCount} distinct raters`
        : `Objective reputation evidence is missing, below ${minReputationScore} score, below ${minReputationFeedbackCount} feedbacks, below ${minReputationDistinctRaterCount} distinct raters, or using a non-approved source`,
    },
    evidenceDepth: {
      pass: evidenceDepthPass,
      reason: evidenceDepthPass
        ? `Checkpoint/fill depth is within target ranges (${formatRange(minCheckpointCount, maxCheckpointCount)} checkpoints, ${formatRange(minFillCount, maxFillCount)} fills)`
        : `Checkpoint/fill depth must stay in range (${formatRange(minCheckpointCount, maxCheckpointCount)} checkpoints, ${formatRange(minFillCount, maxFillCount)} fills)`
    },
    runQuality: {
      pass: runQualityPass,
      reason: runQualityPass
        ? `Run quality gates are satisfied (net PnL > ${minNetPnlUsd}, drawdown <= ${maxDrawdownBps} bps)`
        : `Run quality gates failed (requires net PnL > ${minNetPnlUsd} and drawdown <= ${maxDrawdownBps} bps)`,
    },
    routerEnforcement: {
      pass: routerEnforcementPass,
      reason: routerEnforcementPass
        ? "Shared router enforcement proof includes nonce/trade record reads and live simulateIntent approvals/rejections"
        : inputs.routerEnforcement.queryError || "Shared router enforcement evidence is incomplete",
    },
    drawdownEvidence: {
      pass: drawdownEvidencePass,
      reason: drawdownEvidencePass
        ? "Local equity and drawdown evidence is present and fresh"
        : inputs.drawdownEvidence.stale
          ? "equity-report.json is stale"
          : "equity-report.json is missing or lacks computed drawdown fields",
    },
  };

  const failReasons = Object.entries(checks)
    .filter(([, result]) => !result.pass)
    .map(([name, result]) => `${name}: ${result.reason}`);

  return {
    checks,
    failReasons,
    readyForSubmission: {
      hasSharedSepoliaContracts: sharedContractsPass,
      hasCapitalProof: capitalProofPass,
      hasRegistrationProof: registrationProofPass,
      hasArtifactIdentityIntegrity: artifactIdentityPass,
      hasSubmissionAssets: submissionManifestPass,
      hasValidationEvidence: validationEvidencePass,
      hasCompositeScoreOutput: compositeScoreOutputPass,
      hasObjectiveReputation: reputationPass,
      hasEvidenceDepth: evidenceDepthPass,
      hasRunQuality: runQualityPass,
      hasRouterEnforcement: routerEnforcementPass,
      hasDrawdownEvidence: drawdownEvidencePass,
      allChecksPassed: failReasons.length === 0,
    },
  };
}
