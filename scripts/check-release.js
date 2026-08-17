import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { APP_VERSION, RELEASE_COMMIT, RELEASE_DATE, RELEASE_URL } from "../src/config/version.js";
import { checkVersion } from "./check-version.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const failures = [];

try { await checkVersion(); } catch (error) { failures.push(error.message); }
const head = git("rev-parse", "HEAD");
const branch = git("branch", "--show-current");
let upstream = null;
try { upstream = git("rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"); }
catch { failures.push("Current branch has no upstream"); }
if (git("status", "--porcelain")) failures.push("Git worktree is not clean");
if (upstream && git("rev-parse", upstream) !== head) failures.push("Current commit has not been pushed to its upstream branch");
if (git("tag", "--list", "v" + APP_VERSION)) failures.push("Local release tag already exists");
try {
  if (git("ls-remote", "--tags", "origin", "refs/tags/v" + APP_VERSION)) failures.push("Remote release tag already exists");
} catch { failures.push("Unable to verify remote tags"); }
try { git("check-ignore", "archives/release-probe.zip"); }
catch { failures.push("archives/ is not ignored"); }
if (!RELEASE_DATE) failures.push("RELEASE_DATE is not set");
try { git("merge-base", "--is-ancestor", RELEASE_COMMIT, head); }
catch { failures.push("RELEASE_COMMIT is not an ancestor of HEAD"); }
if (!RELEASE_URL.endsWith("/releases/tag/v" + APP_VERSION)) failures.push("Release URL does not match version");
if (process.env.CYBER_TABLE_EMULATOR_TESTED_COMMIT !== head) failures.push("Emulator test evidence does not match HEAD");
const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");
if (changelog.includes("## [" + APP_VERSION + "] - Unreleased")) failures.push("CHANGELOG current version is still marked Unreleased");

if (failures.length) {
  console.error("Release check blocked on " + branch + ":\n- " + failures.join("\n- "));
  process.exitCode = 1;
} else {
  console.log("Release check passed for v" + APP_VERSION + " at " + head);
}
