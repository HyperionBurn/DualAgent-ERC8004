import * as dotenv from "dotenv";
dotenv.config();

import * as fs from "fs";
import * as path from "path";
import { assertSubmissionManifestReady, buildSubmissionManifest } from "../src/submission/manifest";

function main() {
  const cwd = process.cwd();
  const allowMissing = process.argv.includes("--allow-missing");
  const manifest = buildSubmissionManifest(cwd, process.env, allowMissing);

  const outPath = path.join(cwd, "submission-manifest.json");
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2));

  console.log("\nSubmission Manifest");
  console.log("===================");
  console.log(`Wrote: ${outPath}`);
  console.log(`Missing required links: ${manifest.readiness.missingFields.length}`);
  if (manifest.readiness.missingFields.length > 0) {
    for (const missing of manifest.readiness.missingFields) {
      console.log(`- ${missing}`);
    }
  }
  if (manifest.readiness.missingEvidenceFiles.length > 0) {
    console.log(`Missing evidence files: ${manifest.readiness.missingEvidenceFiles.join(", ")}`);
  }
  if (manifest.proofSummary.selectedRunLabel) {
    console.log(`Selected run: ${manifest.proofSummary.selectedRunLabel}`);
  }
  if (manifest.proofSummary.validationSource) {
    console.log(`Validation source: ${manifest.proofSummary.validationSource}`);
  }
  if (manifest.proofSummary.reputationSource) {
    console.log(`Reputation source: ${manifest.proofSummary.reputationSource}`);
  }

  assertSubmissionManifestReady(manifest);
}

try {
  main();
} catch (error) {
  console.error("[submission-manifest] Failed:", error);
  process.exit(1);
}
