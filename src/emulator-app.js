import { createFirebaseServices, localEmulatorConfig } from "./services/firebase-service.js?v=round-lifecycle-20260817";
import { createFirebaseRoomService } from "./services/firebase-room-service.js?v=round-lifecycle-20260817";
import { generateRoomCode } from "./services/local-room-service.js";

export async function mountFirebaseApp(container, options = {}) {
  const emulator = options.emulator ?? true;
  const config = options.config ?? localEmulatorConfig;
  const backendLabel = emulator ? "LOCAL EMULATOR" : "FIREBASE";
  let api, room, roomId, stopWatch, connection = navigator.onLine ? "connecting" : "offline";
  const renderError = error => { connection = "error"; renderHome(error?.message || `${backendLabel} unavailable`); };
  const statusText = () => ({ connecting: `CONNECTING TO ${backendLabel}…`, synced: `SYNCED · ${backendLabel}`, offline: "OFFLINE · WAITING TO RECONNECT", error: `${backendLabel} UNAVAILABLE` })[connection];

  function shell(content, className = "") { container.innerHTML = `<section class="app-shell emulator-screen ${className}"><div class="connection" data-state="${connection}" role="status">${statusText()}</div>${content}</section>`; }
  function action(label, name, kind = "button") { return `<button class="${kind}" data-fb-action="${name}">${label}</button>`; }
  function renderHome(message = "") { shell(`<div><p class="eyebrow">${backendLabel}</p><h1 class="brand">Cyber <span>Table</span></h1><p class="tagline">Two real anonymous identities · ${emulator ? "local services only" : "independent Spark project"}</p></div><div class="hero-art"><span>🤖 💗 🐼 ⭐ 🐰</span></div><div class="actions">${action(`CREATE ${emulator ? "EMULATOR " : ""}ROOM`, "create", "button button-primary")}${action("JOIN WITH CODE", "join", "button button-purple")}${action("COMPUTER PRACTICE", "local", "button button-ghost")}</div><p class="note">${message}</p>`); }
  function renderJoin() { shell(`<div><p class="eyebrow">${backendLabel}</p><h1>Join room</h1></div><label class="room-entry">ROOM CODE<input id="fb-code" maxlength="5" placeholder="TST42"></label>${action("JOIN ROOM", "join-submit", "button button-purple")}${action("BACK", "home", "button button-ghost")}<p class="note"></p>`); }
  function renderRoom() {
    if (!room) return;
    const host = room.hostId === api.uid; const match = room.match;
    if (room.status === "partyOver") return renderPodium();
    if (["playing", "roundOver"].includes(room.status)) {
      if (match) return renderMatch(host, match);
      return renderMatchLoading();
    }
    shell(`<div><p class="eyebrow">Lobby ${host ? "· HOST" : ""}</p><h1>Room ${room.roomCode}</h1><p class="tagline">Open another browser session with <code>?backend=${emulator ? "emulator" : "firebase"}</code>.</p></div><div class="room-code-card"><span>ROOM CODE</span><strong>${room.roomCode}</strong></div><div class="player-list">${room.players.map(player => `<div class="player"><span>${player.emoji}</span><strong>${player.playerId === api.uid ? "YOU" : `PLAYER ${player.seat + 1}`}</strong><small>${player.playerId === room.hostId ? "HOST" : "READY"}</small></div>`).join("")}</div>${host ? `<button class="button button-primary" data-fb-action="start" ${room.players.length < 2 ? "disabled" : ""}>START GAME</button>` : `<p class="note">Waiting for host…</p>`}${action("LEAVE VIEW", "home", "button button-ghost")}`);
  }
  function renderMatchLoading() {
    shell(`<header class="game-header"><p class="eyebrow">PLAY</p><h1>Loading match…</h1></header><div class="turn-banner" role="status">Synchronizing the latest match. No refresh is needed.</div>`, "practice");
  }
  function renderMatch(host, match) {
    const active = [match.playerX, match.playerO].includes(api.uid); const expected = match.currentTurn === "X" ? match.playerX : match.playerO; const canMove = match.status === "playing" && expected === api.uid;
    const player = id => room.players.find(item => item.playerId === id);
    const terminal = match.status !== "playing";
    const winnerPlayer = match.winner === "X" ? player(match.playerX) : match.winner === "O" ? player(match.playerO) : null;
    const title = match.status === "draw" ? "DRAW" : terminal ? `${winnerPlayer?.emoji || ""} ${match.winner} WINS!` : canMove ? "Your turn" : active ? "Opponent's turn" : "Live spectator view";
    const status = match.status === "draw" ? "DRAW · BOTH PLAYERS +1 POINT" : terminal ? `${winnerPlayer?.emoji || ""} ${match.winner} WINS · +3 POINTS` : active ? `${match.currentTurn}'s TURN` : "YOU ARE SPECTATING · READ ONLY";
    const winning = new Set(match.winningLine || []);
    const controls = room.status === "roundOver"
      ? host
        ? `<div class="game-actions">${action("NEXT MATCH", "next", "button button-primary")}${action("END PARTY", "end", "button button-ghost")}</div>`
        : `<p class="turn-banner" role="status">Waiting for the host to start the next match.</p>`
      : "";
    shell(`<header class="game-header"><p class="eyebrow">${active ? "PLAY" : "SPECTATING"}</p><h1>${title}</h1></header><div class="matchup"><div class="player">${player(match.playerX)?.emoji}<strong>X</strong></div><strong>VS</strong><div class="player">${player(match.playerO)?.emoji}<strong>O</strong></div></div><div class="board" role="grid" aria-label="Tic-Tac-Toe board">${match.board.map((mark,index)=>`<button class="cell ${winning.has(index) ? "winner" : ""}" aria-label="Square ${index + 1}${mark ? `, ${mark}` : ""}${winning.has(index) ? ", winning line" : ""}" data-fb-action="cell" data-index="${index}" data-mark="${mark||""}" ${!canMove||mark?"disabled":""}>${mark||""}</button>`).join("")}</div><p class="status" role="status">${status}</p>${controls}${action("LEAVE VIEW", "home", "button button-ghost")}`, "practice");
  }
  function renderPodium() {
    const leaders = [...room.players].sort((a, b) => b.partyScore - a.partyScore || a.seat - b.seat).slice(0, 3);
    shell(`<header class="game-header"><p class="eyebrow">Great game, everyone! 💗</p><h1>Party Podium</h1></header><div class="podium">${leaders.map((player, index) => `<div class="podium-place"><span>${player.emoji}</span><strong>#${index + 1}</strong><b>${player.partyScore} pts</b>${player.playerId === api.uid ? "<small>YOU</small>" : ""}</div>`).join("")}</div>${action("BACK HOME", "home", "button button-primary")}`);
  }
  async function open(id) { roomId = id; stopWatch?.(); stopWatch = api.watch(id, value => { connection = "synced"; room = value; renderRoom(); }, renderError); }

  container.addEventListener("click", async event => {
    const target = event.target.closest("[data-fb-action]"); if (!target) return;
    try {
      const name = target.dataset.fbAction;
      if (name === "local") location.href = `${location.pathname}?backend=local`;
      if (name === "home") { stopWatch?.(); room = null; roomId = null; renderHome(); }
      if (name === "join") renderJoin();
      if (name === "create") { target.disabled = true; await open(await api.create(generateRoomCode())); }
      if (name === "join-submit") { target.disabled = true; await open(await api.join(document.querySelector("#fb-code").value.trim().toUpperCase())); }
      if (name === "start") { target.disabled = true; await api.start(roomId); }
      if (name === "cell") { target.disabled = true; await api.move(roomId, room.currentMatchId, Number(target.dataset.index)); }
      if (name === "next") { target.disabled = true; await api.nextMatch(roomId); }
      if (name === "end") { target.disabled = true; await api.endParty(roomId); }
    } catch (error) { renderError(error); }
  });
  addEventListener("offline", () => { connection = "offline"; room ? renderRoom() : renderHome(); });
  addEventListener("online", () => { connection = "connecting"; room ? renderRoom() : renderHome(); });

  renderHome();
  try {
    const deviceId = sessionStorage.getItem("cyberTable.emulatorDevice") || crypto.randomUUID();
    sessionStorage.setItem("cyberTable.emulatorDevice", deviceId);
    const services = await createFirebaseServices({ config, emulator, appName: `cyber-table-${emulator ? "emulator" : "production"}-${deviceId}` });
    api = createFirebaseRoomService(services); connection = "synced"; renderHome();
  }
  catch (error) { renderError(error); }
}
