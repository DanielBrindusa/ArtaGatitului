# Arta Gatitului

Static replacement for the GoDaddy recipe website.

The site now includes the crawled GoDaddy page text, category pages, recipe detail pages, search, a random recipe picker, and GoDaddy-style route aliases for the old public URLs.

## Main Files

- `index.html` - homepage
- `categorii.html` - category and recipe index
- `cauta.html` - searchable recipe list
- `assets/js/recipes.js` - single source of truth for recipe/category data
- `assets/js/site.js` - frontend rendering and search/randomizer logic
- `assets/css/style.css` - visual design
- `build-static-site.mjs` - regenerates the static pages from the extracted GoDaddy inventory

## Generated Pages

- Category pages:
  - `categorie/<category>/index.html`
  - `<category>/index.html` for old GoDaddy-style category routes
- Recipe pages:
  - `retete/<recipe>/index.html`
  - `<recipe>/index.html` for old GoDaddy-style recipe routes
- Utility pages:
  - `portofoliu/index.html`
  - `randomizer/index.html`
  - `soon-to-come/index.html`

## Data Source

The live GoDaddy crawl outputs are stored in:

- `site-audit/godaddy-page-text-inventory.md`
- `site-audit/godaddy-clean-page-text.md`
- `site-audit/godaddy-recipes-only.md`
- `site-audit/godaddy-page-text-inventory.json`

## Regenerate

Run:

```bash
node build-static-site.mjs
```

That rebuilds the static data, design files, category pages, recipe pages, and legacy route aliases.

## Local Preview

Open `index.html` directly in a browser. No backend, database, WordPress, or GoDaddy runtime is required.
