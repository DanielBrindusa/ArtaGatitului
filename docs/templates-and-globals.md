# Templates and Global Site Content

Milestone 13 adds one structured site-management layer shared by the CMS and static generator. It does not expose HTML, CSS, JavaScript, or repository paths for free-form editing.

## Source files

The canonical sources are:

- `src/content/site/templates.json`
- `src/content/site/global-blocks.json`
- `src/content/site/navigation.json`
- `src/content/site/settings.json`
- `src/content/site/theme.json`
- `src/content/categories.json`
- `src/data/tag-groups.json`

Recipe and page JSON may also change in the same publication when a template replacement, category migration, or tag merge updates dependencies.

## Template inheritance

A recipe or page may store:

```json
{
  "template": {
    "id": "recipe-default",
    "mode": "linked",
    "overrides": {}
  }
}
```

There is one inheritance level:

1. The content layout supplies content-bearing blocks.
2. The selected template orders compatible slots and supplies presentation defaults.
3. `template.overrides[slotId]` supplies explicit local presentation overrides.

Templates never contain recipe/page content. A linked item receives later template changes automatically wherever it has no override. Deep or recursive template inheritance is not supported.

`Detach` resolves the effective layout into the item and changes the assignment to `{ "id": null, "mode": "detached", "overrides": {} }`. It requires confirmation because future template changes stop propagating. `Reset to template` clears overrides without deleting structured content.

Deleting a referenced template requires a compatible replacement of the same content type. Locked defaults must first be replaced in Site Settings. The operation updates all linked assignments in the same site draft.

## Global blocks

`global-blocks.json` stores stable entries with `id`, `name`, `status`, and one validated shared block. Pages reference an entry through `global-reference` with `data.globalId`; nested global references are forbidden.

The editor reports every page using a global block. A referenced global block cannot be deleted. `Convert to local copies` resolves each reference into a cloned block with a new page-local ID and does not mutate the original global definition.

Header, navigation, and footer use the dedicated navigation model rather than global blocks. This keeps the site home link and core navigation recoverable.

## Navigation and chrome

`navigation.json` contains a structured `header` and `footer`. Navigation items have stable IDs, labels, a controlled target type, a target value, and children. Supported target types are Home, Page, Recipe, Category, System route, HTTPS/HTTP external URL, and a non-clickable Group.

The maximum menu depth is two. Internal targets are validated against current content. External targets reject unsafe protocols. The header logo is permanently linked to Home even if a Home menu item is removed. The same model renders desktop and mobile navigation.

## Categories and tags

Categories retain stable IDs independently from display title and route slug. Renaming a category updates matching recipe assignments; changing its slug updates structured navigation targets and reports the route change. Deletion requires an explicit replacement category and migrates affected recipes in the same commit.

Tag groups remain in `src/data/tag-groups.json`. Rename/merge deduplicates the destination value across affected recipes. Delete removes only the selected tag references and never deletes recipes. Impact counts are shown before destructive actions.

## Drafts and publication

All site changes live in one `contentType: "site"` Firestore draft with the existing one-second autosave, local recovery, monotonic revision, and cross-device conflict behavior. Image bytes are not part of this draft.

Before publication, the native app loads all managed source blob SHAs from GitHub `main`. The review compares every baseline SHA, validates every JSON value, lists changed files, and creates one expiring publication plan. Any GitHub change after the baseline was loaded blocks preparation or final publication. Only the exact paths listed above plus existing recipe/page source paths are accepted.
