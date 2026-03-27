# xcute-site

XCute is now a modular Cloudflare Worker app with:
- Homepage hub route: `/`
- Smart scheduler route: `/scheduler`
- API route namespace: `/api/*`
- Deterministic goal-focused planner engine

## Versioning and backup

- Current version: `VERSION`
- Release history: `CHANGELOG.md`
- Backup/release process: `RELEASE_WORKFLOW.md`
- Immutable backup branches: `backup/vX.Y.Z`

## Core structure

```text
.
|- index.html
|- scheduler.html
|- VERSION
|- CHANGELOG.md
|- RELEASE_WORKFLOW.md
|- wrangler.jsonc
|- src/
|  |- worker.js
|  |- planner.js
|- assets/
   |- css/
   |  |- tokens.css
   |  |- base.css
   |  |- components.css
   |  |- animations.css
   |  |- hub.css
   |  |- scheduler.css
   |- js/
      |- main.js
      |- modules/
      |  |- motion-pref.js
      |  |- hero.js
      |  |- reveal.js
      |  |- version.js
      |- scheduler/
         |- main.js
         |- core/
         |- components/
```

## Deploy to Cloudflare Workers (Git)

1. Keep `wrangler.jsonc` in repo root.
2. In Cloudflare Workers deploy-from-git settings:
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler versions upload`
   - Root directory: `/`
3. Worker static asset binding is `ASSETS`.
4. Production URL remains:
   - `https://xcute-site.derpdiepie8523.workers.dev/`

## Recommended bindings (Dashboard or Wrangler env bindings)

Optional but recommended for durable cloud sync:
- `DB` (D1 database)
- `OTP_KV` (KV namespace for otp tokens)
- `SESSION_KV` (KV namespace for auth sessions)
- `RESEND_API_KEY` + `OTP_FROM_EMAIL` (optional real email OTP delivery)

Without these bindings, the app falls back to in-memory runtime storage.

## API summary

- Auth:
  - `POST /api/auth/request-otp`
  - `POST /api/auth/verify-otp`
  - `POST /api/auth/logout`
- Domain:
  - `GET/POST/PATCH /api/goals`
  - `GET/POST/PATCH /api/milestones`
  - `GET/POST/PATCH /api/tasks`
  - `GET/PATCH /api/preferences`
- Scheduling:
  - `POST /api/schedule/generate`
  - `POST /api/schedule/reflow`
  - `GET /api/schedule/day?date=YYYY-MM-DD`
  - `PATCH /api/blocks/:id/lock`
  - `PATCH /api/blocks/:id/complete`
