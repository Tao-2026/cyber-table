import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { APP_VERSION, RELEASE_URL } from "../src/config/version.js";
import { getVersionFooterModel } from "../src/components/version-footer.js";

test("version configuration is a pure ES module", async () => {
  const source = await readFile("src/config/version.js", "utf8");
  assert.doesNotMatch(source, /\b(?:window|document|Firebase)\b/);
  assert.match(source, /export const APP_VERSION/);
});

test("English and Chinese version copy identify beta", () => {
  const english = getVersionFooterModel("en");
  const chinese = getVersionFooterModel("zh");
  assert.equal(english.updatesLabel, "View updates");
  assert.equal(chinese.updatesLabel, "查看更新");
  assert.equal(english.channel, "Beta");
  assert.equal(chinese.channel, "Beta");
});

test("unpublished release falls back to changelog", () => {
  const model = getVersionFooterModel("en");
  assert.equal(model.isPublished, false);
  assert.equal(model.href, "./CHANGELOG.md");
  assert.equal(RELEASE_URL, "https://github.com/Tao-2026/cyber-table/releases/tag/v" + APP_VERSION);
});

test("relative update link survives a future Cyber Arcade subdirectory", () => {
  const resolved = new URL(getVersionFooterModel("en").href, "https://example.test/cyber-arcade/table/");
  assert.equal(resolved.pathname, "/cyber-arcade/table/CHANGELOG.md");
});

test("package and changelog contain the configured version", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  const changelog = await readFile("CHANGELOG.md", "utf8");
  assert.equal(packageJson.version, APP_VERSION);
  assert.ok(changelog.includes("[" + APP_VERSION + "]"));
});

test("version footer remains in flow and respects phone safe area", async () => {
  const css = await readFile("styles/version.css", "utf8");
  const html = await readFile("index.html", "utf8");
  const ui = await readFile("src/version-ui.js", "utf8");
  assert.doesNotMatch(css, /position\s*:\s*fixed/);
  assert.match(css, /safe-area-inset-bottom/);
  assert.match(css, /width:\s*min\(100%/);
  assert.ok(html.indexOf("</main>") < html.indexOf('id="version-info"'));
  assert.match(ui, /noopener noreferrer/);
  assert.match(ui, /MutationObserver/);
});
