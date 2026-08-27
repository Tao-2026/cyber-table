import test from "node:test";
import assert from "node:assert/strict";
import { createGame, makeMove } from "../src/games/tic-tac-toe/rules.js";
import { choosePracticeMove, difficultyName, normalizePracticeDifficulty } from "../src/games/tic-tac-toe/practice-ai.js";

function gameFromMoves(moves) {
  return moves.reduce((game, cell) => makeMove(game, cell), createGame());
}

test("difficulty normalization and labels cover levels 1 through 10", () => {
  assert.equal(normalizePracticeDifficulty(undefined), 5);
  assert.equal(normalizePracticeDifficulty("10"), 10);
  assert.equal(normalizePracticeDifficulty(11), 5);
  for (const [level, label] of [[1,"VERY EASY"],[2,"VERY EASY"],[3,"EASY"],[4,"EASY"],[5,"CHALLENGING"],[6,"CHALLENGING"],[7,"HARD"],[8,"HARD"],[9,"EXPERT"],[10,"EXPERT"]]) assert.equal(difficultyName(level), label);
});

test("every level returns only a legal empty cell", () => {
  const game = gameFromMoves([0, 4, 8]);
  for (let level = 1; level <= 10; level += 1) {
    const cell = choosePracticeMove(game, level, () => 0.42);
    assert.ok([1,2,3,5,6,7].includes(cell), `level ${level} chose ${cell}`);
  }
});

test("low difficulty retains random mistakes", () => {
  const game = gameFromMoves([0, 3, 1]);
  assert.equal(choosePracticeMove(game, 1, () => 0), 2);
  assert.notEqual(choosePracticeMove(game, 1, () => 0.999), 2);
});

test("medium and high difficulty finish wins and block threats", () => {
  const winning = gameFromMoves([3,0,4,1,8]);
  for (const level of [5,6,7,8,9,10]) assert.equal(choosePracticeMove(winning, level, () => 0.5), 2);
  const blocking = gameFromMoves([0,4,1]);
  for (const level of [6,7,8,9,10]) assert.equal(choosePracticeMove(blocking, level, () => 0.5), 2);
});

test("level 10 always selects a minimax-optimal response and cannot lose", () => {
  function explore(game) {
    if (game.status !== "playing") { assert.notEqual(game.winner, "X"); return; }
    for (let x = 0; x < 9; x += 1) {
      if (game.board[x] !== null) continue;
      const afterX = makeMove(game, x);
      if (afterX.status !== "playing") { assert.notEqual(afterX.winner, "X"); continue; }
      const o = choosePracticeMove(afterX, 10, () => 0.999);
      assert.equal(afterX.board[o], null);
      explore(makeMove(afterX, o));
    }
  }
  explore(createGame());
});

test("computer-first openings work at low, medium and expert difficulty", () => {
  const computerStarts = createGame("O");
  for (const level of [1, 5, 10]) assert.ok(Number.isInteger(choosePracticeMove(computerStarts, level, () => 0.6)));
  assert.equal(choosePracticeMove(computerStarts, 10, () => 0.999), 0);
});

test("practice AI is a pure module without browser or Firebase dependencies", async () => {
  const source = await (await import("node:fs/promises")).readFile("src/games/tic-tac-toe/practice-ai.js", "utf8");
  assert.doesNotMatch(source, /\b(?:window|document|sessionStorage|firebase|Firestore)\b/);
});
