# xcute-site

XCute is a modular Cloudflare Worker app with a shared scheduler and a queue-first daily execution flow.

## What is in v0.5.1

- Full-site cinematic motion system (hybrid CSS + WAAPI) across Hub and Scheduler
- Motion contract via `html[data-motion-mode="on"]` + reusable `data-animate` / `data-motion-role` hooks
- Motion is always on by default and auto-reduces only when OS `prefers-reduced-motion` is enabled
- Space ambient layer (nebula drift + star field canvas) with hidden-tab throttling
- Smooth route transitions between `/` and `/scheduler` with graceful fallback
- Pointer-reactive card depth for desktop (`data-tilt`) with touch-safe fallback
- Scheduler render stability patch: queue/timeline/workspace panels now use slice-based subscriptions + signature guards to avoid popping/replay on unchanged polling data
- Queue/timeline/goals/workspace state transitions unified through shared scheduler motion helpers
- Primary purple buttons now use a right-to-left vertical wavy sweep animation
- Mobile animation caps + reduced-motion compliance preserved
- Existing scheduler logic/API behavior unchanged from v0.4.4

## Routes

- `GET /` hub page
- `GET /scheduler` scheduler page
- `GET /api/health`
- `GET/POST/PATCH/DELETE /api/goals`
- `GET/POST/PATCH/DELETE /api/tasks`
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
