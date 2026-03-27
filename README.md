# xcute-site

XCute is a modular Cloudflare Worker app with a shared scheduler and a queue-first daily execution flow.

## What is in v0.4.0

- Queue-first scheduler UX at `/scheduler` (Today Queue is top/primary)
- Spotify-like queue controls: `Start`, `Pause`, `Skip`, `Complete`, `Continue After Break`
- Shared runtime queue state in D1 (works across tabs/devices)
- Break flow by duration bucket (5m / 10m / 15m)
- Goal-coupled planner workspace (tasks + spread controls tied to selected goal)
- Full timeline view across goals with target-date/progress badges
- Existing deterministic spread planner preserved (`/api/schedule/spread`)

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

## Required bindings now

- `ASSETS` (static assets)
- `DB` (D1 database binding)
- `WRITE_API_KEY` (Worker secret; used by client in `x-write-key` for mutating API requests)

Removed from the app:

- `OTP_KV`
- `SESSION_KV`
- `RESEND_API_KEY`
- `OTP_FROM_EMAIL`

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
