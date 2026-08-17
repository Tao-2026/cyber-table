import { createGame, makeMove, MARK_X, MARK_O } from "./games/tic-tac-toe/rules.js";
import { chooseRandomMove } from "./games/tic-tac-toe/simple-ai.js";
import { getLanguage, setLanguage, t } from "./core/i18n.js";
import { createRoom, joinRoom, startParty, playRoomMove, rotateRoom, endParty, podium } from "./core/room-machine.js";
import { generateRoomCode, loadRoom, saveRoom, watchRoom } from "./services/local-room-service.js";

const app = document.querySelector("#app");
let language = getLanguage();
let game = createGame();
let computerTimer = null;
let room = null;
let stopWatching = null;
const playerId = sessionStorage.getItem("cyberTable.playerId") || crypto.randomUUID();
sessionStorage.setItem("cyberTable.playerId", playerId);

function button(label, action, className = "button", disabled = false) {
  return `<button class="${className}" data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

function languageButton() {
  return `<button class="button button-ghost language" data-action="language" aria-label="Change language">${language === "en" ? "中文" : "EN"}</button>`;
}

function renderHome(message = "") {
  stopWatching?.(); stopWatching = null; room = null;
  clearTimeout(computerTimer);
  app.innerHTML = `<section class="app-shell" aria-labelledby="brand">
    <div class="topbar"><p class="eyebrow">Party arcade</p>${languageButton()}</div>
    <div><h1 class="brand" id="brand">Cyber <span>Table</span></h1><p class="tagline">${t(language, "tagline")}</p></div>
    <div class="hero-art" aria-hidden="true"><span>🤖 💗 🐼 ⭐ 🐰</span></div>
    <div class="actions">
      ${button(t(language, "create"), "online", "button button-primary")}
      ${button(t(language, "join"), "online", "button button-purple")}
      ${button(t(language, "practice"), "practice")}
    </div>
    <p class="note" aria-live="polite">${message || t(language, "practiceNote")}</p>
  </section>`;
}

function renderJoin() {
  app.innerHTML = `<section class="app-shell"><div class="topbar">${button("←", "home", "button button-ghost")}${languageButton()}</div><div><p class="eyebrow">Local room prototype</p><h1>Join a room</h1><p class="tagline">Open this page in another tab and enter the same code.</p></div><label class="room-entry">ROOM CODE<input id="room-code" maxlength="5" autocomplete="off" inputmode="text" placeholder="7K2H9"></label>${button("JOIN ROOM", "join-submit", "button button-purple")}<p class="note" role="status"></p></section>`;
}

function openRoom(nextRoom) { room = nextRoom; saveRoom(room); stopWatching?.(); stopWatching = watchRoom(room.code, updated => { if (updated) { room = updated; renderRoom(); } }); renderRoom(); }

function renderRoom() {
  const me = room.players.find(player => player.id === playerId);
  const host = room.hostId === playerId;
  if (room.status === "partyOver") return renderPodium(me);
  if (room.status === "playing" || room.status === "roundOver") return renderOnlineGame(me, host);
  app.innerHTML = `<section class="app-shell room-screen"><div class="topbar">${button("←", "home", "button button-ghost")}${languageButton()}</div><header><p class="eyebrow">Lobby ${host ? "· HOST" : ""}</p><h1>Room ${room.code}</h1><p class="tagline">Share this code with up to 8 players.</p></header><div class="room-code-card"><span>ROOM CODE</span><strong>${room.code}</strong></div><div class="player-list">${room.players.map(player => `<div class="player"><span>${player.emoji}</span><strong>${player.id === playerId ? "YOU" : `PLAYER ${player.seat + 1}`}</strong><small>${player.id === room.hostId ? "HOST" : "READY"}</small></div>`).join("")}</div>${host ? button("START GAME", "room-start", "button button-primary", room.players.length < 2) : `<p class="note">Waiting for the host to start…</p>`}</section>`;
}

function renderOnlineGame(me, host) {
  const match = room.match; const active = [match.playerX, match.playerO].includes(playerId); const expected = match.currentTurn === "X" ? match.playerX : match.playerO; const canMove = room.status === "playing" && expected === playerId;
  const won = new Set(match.winningLine || []);
  app.innerHTML = `<section class="app-shell practice"><div class="topbar">${button("←", "home", "button button-ghost")}<strong>${room.code}</strong></div><header class="game-header"><p class="eyebrow">${active ? "PLAY" : "SPECTATING"}</p><h1>${room.status === "roundOver" ? "Round over" : canMove ? "Your turn" : active ? "Opponent's turn" : "Board is read-only"}</h1></header><div class="matchup"><div class="player">${room.players.find(p=>p.id===match.playerX).emoji}<strong>X</strong></div><strong>VS</strong><div class="player">${room.players.find(p=>p.id===match.playerO).emoji}<strong>O</strong></div></div><div class="board" role="grid">${match.board.map((mark,index)=>`<button class="cell ${won.has(index)?"winner":""}" data-action="room-cell" data-index="${index}" data-mark="${mark||""}" ${!canMove||mark?"disabled":""}>${mark||""}</button>`).join("")}</div><p class="status" role="status">${room.status === "roundOver" ? (match.status === "draw" ? "DRAW" : `${match.winner} WINS!`) : active ? `${match.currentTurn}'s TURN` : "YOU ARE SPECTATING"}</p><div class="game-actions">${host && room.status === "roundOver" ? button("NEXT MATCH", "room-next", "button button-primary") : ""}${host ? button("END PARTY", "room-end", "button button-ghost") : ""}</div></section>`;
}

function renderPodium(me) { const leaders = podium(room); app.innerHTML = `<section class="app-shell"><div class="topbar">${button("←", "home", "button button-ghost")}</div><header><p class="eyebrow">Great game, everyone! 💗</p><h1>Party Podium</h1></header><div class="podium">${leaders.map((player,index)=>`<div class="podium-place"><span>${player.emoji}</span><strong>#${index+1}</strong><b>${player.score} pts</b>${player.id===playerId?"<small>YOU</small>":""}</div>`).join("")}</div>${button("BACK HOME", "home", "button button-primary")}</section>`; }

function resultText() {
  if (game.status === "draw") return t(language, "draw");
  if (game.winner === MARK_X) return t(language, "win");
  if (game.winner === MARK_O) return t(language, "lose");
  return game.currentTurn === MARK_X ? t(language, "yourTurn") : t(language, "computerTurn");
}

function renderPractice() {
  const won = new Set(game.winningLine || []);
  app.innerHTML = `<section class="app-shell practice" aria-labelledby="practice-title">
    <div class="topbar">${button("←", "home", "button button-ghost")} ${languageButton()}</div>
    <header class="game-header"><p class="eyebrow">Cyber Table</p><h1 id="practice-title">${t(language, "practiceTitle")}</h1></header>
    <div class="matchup"><div class="player">🐼<strong>${t(language, "you")} · X</strong></div><strong>VS</strong><div class="player">🤖<strong>${t(language, "computer")} · O</strong></div></div>
    <div class="turn-banner" aria-hidden="true">${game.status === "playing" ? (game.currentTurn === MARK_X ? "▶ X" : "… O") : "★"}</div>
    <div class="board" role="grid" aria-label="Tic-Tac-Toe board">${game.board.map((mark, index) => `<button class="cell ${won.has(index) ? "winner" : ""}" data-action="cell" data-index="${index}" data-mark="${mark || ""}" role="gridcell" aria-label="Square ${index + 1}${mark ? `, ${mark}` : ""}" ${mark || game.status !== "playing" || game.currentTurn !== MARK_X ? "disabled" : ""}>${mark || ""}</button>`).join("")}</div>
    <p class="status" role="status" aria-live="polite">${resultText()}</p>
    <div class="game-actions">${button(t(language, "restart"), "restart", "button button-primary")}${button(t(language, "home"), "home", "button button-ghost")}</div>
  </section>`;
}

function beginPractice() { game = createGame(); renderPractice(); }
function computerMove() {
  if (game.status !== "playing" || game.currentTurn !== MARK_O) return;
  const move = chooseRandomMove(game);
  if (move !== null) game = makeMove(game, move);
  renderPractice();
}

app.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "language") { language = language === "en" ? "zh" : "en"; setLanguage(language); app.querySelector(".practice") ? renderPractice() : renderHome(); }
  if (action === "practice" || action === "restart") beginPractice();
  if (action === "home") renderHome();
  if (action === "online") { if (target.textContent.includes("CREATE") || target.textContent.includes("创建")) openRoom(createRoom({ code: generateRoomCode(), hostId: playerId })); else renderJoin(); }
  if (action === "join-submit") { const code = document.querySelector("#room-code").value.trim().toUpperCase(); const found = loadRoom(code); if (!found) document.querySelector(".note").textContent = "Room not found"; else openRoom(joinRoom(found, playerId)); }
  if (action === "room-start") openRoom(startParty(room, playerId));
  if (action === "room-cell") openRoom(playRoomMove(room, playerId, Number(target.dataset.index)));
  if (action === "room-next") openRoom(rotateRoom(room, playerId));
  if (action === "room-end") openRoom(endParty(room, playerId));
  if (action === "cell" && game.currentTurn === MARK_X) {
    game = makeMove(game, Number(target.dataset.index));
    renderPractice();
    if (game.status === "playing") computerTimer = setTimeout(computerMove, 450);
  }
});

if (new URLSearchParams(location.search).get("backend") === "emulator") {
  const { mountEmulatorApp } = await import("./emulator-app.js");
  await mountEmulatorApp(app);
} else renderHome();
