# Changelog

All notable changes for this project are documented in this file.

## v0.3.0 - 2026-03-27

### Added
- Added D1 shared scheduler schema migration for goals, tasks, and schedule entries (`migrations/0002_shared_scheduler_v030.sql`).
- Added a guided D1 setup document (`D1_SETUP.md`).
- Added write-key protected mutation flow using `x-write-key` + `WRITE_API_KEY`.

### Changed
- Replaced OTP/user-scoped API with a shared no-login API in Worker runtime (`src/worker.js`).
- Simplified scheduler UX to goal selection, ordered tasks, spread controls, and grouped plan view.
- Applied full-site space theme (black/purple) through shared style tokens and component styles.
- Updated docs for new bindings and deployment behavior.
- Bumped version to `v0.3.0`.

### Fixed
- Removed legacy auth/milestone/reflow UI complexity that conflicted with the intended simple planning flow.

Rollback: `backup/v0.3.0`

## v0.2.0 - 2026-03-27

### Added
- Added Cloudflare Worker application runtime (`src/worker.js`) with API namespace under `/api/*`.
- Added deterministic goal-focused scheduler engine with generate/reflow support (`src/planner.js`).
- Added dedicated scheduler route page at `/scheduler` (`scheduler.html`).
- Added modular scheduler frontend (vanilla Web Components) for auth, goals, milestones, tasks, timeline, conflicts, settings, and reminders.
- Added homepage module hub design with explicit route cards.

### Changed
- Updated `wrangler.jsonc` to include Worker entrypoint while preserving static assets.
- Upgraded product version to `v0.2.0`.
- Updated runtime version labels and documentation for scheduler architecture and API-driven workflow.

### Fixed
- Consolidated routing and API handling in a single deploy unit to avoid page/API split drift.

Rollback: `backup/v0.2.0`

## v0.1.1 - 2026-03-27

### Added
- Added `wrangler.jsonc` with Worker asset directory config for static deploys.

### Changed
- Updated release docs and README deployment instructions for Workers + Wrangler flow.
- Bumped version references to `v0.1.1` for runtime badge fallback and metadata.

### Fixed
- Fixed Cloudflare deploy failure caused by missing Wrangler assets configuration.

Rollback: `backup/v0.1.1`

## v0.1.0 - 2026-03-27

### Added
- Added release metadata files: `VERSION`, `CHANGELOG.md`, and `RELEASE_WORKFLOW.md`.
- Added visible hero version badge with animation and reduced-motion support.
- Added version runtime module that reads `./VERSION` with a safe SemVer fallback.

### Changed
- Updated app bootstrap to initialize and render version information in the hero area.

### Fixed
- N/A (initial versioned baseline).

Rollback: `backup/v0.1.0`
