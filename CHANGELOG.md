# Changelog

All notable changes for this project are documented in this file.

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
