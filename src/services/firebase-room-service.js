import { collection, doc, getDoc, onSnapshot, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { createGame, makeMove } from "../games/tic-tac-toe/rules.js";
import { ROOM_EMOJIS } from "../core/room-machine.js";
import { pairForRound } from "../core/round-robin.js";

export function createFirebaseRoomService({ db, uid }) {
  const roomRef = roomId => doc(db, "rooms", roomId);
  const playersRef = roomId => collection(db, "rooms", roomId, "players");
  const playerRef = (roomId, playerId) => doc(db, "rooms", roomId, "players", playerId);
  const matchRef = (roomId, matchId) => doc(db, "rooms", roomId, "matches", matchId);

  async function create(code) {
    const roomId = crypto.randomUUID();
    await runTransaction(db, async tx => {
      const codeRef = doc(db, "roomCodes", code);
      if ((await tx.get(codeRef)).exists()) throw new Error("Room code collision");
      const expiresAt = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000);
      tx.set(roomRef(roomId), { hostId: uid, roomCode: code, status: "lobby", currentMatchId: null, roundNumber: -1, gameVersion: 2, schemaVersion: 2, memberIds: [uid], memberCount: 1, usedEmojis: [ROOM_EMOJIS[0]], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), expiresAt, settings: { maxPlayers: 8, gameType: "tic-tac-toe" } });
      tx.set(playerRef(roomId, uid), playerData(uid, ROOM_EMOJIS[0], 0));
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
      if (data.status !== "lobby") throw new Error("Game already started");
      if (data.memberCount >= data.settings.maxPlayers) throw new Error("Room is full");
      const emoji = ROOM_EMOJIS.find(candidate => !data.usedEmojis.includes(candidate));
      tx.update(ref, { memberIds: [...data.memberIds, uid], memberCount: data.memberCount + 1, usedEmojis: [...data.usedEmojis, emoji], updatedAt: serverTimestamp() });
      tx.set(playerRef(roomId, uid), playerData(uid, emoji, data.memberCount));
    });
    return roomId;
  }

  function watch(roomId, listener, onError) {
    let roomData = null, players = [], match = null, matchLoading = false, activeMatchId = null, matchStop = null;
    const emit = () => roomData && listener({ id: roomId, ...roomData, players, match, matchLoading });
    const stopRoom = onSnapshot(roomRef(roomId), snapshot => {
      roomData = snapshot.data();
      const nextMatchId = roomData?.currentMatchId || null;
      if (nextMatchId !== activeMatchId) {
        matchStop?.(); matchStop = null; activeMatchId = nextMatchId; match = null;
        matchLoading = Boolean(nextMatchId); emit();
        if (nextMatchId) matchStop = onSnapshot(matchRef(roomId, nextMatchId), matchSnapshot => {
          match = matchSnapshot.exists() ? { id: matchSnapshot.id, ...matchSnapshot.data() } : null;
          matchLoading = !match; emit();
        }, onError);
      } else emit();
    }, onError);
    const stopPlayers = onSnapshot(playersRef(roomId), snapshot => {
      players = snapshot.docs.map(item => item.data()).sort((a, b) => a.seat - b.seat); emit();
    }, onError);
    return () => { stopRoom(); stopPlayers(); matchStop?.(); };
  }

  async function start(roomId) { return createNextMatch(roomId, true); }
  async function nextMatch(roomId) { return createNextMatch(roomId, false); }

  async function createNextMatch(roomId, initial) {
    const matchId = crypto.randomUUID();
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const roomSnapshot = await tx.get(ref);
      if (!roomSnapshot.exists()) throw new Error("Room not found");
      const room = roomSnapshot.data();
      if (room.hostId !== uid) throw new Error("Host only");
      if (initial ? room.status !== "lobby" : room.status !== "roundOver") throw new Error(initial ? "Game already started" : "Round is not over");
      if (room.memberIds.length < 2) throw new Error("Need two players");
      const playerSnapshots = await Promise.all(room.memberIds.map(id => tx.get(playerRef(roomId, id))));
      const players = playerSnapshots.map(snapshot => snapshot.data()).filter(Boolean);
      const roundNumber = initial ? 0 : room.roundNumber + 1;
      const [playerX, playerO] = pairForRound(players, roundNumber);
      tx.set(matchRef(roomId, matchId), matchData(playerX, playerO, roundNumber));
      tx.update(ref, { status: "playing", currentMatchId: matchId, roundNumber, updatedAt: serverTimestamp() });
    });
    return matchId;
  }

  async function move(roomId, matchId, index) {
    await runTransaction(db, async tx => {
      const roomDocument = await tx.get(roomRef(roomId)); const room = roomDocument.data();
      if (room.status !== "playing" || room.currentMatchId !== matchId) throw new Error("No active match");
      const ref = matchRef(roomId, matchId); const snapshot = await tx.get(ref); const current = snapshot.data();
      const expected = current.currentTurn === "X" ? current.playerX : current.playerO;
      if (expected !== uid) throw new Error("Not your turn");
      const next = makeMove(current, index); const terminal = next.status !== "playing";
      const xRef = playerRef(roomId, current.playerX); const oRef = playerRef(roomId, current.playerO);
      const [xSnapshot, oSnapshot] = terminal ? await Promise.all([tx.get(xRef), tx.get(oRef)]) : [null, null];
      tx.update(ref, { board: next.board, currentTurn: next.currentTurn, status: next.status, winner: next.winner, winningLine: next.winningLine || [], moveCount: next.moveCount, scoreApplied: terminal, updatedAt: serverTimestamp() });
      if (!terminal) return;
      const xPoints = next.status === "draw" ? 1 : next.winner === "X" ? 3 : 0;
      const oPoints = next.status === "draw" ? 1 : next.winner === "O" ? 3 : 0;
      if (xPoints) tx.update(xRef, { partyScore: xSnapshot.data().partyScore + xPoints });
      if (oPoints) tx.update(oRef, { partyScore: oSnapshot.data().partyScore + oPoints });
      tx.update(roomRef(roomId), { status: "roundOver", updatedAt: serverTimestamp() });
    });
  }

  async function endParty(roomId) {
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const snapshot = await tx.get(ref); const room = snapshot.data();
      if (room.hostId !== uid) throw new Error("Host only");
      if (room.status !== "roundOver") throw new Error("Round is not over");
      tx.update(ref, { status: "partyOver", updatedAt: serverTimestamp() });
    });
  }

  return Object.freeze({ uid, create, join, watch, start, move, nextMatch, endParty });
}

function matchData(playerX, playerO, roundNumber) {
  const game = createGame();
  return { gameType: "tic-tac-toe", playerX, playerO, board: game.board, currentTurn: game.currentTurn, status: game.status, winner: game.winner, winningLine: [], moveCount: game.moveCount, scoreApplied: false, roundNumber, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

function playerData(uid, emoji, seat) {
  return { playerId: uid, emoji, seat, partyScore: 0, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), status: "active" };
}
