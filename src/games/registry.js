import * as ticTacToeRules from "./tic-tac-toe/rules.js";
import { renderTicTacToeBoard } from "./tic-tac-toe/ui.js";
import * as gomokuRules from "./gomoku/rules.js";
import { renderGomokuBoard } from "./gomoku/ui.js";

export const DEFAULT_GAME_TYPE="tic-tac-toe";
export const GAME_TYPES=Object.freeze([DEFAULT_GAME_TYPE,"gomoku"]);
export const GAMES=Object.freeze({
  "tic-tac-toe":Object.freeze({id:"tic-tac-toe",name:"TIC-TAC-TOE",description:"3×3 · QUICK STRATEGY",duration:"About 1–3 minutes per round",boardSize:3,winLength:3,createInitialState:ticTacToeRules.createGame,getLegalMoves:ticTacToeRules.legalMoves,applyMove:ticTacToeRules.makeMove,detectWinner:ticTacToeRules.evaluateBoard,isDraw:state=>state.status==="draw",getWinningLine:state=>state.winningLine||[],validateState:state=>Array.isArray(state?.board)&&state.board.length===9,rules:ticTacToeRules,renderBoard:renderTicTacToeBoard}),
  gomoku:Object.freeze({id:"gomoku",name:"GOMOKU",description:"15×15 · CONNECT FIVE",duration:"About 5–15 minutes per round",boardSize:15,winLength:5,createInitialState:gomokuRules.createInitialState,getLegalMoves:gomokuRules.getLegalMoves,applyMove:gomokuRules.applyMove,detectWinner:gomokuRules.getWinningLine,isDraw:state=>state.status==="draw",getWinningLine:state=>state.winningLine||[],validateState:gomokuRules.validateState,rules:gomokuRules,renderBoard:renderGomokuBoard})
});
export function normalizeGameType(value){return GAME_TYPES.includes(value)?value:DEFAULT_GAME_TYPE;}
export function gameDefinition(value){return GAMES[normalizeGameType(value)];}
