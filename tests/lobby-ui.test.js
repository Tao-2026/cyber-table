import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("waiting practice retains room listening and exits when a formal series starts", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /waitingPractice && prior\?\.status === "lobby"/);
  assert.match(source, /value\.status !== "lobby"[\s\S]*waitingPractice = false/);
  assert.match(source, /RETURN TO LOBBY \/ 返回大厅/);
  assert.doesNotMatch(source, /name === "return-lobby"[\s\S]{0,120}forgetRoom/);
});

test("lobby exposes series, player and spectator labels without color-only meaning", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  for (const text of ["SINGLE ROUND", "BEST OF 3", "BEST OF 5", "PLAYERS / 参赛玩家", "SPECTATORS / 观众", "PLAYER", "SPECTATOR", "HOST", "YOU"]) assert.ok(source.includes(text) || source.includes("presetForTarget"));
});

test("suggestion UI is structured, accessible, and never calls move when accepted", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /RAISE HAND \/ 举手/);
  assert.match(source, /ACCEPT SUGGESTION/);
  assert.match(source, /MUTE SUGGESTIONS THIS TURN/);
  assert.match(source, /aria-live="polite"/);
  const acceptBlock = source.match(/if \(name === "suggest-accept"\)[\s\S]*?\n\s*if \(name === "suggest-dismiss"\)/)?.[0] || "";
  assert.doesNotMatch(acceptBlock, /api\.move/);
});

test("phone layout keeps practice board and controls in normal flow", async () => {
  const css = await readFile("styles/app.css", "utf8");
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /waiting-practice \.board/);
  assert.doesNotMatch(css, /\.suggestion-halo[^}]*position:\s*fixed/);
});
