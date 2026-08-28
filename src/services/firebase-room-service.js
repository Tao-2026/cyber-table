import { collection, doc, getDoc, getDocFromServer, getDocsFromServer, onSnapshot, runTransaction, serverTimestamp, Timestamp } from "firebase/firestore";
import { createGame, makeMove } from "../games/tic-tac-toe/rules.js";
import { BLACK, WHITE } from "../games/gomoku/rules.js";
import { DEFAULT_GAME_TYPE, GAME_TYPES, normalizeGameType } from "../games/registry.js";
import { AVATAR_IDS, DEFAULT_AVATAR_ID, avatarById, avatarFromLegacyEmoji, availableAvatars } from "../config/avatars.js";
import { pairForRound } from "../core/round-robin.js";
import { generateShortRoomCode, normalizeRoomCode } from "../core/room-code.js";
import { createSeries, presetForTarget, settleSeriesRound } from "../core/series.js";

export function createFirebaseRoomService({ db, uid }) {
  const roomRef = roomId => doc(db, "rooms", roomId);
  const playersRef = roomId => collection(db, "rooms", roomId, "players");
  const playerRef = (roomId, playerId) => doc(db, "rooms", roomId, "players", playerId);
  const matchRef = (roomId, matchId) => doc(db, "rooms", roomId, "matches", matchId);
  const seriesRef = (roomId, seriesId) => doc(db, "rooms", roomId, "series", seriesId);
  const suggestionsRef = (roomId, matchId) => collection(db, "rooms", roomId, "matches", matchId, "suggestions");
  const suggestionRef = (roomId, matchId, playerId) => doc(db, "rooms", roomId, "matches", matchId, "suggestions", playerId);
  const movesRef = (roomId, matchId) => collection(db, "rooms", roomId, "matches", matchId, "moves");
  const moveRef = (roomId, matchId, moveNumber) => doc(db, "rooms", roomId, "matches", matchId, "moves", `move-${moveNumber}`);
  const projectionRef = (roomId,matchId,type,index) => doc(db,"rooms",roomId,"matches",matchId,"projections",type,"lines",String(index));

  async function create(code = null, avatarId = DEFAULT_AVATAR_ID, maxAttempts = 5, codeGenerator = generateShortRoomCode) {
    if (typeof avatarId === "number") { codeGenerator = maxAttempts; maxAttempts = avatarId; avatarId = DEFAULT_AVATAR_ID; }
    validateAvatarId(avatarId);
    if (code) return createWithCode(normalizeRoomCode(code), avatarId);
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try { return await createWithCode(codeGenerator(), avatarId); }
      catch (error) { if (!/collision/.test(error.message) || attempt === maxAttempts - 1) throw new Error("Could not reserve a room code. Please try again."); }
    }
    throw new Error("Could not reserve a room code. Please try again.");
  }

  async function createWithCode(code, avatarId) {
    if (!/^[A-Z0-9]{5}$/.test(code)) throw new Error("Room code must contain five letters or numbers");
    const roomId = crypto.randomUUID();
    await runTransaction(db, async tx => {
      const codeRef = doc(db, "roomCodes", code);
      if ((await tx.get(codeRef)).exists()) throw new Error("Room code collision");
      const expiresAt = Timestamp.fromMillis(Date.now() + 6 * 60 * 60 * 1000);
      const avatar = avatarById(avatarId);
      tx.set(roomRef(roomId), { hostId: uid, roomCode: code, status: "lobby", selectedGameType: DEFAULT_GAME_TYPE, activeGameType: null, gameSelectionVersion: 1, currentMatchId: null, currentSeriesId: null, roundNumber: -1, seriesNumber: -1, gameVersion: 6, schemaVersion: 6, memberIds: [uid], memberCount: 1, playerCount: 1, spectatorCount: 0, activePlayerCount: 1, usedAvatarIds: [avatar.id], usedEmojis: [avatar.emoji], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), expiresAt, settings: { maxMembers: 8, maxPlayers: 8, maxActivePlayers: 6, gameType: "tic-tac-toe", seriesTargetWins: 2, maxSeriesRounds: 5 } });
      tx.set(playerRef(roomId, uid), playerData(uid, avatar, 0, "player"));
      tx.set(codeRef, { roomId, expiresAt });
    });
    return roomId;
  }

  async function join(code, requestedRole = "player", avatarId = null) {
    if (!["player", "spectator"].includes(requestedRole)) throw new Error("Choose player or spectator");
    if (avatarId !== null) validateAvatarId(avatarId);
    code = normalizeRoomCode(code);
    const mapping = await getDoc(doc(db, "roomCodes", code));
    if (!mapping.exists()) throw new Error("Room not found");
    const roomId = mapping.data().roomId;
    try { await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const snapshot = await tx.get(ref); const data = snapshot.data();
      if (data.memberIds.includes(uid)) return;
      const maxMembers = data.settings.maxMembers || data.settings.maxPlayers || 8;
      if (data.memberCount >= maxMembers) throw new Error("Room is full (8/8)");
      const usedAvatarIds = data.usedAvatarIds || (data.usedEmojis || []).map(emoji => avatarFromLegacyEmoji(emoji).id).filter(id => id !== "legacy");
      const chosenAvatarId = avatarId || availableAvatars(usedAvatarIds, 1)[0]?.id;
      if (!chosenAvatarId) throw new Error("No avatars available");
      if (usedAvatarIds.includes(chosenAvatarId)) throw avatarTakenError(usedAvatarIds);
      const avatar = avatarById(chosenAvatarId);
      const playerCount = data.playerCount ?? data.activePlayerCount ?? data.memberCount;
      const spectatorCount = data.spectatorCount ?? Math.max(0, data.memberCount - playerCount);
      const maxPlayers = data.settings.maxActivePlayers || maxMembers;
      const lobbyCanPlay = data.status === "lobby" && playerCount < maxPlayers;
      const role = requestedRole === "player" && lobbyCanPlay ? "player" : "spectator";
      const joinedDuringSeries = data.status !== "lobby";
      tx.update(ref, { memberIds: [...data.memberIds, uid], memberCount: data.memberCount + 1, playerCount: playerCount + (role === "player" ? 1 : 0), spectatorCount: spectatorCount + (role === "spectator" ? 1 : 0), activePlayerCount: playerCount + (role === "player" ? 1 : 0), usedAvatarIds: [...usedAvatarIds, avatar.id], usedEmojis: [...(data.usedEmojis || []), avatar.emoji], updatedAt: serverTimestamp() });
      tx.set(playerRef(roomId, uid), playerData(uid, avatar, data.memberCount, role, joinedDuringSeries));
    }); }
    catch (error) {
      if (avatarId !== null && error?.code === "permission-denied") {
        const latest = (await getDocFromServer(roomRef(roomId))).data();
        const usedAvatarIds = latest?.usedAvatarIds || [];
        if (usedAvatarIds.includes(avatarId)) throw avatarTakenError(usedAvatarIds);
      }
      throw error;
    }
    const joined = (await getDocFromServer(playerRef(roomId, uid))).data();
    const joinedRoom = (await getDocFromServer(roomRef(roomId))).data();
    const downgraded = requestedRole === "player" && joined.role === "spectator";
    return { roomId, role: joined.role || "player", downgraded, reason: downgraded ? (joinedRoom.status === "lobby" ? "playerPoolFull" : "gameStarted") : null };
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
      ...room, selectedGameType: normalizeGameType(room.selectedGameType), activeGameType: room.activeGameType ? normalizeGameType(room.activeGameType) : null,
      match: matchSnapshot?.exists() ? { id: matchSnapshot.id, ...matchSnapshot.data() } : null,
      players: playerSnapshots.docs.map(item => ({ role: "player", ...item.data() })).sort((a, b) => a.seat - b.seat),
      series: seriesSnapshot?.exists() ? { id: seriesSnapshot.id, ...seriesSnapshot.data() } : null,
      suggestions: suggestionSnapshots ? suggestionSnapshots.docs.map(item => ({ id: item.id, ...item.data() })) : [],
      moves: room.currentMatchId && matchSnapshot?.data()?.gameType === "gomoku" ? (await getDocsFromServer(movesRef(roomId,room.currentMatchId))).docs.map(item=>item.data()).sort((a,b)=>a.moveNumber-b.moveNumber) : []
    };
  }

  function watch(roomId, listener, onError) {
    let roomData = null, players = [], match = null, series = null, suggestions = [], moves = [], matchLoading = false;
    let activeMatchId = null, activeSeriesId = null, matchStop = null, seriesStop = null, suggestionsStop = null, movesStop = null;
    const emit = () => roomData && listener({ id: roomId, ...roomData, selectedGameType: normalizeGameType(roomData.selectedGameType), activeGameType: roomData.activeGameType ? normalizeGameType(roomData.activeGameType) : null, players: players.map(player => ({ role: "player", ...player })), match, series, suggestions, moves, matchLoading });
    const stopRoom = onSnapshot(roomRef(roomId), snapshot => {
      roomData = snapshot.data();
      const nextMatchId = roomData?.currentMatchId || null;
      if (nextMatchId !== activeMatchId) {
        matchStop?.(); suggestionsStop?.(); movesStop?.(); matchStop = suggestionsStop = movesStop = null; activeMatchId = nextMatchId; match = null; suggestions = []; moves = [];
        matchLoading = Boolean(nextMatchId); emit();
        if (nextMatchId) matchStop = onSnapshot(matchRef(roomId, nextMatchId), matchSnapshot => {
          match = matchSnapshot.exists() ? { id: matchSnapshot.id, ...matchSnapshot.data() } : null;
          matchLoading = !match || (match?.gameType === "gomoku" && moves.length !== match.moveCount); emit();
          suggestionsStop?.();
           suggestionsStop = onSnapshot(suggestionsRef(roomId, nextMatchId), suggestionSnapshot => {
             suggestions = suggestionSnapshot.docs.map(item => ({ id: item.id, ...item.data() })); emit();
           }, onError);
           movesStop?.(); movesStop=null;
           if (match?.gameType === "gomoku") movesStop = onSnapshot(movesRef(roomId,nextMatchId), moveSnapshot => { moves=moveSnapshot.docs.map(item=>item.data()).sort((a,b)=>a.moveNumber-b.moveNumber);matchLoading=moves.length!==match.moveCount;emit(); },onError);
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
    return () => { stopRoom(); stopPlayers(); matchStop?.(); seriesStop?.(); suggestionsStop?.(); movesStop?.(); };
  }

  async function preview(code) {
    code = normalizeRoomCode(code);
    const mapping = await getDocFromServer(doc(db, "roomCodes", code));
    if (!mapping.exists()) throw new Error("Room not found");
    const snapshot = await getDocFromServer(roomRef(mapping.data().roomId));
    if (!snapshot.exists()) throw new Error("Room not found");
    const data = snapshot.data();
    const usedAvatarIds = data.usedAvatarIds || (data.usedEmojis || []).map(emoji => avatarFromLegacyEmoji(emoji).id).filter(id => id !== "legacy");
    return { roomId: snapshot.id, status: data.status, memberCount: data.memberCount, maxMembers: data.settings?.maxMembers || data.settings?.maxPlayers || 8, spectatorOnly: data.status !== "lobby", usedAvatarIds };
  }

  async function start(roomId) { return createNextSeries(roomId, true); }
  async function nextMatch(roomId) { return nextRound(roomId); }
  async function nextSeries(roomId) { return createNextSeries(roomId, false); }

  async function updateSelectedGame(roomId, gameType) {
    if (!GAME_TYPES.includes(gameType)) throw new Error("Unknown game");
    await runTransaction(db,async tx=>{const ref=roomRef(roomId),room=(await tx.get(ref)).data();if(room.hostId!==uid)throw new Error("Host only");if(!["lobby","seriesBreak","seriesOver"].includes(room.status))throw new Error("Game selection is locked");tx.update(ref,{selectedGameType:gameType,gameSelectionVersion:1,updatedAt:serverTimestamp()});});
  }

  async function createNextSeries(roomId, initial) {
    const seriesId = crypto.randomUUID();
    const matchId = crypto.randomUUID();
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const roomSnapshot = await tx.get(ref);
      if (!roomSnapshot.exists()) throw new Error("Room not found");
      const room = roomSnapshot.data();
      if (room.hostId !== uid) throw new Error("Host only");
      if (initial ? room.status !== "lobby" : !["seriesBreak","seriesOver"].includes(room.status)) throw new Error(initial ? "Game already started" : "Series is not over");
      const playerSnapshots = await Promise.all(room.memberIds.map(id => tx.get(playerRef(roomId, id))));
      const players = playerSnapshots.map(snapshot => snapshot.data()).filter(player => player && (player.role || "player") === "player");
      if (players.length < 2) throw new Error("Need two active players");
      const roundNumber = initial ? 0 : room.roundNumber + 1;
      const seriesNumber = initial ? 0 : (room.seriesNumber || 0) + 1;
      const [playerX, playerO] = pairForRound(players, seriesNumber);
      const targetWins = room.settings.seriesTargetWins || 2;
      const gameType=normalizeGameType(room.selectedGameType);
      tx.set(seriesRef(roomId, seriesId), { ...createSeries(playerX, playerO, targetWins, seriesNumber), gameType, scoreApplied:false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      tx.set(matchRef(roomId, matchId), matchData(playerX, playerO, roundNumber, seriesId, 1,gameType));
      tx.update(ref, { status: "playing", activeGameType:gameType, currentMatchId: matchId, currentSeriesId: seriesId, roundNumber, seriesNumber, updatedAt: serverTimestamp() });
      for (const snapshot of playerSnapshots) if (snapshot.exists() && snapshot.data().joinedDuringSeries && (snapshot.data().role || "player") === "player") tx.update(snapshot.ref, { joinedDuringSeries: false, requestedRole: null, roleUpdatedAt: serverTimestamp() });
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
        tx.set(seriesRef(roomId, legacySeriesId), { ...createSeries(previous.playerX, previous.playerO, targetWins, 0), gameType:normalizeGameType(previous.gameType), scoreApplied:false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        tx.set(matchRef(roomId, matchId), matchData(previous.playerX, previous.playerO, room.roundNumber + 1, legacySeriesId, 1,normalizeGameType(previous.gameType)));
        tx.update(ref, { status: "playing", currentMatchId: matchId, currentSeriesId: legacySeriesId, roundNumber: room.roundNumber + 1, seriesNumber: 0, updatedAt: serverTimestamp() });
        return;
      }
      const seriesSnapshot = await tx.get(seriesRef(roomId, room.currentSeriesId)); const series = seriesSnapshot.data();
      if (series.status !== "playing") throw new Error("Series is already over");
      const seriesRoundNumber = series.roundsPlayed + 1;
      const swap = seriesRoundNumber % 2 === 0;
      const playerX = swap ? series.playerB : series.playerA; const playerO = swap ? series.playerA : series.playerB;
      tx.set(matchRef(roomId, matchId), matchData(playerX, playerO, room.roundNumber + 1, room.currentSeriesId, seriesRoundNumber,normalizeGameType(series.gameType)));
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
      if (!["lobby","seriesBreak","seriesOver"].includes(room.status)) throw new Error("Roles are locked during a series");
      if (uid !== playerId && uid !== room.hostId) throw new Error("Cannot change this role");
      const targetRef = playerRef(roomId, playerId); const target = (await tx.get(targetRef)).data();
      const priorRole = target.role || "player"; const active = room.playerCount ?? room.activePlayerCount ?? room.memberCount;
      if (role === "player" && priorRole !== "player" && active >= (room.settings.maxActivePlayers || room.settings.maxPlayers)) throw new Error("Player pool is full");
      const spectatorCount = room.spectatorCount ?? Math.max(0, room.memberCount - active);
      const playerCount = active + (role === priorRole ? 0 : role === "player" ? 1 : -1);
      const nextSpectatorCount = spectatorCount + (role === priorRole ? 0 : role === "spectator" ? 1 : -1);
      tx.update(roomRef(roomId), { playerCount, spectatorCount: nextSpectatorCount, activePlayerCount: playerCount, updatedAt: serverTimestamp() });
      tx.update(targetRef, { role, requestedRole: null, joinedDuringSeries: false, roleUpdatedAt: serverTimestamp(), lastSeenAt: serverTimestamp() });
    });
  }

  async function requestRole(roomId, role) {
    if (!["player","spectator"].includes(role)) throw new Error("Invalid role request");
    await runTransaction(db, async tx => {
      const room = (await tx.get(roomRef(roomId))).data();
      if (room.status !== "seriesBreak") throw new Error("Role requests open between series");
      const ref = playerRef(roomId, uid); const player = (await tx.get(ref)).data();
      if (!player) throw new Error("Member not found");
      if (role === "spectator" && (player.role || "player") === "player") {
        const active = room.playerCount ?? room.activePlayerCount ?? room.memberCount;
        const spectators = room.spectatorCount ?? Math.max(0, room.memberCount - active);
        tx.update(roomRef(roomId), { playerCount: active - 1, spectatorCount: spectators + 1, activePlayerCount: active - 1, updatedAt: serverTimestamp() });
        tx.update(ref, { role: "spectator", requestedRole: null, joinedDuringSeries: false, roleUpdatedAt: serverTimestamp(), lastSeenAt: serverTimestamp() });
      } else {
        tx.update(ref, { requestedRole: role === (player.role || "player") ? null : role, roleUpdatedAt: serverTimestamp(), lastSeenAt: serverTimestamp() });
      }
    });
  }

  async function move(roomId, matchId, index) {
    let terminal = false;
    await runTransaction(db, async tx => {
      const roomDocument = await tx.get(roomRef(roomId)); const room = roomDocument.data();
      if (room.status !== "playing" || room.currentMatchId !== matchId) throw new Error("No active match");
      const ref = matchRef(roomId, matchId); const snapshot = await tx.get(ref); const current = snapshot.data();
      const expected = current.currentTurn === "X" ? current.playerX : current.playerO;
      if (expected !== uid) throw new Error("Not your turn");
      const approvedSuggestion = current.approvedSpectatorId && current.approvedSuggestionMoveCount === current.moveCount
        ? (await tx.get(suggestionRef(roomId, matchId, current.approvedSpectatorId))).data()
        : null;
      const next = makeMove(current, index); terminal = next.status !== "playing";
      const assisted = next.status === "won" && approvedSuggestion?.status === "suggested" && approvedSuggestion.suggestedCell === index;
      tx.update(ref, { board: next.board, currentTurn: next.currentTurn, status: next.status, winner: next.winner, winningLine: next.winningLine || [], moveCount: next.moveCount, approvedSpectatorId: null, approvedSuggestionMoveCount: -1, assistSpectatorId: assisted ? approvedSuggestion.spectatorId : null, assistAvatarId: assisted ? approvedSuggestion.spectatorAvatarId : null, updatedAt: serverTimestamp() });
    });
    if (!terminal) return;
    await runTransaction(db, async tx => {
      const roomDocument = await tx.get(roomRef(roomId)); const room = roomDocument.data();
      if (room.status !== "playing" || room.currentMatchId !== matchId) return;
      const ref = matchRef(roomId, matchId); const snapshot = await tx.get(ref); const current = snapshot.data();
      if (!current || current.status === "playing" || current.scoreApplied) return;
      const xRef = playerRef(roomId, current.playerX); const oRef = playerRef(roomId, current.playerO);
      const terminalReads = [tx.get(xRef), tx.get(oRef)];
      if (current.seriesId) terminalReads.push(tx.get(seriesRef(roomId, current.seriesId)));
      const [xSnapshot, oSnapshot, seriesSnapshot = null] = await Promise.all(terminalReads);
      tx.update(ref, { scoreApplied: true, updatedAt: serverTimestamp() });
      const xPoints = current.status === "draw" ? 1 : current.winner === "X" ? 3 : 0;
      const oPoints = current.status === "draw" ? 1 : current.winner === "O" ? 3 : 0;
      if (xPoints) tx.update(xRef, { partyScore: xSnapshot.data().partyScore + xPoints });
      if (oPoints) tx.update(oRef, { partyScore: oSnapshot.data().partyScore + oPoints });
      if (current.seriesId && seriesSnapshot) {
        const winnerId = current.winner === "X" ? current.playerX : current.winner === "O" ? current.playerO : null;
        const settledSeries = settleSeriesRound(seriesSnapshot.data(), winnerId);
        tx.update(seriesRef(roomId, current.seriesId), { winsByPlayer: settledSeries.winsByPlayer, roundsPlayed: settledSeries.roundsPlayed, status: settledSeries.status, winnerId: settledSeries.winnerId, scoreApplied:settledSeries.status!=="playing", updatedAt: serverTimestamp() });
        tx.update(roomRef(roomId), { status: settledSeries.status === "playing" ? "roundOver" : "seriesBreak", updatedAt: serverTimestamp() });
      } else tx.update(roomRef(roomId), { status: "roundOver", updatedAt: serverTimestamp() });
    });
  }

  async function moveGomoku(roomId,matchId,row,column) {
    let terminal=false;
    await runTransaction(db,async tx=>{
      const room=(await tx.get(roomRef(roomId))).data();
      if(room.status!=="playing"||room.currentMatchId!==matchId||normalizeGameType(room.activeGameType)!=="gomoku")throw new Error("No active Gomoku match");
      const ref=matchRef(roomId,matchId),current=(await tx.get(ref)).data();
      const stone=current.currentTurn,expected=stone===BLACK?current.playerBlack:current.playerWhite;
      if(expected!==uid)throw new Error("Not your turn");
      if(!Number.isInteger(row)||!Number.isInteger(column)||row<0||row>14||column<0||column>14)throw new Error("Invalid intersection");
      const moveNumber=current.moveCount+1,moveDocument=moveRef(roomId,matchId,moveNumber),moveId=`move-${moveNumber}`,cellKey=row*15+column;
      const specs=[{type:"row",lineIndex:row,cellIndex:column},{type:"column",lineIndex:column,cellIndex:row},{type:"down",lineIndex:row-column+14,cellIndex:row},{type:"up",lineIndex:row+column,cellIndex:row}];
      const projectionDocuments=specs.map(spec=>projectionRef(roomId,matchId,spec.type,spec.lineIndex));
      const reads=await Promise.all([tx.get(moveDocument),...projectionDocuments.map(item=>tx.get(item))]);
      if(reads[0].exists())throw new Error("Move already exists");
      const projections=specs.map((spec,index)=>{const cells=reads[index+1].exists()?[...reads[index+1].data().cells]:Array(15).fill(null);if(cells[spec.cellIndex]!==null)throw new Error("Intersection is occupied");cells[spec.cellIndex]=stone;return{...spec,cells};});
      const winningProjection=projections.map(item=>({...item,start:winningWindow(item.cells,item.cellIndex,stone)})).find(item=>item.start!==null),result=winningProjection?"won":moveNumber===225?"draw":"playing";
      terminal=result!=="playing";const winningProofCells=winningProjection?projectionCells(winningProjection):[];
      tx.set(moveDocument,{moveNumber,moveId,cellKey,playerId:uid,stone,row,column,createdAt:serverTimestamp()});
      projections.forEach((projection,index)=>tx.set(projectionDocuments[index],{lineType:projection.type,lineIndex:projection.lineIndex,cells:projection.cells,updatedAt:serverTimestamp()}));
      tx.update(ref,{currentTurn:result==="playing"?(stone===BLACK?WHITE:BLACK):stone,status:result,winner:result==="won"?stone:null,winningProofCells,winDirection:winningProjection?.type||null,winStart:winningProjection?.start??null,moveCount:moveNumber,lastMoveId:moveId,lastPlayerId:uid,lastMoveRow:row,lastMoveColumn:column,approvedSpectatorId:null,approvedSuggestionMoveCount:-1,assistSpectatorId:null,assistAvatarId:null,updatedAt:serverTimestamp()});
    });
    if(terminal)await settleGomokuMatch(roomId,matchId);
  }

  async function settleGomokuMatch(roomId,matchId){
    await runTransaction(db,async tx=>{const roomRefValue=roomRef(roomId),room=(await tx.get(roomRefValue)).data();if(room.status!=="playing"||room.currentMatchId!==matchId)return;const ref=matchRef(roomId,matchId),current=(await tx.get(ref)).data();if(!current||current.status==="playing"||current.scoreApplied)return;const blackRef=playerRef(roomId,current.playerBlack),whiteRef=playerRef(roomId,current.playerWhite);const [blackSnapshot,whiteSnapshot,seriesSnapshot]=await Promise.all([tx.get(blackRef),tx.get(whiteRef),tx.get(seriesRef(roomId,current.seriesId))]);tx.update(ref,{scoreApplied:true,updatedAt:serverTimestamp()});const blackPoints=current.status==="draw"?1:current.winner===BLACK?3:0,whitePoints=current.status==="draw"?1:current.winner===WHITE?3:0;if(blackPoints)tx.update(blackRef,{partyScore:blackSnapshot.data().partyScore+blackPoints});if(whitePoints)tx.update(whiteRef,{partyScore:whiteSnapshot.data().partyScore+whitePoints});const winnerId=current.winner===BLACK?current.playerBlack:current.winner===WHITE?current.playerWhite:null;const settled=settleSeriesRound(seriesSnapshot.data(),winnerId);tx.update(seriesRef(roomId,current.seriesId),{winsByPlayer:settled.winsByPlayer,roundsPlayed:settled.roundsPlayed,status:settled.status,winnerId:settled.winnerId,scoreApplied:settled.status!=="playing",updatedAt:serverTimestamp()});tx.update(roomRefValue,{status:settled.status==="playing"?"roundOver":"seriesBreak",updatedAt:serverTimestamp()});});
  }

  async function raiseHand(roomId, matchId) {
    await runTransaction(db, async tx => {
      const room = (await tx.get(roomRef(roomId))).data(); const match = (await tx.get(matchRef(roomId, matchId))).data();
      const spectator = (await tx.get(playerRef(roomId, uid))).data();
      if (!room || room.status !== "playing" || room.currentMatchId !== matchId) throw new Error("No active match");
      if ((spectator?.role || "player") !== "spectator") throw new Error("Spectators only");
      const ref = suggestionRef(roomId, matchId, uid); const prior = (await tx.get(ref)).data();
      if (prior?.moveCount === match.moveCount) throw new Error("Hand already handled this turn");
      tx.set(ref, { roomId, seriesId: room.currentSeriesId, matchId, moveCount: match.moveCount, spectatorId: uid, spectatorAvatarId: spectator.avatarId || avatarFromLegacyEmoji(spectator.emoji).id, spectatorEmoji: spectator.emoji, spectatorName: `Player ${spectator.seat + 1}`, status: "raised", suggestedCell: null, approvedBy: null, createdAt: serverTimestamp(), approvedAt: null, suggestedAt: null });
    });
  }

  async function reviewHand(roomId, matchId, spectatorId, decision) {
    if (!["approved", "dismissed"].includes(decision)) throw new Error("Invalid hand decision");
    await runTransaction(db, async tx => {
      const matchDocument = matchRef(roomId, matchId); const match = (await tx.get(matchDocument)).data();
       const expected = match.gameType === "gomoku" ? (match.currentTurn === BLACK ? match.playerBlack : match.playerWhite) : (match.currentTurn === "X" ? match.playerX : match.playerO);
      if (expected !== uid || match.status !== "playing") throw new Error("Current player only");
      const ref = suggestionRef(roomId, matchId, spectatorId); const suggestion = (await tx.get(ref)).data();
      if (!suggestion || suggestion.status !== "raised" || suggestion.moveCount !== match.moveCount) throw new Error("Hand request expired");
      if (decision === "approved" && match.approvedSuggestionMoveCount === match.moveCount) throw new Error("Another spectator is already approved");
      tx.update(ref, { status: decision, approvedBy: decision === "approved" ? uid : null, approvedAt: decision === "approved" ? serverTimestamp() : null });
      if (decision === "approved") tx.update(matchDocument, { approvedSpectatorId: spectatorId, approvedSuggestionMoveCount: match.moveCount, updatedAt: serverTimestamp() });
    });
  }

  async function suggestCell(roomId, matchId, suggestedCell) {
    await runTransaction(db, async tx => {
      const room = (await tx.get(roomRef(roomId))).data(); const match = (await tx.get(matchRef(roomId, matchId))).data();
      const ref = suggestionRef(roomId, matchId, uid); const suggestion = (await tx.get(ref)).data();
      if (!room || room.status !== "playing" || room.currentMatchId !== matchId || match.status !== "playing") throw new Error("No active match");
      if (!suggestion || suggestion.status !== "approved" || suggestion.moveCount !== match.moveCount || match.approvedSpectatorId !== uid || match.approvedSuggestionMoveCount !== match.moveCount) throw new Error("Wait for the current player to approve your hand");
      if (!Number.isInteger(suggestedCell) || suggestedCell < 0 || suggestedCell > 8 || match.board[suggestedCell] !== null) throw new Error("Choose an empty square");
      tx.update(ref, { status: "suggested", suggestedCell, suggestedAt: serverTimestamp() });
    });
  }

  async function suggestGomoku(roomId,matchId,row,column){
    await runTransaction(db,async tx=>{const room=(await tx.get(roomRef(roomId))).data(),match=(await tx.get(matchRef(roomId,matchId))).data(),ref=suggestionRef(roomId,matchId,uid),suggestion=(await tx.get(ref)).data();if(!room||room.status!=="playing"||room.currentMatchId!==matchId||match.gameType!=="gomoku"||match.status!=="playing")throw new Error("No active Gomoku match");if(!suggestion||suggestion.status!=="approved"||suggestion.moveCount!==match.moveCount||match.approvedSpectatorId!==uid)throw new Error("Wait for approval");if(!Number.isInteger(row)||!Number.isInteger(column)||row<0||row>14||column<0||column>14)throw new Error("Choose an empty intersection");const rowProjection=(await tx.get(projectionRef(roomId,matchId,"row",row))).data();if(rowProjection?.cells?.[column])throw new Error("Choose an empty intersection");tx.update(ref,{status:"suggested",suggestedCell:null,suggestedRow:row,suggestedColumn:column,suggestedAt:serverTimestamp()});});
  }

  async function muteSuggestions(roomId, matchId) {
    await runTransaction(db, async tx => {
      const ref = matchRef(roomId, matchId); const match = (await tx.get(ref)).data();
       const expected = match.gameType === "gomoku" ? (match.currentTurn === BLACK ? match.playerBlack : match.playerWhite) : (match.currentTurn === "X" ? match.playerX : match.playerO);
      if (expected !== uid || match.status !== "playing") throw new Error("Current player only");
      tx.update(ref, { suggestionsMutedMoveCount: match.moveCount, updatedAt: serverTimestamp() });
    });
  }

  async function endParty(roomId) {
    await runTransaction(db, async tx => {
      const ref = roomRef(roomId); const snapshot = await tx.get(ref); const room = snapshot.data();
      if (room.hostId !== uid) throw new Error("Host only");
      if (!["seriesBreak","seriesOver"].includes(room.status)) throw new Error("Series is not over");
      tx.update(ref, { status: "partyOver", updatedAt: serverTimestamp() });
    });
  }

  return Object.freeze({ uid, create, join, preview, resume, probe, watch, start, move, moveGomoku, nextMatch, nextSeries, updateSelectedGame, updateSeriesSetting, setRole, requestRole, raiseHand, reviewHand, suggestCell, suggestGomoku, muteSuggestions, endParty });
}

function matchData(playerX, playerO, roundNumber, seriesId, seriesRoundNumber,gameType=DEFAULT_GAME_TYPE) {
  if(gameType==="gomoku")return {gameType,playerBlack:playerX,playerWhite:playerO,currentTurn:BLACK,status:"playing",winner:null,winningProofCells:[],winDirection:null,winStart:null,moveCount:0,scoreApplied:false,roundNumber,seriesId,seriesRoundNumber,lastMoveId:null,lastPlayerId:null,lastMoveRow:null,lastMoveColumn:null,suggestionsMutedMoveCount:-1,approvedSpectatorId:null,approvedSuggestionMoveCount:-1,assistSpectatorId:null,assistAvatarId:null,createdAt:serverTimestamp(),updatedAt:serverTimestamp()};
  const game = createGame();
  return { gameType: "tic-tac-toe", playerX, playerO, board: game.board, currentTurn: game.currentTurn, status: game.status, winner: game.winner, winningLine: [], moveCount: game.moveCount, scoreApplied: false, roundNumber, seriesId, seriesRoundNumber, suggestionsMutedMoveCount: -1, approvedSpectatorId: null, approvedSuggestionMoveCount: -1, assistSpectatorId: null, assistAvatarId: null, createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
}

function winningWindow(cells,index,stone){for(let start=Math.max(0,index-4);start<=Math.min(10,index);start+=1)if(cells.slice(start,start+5).every(cell=>cell===stone))return start;return null;}
function projectionCells({type,lineIndex,start}){
  return Array.from({length:5},(_,offset)=>{const position=start+offset;if(type==="row")return lineIndex*15+position;if(type==="column")return position*15+lineIndex;if(type==="down")return position*15+(position-lineIndex+14);return position*15+(lineIndex-position);});
}

function playerData(uid, avatar, seat, role, joinedDuringSeries = false) {
  return { playerId: uid, avatarId: avatar.id, emoji: avatar.emoji, seat, role, requestedRole: null, joinedDuringSeries, partyScore: 0, joinedAt: serverTimestamp(), lastSeenAt: serverTimestamp(), roleUpdatedAt: serverTimestamp(), status: "active" };
}

function validateAvatarId(avatarId) {
  if (typeof avatarId !== "string" || !AVATAR_IDS.includes(avatarId)) throw new Error("Invalid avatarId");
}

function avatarTakenError(usedAvatarIds) {
  const error = new Error("That avatar just joined the party. Please choose another.");
  error.code = "avatar-taken";
  error.availableAvatarIds = availableAvatars(usedAvatarIds, 3).map(avatar => avatar.id);
  return error;
}
