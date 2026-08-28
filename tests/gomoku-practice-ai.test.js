import test from "node:test";
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { analyzeGomokuMove, chooseGomokuPracticeMove, chooseGomokuPracticeMoveDetailed } from "../src/games/gomoku/practice-ai.js";
import { BLACK, createInitialState, getWinningLine, indexOf, WHITE } from "../src/games/gomoku/rules.js";

function stateWith(stones,turn=WHITE){const board=Array(225).fill(null);for(const [row,column,stone] of stones)board[indexOf(row,column)]=stone;return{...createInitialState(turn),board,moveCount:stones.length};}
function winningAfter(state,move,stone){const board=[...state.board];board[indexOf(move.row,move.column)]=stone;return getWinningLine(board,move.row,move.column,stone).length>=5;}
function key(move){return`${move.row}:${move.column}`;}

test("levels 5–10 finish immediate wins in every direction",()=>{
  const lines=[Array.from({length:4},(_,i)=>[7,4+i,WHITE]),Array.from({length:4},(_,i)=>[4+i,7,WHITE]),Array.from({length:4},(_,i)=>[4+i,4+i,WHITE]),Array.from({length:4},(_,i)=>[4+i,10-i,WHITE])];
  for(const stones of lines)for(let level=5;level<=10;level+=1){const state=stateWith(stones),move=chooseGomokuPracticeMove(state,level,()=>0);assert.ok(winningAfter(state,move,WHITE),`level ${level} ${key(move)}`);}
});

test("levels 6–10 block immediate wins and level 10 takes the unique rush-four defense",()=>{
  const open=stateWith(Array.from({length:4},(_,i)=>[9,4+i,BLACK]));
  for(let level=6;level<=10;level+=1)assert.ok(new Set(["9:3","9:8"]).has(key(chooseGomokuPracticeMove(open,level,()=>.99))));
  const unique=stateWith([[8,2,WHITE],...Array.from({length:4},(_,i)=>[8,3+i,BLACK])]);
  assert.deepEqual(chooseGomokuPracticeMove(unique,10,()=>.99),{row:8,column:7});
});

test("level 10 blocks horizontal, vertical, and diagonal open threes",()=>{
  const cases=[
    {stones:Array.from({length:3},(_,i)=>[7,5+i,BLACK]),blocks:new Set(["7:4","7:8"])},
    {stones:Array.from({length:3},(_,i)=>[5+i,7,BLACK]),blocks:new Set(["4:7","8:7"])},
    {stones:Array.from({length:3},(_,i)=>[5+i,5+i,BLACK]),blocks:new Set(["4:4","8:8"])},
    {stones:Array.from({length:3},(_,i)=>[5+i,9-i,BLACK]),blocks:new Set(["4:10","8:6"])}
  ];
  for(const item of cases)assert.ok(item.blocks.has(key(chooseGomokuPracticeMove(stateWith(item.stones),10,()=>.99))),JSON.stringify(item.stones));
});

test("pattern analysis distinguishes open, broken, blocked, and edge threes",()=>{
  const open=analyzeGomokuMove(stateWith([[7,5,BLACK],[7,6,BLACK]]).board,{row:7,column:7},BLACK);
  const broken=analyzeGomokuMove(stateWith([[7,5,BLACK],[7,7,BLACK]]).board,{row:7,column:8},BLACK);
  const edge=analyzeGomokuMove(stateWith([[0,0,BLACK],[0,1,BLACK]]).board,{row:0,column:2},BLACK);
  const blocked=analyzeGomokuMove(stateWith([[7,4,WHITE],[7,5,BLACK],[7,6,BLACK]]).board,{row:7,column:7},BLACK);
  assert.equal(open.counts.OPEN_THREE,1);assert.equal(open.counts.BROKEN_THREE,0);
  assert.equal(broken.counts.BROKEN_THREE,1);assert.equal(broken.counts.OPEN_THREE,0);
  assert.equal(edge.counts.OPEN_THREE,0);assert.equal(blocked.counts.OPEN_THREE,0);
});

test("pattern analysis recognizes open two, open four, rush four, and five",()=>{
  const openTwo=analyzeGomokuMove(stateWith([[7,6,BLACK]]).board,{row:7,column:7},BLACK);
  const openFour=analyzeGomokuMove(stateWith([[7,5,BLACK],[7,6,BLACK],[7,7,BLACK]]).board,{row:7,column:8},BLACK);
  const rushFour=analyzeGomokuMove(stateWith([[7,4,WHITE],[7,5,BLACK],[7,6,BLACK],[7,7,BLACK]]).board,{row:7,column:8},BLACK);
  const five=analyzeGomokuMove(stateWith([[7,4,BLACK],[7,5,BLACK],[7,6,BLACK],[7,7,BLACK]]).board,{row:7,column:8},BLACK);
  assert.equal(openTwo.counts.OPEN_TWO,1);assert.equal(openFour.counts.OPEN_FOUR,1);
  assert.equal(rushFour.counts.RUSH_FOUR,1);assert.equal(five.counts.FIVE,1);
});

test("level 10 creates and blocks a crossing double threat",()=>{
  const computer=stateWith([[7,5,WHITE],[7,6,WHITE],[5,7,WHITE],[6,7,WHITE]]),player=stateWith([[7,5,BLACK],[7,6,BLACK],[5,7,BLACK],[6,7,BLACK]]);
  assert.deepEqual(chooseGomokuPracticeMove(computer,10,()=>.99,{nodeBudget:600,timeBudgetMs:1000,now:()=>0}),{row:7,column:7});
  assert.deepEqual(chooseGomokuPracticeMove(player,10,()=>.99,{nodeBudget:600,timeBudgetMs:1000,now:()=>0}),{row:7,column:7});
  const threat=analyzeGomokuMove(computer.board,{row:7,column:7},WHITE);assert.equal(threat.doubleThreat,true);assert.equal(threat.counts.OPEN_THREE,2);
});

test("an unavoidable double win still returns the strongest legal response",()=>{
  const state=stateWith([[7,3,BLACK],[7,4,BLACK],[7,5,BLACK],[7,6,BLACK],[3,10,BLACK],[4,10,BLACK],[5,10,BLACK],[6,10,BLACK]]);
  const move=chooseGomokuPracticeMove(state,10,()=>0);assert.ok(move);assert.equal(state.board[indexOf(move.row,move.column)],null);
});

test("difficulty keeps low-level mistakes while level 10 deterministically stops a double-threat point",()=>{
  const state=stateWith([[7,5,BLACK],[7,6,BLACK],[5,7,BLACK],[6,7,BLACK]]);
  const low=chooseGomokuPracticeMove(state,1,()=>.99),medium=chooseGomokuPracticeMove(state,5,()=>.99),expertA=chooseGomokuPracticeMove(state,10,()=>.2,{nodeBudget:400,timeBudgetMs:1000,now:()=>0}),expertB=chooseGomokuPracticeMove(state,10,()=>.2,{nodeBudget:400,timeBudgetMs:1000,now:()=>0});
  assert.notEqual(key(low),"7:7");assert.notEqual(key(medium),"7:7");assert.deepEqual(expertA,{row:7,column:7});assert.deepEqual(expertB,expertA);
});

test("all levels return legal moves and bounded search has a legal fallback",()=>{
  const stones=[];for(let i=0;i<16;i+=1)stones.push([4+Math.floor(i/4),4+i%4,i%2?BLACK:WHITE]);const state=stateWith(stones);
  for(let level=1;level<=10;level+=1){const move=chooseGomokuPracticeMove(state,level,()=>.37,{nodeBudget:80,timeBudgetMs:1000,now:()=>0});assert.ok(move);assert.equal(state.board[indexOf(move.row,move.column)],null);}
  const searchable=stateWith([[7,7,BLACK],[8,8,WHITE]]);let tick=0;const bounded=chooseGomokuPracticeMoveDetailed(searchable,10,()=>0,{nodeBudget:12,timeBudgetMs:1,now:()=>tick++});
  assert.ok(bounded.move);assert.ok(bounded.nodes<=12);assert.equal(bounded.timedOut,true);assert.equal(searchable.board[indexOf(bounded.move.row,bounded.move.column)],null);
});

test("typical level 10 middle-game search stays within its phone-oriented budget",()=>{
  const stones=[];for(let i=0;i<18;i+=1)stones.push([4+Math.floor(i/6),4+i%6,i%2?BLACK:WHITE]);const state=stateWith(stones),started=performance.now(),result=chooseGomokuPracticeMoveDetailed(state,10,()=>.4),elapsed=performance.now()-started;
  assert.ok(result.nodes<=1800);assert.ok(elapsed<500,`${elapsed.toFixed(1)}ms`);assert.equal(state.board[indexOf(result.move.row,result.move.column)],null);
});

test("practice AI remains pure and task cancellation stays outside online play",async()=>{
  const ai=await readFile("src/games/gomoku/practice-ai.js","utf8"),ui=await readFile("src/emulator-app.js","utf8"),service=await readFile("src/services/firebase-room-service.js","utf8");
  assert.doesNotMatch(ai,/\b(?:window|document|sessionStorage|firebase|Firestore)\b/);
  assert.match(ui,/generation!==waitingComputerGeneration\|\|!waitingPractice\|\|waitingPracticeGameType!=="gomoku"/);
  assert.doesNotMatch(service,/chooseGomokuPracticeMove/);
});
