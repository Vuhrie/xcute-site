# xcute-site

XCute is a modular Cloudflare Worker app with a shared no-login scheduler focused on queue execution and goal progress.

## What is in v0.6.0

- Removed decorative cinematic/reveal motion from hub and scheduler.
- Scheduler now prioritizes **Today Queue** with a sticky mini-player and pending-item reorder controls.
- Added goal importance model (`low | medium | high`) and hard-deadline conflict persistence.
- Added daily rollover API (`/api/rollover/app-open`) with summary banner + conflict reporting.
- Added analytics APIs and UI for day/range execution trends, goal risk, and rollover load.
- Timeline default window remains 30 days and now includes unscheduled conflicts.

## Routes

- `GET /`
- `GET /scheduler`
- `GET /api/health`
- `GET/POST/PATCH/DELETE /api/goals`
- `GET/POST/PATCH/DELETE /api/tasks`
- `POST /api/schedule/spread`
- `GET /api/schedule/goal?goal_id=...`
- `GET /api/schedule/timeline?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `POST /api/rollover/app-open`
- `GET /api/analytics/day?date=YYYY-MM-DD`
- `GET /api/analytics/range?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/queue/today?date=YYYY-MM-DD`
- `POST /api/queue/start`
- `POST /api/queue/pause`
- `POST /api/queue/skip`
- `POST /api/queue/reorder`
- `POST /api/queue/complete`
- `POST /api/queue/break/ack` (optional body: `{ "skip_break": true }`)

## Required bindings

- `ASSETS`
- `DB`
- `WRITE_API_KEY`

### Permanent secret setup (one-time)

```bash
npx wrangler secret put WRITE_API_KEY
# value: WHATTHEHELLISABANANA69
```

## Deploy settings (Workers from Git)

- Build command: *(empty)*
- Deploy command: `npx wrangler versions upload`
- Root directory: `/`

Production URL:

- `https://xcute-site.derpdiepie8523.workers.dev/`

## D1 setup

See `D1_SETUP.md` and ensure migrations through `0005_planner_queue_v060.sql` are applied.

## Versioning

- Current version: `VERSION`
- Release history: `CHANGELOG.md`
- Backup workflow: `RELEASE_WORKFLOW.md`
- Backup branch pattern: `backup/vX.Y.Z`
