import { collection, doc, getDoc, getDocs, onSnapshot, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { createGame, makeMove } from "../games/tic-tac-toe/rules.js";
import { ROOM_EMOJIS } from "../core/room-machine.js";

export function createFirebaseRoomService({ db, uid }) {
  const roomRef = roomId => doc(db, "rooms", roomId);
  const playersRef = roomId => collection(db, "rooms", roomId, "players");
  const matchRef = (roomId, matchId) => doc(db, "rooms", roomId, "matches", matchId);

  async function create(code) {
    const roomId = crypto.randomUUID();
    await runTransaction(db, async tx => {
      const codeRef = doc(db, "roomCodes", code);
      if ((await tx.get(codeRef)).exists()) throw new Error("Room code collision");
      const expiresAt = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000);
      tx.set(roomRef(roomId), { hostId: uid, roomCode: code, status: "lobby", currentMatchId: null, gameVersion: 1, schemaVersion: 1, memberIds: [uid], memberCount: 1, usedEmojis: [ROOM_EMOJIS[0]], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), expiresAt, settings: { maxPlayers: 8, gameType: "tic-tac-toe" } });
      tx.set(doc(playersRef(roomId), uid), playerData(uid, ROOM_EMOJIS[0], 0));
      tx.set(codeRef, { roomId, expiresAt });
    });
    return roomId;
  }

  async function join(code) {
    const mapping = await getDoc(doc(db, "roomCodes", code));
    if (!mapping.exists()) throw new Error("Room not found");
    const roomId = mapping.data().roomId;
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const snapshot = await tx.get(ref); const data = snapshot.data();
      if (data.memberIds.includes(uid)) return;
      if (data.memberCount >= data.settings.maxPlayers) throw new Error("Room is full");
      const emoji = ROOM_EMOJIS.find(candidate => !data.usedEmojis.includes(candidate));
      tx.update(ref, { memberIds: [...data.memberIds, uid], memberCount: data.memberCount + 1, usedEmojis: [...data.usedEmojis, emoji], updatedAt: serverTimestamp() });
      tx.set(doc(playersRef(roomId), uid), playerData(uid, emoji, data.memberCount));
    });
    return roomId;
  }

  function watch(roomId, listener, onError) {
    let roomData = null, players = [], match = null;
    const emit = () => roomData && listener({ id: roomId, ...roomData, players, match });
    const stops = [
      onSnapshot(roomRef(roomId), snap => { roomData = snap.data(); emit(); }, onError),
      onSnapshot(playersRef(roomId), snap => { players = snap.docs.map(item => item.data()).sort((a,b) => a.seat-b.seat); emit(); }, onError)
    ];
    let matchStop = null;
    stops.push(onSnapshot(roomRef(roomId), snap => {
      matchStop?.(); match = null;
      const matchId = snap.data()?.currentMatchId;
      if (matchId) matchStop = onSnapshot(matchRef(roomId, matchId), matchSnap => { match = matchSnap.data(); emit(); }, onError);
    }, onError));
    return () => { stops.forEach(stop => stop()); matchStop?.(); };
  }

  async function start(roomId) {
    const players = (await getDocs(playersRef(roomId))).docs.map(item => item.data()).sort((a,b)=>a.seat-b.seat);
    if (players.length < 2) throw new Error("Need two players");
    const matchId = crypto.randomUUID(); const game = createGame();
    await runTransaction(db, async tx => {
      tx.set(matchRef(roomId, matchId), { gameType: "tic-tac-toe", playerX: players[0].playerId, playerO: players[1].playerId, board: game.board, currentTurn: game.currentTurn, status: game.status, winner: game.winner, moveCount: game.moveCount, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      tx.update(roomRef(roomId), { status: "playing", currentMatchId: matchId, updatedAt: serverTimestamp() });
    });
  }

  async function move(roomId, matchId, index) {
    await runTransaction(db, async tx => {
      const ref = matchRef(roomId, matchId); const snapshot = await tx.get(ref);
      const current = snapshot.data(); const next = makeMove(current, index);
      tx.update(ref, { board: next.board, currentTurn: next.currentTurn, status: next.status, winner: next.winner, moveCount: next.moveCount, updatedAt: serverTimestamp() });
    });
  }

  return Object.freeze({ uid, create, join, watch, start, move });
}

function playerData(uid, emoji, seat) {
  return { playerId: uid, emoji, seat, partyScore: 0, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), status: "active" };
}
