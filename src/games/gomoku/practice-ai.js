import { BLACK, BOARD_SIZE, coordinatesOf, getWinningLine, indexOf, WHITE } from "./rules.js";

export const GOMOKU_PATTERN_WEIGHTS=Object.freeze({
  FIVE:1_000_000,OPEN_FOUR:100_000,RUSH_FOUR:20_000,DOUBLE_THREAT:15_000,
  OPEN_THREE:4_000,BROKEN_THREE:2_000,OPEN_TWO:200
});
const DIRECTIONS=Object.freeze([[0,1],[1,0],[1,1],[1,-1]]);

function other(stone){return stone===BLACK?WHITE:BLACK;}
function inBounds(row,column){return row>=0&&row<BOARD_SIZE&&column>=0&&column<BOARD_SIZE;}
function safeRandom(random){const value=random();return Number.isFinite(value)?Math.min(Math.max(value,0),.999999999):0;}
function choice(items,random){return items.length?items[Math.floor(safeRandom(random)*items.length)]:null;}
function compareMoves(a,b){return b.score-a.score||a.move.row-b.move.row||a.move.column-b.move.column;}
function compareCoordinates(a,b){return a.move.row-b.move.row||a.move.column-b.move.column;}
function contiguous(board,row,column,stone,dr,dc){
  let before=0,after=0;
  for(let step=1;inBounds(row-dr*step,column-dc*step)&&board[indexOf(row-dr*step,column-dc*step)]===stone;step+=1)before+=1;
  for(let step=1;inBounds(row+dr*step,column+dc*step)&&board[indexOf(row+dr*step,column+dc*step)]===stone;step+=1)after+=1;
  const leftRow=row-dr*(before+1),leftColumn=column-dc*(before+1),rightRow=row+dr*(after+1),rightColumn=column+dc*(after+1);
  const openEnds=Number(inBounds(leftRow,leftColumn)&&board[indexOf(leftRow,leftColumn)]===null)+Number(inBounds(rightRow,rightColumn)&&board[indexOf(rightRow,rightColumn)]===null);
  return{length:before+1+after,openEnds};
}
function lineEmpties(board,row,column,dr,dc,radius=5){
  const result=[];
  for(let offset=-radius;offset<=radius;offset+=1){const r=row+dr*offset,c=column+dc*offset;if(inBounds(r,c)&&board[indexOf(r,c)]===null)result.push({row:r,column:c});}
  return result;
}
function winningPoints(board,row,column,stone,dr,dc){
  const result=[];
  for(const move of lineEmpties(board,row,column,dr,dc,4)){
    const at=indexOf(move.row,move.column);board[at]=stone;
    if(contiguous(board,move.row,move.column,stone,dr,dc).length>=5)result.push(move);
    board[at]=null;
  }
  return result;
}
function directionPattern(board,row,column,stone,dr,dc){
  const run=contiguous(board,row,column,stone,dr,dc);
  if(run.length>=5)return"FIVE";
  const wins=winningPoints(board,row,column,stone,dr,dc);
  if(wins.length>=2)return"OPEN_FOUR";
  if(wins.length===1)return"RUSH_FOUR";
  let openFourBuilders=0;
  for(const move of lineEmpties(board,row,column,dr,dc,4)){
    const at=indexOf(move.row,move.column);board[at]=stone;
    if(winningPoints(board,row,column,stone,dr,dc).length>=2)openFourBuilders+=1;
    board[at]=null;
  }
  if(openFourBuilders>0){
    if(run.length>=3&&run.openEnds===2)return"OPEN_THREE";
    return"BROKEN_THREE";
  }
  if(run.length===2&&run.openEnds===2)return"OPEN_TWO";
  return null;
}

export function analyzeGomokuMove(board,move,stone){
  if(!move||!inBounds(move.row,move.column)||board[indexOf(move.row,move.column)]!==null)return null;
  const placed=[...board];placed[indexOf(move.row,move.column)]=stone;
  const patterns=DIRECTIONS.map(([dr,dc])=>directionPattern(placed,move.row,move.column,stone,dr,dc)).filter(Boolean);
  const counts=Object.fromEntries(Object.keys(GOMOKU_PATTERN_WEIGHTS).map(key=>[key,patterns.filter(value=>value===key).length]));
  const fourThreats=counts.OPEN_FOUR+counts.RUSH_FOUR,threeThreats=counts.OPEN_THREE+counts.BROKEN_THREE;
  const doubleThreat=fourThreats>=2||counts.OPEN_THREE>=2||(fourThreats>=1&&threeThreats>=1);
  counts.DOUBLE_THREAT=doubleThreat?1:0;
  const center=14-Math.abs(move.row-7)-Math.abs(move.column-7);
  const score=Object.entries(GOMOKU_PATTERN_WEIGHTS).reduce((sum,[name,weight])=>sum+(counts[name]||0)*weight,0)+center;
  return{move,patterns,counts,doubleThreat,score,winningLine:getWinningLine(placed,move.row,move.column,stone)};
}

function candidateMoves(board,radius=2){
  const occupied=[];board.forEach((stone,index)=>{if(stone)occupied.push(coordinatesOf(index));});
  if(!occupied.length)return[{row:7,column:7}];
  const cells=new Map();
  for(const origin of occupied)for(let dr=-radius;dr<=radius;dr+=1)for(let dc=-radius;dc<=radius;dc+=1){
    const row=origin.row+dr,column=origin.column+dc;if(inBounds(row,column)&&board[indexOf(row,column)]===null)cells.set(`${row}:${column}`,{row,column});
  }
  return[...cells.values()];
}
function rankCandidates(board,stone,defenseWeight=1.1){
  const opponent=other(stone);
  return candidateMoves(board,2).map(move=>{
    const attack=analyzeGomokuMove(board,move,stone),defense=analyzeGomokuMove(board,move,opponent);
    return{move,attack,defense,ownWin:attack.counts.FIVE>0,opponentWin:defense.counts.FIVE>0,critical:attack.counts.OPEN_FOUR>0||attack.counts.RUSH_FOUR>0||attack.doubleThreat||defense.counts.OPEN_FOUR>0||defense.counts.RUSH_FOUR>0||defense.doubleThreat,score:attack.score+defense.score*defenseWeight};
  }).sort(compareMoves);
}
function limitedCandidates(ranked,limit){
  const selected=new Map();
  for(const item of ranked.filter(item=>item.ownWin||item.opponentWin||item.critical))selected.set(`${item.move.row}:${item.move.column}`,item);
  for(const item of ranked.slice(0,limit))selected.set(`${item.move.row}:${item.move.column}`,item);
  return[...selected.values()].sort(compareMoves);
}
function positionScore(board,rootStone){
  const root=rankCandidates(board,rootStone,0).slice(0,6),opponent=rankCandidates(board,other(rootStone),0).slice(0,6);
  const sumTop=items=>items.reduce((sum,item,index)=>sum+item.attack.score/(index+1),0);
  return sumTop(root)-sumTop(opponent)*1.12;
}
function place(board,move,stone){const next=[...board];next[indexOf(move.row,move.column)]=stone;return next;}
function exhausted(context){return context.nodes>=context.nodeBudget||context.now()-context.startedAt>=context.timeBudgetMs;}
function search(board,side,rootStone,depth,context,alpha,beta){
  if(depth===0||exhausted(context))return positionScore(board,rootStone);
  const ranked=rankCandidates(board,side,side===rootStone?1.08:1.2),moves=limitedCandidates(ranked,context.branchLimit);
  if(!moves.length)return 0;
  const maximizing=side===rootStone;let best=maximizing?-Infinity:Infinity;
  for(const item of moves){
    if(exhausted(context))break;context.nodes+=1;
    let value;
    if(item.ownWin)value=(maximizing?1:-1)*(GOMOKU_PATTERN_WEIGHTS.FIVE+depth*10_000);
    else value=search(place(board,item.move,side),other(side),rootStone,depth-1,context,alpha,beta)+(maximizing?1:-1)*item.score*.02;
    if(maximizing){best=Math.max(best,value);alpha=Math.max(alpha,best);}else{best=Math.min(best,value);beta=Math.min(beta,best);}
    if(beta<=alpha)break;
  }
  return Number.isFinite(best)?best:positionScore(board,rootStone);
}
function optionsFor(level,budgetOrOptions){
  const supplied=typeof budgetOrOptions==="number"?{nodeBudget:budgetOrOptions}:budgetOrOptions||{};
  return{nodeBudget:Math.max(1,supplied.nodeBudget??(level>=10?1800:level>=9?1200:level>=7?500:200)),timeBudgetMs:Math.max(1,supplied.timeBudgetMs??(level>=10?220:level>=9?180:120)),now:supplied.now||Date.now,branchLimit:Math.max(2,supplied.branchLimit??(level>=10?10:level>=9?8:6))};
}

export function chooseGomokuPracticeMoveDetailed(state,level=5,random=Math.random,budgetOrOptions){
  level=Math.min(10,Math.max(1,Number(level)||5));
  const board=state.board,stone=state.currentTurn,opponent=other(stone),ranked=rankCandidates(board,stone,level>=9?1.2:1.08);
  if(!ranked.length)return{move:null,nodes:0,timedOut:false,elapsedMs:0};
  if(level<=2)return{move:choice(ranked.map(item=>item.move),random),nodes:0,timedOut:false,elapsedMs:0};
  const wins=ranked.filter(item=>item.ownWin).sort(compareCoordinates);if(wins.length)return{move:wins[0].move,nodes:0,timedOut:false,elapsedMs:0};
  const blocks=ranked.filter(item=>item.opponentWin).sort(compareCoordinates);
  if(blocks.length&&(level>=5||safeRandom(random)<(level===4?.8:.55)))return{move:blocks[0].move,nodes:0,timedOut:false,elapsedMs:0};
  if(level<=4){const pool=ranked.slice(0,Math.min(10,ranked.length));return{move:choice(pool.map(item=>item.move),random),nodes:0,timedOut:false,elapsedMs:0};}
  if(level<=6){const pool=ranked.slice(0,level===6?2:4);return{move:choice(pool.map(item=>item.move),random),nodes:0,timedOut:false,elapsedMs:0};}

  const ownForcing=ranked.filter(item=>item.attack.counts.OPEN_FOUR>0||item.attack.doubleThreat);
  const fatalDefense=ranked.filter(item=>item.defense.counts.OPEN_FOUR>0||item.defense.doubleThreat);
  const rootPool=ownForcing.length?ownForcing:fatalDefense.length?fatalDefense:limitedCandidates(ranked,level>=10?12:level>=9?10:8);
  const options=optionsFor(level,budgetOrOptions),context={...options,nodes:0,startedAt:options.now()};
  let best=rootPool[0],bestValue=-Infinity;
  for(const item of rootPool){
    if(exhausted(context))break;context.nodes+=1;
    const value=item.ownWin?GOMOKU_PATTERN_WEIGHTS.FIVE:search(place(board,item.move,stone),opponent,stone,level>=9?2:1,context,-Infinity,Infinity)+item.score*.04;
    if(value>bestValue){best=item;bestValue=value;}
  }
  const elapsedMs=Math.max(0,options.now()-context.startedAt);
  const timedOut=context.nodes>=context.nodeBudget||elapsedMs>=context.timeBudgetMs;
  return{move:(timedOut?rootPool[0]?.move:best?.move)||ranked[0].move,nodes:context.nodes,timedOut,elapsedMs};
}

export function chooseGomokuPracticeMove(state,level=5,random=Math.random,budgetOrOptions){return chooseGomokuPracticeMoveDetailed(state,level,random,budgetOrOptions).move;}
