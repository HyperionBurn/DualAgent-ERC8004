import * as fs from "fs";
import * as path from "path";

export interface SubmissionPublicLinks {
  githubRepository: string | null;
  demoUrl: string | null;
  videoUrl: string | null;
  slidesUrl: string | null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readJson(filePath: string): Record<string, unknown> | null {
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

function normalizeUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("example.com") || trimmed.includes("YOUR_")) {
    return null;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function readManifestRepositoryUrl(cwd: string): string | null {
  const manifest = readJson(path.join(cwd, "submission-manifest.json"));
  const links = manifest && typeof manifest.links === "object" && !Array.isArray(manifest.links)
    ? manifest.links as Record<string, unknown>
    : null;
  return normalizeUrl(asString(links?.githubRepository));
}

export function resolveSubmissionRepositoryUrl(cwd: string, env: NodeJS.ProcessEnv): string | null {
  return normalizeUrl(env.SUBMISSION_GITHUB_URL) || readManifestRepositoryUrl(cwd);
}

export function deriveSubmissionPublicLinks(repositoryUrl: string): SubmissionPublicLinks {
  const baseUrl = repositoryUrl.replace(/\/$/, "");

  return {
    githubRepository: baseUrl,
    demoUrl: `${baseUrl}/blob/main/index.html`,
    videoUrl: `${baseUrl}/blob/main/docs/DETAILED_WALKTHROUGH.md`,
    slidesUrl: `${baseUrl}/blob/main/docs/ARCHITECTURE.md`,
  };
}

export function resolveSubmissionPublicLinks(cwd: string, env: NodeJS.ProcessEnv): SubmissionPublicLinks {
  const repositoryUrl = resolveSubmissionRepositoryUrl(cwd, env);
  const derived = repositoryUrl ? deriveSubmissionPublicLinks(repositoryUrl) : null;

  return {
    githubRepository: normalizeUrl(env.SUBMISSION_GITHUB_URL) || derived?.githubRepository || null,
    demoUrl: normalizeUrl(env.DEMO_URL) || derived?.demoUrl || null,
    videoUrl: normalizeUrl(env.DEMO_VIDEO_URL) || derived?.videoUrl || null,
    slidesUrl: normalizeUrl(env.DEMO_SLIDES_URL) || derived?.slidesUrl || null,
  };
}