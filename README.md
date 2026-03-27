# xcute-site

Static modular starter site for Cloudflare Pages.

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

## Deploy to Cloudflare Pages

1. Create a GitHub repository and upload these files.
2. In Cloudflare Pages, choose **Create project** -> **Connect to Git**.
3. Select your repo and configure:
   - Framework preset: `None`
   - Build command: *(leave empty)*
   - Build output directory: `/`
4. Deploy and open your URL, for example: `https://xcute-site.pages.dev`

The homepage renders the exact text: `Helllo, I am XCute`.