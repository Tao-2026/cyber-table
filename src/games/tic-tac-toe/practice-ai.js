import { evaluateBoard } from "./rules.js";

export const PRACTICE_DIFFICULTY_DEFAULT = 5;
export const PRACTICE_DIFFICULTY_MIN = 1;
export const PRACTICE_DIFFICULTY_MAX = 10;

const CORNERS = Object.freeze([0, 2, 6, 8]);

export function normalizePracticeDifficulty(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= PRACTICE_DIFFICULTY_MIN && parsed <= PRACTICE_DIFFICULTY_MAX
    ? parsed
    : PRACTICE_DIFFICULTY_DEFAULT;
}

export function difficultyName(level) {
  const value = normalizePracticeDifficulty(level);
  if (value <= 2) return "VERY EASY";
  if (value <= 4) return "EASY";
  if (value <= 6) return "CHALLENGING";
  if (value <= 8) return "HARD";
  return "EXPERT";
}

function safeRandom(random) {
  const value = random();
  return Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999) : 0;
}

function emptyCells(board) {
  return board.flatMap((cell, index) => cell === null ? [index] : []);
}

function randomChoice(moves, random) {
  return moves.length ? moves[Math.floor(safeRandom(random) * moves.length)] : null;
}

function winningMove(board, mark) {
  for (const cell of emptyCells(board)) {
    const candidate = [...board]; candidate[cell] = mark;
    if (evaluateBoard(candidate).winner === mark) return cell;
  }
  return null;
}

function minimax(board, maximizing, depthLimit = Infinity, depth = 0) {
  const result = evaluateBoard(board);
  if (result.status === "won") return result.winner === "O" ? 10 - depth : depth - 10;
  if (result.status === "draw" || depth >= depthLimit) return 0;
  const scores = emptyCells(board).map(cell => {
    const candidate = [...board]; candidate[cell] = maximizing ? "O" : "X";
    return minimax(candidate, !maximizing, depthLimit, depth + 1);
  });
  return maximizing ? Math.max(...scores) : Math.min(...scores);
}

function rankedMoves(board, depthLimit = Infinity) {
  return emptyCells(board).map(cell => {
    const candidate = [...board]; candidate[cell] = "O";
    return { cell, score: minimax(candidate, false, depthLimit, 1) };
  }).sort((a, b) => b.score - a.score || a.cell - b.cell);
}

export function choosePracticeMove(game, level = PRACTICE_DIFFICULTY_DEFAULT, random = Math.random) {
  const moves = emptyCells(game.board);
  if (game.status !== "playing" || moves.length === 0) return null;
  const difficulty = normalizePracticeDifficulty(level);
  const win = winningMove(game.board, "O");
  const block = winningMove(game.board, "X");

  if (difficulty === 1) return randomChoice(moves, random);
  if (difficulty <= 3) {
    if (win !== null && safeRandom(random) < (difficulty === 2 ? 0.45 : 0.7)) return win;
    if (block !== null && safeRandom(random) < (difficulty === 2 ? 0.15 : 0.3)) return block;
    return randomChoice(moves, random);
  }
  if (difficulty <= 6) {
    if (win !== null) return win;
    if (block !== null && safeRandom(random) < (difficulty === 4 ? 0.55 : difficulty === 5 ? 0.8 : 1)) return block;
    if (difficulty === 6 && game.board[4] === null) return 4;
    const corners = CORNERS.filter(cell => game.board[cell] === null);
    return corners.length && safeRandom(random) < (difficulty === 4 ? 0.25 : 0.6) ? randomChoice(corners, random) : randomChoice(moves, random);
  }

  if (win !== null) return win;
  if (block !== null) return block;
  const ranked = rankedMoves(game.board, difficulty <= 8 ? 4 : Infinity);
  if (difficulty === 10 || ranked.length === 1) return ranked[0].cell;
  const mistakeChance = difficulty === 7 ? 0.22 : difficulty === 8 ? 0.1 : 0.025;
  if (safeRandom(random) < mistakeChance) return randomChoice(ranked.slice(1).map(item => item.cell), random) ?? ranked[0].cell;
  return ranked[0].cell;
}
