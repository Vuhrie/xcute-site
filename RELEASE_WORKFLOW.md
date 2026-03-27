# Release Workflow

This project uses immutable backup branches and semantic versioning.

## Rules

- Version format: `vMAJOR.MINOR.PATCH`
- Backup branch format: `backup/vMAJOR.MINOR.PATCH`
- Every deployed change must include:
  - backup branch snapshot,
  - version bump in `VERSION`,
  - changelog entry in `CHANGELOG.md`,
  - deploy-ready Worker config,
  - route checks for `/`, `/scheduler`, `/api/health`.
- Never force-push or rewrite any `backup/*` branch.

## Version bump policy

- `PATCH`: small fixes and minor tweaks.
- `MINOR`: new features without hard compatibility breaks.
- `MAJOR`: breaking redesigns or contract changes.

## Release checklist (every change)

1. Read current version from `VERSION`.
2. Create immutable backup branch from current production commit:
   - `backup/<current-version>`
3. Apply code changes.
4. Bump `VERSION`.
5. Add top entry in `CHANGELOG.md`:
   - `## vX.Y.Z - YYYY-MM-DD`
   - `### Added/Changed/Fixed`
   - `Rollback: backup/vX.Y.Z`
6. Ensure required bindings/secrets are documented:
   - `ASSETS`, `DB`, `WRITE_API_KEY`
7. Deploy:
   - `npx wrangler versions upload`
8. Verify production:
   - pages load (`/`, `/scheduler`)
   - API health is OK
   - write-protected mutations require `x-write-key`

## Branch examples

- `backup/v0.1.0`
- `backup/v0.1.1`
- `backup/v0.2.0`
- `backup/v0.3.0`

## Rollback

1. Find rollback ref in `CHANGELOG.md`.
2. Redeploy that backup branch commit.
3. Verify site and API behavior for that version.
