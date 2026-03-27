# xcute-site

XCute is a modular Cloudflare Worker app with a shared scheduler and queue-first daily execution flow.

## What is in v0.4.1

- Built-in D1 binding in `wrangler.jsonc` for `DB` (`xcute_scheduler`)
- Smoother queue countdown with local optimistic start + gradual server reconciliation
- Animated shifting progress bars for running state and preserved paused progress visuals
- Selected goal workspace embedded directly inside the selected goal card
- Encoding cleanup and UI polish for clearer status text
- Existing queue APIs and deterministic spread planner preserved

## Routes

- `GET /` hub page
- `GET /scheduler` scheduler page
- `GET /api/health`
- `GET/POST/PATCH /api/goals`
- `GET/POST/PATCH /api/tasks`
- `POST /api/schedule/spread`
- `GET /api/schedule/goal?goal_id=...`
- `GET /api/schedule/timeline?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/queue/today?date=YYYY-MM-DD`
- `POST /api/queue/start`
- `POST /api/queue/pause`
- `POST /api/queue/skip`
- `POST /api/queue/complete`
- `POST /api/queue/break/ack`

## Required bindings/secrets

- `ASSETS` (static assets)
- `DB` (D1 binding, now defined in `wrangler.jsonc`)
- `WRITE_API_KEY` (Worker secret; used by client in `x-write-key` for mutating API requests)

## Deploy settings (Cloudflare Workers from Git)

- Build command: *(empty)*
- Deploy command: `npx wrangler versions upload`
- Root directory: `/`

Production URL:

- `https://xcute-site.derpdiepie8523.workers.dev/`

## D1 setup guide

See `D1_SETUP.md` for setup and migration steps.

## Versioning

- Current version: `VERSION`
- Release history: `CHANGELOG.md`
- Backup workflow: `RELEASE_WORKFLOW.md`
- Backup branch pattern: `backup/vX.Y.Z`
