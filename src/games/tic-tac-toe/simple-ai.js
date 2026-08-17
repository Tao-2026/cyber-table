import { legalMoves } from "./rules.js";

export function chooseRandomMove(game, random = Math.random) {
  const moves = legalMoves(game);
  if (moves.length === 0) return null;
  const value = random();
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), 0.999999999) : 0;
  return moves[Math.floor(safeValue * moves.length)];
}
