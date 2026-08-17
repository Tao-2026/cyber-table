export const MARK_X = "X";
export const MARK_O = "O";
export const EMPTY_BOARD = Object.freeze(Array(9).fill(null));

export const WINNING_LINES = Object.freeze([
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6]
]);

export function createGame(firstTurn = MARK_X) {
  if (![MARK_X, MARK_O].includes(firstTurn)) throw new TypeError("Invalid first turn");
  return { board: [...EMPTY_BOARD], currentTurn: firstTurn, status: "playing", winner: null, winningLine: null, moveCount: 0 };
}

export function evaluateBoard(board) {
  if (!Array.isArray(board) || board.length !== 9) throw new TypeError("Board must have nine cells");
  for (const line of WINNING_LINES) {
    const [a, b, c] = line;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return { status: "won", winner: board[a], winningLine: line };
  }
  return board.every(Boolean) ? { status: "draw", winner: null, winningLine: null } : { status: "playing", winner: null, winningLine: null };
}

export function makeMove(game, index) {
  if (game.status !== "playing") throw new Error("Game is already over");
  if (!Number.isInteger(index) || index < 0 || index > 8) throw new RangeError("Invalid cell");
  if (game.board[index] !== null) throw new Error("Cell is occupied");
  const board = [...game.board];
  board[index] = game.currentTurn;
  const result = evaluateBoard(board);
  return {
    board,
    currentTurn: result.status === "playing" ? (game.currentTurn === MARK_X ? MARK_O : MARK_X) : game.currentTurn,
    status: result.status,
    winner: result.winner,
    winningLine: result.winningLine,
    moveCount: game.moveCount + 1
  };
}

export function legalMoves(game) {
  if (game.status !== "playing") return [];
  return game.board.flatMap((cell, index) => cell === null ? [index] : []);
}
