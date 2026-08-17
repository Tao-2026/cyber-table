# Changelog

All notable changes to Cyber Table are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Nothing yet.

### Changed

- Nothing yet.

### Fixed

- Nothing yet.

### Security

- Nothing yet.

### Known Issues

- Nothing yet.

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

### Security

- Firestore access requires authentication and uses restrictive room, player, and match rules.

### Known Issues

- This is a beta candidate, not a stable release.
- Round lifecycle work under review is intentionally not documented as released here.

[Unreleased]: https://github.com/Tao-2026/cyber-table/compare/v0.4.0-beta.1...HEAD
[0.4.0-beta.1]: https://github.com/Tao-2026/cyber-table/releases/tag/v0.4.0-beta.1
