export function pairForRound(players, roundNumber) {
  if (players.length < 2) throw new Error("Need two players");
  const ordered = [...players].sort((a, b) => a.seat - b.seat);
  const pairs = [];
  for (let left = 0; left < ordered.length - 1; left += 1) {
    for (let right = left + 1; right < ordered.length; right += 1) pairs.push([ordered[left].playerId, ordered[right].playerId]);
  }
  const pair = [...pairs[roundNumber % pairs.length]];
  if (roundNumber % 2 === 1) pair.reverse();
  return pair;
}
