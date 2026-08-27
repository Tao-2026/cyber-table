export const FIRST_PLAYER_MODES = Object.freeze({
  ALTERNATE: "alternate",
  ALWAYS_PLAYER: "always-player",
  ALWAYS_COMPUTER: "always-computer"
});

export const PRACTICE_STARTERS = Object.freeze({ PLAYER: "X", COMPUTER: "O" });

const VALID_MODES = new Set(Object.values(FIRST_PLAYER_MODES));

export function restoreFirstPlayerState(saved = {}) {
  return Object.freeze({
    firstPlayerMode: VALID_MODES.has(saved.firstPlayerMode) ? saved.firstPlayerMode : FIRST_PLAYER_MODES.ALTERNATE,
    nextAlternateStarter: saved.nextAlternateStarter === PRACTICE_STARTERS.COMPUTER ? PRACTICE_STARTERS.COMPUTER : PRACTICE_STARTERS.PLAYER,
    currentStarter: [PRACTICE_STARTERS.PLAYER, PRACTICE_STARTERS.COMPUTER].includes(saved.currentStarter) ? saved.currentStarter : null,
    practiceRoundNumber: Number.isInteger(saved.practiceRoundNumber) && saved.practiceRoundNumber > 0 ? saved.practiceRoundNumber : 1,
    currentRoundCompleted: Boolean(saved.currentRoundCompleted)
  });
}

export function starterForMode(state, mode = state.firstPlayerMode) {
  if (mode === FIRST_PLAYER_MODES.ALWAYS_PLAYER) return PRACTICE_STARTERS.PLAYER;
  if (mode === FIRST_PLAYER_MODES.ALWAYS_COMPUTER) return PRACTICE_STARTERS.COMPUTER;
  return state.nextAlternateStarter;
}

export function beginPracticeRound(state) {
  const restored = restoreFirstPlayerState(state);
  return Object.freeze({ ...restored, currentStarter: starterForMode(restored), currentRoundCompleted: false });
}

export function completePracticeRound(state) {
  const restored = restoreFirstPlayerState(state);
  if (restored.currentRoundCompleted || !restored.currentStarter) return restored;
  const nextAlternateStarter = restored.firstPlayerMode === FIRST_PLAYER_MODES.ALTERNATE
    ? (restored.currentStarter === PRACTICE_STARTERS.PLAYER ? PRACTICE_STARTERS.COMPUTER : PRACTICE_STARTERS.PLAYER)
    : restored.nextAlternateStarter;
  return Object.freeze({ ...restored, nextAlternateStarter, practiceRoundNumber: restored.practiceRoundNumber + 1, currentRoundCompleted: true });
}

export function changeFirstPlayerMode(state, mode, boardIsEmpty) {
  if (!VALID_MODES.has(mode)) throw new TypeError("Invalid first player mode");
  const restored = restoreFirstPlayerState(state);
  return Object.freeze({
    ...restored,
    firstPlayerMode: mode,
    currentStarter: boardIsEmpty ? starterForMode(restored, mode) : restored.currentStarter,
    currentRoundCompleted: boardIsEmpty ? false : restored.currentRoundCompleted
  });
}
