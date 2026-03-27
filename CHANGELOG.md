# Changelog

All notable changes for this project are documented in this file.

## v0.5.5 - 2026-03-28

### Changed
- Retuned scroll reveal timing to trigger later using per-element `data-reveal-start` and `data-reveal-threshold` gates.
- Moved scheduler reveal orchestration from section-wrapper level to panel level so Goals, Workspace, and Full Timeline animate when each panel is actually reached.
- Bumped runtime labels and metadata to `v0.5.5`.

### Fixed
- Fixed early-finished reveal animations caused by panel mount-time animation running before panels were visible in the viewport.
- Fixed inconsistent planner reveal scope where one large wrapper animation did not match per-panel user scroll expectations.

Rollback: `backup/v0.5.5`

## v0.5.4 - 2026-03-28

### Changed
- Updated scroll reveal behavior to be section-based visibility instead of one-time reveal: animated sections now hide again when leaving viewport and re-appear when re-entering.
- Bumped runtime labels and metadata to `v0.5.4`.

### Fixed
- Fixed confusing behavior where animated sections stayed visible permanently after first scroll reveal.

Rollback: `backup/v0.5.4`

## v0.5.3 - 2026-03-28

### Changed
- Reduced scheduler vertical spacing and hero height so Planner appears sooner on initial scroll.
- Added an internal scroll container for Today Queue items, preventing the queue list from pushing Planner too far down.
- Bumped runtime labels and metadata to `v0.5.3`.

### Fixed
- Fixed excessive scroll distance required to reach the Planner section on `/scheduler`.

Rollback: `backup/v0.5.3`

## v0.5.2 - 2026-03-28

### Changed
- Updated motion fallback policy to keep animations on by default regardless of OS preference, only reducing when core animation APIs are unavailable.
- Strengthened primary button animation to a clearly visible right-to-left vertical wavy sweep.
- Bumped runtime labels and metadata to `v0.5.2`.

### Fixed
- Restored missing/weak button wave visibility on purple action buttons (`Start`, `Complete`, `Save Key`, etc.).
- Restored full-intensity animation behavior that had felt reduced in `v0.5.1`.

Rollback: `backup/v0.5.2`

## v0.5.1 - 2026-03-28

### Changed
- Stabilized scheduler rendering with slice-based subscriptions and signature guards so queue/timeline/task panels no longer replay entry motion on unchanged poll updates.
- Updated motion behavior to permanent default-on with OS reduced-motion fallback only, and removed user mode switching paths.
- Replaced button sheen with a right-to-left vertical wavy sweep effect on primary purple buttons.
- Bumped runtime labels and metadata to `v0.5.1`.

### Fixed
- Reduced visible UI popping/glitching caused by frequent full component re-renders during queue sync and timeline polling.

Rollback: `backup/v0.5.1`

## v0.5.0 - 2026-03-28

### Added
- Added a shared cinematic motion foundation with reusable hooks (`data-animate`, `data-motion-role`, `data-stagger`) and shared scheduler motion adapters (`assets/js/scheduler/core/motion.js`).
- Added global ambient space rendering with nebula/star drift, scroll parallax, and hidden-tab throttling in `assets/js/modules/ambient.js`.
- Added top-right quick motion toggle (`Motion On/Off`) with persisted preference under `xcute_motion_mode`.

### Changed
- Upgraded reveal orchestration to WAAPI-first staged reveals with mobile animation caps and reduced-motion compatibility.
- Added smooth route transitions between `/` and `/scheduler` with progressive enhancement fallback behavior.
- Upgraded queue/goal/workspace/timeline component transitions to shared animated state bumps and staggered row reveals.
- Refreshed global animation tokens, keyframes, and page styling for stronger cinematic space motion while keeping transform/opacity-first performance.
- Bumped runtime labels and metadata to `v0.5.0`.

### Fixed
- Reduced animation jitter risk by throttling pointer-reactive depth and ambient scroll updates.
- Removed ad hoc animation duplication by centralizing component motion helpers.

Rollback: `backup/v0.5.0`

## v0.4.4 - 2026-03-28

### Changed
- Optimized frontend scheduler orchestration with compact shared refresh and queue-action helpers in `assets/js/scheduler/core/actions.js`.
- Simplified scheduler component event/status plumbing to reduce duplicated control flow in goal/task/queue panels.
- Streamlined Worker queue route handling with shared query/date helpers for lower route-branch overhead in `src/worker.js`.
- Updated runtime labels and version metadata to `v0.4.4`.

### Fixed
- Reduced code duplication hot spots that were increasing future edit cost and maintenance complexity.

Rollback: `backup/v0.4.4`

## v0.4.3 - 2026-03-28

### Added
- Added write-key-protected delete APIs for goals and tasks (`DELETE /api/goals?id=...`, `DELETE /api/tasks?id=...`).
- Added goal/task delete actions in scheduler UI with confirmation prompts.

### Changed
- Switched planner desktop layout to a single stacked flow to remove the empty right-side gap.
- Moved selected-goal workspace out of embedded goal cards into a dedicated planner panel.
- Simplified queue countdown rendering to stay visually steady without catch-up acceleration artifacts.
- Bumped runtime labels and version metadata to `v0.4.3`.

### Fixed
- Fixed inability to delete tasks and goals end-to-end by cascading schedule and queue runtime cleanup.

Rollback: `backup/v0.4.3`

## v0.4.2 - 2026-03-28

### Added
- Added clear write-key diagnostics in UI for key mismatch vs server secret not configured.
- Added break-skip confirmation flow and API support for forced break acknowledgment (`skip_break`).
- Added stronger timeline/goal workspace reveal animations with reduced-motion fallback.

### Changed
- Reworked selected-goal workspace to read as a direct extension of the selected goal card.
- Expanded timeline loading window to include scheduled data + latest goal target date context.
- Improved queue countdown smoothness with local optimistic timer and gentle server reconciliation.
- Updated setup docs with one-time permanent secret configuration guidance for `WRITE_API_KEY`.
- Updated scheduler version labels to `v0.4.2`.

### Fixed
- Fixed full timeline rendering to consistently show per-date task rows.
- Fixed queue/task labels to remove prior encoding separator artifacts.

Rollback: `backup/v0.4.2`

## v0.4.1 - 2026-03-27

### Added
- Added in-repo D1 binding config in `wrangler.jsonc` for `DB` with `xcute_scheduler`.
- Added richer queue progress visuals: shifting gradient while running and preserved progress on pause.

### Changed
- Embedded selected goal workspace directly inside the selected goal card for clearer ownership.
- Improved queue timer behavior with optimistic local countdown and gradual server reconciliation to avoid visible jumps.
- Updated scheduler and hub version labels to `v0.4.1`.

### Fixed
- Fixed text encoding artifacts in scheduler labels and separators.

Rollback: `backup/v0.4.1`

## v0.4.0 - 2026-03-27

### Added
- Added shared queue runtime API and persistence (`/api/queue/*`) with D1 state tables via `migrations/0004_queue_runtime_v040.sql`.
- Added full timeline API endpoint for cross-goal schedule visibility (`GET /api/schedule/timeline`).
- Added new frontend queue module with controls and animated progress (`today-queue-panel`).
- Added selected-goal workspace module to couple task priority/spread controls directly to active goal (`goal-workspace-panel`).

### Changed
- Promoted Today Queue to top-most scheduler surface for immediate daily action.
- Refactored scheduler layout to goal list + selected-goal workspace + full timeline.
- Updated plan view to cross-goal timeline with target-date progress badges.
- Updated Worker schedule regeneration to clean stale queue state after re-spread.
- Bumped version to `v0.4.0`.

### Fixed
- Improved API error surfacing with explicit `request_failed` detail payloads for easier debugging.

Rollback: `backup/v0.4.0`

## v0.3.1 - 2026-03-27

### Added
- Added schedule migration for nullable `task_id` and persisted schedule titles to support overhead rows (`migrations/0003_schedule_overhead_v031.sql`).

### Changed
- Updated spread behavior to create a one-day overhead block (`Goal Focus: <Goal Name>`) when a goal has no active tasks.
- Updated schedule payload/query to expose a display title for both task-backed and system overhead rows.
- Replaced ambiguous goal edit area with explicit per-goal `Edit`/`Save`/`Cancel` actions.
- Bumped version to `v0.3.1`.

### Fixed
- Fixed confusing “plan generated but empty” behavior for no-task goals by rendering a visible planned block.

Rollback: `backup/v0.3.1`

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
