import { createGame, makeMove } from "../games/tic-tac-toe/rules.js";

export const ROOM_EMOJIS = Object.freeze(["🤖", "🐼", "🐰", "🦊", "🐯", "🐸", "🦄", "🐙"]);
export const SCORE = Object.freeze({ win: 3, draw: 1, loss: 0 });

export function createRoom({ code, hostId, emoji = ROOM_EMOJIS[0], now = Date.now() }) {
  return { code, hostId, status: "lobby", players: [{ id: hostId, emoji, seat: 0, score: 0, active: true }], match: null, rotation: 0, createdAt: now, expiresAt: now + 6 * 60 * 60 * 1000 };
}

export function joinRoom(room, playerId) {
  if (room.status === "partyOver") throw new Error("Room has ended");
  if (room.players.some(player => player.id === playerId)) return room;
  if (room.players.length >= 8) throw new Error("Room is full");
  const used = new Set(room.players.map(player => player.emoji));
  const emoji = ROOM_EMOJIS.find(candidate => !used.has(candidate));
  return { ...room, players: [...room.players, { id: playerId, emoji, seat: room.players.length, score: 0, active: true }] };
}

export function startParty(room, actorId) {
  if (actorId !== room.hostId) throw new Error("Host only");
  if (room.players.length < 2) throw new Error("Need two players");
  const [playerX, playerO] = pairFor(room.players, room.rotation);
  return { ...room, status: "playing", match: { ...createGame(), playerX, playerO } };
}

export function playRoomMove(room, actorId, index) {
  if (room.status !== "playing" || !room.match) throw new Error("No active match");
  const expected = room.match.currentTurn === "X" ? room.match.playerX : room.match.playerO;
  if (actorId !== expected) throw new Error("Not your turn");
  const nextGame = makeMove(room.match, index);
  const match = { ...room.match, ...nextGame };
  if (match.status === "playing") return { ...room, match };
  const players = room.players.map(player => ({ ...player }));
  if (match.status === "draw") {
    for (const id of [match.playerX, match.playerO]) players.find(player => player.id === id).score += SCORE.draw;
  } else {
    const winnerId = match.winner === "X" ? match.playerX : match.playerO;
    players.find(player => player.id === winnerId).score += SCORE.win;
  }
  return { ...room, status: "roundOver", players, match };
}

export function rotateRoom(room, actorId) {
  if (actorId !== room.hostId) throw new Error("Host only");
  if (room.status !== "roundOver") throw new Error("Round is not over");
  const rotation = room.rotation + 1;
  const [playerX, playerO] = pairFor(room.players, rotation);
  return { ...room, status: "playing", rotation, match: { ...createGame(), playerX, playerO } };
}

export function endParty(room, actorId) {
  if (actorId !== room.hostId) throw new Error("Host only");
  return { ...room, status: "partyOver", match: null };
}

export function podium(room) {
  return [...room.players].sort((a, b) => b.score - a.score || a.seat - b.seat).slice(0, 3);
}

function pairFor(players, rotation) {
  const count = players.length;
  return [players[rotation % count].id, players[(rotation + 1) % count].id];
}
