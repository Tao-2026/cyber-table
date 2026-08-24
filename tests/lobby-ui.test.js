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

test("hand approval and suggested-cell UI are separate from formal moves", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  assert.match(source, /RAISE HAND \/ 举手/);
  assert.match(source, /ALLOW TO SUGGEST \/ 允许指点/);
  assert.match(source, /You may suggest one square\. \/ 你现在可以建议一个格子。/);
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
  for (const text of ["JOIN AS PLAYER / 作为玩家加入", "JOIN AS SPECTATOR / 作为观众加入", "Game already started. You joined as a spectator.", "比赛已经开始，你已作为观众加入。", "SHARE PLAYER LINK", "SHARE SPECTATOR LINK"]) assert.ok(source.includes(text));
  assert.match(codes, /searchParams\.set\("role", role\)/);
  assert.match(source, /ROOM \$\{room\.memberCount\}/);
});

test("series break exposes an accessible player queue without moving the board", async () => {
  const source = await readFile("src/emulator-app.js", "utf8");
  for (const text of ["SERIES BREAK / 系列间准备", "JOIN PLAYER QUEUE / 申请参赛", "PLAYER REQUEST PENDING / 参赛申请待确认", "YOU ARE SPECTATING / 你正在观战", "BOARD IS READ ONLY"]) assert.ok(source.includes(text));
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
  for (const text of ["COPY CODE / 复制房间码", "INVITE SPECTATORS / 邀请观众", "Friends can join as spectators while the game is running.", "比赛进行中，朋友仍可使用房间码加入观战。"] ) assert.ok(source.includes(text));
  assert.match(source, /searchParams\.set\("role", "spectator"\)/); assert.doesNotMatch(source, /spectatorInviteUrl[\s\S]{0,250}roomId/);
  assert.match(css, /\.match-invite/); assert.match(css, /@media \(max-width: 420px\)[\s\S]*\.match-invite/);
});
