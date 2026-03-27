# xcute-site

XCute is a modular Cloudflare Worker app with a space-themed hub and a simplified shared scheduler.

## What is in v0.3.1

- No-login shared scheduler at `/scheduler`
- Goal -> ordered task -> date spread workflow
- Deterministic spread engine (`/api/schedule/spread`)
- D1-backed persistence for shared data
- Write protection for changes using `x-write-key`
- No-task overhead planning block (`Goal Focus: <Goal Name>`)
- Clear per-goal edit controls (`Edit`/`Save`/`Cancel`)

## Routes

- `GET /` hub page
- `GET /scheduler` scheduler page
- `GET /api/health`
- `GET/POST/PATCH /api/goals`
- `GET/POST/PATCH /api/tasks`
- `POST /api/schedule/spread`
- `GET /api/schedule/goal?goal_id=...`

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

See `D1_SETUP.md` for step-by-step setup and migration commands.

## Versioning

- Current version: `VERSION`
- Release history: `CHANGELOG.md`
- Backup workflow: `RELEASE_WORKFLOW.md`
- Backup branch pattern: `backup/vX.Y.Z`
