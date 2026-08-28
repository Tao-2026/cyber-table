# Changelog

All notable changes to Cyber Table are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- A reusable Party Room game picker lets the host choose Tic-Tac-Toe or Casual Gomoku in the Lobby and again between series without changing the room code, membership, stable seats, avatars, roles, or Party Score.
- A pure multi-game registry now exposes shared rule, legal-move, state-validation, practice, and board-rendering boundaries for both games while preserving a legacy-safe Tic-Tac-Toe default.
- Casual Gomoku adds a 15×15 board, Black-first play, five-or-more wins in all four directions, full winning-run highlights, last-move markers, Black/White identity labels, and no Renju forbidden-move rules.
- Gomoku supports Single Round, Best of 3, and Best of 5 series, with Black and White swapped after every round and the same cross-game Party Score.
- Gomoku waiting practice uses its own bounded local AI, 1–10 difficulty, first-player mode, alternating progress, and per-tab session state independently from Tic-Tac-Toe practice.
- Gomoku intersections support Enter/Space activation and directional-key navigation that skips occupied points.
- Live Gomoku spectators can join through the same room code, raise a hand, receive current-player approval, and suggest one empty intersection without placing a formal stone.
- Mobile Gomoku includes a square scrollable board viewport with Zoom In, Zoom Out, and Center Board controls for reliable 15×15 interaction.
- Lobby waiting practice now alternates the first player between the player and computer after each completed game by default.
- A three-option First Player control allows `ALTERNATE`, `ALWAYS YOU`, or `ALWAYS COMPUTER`; its mode and alternating progress remain local to the current browser tab.
- Computer-first practice uses the current 1–10 difficulty, while rapid mode changes, leaving practice, and formal-series startup cancel stale computer tasks.
- Lobby waiting practice now includes an accessible 1–10 computer difficulty slider with immediate effect and per-tab persistence.
- Practice difficulty labels range from Very Easy through Expert; Level 10 uses an optimal full Minimax Tic-Tac-Toe strategy.
- A pre-room family-friendly avatar picker automatically selects a local reviewed avatar before room creation or joining, with unlimited secure randomization and bilingual accessible names.
- A single stable avatar-ID system now follows hosts, players, and spectators through the Lobby, match header, raised hands, suggestions, winning assists, and Party Podium.
- Firestore transactions reserve unique avatar IDs per room and return three available alternatives when a concurrent join takes the selected avatar.
- Per-tab avatar selection survives picker refreshes, while an established member's avatar survives refresh and reconnect and remains locked for that room.
- Avatar choices use only bundled Emoji configuration: custom uploads, external image URLs, paid avatar services, and in-room avatar changes are intentionally unsupported in this version.
- Default BEST OF 3 series play, with SINGLE ROUND and BEST OF 5 options that the host may change only while the room is still in the Lobby.
- Local “PRACTICE WHILE WAITING / 等待时练习” for every Lobby member without leaving the room, changing party scores, or stopping Firebase listeners.
- Explicit PLAYER, SPECTATOR, HOST, and YOU roles, with separate Lobby pools and host/member role controls before a series starts.
- Unified five-character room entry with explicit `JOIN AS PLAYER / 作为玩家加入` and `JOIN AS SPECTATOR / 作为观众加入` actions; player and spectator share links may supply only a default role.
- Live-series spectator joining that opens the current read-only match, series score, Party Score, rotation state, and existing structured suggestion controls without a refresh.
- A `seriesBreak` player queue where spectators request the next player pool, existing players may step back to spectate, and the host approves requests before `NEXT SERIES`.
- Structured spectator hand raises and one-cell move suggestions, including accept, dismiss, per-turn mute, an accessible Emoji halo, and no free-text messaging.

### Changed

- Room, series, and match documents now distinguish the host's `selectedGameType` from the transaction-locked `activeGameType`; legacy rooms and links safely default to Tic-Tac-Toe.
- Gomoku online boards are reconstructed from immutable sequential move documents rather than a client-replaceable 225-cell board.
- Realtime recovery waits for the Gomoku match and its complete move snapshot before rendering, preventing a temporarily empty or wrong-game board during listener reordering.
- The current product interface is English-only across home, avatar, room, Lobby, practice, match, spectator, series, results, Podium, error, toast, sharing, and accessibility surfaces while retaining the localization structure for future use.
- Waiting-practice difficulty remains local to the current browser tab and never changes Firestore room, member, score, or formal-match data.
- Active Firebase room context is retained per browser tab so refreshes return the same device identity to the same lobby, match, or Podium.
- Five-character room codes now use `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, excluding visually ambiguous characters while retaining compatibility with existing five-character alphanumeric codes.
- Room-code input ignores case, spaces, and hyphens; shared join links carry the normalized code and the Lobby explains that a room code is not a password.
- Player rotation now occurs after a complete series rather than after every individual round; spectators are excluded from pair selection and two-player rooms swap the opening X/O assignment between series.
- Series and role state are included in realtime listeners, reconnect restoration, and authoritative server probes.
- Room schema v4 maintains `memberCount`, `playerCount`, and `spectatorCount` atomically, preserves stable seats and earned Party Score through role changes, and marks members who joined during a series.
- Requests to join as a player automatically become spectator joins when play has started or the player pool is full, with an explicit bilingual reason.
- Terminal moves and idempotent score/series settlement now use consecutive protected transactions so Firestore Rules remain below their expression budget while score application stays atomic and exactly once.

### Fixed

- Fixed high-difficulty Gomoku practice AI ignoring a player's open three.
- Added symmetric recognition of open threes, broken threes, rush fours, open fours, and double threats across rows, columns, and both diagonals.
- Levels 9–10 now use budgeted multi-ply attack-and-defense search over nearby candidates.
- Level 10 no longer randomly deviates from a fatal or uniquely required defensive point.
- Search remains bounded by node and time budgets and is intentionally not described as professional-grade or unbeatable.
- Stale Gomoku AI results are discarded after difficulty, first-player mode, selected game, practice round, or page state changes.
- Make spectator hand raises visible to the current player in real time, with an ordered queue and explicit allow-or-dismiss controls.
- Let only an approved spectator select one legal suggestion square through a dedicated suggestion action, separate from formal board moves.
- Split hand raising, current-player approval, one-cell suggestion, and the current player's formal move into distinct Firestore-backed states; suggestions never place a mark automatically.
- Clear raised, approved, and submitted suggestion UI immediately when the turn's move count changes, while rejecting stale writes in Security Rules.
- Keep the public five-character room code and a spectator invite link visible throughout play, round-over, and series-break screens without exposing the Firebase room document ID.
- Wait for Firebase anonymous-auth persistence to finish before considering a new anonymous sign-in, preventing refreshes from replacing a player's UID during an active party.
- Restore the remembered room automatically after a refresh without requiring both players to leave and join again.
- Rebuild Firestore room, player, and match listeners when connectivity returns or a phone tab becomes visible after being in the background.
- Retry terminated realtime subscriptions with bounded exponential backoff instead of leaving one device permanently frozen.
- Probe the authoritative room and active match every 15 seconds during play as a low-frequency fallback for silently stale mobile listeners; terminal probes also refresh final scores.
- Preserve the remembered room during temporary offline or unavailable errors, while clearing it only when the room is gone or the device no longer has access.
- Configure Firebase Emulator endpoints before authentication restoration, preventing `auth/emulator-config-failed` during refresh testing.
- Bound BEST OF 3 to five real rounds and BEST OF 5 to nine, resolving by higher win count or a series draw so repeated round draws cannot continue forever.
- Make NEXT ROUND and NEXT SERIES transaction-safe so concurrent host clicks create only one match or series.

### Security

- Gomoku moves atomically create one immutable move and update four authoritative 15-cell projections: the affected row, column, descending diagonal, and ascending diagonal.
- Firestore Rules verify the authenticated current player, assigned Black/White stone, exact next move number, coordinate bounds, one previously empty point in every projection, and all four projection paths in the same transaction.
- Rules inspect only the last move's four finite directional runs, force the first five-or-more line to become terminal, validate its persisted five-cell witness, and reject forged wins, draws, skipped moves, repeated points, spectator moves, and concurrent second moves within the Spark Rules expression budget.
- Gomoku score and series settlement reuse the existing idempotent `scoreApplied` transaction; clients cannot independently change winner, Series wins, or Party Score.
- Completed series atomically set their game-typed `scoreApplied` record once, while unfinished series keep it false.
- Only the host may select a known game while the room is in Lobby or `seriesBreak`; `activeGameType`, series `gameType`, and match `gameType` must match when a new series starts.
- Firestore Rules restrict direct role changes to the Lobby or `seriesBreak`, bind all three room counters to member/role transactions, cap total membership at eight, preserve seat and earned Party Score, and prevent in-series promotion.
- New members may create only their own member document; active-series joins must be spectators, non-members cannot read room subcollections, legacy missing roles continue to resolve safely as players, and schema-v3 counters migrate on the next join.
- Host spectators retain legitimate host management actions but cannot bypass current-player or player-role checks to submit a board move.
- Suggestion documents are member-readable, spectator-owned on submission, bound to the active match and move count, limited to empty cells, and resolvable only by the current player.
- Suggestions never authorize or perform formal moves and cannot modify the board, turn, winner, series score, or Party Score.

### Known Issues

- Casual Gomoku intentionally omits Renju forbidden-move rules and the waiting-practice AI is a bounded family-game opponent, not a professional Gomoku engine.
- Small phone screens require the provided board viewport and zoom controls for precise 15×15 interaction.
- Room recovery is intentionally tied to the original browser tab's anonymous identity; clearing browser site data or switching to a different device cannot recover that player's seat.
- Suggestions are intentionally ephemeral per turn and provide no free-text chat, image upload, history feed, or cross-device identity recovery.
- Room codes are convenient routing identifiers, not passwords; anyone who receives an active code may join until the eight-member room is full. After play begins, new identities are spectator-only.
- Anonymous identity remains browser-tab scoped. A link's `role` parameter is only a UI default and never grants server authority.

## [0.4.0-beta.1] - 2026-08-17

### Added

- Offline single-player Tic-Tac-Toe practice against a simple computer.
- Family-friendly Cyberpunk visual language for phone, tablet, and desktop layouts.
- Local multi-tab rooms for early multiplayer prototyping.
- Firebase Authentication and Firestore Emulator development foundation.
- Anonymous Firebase rooms with synchronized cross-device boards on the independent Spark project.
- Central application version metadata, localized in-product update links, and read-only release checks.

### Changed

- The public site now selects the production Firebase backend by default.

### Fixed

- Public entry-point cache busting prevents an obsolete local-room bundle from replacing Firebase rooms.
- Completed matches render explicit win or draw states, disable further moves, and show the winning line without relying on color alone.
- Host-only, transaction-protected controls advance to the next match or end the party, while non-host players receive a waiting state.
- Scores settle idempotently at +3 for a win and +1 per player for a draw, with automatic two-player rematches and round-robin rotation for larger rooms.
- All devices transition automatically through lobby, active match, round over, next match, and Party Podium without requiring a refresh.

### Security

- Firestore access requires authentication and uses restrictive room, player, and match rules.

### Known Issues

- This is a beta candidate, not a stable release.

[Unreleased]: https://github.com/Tao-2026/cyber-table/compare/v0.4.0-beta.1...HEAD
[0.4.0-beta.1]: https://github.com/Tao-2026/cyber-table/releases/tag/v0.4.0-beta.1
