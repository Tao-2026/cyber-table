import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { AVATARS, DEFAULT_AVATAR_ID, avatarById, avatarFromLegacyEmoji, randomAvatar, resolveAvatar } from "../src/config/avatars.js";

test("family-friendly avatar configuration has stable unique ids", () => {
  assert.ok(AVATARS.length >= 24);
  assert.equal(new Set(AVATARS.map(avatar => avatar.id)).size, AVATARS.length);
  for (const avatar of AVATARS) {
    assert.match(avatar.id, /^[a-z][a-z0-9-]{0,23}$/);
    assert.ok(avatar.emoji && avatar.label.en && avatar.label.zh);
  }
});

test("secure random selection avoids the current avatar", () => {
  const source = { getRandomValues(values) { values[0] = 0; return values; } };
  const first = randomAvatar(null, source); const next = randomAvatar(first.id, source);
  assert.notEqual(next.id, first.id);
});

test("random failure returns the fixed robot fallback", () => {
  const broken = { getRandomValues() { throw new Error("unavailable"); } };
  assert.equal(randomAvatar("panda", broken).id, DEFAULT_AVATAR_ID);
});

test("legacy emoji-only members resolve without changing identity fields", () => {
  assert.equal(resolveAvatar({ emoji: "🐼" }).id, "panda");
  assert.equal(avatarFromLegacyEmoji("❓").id, "legacy");
  assert.equal(avatarById("unknown"), null);
});

test("avatar implementation has no external service or Math.random dependency", async () => {
  const source = await readFile("src/config/avatars.js", "utf8");
  assert.doesNotMatch(source, /Math\.random|https?:\/\/|fetch\(|upload/i);
  assert.match(source, /getRandomValues/);
});
