# Gomoku Firestore Security Design

## Decision

The confirmed Spark-compatible model uses four transactional line projections and has passed the Firebase Emulator integrity, full-board draw, concurrency, and expression-budget gates. It uses no Blaze services, Cloud Functions, Cloud Run, or trusted paid backend. Production remains undeployed until the user explicitly approves deployment.

Each legal move atomically writes:

- one immutable `moves/{moveNumber}` document;
- one 15-cell row projection;
- one 15-cell column projection;
- one padded 15-cell descending-diagonal projection;
- one padded 15-cell ascending-diagonal projection;
- the match counter, turn, last-move metadata, and validated result.

Rules require exactly one null-to-current-stone change in all four projections, verify their deterministic paths from the move coordinates, and inspect the finite runs extending from only the last move. A five-or-more run must become terminal in the same transaction; a draw is accepted only on move 225 when none of those four runs wins. The five-cell stored witness is derived from and checked against the authoritative winning projection, while the UI reconstructs the complete five-or-more visual line from immutable moves.

Concurrent transactions serialize on the match counter, so only one next move can commit. Terminal settlement remains a separate idempotent transaction protected by `scoreApplied`, the secured match result, exact +3/+0 or +1/+1 deltas, and matching series state.

## Rejected first design and why it matters

The first immutable-position design is **not approved for production**. Firestore Emulator rejected the first legal Gomoku move because validating all eight directional run counters exceeded the Rules limit of 1,000 evaluated expressions. Removing those checks would allow a client to continue after a five-in-a-row and later submit a false draw or an opponent win, which could forge Series and Party Score settlement.

The attempted authoritative model used three immutable records:

- `matches/{matchId}/moves/{moveNumber}` records the sequential move.
- `matches/{matchId}/positions/{row_column}` reserves one coordinate exactly once.
- `matches/{matchId}/proofs/result` records a draw or a verifiable five-stone winning segment.

The UI reconstructs the 15×15 board and the complete winning run from immutable moves. A persisted proof needs only one contiguous five-stone segment containing the last move. Therefore a six-or-more line is secure without requiring Rules to read every stone in the complete visual line.

## Rejected move validation

A legal move is one atomic transaction that:

1. Creates the next immutable move number.
2. Creates the deterministic position document for its row and column.
3. Advances only `moveCount`, `currentTurn`, last-move metadata, timestamps, and suggestion-reset fields on the match.

Rules verify authentication, membership, active room/match IDs, current player, assigned stone, bounds `0–14`, exact next move number, matching move/position payloads, and nonexistence of both documents before the transaction. The deterministic position ID prevents two move numbers from occupying one point; the sequential match counter prevents two concurrent moves from succeeding.

## Winner and draw protection attempted

Clients cannot directly write arbitrary `winner`, `winningLine`, series wins, or Party Score.

A win proof contains a direction and exactly five consecutive coordinates including the last move. Rules can verify a claimed five. That is not sufficient by itself: Rules must also force the match to become terminal on the first winning move. Otherwise a malicious client can keep playing and settle a later, incorrect result.

After a valid proof changes the match to terminal, the existing idempotent `scoreApplied` settlement transaction may apply only the current `+3/+0` win or `+1/+1` draw delta, update the matching game-typed series once, and advance the room to `roundOver` or `seriesBreak`.

## Emulator evidence

The added Emulator test used independent authenticated Black, White, and spectator UIDs. Existing Tic-Tac-Toe Rules tests remained green (14 existing checks), but both Gomoku transaction tests failed on the first legal move with:

`Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached.`

This is an integrity blocker, not merely a liveness limitation. No production deployment, tag, release, merge, or Firebase change is permitted from this prototype.

## Confirmed Spark-compatible replacement

Replace per-position eight-ray validation with four transactional line projections:

- one immutable `moves/{moveNumber}` document;
- one 15-cell row document;
- one 15-cell column document;
- one padded 15-cell descending-diagonal document;
- one padded 15-cell ascending-diagonal document;
- the match counter/result document.

Each move atomically changes exactly one null entry to the current player's stone in all four projections. Rules cross-check the four representations and inspect only the four affected lines for a run of five. This avoids a client-replaceable 225-cell board, preserves immutable move history, and makes occupied-point and concurrent-move checks deterministic.

The completed Emulator suite confirms legal moves, turn and role rejection, coordinate bounds, occupied-point rejection, immutable move protection, real five-in-a-row settlement, a 225th-move draw, idempotent scoring, forged-terminal rejection, and concurrent-move serialization without exceeding the Rules expression budget. Three isolated browser sessions also completed Party Lobby selection, a Best-of-3 Gomoku series, spectator approval and suggestion, Black/White swaps, reconnect, a cross-game Tic-Tac-Toe series, and synchronized Party Podium without console errors.

Other alternatives are intentionally not selected:

- Cloud Functions or another trusted server would simplify settlement but violates the no-Blaze/no-paid-service constraint.
- Trusting the host or client result is not secure enough for Party Score.
- Making Gomoku practice-only would avoid formal scoring but would not meet the requested online-game scope.

All local, Emulator, concurrency, and isolated-browser gates now pass. Production deployment remains blocked only on the required separate user confirmation and is not part of this change.
