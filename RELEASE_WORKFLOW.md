# Release Workflow

This project uses immutable backup branches plus semantic versioning.

## Rules

- Version format: `vMAJOR.MINOR.PATCH`
- Backup branch format: `backup/vMAJOR.MINOR.PATCH`
- Every deployed change must include:
  - backup branch snapshot,
  - version bump in `VERSION`,
  - changelog entry in `CHANGELOG.md`,
  - deployed code update,
  - valid Worker config in `wrangler.jsonc`,
  - stable API and route behavior checks (`/`, `/scheduler`, `/api/health`).
- Never force-push or rewrite any `backup/*` branch.

## Version bump policy

- `PATCH`: small edits, bug fixes, style tweaks.
- `MINOR`: new features without breaking existing behavior.
- `MAJOR`: breaking redesign or incompatible behavior changes.

## Release checklist (every change)

1. Read the current version from `VERSION`.
2. Create immutable backup branch from the current production commit:
   - Branch name: `backup/<current-version>`
3. Apply and test code changes.
4. Bump `VERSION` to the next version.
5. Add a new top entry in `CHANGELOG.md` using:
   - `## vX.Y.Z - YYYY-MM-DD`
   - `### Added/Changed/Fixed`
   - `Rollback: backup/vX.Y.Z`
6. Commit and deploy to `main`.
   - Deploy command: `npx wrangler versions upload`
7. Verify site and version badge on production URL.
8. Verify scheduler API health and planner behavior on `/scheduler`.

## Branch examples

- `backup/v0.1.0`
- `backup/v0.1.1`
- `backup/v0.2.0`

## Rollback

1. Identify target backup branch from `CHANGELOG.md`.
2. Redeploy that branch commit (or cherry-pick to `main` as needed).
3. Confirm the site renders and badge shows expected version.
