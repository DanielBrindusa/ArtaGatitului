# Visual Page Builder

Milestone 12 extends the authenticated visual CMS from recipe drafts to Homepage and general page drafts. The public repository remains the publication source of truth; Firestore stores synchronized working drafts, and local IndexedDB stores temporary image bytes.

## Page source

Editable pages live in `src/content/pages/<slug>.json`. Homepage is always `src/content/pages/home.json` with `id`, `slug`, and `pageType` set to `home`. A page contains controlled metadata and a versioned block layout:

```json
{
  "id": "despre-noi",
  "pageType": "standard",
  "title": "Despre noi",
  "slug": "despre-noi",
  "description": "...",
  "socialImage": null,
  "status": "published",
  "layout": { "modelVersion": 1, "blocks": [] }
}
```

`src/schema/page.schema.json` documents the source shape. `validatePageSource` and the native publisher enforce it at runtime. Every page root contains one or more `section` blocks and every block has a stable page-local ID.

## Block library

Content blocks are Heading, Rich Text, Image, Button, Divider, Spacer, and Hero. Layout blocks are Section, Container, Columns, and Grid. Discovery blocks are Search, Recipe Grid, Featured Recipes, Latest Recipes, Category Grid, and Random Recipe.

Gallery and Recipe Carousel are intentionally not included yet: the current public design has no mature shared implementation for either. The builder does not present placeholder controls.

Discovery blocks store recipe slugs or category filters, not copied recipe objects. The recipe picker is populated from `src/content/recipes`, and category choices come from `src/content/categories.json`. Publication validation rejects missing recipe references.

## Nesting

The block tree has a maximum depth of five and uses these rules:

- Page root accepts Section only.
- Section accepts Container, Columns, Grid, content, and discovery blocks.
- Container accepts Columns, Grid, content, and discovery blocks.
- Columns accepts two to four Column blocks only.
- Column and Grid accept content and discovery blocks.
- A block cannot contain itself or one of its ancestors.
- Recipe-only blocks are not page children.

The same rules run in the editor model, shared validator, and native GitHub boundary. Drag handles use an 8-pixel activation distance for touch scrolling. Keyboard sorting and move-up/down buttons remain available. The inspector can move compatible content into another container or column, including empty targets.

## Layout and breakpoints

Widths are `narrow`, `medium`, `wide`, or `full`. Vertical spacing is one of `none`, `xs`, `sm`, `md`, `lg`, or `xl`. No arbitrary pixel dimensions or CSS strings are stored.

Columns use a 12-column grid. Desktop and tablet spans must total 12 and may use 3, 4, 6, 8, 9, or 12. Mobile columns stack at 12. The editor exposes presets such as 6/6, 4/8, and 3/9; pointer resize handles snap to the controlled width tokens.

Desktop is the base layout. Tablet and mobile store only explicit overrides and otherwise inherit the base. Mobile column stacking is the safe automatic default. Each block may be hidden independently at Desktop, Tablet, or Mobile. Global navigation is outside this page tree and cannot be hidden here.

## Rich text and links

Rich text is stored as structured paragraph, heading, bullet-list, or numbered-list nodes. Text spans may use bold, italic, and a safe link. The UI never stores arbitrary HTML. The renderer escapes every text value, and URL validation accepts safe relative, hash, HTTP, or HTTPS targets while rejecting `javascript:`, `data:`, `file:`, protocol-relative, and control-character obfuscation.

Button controls include a picker for current recipes and categories. Published page discovery is available from the Pages browser; general page slugs become `/<slug>/`, while Homepage generates `/index.html`.

## Routes

`src/shared/routing/page-routes.mjs` owns page route validation. A new page slug is checked against system paths, recipe slugs, aliases, category slugs, and existing pages. The static route plan performs a final output-path collision check.

Published page slugs are read-only in Milestone 12. Renaming an existing page is intentionally deferred until page aliases can preserve incoming URLs as safely as recipe aliases do.

## Drafts and conflicts

Page drafts use the existing `DraftService`, UID-scoped local recovery, Firestore collection, one-second autosave, monotonic revisions, and conflict dialog. `contentType: "page"` selects page metadata and the nested layout while preserving the same publication and source-link fields used by recipes.

Local JPEG, PNG, and WebP files are signature and dimension checked, stored in IndexedDB, and represented in Firestore by metadata only. A publish sends bytes directly to the native service, which writes approved `assets/images/pages/<slug>-<block-id>.<ext>` paths and rewrites the page block source in the same commit.

## Publishing and deletion

The Pages browser reads current page sources from GitHub `main`. Opening a page creates or resumes a deterministic linked Firestore draft with the source blob SHA. Publishing prepares an expiring native review plan, lists every source and image path, rechecks each expected blob immediately before commit, and updates `main` with `force: false`.

The runtime allowlist permits only:

- `src/content/pages/<slug>.json`;
- `assets/images/pages/<slug>-<block-id>.(jpg|png|webp)`;
- the pre-existing recipe publication paths.

Generated HTML, application source, workflows, package files, Firebase rules, and Tauri configuration remain outside the publication boundary.

Normal page deletion requires the exact title and scans structured content for dependencies. Blocking links must be removed first. Page assets are retained conservatively. Homepage deletion is rejected in the UI and native service.

## Homepage migration

`src/content/pages/home.json` models the established hero, recipe search, quick links, category grid, and featured recipes. The static generator renders this source through `renderBlockTree`; the previous hardcoded implementation remains as a temporary fallback when no structured Homepage is supplied. The generated IDs used by existing search, category, featured-recipe, and randomizer enhancement code are preserved.

The CMS preview and public generator therefore share the page model, renderer, design tokens, recipe catalog, and category catalog. Preview adds no selection handles or inspector controls.

## Current limits

- Existing system utility pages such as Search, Categories, Randomizer, and the ingredient matcher remain system-owned.
- Published page slug changes are blocked; create a new page and update dependencies instead.
- Rich text uses a controlled structured editor rather than a free-form document editor.
- Page image cleanup is conservative and does not delete old repository assets automatically.
- Full templates, global navigation, header/footer blocks, theme editing, and history belong to Milestones 13 and 14.
