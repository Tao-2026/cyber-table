import { createFirebaseServices, localEmulatorConfig } from "./services/firebase-service.js?v=avatar-selection-20260824";
import { createFirebaseRoomService } from "./services/firebase-room-service.js?v=avatar-selection-20260824";
import { createGame, makeMove } from "./games/tic-tac-toe/rules.js";
import { chooseRandomMove } from "./games/tic-tac-toe/simple-ai.js";
import { presetForTarget } from "./core/series.js";
import { normalizeRoomCode, roomShareUrl } from "./core/room-code.js";
import { avatarById, randomAvatar, resolveAvatar } from "./config/avatars.js";

export async function mountFirebaseApp(container, options = {}) {
  const emulator = options.emulator ?? true;
  const config = options.config ?? localEmulatorConfig;
  const backendLabel = emulator ? "LOCAL EMULATOR" : "FIREBASE";
  const sessionKey = `cyberTable.activeRoom.${emulator ? "emulator" : "firebase"}`;
  const avatarSessionKey = `cyberTable.selectedAvatar.${emulator ? "emulator" : "firebase"}`;
  const entrySessionKey = `cyberTable.pendingEntry.${emulator ? "emulator" : "firebase"}`;
  let api, room, roomId, stopWatch, reconnectTimer, healthTimer, reconnectAttempt = 0;
  let waitingPractice = false, waitingGame = createGame(), waitingComputerTimer = null, lobbyNotice = "";
  let pendingEntry = JSON.parse(sessionStorage.getItem(entrySessionKey) || "null");
  let selectedAvatar = avatarById(sessionStorage.getItem(avatarSessionKey)) || randomAvatar();
  sessionStorage.setItem(avatarSessionKey, selectedAvatar.id);
  let connection = navigator.onLine ? "connecting" : "offline";
  const renderError = error => { connection = "error"; renderHome(error?.message || `${backendLabel} unavailable`); };
  const statusText = () => ({ connecting: `CONNECTING TO ${backendLabel}…`, synced: `SYNCED · ${backendLabel}`, offline: "OFFLINE · WAITING TO RECONNECT", error: `${backendLabel} UNAVAILABLE` })[connection];

  function shell(content, className = "") { container.innerHTML = `<section class="app-shell emulator-screen ${className}"><div class="connection" data-state="${connection}" role="status">${statusText()}</div>${content}</section>`; }
  function action(label, name, kind = "button") { return `<button class="${kind}" data-fb-action="${name}">${label}</button>`; }
  function spectatorInviteUrl(code) { const url = new URL(location.pathname, location.origin); url.searchParams.set("room", code); url.searchParams.set("role", "spectator"); return url.href; }
  function memberAvatar(member) { return resolveAvatar(member); }
  function chooseAvatar(avatar) { selectedAvatar = avatar; sessionStorage.setItem(avatarSessionKey, avatar.id); }
  function setPendingEntry(value) { pendingEntry = value; if (value) sessionStorage.setItem(entrySessionKey, JSON.stringify(value)); else sessionStorage.removeItem(entrySessionKey); }
  function renderHome(message = "") { shell(`<div><p class="eyebrow">${backendLabel}</p><h1 class="brand">Cyber <span>Table</span></h1><p class="tagline">Two real anonymous identities · ${emulator ? "local services only" : "independent Spark project"}</p></div><div class="hero-art"><span>🤖 💗 🐼 ⭐ 🐰</span></div><div class="actions">${action(`CREATE ${emulator ? "EMULATOR " : ""}ROOM`, "create", "button button-primary")}${action("JOIN WITH CODE", "join", "button button-purple")}${action("COMPUTER PRACTICE", "local", "button button-ghost")}</div><p class="note">${message}</p>`); }
  function renderJoin(message = "") { const params = new URLSearchParams(location.search); const sharedCode = normalizeRoomCode(params.get("room")).replace(/[^A-Z0-9]/g, "").slice(0, 5); shell(`<div><p class="eyebrow">${backendLabel}</p><h1>Join room</h1><p class="tagline">Players and spectators use the same five-character code. After a game starts, new members can only spectate. A room code is not a password.</p></div><label class="room-entry">ROOM CODE<input id="fb-code" maxlength="12" value="${sharedCode}" placeholder="TST42" autocomplete="off"></label>${action("CONTINUE / 继续", "join-continue", "button button-primary")}${action("BACK", "home", "button button-ghost")}<p class="note" role="status">${message}</p>`); }
  function renderAvatarPicker(message = "", alternatives = []) {
    const join = pendingEntry?.mode === "join"; const spectatorOnly = pendingEntry?.preview?.spectatorOnly; const role = spectatorOnly ? "spectator" : pendingEntry?.role || "player";
    const roleControls = join ? `<fieldset class="avatar-role"><legend>JOIN ROLE / 加入身份</legend>${!spectatorOnly ? `<button data-fb-action="avatar-role" data-role="player" class="${role === "player" ? "selected" : ""}">PLAYER / 玩家</button>` : ""}<button data-fb-action="avatar-role" data-role="spectator" class="${role === "spectator" ? "selected" : ""}">SPECTATOR / 观众</button></fieldset>${spectatorOnly ? `<p class="turn-banner">Game already started. New members join as spectators. / 比赛已经开始，新成员只能作为观众加入。</p>` : ""}` : "";
    const alternativesUi = alternatives.length ? `<div class="avatar-alternatives"><p>AVAILABLE AVATARS / 可用头像</p>${alternatives.map(id => { const avatar = avatarById(id); return avatar ? `<button data-fb-action="avatar-pick" data-avatar-id="${avatar.id}" aria-label="Use ${avatar.label.en} / 使用${avatar.label.zh}">${avatar.emoji}<small>${avatar.label.en} / ${avatar.label.zh}</small></button>` : ""; }).join("")}</div>` : "";
    shell(`<header><p class="eyebrow">YOUR AVATAR / 你的头像</p><h1>${join ? "Choose before joining" : "Choose before creating"}</h1></header><section class="avatar-picker" aria-live="polite"><div class="avatar-preview" role="img" aria-label="Selected avatar: ${selectedAvatar.label.en}. 当前头像：${selectedAvatar.label.zh}。"><span aria-hidden="true">${selectedAvatar.emoji}</span><strong>${selectedAvatar.label.en} / ${selectedAvatar.label.zh}</strong></div>${action("RANDOMIZE / 换一个", "avatar-randomize", "button button-purple")}${alternativesUi}${roleControls}${action(join ? "CONFIRM AND JOIN / 确认并加入" : "CONFIRM AND CREATE / 确认并创建", "avatar-confirm", "button button-primary")}${action("BACK / 返回", join ? "join" : "home", "button button-ghost")}<p class="note" role="status">${message}</p></section>`, "avatar-screen");
  }
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
    const playerCard = player => { const avatar = memberAvatar(player); return `<div class="player"><span aria-label="${avatar.label.en} / ${avatar.label.zh}">${avatar.emoji}</span><strong>${player.playerId === api.uid ? "YOU" : `PLAYER ${player.seat + 1}`}</strong><small>${player.playerId === room.hostId ? "HOST · " : ""}${player.role === "spectator" ? "SPECTATOR" : "PLAYER"}</small>${(host || player.playerId === api.uid) ? `<button class="role-toggle" data-fb-action="role" data-player-id="${player.playerId}" data-role="${player.role === "player" ? "spectator" : "player"}">SWITCH TO ${player.role === "player" ? "SPECTATOR" : "PLAYER"}</button>` : ""}</div>`; };
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
    const player = id => room.players.find(item => item.playerId === id); const me = player(api.uid);
    const terminal = match.status !== "playing"; const spectator = me?.role === "spectator";
    const winnerPlayer = match.winner === "X" ? player(match.playerX) : match.winner === "O" ? player(match.playerO) : null;
    const series = room.series; const seriesOver = ["seriesOver","seriesBreak"].includes(room.status);
    const title = seriesOver ? (series?.status === "draw" ? "SERIES DRAW" : `${memberAvatar(player(series?.winnerId) || {}).emoji} SERIES WIN`) : match.status === "draw" ? "ROUND DRAW" : terminal ? `${memberAvatar(winnerPlayer || {}).emoji} ROUND WIN` : canMove ? "Your turn" : active ? "Opponent's turn" : "Live spectator view";
    const status = match.status === "draw" ? "DRAW · BOTH PLAYERS +1 POINT" : terminal ? `${memberAvatar(winnerPlayer || {}).emoji} ${match.winner} WINS · +3 POINTS` : active ? `${match.currentTurn}'s TURN` : "YOU ARE SPECTATING · READ ONLY";
    const winning = new Set(match.winningLine || []); const currentSuggestions = (room.suggestions || []).filter(item => item.moveCount === match.moveCount);
    const raised = currentSuggestions.filter(item => item.status === "raised"); const submitted = currentSuggestions.find(item => item.status === "suggested"); const mine = currentSuggestions.find(item => item.spectatorId === api.uid);
    const suggestionsMuted = match.suggestionsMutedMoveCount === match.moveCount;
    const suggestionAvatar = item => avatarById(item?.spectatorAvatarId) || { emoji: item?.spectatorEmoji || "🤖" };
    const handQueue = raised.length ? `<section class="suggestions hand-queue"><h2>RAISED HANDS / 举手队列</h2>${raised.map(item => `<div><span>${suggestionAvatar(item).emoji} ${item.spectatorName} raised a hand. / ${suggestionAvatar(item).emoji} 玩家 ${Number(item.spectatorName?.replace(/\D/g, "")) || "?"} 请求指点。</span>${canMove && !suggestionsMuted && match.approvedSuggestionMoveCount !== match.moveCount ? `<button data-fb-action="hand-approve" data-spectator-id="${item.spectatorId}">ALLOW TO SUGGEST / 允许指点</button><button data-fb-action="hand-dismiss" data-spectator-id="${item.spectatorId}">DISMISS / 忽略</button>` : `<small>Waiting for the current player. / 等待当前玩家处理。</small>`}</div>`).join("")}</section>` : "";
    const spectatorControl = spectator && match.status === "playing" ? `<section class="suggestions"><h2>SPECTATOR SUGGESTION / 观众指点</h2>${!mine ? action("RAISE HAND / 举手", "raise-hand", "button button-purple") : mine.status === "raised" ? `<p class="turn-banner">Hand raised. Waiting for the current player. / 已举手，等待当前玩家处理。</p>` : mine.status === "approved" ? `<p class="turn-banner">You may suggest one square. / 你现在可以建议一个格子。</p>` : mine.status === "suggested" ? `<p class="turn-banner">Suggestion submitted. / 建议已提交。</p>` : `<p class="turn-banner">Request dismissed for this turn. / 本回合请求已忽略。</p>`}<p class="note">One approved suggestion per turn. It never places a formal move.</p></section>` : "";
    const submittedText = submitted ? `${suggestionAvatar(submitted).emoji} suggests square ${submitted.suggestedCell + 1}. / ${suggestionAvatar(submitted).emoji} 建议第 ${submitted.suggestedCell + 1} 格。` : "";
    const assistant = match.assistSpectatorId ? player(match.assistSpectatorId) : null;
    const assist = terminal && assistant ? `<div class="assist-celebration" role="status"><span>${memberAvatar(assistant).emoji}</span><strong>ASSIST · PLAYER ${assistant.seat + 1}</strong><small>Winning suggestion / 胜利助攻</small></div>` : "";
    const identity = me ? `<div class="match-identity"><span aria-label="${memberAvatar(me).label.en} / ${memberAvatar(me).label.zh}">${memberAvatar(me).emoji}</span><strong>${me.playerId === api.uid ? "YOU · " : ""}PLAYER ${me.seat + 1}</strong><small>${host ? "HOST · " : ""}${spectator ? "SPECTATOR" : "PLAYER"}</small></div>` : "";
    const controls = room.status === "roundOver" ? (host ? `<div class="game-actions">${action("NEXT ROUND", "next", "button button-primary")}</div>` : `<p class="turn-banner">Waiting for the host to continue this series.</p>`) : seriesOver ? (host ? `<div class="game-actions">${action("NEXT SERIES", "next-series", "button button-primary")}${action("END PARTY", "end", "button button-ghost")}</div>` : `<p class="turn-banner">Waiting for the host to confirm the next player pool.</p>`) : "";
    const breakControls = seriesOver ? `<section class="role-break"><h2>SERIES BREAK / 系列间准备</h2>${me?.role === "spectator" ? action(me.requestedRole === "player" ? "PLAYER REQUEST PENDING / 参赛申请待确认" : "JOIN PLAYER QUEUE / 申请参赛", "request-player", "button button-purple") : action("BECOME SPECTATOR NEXT SERIES / 下一系列转为观众", "request-spectator", "button button-ghost")}<p class="note">The host confirms the player pool before NEXT SERIES. Seat and Party Score stay unchanged.</p>${host ? room.players.filter(item => item.requestedRole === "player").map(item => `<button class="role-toggle" data-fb-action="role" data-player-id="${item.playerId}" data-role="player">APPROVE ${item.emoji} AS PLAYER</button>`).join("") : ""}</section>` : "";
    const scoreA = series?.winsByPlayer?.[series.playerA] || 0, scoreB = series?.winsByPlayer?.[series.playerB] || 0;
    const invite = `<details class="match-invite"><summary>ROOM ${room.roomCode} / 房间 ${room.roomCode}</summary><div><button data-fb-action="copy-code" data-code="${room.roomCode}">COPY CODE / 复制房间码</button><a href="${spectatorInviteUrl(room.roomCode)}" rel="noopener noreferrer">INVITE SPECTATORS / 邀请观众</a><p>Friends can join as spectators while the game is running. / 比赛进行中，朋友仍可使用房间码加入观战。</p></div></details>`;
    const board = match.board.map((mark,index) => { const isSuggested = submitted?.suggestedCell === index; const canSuggest = spectator && mine?.status === "approved" && !mark && match.status === "playing"; const label = `Square ${index + 1}${mark ? `, ${mark}` : ""}${winning.has(index) ? ", winning line" : ""}${isSuggested ? `, ${submittedText}` : ""}`; return `<button class="cell ${winning.has(index) ? "winner" : ""} ${isSuggested ? "suggested" : ""}" aria-label="${label}" data-fb-action="${canSuggest ? "suggest-cell" : "cell"}" data-index="${index}" data-mark="${mark || ""}" ${(!canMove && !canSuggest) || mark ? "disabled" : ""}>${mark || ""}${isSuggested ? `<span class="suggestion-halo" aria-hidden="true">✋${suggestionAvatar(submitted).emoji}</span>` : ""}</button>`; }).join("");
    shell(`${invite}${identity}<header class="game-header"><p class="eyebrow">${active ? "PLAYER" : "SPECTATOR"}${host ? " · HOST" : ""} · YOU</p><h1>${title}</h1>${lobbyNotice ? `<div class="turn-banner" role="status">${lobbyNotice}</div>` : ""}${spectator ? `<div class="turn-banner">YOU ARE SPECTATING / 你正在观战 · BOARD IS READ ONLY</div>` : ""}<div class="series-score" aria-label="Series score ${scoreA} to ${scoreB}"><strong>SERIES: ${scoreA}–${scoreB}</strong><span>ROUND: ${match.seriesRoundNumber || 1}</span><span>FIRST TO ${series?.targetWins || room.settings.seriesTargetWins || 2} WINS</span></div></header><div class="matchup"><div class="player">${memberAvatar(player(match.playerX) || {}).emoji}<strong>X</strong></div><strong>VS</strong><div class="player">${memberAvatar(player(match.playerO) || {}).emoji}<strong>O</strong></div></div><div class="board" role="grid" aria-label="Tic-Tac-Toe board">${board}</div><p class="status" role="status">${status}</p><p class="sr-status" aria-live="polite">${submittedText}</p>${assist}${handQueue}${spectatorControl}${breakControls}${controls}${action("LEAVE VIEW", "home", "button button-ghost")}`, "practice");
  }
  function renderPodium() {
    const leaders = [...room.players].sort((a, b) => b.partyScore - a.partyScore || a.seat - b.seat).slice(0, 3);
    shell(`<header class="game-header"><p class="eyebrow">Great game, everyone! 💗</p><h1>Party Podium</h1></header><div class="podium">${leaders.map((player, index) => `<div class="podium-place"><span>${memberAvatar(player).emoji}</span><strong>#${index + 1} · PLAYER ${player.seat + 1}</strong><b>${player.partyScore} pts</b>${player.playerId === api.uid ? "<small>YOU</small>" : ""}</div>`).join("")}</div>${action("BACK HOME", "home", "button button-primary")}`);
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
      if (name === "home") { stopRealtime(); forgetRoom(); room = null; roomId = null; setPendingEntry(null); lobbyNotice = ""; waitingPractice = false; renderHome(); }
      if (name === "join") { setPendingEntry(null); renderJoin(); }
      if (name === "create") { setPendingEntry({ mode: "create" }); renderAvatarPicker(); }
      if (name === "join-continue") { target.disabled = true; const code = document.querySelector("#fb-code").value; const preview = await api.preview(code); if (preview.memberCount >= preview.maxMembers) throw new Error("Room is full (8/8)"); const defaultRole = new URLSearchParams(location.search).get("role") === "spectator" ? "spectator" : "player"; setPendingEntry({ mode: "join", code, preview, role: preview.spectatorOnly ? "spectator" : defaultRole }); renderAvatarPicker(); }
      if (name === "avatar-randomize") { chooseAvatar(randomAvatar(selectedAvatar.id)); renderAvatarPicker(); }
      if (name === "avatar-pick") { const avatar = avatarById(target.dataset.avatarId); if (avatar) chooseAvatar(avatar); renderAvatarPicker(); }
      if (name === "avatar-role") { setPendingEntry({ ...pendingEntry, role: target.dataset.role }); renderAvatarPicker(); }
      if (name === "avatar-confirm") {
        target.disabled = true; lobbyNotice = "";
        if (pendingEntry?.mode === "create") await open(await api.create(null, selectedAvatar.id));
        else if (pendingEntry?.mode === "join") { const result = await api.join(pendingEntry.code, pendingEntry.preview.spectatorOnly ? "spectator" : pendingEntry.role, selectedAvatar.id); lobbyNotice = result.reason === "gameStarted" ? "Game already started. You joined as a spectator. / 比赛已经开始，你已作为观众加入。" : result.reason === "playerPoolFull" ? "Player pool is full. You joined as a spectator. / 参赛池已满，你已作为观众加入。" : `Joined as ${result.role}.`; await open(result.roomId); }
      }
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
      if (name === "raise-hand") { target.disabled = true; await api.raiseHand(roomId, room.currentMatchId); }
      if (name === "suggest-cell") { target.disabled = true; await api.suggestCell(roomId, room.currentMatchId, Number(target.dataset.index)); }
      if (name === "hand-approve") { target.disabled = true; await api.reviewHand(roomId, room.currentMatchId, target.dataset.spectatorId, "approved"); }
      if (name === "hand-dismiss") { target.disabled = true; await api.reviewHand(roomId, room.currentMatchId, target.dataset.spectatorId, "dismissed"); }
      if (name === "suggest-mute") { target.disabled = true; await api.muteSuggestions(roomId, room.currentMatchId); }
      if (name === "copy-code") { await navigator.clipboard.writeText(target.dataset.code); lobbyNotice = `Copied room code ${target.dataset.code}.`; renderRoom(); }
    } catch (error) {
      if (pendingEntry) renderAvatarPicker(error.message, error.code === "avatar-taken" ? error.availableAvatarIds : []);
      else if (document.querySelector("#fb-code")) renderJoin(error.message);
      else renderError(error);
    }
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
    } else { connection = "synced"; pendingEntry ? renderAvatarPicker() : new URLSearchParams(location.search).has("room") ? renderJoin() : renderHome(); }
  }
  catch (error) { renderError(error); }
}
