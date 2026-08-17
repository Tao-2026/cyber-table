import test from "node:test";
import assert from "node:assert/strict";
import { createGame, evaluateBoard, makeMove } from "../src/games/tic-tac-toe/rules.js";
import { chooseRandomMove } from "../src/games/tic-tac-toe/simple-ai.js";

const wins = [
  ["X","X","X",null,null,null,null,null,null], [null,null,null,"O","O","O",null,null,null], [null,null,null,null,null,null,"X","X","X"],
  ["O",null,null,"O",null,null,"O",null,null], [null,"X",null,null,"X",null,null,"X",null], [null,null,"O",null,null,"O",null,null,"O"],
  ["X",null,null,null,"X",null,null,null,"X"], [null,null,"O",null,"O",null,"O",null,null]
];

test("detects all horizontal, vertical and diagonal wins", () => {
  for (const board of wins) assert.equal(evaluateBoard(board).status, "won");
});
test("detects a draw", () => assert.equal(evaluateBoard(["X","O","X","X","O","O","O","X","X"]).status, "draw"));
test("switches turns after a valid move", () => assert.equal(makeMove(createGame(), 4).currentTurn, "O"));
test("rejects occupied cells", () => { const game = makeMove(createGame(), 0); assert.throws(() => makeMove(game, 0), /occupied/); });
test("rejects invalid cells", () => assert.throws(() => makeMove(createGame(), 9), /Invalid cell/));
test("rejects moves after game over", () => {
  let game = createGame();
  for (const index of [0,3,1,4,2]) game = makeMove(game, index);
  assert.throws(() => makeMove(game, 5), /already over/);
});
test("simple computer chooses only a legal square", () => {
  let game = createGame(); game = makeMove(game, 0);
  assert.equal(chooseRandomMove(game, () => 0), 1);
  assert.equal(chooseRandomMove(game, () => .999), 8);
});
