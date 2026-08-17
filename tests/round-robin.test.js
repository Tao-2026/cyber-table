import test from "node:test";
import assert from "node:assert/strict";
import { pairForRound } from "../src/core/round-robin.js";

const players = ["a","b","c"].map((playerId, seat) => ({ playerId, seat }));

test("two players remain paired and alternate marks", () => {
  const two = players.slice(0, 2);
  assert.deepEqual(pairForRound(two, 0), ["a","b"]);
  assert.deepEqual(pairForRound(two, 1), ["b","a"]);
});

test("three players complete all pairings before repeating", () => {
  const firstCycle = [0,1,2].map(round => new Set(pairForRound(players, round)));
  assert.deepEqual(firstCycle, [new Set(["a","b"]), new Set(["a","c"]), new Set(["b","c"])]);
  assert.deepEqual(new Set(pairForRound(players, 3)), firstCycle[0]);
});
