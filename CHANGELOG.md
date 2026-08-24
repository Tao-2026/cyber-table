# Changelog

All notable changes to Cyber Table are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Default BEST OF 3 series play, with SINGLE ROUND and BEST OF 5 options that the host may change only while the room is still in the Lobby.
- Local “PRACTICE WHILE WAITING / 等待时练习” for every Lobby member without leaving the room, changing party scores, or stopping Firebase listeners.
- Explicit PLAYER, SPECTATOR, HOST, and YOU roles, with separate Lobby pools and host/member role controls before a series starts.
- Structured spectator hand raises and one-cell move suggestions, including accept, dismiss, per-turn mute, an accessible Emoji halo, and no free-text messaging.

### Changed

- Active Firebase room context is retained per browser tab so refreshes return the same device identity to the same lobby, match, or Podium.
- Five-character room codes now use `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, excluding visually ambiguous characters while retaining compatibility with existing five-character alphanumeric codes.
- Room-code input ignores case, spaces, and hyphens; shared join links carry the normalized code and the Lobby explains that a room code is not a password.
- Player rotation now occurs after a complete series rather than after every individual round; spectators are excluded from pair selection and two-player rooms swap the opening X/O assignment between series.
- Series and role state are included in realtime listeners, reconnect restoration, and authoritative server probes.

### Fixed

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

- Firestore Rules restrict role changes to the Lobby, preserve seat and earned Party Score, and prevent spectators from moving or managing the party.
- Suggestion documents are member-readable, spectator-owned on submission, bound to the active match and move count, limited to empty cells, and resolvable only by the current player.
- Suggestions never authorize or perform formal moves and cannot modify the board, turn, winner, series score, or Party Score.

### Known Issues

- Room recovery is intentionally tied to the original browser tab's anonymous identity; clearing browser site data or switching to a different device cannot recover that player's seat.
- Suggestions are intentionally ephemeral per turn and provide no free-text chat, image upload, history feed, or cross-device identity recovery.
- Room codes are convenient routing identifiers, not passwords; anyone who receives an active code may request to join until the room is full or play begins.

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
