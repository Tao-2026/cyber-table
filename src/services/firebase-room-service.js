import { collection, doc, getDoc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { createGame, makeMove } from "../games/tic-tac-toe/rules.js";
import { ROOM_EMOJIS } from "../core/room-machine.js";
import { pairForRound } from "../core/round-robin.js";
import { generateShortRoomCode, normalizeRoomCode } from "../core/room-code.js";
import { createSeries, presetForTarget, settleSeriesRound } from "../core/series.js";

export function createFirebaseRoomService({ db, uid }) {
  const lastSuggestionAt = new Map();
  const roomRef = roomId => doc(db, "rooms", roomId);
  const playersRef = roomId => collection(db, "rooms", roomId, "players");
  const playerRef = (roomId, playerId) => doc(db, "rooms", roomId, "players", playerId);
  const matchRef = (roomId, matchId) => doc(db, "rooms", roomId, "matches", matchId);
  const seriesRef = (roomId, seriesId) => doc(db, "rooms", roomId, "series", seriesId);
  const suggestionsRef = (roomId, matchId) => collection(db, "rooms", roomId, "matches", matchId, "suggestions");
  const suggestionRef = (roomId, matchId, playerId) => doc(db, "rooms", roomId, "matches", matchId, "suggestions", playerId);

  async function create(code = null, maxAttempts = 5, codeGenerator = generateShortRoomCode) {
    if (code) return createWithCode(normalizeRoomCode(code));
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try { return await createWithCode(codeGenerator()); }
      catch (error) { if (!/collision/.test(error.message) || attempt === maxAttempts - 1) throw new Error("Could not reserve a room code. Please try again."); }
    }
    throw new Error("Could not reserve a room code. Please try again.");
  }

  async function createWithCode(code) {
    if (!/^[A-Z0-9]{5}$/.test(code)) throw new Error("Room code must contain five letters or numbers");
    const roomId = crypto.randomUUID();
    await runTransaction(db, async tx => {
      const codeRef = doc(db, "roomCodes", code);
      if ((await tx.get(codeRef)).exists()) throw new Error("Room code collision");
      const expiresAt = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000);
      tx.set(roomRef(roomId), { hostId: uid, roomCode: code, status: "lobby", currentMatchId: null, currentSeriesId: null, roundNumber: -1, seriesNumber: -1, gameVersion: 3, schemaVersion: 3, memberIds: [uid], memberCount: 1, activePlayerCount: 1, usedEmojis: [ROOM_EMOJIS[0]], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), expiresAt, settings: { maxPlayers: 8, maxActivePlayers: 6, gameType: "tic-tac-toe", seriesTargetWins: 2, maxSeriesRounds: 5 } });
      tx.set(playerRef(roomId, uid), playerData(uid, ROOM_EMOJIS[0], 0, "player"));
      tx.set(codeRef, { roomId, expiresAt });
    });
    return roomId;
  }

  async function join(code) {
    code = normalizeRoomCode(code);
    const mapping = await getDoc(doc(db, "roomCodes", code));
    if (!mapping.exists()) throw new Error("Room not found");
    const roomId = mapping.data().roomId;
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const snapshot = await tx.get(ref); const data = snapshot.data();
      if (data.memberIds.includes(uid)) return;
      if (data.status !== "lobby") throw new Error("Game already started");
      if (data.memberCount >= data.settings.maxPlayers) throw new Error("Room is full");
      const emoji = ROOM_EMOJIS.find(candidate => !data.usedEmojis.includes(candidate));
      const activeCount = data.activePlayerCount ?? data.memberCount;
      const role = activeCount < (data.settings.maxActivePlayers || data.settings.maxPlayers) ? "player" : "spectator";
      tx.update(ref, { memberIds: [...data.memberIds, uid], memberCount: data.memberCount + 1, activePlayerCount: activeCount + (role === "player" ? 1 : 0), usedEmojis: [...data.usedEmojis, emoji], updatedAt: serverTimestamp() });
      tx.set(playerRef(roomId, uid), playerData(uid, emoji, data.memberCount, role));
    });
    return roomId;
  }

  async function resume(roomId) {
    const snapshot = await getDocFromServer(roomRef(roomId));
    if (!snapshot.exists()) throw new Error("Room no longer exists");
    if (!snapshot.data().memberIds.includes(uid)) throw new Error("This device is no longer a member of the room");
    return roomId;
  }

  async function probe(roomId) {
    const roomSnapshot = await getDocFromServer(roomRef(roomId));
    if (!roomSnapshot.exists()) throw new Error("Room no longer exists");
    const room = roomSnapshot.data();
    if (!room.memberIds.includes(uid)) throw new Error("This device is no longer a member of the room");
    const matchSnapshot = room.currentMatchId
      ? await getDocFromServer(matchRef(roomId, room.currentMatchId))
      : null;
    const playerSnapshots = await getDocsFromServer(playersRef(roomId));
    const seriesSnapshot = room.currentSeriesId ? await getDocFromServer(seriesRef(roomId, room.currentSeriesId)) : null;
    const suggestionSnapshots = room.currentMatchId ? await getDocsFromServer(suggestionsRef(roomId, room.currentMatchId)) : null;
    return {
      id: roomId,
      ...room,
      match: matchSnapshot?.exists() ? { id: matchSnapshot.id, ...matchSnapshot.data() } : null,
      players: playerSnapshots.docs.map(item => ({ role: "player", ...item.data() })).sort((a, b) => a.seat - b.seat),
      series: seriesSnapshot?.exists() ? { id: seriesSnapshot.id, ...seriesSnapshot.data() } : null,
      suggestions: suggestionSnapshots ? suggestionSnapshots.docs.map(item => ({ id: item.id, ...item.data() })) : []
    };
  }

  function watch(roomId, listener, onError) {
    let roomData = null, players = [], match = null, series = null, suggestions = [], matchLoading = false;
    let activeMatchId = null, activeSeriesId = null, matchStop = null, seriesStop = null, suggestionsStop = null;
    const emit = () => roomData && listener({ id: roomId, ...roomData, players: players.map(player => ({ role: "player", ...player })), match, series, suggestions, matchLoading });
    const stopRoom = onSnapshot(roomRef(roomId), snapshot => {
      roomData = snapshot.data();
      const nextMatchId = roomData?.currentMatchId || null;
      if (nextMatchId !== activeMatchId) {
        matchStop?.(); suggestionsStop?.(); matchStop = suggestionsStop = null; activeMatchId = nextMatchId; match = null; suggestions = [];
        matchLoading = Boolean(nextMatchId); emit();
        if (nextMatchId) matchStop = onSnapshot(matchRef(roomId, nextMatchId), matchSnapshot => {
          match = matchSnapshot.exists() ? { id: matchSnapshot.id, ...matchSnapshot.data() } : null;
          matchLoading = !match; emit();
          suggestionsStop?.();
          suggestionsStop = onSnapshot(suggestionsRef(roomId, nextMatchId), suggestionSnapshot => {
            suggestions = suggestionSnapshot.docs.map(item => ({ id: item.id, ...item.data() })); emit();
          }, onError);
        }, onError);
      } else emit();
      const nextSeriesId = roomData?.currentSeriesId || null;
      if (nextSeriesId !== activeSeriesId) {
        seriesStop?.(); seriesStop = null; activeSeriesId = nextSeriesId; series = null;
        if (nextSeriesId) seriesStop = onSnapshot(seriesRef(roomId, nextSeriesId), snapshot => { series = snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null; emit(); }, onError);
      }
    }, onError);
    const stopPlayers = onSnapshot(playersRef(roomId), snapshot => {
      players = snapshot.docs.map(item => item.data()).sort((a, b) => a.seat - b.seat); emit();
    }, onError);
    return () => { stopRoom(); stopPlayers(); matchStop?.(); seriesStop?.(); suggestionsStop?.(); };
  }

  async function start(roomId) { return createNextSeries(roomId, true); }
  async function nextMatch(roomId) { return nextRound(roomId); }
  async function nextSeries(roomId) { return createNextSeries(roomId, false); }

  async function createNextSeries(roomId, initial) {
    const seriesId = crypto.randomUUID();
    const matchId = crypto.randomUUID();
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const roomSnapshot = await tx.get(ref);
      if (!roomSnapshot.exists()) throw new Error("Room not found");
      const room = roomSnapshot.data();
      if (room.hostId !== uid) throw new Error("Host only");
      if (initial ? room.status !== "lobby" : room.status !== "seriesOver") throw new Error(initial ? "Game already started" : "Series is not over");
      const playerSnapshots = await Promise.all(room.memberIds.map(id => tx.get(playerRef(roomId, id))));
      const players = playerSnapshots.map(snapshot => snapshot.data()).filter(player => player && (player.role || "player") === "player");
      if (players.length < 2) throw new Error("Need two active players");
      const roundNumber = initial ? 0 : room.roundNumber + 1;
      const seriesNumber = initial ? 0 : (room.seriesNumber || 0) + 1;
      const [playerX, playerO] = pairForRound(players, seriesNumber);
      const targetWins = room.settings.seriesTargetWins || 2;
      tx.set(seriesRef(roomId, seriesId), { ...createSeries(playerX, playerO, targetWins, seriesNumber), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      tx.set(matchRef(roomId, matchId), matchData(playerX, playerO, roundNumber, seriesId, 1));
      tx.update(ref, { status: "playing", currentMatchId: matchId, currentSeriesId: seriesId, roundNumber, seriesNumber, updatedAt: serverTimestamp() });
    });
    return matchId;
  }

  async function nextRound(roomId) {
    const matchId = crypto.randomUUID();
    const legacySeriesId = crypto.randomUUID();
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const roomSnapshot = await tx.get(ref); const room = roomSnapshot.data();
      if (room.hostId !== uid) throw new Error("Host only");
      if (room.status !== "roundOver") throw new Error("Round is not over");
      if (!room.currentSeriesId) {
        const previous = (await tx.get(matchRef(roomId, room.currentMatchId))).data(); const targetWins = room.settings.seriesTargetWins || 2;
        tx.set(seriesRef(roomId, legacySeriesId), { ...createSeries(previous.playerX, previous.playerO, targetWins, 0), createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        tx.set(matchRef(roomId, matchId), matchData(previous.playerX, previous.playerO, room.roundNumber + 1, legacySeriesId, 1));
        tx.update(ref, { status: "playing", currentMatchId: matchId, currentSeriesId: legacySeriesId, roundNumber: room.roundNumber + 1, seriesNumber: 0, updatedAt: serverTimestamp() });
        return;
      }
      const seriesSnapshot = await tx.get(seriesRef(roomId, room.currentSeriesId)); const series = seriesSnapshot.data();
      if (series.status !== "playing") throw new Error("Series is already over");
      const seriesRoundNumber = series.roundsPlayed + 1;
      const swap = seriesRoundNumber % 2 === 0;
      const playerX = swap ? series.playerB : series.playerA; const playerO = swap ? series.playerA : series.playerB;
      tx.set(matchRef(roomId, matchId), matchData(playerX, playerO, room.roundNumber + 1, room.currentSeriesId, seriesRoundNumber));
      tx.update(ref, { status: "playing", currentMatchId: matchId, roundNumber: room.roundNumber + 1, updatedAt: serverTimestamp() });
    });
    return matchId;
  }

  async function updateSeriesSetting(roomId, targetWins) {
    const preset = presetForTarget(targetWins);
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const room = (await tx.get(ref)).data();
      if (room.hostId !== uid) throw new Error("Host only");
      if (room.status !== "lobby") throw new Error("Series setting is locked");
      tx.update(ref, { "settings.seriesTargetWins": preset.targetWins, "settings.maxSeriesRounds": preset.maxRounds, updatedAt: serverTimestamp() });
    });
  }

  async function setRole(roomId, playerId, role) {
    if (!["player", "spectator"].includes(role)) throw new Error("Invalid role");
    await runTransaction(db, async tx => {
      const room = (await tx.get(roomRef(roomId))).data();
      if (room.status !== "lobby") throw new Error("Roles are locked during a series");
      if (uid !== playerId && uid !== room.hostId) throw new Error("Cannot change this role");
      const targetRef = playerRef(roomId, playerId); const target = (await tx.get(targetRef)).data();
      const priorRole = target.role || "player"; const active = room.activePlayerCount ?? room.memberCount;
      if (role === "player" && priorRole !== "player" && active >= (room.settings.maxActivePlayers || room.settings.maxPlayers)) throw new Error("Player pool is full");
      const activePlayerCount = active + (role === priorRole ? 0 : role === "player" ? 1 : -1);
      tx.update(roomRef(roomId), { activePlayerCount, updatedAt: serverTimestamp() });
      tx.update(targetRef, { role, roleUpdatedAt: serverTimestamp(), lastSeenAt: serverTimestamp() });
    });
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
      const terminalReads = terminal ? [tx.get(xRef), tx.get(oRef)] : [];
      if (terminal && current.seriesId) terminalReads.push(tx.get(seriesRef(roomId, current.seriesId)));
      const [xSnapshot, oSnapshot, seriesSnapshot = null] = terminal ? await Promise.all(terminalReads) : [null, null, null];
      tx.update(ref, { board: next.board, currentTurn: next.currentTurn, status: next.status, winner: next.winner, winningLine: next.winningLine || [], moveCount: next.moveCount, scoreApplied: terminal, updatedAt: serverTimestamp() });
      if (!terminal) return;
      const xPoints = next.status === "draw" ? 1 : next.winner === "X" ? 3 : 0;
      const oPoints = next.status === "draw" ? 1 : next.winner === "O" ? 3 : 0;
      if (xPoints) tx.update(xRef, { partyScore: xSnapshot.data().partyScore + xPoints });
      if (oPoints) tx.update(oRef, { partyScore: oSnapshot.data().partyScore + oPoints });
      if (current.seriesId && seriesSnapshot) {
        const winnerId = next.winner === "X" ? current.playerX : next.winner === "O" ? current.playerO : null;
        const settledSeries = settleSeriesRound(seriesSnapshot.data(), winnerId);
        tx.update(seriesRef(roomId, current.seriesId), { winsByPlayer: settledSeries.winsByPlayer, roundsPlayed: settledSeries.roundsPlayed, status: settledSeries.status, winnerId: settledSeries.winnerId, updatedAt: serverTimestamp() });
        tx.update(roomRef(roomId), { status: settledSeries.status === "playing" ? "roundOver" : "seriesOver", updatedAt: serverTimestamp() });
      } else tx.update(roomRef(roomId), { status: "roundOver", updatedAt: serverTimestamp() });
    });
  }

  async function suggest(roomId, matchId, suggestedCell) {
    const rateKey = `${roomId}:${matchId}`; const now = Date.now();
    if (now - (lastSuggestionAt.get(rateKey) || 0) < 500) throw new Error("Please wait before changing your suggestion");
    await runTransaction(db, async tx => {
      const room = (await tx.get(roomRef(roomId))).data(); const match = (await tx.get(matchRef(roomId, matchId))).data();
      const spectator = (await tx.get(playerRef(roomId, uid))).data();
      if (!room || room.status !== "playing" || room.currentMatchId !== matchId) throw new Error("No active match");
      if ((spectator?.role || "player") !== "spectator") throw new Error("Spectators only");
      if (!Number.isInteger(suggestedCell) || suggestedCell < 0 || suggestedCell > 8 || match.board[suggestedCell] !== null) throw new Error("Choose an empty square");
      tx.set(suggestionRef(roomId, matchId, uid), { spectatorId: uid, spectatorEmoji: spectator.emoji, suggestedCell, moveCount: match.moveCount, status: "pending", createdAt: serverTimestamp(), resolvedAt: null, resolvedBy: null });
    });
    lastSuggestionAt.set(rateKey, now);
  }

  async function resolveSuggestion(roomId, matchId, spectatorId, status) {
    if (!["accepted", "dismissed"].includes(status)) throw new Error("Invalid resolution");
    await runTransaction(db, async tx => {
      const match = (await tx.get(matchRef(roomId, matchId))).data();
      const expected = match.currentTurn === "X" ? match.playerX : match.playerO;
      if (expected !== uid || match.status !== "playing") throw new Error("Current player only");
      const ref = suggestionRef(roomId, matchId, spectatorId); const suggestion = (await tx.get(ref)).data();
      if (!suggestion || suggestion.status !== "pending" || suggestion.moveCount !== match.moveCount) throw new Error("Suggestion expired");
      tx.update(ref, { status, resolvedAt: serverTimestamp(), resolvedBy: uid });
    });
  }

  async function muteSuggestions(roomId, matchId) {
    await runTransaction(db, async tx => {
      const ref = matchRef(roomId, matchId); const match = (await tx.get(ref)).data();
      const expected = match.currentTurn === "X" ? match.playerX : match.playerO;
      if (expected !== uid || match.status !== "playing") throw new Error("Current player only");
      tx.update(ref, { suggestionsMutedMoveCount: match.moveCount, updatedAt: serverTimestamp() });
    });
  }

  async function endParty(roomId) {
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const snapshot = await tx.get(ref); const room = snapshot.data();
      if (room.hostId !== uid) throw new Error("Host only");
      if (room.status !== "seriesOver") throw new Error("Series is not over");
      tx.update(ref, { status: "partyOver", updatedAt: serverTimestamp() });
    });
  }

  return Object.freeze({ uid, create, join, resume, probe, watch, start, move, nextMatch, nextSeries, updateSeriesSetting, setRole, suggest, resolveSuggestion, muteSuggestions, endParty });
}

function matchData(playerX, playerO, roundNumber, seriesId, seriesRoundNumber) {
  const game = createGame();
  return { gameType: "tic-tac-toe", playerX, playerO, board: game.board, currentTurn: game.currentTurn, status: game.status, winner: game.winner, winningLine: [], moveCount: game.moveCount, scoreApplied: false, roundNumber, seriesId, seriesRoundNumber, suggestionsMutedMoveCount: -1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

function playerData(uid, emoji, seat, role) {
  return { playerId: uid, emoji, seat, role, partyScore: 0, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), roleUpdatedAt: serverTimestamp(), status: "active" };
}
