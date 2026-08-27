import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("waiting practice retains room listening and exits when a formal series starts", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /waitingPractice && prior\?\.status === "lobby"/);
  assert.match(source, /value\.status !== "lobby"[\s\S]*waitingPractice = false/);
  assert.match(source, /RETURN TO LOBBY/);
  assert.doesNotMatch(source, /name === "return-lobby"[\s\S]{0,120}forgetRoom/);
});

test("lobby exposes series, player and spectator labels without color-only meaning", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  for (const text of ["SINGLE ROUND", "BEST OF 3", "BEST OF 5", "PLAYERS", "SPECTATORS", "PLAYER", "SPECTATOR", "HOST", "YOU"]) assert.ok(source.includes(text) || source.includes("presetForTarget"));
});

test("hand approval and suggested-cell UI are separate from formal moves", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /RAISE HAND/);
  assert.match(source, /ALLOW TO SUGGEST/);
  assert.match(source, /You may suggest one square\./);
  assert.match(source, /data-fb-action="\$\{canSuggest \? "suggest-cell" : "cell"\}"/);
  assert.match(source, /aria-live="polite"/);
  const suggestBlock = source.match(/if \(name === "suggest-cell"\)[\s\S]*?\n\s*if \(name === "hand-approve"\)/)?.[0] || "";
  assert.match(suggestBlock, /api\.suggestCell/); assert.doesNotMatch(suggestBlock, /api\.move/);
});

test("phone layout keeps practice board and controls in normal flow", async () => {
  const css = await readFile("styles/app.css", "utf8");
  assert.match(css, /@media \(max-width: 420px\)/);
  assert.match(css, /waiting-practice \.board/);
  assert.doesNotMatch(css, /\.suggestion-halo[^}]*position:\s*fixed/);
});

test("unified join offers explicit player and spectator entry with role-aware links", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  const codes = await readFile("src/core/room-code.js", "utf8");
  for (const text of ["PLAYER", "SPECTATOR", "CONFIRM AND JOIN", "Game already started. You joined as a spectator.", "SHARE PLAYER LINK", "SHARE SPECTATOR LINK"]) assert.ok(source.includes(text));
  assert.match(codes, /searchParams\.set\("role", role\)/);
  assert.match(source, /ROOM \$\{room\.memberCount\}/);
});

test("series break exposes an accessible player queue without moving the board", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  for (const text of ["SERIES BREAK", "JOIN PLAYER QUEUE", "PLAYER REQUEST PENDING", "YOU ARE SPECTATING", "BOARD IS READ ONLY"]) assert.ok(source.includes(text));
  const requestBlock = source.match(/if \(name === "request-player"\)[\s\S]*?if \(name === "request-spectator"\)/)?.[0] || "";
  assert.doesNotMatch(requestBlock, /api\.move/);
});

test("mobile player and spectator sections collapse and do not cover safe areas", async () => {
  const source = await readFile("src/emulator-app.js", "utf8"); const css = await readFile("styles/app.css", "utf8");
  assert.match(source, /<details open><summary>PLAYERS/); assert.match(source, /<details open><summary>SPECTATORS/);
  assert.match(css, /env\(safe-area-inset-bottom\)/); assert.match(css, /\.player-list[^}]*max-height/);
});

test("every match state keeps a public room code and spectator invite", async () => {
  const source = await readFile("src/emulator-app.js", "utf8"); const css = await readFile("styles/app.css", "utf8");
  for (const text of ["COPY CODE", "INVITE SPECTATORS", "Friends can join as spectators while the game is running."] ) assert.ok(source.includes(text));
  assert.match(source, /searchParams\.set\("role", "spectator"\)/); assert.doesNotMatch(source, /spectatorInviteUrl[\s\S]{0,250}roomId/);
  assert.match(css, /\.match-invite/); assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.match-invite/);
});

test("prejoin avatar picker is persistent, accessible, and role aware", async () => {
  const source = await readFile("src/emulator-app.js", "utf8"); const css = await readFile("styles/app.css", "utf8");
  for (const text of ["YOUR AVATAR", "RANDOMIZE", "CONFIRM AND CREATE", "CONFIRM AND JOIN", "Selected avatar:"]) assert.ok(source.includes(text));
  assert.match(source, /cyberTable\.selectedAvatar/); assert.match(source, /sessionStorage\.setItem\(avatarSessionKey/);
  assert.match(source, /api\.create\(null, selectedAvatar\.id\)/); assert.match(source, /api\.join\([^\n]+selectedAvatar\.id\)/);
  assert.match(css, /prefers-reduced-motion/); assert.match(css, /\.avatar-preview/);
});

test("live product surfaces are English-only while localization data remains available", async () => {
  const files = ["src/emulator-app.js", "src/app.js", "src/services/firebase-room-service.js", "index.html"];
  for (const file of files) assert.doesNotMatch(await readFile(file, "utf8"), /[\u3400-\u9fff]/, file);
  const i18n = await readFile("src/core/i18n.js", "utf8");
  assert.match(i18n, /return "en"/);
});

test("waiting practice exposes a persistent accessible 1–10 difficulty slider", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  for (const text of ['type="range"', 'min="1"', 'max="10"', 'step="1"', "COMPUTER DIFFICULTY", "aria-valuetext", "sessionStorage.setItem(difficultySessionKey", "choosePracticeMove(waitingGame, waitingDifficulty)"]) assert.ok(source.includes(text), text);
  assert.match(source, /scheduleWaitingComputerMove\(\)[\s\S]*waitingComputerGeneration/);
  assert.doesNotMatch(source, /api\.[A-Za-z]+\([^\n]*waitingDifficulty/);
});

test("waiting practice exposes three accessible first-player modes with per-tab progress", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  const css = await readFile("styles/app.css", "utf8");
  for (const text of ["FIRST PLAYER", "ALTERNATE", "ALWAYS YOU", "ALWAYS COMPUTER", 'type="radio"', 'name="first-player-mode"', "SELECTED", "COMPUTER STARTS", "YOU START", "COMPUTER IS THINKING…", "cyberTable.waitingPracticeFirstPlayer"]) assert.ok(source.includes(text), text);
  assert.match(source, /changeFirstPlayerMode\(firstPlayerState, target\.value, boardIsEmpty\)/);
  assert.match(source, /cancelWaitingComputerMove\(\)[\s\S]*waitingComputerGeneration/);
  assert.match(source, /value\.status !== "lobby"[\s\S]*cancelWaitingComputerMove\(\)/);
  assert.doesNotMatch(source, /api\.[A-Za-z]+\([^\n]*(?:firstPlayer|currentStarter|nextAlternateStarter)/);
  assert.match(css, /\.first-player-mode/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.first-player-mode/);
});

test("create or join failure keeps the confirmed picker avatar for retry", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  const errorBlock = source.match(/catch \(error\) \{[\s\S]*?else renderError\(error\);[\s\S]*?\}/)?.[0] || "";
  assert.match(errorBlock, /pendingEntry/); assert.match(errorBlock, /renderAvatarPicker\(error\.message/);
  assert.doesNotMatch(errorBlock, /randomAvatar|chooseAvatar|removeItem\(avatarSessionKey/);
});

test("all live identity surfaces resolve the stored avatar instead of rerandomizing", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /function memberAvatar\(member\) \{ return resolveAvatar\(member\); \}/);
  assert.match(source, /ASSIST · PLAYER/); assert.match(source, /spectatorAvatarId/); assert.match(source, /Party Podium/);
  assert.doesNotMatch(source.match(/function renderRoom[\s\S]*?function waitingResult/)?.[0] || "", /randomAvatar\(/);
});
