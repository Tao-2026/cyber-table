import test from "node:test";
import assert from "node:assert/strict";
import { beginPracticeRound, changeFirstPlayerMode, completePracticeRound, FIRST_PLAYER_MODES, restoreFirstPlayerState, starterForMode } from "../src/games/tic-tac-toe/practice-first-player.js";

test("new tabs alternate from player to computer to player after completed games", () => {
  let state = beginPracticeRound(restoreFirstPlayerState());
  assert.equal(state.currentStarter, "X");
  state = beginPracticeRound(completePracticeRound(state));
  assert.equal(state.currentStarter, "O");
  state = beginPracticeRound(completePracticeRound(state));
  assert.equal(state.currentStarter, "X");
});

test("all terminal results advance once while incomplete and duplicate completion do not", () => {
  for (const result of ["player-win", "computer-win", "draw"]) {
    const started = beginPracticeRound(restoreFirstPlayerState());
    assert.equal(started.nextAlternateStarter, "X", result);
    const finished = completePracticeRound(started);
    assert.equal(finished.nextAlternateStarter, "O", result);
    assert.deepEqual(completePracticeRound(finished), finished, result);
  }
  const incomplete = beginPracticeRound(restoreFirstPlayerState());
  assert.equal(beginPracticeRound(incomplete).nextAlternateStarter, "X");
});

test("fixed modes keep the selected starter regardless of previous results", () => {
  for (const [mode, starter] of [[FIRST_PLAYER_MODES.ALWAYS_PLAYER,"X"],[FIRST_PLAYER_MODES.ALWAYS_COMPUTER,"O"]]) {
    let state = changeFirstPlayerMode(restoreFirstPlayerState(), mode, true);
    for (let round = 0; round < 3; round += 1) {
      state = beginPracticeRound(state); assert.equal(state.currentStarter, starter);
      state = completePracticeRound(state);
    }
  }
});

test("empty-board mode changes apply immediately and played boards wait for the next game", () => {
  const started = beginPracticeRound(restoreFirstPlayerState());
  const immediate = changeFirstPlayerMode(started, FIRST_PLAYER_MODES.ALWAYS_COMPUTER, true);
  assert.equal(immediate.currentStarter, "O");
  const deferred = changeFirstPlayerMode(started, FIRST_PLAYER_MODES.ALWAYS_COMPUTER, false);
  assert.equal(deferred.currentStarter, "X");
  assert.equal(starterForMode(deferred), "O");
});

test("saved mode, alternate progress and round restore without browser dependencies", async () => {
  const restored = restoreFirstPlayerState({ firstPlayerMode: FIRST_PLAYER_MODES.ALTERNATE, nextAlternateStarter: "O", currentStarter: "X", practiceRoundNumber: 4, currentRoundCompleted: true });
  assert.equal(restored.nextAlternateStarter, "O");
  assert.equal(restored.practiceRoundNumber, 4);
  const source = await (await import("node:fs/promises")).readFile("src/games/tic-tac-toe/practice-first-player.js", "utf8");
  assert.doesNotMatch(source, /\b(?:window|document|sessionStorage|firebase|Firestore)\b/);
});
