# Changelog

All notable changes to Cyber Table are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Nothing yet.

### Changed

- Active Firebase room context is retained per browser tab so refreshes return the same device identity to the same lobby, match, or Podium.

### Fixed

- Wait for Firebase anonymous-auth persistence to finish before considering a new anonymous sign-in, preventing refreshes from replacing a player's UID during an active party.
- Restore the remembered room automatically after a refresh without requiring both players to leave and join again.
- Rebuild Firestore room, player, and match listeners when connectivity returns or a phone tab becomes visible after being in the background.
- Retry terminated realtime subscriptions with bounded exponential backoff instead of leaving one device permanently frozen.
- Probe the authoritative room and active match every 15 seconds during play as a low-frequency fallback for silently stale mobile listeners; terminal probes also refresh final scores.
- Preserve the remembered room during temporary offline or unavailable errors, while clearing it only when the room is gone or the device no longer has access.
- Configure Firebase Emulator endpoints before authentication restoration, preventing `auth/emulator-config-failed` during refresh testing.

### Security

- Nothing yet.

### Known Issues

- Room recovery is intentionally tied to the original browser tab's anonymous identity; clearing browser site data or switching to a different device cannot recover that player's seat.

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
