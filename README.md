# xcute-site

XCute is a modular Cloudflare Worker app with a shared scheduler and a queue-first daily execution flow.

## What is in v0.4.2

- Queue-first scheduler UX at `/scheduler` (Today Queue is top/primary)
- Spotify-like queue controls: `Start`, `Pause`, `Skip`, `Complete`, `Continue After Break`
- Break skip now asks confirmation before forcing end of break
- Shared runtime queue state in D1 (works across tabs/devices)
- Break flow by duration bucket (5m / 10m / 15m)
- Goal-coupled planner workspace embedded in selected goal card
- Full timeline view across goals with per-date task rows and target-date/daily badges
- Existing deterministic spread planner preserved (`/api/schedule/spread`)
- Write-key diagnostics for key mismatch vs missing server secret

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
- `POST /api/queue/break/ack` (optional body: `{ "skip_break": true }`)

## Required bindings now

- `ASSETS` (static assets)
- `DB` (D1 database binding)
- `WRITE_API_KEY` (Worker secret; used by client in `x-write-key` for mutating API requests)

### Permanent secret setup (one-time)

Set your production secret once and keep it stable across deploys:

```bash
npx wrangler secret put WRITE_API_KEY
# value: WHATTHEHELLISABANANA69
```

Or set the same value in Cloudflare Dashboard -> Worker -> Settings -> Variables and Secrets.

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
