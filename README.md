# Cyber Table / 赛博桌游

A family-friendly cyberpunk party game for phones, tablets, and desktop browsers. The first game is Tic-Tac-Toe, with an offline practice mode and a planned 2–8 player online room experience.

## Current prototype

- Native HTML, CSS, and JavaScript with ES Modules
- Offline single-player practice against a simple computer
- Firebase-backed multiplayer rooms with anonymous players and real-time turns
- English by default with Chinese switching
- Mobile portrait and tablet landscape layouts
- Pure Tic-Tac-Toe rules with Node tests
- Relative paths and modular boundaries for a future Cyber Arcade monorepo

The published GitHub Pages site uses the independent production Firebase project by default. Local development continues to use the offline prototype unless a backend is explicitly selected.

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

## Firebase Emulator multiplayer

Start local Auth and Firestore emulators:

```powershell
pnpm exec firebase emulators:start --project cyber-table-local --only auth,firestore
```

In another terminal run `npm run serve`, then open:

```text
http://127.0.0.1:4174/?backend=emulator
```

Open the same URL in a second browser session to receive a separate anonymous UID. This mode uses local emulators only and does not require Firebase login or a cloud project.

Run the integration and rules suites with `pnpm test:emulator` and `pnpm test:rules`.

The production Firebase backend can be selected explicitly with `?backend=firebase`. Any public host selects it automatically; `localhost` and `127.0.0.1` remain local by default. Use `?backend=local` explicitly for offline computer practice on a public deployment.

## Project boundaries

Cyber Table has its own Git history, GitHub repository, and future Firebase project. It does not depend on or modify CyberSnake. See [`docs/ARCHITECTURE_PROPOSAL.md`](docs/ARCHITECTURE_PROPOSAL.md) for the confirmed architecture, state machine, security boundaries, and future `git subtree` migration plan.
