import { readFile, readdir } from "node:fs/promises";
import { extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  APP_VERSION,
  CHANGELOG_URL,
  RELEASE_CHANNEL,
  RELEASE_URL
} from "../src/config/version.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const semver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(0|[1-9]\d*))?$/;

export async function checkVersion() {
  const failures = [];
  const packageJson = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const changelog = await readFile(join(root, "CHANGELOG.md"), "utf8");
  const indexHtml = await readFile(join(root, "index.html"), "utf8");

  if (!semver.test(APP_VERSION)) failures.push("Invalid Semantic Version: " + APP_VERSION);
  if (packageJson.version !== APP_VERSION) failures.push("package.json and version.js do not match");
  if (!changelog.includes("## [" + APP_VERSION + "]") && !changelog.includes("## [Unreleased]")) {
    failures.push("CHANGELOG has neither the current version nor Unreleased");
  }
  if (!RELEASE_URL.endsWith("/releases/tag/v" + APP_VERSION)) failures.push("Release URL tag does not match APP_VERSION");
  if (APP_VERSION.includes("-") && !APP_VERSION.includes("-" + RELEASE_CHANNEL + ".")) failures.push("Release channel does not match prerelease version");
  if (CHANGELOG_URL.startsWith("/")) failures.push("CHANGELOG_URL must be relative for subdirectory deployments");

  const resourceUrls = [...indexHtml.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
  for (const url of resourceUrls) {
    if (url.startsWith("/") && !url.startsWith("//")) failures.push("Root-relative resource is not subdirectory-safe: " + url);
  }

  const sourceFiles = await collectFiles(join(root, "src"));
  const escapedVersion = escapeRegExp(APP_VERSION);
  const literalPattern = new RegExp(escapedVersion, "g");
  const duplicateLocations = [];
  for (const file of sourceFiles) {
    if (file.endsWith(join("config", "version.js"))) continue;
    if (literalPattern.test(await readFile(file, "utf8"))) duplicateLocations.push(relative(root, file));
    literalPattern.lastIndex = 0;
  }
  if (duplicateLocations.length) failures.push("Hard-coded version found outside version.js: " + duplicateLocations.join(", "));

  if (failures.length) throw new Error(failures.join("\n"));
  return { version: APP_VERSION, channel: RELEASE_CHANNEL, resources: resourceUrls.length };
}

function escapeRegExp(value) {
  const special = "\\^$.*+?()[]{}|";
  return [...value].map(character => special.includes(character) ? "\\" + character : character).join("");
}

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(path);
    return [".js", ".html", ".css"].includes(extname(entry.name)) ? [path] : [];
  }));
  return nested.flat();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await checkVersion();
    console.log("Version check passed: v" + result.version + " (" + result.channel + ")");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
