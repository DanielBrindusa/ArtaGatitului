# Site Settings and Theme

## Site settings

`src/content/site/settings.json` stores only settings consumed by the public build:

- site title and description;
- Romanian language and locale (`ro`, `ro_RO`);
- a safe default social image URL;
- default template IDs for recipe, page, landing page, and category content.

Settings reference existing templates. They do not contain arbitrary metadata tags, scripts, or paths.

## Theme tokens

`src/content/site/theme.json` is the controlled design source. The CMS edits these groups:

- `colors`: primary, accent, background, surface, text, muted text, and border;
- `typography`: approved heading/body fonts and a font-scale preset;
- `layout`: content width, section spacing, and card padding presets;
- `shape`: card and button radius presets;
- `cards`: border and shadow presets;
- `buttons`: size preset.

Colors must be six- or eight-digit hexadecimal values. Fonts and every dimension-like setting are selected from allowlists. Raw CSS values and expressions such as `url(...)`, `calc(...)`, or `javascript:` are not accepted.

`renderSiteThemeCss()` maps validated tokens to CSS custom properties used by the public shell and CMS preview. Invalid persisted data falls back to known defaults instead of being interpolated. `Reset theme` restores that exact default object after confirmation and does not alter content.

## Preview and impact

Theme editing previews representative Homepage and Recipe surfaces at Desktop, Tablet, and Mobile widths. Preview changes stay in the Firestore draft. Theme, header, navigation, footer, and settings are site-wide; publication review identifies those changes as global and lists every changed source file.

The public build reads the same structured settings, theme, navigation, templates, and global blocks used by the CMS. Generated output remains static and requires no runtime database connection.

## Native publication paths

The native allowlist adds only:

```text
src/content/site/templates.json
src/content/site/global-blocks.json
src/content/site/navigation.json
src/content/site/settings.json
src/content/site/theme.json
src/content/categories.json
src/data/tag-groups.json
```

Recipe/page JSON is accepted only through its existing slug-constrained source path and only when dependency migration requires it. Workflow files, arbitrary repository files, generated output, and filesystem paths remain inaccessible.
