# xcute-site

Static modular starter site for Cloudflare Pages.

## Local structure

```text
.
|- index.html
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
