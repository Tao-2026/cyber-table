# Cyber Table / 赛博桌游

A family-friendly cyberpunk party game for phones, tablets, and desktop browsers. The first game is Tic-Tac-Toe, with an offline practice mode and a planned 2–8 player online room experience.

## Current prototype

- Native HTML, CSS, and JavaScript with ES Modules
- Offline single-player practice against a simple computer
- English by default with Chinese switching
- Mobile portrait and tablet landscape layouts
- Pure Tic-Tac-Toe rules with Node tests
- Relative paths and modular boundaries for a future Cyber Arcade monorepo

Online rooms and Firebase are not connected yet.

## Run locally

Use Node.js 20 or newer:

```powershell
npm run serve
```

Then open <http://127.0.0.1:4174/>.

Run tests:

```powershell
npm test
```

## Project boundaries

Cyber Table has its own Git history, GitHub repository, and future Firebase project. It does not depend on or modify CyberSnake. See [`docs/ARCHITECTURE_PROPOSAL.md`](docs/ARCHITECTURE_PROPOSAL.md) for the confirmed architecture, state machine, security boundaries, and future `git subtree` migration plan.
