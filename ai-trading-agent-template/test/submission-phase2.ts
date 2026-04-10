import { expect } from "chai";
import { evaluatePhase2Readiness } from "../src/submission/phase2";

describe("phase 2 readiness evaluation", function () {
  it("passes when the shared proof package is complete", function () {
    const result = evaluatePhase2Readiness({
      expectedChainId: 11155111,
      sharedContracts: {
        found: true,
        chainId: 11155111,
        isSepolia: true,
        allContractsPresent: true,
      },
      capitalProof: {
        found: true,
        chainId: 11155111,
        txHash: "0x" + "1".repeat(64),
        allocatedAfterEth: 0.01,
      },
      registration: {
        found: true,
        chainId: 11155111,
        agentId: "5",
        agentWallet: "0x" + "2".repeat(40),
        registrationTxHash: "0x" + "3".repeat(64),
        signatureProofValid: true,
      },
      submissionManifest: {
        found: true,
        hasAllRequiredLinks: true,
        hasAllRequiredEvidence: true,
        missingFields: [],
        missingEvidenceFiles: [],
      },
      artifactIdentity: {
        pass: true,
        failReasons: [],
      },
      runtimeEvidence: {
        checkpointCount: 30,
        checkpointsWithHash: 30,
        fillCount: 2,
        reputationFeedbackCount: 1,
        metricsFound: true,
        metricsSummary: {
          agentId: "5",
          averageValidationScore: 72,
          validationSource: "validation-registry",
          validationCoveragePct: 100,
          averageReputationScore: 84,
          reputationSource: "reputation-registry",
          reputationFeedbackCount: 1,
          compositeScore: 74,
          maxDrawdownBps: 120,
        },
      },
      routerEnforcement: {
        queryError: null,
        currentNonce: "1",
        tradeRecord: {
          count: "1",
          windowStart: "1710000000",
        },
        domainSeparator: "0x" + "4".repeat(64),
        smallTrade: {
          approved: true,
          reason: "",
        },
        oversizedTrade: {
          approved: false,
          reason: "No risk params: exceeds $1000 default cap",
        },
        guardrails: {
          active: false,
        },
      },
      drawdownEvidence: {
        found: true,
        stale: false,
        maxDrawdownBps: 120,
        currentDrawdownBps: 45,
        currentEquityUsd: 10025,
      },
    });

    expect(result.readyForSubmission.allChecksPassed).to.equal(true);
    expect(result.failReasons).to.deep.equal([]);
  });

  it("fails when artifact identity is mixed", function () {
    const result = evaluatePhase2Readiness({
      expectedChainId: 11155111,
      sharedContracts: {
        found: true,
        chainId: 11155111,
        isSepolia: true,
        allContractsPresent: true,
      },
      capitalProof: {
        found: true,
        chainId: 11155111,
        txHash: "0x" + "1".repeat(64),
        allocatedAfterEth: 0.01,
      },
      registration: {
        found: true,
        chainId: 11155111,
        agentId: "5",
        agentWallet: "0x" + "2".repeat(40),
        registrationTxHash: "0x" + "3".repeat(64),
        signatureProofValid: true,
      },
      submissionManifest: {
        found: true,
        hasAllRequiredLinks: true,
        hasAllRequiredEvidence: true,
        missingFields: [],
        missingEvidenceFiles: [],
      },
      artifactIdentity: {
        pass: false,
        failReasons: ["fills belong to 0, expected 5"],
      },
      runtimeEvidence: {
        checkpointCount: 30,
        checkpointsWithHash: 30,
        fillCount: 2,
        reputationFeedbackCount: 1,
        metricsFound: true,
        metricsSummary: {
          agentId: "5",
          averageValidationScore: 72,
          validationSource: "validation-registry",
          validationCoveragePct: 100,
          averageReputationScore: 84,
          reputationSource: "reputation-registry",
          reputationFeedbackCount: 1,
          compositeScore: 74,
          maxDrawdownBps: 120,
        },
      },
      routerEnforcement: {
        queryError: null,
        currentNonce: "1",
        tradeRecord: {
          count: "1",
          windowStart: "1710000000",
        },
        domainSeparator: "0x" + "4".repeat(64),
        smallTrade: {
          approved: true,
          reason: "",
        },
        oversizedTrade: {
          approved: false,
          reason: "No risk params: exceeds $1000 default cap",
        },
        guardrails: {
          active: false,
        },
      },
      drawdownEvidence: {
        found: true,
        stale: false,
        maxDrawdownBps: 120,
        currentDrawdownBps: 45,
        currentEquityUsd: 10025,
      },
    });

    expect(result.checks.artifactIdentityIntegrity.pass).to.equal(false);
    expect(result.readyForSubmission.allChecksPassed).to.equal(false);
  });
});
