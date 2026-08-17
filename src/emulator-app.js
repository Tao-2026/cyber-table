import { createFirebaseServices, localEmulatorConfig } from "./services/firebase-service.js";
import { createFirebaseRoomService } from "./services/firebase-room-service.js";
import { generateRoomCode } from "./services/local-room-service.js";

export async function mountFirebaseApp(container, options = {}) {
  const emulator = options.emulator ?? true;
  const config = options.config ?? localEmulatorConfig;
  const backendLabel = emulator ? "LOCAL EMULATOR" : "FIREBASE";
  let api, room, roomId, stopWatch, connection = navigator.onLine ? "connecting" : "offline";
  const renderError = error => { connection = "error"; renderHome(error?.message || `${backendLabel} unavailable`); };
  const statusText = () => ({ connecting: `CONNECTING TO ${backendLabel}…`, synced: `SYNCED · ${backendLabel}`, offline: "OFFLINE · WAITING TO RECONNECT", error: `${backendLabel} UNAVAILABLE` })[connection];

  function shell(content) { container.innerHTML = `<section class="app-shell emulator-screen"><div class="connection" data-state="${connection}" role="status">${statusText()}</div>${content}</section>`; }
  function action(label, name, kind = "button") { return `<button class="${kind}" data-fb-action="${name}">${label}</button>`; }
  function renderHome(message = "") { shell(`<div><p class="eyebrow">${backendLabel}</p><h1 class="brand">Cyber <span>Table</span></h1><p class="tagline">Two real anonymous identities · ${emulator ? "local services only" : "independent Spark project"}</p></div><div class="hero-art"><span>🤖 💗 🐼 ⭐ 🐰</span></div><div class="actions">${action(`CREATE ${emulator ? "EMULATOR " : ""}ROOM`, "create", "button button-primary")}${action("JOIN WITH CODE", "join", "button button-purple")}${action("COMPUTER PRACTICE", "local", "button button-ghost")}</div><p class="note">${message}</p>`); }
  function renderJoin() { shell(`<div><p class="eyebrow">${backendLabel}</p><h1>Join room</h1></div><label class="room-entry">ROOM CODE<input id="fb-code" maxlength="5" placeholder="TST42"></label>${action("JOIN ROOM", "join-submit", "button button-purple")}${action("BACK", "home", "button button-ghost")}<p class="note"></p>`); }
  function renderRoom() {
    if (!room) return;
    const host = room.hostId === api.uid; const match = room.match;
    if (room.status === "playing" && match) return renderMatch(host, match);
    shell(`<div><p class="eyebrow">Lobby ${host ? "· HOST" : ""}</p><h1>Room ${room.roomCode}</h1><p class="tagline">Open another browser session with <code>?backend=${emulator ? "emulator" : "firebase"}</code>.</p></div><div class="room-code-card"><span>ROOM CODE</span><strong>${room.roomCode}</strong></div><div class="player-list">${room.players.map(player => `<div class="player"><span>${player.emoji}</span><strong>${player.playerId === api.uid ? "YOU" : `PLAYER ${player.seat + 1}`}</strong><small>${player.playerId === room.hostId ? "HOST" : "READY"}</small></div>`).join("")}</div>${host ? `<button class="button button-primary" data-fb-action="start" ${room.players.length < 2 ? "disabled" : ""}>START GAME</button>` : `<p class="note">Waiting for host…</p>`}${action("LEAVE VIEW", "home", "button button-ghost")}`);
  }
  function renderMatch(host, match) {
    const active = [match.playerX, match.playerO].includes(api.uid); const expected = match.currentTurn === "X" ? match.playerX : match.playerO; const canMove = match.status === "playing" && expected === api.uid;
    const player = id => room.players.find(item => item.playerId === id);
    shell(`<header><p class="eyebrow">${active ? "PLAY" : "SPECTATING"}</p><h1>${canMove ? "Your turn" : active ? "Opponent's turn" : "Live spectator view"}</h1></header><div class="matchup"><div class="player">${player(match.playerX)?.emoji}<strong>X</strong></div><strong>VS</strong><div class="player">${player(match.playerO)?.emoji}<strong>O</strong></div></div><div class="board" role="grid">${match.board.map((mark,index)=>`<button class="cell" data-fb-action="cell" data-index="${index}" data-mark="${mark||""}" ${!canMove||mark?"disabled":""}>${mark||""}</button>`).join("")}</div><p class="status">${match.status === "playing" ? (active ? `${match.currentTurn}'s TURN` : "YOU ARE SPECTATING · READ ONLY") : match.status.toUpperCase()}</p>${action("LEAVE VIEW", "home", "button button-ghost")}`);
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
