export const SERIES_PRESETS = Object.freeze({
  single: Object.freeze({ targetWins: 1, maxRounds: 1, label: "SINGLE ROUND" }),
  bestOf3: Object.freeze({ targetWins: 2, maxRounds: 5, label: "BEST OF 3" }),
  bestOf5: Object.freeze({ targetWins: 3, maxRounds: 9, label: "BEST OF 5" })
});

export function presetForTarget(targetWins) {
  return Object.values(SERIES_PRESETS).find(item => item.targetWins === targetWins) || SERIES_PRESETS.bestOf3;
}

export function createSeries(playerA, playerB, targetWins = 2, roundNumber = 0) {
  const preset = presetForTarget(targetWins);
  return {
    playerA, playerB, winsByPlayer: { [playerA]: 0, [playerB]: 0 }, roundsPlayed: 0,
    targetWins: preset.targetWins, maxRounds: preset.maxRounds, status: "playing",
    winnerId: null, pairingRoundNumber: roundNumber
  };
}

export function settleSeriesRound(series, winnerId = null) {
  if (series.status !== "playing") throw new Error("Series is already over");
  const wins = { ...series.winsByPlayer };
  if (winnerId) {
    if (![series.playerA, series.playerB].includes(winnerId)) throw new Error("Winner is not in this series");
    wins[winnerId] += 1;
  }
  const roundsPlayed = series.roundsPlayed + 1;
  const targetWinner = [series.playerA, series.playerB].find(id => wins[id] >= series.targetWins) || null;
  const capped = roundsPlayed >= series.maxRounds;
  let status = "playing", resolvedWinner = null;
  if (targetWinner) { status = "won"; resolvedWinner = targetWinner; }
  else if (capped) {
    if (wins[series.playerA] === wins[series.playerB]) status = "draw";
    else { status = "won"; resolvedWinner = wins[series.playerA] > wins[series.playerB] ? series.playerA : series.playerB; }
  }
  return { ...series, winsByPlayer: wins, roundsPlayed, status, winnerId: resolvedWinner };
}
