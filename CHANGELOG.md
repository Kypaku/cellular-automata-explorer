# Changelog

## 0.1.0 — 2026-10-23

First versioned release (the version was 0.0.0 before). Release steps: [RELEASE.md](RELEASE.md).

### Fixed
- Rule classifier: descendants rules are now classified by their own emission rule (they used to be reported as Dead).
- Rule classifier: cycle detection uses the whole `depth` window of rows, not only the last row, so depth > 1 rules no longer get false Fixed/Periodic tags.
- Rule classifier: with random collisions a repeated window counts as a cycle only if no random number was drawn in between.
- Rule classifier: with depth > 1 an empty or uniform row is reported as Dead only when the whole `depth` window is empty/uniform (an older row can revive the field; such rules used to get a false Dead).
- Large descendants rule spaces (8+ states) are sampled as full emission strings instead of numeric codes that lose their low digits.

### Changed
- The classifier and the evolution core share one step implementation (`createEvolver`), so analysis matches the interactive renderer.

### Added
- `npm run release` (`--dry-run`, `--skip-build`, `--target`) to sync `dist/` into the site folder.
- GitHub Actions CI (type-check, tests, build) and a release build artifact on `v*` tags.
- Unit tests for rule codes, evolution and classification (`npm test`).
- `RELEASE.md`: release checklist (checks, commands, manual steps for the owner).
