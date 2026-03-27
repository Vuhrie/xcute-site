# D1_SETUP

Follow these steps once to enable shared persistent scheduler data.

## 1. Create D1 database

```bash
npx wrangler d1 create xcute_scheduler
```

Copy the returned `database_id`.

## 2. Set DB binding in repo config

`wrangler.jsonc` already includes:

- binding: `DB`
- database_name: `xcute_scheduler`
- database_id: `2c263539-df20-417e-be23-5ff0c4e8f982`

If you move to a different DB in future, update only the `database_id` in `wrangler.jsonc`.

## 3. Add write key secret

In Worker settings, add secret text:

- Name: `WRITE_API_KEY`
- Value: long random value (example: 32+ chars)

The scheduler UI stores this key in browser local storage and sends it in `x-write-key` for edits.

## 4. Apply migrations

Run migrations against the bound D1 DB:

```bash
npx wrangler d1 migrations apply DB --remote
```

If needed, apply local first:

```bash
npx wrangler d1 migrations apply DB --local
```

For existing installs, ensure these migrations are applied:

- `migrations/0003_schedule_overhead_v031.sql`
- `migrations/0004_queue_runtime_v040.sql`

## 5. Deploy

Push `main` and let Cloudflare run:

```bash
npx wrangler versions upload
```

## 6. Verify

1. Open `/api/health` and confirm `{ "ok": true, ... }`
2. Open `/scheduler`
3. Save your write key in the **Write Key** panel
4. Create a goal, add tasks, run **Generate Plan**
5. Verify **Today Queue** controls work (`Start`, `Pause`, `Skip`, `Complete`)
6. Refresh page and confirm queue/timeline state persists
