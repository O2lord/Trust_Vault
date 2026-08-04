// scripts/write-version.ts
//
// Generates version.ts with the current git commit SHA baked in as
// BOT_VERSION. Used by val_bot.ts to send an `x-bot-version` header on
// every request to the platform API.
//
// Railway's build container does NOT include the .git directory (it
// uploads a source snapshot, not the git history), so `git rev-parse HEAD`
// fails there with "fatal: not a git repository". Railway instead injects
// the commit SHA as an env var: RAILWAY_GIT_COMMIT_SHA.
//
// This script prefers that env var and only falls back to running git
// locally (for `npm run build` on your own machine, where .git exists).
//
// Run via tsx (not plain `node`) since package.json has "type": "module",
// which makes require() unavailable in plain .js files — tsx handles the
// TS + ESM interop for us without needing a separate compile step.

import { writeFileSync } from "fs";
import { execSync } from "child_process";

function getCommitSha(): string {
  // 1. Railway injects this automatically on every build
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    return process.env.RAILWAY_GIT_COMMIT_SHA;
  }

  // 2. Generic fallback some other CI providers use
  if (process.env.GIT_COMMIT_SHA) {
    return process.env.GIT_COMMIT_SHA;
  }

  // 3. Local dev machine — .git exists, so ask git directly
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    // 4. No git, no env var — don't crash the build over a version string
    return "unknown";
  }
}

const sha = getCommitSha();
const contents = `export const BOT_VERSION = "${sha}";\n`;

writeFileSync("version.ts", contents);
console.log(`✅ version.ts written — BOT_VERSION=${sha}`);
