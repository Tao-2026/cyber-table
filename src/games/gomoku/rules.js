export const BOARD_SIZE = 15;
export const WIN_LENGTH = 5;
export const BLACK = "black";
export const WHITE = "white";
const DIRECTIONS = Object.freeze([[0,1],[1,0],[1,1],[1,-1]]);

export function indexOf(row, column) { return row * BOARD_SIZE + column; }
export function coordinatesOf(index) { return { row: Math.floor(index / BOARD_SIZE), column: index % BOARD_SIZE }; }
export function inBounds(row, column) { return Number.isInteger(row) && Number.isInteger(column) && row >= 0 && row < BOARD_SIZE && column >= 0 && column < BOARD_SIZE; }

export function createInitialState(firstTurn = BLACK) {
  if (![BLACK, WHITE].includes(firstTurn)) throw new TypeError("Invalid first stone");
  return { board: Array(BOARD_SIZE * BOARD_SIZE).fill(null), currentTurn: firstTurn, status: "playing", winner: null, winningLine: [], moveCount: 0, lastMove: null };
}

export function stateFromMoves(moves = []) {
  let state = createInitialState();
  for (const move of [...moves].sort((a,b) => a.moveNumber - b.moveNumber)) state = applyMove(state, move.row, move.column, move.stone);
  return state;
}

export function getLegalMoves(state) {
  return state.status === "playing" ? state.board.flatMap((stone,index) => stone === null ? [coordinatesOf(index)] : []) : [];
}

export function getWinningLine(board, row, column, stone) {
  if (!inBounds(row,column) || board[indexOf(row,column)] !== stone) return [];
  for (const [dr,dc] of DIRECTIONS) {
    const line = [{ row, column }];
    for (const sign of [-1,1]) {
      let r = row + dr * sign, c = column + dc * sign;
      const side = [];
      while (inBounds(r,c) && board[indexOf(r,c)] === stone) { side.push({ row:r, column:c }); r += dr * sign; c += dc * sign; }
      if (sign < 0) line.unshift(...side.reverse()); else line.push(...side);
    }
    if (line.length >= WIN_LENGTH) return line;
  }
  return [];
}

export function applyMove(state, row, column, forcedStone = state.currentTurn) {
  if (state.status !== "playing") throw new Error("Game is already over");
  if (!inBounds(row,column)) throw new RangeError("Invalid intersection");
  if (forcedStone !== state.currentTurn) throw new Error("Wrong stone");
  const index = indexOf(row,column);
  if (state.board[index] !== null) throw new Error("Intersection is occupied");
  const board = [...state.board]; board[index] = forcedStone;
  const winningLine = getWinningLine(board,row,column,forcedStone);
  const moveCount = state.moveCount + 1;
  const status = winningLine.length >= WIN_LENGTH ? "won" : moveCount === board.length ? "draw" : "playing";
  return { board, currentTurn: status === "playing" ? (forcedStone === BLACK ? WHITE : BLACK) : forcedStone, status, winner: status === "won" ? forcedStone : null, winningLine, moveCount, lastMove: { row, column, stone: forcedStone } };
}

export function validateState(state) {
  return Boolean(state && Array.isArray(state.board) && state.board.length === 225 && state.board.every(cell => cell === null || cell === BLACK || cell === WHITE) && [BLACK,WHITE].includes(state.currentTurn) && ["playing","won","draw"].includes(state.status));
}
