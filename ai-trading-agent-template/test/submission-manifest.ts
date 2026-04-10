import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { assertSubmissionManifestReady, buildSubmissionManifest } from "../src/submission/manifest";

describe("submission manifest strict mode", function () {
  let tempDir = "";

  beforeEach(function () {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "submission-manifest-"));
  });

  afterEach(function () {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("fails strict mode when evidence files are missing", function () {
    const manifest = buildSubmissionManifest(
      tempDir,
      {
        SUBMISSION_GITHUB_URL: "https://github.com/hyperionburn/ai-trading-agent-template",
        DEMO_URL: "https://example.com/demo",
        DEMO_VIDEO_URL: "https://example.com/video",
        DEMO_SLIDES_URL: "https://example.com/slides",
      } as NodeJS.ProcessEnv,
      false
    );

    expect(manifest.readiness.hasAllRequiredLinks).to.equal(true);
    expect(manifest.links.githubRepository).to.equal("https://github.com/hyperionburn/ai-trading-agent-template");
    expect(manifest.links.demoUrl).to.equal("https://github.com/hyperionburn/ai-trading-agent-template/blob/main/index.html");
    expect(manifest.links.videoUrl).to.equal("https://github.com/hyperionburn/ai-trading-agent-template/blob/main/docs/DETAILED_WALKTHROUGH.md");
    expect(manifest.links.slidesUrl).to.equal("https://github.com/hyperionburn/ai-trading-agent-template/blob/main/docs/ARCHITECTURE.md");
    expect(manifest.readiness.hasAllRequiredEvidence).to.equal(false);
    expect(manifest.readiness.missingEvidenceFiles).to.include("sharedContracts");
    expect(() => assertSubmissionManifestReady(manifest)).to.throw("missing evidence");
  });
});
