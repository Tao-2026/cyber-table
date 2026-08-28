import { applyMove, BLACK, BOARD_SIZE, coordinatesOf, getLegalMoves, indexOf, WHITE } from "./rules.js";

function safeRandom(random) { const value = random(); return Number.isFinite(value) ? Math.min(Math.max(value,0),.999999999) : 0; }
function choice(items, random) { return items.length ? items[Math.floor(safeRandom(random) * items.length)] : null; }
function immediate(state, stone) {
  for (const move of candidateMoves(state, 2)) { try { if (applyMove({ ...state, currentTurn: stone }, move.row, move.column, stone).winner === stone) return move; } catch {} }
  return null;
}
function candidateMoves(state, radius = 2) {
  if (state.moveCount === 0) return [{ row:7, column:7 }];
  const cells = new Map();
  state.board.forEach((stone,index) => { if (!stone) return; const {row,column}=coordinatesOf(index); for(let dr=-radius;dr<=radius;dr++) for(let dc=-radius;dc<=radius;dc++){const r=row+dr,c=column+dc;if(r>=0&&r<BOARD_SIZE&&c>=0&&c<BOARD_SIZE&&state.board[indexOf(r,c)]===null) cells.set(`${r}:${c}`,{row:r,column:c});} });
  return [...cells.values()];
}
function scoreMove(state, move, stone) {
  const opponent = stone === BLACK ? WHITE : BLACK;
  const center = 14 - Math.abs(move.row-7) - Math.abs(move.column-7);
  let attack=0,defense=0;
  for(const [dr,dc] of [[0,1],[1,0],[1,1],[1,-1]]) for(const sign of [-1,1]) for(let step=1;step<=4;step++) { const r=move.row+dr*step*sign,c=move.column+dc*step*sign;if(r<0||r>=15||c<0||c>=15)break;const value=state.board[indexOf(r,c)];if(value===stone)attack+=5-step;else if(value===opponent)defense+=5-step;else break; }
  return attack * 2 + defense * 1.7 + center * .2;
}
export function chooseGomokuPracticeMove(state, level=5, random=Math.random, nodeBudget=500) {
  const legal=getLegalMoves(state); if(!legal.length) return null;
  const candidates=candidateMoves(state, level<=2?1:2).slice(0,Math.max(1,nodeBudget));
  if(level<=2) return choice(candidates,random);
  const win=immediate(state,state.currentTurn); if(win && (level>=5 || safeRandom(random)<.65)) return win;
  const opponent=state.currentTurn===BLACK?WHITE:BLACK; const block=immediate({ ...state,currentTurn:opponent },opponent); if(block && (level>=5 || safeRandom(random)<.45)) return block;
  const ranked=candidates.map(move=>({move,score:scoreMove(state,move,state.currentTurn)})).sort((a,b)=>b.score-a.score);
  const pool=level>=9?ranked.slice(0,2):level>=7?ranked.slice(0,4):ranked.slice(0,Math.min(8,ranked.length));
  return level>=9 ? pool[0]?.move || legal[0] : choice(pool.map(item=>item.move),random) || legal[0];
}
