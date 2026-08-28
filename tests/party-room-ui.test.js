import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createInitialState } from "../src/games/gomoku/rules.js";
import { renderGomokuBoard } from "../src/games/gomoku/ui.js";

test("Party Lobby exposes host-controlled game cards separately from start",async()=>{
  const source=await readFile("src/emulator-app.js","utf8"),registry=await readFile("src/games/registry.js","utf8"),combined=source+registry;
  for(const text of ["CHOOSE THE NEXT GAME","TIC-TAC-TOE","GOMOKU","3×3 · QUICK STRATEGY","15×15 · CONNECT FIVE","SELECTED"])assert.ok(combined.includes(text));
  assert.match(source,/data-fb-action="select-game"/);assert.match(source,/data-fb-action="start"/);
});

test("Gomoku board renders 225 accessible intersections and keeps suggestion separate from move",()=>{
  const html=renderGomokuBoard({state:createInitialState(),canSuggest:true,zoom:1});
  assert.equal((html.match(/role="gridcell"/g)||[]).length,225);assert.match(html,/Row 8, column 8, empty/);assert.match(html,/data-fb-action="suggest-gomoku"/);assert.doesNotMatch(html,/data-fb-action="gomoku-cell"/);
});

test("Gomoku phone controls and non-color status markers remain in normal flow",async()=>{
  const source=await readFile("src/emulator-app.js","utf8"),css=await readFile("styles/app.css","utf8");
  for(const text of ["BLACK TO MOVE","WHITE TO MOVE","ZOOM IN","ZOOM OUT","CENTER BOARD","NO FORBIDDEN-MOVE RULES"])assert.ok(source.includes(text));
  assert.match(css,/\.gomoku-viewport/);assert.match(css,/\.gomoku-point\.last-move/);assert.match(css,/\.gomoku-point\.winner/);assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(source,/gomokuTarget\.click\(\)/);assert.match(source,/ArrowLeft:\[0,-1\]/);
});
