# xcute-site

Static modular starter site for Cloudflare Workers static asset deploys.

## Versioning and backup

- Current version is tracked in `VERSION`.
- Change history is tracked in `CHANGELOG.md`.
- Release/backup process is documented in `RELEASE_WORKFLOW.md`.
- Every release must create an immutable backup branch named `backup/vX.Y.Z`.

## Local structure

```text
.
|- index.html
|- VERSION
|- CHANGELOG.md
|- RELEASE_WORKFLOW.md
|- wrangler.jsonc
|- assets/
   |- css/
   |  |- tokens.css
   |  |- base.css
   |  |- components.css
   |  |- animations.css
   |- js/
      |- main.js
      |- modules/
         |- motion-pref.js
         |- hero.js
         |- reveal.js
         |- version.js
```

## Deploy to Cloudflare Workers (Git)

1. In Cloudflare, configure the project as **Workers deploy from Git**.
2. Keep `wrangler.jsonc` in repo root with:
   - `name: "xcute-site"`
   - `compatibility_date: "2026-03-27"`
   - `assets.directory: "./"`
3. Use project settings:
   - Build command: *(leave empty)*
   - Deploy command: `npx wrangler versions upload`
   - Root directory: `/`
4. Deploy and open the production URL:
   - `https://xcute-site.derpdiepie8523.workers.dev/`

The homepage renders the exact text: `Helllo, I am XCute`.
