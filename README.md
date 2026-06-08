# Arta Gătitului

Static recipe website for **Arta Gătitului**. The current public site is still generated as plain HTML, CSS, and vanilla JavaScript for GitHub Pages.

## Source Of Truth

The build source of truth is now:

- `src/content/categories.json`
- `src/content/aliases.json`
- `src/content/recipes/*.json`
- `src/data/tag-groups.json`
- `src/data/ingredient-aliases.json`

The browser now reads smaller generated data files based on the page being used:

- `assets/data/recipe-index.json`
- `assets/data/search-index.json`
- `assets/data/ingredient-index.json`
- `assets/data/categories.json`
- `assets/data/tag-groups.json`
- `assets/data/ingredient-aliases.json`
- `assets/js/site.js`

`assets/js/recipes.js` is still generated as a compatibility fallback, but normal generated pages do not load it eagerly anymore. `assets/js/site.js` progressively loads only the JSON index needed for the current page: search uses `search-index.json`, `Ce pot găti?` uses `ingredient-index.json` plus ingredient aliases, and category/home/randomizer/builder flows use `recipe-index.json`.

Do not edit `assets/js/recipes.js` as the source of truth. It is generated from `src/content` by `npm run build`.

## Static Recipe Pages

Recipe pages are statically rendered at build time. Generated files such as `retete/<slug>/index.html` contain the real recipe title, description, category metadata, ingredients, preparation steps, `Înainte să începi`, tags, ratings markup, special tools such as the steak calculator, and similar recipe links directly in the HTML source.

JavaScript is used as progressive enhancement. `assets/js/site.js` still powers theme switching, command palette, local ratings, checklist persistence, timers, search, ingredient matching, and other interactions, but recipe pages do not depend on JavaScript to show the core recipe content.

## Generated Browser Data

The build writes lightweight browser data under `assets/data/`:

- `recipe-index.json` contains card/category/randomizer-friendly recipe summaries.
- `search-index.json` contains normalized full-token search records.
- `ingredient-index.json` contains required/optional ingredient records for matching.
- `categories.json`, `tag-groups.json`, and `ingredient-aliases.json` mirror the source content needed by the UI.

Keep `assets/js/recipes.js` checked in for compatibility during the transition, but treat it as generated output rather than the primary browser payload.

## SEO And Indexing

SEO settings live in `src/scripts/build/config.mjs`. Change `SITE_CONFIG.siteUrl` there, or set `ARTA_SITE_URL`, before deploying to your real GitHub Pages URL. The checked-in default is an obvious placeholder: `https://YOUR-GITHUB-USERNAME.github.io/ArtaGatitului/`.

The build adds canonical URLs, robots meta tags, Open Graph tags, Twitter/social preview tags, Recipe JSON-LD, and BreadcrumbList JSON-LD where appropriate.

Indexing decisions:

- Normal pages are `index, follow`.
- Recipe pages and category pages are indexable and use canonical `/retete/<slug>/` and `/categorie/<slug>/` URLs.
- Legacy recipe and category aliases stay available, but their canonical URLs point to the canonical route.
- `adauga-reteta.html` is `noindex, follow` because it is an owner/admin-style recipe builder rather than public recipe content.
- `offline.html` is `noindex, nofollow` because it is a PWA fallback page.

The build generates `sitemap.xml` and `robots.txt`. The sitemap includes canonical public routes and excludes duplicate legacy aliases plus noindex pages.

Recipe schema only uses real content fields. Missing images, times, servings, ratings, nutrition, or dates are omitted rather than invented.

## Content Source Structure

```text
src/
  content/
    aliases.json
    categories.json
    recipes/
      <recipe-slug>.json
  data/
    tag-groups.json
    ingredient-aliases.json
  schema/
    recipe.schema.json
  scripts/
    build/
      config.mjs
      content-loader.mjs
      html-utils.mjs
      routes.mjs
      generate-data-assets.mjs
      generate-pages.mjs
      generate-sitemap.mjs
      generate-service-worker.mjs
      index.mjs
    import/
      import-godaddy-audit.mjs
    validate-content.mjs
```

### Content Files

- `src/content/categories.json` contains the category list.
- `src/content/aliases.json` preserves existing route aliases from the current browser data.
- `src/content/recipes/<slug>.json` contains one recipe per file.
- `src/data/tag-groups.json` contains the categorized tag groups used by recipes and the Recipe Builder.
- `src/data/ingredient-aliases.json` contains starter Romanian ingredient aliases for future ingredient matching improvements.
- `src/schema/recipe.schema.json` documents the recipe content shape.
- `src/scripts/build/` contains the modular static build pipeline.

## Recipe Shape

Recipe files use this stable structure:

```json
{
  "id": "recipe-slug",
  "slug": "recipe-slug",
  "title": "Recipe title",
  "description": "...",
  "category": "Fel principal",
  "ingredients": [],
  "steps": [],
  "beforeStart": [],
  "tags": {},
  "equipment": [],
  "prepTimeMinutes": null,
  "cookTimeMinutes": null,
  "totalTimeMinutes": null,
  "servings": null,
  "image": null,
  "sourceUrl": null,
  "createdAt": null,
  "updatedAt": null,
  "status": "published"
}
```

Some recipes may also keep compatibility fields such as `closing`, `extras`, `ratingSummary`, or `keywords` when those already exist in the current data.

## Add A Recipe

1. Create a new file in `src/content/recipes/` named with the recipe slug, for example `supa-noua.json`.
2. Set `id` and `slug` to the same stable slug.
3. Use an existing category title from `src/content/categories.json`.
4. Add non-empty `ingredients` and `steps`.
5. Add practical `beforeStart` items.
6. Add categorized tags using `src/data/tag-groups.json`.
7. Set `status` to `published`, `draft`, or `archived`.
8. Run validation before publishing.

## Validate Content

Run:

```bash
npm run validate:content
```

This checks recipe JSON files, category names, duplicate slugs, required fields, empty ingredients, empty steps, and invalid JSON.

## Build

Run:

```bash
npm run build
```

`npm run build` still uses `build-static-site.mjs` as the main entry point, but the entry point now delegates to `src/scripts/build/index.mjs`.

The build loads content from `src/content` and `src/data`, validates generated route collisions, and writes:

- `assets/data/recipe-index.json`
- `assets/data/search-index.json`
- `assets/data/ingredient-index.json`
- `assets/data/categories.json`
- `assets/data/tag-groups.json`
- `assets/data/ingredient-aliases.json`
- `assets/js/recipes.js`
- `assets/js/site.js`
- `assets/css/style.css`
- `manifest.json` and `manifest.webmanifest`
- `service-worker.js`
- `sitemap.xml`
- `robots.txt`
- homepage and utility pages
- canonical recipe pages under `retete/<slug>/`
- legacy recipe aliases under `<slug>/`
- category pages under `categorie/<category-slug>/`
- legacy category aliases under `<category-slug>/`
- PWA icons under `assets/icons/`

Set `ARTA_SITE_URL=https://your-domain.example/` before building to override the configured public URL used in canonicals, social tags, `sitemap.xml`, and `robots.txt`.

## Full Check

Run:

```bash
npm run check
```

This validates content and then rebuilds the static site.

## PWA Caching

The service worker uses an app-shell precache for core pages, CSS, JavaScript, icons, manifests, and the lightweight JSON indexes. It no longer precaches every recipe and category page during installation.

Runtime caching is split by purpose:

- HTML navigations use a network-first strategy with `offline.html` fallback.
- CSS, JavaScript, manifests, and JSON data use stale-while-revalidate.
- Images use cache-first caching with a small cleanup limit.

## Legacy GoDaddy Import

Old GoDaddy/site-audit files are no longer required for normal validation or build.

The legacy importer is kept separate only for intentional historical imports:

```bash
npm run import:godaddy
```

Normal `npm run build` does not read `site-audit/godaddy-page-text-inventory.json` or `site-audit/godaddy-recipes-only.md`.

## GitHub Pages

The project remains a static GitHub Pages site. No backend, database, framework, or runtime server is required.
