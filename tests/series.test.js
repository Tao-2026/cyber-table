import test from "node:test";
import assert from "node:assert/strict";
import { createSeries, SERIES_PRESETS, settleSeriesRound } from "../src/core/series.js";

test("best of three is the default and presets use bounded real rounds", () => {
  assert.deepEqual(SERIES_PRESETS.bestOf3, { targetWins: 2, maxRounds: 5, label: "BEST OF 3" });
  assert.equal(createSeries("a", "b").targetWins, 2);
  assert.equal(createSeries("a", "b", 3).maxRounds, 9);
  assert.equal(createSeries("a", "b", 1).maxRounds, 1);
});

test("wins accumulate, draws do not, and target ends the series", () => {
  let series = createSeries("a", "b", 2);
  series = settleSeriesRound(series, "a");
  assert.deepEqual(series.winsByPlayer, { a: 1, b: 0 });
  series = settleSeriesRound(series, null);
  assert.deepEqual(series.winsByPlayer, { a: 1, b: 0 });
  series = settleSeriesRound(series, "a");
  assert.equal(series.status, "won");
  assert.equal(series.winnerId, "a");
});

test("maximum rounds resolve by wins or as a series draw", () => {
  let decided = createSeries("a", "b", 2);
  for (const winner of ["a", null, "b", null, "a"]) decided = settleSeriesRound(decided, winner);
  assert.equal(decided.status, "won"); assert.equal(decided.winnerId, "a");
  let tied = createSeries("a", "b", 2);
  for (const winner of ["a", null, "b", null, null]) tied = settleSeriesRound(tied, winner);
  assert.equal(tied.status, "draw"); assert.equal(tied.winnerId, null);
});
