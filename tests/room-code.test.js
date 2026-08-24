import test from "node:test";
import assert from "node:assert/strict";
import { generateShortRoomCode, isLegacyRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET, roomShareUrl } from "../src/core/room-code.js";

test("new five-character codes exclude ambiguous characters", () => {
  const values = Array.from({ length: ROOM_CODE_ALPHABET.length }, (_, index) => generateShortRoomCode(() => index / ROOM_CODE_ALPHABET.length));
  assert.ok(values.every(code => code.length === 5 && /^[A-HJ-KM-NP-Z2-9]+$/.test(code)));
  assert.ok(values.every(code => !/[ILO01]/.test(code)));
});

test("join input ignores case, spaces and hyphens while legacy codes remain valid", () => {
  assert.equal(normalizeRoomCode(" a-b 1 c "), "AB1C");
  assert.equal(normalizeRoomCode(" 7k-2 h9 "), "7K2H9");
  assert.equal(isLegacyRoomCode(" i1o0l "), true);
});

test("share links encode the normalized room code", () => {
  assert.equal(roomShareUrl("https://example.test/cyber-arcade/table/?backend=firebase", " ab-c 23 "), "https://example.test/cyber-arcade/table/?backend=firebase&room=ABC23");
});
