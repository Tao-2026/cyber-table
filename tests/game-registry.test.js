import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GAME_TYPE, gameDefinition, GAMES, GAME_TYPES, normalizeGameType } from "../src/games/registry.js";
test("registry exposes Tic-Tac-Toe and Gomoku with a legacy-safe default",()=>{assert.deepEqual(GAME_TYPES,["tic-tac-toe","gomoku"]);assert.equal(DEFAULT_GAME_TYPE,"tic-tac-toe");assert.equal(normalizeGameType(undefined),"tic-tac-toe");assert.equal(gameDefinition("gomoku").boardSize,15);for(const game of Object.values(GAMES))for(const method of ["createInitialState","getLegalMoves","applyMove","isDraw","getWinningLine","validateState"])assert.equal(typeof game[method],"function",`${game.id}.${method}`);});
