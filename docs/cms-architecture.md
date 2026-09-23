# Arta Gatitului CMS Architecture Audit

Milestone 1 documents the current static recipe website before any CMS, Tauri, Firebase, or repository migration work begins. The existing public website is generated as plain HTML, CSS, JavaScript, JSON data assets, manifests, and a service worker that can be served directly by GitHub Pages.

## 1. Current Repository Architecture

The repository is a static-site generator plus generated static output checked into the same tree.

Current high-level layout:

```text
.
  build-static-site.mjs
  package.json
  README.md
  index.html
  categorii.html
  cauta.html
  ce-pot-gati.html
  adauga-reteta.html
  offline.html
  manifest.json
  manifest.webmanifest
  service-worker.js
  sitemap.xml
  robots.txt
  assets/
    css/style.css
    data/*.json
    icons/*.png
    js/recipes.js
    js/site.js
  src/
    content/
      aliases.json
      categories.json
      recipes/*.json
    data/
      ingredient-aliases.json
      tag-groups.json
    schema/
      block.schema.json
      recipe.schema.json
    shared/
      blocks/
      content/
      design/
      render/
      utils/
      validation/
    scripts/
      build/*.mjs
      import/import-godaddy-audit.mjs
      validate-content.mjs
  tests/*.test.mjs
  retete/<slug>/index.html
  categorie/<category-slug>/index.html
  <legacy-recipe-or-category-slug>/index.html
  site-audit/
  snippets/
```

Important files:

- `package.json` defines the npm scripts.
- `build-static-site.mjs` contains the page shell, generated browser JavaScript, most generated CSS, manifest/service-worker rendering, JSON-LD helpers, and PNG icon resizing helpers. Recipe presentation and root design tokens are now imported from `src/shared`.
- `src/scripts/build/*.mjs` contains the modular build pipeline around the large renderer entry point.
- `src/shared` contains framework-independent content normalization, content types, constrained block/layout models, validators, design tokens, safe HTML utilities, and shared recipe/block renderers.
- `src/content` and `src/data` are the current content source of truth.
- Root HTML files, `retete/`, `categorie/`, root-level recipe/category aliases, `assets/`, `manifest*.json`, `service-worker.js`, `sitemap.xml`, and `robots.txt` are generated public output.

There is no framework dependency, no bundler, no external test dependency, no lockfile, and no checked-in GitHub Actions workflow. Tests use the built-in Node test runner. The site remains suitable for GitHub Pages because all runtime output is static.

## 2. Current Content Flow

Current flow:

```text
src/content/recipes/*.json
src/content/categories.json
src/content/aliases.json
src/data/tag-groups.json
src/data/ingredient-aliases.json
        |
        v
npm run validate:content
        |
        v
npm run build
        |
        v
src/scripts/build/content-loader.mjs normalizes content
src/scripts/build/routes.mjs validates output route collisions
build-static-site.mjs renderers generate HTML/CSS/JS/manifest/SW
src/scripts/build/generate-data-assets.mjs generates browser indexes
src/scripts/build/generate-pages.mjs generates pages
src/scripts/build/generate-sitemap.mjs generates sitemap and robots
        |
        v
Generated static output committed to the repository
        |
        v
GitHub Pages serves the repository output
```

`npm run check` runs validation and then rebuilds.

The build is deterministic for content structure, but the default `BUILD_VERSION` is `Date.now().toString(36)` unless `ARTA_BUILD_VERSION` is provided. That means `assets/js/site.js`, `service-worker.js`, and cache-busting query strings can change even when content has not changed.

## 3. Source-Of-Truth Files

Primary source-of-truth files:

- `src/content/recipes/*.json`: canonical recipe content. There are 37 recipe JSON files.
- `src/content/categories.json`: canonical category list. There are 7 categories.
- `src/content/aliases.json`: route alias map for legacy recipe URLs.
- `src/data/tag-groups.json`: canonical grouped tag vocabulary used by recipes and the recipe builder.
- `src/data/ingredient-aliases.json`: ingredient alias list for ingredient matching.
- `src/schema/recipe.schema.json`: schema documentation for recipe shape, including `closing`, `keywords`, `extras`, and `ratingSummary`.
- `src/schema/block.schema.json`: first-version reusable block, layout, responsive, and tokenized-style schema.
- `src/shared/content/normalize.mjs`: compatibility adapter from current/legacy recipe JSON to the normalized recipe model.
- `src/shared/validation/*.mjs`: executable validation for source recipes and reusable blocks.
- `src/shared/render/*.mjs`: composable recipe presentation primitives and the future page/block preview renderer.
- `icon.png`: source icon copied and resized into `assets/icons/`.

Supporting source files:

- `build-static-site.mjs`: renderer and asset generator.
- `src/scripts/build/*.mjs`: build pipeline modules.
- `src/scripts/validate-content.mjs`: content validation script.
- `extract-godaddy-site.mjs` and `src/scripts/import/import-godaddy-audit.mjs`: legacy GoDaddy audit/import tooling, not used by normal builds.
- `README.md`: current operational documentation.

## 4. Generated Files

Generated public output includes:

- Root pages: `index.html`, `categorii.html`, `cauta.html`, `ce-pot-gati.html`, `adauga-reteta.html`, `offline.html`.
- Static utility routes: `portofoliu/index.html`, `randomizer/index.html`, `soon-to-come/index.html`.
- Canonical category pages: `categorie/<category-slug>/index.html`.
- Legacy category aliases: `<category-slug>/index.html`.
- Canonical recipe pages: `retete/<recipe-slug>/index.html`.
- Legacy root recipe aliases: `<recipe-slug>/index.html`.
- Legacy alias recipe routes from `src/content/aliases.json`, both under `retete/<alias>/` and `<alias>/`.
- Browser data indexes under `assets/data/`.
- Browser scripts: `assets/js/site.js` and compatibility fallback `assets/js/recipes.js`.
- Stylesheet: `assets/css/style.css`.
- Icons under `assets/icons/`.
- `manifest.json`, `manifest.webmanifest`, `service-worker.js`, `sitemap.xml`, and `robots.txt`.

These generated files must remain compatible with existing URLs until a future migration explicitly preserves or redirects them.

## 5. Existing Recipe Schema Analysis

`src/schema/recipe.schema.json` requires:

- `slug`
- `title`
- `category`
- `ingredients`
- `steps`
- `status`

The validator also requires:

- non-empty `slug`, `title`, and `category`
- unique slugs
- filename equal to `<slug>.json` as a warning if mismatched
- `category` must match a category title/name in `categories.json`
- non-empty arrays for `ingredients` and `steps`
- `beforeStart` must be an array when present
- `tags` must be an object when present
- `status` must be `published`, `draft`, or `archived`

Current recipe census:

- 37 recipe files.
- 37 published recipes.
- 0 draft recipes.
- 0 archived recipes.
- 37 recipes have `id`, `slug`, `title`, `description`, `category`, `ingredients`, `steps`, `beforeStart`, `tags`, `sourceUrl`, `status`, `closing`, and `keywords`.
- 29 recipes have `equipment`.
- 1 recipe has `extras`; `steak-de-vita` uses `extras: [{ type: "steak-calculator", ... }]`.
- 0 recipes currently have real `prepTimeMinutes`, `cookTimeMinutes`, `totalTimeMinutes`, `servings`, `image`, `createdAt`, `updatedAt`, or `ratingSummary` values.

Current category distribution:

- `Mic dejun`: 11 recipes
- `Fel secundar`: 18 recipes
- `Rontaieli`: 4 recipes
- `Fel principal`: 2 recipes
- `Desert`: 1 recipe
- `Salate`: 1 recipe
- `Băuturi`: 0 recipes

Current tag groups:

- `taste`
- `complexity`
- `time`
- `context`
- `diet`
- `equipment`
- `technique`

Important schema observations:

- The schema has `additionalProperties: true`, so content can silently accumulate fields. This helped the current migration but should be narrowed later.
- The renderer normalizes `title` into `name` for compatibility.
- `steps` is normalized into `preparation` for older renderer/client paths.
- `equipment` can come from either the top-level `equipment` field or `tags.equipment`.
- `ratingSummary` is supported by renderer logic but absent in current content.
- `extras` is supported but not part of the JSON schema properties. It is currently needed for the steak calculator.
- `keywords` is supported and populated in recipes, but it is not in the JSON schema properties.

## 6. Existing Rendering Analysis

Rendering is split between static build-time rendering and client-side progressive rendering.

Build-time rendering:

- `build-static-site.mjs` exports page-level renderers to `runBuild` and imports shared recipe rendering from `src/shared/render/recipe.mjs`.
- `page()` emits the shared document shell, SEO tags, manifest link, theme bootstrap, navigation, install prompt, theme panel, command palette, footer, and `assets/js/site.js`.
- `recipePage()` emits full recipe pages with real recipe content in HTML.
- `renderRecipeDetail()` composes shared hero, metadata, before-start, ingredients, instructions, tags, extras, ratings, card, and related-recipe primitives.
- `categoryPage()`, `homePage()`, `searchPage()`, `ingredientMatcherPage()`, `randomizerPage()`, and other pages mostly emit shell markup and placeholder containers that client JavaScript fills from generated data.

Client-side rendering:

- `assets/js/site.js` is generated from `jsFile()` in `build-static-site.mjs`.
- It progressively loads JSON indexes from `assets/data` depending on the page.
- It renders home cards, category grids, category recipe lists, search results, ingredient matches, randomizer plans, command palette entries, and recipe detail fallback behavior.
- It enhances static recipe pages with ratings, checklist persistence, steak calculators, quick actions, scroll progress, command palette, page transitions, theme switching, install prompt, and service worker registration.

Remaining renderer duplication:

- Server-side recipe cards, tags, ratings, before-start, related-recipe logic, and steak calculator markup are centralized in `src/shared/render/recipe.mjs`.
- The generated browser runtime still contains client-side counterparts for fallback/enhancement behavior.
- The legacy recipe-builder preview still creates DOM nodes independently. It can now migrate directly to `renderBlockTree()` or the same recipe primitives once a browser module/bundling boundary is introduced for the CMS.

This duplication is the main existing obstacle to a shared CMS preview/public renderer.

## 7. Existing Recipe Editor Analysis

The existing recipe creation page is `adauga-reteta.html`, generated by `recipeBuilderPage()` and powered by `setupRecipeBuilder()` in `assets/js/site.js`.

Current capabilities:

- Paste free-form recipe text and parse it into fields.
- Edit title, slug, category, prep time, cook time, servings, description, image URL/path, ingredients, before-start checklist, preparation steps, notes, keywords, grouped tags, and optional rating summary.
- Reorder and remove ingredient/before-start/step rows.
- Auto-slugify titles.
- Suggest tags from pasted text and timing.
- Validate required fields in the browser.
- Warn when a slug already exists.
- Render a live preview.
- Export the canonical content JSON expected by `src/content/recipes/<slug>.json`.
- Copy JSON to clipboard.
- Download JSON.
- Save/load an autosaved local browser draft.
- Import a previously exported JSON file.
- Download an `.eml` email draft with the JSON attached for a repository owner.

Current output shape:

- The main export is a recipe object compatible with `src/content/recipes/*.json`.
- It also creates legacy/fallback recipe objects inside an internal export package when saving local drafts.
- It sets `status: "published"`, `closing: "Poftă bună!"`, `extras: []`, and calculates `keywords`.

Preview fidelity:

- The preview uses the same CSS classes as recipe pages and broadly matches the public recipe layout.
- It does not call the exact same static recipe renderer used by `recipePage()`.
- It omits some generated-page details such as canonical metadata, JSON-LD, similar recipes, route context, and some exact accessibility IDs.
- This is a strong candidate for reuse as an early CMS form, but it should eventually call a shared recipe renderer rather than maintaining a separate DOM-building preview.

Recommended reuse:

- Reuse parsing, slugging, row editing, grouped tag selection, local draft autosave, JSON import/export, and validation ideas.
- Replace the long-term preview renderer with the future shared renderer.
- Keep this page during the transition as a low-risk owner tool and fallback path.

## 8. Existing PWA Analysis

Manifest:

- Generated as both `manifest.json` and `manifest.webmanifest`.
- Uses `name: "Arta Gătitului"` and `short_name: "Rețete"`.
- Uses `start_url: "./"` and `scope: "./"`.
- Uses `display: "standalone"` with `display_override: ["standalone", "minimal-ui"]`.
- Uses `prefer_related_applications: false`.
- References generated 192px and 512px PNG icons.

Service worker:

- Generated by `serviceWorkerFile()`.
- Registered by `registerServiceWorker()` in `assets/js/site.js`.
- Uses a cache name based on `BUILD_VERSION`.
- Precaches core shell routes and core assets, not every recipe page.
- Uses network-first for navigations and falls back to `offline.html`.
- Uses stale-while-revalidate for CSS, JS, JSON, and webmanifest assets.
- Uses cache-first for images with `MAX_IMAGE_CACHE_ITEMS = 60`.
- Cleans old cache versions on activation.
- Calls `skipWaiting()` on install and `clients.claim()` on activation.

Install UX:

- `setupInstallPrompt()` handles `beforeinstallprompt`, shows a custom install toast, supports dismissal in localStorage, and shows fallback installation help for platforms without a native prompt.

Tauri implication:

- Public PWA and Tauri View Mode should remain separate surfaces that can share website rendering but should not fight over service worker scope, install prompts, or native shell behavior.
- A Tauri wrapper should either load the static site in a controlled way or host bundled files without needing the browser install prompt.
- Future app builds should be careful with service-worker caching in development and native shells.

## 9. Existing Search, Randomizer, Category, Tags, And Ratings Architecture

Search:

- Build generates `assets/data/search-index.json`.
- `generate-data-assets.mjs` normalizes search text by removing diacritics, lowercasing, tokenizing, and deduplicating tokens.
- `setupSearch()` loads `search-index.json`, categories, and tag groups.
- Search uses full-token matching so short tokens such as `ou` do not match arbitrary longer words.
- `setupPrefilledSearch()` reads `?q=` from the URL.

Ingredient matcher:

- Build generates `assets/data/ingredient-index.json`.
- It splits ingredients into required and optional rows.
- It filters ingredient subheadings.
- It removes measurement and filler stop words.
- It expands aliases from defaults plus `src/data/ingredient-aliases.json`.
- Client-side `setupIngredientMatcher()` stores the user's available ingredient text in localStorage and groups matches by completeness.

Randomizer:

- `randomizer/index.html` provides a generated static shell.
- `setupRandomizer()` creates a random menu with slots for mic dejun, fel principal, fel secundar, desert, bautura, salata, and rontaieli.
- It stores a randomizer plan in sessionStorage so a floating randomizer panel can follow the user into recipe pages.
- Slot matching is hardcoded by category-name variants.

Categories:

- Build generates canonical `/categorie/<slug>/` and legacy `/<slug>/` category pages.
- Client-side category pages load recipe indexes and render recipes by category name.

Tags:

- Tags are grouped in `src/data/tag-groups.json`.
- Recipe cards show up to three priority tags based on a fixed priority order.
- Full recipe pages show grouped tag chips linking to search queries.

Ratings:

- Public aggregate rating rendering exists but no current recipes have `ratingSummary`.
- Visitor ratings are stored only in the local browser via localStorage keys of the form `artaGatituluiRatings:<slug>`.
- The site explicitly notes that public cross-user ratings would require a database.

## 10. Current Build And Deploy Pipeline

Package manager:

- npm.

Scripts:

```json
{
  "validate:content": "node src/scripts/validate-content.mjs",
  "build": "node build-static-site.mjs",
  "test": "node --test",
  "import:godaddy": "node src/scripts/import/import-godaddy-audit.mjs",
  "check": "npm run validate:content && npm run build && npm test"
}
```

Node assumptions:

- No `.nvmrc`, `.node-version`, `engines`, lockfile, or CI config is present.
- The audited local runtime was Node `v24.18.0` and npm `12.0.1`.
- The code uses modern ESM and built-in `fetch` in the legacy GoDaddy extraction script, so future automation should pin a current Node LTS or newer.

Deployment:

- No `.github/workflows` directory is present.
- The current deploy model appears to be checked-in generated files served by GitHub Pages.
- There is no automated build/deploy workflow yet.
- Later milestones should add GitHub Actions carefully, preserving the existing public output and URL structure.

## 11. Technical Debt Relevant To The CMS

- `build-static-site.mjs` remains large and still mixes page shells, most CSS, browser JS, manifest generation, service-worker generation, image resizing, and SEO helpers.
- The server-side recipe renderer is shared, but generated browser fallbacks and the legacy recipe-builder preview still duplicate parts of recipe presentation.
- The recipe schema now documents all fields in current use, but retains `additionalProperties: true` for backward compatibility until a versioned content migration exists.
- Validation is dependency-free and shared, but JSON Schema files are not yet executed by a general JSON Schema engine.
- Generated output is committed alongside source, which is practical for GitHub Pages but increases review noise.
- `BUILD_VERSION` defaults to a timestamp, so repeated builds can churn generated files.
- Search/randomizer/category rendering depends heavily on generated client-side indexes, while recipe pages are mostly static HTML.
- Randomizer category slot matching is hardcoded around category names and variants.
- There is no automated CI/deploy pipeline.
- SEO default `SITE_CONFIG.siteUrl` is still a placeholder unless `ARTA_SITE_URL` is set during build.
- Current images are mostly absent from recipe content and the hero uses a remote GoDaddy stock image URL.
- The builder preview is close to the public recipe layout but not the same renderer.
- Legacy GoDaddy audit files are tracked and useful historically, but they are not part of normal build flow.

## 12. Proposed CMS Target Architecture

The target should evolve incrementally toward:

```text
structured content
  -> normalized content models
  -> validated block/template/page data
  -> shared renderer
  -> static website output
  -> CMS preview output
  -> Tauri Windows/Android View Mode output
```

The finished architecture should keep zero mandatory hosting cost:

- GitHub repository remains the published content source of truth.
- GitHub Pages serves public static output.
- GitHub Actions can validate/build/deploy.
- Firebase Authentication can authenticate authorized editors.
- Firestore can store drafts and small synchronized editor state.
- No Firebase Storage for recipe/site images.
- Images remain in GitHub.
- Tauri 2 provides Windows and Android shells.
- No paid API or OpenAI runtime dependency.

Recommended architectural direction:

- Keep current public static output working while introducing shared foundations.
- Extract content normalization, schema validation, route planning, and rendering in small steps.
- Treat CMS data as structured JSON, not executable HTML.
- Separate structured content from layout/template data.
- Make CMS preview and static public build call the same renderer wherever practical.
- Keep generated output routes backward-compatible.

## 13. Proposed Shared Renderer Architecture

Target renderer layers:

```text
shared/
  content/
    loadContent()
    normalizeRecipe()
    normalizeCategory()
    validateContent()
  routes/
    buildRoutePlan()
    canonicalUrlFor()
  render/
    renderPageShell()
    renderBlockTree()
    renderRecipe()
    renderRecipeCard()
    renderCategory()
    renderNavigation()
    renderGlobalBlock()
  blocks/
    blockSchemas
    blockRegistry
    responsiveLayoutTypes
website/
  build/
    generateStaticSite()
    generateDataIndexes()
    generateSitemap()
cms/
  preview/
    renderPreviewUsingSharedRenderer()
  editor/
    visual editors call shared schemas and renderer
src-tauri/
  Tauri shell and native integrations
```

Near-term extraction order:

1. Move pure helpers out of `build-static-site.mjs`: `slugify`, `escapeHtml`, URL helpers, list rendering, time formatting, tag normalization, ingredient/token helpers.
2. Extract recipe rendering into shared functions that return HTML strings or a renderer-neutral virtual block model.
3. Make static recipe pages and recipe-builder preview call the same recipe renderer.
4. Extract card/category/search/randomizer view models so static output and CMS preview consume the same normalized data.
5. Introduce block rendering after the recipe renderer is stable.

Renderer requirement:

- The CMS preview must not be a separate imitation of public website HTML.
- The public build and CMS preview should share the same content normalization, block interpretation, layout rules, and component renderer.
- Surface-specific wrappers are acceptable: public pages need SEO and static routes; CMS preview needs selection handles, edit overlays, draft state, and unsaved markers.

## 14. Proposed Reusable Block Data Model

Blocks should remain structured and responsive, not arbitrary pixel-positioned objects.

Conceptual block shape:

```json
{
  "id": "stable-block-id",
  "type": "recipe.ingredients",
  "data": {},
  "layout": {
    "width": "wide",
    "spacing": {
      "top": "md",
      "bottom": "md"
    },
    "align": "start"
  },
  "responsive": {
    "desktop": {},
    "tablet": {},
    "mobile": {}
  },
  "variant": "default",
  "visibility": {
    "desktop": true,
    "tablet": true,
    "mobile": true
  }
}
```

Block families:

- Content blocks: heading, text, rich text, image, gallery, video, button, divider, spacer.
- Layout blocks: section, container, columns, grid.
- Recipe blocks: recipe hero, ingredients, instructions, before starting, equipment, cooking time, preparation time, servings, difficulty, tags, rating, related recipes.
- Discovery blocks: search, featured recipes, recipe carousel, categories, latest recipes, popular recipes, random recipe.
- Site blocks: navigation, header, footer, announcement, logo, social links.

Block rules:

- Every block has a stable ID.
- Every block has a registered type.
- Data is validated according to block type.
- Layout settings are constrained by tokens and enums.
- Responsive settings are breakpoint-specific overrides, not arbitrary CSS injection.
- User content cannot execute arbitrary HTML or JavaScript.
- Rich text should be a structured document format with an allowlist of marks/nodes.

Example recipe template block tree:

```json
{
  "id": "template-recipe-default",
  "type": "layout.section",
  "layout": { "width": "wide" },
  "children": [
    { "id": "hero", "type": "recipe.hero", "data": { "source": "recipe" } },
    { "id": "meta", "type": "recipe.meta", "data": { "fields": ["category", "prepTimeMinutes", "cookTimeMinutes", "servings", "equipment"] } },
    { "id": "before", "type": "recipe.beforeStart", "data": { "source": "recipe.beforeStart" } },
    {
      "id": "recipe-body",
      "type": "layout.columns",
      "layout": { "columns": [1, 1], "stackOn": "mobile" },
      "children": [
        { "id": "ingredients", "type": "recipe.ingredients", "data": { "source": "recipe.ingredients" } },
        { "id": "instructions", "type": "recipe.instructions", "data": { "source": "recipe.steps" } }
      ]
    }
  ]
}
```

## 15. Structured Content Vs Layout

Structured recipe content should remain independent from presentation.

Structured content examples:

- recipe title
- slug
- category
- ingredients
- instructions
- before-start checklist
- equipment
- prep/cook/total time
- servings
- tags
- source URL
- images
- status

Presentation/layout examples:

- which recipe blocks appear
- block order
- page width
- columns
- spacing
- card style
- responsive stacking
- variant choice

Recommended storage split:

```text
content/recipes/<slug>.json
  Pure recipe fields and metadata.

content/templates/recipe-default.json
  Block tree and presentation defaults.

content/pages/<page>.json
  Normal page structured content plus block layout.

content/globals/*.json
  Shared global block instances.

content/site/*.json
  Navigation, categories, tags, settings, theme tokens.
```

Individual recipe pages should be able to use a template, override selected layout settings, or detach from a template later, while keeping the recipe data unchanged.

## 16. Proposed Templates Model

Template types:

- `recipe.default`
- `recipe.dessert`
- `recipe.drinks`
- `page.normal`
- `page.category`
- `page.landing`

Template shape:

```json
{
  "id": "recipe-default",
  "name": "Recipe - Default",
  "appliesTo": "recipe",
  "version": 1,
  "blocks": [],
  "allowedOverrides": [
    "layout.spacing",
    "layout.width",
    "variant",
    "visibility"
  ]
}
```

Template behavior:

- Content items reference a template by ID.
- Template updates affect all attached pages unless an override exists.
- Overrides should be structured and explicit.
- Detaching from a template should copy the resolved block tree into the page.
- A migration should create a default recipe template that reproduces the current recipe page layout before adding new visual editing features.

## 17. Proposed Global-Block Model

Global blocks represent reusable site sections such as:

- header
- footer
- navigation
- announcement
- random recipe CTA
- social links
- reusable promotional section

Reference shape:

```json
{
  "id": "header-ref",
  "type": "global.reference",
  "data": {
    "globalId": "site-header"
  }
}
```

Global block storage:

```text
content/globals/site-header.json
content/globals/site-footer.json
content/site/navigation.json
content/site/theme.json
```

Rules:

- Editing a global block updates every page that references it.
- Global references should be resolvable at build time and preview time.
- Global blocks should be versioned so drafts can preview changes before publishing.
- Navigation should be structured data, not hardcoded arrays inside a renderer.

## 18. Proposed Responsive-Layout Model

Responsive layout should be tokenized and constrained.

Recommended concepts:

- Width tokens: `full`, `wide`, `content`, `narrow`.
- Spacing tokens: `none`, `xs`, `sm`, `md`, `lg`, `xl`.
- Column presets: `1`, `2-equal`, `sidebar-left`, `sidebar-right`, `3-equal`.
- Stack rules: `never`, `tablet`, `mobile`.
- Alignment: `start`, `center`, `end`, `stretch`.
- Visibility by breakpoint.
- Style variants registered per block type.

Avoid:

- arbitrary absolute X/Y positioning
- arbitrary script injection
- raw CSS from content
- unrestricted HTML blocks in recipe/page data
- device-specific content forks unless explicitly necessary

## 19. Recommended Folder Architecture

Do not move the repository immediately. Introduce the target structure incrementally.

Recommended eventual shape:

```text
content/
  recipes/
  pages/
  templates/
  globals/
  site/
shared/
  content/
  schema/
  render/
  blocks/
  routes/
website/
  build/
  public/
cms/
  app/
  editor/
  preview/
src-tauri/
  ...
assets/
  ...
docs/
  ...
```

Conservative migration from current tree:

1. Keep `src/content` where it is during early milestones.
2. Extract reusable code under `src/shared` or `shared` first.
3. Only move content from `src/content` to top-level `content` after imports, validation, and static build all support the move.
4. Keep generated public output paths unchanged.
5. Introduce `website/` once the build can emit public output reliably from shared modules.
6. Introduce `cms/` only after the shared renderer foundation exists.
7. Introduce `src-tauri/` after the web/static viewer is stable enough to wrap.

## 20. Migration Strategy

Recommended migration phases:

1. Documentation and audit: this milestone.
2. Extract shared rendering foundations without changing output.
3. Add deterministic build versioning for local/CI builds to reduce generated churn.
4. Strengthen schemas to include all fields currently in use.
5. Create shared recipe renderer and make recipe pages plus builder preview use it.
6. Create a block registry and represent the current recipe page as a template-backed block tree.
7. Add page/global/site content files behind current generated output.
8. Introduce the CMS shell and preview using the shared renderer.
9. Add Tauri 2 shell for View Mode only.
10. Add authentication and draft synchronization only after local editing/rendering is proven.
11. Add GitHub publishing with validation, branch safety, and rollback.

Backward compatibility requirements:

- Preserve `/retete/<slug>/`.
- Preserve root recipe alias routes.
- Preserve category alias routes.
- Preserve search behavior.
- Preserve randomizer behavior.
- Preserve local-only ratings behavior until a deliberate rating model is designed.
- Preserve PWA installability and offline fallback.
- Preserve sitemap and canonical URL behavior.

## 21. Risks And Mitigations

Risk: Static and CMS preview diverge.

- Mitigation: extract shared renderer before building the full visual CMS.

Risk: Refactor breaks existing GitHub Pages URLs.

- Mitigation: keep route plan validation, add route snapshot tests, and preserve aliases.

Risk: Generated output creates noisy diffs.

- Mitigation: add deterministic `ARTA_BUILD_VERSION` in CI and separate source/render changes from generated-output updates in reviews.

Risk: Overly flexible CMS content becomes unsafe.

- Mitigation: use schemas, block registries, allowlisted rich text, and no executable content fields.

Risk: Firestore drafts become source of truth accidentally.

- Mitigation: GitHub repository remains publish source of truth; Firestore stores drafts and editor state only until publication.

Risk: Images become a paid storage problem.

- Mitigation: store recipe/site images in GitHub, validate file paths, and optimize generated static assets.

Risk: PWA service worker conflicts with Tauri/native shells.

- Mitigation: isolate native app behavior and test service-worker scope in public web and Tauri contexts.

Risk: Missing Node/CI version causes inconsistent builds.

- Mitigation: add a Node version file and CI setup in a later milestone.

Risk: Hardcoded navigation and randomizer slots limit CMS editing.

- Mitigation: migrate navigation and discovery settings into structured `content/site` files.

Risk: Existing recipe schema omits real fields.

- Mitigation: update schema and validation before CMS writes content.

## 22. Current Functionality To Reuse

Reuse directly or adapt:

- `src/content/recipes/*.json` as the starting recipe source of truth.
- `src/content/categories.json` as the starting category source.
- `src/content/aliases.json` to preserve URL compatibility.
- `src/data/tag-groups.json` for initial CMS tag controls.
- `src/data/ingredient-aliases.json` for ingredient matcher.
- `src/scripts/build/routes.mjs` route planning and collision validation.
- `src/scripts/build/content-loader.mjs` normalization ideas.
- `src/scripts/validate-content.mjs` as a baseline validator.
- `generate-data-assets.mjs` index generation concepts.
- Static recipe page SEO and JSON-LD generation.
- Recipe builder parsing, slugging, local draft, import/export, and grouped tag UI.
- Search tokenization and ingredient matching logic.
- PWA install prompt, offline page, and service worker caching concepts.
- Local ratings as a no-cost personal browser feature.
- Steak calculator as an example of a typed recipe extra/block.

Replace or refactor:

- Separate static/client renderer duplicates.
- Hardcoded navigation arrays in `build-static-site.mjs`.
- Hardcoded randomizer slot/category matching.
- Timestamp default build version.
- Overbroad recipe schema.
- Monolithic CSS/JS generation inside `build-static-site.mjs`.

Do not reuse as future primary architecture:

- Raw generated `assets/js/recipes.js` as content source.
- Root generated HTML as editable source.
- Legacy GoDaddy audit files as normal build input.

## 23. Milestone 2 Plan At Audit Time

Milestone 2 should not introduce React, Tauri, Firebase, or authentication yet. It should focus on reducing renderer duplication and creating shared foundations while proving the generated site remains identical or intentionally unchanged.

Recommended Milestone 2 scope:

- Add a deterministic local build version option.
- Extract pure shared helpers.
- Extract recipe/card/tag/rating/before-start renderers.
- Point both build-time recipe pages and recipe-builder preview toward the shared renderer.
- Strengthen schema coverage for `closing`, `extras`, `ratingSummary`, and `keywords`.
- Add focused tests or snapshot checks for route plan and representative rendered recipe output.

## 24. Milestone 2 Implemented Architecture

Milestone 2 implemented the shared foundation without changing the content source of truth, public routes, or runtime framework.

### Shared layer

The framework-independent layer now lives under `src/shared`:

```text
src/shared/
  blocks/
    model.mjs
    layout.mjs
  content/
    types.mjs
    normalize.mjs
  design/
    tokens.mjs
  render/
    blocks.mjs
    recipe.mjs
  utils/
    html.mjs
  validation/
    blocks.mjs
    recipe.mjs
  index.mjs
```

- `content/types.mjs` records the runtime model version and JSDoc content contracts used by this JavaScript project.
- `content/normalize.mjs` is the backward-compatible adapter for current and legacy recipe/category JSON.
- `utils/html.mjs` owns shared slug generation, HTML escaping, and safe content URL checks.
- `validation/recipe.mjs` is used by the repository content validator.
- `design/tokens.mjs` owns the current root CSS constants and the initial controlled width, spacing, and radius vocabularies.
- `index.mjs` provides one future import surface for the CMS while individual modules remain usable by the static build.

### Block model

The first block model is versioned as `BLOCK_MODEL_VERSION = 1`. Every block has a stable lowercase `id`, registered `type`, structured `data`, optional constrained `layout`, optional breakpoint overrides in `responsive`, an allowlisted `variant`, and tokenized `style` options.

Registered generic types:

- `section`
- `heading`
- `text`
- `rich-text`
- `image`
- `divider`
- `spacer`
- `button`

Registered recipe types:

- `recipe-hero`
- `recipe-metadata`
- `ingredients`
- `before-starting`
- `equipment`
- `instructions`
- `rating`
- `related-recipes`

`src/schema/block.schema.json` documents the persisted form. `src/shared/validation/blocks.mjs` is the executable validation boundary. It rejects unknown types, unsupported fields, unsafe URLs, arbitrary style/CSS fields, invalid variants, and unregistered layout values. Text and rich text are plain strings or paragraph arrays; renderers escape them and do not accept executable scripts or raw HTML.

### Layout and responsive model

Layout is deliberately constrained:

- widths: `narrow`, `medium`, `wide`, `full`
- columns: `1`, `2`, `3`, `4`
- spacing: `none`, `xs`, `sm`, `md`, `lg`, `xl`
- alignment: `start`, `center`, `end`, `stretch`
- responsive keys: `desktop`, `tablet`, `mobile`
- responsive visibility: boolean per breakpoint

There are no X/Y coordinates, absolute-position fields, raw CSS declarations, or arbitrary breakpoint names. `layoutClassNames()` translates valid configuration into deterministic class names, and `renderLayoutTokenCss()` provides matching base/desktop/tablet/mobile rules for a future CMS preview and public block renderer.

### Structured recipe content versus presentation

Recipe files remain canonical structured content under `src/content/recipes`. They have not been converted into page-layout documents. A future recipe template may arrange recipe blocks, but blocks such as `ingredients` and `instructions` read their values from a normalized recipe supplied in render context; they do not duplicate ingredient or instruction content in the layout tree.

The recipe schema was extended backward-compatibly to document `closing`, `keywords`, `extras`, `ratingSummary`, and grouped tag arrays. Existing files remain valid and unchanged.

### Rendering path

Current static recipe rendering now follows:

```text
src/content/recipes/*.json
  -> normalizeRecipe()
  -> renderRecipeDetail() and composable recipe primitives
  -> recipePage() document/SEO shell
  -> generated recipe HTML
```

`renderBlock()` and `renderBlockTree()` call the same recipe primitives when supplied with recipe context. This is the preview boundary intended for the future CMS. The public build already consumes `renderRecipeDetail()` directly. Root CSS custom properties are emitted from `renderDesignTokenCss()` with the same current values.

### Backward compatibility and verification

- Current and legacy field aliases remain supported: `name`/`title`, `preparation`/`steps`, and tag-derived equipment.
- Unknown existing recipe properties are preserved by normalization.
- Existing recipe JSON was not rewritten.
- Existing generated route planning, aliases, sitemap behavior, PWA files, search indexes, randomizer, and local ratings behavior remain unchanged.
- Representative pre-refactor and post-refactor recipe article markup is byte-equivalent after normalizing Windows line endings.
- Tests cover all 37 recipes, schema/registry alignment, invalid blocks/layouts, escaping, synthetic image/rating content, and generated representative pages.

### Deferred work

The browser fallback renderer and current recipe-builder preview are still embedded in generated `assets/js/site.js`. Moving them to browser-consumable shared modules requires a deliberate browser module or small bundling boundary; that work should accompany the CMS preview rather than introduce a framework migration here. Page templates, persisted block trees, global blocks, navigation editing, and a theme editor remain later-milestone work.

## 25. Milestone 3 Implemented Application Foundation

Milestone 3 adds a native application boundary without relocating or converting the static website. The root npm project now orchestrates two outputs: the existing generated website and a Vite-built `cms/` frontend hosted by Tauri 2.

### Application layers

```text
src/content + src/shared -> existing static website build
                         -> CMS shared-renderer preview

cms/ React + TypeScript -> Vite web assets
                        -> Tauri Windows host
                        -> Tauri Android host when generated locally
```

`cms/` owns the application shell, hash-route state, View/Edit/Settings placeholders, and local preview presentation. It imports the Milestone 2 runtime through `src/shared/index.mjs`; `src/shared/index.d.mts` supplies strict TypeScript declarations for the same implementation. The proof-of-concept normalizes a local demonstration recipe and sends its structured block tree through `renderBlockTree()`. Real site CSS and shared design-token CSS are used inside an isolated preview iframe.

`src-tauri/` contains only the Tauri configuration, platform icons, a minimal Rust runner, and the `cms-local` capability. The stable package identifier is `ro.danielbrindusa.artagatitului`. `tauri.android.conf.json` establishes Android API 24 as the minimum supported level while keeping the same CMS frontend and Rust host.

### Native authority

The application currently has no privileged native feature surface. `cms-local` is local-only, applies to the `main` window, and declares no permissions. There are no plugins, custom commands, generic dispatchers, remote URL grants, filesystem grants, or frontend Tauri API dependency. The global Tauri bridge and asset protocol are disabled. CSP is explicit for development and production.

The local shared-renderer demo runs in a scriptless sandboxed iframe. Future remote public View content must use a separate window/webview identity with no CMS capability. Remote website JavaScript must never inherit permissions later added for authenticated local editing or publishing.

### Deferred work

Milestones 4 and 5 remain responsible for full Windows and Android View Mode behavior. Authentication, draft synchronization, real editor controls, file operations, and GitHub publishing also remain deferred. `Development mode` is only a shell status, not an access-control implementation. See `docs/app-development.md` for commands, dependency rationale, toolchain prerequisites, and audited target status.

## 26. Milestone 4 Windows View Mode

Milestone 4 implements the Windows public-reading path without duplicating or packaging the generated website. The local React shell stays in the configured `main` webview and Rust creates a capability-free child webview named `public-view` for `https://danielbrindusa.github.io/ArtaGatitului/`.

```text
local main webview
  -> product chrome, modes, loading/offline UI
  -> scoped bounds/visibility/fixed-navigation commands

remote public-view child webview
  -> real GitHub Pages site and website service worker
  -> no matching Tauri capability and no native IPC authority
```

The `cms-local` capability is webview-scoped to `main`. This distinction is essential: a window-scoped capability would apply to every child webview hosted by that window. The remote child has no remote capability entry, while the local shell receives only `view-mode-control`. That permission permits three commands and no arbitrary URL input, filesystem, shell, process, secret, GitHub, Firebase, or frontend opener access.

Rust owns the top-level navigation boundary. Only HTTPS URLs on the exact GitHub Pages host and within the `/ArtaGatitului` path are allowed to remain in the child. Valid external web and email URLs open through the system default handler; unknown schemes and malformed or lookalike destinations are blocked. New-window requests are always denied after routing an allowed internal target back into the existing child or handing a safe external target to the system.

The shell measures the website surface in logical pixels and updates the child bounds during resize. Loading and connectivity errors remain local so a remote failure cannot replace the whole application shell. A sandboxed iframe provides visual development fallback outside Tauri but does not represent the production security boundary.

The public site remains the sole source of public content. GitHub Pages updates appear after ordinary refresh/cache behavior. Authentication, editor services, drafts, and publishing remain later milestones.

## 27. Milestone 5 Android View Mode

Milestone 5 adds Android to the same frontend and Rust project without duplicating the website or creating a second mobile application. Desktop continues to use `public-view`; Android uses its one top-level `main` WebView.

```text
shared ViewMode React state + connectivity + offline UI
  -> browser adapter: sandboxed development iframe
  -> desktop adapter: capability-free public-view child
  -> Android adapter: replace bundled main URL with trusted public URL

shared Rust URL policy + external opener policy
  -> desktop child navigation hooks
  -> Android main-WebView navigation hooks
```

The Android window is marked `create: false` in the platform override and constructed from that same configuration in Rust. This allows the initial bundled page, every top-level navigation, download, and new-window request to pass through the View Mode policy. The bundled page performs the trusted reachability check and shows branded loading/offline recovery. On success, `location.replace()` removes that launcher entry and navigates the existing WebView to GitHub Pages.

This top-level transition is a security requirement, not merely a presentation choice. Tauri cannot distinguish an embedded iframe's IPC origin from its parent WebView on Android. `cms-android` therefore grants no commands, applies only to bundled local content, and no remote capability exists. When `main` becomes remote it has no native authority. The desktop-only commands additionally validate both `main` and the bundled shell origin, preventing a remote same-label caller from passing defense-in-depth checks.

Tauri's Android app plugin provides native Back handling: WebView history is traversed when `canGoBack()` is true, and otherwise normal Android Back is invoked. Replacing the startup page avoids a duplicate launcher step. Internal links remain in the WebView, while Rust sends validated external web/email destinations to the device handler and denies unknown schemes, downloads, and popup creation.

Android is not orientation-locked. The generated Activity handles orientation and screen-size changes in place. The local launcher and injected public-site compatibility CSS account for safe-area insets and edge-to-edge system bars. Normal Activity background/foreground preserves the WebView and its current navigation; OS process eviction may still produce a cold start at home. No deep-link intent filter is added, although the stable package identifier and centralized URL policy can support verified recipe App Links later.

The only generated manifest permission is `INTERNET`. There are no storage, location, contacts, camera, microphone, shell, filesystem, or broad IPC grants. Launcher and adaptive icon assets reuse the canonical repository artwork. Production signing credentials remain intentionally absent.

## 28. Milestone 6 Authentication Foundation

Milestone 6 introduces Firebase Authentication only inside the bundled local CMS frontend. Public View remains independent: its Windows child webview and Android top-level GitHub Pages document receive no Firebase state, no Tauri permission, and no bridge to the local authoring shell.

```text
local React shell
  -> AuthProvider
     -> FirebaseAuthGateway
        -> Email/Password sign-in
        -> browser-local Firebase session persistence
        -> auth-state observer
  -> exact UID allowlist
  -> Edit + Settings route guard

public View
  -> renders immediately regardless of auth state/configuration/network
```

The normalized state machine distinguishes initialization, signed-out, sign-in-in-progress, authenticated-but-unapproved, approved editor, recoverable authentication failure, and configuration failure. `resolveAppSurface()` is the single route decision: View always resolves publicly, while both current authoring routes resolve to the authentication gate unless state is `authenticated-editor`. Hiding a tab is never treated as route protection.

The Firebase SDK is isolated behind `FirebaseAuthGateway`. It initializes Email/Password Auth with `browserLocalPersistence`, observes restored sessions, signs in, and signs out. There is no registration, anonymous authentication, OAuth, phone authentication, custom token flow, Admin SDK, password-reset UI, or password persistence. Firebase error codes are converted to a small set of neutral user messages; raw errors and password values are not logged.

Editor approval compares the authenticated immutable UID against a comma-separated build-time allowlist. Email is display-only. This check protects UI exposure but is not backend authorization because client code and client configuration can be inspected or modified. Milestone 7 independently enforces the same explicit UID authorization in deny-by-default Firestore Security Rules.

The local CSP adds the exact Authentication API, token-refresh, and Firestore API origins used by this flow. No Firebase remote origin receives a Tauri capability, and no new native command permission is added. Firebase identity remains separate from future GitHub publishing authorization.

Android still displays the public site as an unprivileged top-level page. A small initialization-script control navigates back to the bundled local `#edit` route, destroying the remote document before the authentication UI loads. The same local guard then handles restored sessions or login. This preserves the Milestone 5 remote-content boundary while making Edit reachable on mobile without a second WebView or privileged remote iframe.

## 29. Milestone 7 Firestore Synchronized Drafts

Milestone 7 adds an authenticated draft system without changing the published website data path:

```text
structured editor state
  -> per-user local recovery record
  -> DraftService
  -> Firestore transaction
  -> workspaces/arta-gatitului/drafts/<draftId>

published static website
  <- GitHub repository (future publishing milestone)
```

Public View imports no draft service and remains usable when Firebase or Firestore is unavailable. Firestore is not queried by the published website, does not contain generated routes or search indexes, and is not a publication database.

### Draft contract and migration

Every draft has a stable ID, `contentType`, `schemaVersion`, title, slug, draft workflow status, structured `data`, separate `layout`, server-authoritative creation/update timestamps, updater UID, monotonic revision, and nullable publication metadata. Recipe data uses shared content model version 1; layout contains shared block model version 1 and validated `ContentBlock` entries. A storage validator permits incomplete editorial fields while the separate publish validator applies the existing complete recipe contract.

All Firestore and local-backup reads pass through `migrateDraft`. Version 1 is normalized into the current contract, while missing or unknown future schema versions fail closed. This gives later migrations one explicit boundary instead of allowing React components to interpret arbitrary stored objects.

Image references are metadata records only: expected filename, alt text, local attachment ID, source device ID, and nullable future repository path. Recursive validation rejects `data:` URLs and non-JSON/binary values before upload. Firebase Storage is not enabled, so another device can preserve and display attachment metadata but cannot claim that an unpublished local file is available there.

### Service and concurrency boundary

React components do not import Firestore. `DraftService` owns create, load, list, save, duplicate, delete, draft subscription, list subscription, and small per-user preference operations. It uses server timestamps and orders draft summaries by `updatedAt`; no composite index is required.

Saves and deletes run in transactions. A save carries the revision from which editing began, reads the current remote document, and writes only when the two revisions match. The committed revision is exactly one greater. Firestore retries a transaction when its read changes, and the explicit expected-revision check then converts that race into a conflict instead of last-write-wins. Deletes apply the same expected-revision check.

Snapshot listeners accept newer remote data only while the local document is clean. Dirty local data produces a conflict state and stays in recovery storage. The conflict dialog offers **Use cloud version** and **Save mine as copy**; there is intentionally no force-overwrite action and no CRDT or character-level merge.

### Autosave and local recovery

Keystrokes update editor state and a synchronous application-level `localStorage` recovery record. Remote Firestore autosave waits 1,000 ms after the latest edit, then flushes on blur, draft switching, connectivity restoration, and best-effort page/lifecycle transitions. UI states distinguish local recovery, cloud saving, committed save, offline recovery, conflict, and failure.

Recovery data is versioned and keyed by authenticated UID. It includes draft content and synchronization metadata only, never credentials or tokens. `localStorage` avoids new native capabilities and uses a Web API available to both target WebViews, but native restart persistence has not yet been device-tested. Clearing app/WebView data removes it. It is a recovery layer, not a secret store or a replacement for Firestore.

Firestore uses explicit in-memory caching. Persistent web cache support has not been proven across both Tauri WebView2 and Android WebView, so the architecture does not depend on IndexedDB persistence. Offline transaction failure leaves the dirty local record intact; a later online flush uses the same expected revision and can still surface a conflict safely.

### Collections and authorization

The active schema is shallow:

```text
workspaces/arta-gatitului/drafts/<draftId>
workspaces/arta-gatitului/settings/<settingId>
users/<firebaseUid>/preferences/<preferenceId>
```

Security Rules require both Firebase Authentication and an explicitly listed immutable UID. Workspace data is available only under the exact `arta-gatitului` path. Preferences additionally require `request.auth.uid == userId`. Draft creates require revision 1, updates require the previous revision plus one and immutable `createdAt`, and incoming documents have constrained keys and core types. Every unmatched path denies reads and writes.

## 30. Milestone 8 Visual Recipe CMS

The authenticated Edit route now hosts the visual recipe workspace described in `docs/visual-editor.md`. It keeps the Milestone 7 persistence boundary and adds pure structured editor operations, dnd-kit sorting, semantic responsive widths, a public-style shadow-root canvas, and an exact shared-renderer Preview mode.

The default recipe layout contains hero, metadata, ingredients, before-starting, equipment, instructions, rating, and related-recipes blocks. Hero, ingredients, and instructions are protected layout requirements. Basic heading, text, image, divider, spacer, and button blocks use the same controlled block registry and validation path. No editor control accepts raw HTML, JavaScript, CSS, arbitrary layout coordinates, or executable URLs.

Draft image files are validated and stored as IndexedDB blobs under the local WebView profile. Only attachment metadata synchronizes through the existing Firestore draft service. The architecture requests no additional Tauri command, filesystem capability, Android permission, Firebase Storage bucket, or publication credential.

The committed approved UID is a non-user placeholder, leaving deployed rules safe-deny until configured. Emulator tests substitute a test UID in memory and never contact production. `firestore.indexes.json` is empty because current queries need only automatic single-field indexes. Exact console and deployment steps are in `docs/firebase-setup.md`.

## 31. Milestone 9 GitHub recipe publishing

GitHub authorization is a second, independent trust boundary. Firebase Authentication still gates Edit Mode and Firestore drafts; a repository-scoped GitHub App Device Flow grants publishing authority to one native device. React receives only connection state, a user code, reviewed paths, and the final commit metadata. Access tokens, refresh tokens, refresh timing, repository requests, and Git object construction remain inside a narrow Rust service.

Windows stores the serialized rotating credential in Windows Credential Manager. Android uses encrypted SharedPreferences whose key is protected by Android Keystore. There is no plaintext fallback. The GitHub App Client ID is compile-time public configuration, while no client secret, password, classic PAT, or token is accepted from the frontend. The native HTTP clients are pinned to GitHub's OAuth and API endpoints; authenticated redirects may not leave `https://api.github.com`.

Connection verification requires the selected installation for repository ID `1256031473`, exact name `DanielBrindusa/ArtaGatitului`, `Contents: write`, `Metadata: read`, push access, and branch `main`. Runtime publishing can create only `src/content/recipes/<slug>.json` and a trusted `assets/images/recipes/<slug>.(jpg|png|webp)` path. Slugs generate paths internally, image bytes are validated natively, and existing paths are collisions rather than overwrite targets.

Preparation captures the latest branch commit and an immutable, expiring native review plan. Confirmation rechecks `main`; any branch movement invalidates the review and requires preparation and confirmation again. The Git Data API creates all blobs, one tree, and one commit, then updates `refs/heads/main` with `force: false`. A per-process publication lock prevents duplicate confirmation. Generated HTML, search data, sitemap, build output, workflows, configuration, and unrelated sources are outside this boundary.

After a successful branch update, the draft is marked `published` and records the commit SHA, repository, branch, source draft ID, slug, optional image path, and timestamp in Firestore. A Firestore failure cannot roll back an already-created Git commit, so the local published recovery copy remains dirty and the UI reports that metadata synchronization must be retried. The success state says **Committed to GitHub** rather than claiming deployment; automated deployment remains Milestone 10. Exact GitHub App setup and revocation steps are in `docs/github-app-setup.md`.

## 32. Milestone 12 full-page CMS

Editable website pages now use `src/content/pages/*.json`, `src/schema/page.schema.json`, and the same versioned block registry used by recipes. `home.json` is the required structured Homepage. Static generation, CMS canvas rendering, and preview all call the shared block renderer; the prior hardcoded Homepage remains only as a rollback fallback while the migration is exercised.

`DraftService` now stores a discriminated `recipe | page` draft union in the same Firestore collection and revision protocol. Page drafts contain controlled SEO metadata, a nested block tree, and image metadata. Local image bytes stay in IndexedDB until explicit publication. Existing conflict, local recovery, duplicate, delete-draft, and cross-device semantics are shared rather than reimplemented.

The page editor adds explicit Section, Container, Columns, Grid, content, and recipe-discovery blocks. Nesting depth and parent-child combinations are validated. Width, spacing, visibility, grid spans, and Desktop/Tablet/Mobile overrides are tokenized. Structured rich text stores safe nodes and marks rather than HTML. Recipe/category selectors read the canonical content catalogs.

The native GitHub service can read and publish `src/content/pages/<slug>.json` plus validated `assets/images/pages/<slug>-<block-id>.*` assets. It independently validates page identity, block nesting, routes, paths, unsafe strings, image contents, source blob freshness, and branch state. Existing page routes are immutable in this milestone. General page deletion scans structured dependencies and creates one reviewed non-force commit; Homepage deletion is impossible.

System utility pages and global header/footer/navigation remain outside editable page layouts. Those global templates and theme controls are reserved for Milestone 13. Detailed editor and publication behavior is documented in `docs/visual-page-builder.md`.
