import { createGame, makeMove, MARK_X, MARK_O } from "./games/tic-tac-toe/rules.js";
import { chooseRandomMove } from "./games/tic-tac-toe/simple-ai.js";
import { getLanguage, setLanguage, t } from "./core/i18n.js";

const app = document.querySelector("#app");
let language = getLanguage();
let game = createGame();
let computerTimer = null;

function button(label, action, className = "button", disabled = false) {
  return `<button class="${className}" data-action="${action}" ${disabled ? "disabled" : ""}>${label}</button>`;
}

function languageButton() {
  return `<button class="button button-ghost language" data-action="language" aria-label="Change language">${language === "en" ? "中文" : "EN"}</button>`;
}

function renderHome(message = "") {
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
  if (action === "online") renderHome(t(language, "onlineSoon"));
  if (action === "cell" && game.currentTurn === MARK_X) {
    game = makeMove(game, Number(target.dataset.index));
    renderPractice();
    if (game.status === "playing") computerTimer = setTimeout(computerMove, 450);
  }
});

renderHome();
