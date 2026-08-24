import { createFirebaseServices, localEmulatorConfig } from "./services/firebase-service.js?v=reconnect-20260824";
import { createFirebaseRoomService } from "./services/firebase-room-service.js?v=reconnect-20260824";
import { createGame, makeMove } from "./games/tic-tac-toe/rules.js";
import { chooseRandomMove } from "./games/tic-tac-toe/simple-ai.js";
import { presetForTarget } from "./core/series.js";
import { normalizeRoomCode, roomShareUrl } from "./core/room-code.js";

export async function mountFirebaseApp(container, options = {}) {
  const emulator = options.emulator ?? true;
  const config = options.config ?? localEmulatorConfig;
  const backendLabel = emulator ? "LOCAL EMULATOR" : "FIREBASE";
  const sessionKey = `cyberTable.activeRoom.${emulator ? "emulator" : "firebase"}`;
  let api, room, roomId, stopWatch, reconnectTimer, healthTimer, reconnectAttempt = 0;
  let waitingPractice = false, waitingGame = createGame(), waitingComputerTimer = null, lobbyNotice = "";
  let suggesting = false, acceptedSuggestion = null;
  let connection = navigator.onLine ? "connecting" : "offline";
  const renderError = error => { connection = "error"; renderHome(error?.message || `${backendLabel} unavailable`); };
  const statusText = () => ({ connecting: `CONNECTING TO ${backendLabel}…`, synced: `SYNCED · ${backendLabel}`, offline: "OFFLINE · WAITING TO RECONNECT", error: `${backendLabel} UNAVAILABLE` })[connection];

  function shell(content, className = "") { container.innerHTML = `<section class="app-shell emulator-screen ${className}"><div class="connection" data-state="${connection}" role="status">${statusText()}</div>${content}</section>`; }
  function action(label, name, kind = "button") { return `<button class="${kind}" data-fb-action="${name}">${label}</button>`; }
  function renderHome(message = "") { shell(`<div><p class="eyebrow">${backendLabel}</p><h1 class="brand">Cyber <span>Table</span></h1><p class="tagline">Two real anonymous identities · ${emulator ? "local services only" : "independent Spark project"}</p></div><div class="hero-art"><span>🤖 💗 🐼 ⭐ 🐰</span></div><div class="actions">${action(`CREATE ${emulator ? "EMULATOR " : ""}ROOM`, "create", "button button-primary")}${action("JOIN WITH CODE", "join", "button button-purple")}${action("COMPUTER PRACTICE", "local", "button button-ghost")}</div><p class="note">${message}</p>`); }
  function renderJoin() { const params = new URLSearchParams(location.search); const sharedCode = normalizeRoomCode(params.get("room")).replace(/[^A-Z0-9]/g, "").slice(0, 5); const defaultRole = params.get("role") === "spectator" ? "spectator" : "player"; shell(`<div><p class="eyebrow">${backendLabel}</p><h1>Join room</h1><p class="tagline">Players and spectators use the same five-character code. After a game starts, new members can only spectate. A room code is not a password.</p></div><label class="room-entry">ROOM CODE<input id="fb-code" maxlength="12" value="${sharedCode}" placeholder="TST42" autocomplete="off"></label><div class="join-role-actions">${action("JOIN AS PLAYER / 作为玩家加入", "join-player", `button ${defaultRole === "player" ? "button-primary" : "button-ghost"}`)}${action("JOIN AS SPECTATOR / 作为观众加入", "join-spectator", `button ${defaultRole === "spectator" ? "button-purple" : "button-ghost"}`)}</div>${action("BACK", "home", "button button-ghost")}<p class="note" role="status"></p>`); }
  function renderRoom() {
    if (!room) return;
    const host = room.hostId === api.uid; const match = room.match;
    if (room.status === "partyOver") return renderPodium();
    if (room.status === "lobby" && waitingPractice) return renderWaitingPractice();
    if (["playing", "roundOver", "seriesOver", "seriesBreak"].includes(room.status)) {
      if (match) return renderMatch(host, match);
      return renderMatchLoading();
    }
    const activePlayers = room.players.filter(player => (player.role || "player") === "player");
    const spectators = room.players.filter(player => player.role === "spectator");
    const preset = presetForTarget(room.settings.seriesTargetWins || 2);
    const playerCard = player => `<div class="player"><span>${player.emoji}</span><strong>${player.playerId === api.uid ? "YOU" : `SEAT ${player.seat + 1}`}</strong><small>${player.playerId === room.hostId ? "HOST · " : ""}${player.role === "spectator" ? "SPECTATOR" : "PLAYER"}</small>${(host || player.playerId === api.uid) ? `<button class="role-toggle" data-fb-action="role" data-player-id="${player.playerId}" data-role="${player.role === "player" ? "spectator" : "player"}">SWITCH TO ${player.role === "player" ? "SPECTATOR" : "PLAYER"}</button>` : ""}</div>`;
    const seriesPicker = host
      ? `<fieldset class="series-picker"><legend>SERIES FORMAT</legend>${[1,2,3].map(target => `<button data-fb-action="series-setting" data-target-wins="${target}" class="${target === preset.targetWins ? "selected" : ""}">${presetForTarget(target).label}</button>`).join("")}</fieldset>`
      : `<div class="turn-banner">${preset.label} · FIRST TO ${preset.targetWins} WINS</div>`;
    shell(`<div><p class="eyebrow">Lobby ${host ? "· HOST" : ""}</p><h1>Room ${room.roomCode}</h1><p class="tagline">Five-character room codes are convenient join keys, not passwords or security credentials.</p><p class="room-capacity" aria-label="Room ${room.memberCount} of ${room.settings.maxMembers || room.settings.maxPlayers || 8}">ROOM ${room.memberCount}/${room.settings.maxMembers || room.settings.maxPlayers || 8} · PLAYERS ${activePlayers.length}/${room.settings.maxActivePlayers || 6} · SPECTATORS ${spectators.length}</p></div><div class="room-code-card"><span>ROOM CODE</span><strong>${room.roomCode}</strong><a href="${roomShareUrl(location.href, room.roomCode, "player")}">SHARE PLAYER LINK</a><a href="${roomShareUrl(location.href, room.roomCode, "spectator")}">SHARE SPECTATOR LINK</a></div>${seriesPicker}<details open><summary>PLAYERS / 参赛玩家 · ${activePlayers.length}/${room.settings.maxActivePlayers || 6}</summary><div class="player-list">${activePlayers.map(playerCard).join("") || `<p class="note">No active players</p>`}</div></details><details open><summary>SPECTATORS / 观众 · ${spectators.length}</summary><div class="player-list">${spectators.map(playerCard).join("") || `<p class="note">No spectators yet</p>`}</div></details><p class="note" role="status">${lobbyNotice}</p>${action("PRACTICE WHILE WAITING / 等待时练习", "waiting-practice", "button button-purple")}${host ? `<button class="button button-primary" data-fb-action="start" ${activePlayers.length < 2 ? "disabled" : ""}>START ${preset.label}</button>` : `<p class="note">Waiting for host…</p>`}${action("LEAVE VIEW", "home", "button button-ghost")}`);
  }
  function waitingResult() { return waitingGame.status === "draw" ? "PRACTICE DRAW" : waitingGame.status === "won" ? (waitingGame.winner === "X" ? "YOU WIN" : "COMPUTER WINS") : waitingGame.currentTurn === "X" ? "YOUR PRACTICE TURN" : "COMPUTER THINKING"; }
  function renderWaitingPractice() {
    const won = new Set(waitingGame.winningLine || []);
    shell(`<header class="game-header"><p class="eyebrow">LOCAL PRACTICE · ROOM ${room.roomCode} STILL SYNCED</p><h1>Practice while waiting / 等待时练习</h1></header><div class="turn-banner" role="status">${lobbyNotice || "Room listening continues. Practice never changes party points."}</div><div class="board" role="grid" aria-label="Waiting practice board">${waitingGame.board.map((mark,index)=>`<button class="cell ${won.has(index)?"winner":""}" data-fb-action="waiting-cell" data-index="${index}" data-mark="${mark||""}" aria-label="Practice square ${index+1}${mark?`, ${mark}`:""}" ${mark||waitingGame.status!=="playing"||waitingGame.currentTurn!=="X"?"disabled":""}>${mark||""}</button>`).join("")}</div><p class="status" role="status">${waitingResult()}</p>${waitingGame.status !== "playing" ? action("PRACTICE AGAIN", "waiting-practice-reset", "button button-primary") : ""}${action("RETURN TO LOBBY / 返回大厅", "return-lobby", "button button-ghost")}`, "practice waiting-practice");
  }
  function waitingComputerMove() { if (!waitingPractice || waitingGame.status !== "playing" || waitingGame.currentTurn !== "O") return; const cell = chooseRandomMove(waitingGame); if (cell !== null) waitingGame = makeMove(waitingGame, cell); renderWaitingPractice(); }
  function renderMatchLoading() {
    shell(`<header class="game-header"><p class="eyebrow">PLAY</p><h1>Loading match…</h1></header><div class="turn-banner" role="status">Synchronizing the latest match. No refresh is needed.</div>`, "practice");
  }
  function renderMatch(host, match) {
    const active = [match.playerX, match.playerO].includes(api.uid); const expected = match.currentTurn === "X" ? match.playerX : match.playerO; const canMove = match.status === "playing" && expected === api.uid;
    const player = id => room.players.find(item => item.playerId === id);
    const terminal = match.status !== "playing"; const spectator = room.players.find(item => item.playerId === api.uid)?.role === "spectator";
    const winnerPlayer = match.winner === "X" ? player(match.playerX) : match.winner === "O" ? player(match.playerO) : null;
    const series = room.series; const seriesOver = ["seriesOver","seriesBreak"].includes(room.status);
    const title = seriesOver ? (series?.status === "draw" ? "SERIES DRAW" : `${room.players.find(item=>item.playerId===series?.winnerId)?.emoji||""} SERIES WIN`) : match.status === "draw" ? "ROUND DRAW" : terminal ? `${winnerPlayer?.emoji || ""} ROUND WIN` : canMove ? "Your turn" : active ? "Opponent's turn" : "Live spectator view";
    const status = match.status === "draw" ? "DRAW · BOTH PLAYERS +1 POINT" : terminal ? `${winnerPlayer?.emoji || ""} ${match.winner} WINS · +3 POINTS` : active ? `${match.currentTurn}'s TURN` : "YOU ARE SPECTATING · READ ONLY";
    const winning = new Set(match.winningLine || []);
    const controls = room.status === "roundOver"
      ? host
        ? `<div class="game-actions">${action("NEXT ROUND", "next", "button button-primary")}</div>`
        : `<p class="turn-banner" role="status">Waiting for the host to continue this series.</p>`
      : seriesOver ? host
        ? `<div class="game-actions">${action("NEXT SERIES", "next-series", "button button-primary")}${action("END PARTY", "end", "button button-ghost")}</div>`
        : `<p class="turn-banner" role="status">Waiting for the host to confirm the next player pool.</p>` : "";
    const scoreA = series?.winsByPlayer?.[series.playerA] || 0, scoreB = series?.winsByPlayer?.[series.playerB] || 0;
    const pending = (room.suggestions || []).filter(item => item.status === "pending" && item.moveCount === match.moveCount);
    const suggestionsMuted = match.suggestionsMutedMoveCount === match.moveCount;
    const suggestionControls = canMove && !suggestionsMuted && pending.length ? `<section class="suggestions"><h2>Suggestions</h2>${pending.map(item=>`<div><span>${item.spectatorEmoji} suggests square ${item.suggestedCell+1}.</span><button data-fb-action="suggest-accept" data-spectator-id="${item.spectatorId}" data-cell="${item.suggestedCell}">ACCEPT SUGGESTION</button><button data-fb-action="suggest-dismiss" data-spectator-id="${item.spectatorId}">DISMISS</button></div>`).join("")}${action("MUTE SUGGESTIONS THIS TURN", "suggest-mute", "button button-ghost")}</section>` : "";
    const spectatorControl = spectator && match.status === "playing" ? `<div class="suggestions">${action(suggesting ? "SELECT AN EMPTY SQUARE" : "RAISE HAND / 举手", "raise-hand", "button button-purple")}<p class="note">One suggestion per turn. A suggestion never places a formal move.</p></div>` : "";
    const me = player(api.uid); const breakControls = seriesOver ? `<section class="role-break"><h2>SERIES BREAK / 系列间准备</h2>${me?.role === "spectator" ? action(me.requestedRole === "player" ? "PLAYER REQUEST PENDING / 参赛申请待确认" : "JOIN PLAYER QUEUE / 申请参赛", "request-player", "button button-purple") : action("BECOME SPECTATOR NEXT SERIES / 下一系列转为观众", "request-spectator", "button button-ghost")}<p class="note">The host confirms the player pool before NEXT SERIES. Seat and Party Score stay unchanged.</p>${host ? room.players.filter(item=>item.requestedRole === "player").map(item=>`<button class="role-toggle" data-fb-action="role" data-player-id="${item.playerId}" data-role="player">APPROVE ${item.emoji} AS PLAYER</button>`).join("") : ""}</section>` : "";
    shell(`<header class="game-header"><p class="eyebrow">${active ? "PLAYER" : "SPECTATOR"}${host ? " · HOST" : ""} · YOU</p><h1>${title}</h1>${lobbyNotice ? `<div class="turn-banner" role="status">${lobbyNotice}</div>` : ""}${spectator ? `<div class="turn-banner">YOU ARE SPECTATING / 你正在观战 · BOARD IS READ ONLY</div>` : ""}<div class="series-score" aria-label="Series score ${scoreA} to ${scoreB}"><strong>SERIES: ${scoreA}–${scoreB}</strong><span>ROUND: ${match.seriesRoundNumber || 1}</span><span>FIRST TO ${series?.targetWins || room.settings.seriesTargetWins || 2} WINS</span></div></header><div class="matchup"><div class="player">${player(match.playerX)?.emoji}<strong>X</strong></div><strong>VS</strong><div class="player">${player(match.playerO)?.emoji}<strong>O</strong></div></div><div class="board" role="grid" aria-label="Tic-Tac-Toe board">${match.board.map((mark,index)=>{const suggested=acceptedSuggestion?.cell===index&&acceptedSuggestion?.moveCount===match.moveCount; const canSuggest=spectator&&suggesting&&!mark&&match.status==="playing"; return `<button class="cell ${winning.has(index) ? "winner" : ""} ${suggested?"suggested":""}" aria-label="Square ${index + 1}${mark ? `, ${mark}` : ""}${winning.has(index) ? ", winning line" : ""}${suggested?`, accepted suggestion from ${acceptedSuggestion.emoji}`:""}" data-fb-action="${canSuggest?"suggest-cell":"cell"}" data-index="${index}" data-mark="${mark||""}" ${(!canMove&&!canSuggest)||mark?"disabled":""}>${mark||""}${suggested?`<span class="suggestion-halo" aria-hidden="true">✋${acceptedSuggestion.emoji}</span>`:""}</button>`;}).join("")}</div><p class="status" role="status">${status}</p><p class="sr-status" aria-live="polite">${acceptedSuggestion ? `${acceptedSuggestion.emoji} suggests square ${acceptedSuggestion.cell + 1}. You still choose the official move.` : ""}</p>${suggestionControls}${spectatorControl}${breakControls}${controls}${action("LEAVE VIEW", "home", "button button-ghost")}`, "practice");
  }
  function renderPodium() {
    const leaders = [...room.players].sort((a, b) => b.partyScore - a.partyScore || a.seat - b.seat).slice(0, 3);
    shell(`<header class="game-header"><p class="eyebrow">Great game, everyone! 💗</p><h1>Party Podium</h1></header><div class="podium">${leaders.map((player, index) => `<div class="podium-place"><span>${player.emoji}</span><strong>#${index + 1}</strong><b>${player.partyScore} pts</b>${player.playerId === api.uid ? "<small>YOU</small>" : ""}</div>`).join("")}</div>${action("BACK HOME", "home", "button button-primary")}`);
  }
  function rememberRoom(id) { sessionStorage.setItem(sessionKey, id); }
  function forgetRoom() { sessionStorage.removeItem(sessionKey); }
  function stopRealtime() { stopWatch?.(); stopWatch = null; clearTimeout(reconnectTimer); clearInterval(healthTimer); }
  function mergeProbe(value) {
    room = { ...room, ...value, players: value.players || room?.players || [] };
    connection = "synced"; reconnectAttempt = 0; renderRoom();
  }
  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    if (!api || !roomId || !navigator.onLine) return;
    const delay = Math.min(1000 * (2 ** reconnectAttempt++), 10000);
    reconnectTimer = setTimeout(() => restartRealtime(), delay);
  }
  function isTerminalRoomError(error) {
    return ["permission-denied", "not-found"].includes(error?.code);
  }
  function watchError(error) {
    if (isTerminalRoomError(error)) {
      stopRealtime(); forgetRoom(); room = null; roomId = null; connection = "error";
      renderHome("Previous room is no longer available to this device."); return;
    }
    connection = navigator.onLine ? "connecting" : "offline";
    if (room) renderRoom();
    scheduleReconnect();
  }
  function startHealthCheck() {
    clearInterval(healthTimer);
    healthTimer = setInterval(async () => {
      if (!api || !roomId || !room || !navigator.onLine || document.hidden || room.status === "lobby") return;
      try { mergeProbe(await api.probe(roomId)); }
      catch { scheduleReconnect(); }
    }, 15000);
  }
  function restartRealtime() {
    if (!api || !roomId) return;
    stopWatch?.(); connection = navigator.onLine ? "connecting" : "offline"; renderRoom();
    stopWatch = api.watch(roomId, value => {
      const prior = room;
      if (waitingPractice && prior?.status === "lobby" && value.status === "lobby" && (prior.players?.length !== value.players?.length || prior.players?.some((player,index)=>player.role !== value.players?.[index]?.role))) lobbyNotice = "Lobby players or roles changed while you practiced.";
      if (value.status !== "lobby") { const leftPractice = waitingPractice || prior?.status === "lobby"; waitingPractice = false; clearTimeout(waitingComputerTimer); if (leftPractice) lobbyNotice = "Formal series started — practice closed automatically."; }
      if (acceptedSuggestion && value.match?.moveCount !== acceptedSuggestion.moveCount) acceptedSuggestion = null;
      clearTimeout(reconnectTimer); reconnectAttempt = 0; connection = "synced"; room = value; renderRoom();
    }, watchError);
  }
  async function open(id) {
    roomId = id; rememberRoom(id); restartRealtime(); startHealthCheck();
  }

  container.addEventListener("click", async event => {
    const target = event.target.closest("[data-fb-action]"); if (!target) return;
    try {
      const name = target.dataset.fbAction;
      if (name === "local") location.href = `${location.pathname}?backend=local`;
      if (name === "home") { stopRealtime(); forgetRoom(); room = null; roomId = null; lobbyNotice = ""; waitingPractice = false; renderHome(); }
      if (name === "join") renderJoin();
      if (name === "create") { target.disabled = true; lobbyNotice = ""; await open(await api.create()); }
      if (["join-player","join-spectator"].includes(name)) { target.disabled = true; const requestedRole = name === "join-player" ? "player" : "spectator"; const result = await api.join(document.querySelector("#fb-code").value, requestedRole); lobbyNotice = result.reason === "gameStarted" ? "Game already started. You joined as a spectator. / 比赛已经开始，你已作为观众加入。" : result.reason === "playerPoolFull" ? "Player pool is full. You joined as a spectator. / 参赛池已满，你已作为观众加入。" : `Joined as ${result.role}.`; await open(result.roomId); }
      if (name === "start") { target.disabled = true; await api.start(roomId); }
      if (name === "cell") { target.disabled = true; await api.move(roomId, room.currentMatchId, Number(target.dataset.index)); }
      if (name === "next") { target.disabled = true; await api.nextMatch(roomId); }
      if (name === "next-series") { target.disabled = true; await api.nextSeries(roomId); }
      if (name === "end") { target.disabled = true; await api.endParty(roomId); }
      if (name === "series-setting") { target.disabled = true; await api.updateSeriesSetting(roomId, Number(target.dataset.targetWins)); }
      if (name === "role") { target.disabled = true; await api.setRole(roomId, target.dataset.playerId, target.dataset.role); }
      if (name === "request-player") { target.disabled = true; await api.requestRole(roomId, "player"); }
      if (name === "request-spectator") { target.disabled = true; await api.requestRole(roomId, "spectator"); }
      if (name === "waiting-practice") { waitingPractice = true; waitingGame = createGame(); lobbyNotice = "Lobby remains connected. Practice does not affect party scores."; renderWaitingPractice(); }
      if (name === "waiting-practice-reset") { waitingGame = createGame(); renderWaitingPractice(); }
      if (name === "return-lobby") { waitingPractice = false; clearTimeout(waitingComputerTimer); renderRoom(); }
      if (name === "waiting-cell") { waitingGame = makeMove(waitingGame, Number(target.dataset.index)); renderWaitingPractice(); if (waitingGame.status === "playing") waitingComputerTimer = setTimeout(waitingComputerMove, 350); }
      if (name === "raise-hand") { suggesting = !suggesting; renderRoom(); }
      if (name === "suggest-cell") { target.disabled = true; await api.suggest(roomId, room.currentMatchId, Number(target.dataset.index)); suggesting = false; }
      if (name === "suggest-accept") { target.disabled = true; const suggestion = room.suggestions.find(item=>item.spectatorId===target.dataset.spectatorId); await api.resolveSuggestion(roomId, room.currentMatchId, target.dataset.spectatorId, "accepted"); acceptedSuggestion = { cell: Number(target.dataset.cell), emoji: suggestion?.spectatorEmoji || "👤", moveCount: room.match.moveCount }; renderRoom(); }
      if (name === "suggest-dismiss") { target.disabled = true; await api.resolveSuggestion(roomId, room.currentMatchId, target.dataset.spectatorId, "dismissed"); }
      if (name === "suggest-mute") { target.disabled = true; await api.muteSuggestions(roomId, room.currentMatchId); }
    } catch (error) { renderError(error); }
  });
  addEventListener("offline", () => { clearTimeout(reconnectTimer); connection = "offline"; room ? renderRoom() : renderHome(); });
  addEventListener("online", () => { connection = "connecting"; room ? renderRoom() : renderHome(); restartRealtime(); });
  addEventListener("visibilitychange", () => { if (!document.hidden && roomId && navigator.onLine) restartRealtime(); });

  renderHome();
  try {
    const deviceId = sessionStorage.getItem("cyberTable.emulatorDevice") || crypto.randomUUID();
    sessionStorage.setItem("cyberTable.emulatorDevice", deviceId);
    const services = await createFirebaseServices({ config, emulator, appName: `cyber-table-${emulator ? "emulator" : "production"}-${deviceId}` });
    api = createFirebaseRoomService(services);
    const rememberedRoom = sessionStorage.getItem(sessionKey);
    if (rememberedRoom) {
      try {
        if (navigator.onLine) await api.resume(rememberedRoom);
        await open(rememberedRoom);
      }
      catch (error) {
        if (!navigator.onLine || ["unavailable", "auth/network-request-failed"].includes(error?.code)) {
          connection = navigator.onLine ? "connecting" : "offline";
          renderHome("Restoring your previous room when the connection returns…");
          await open(rememberedRoom);
        } else {
          forgetRoom(); connection = "synced";
          renderHome(`Previous room could not be restored: ${error.message}`);
        }
      }
    } else { connection = "synced"; new URLSearchParams(location.search).has("room") ? renderJoin() : renderHome(); }
  }
  catch (error) { renderError(error); }
}
