# Visual Recipe Editor

Milestone 8 replaces the temporary structured draft form with a visual recipe editor for new drafts. It does not publish to GitHub and does not load or modify existing published recipes.

## Data flow

```text
inline controls / inspector / drag handles
  -> pure editorModel operations
  -> useDraftWorkspace.updateDraft
  -> synchronous UID-scoped local recovery
  -> 1 second debounced DraftService transaction
  -> Firestore revision check and save
```

The editor has no direct Firestore import. It edits the existing `RecipeDraft` contract, including normalized recipe content and a separate shared block layout. Incomplete recipe content may autosave, while block structure and stored URLs must always remain safe and serializable.

## Workspace

Desktop uses a block library, dominant recipe canvas, and contextual inspector. The top bar contains the active draft, save state, Edit/Preview mode, desktop/tablet/mobile selection, draft actions, account actions, and a disabled Publish control. At widths below 900 px, the library and inspector become bottom sheets. Floating icon buttons open them without reducing the canvas to three narrow columns.

Edit mode renders the actual public stylesheet in a shadow root. React adapters provide direct structured controls for the recipe hero, metadata, ingredients, before-starting items, equipment, and instructions. Generic blocks and non-editable recipe blocks use `renderBlock`. Preview mode removes all editor controls and calls `renderBlockTree` for the complete draft. The static site generator uses the same renderer and stylesheet.

Known visual differences are intentional editor chrome: selection outlines, section controls, resize handles, editable inputs, and list drag handles. Preview has none of them. Rating forms are rendered for placement inspection, but authors cannot set community rating values.

## Block registry

The recipe library contains:

- recipe hero;
- recipe metadata;
- ingredients;
- before starting;
- equipment;
- instructions;
- rating;
- related recipes.

The basic library contains heading, text, image, divider, spacer, and button. Every inserted block receives a random stable ID. Recipe hero, ingredients, and instructions are required and cannot be deleted or hidden. Other recipe blocks are singletons that can be removed and restored from the library. Basic blocks may be repeated.

Ingredients support checkbox, bullet, and plain presentation. Before-starting supports checklist, bullet, and plain. Equipment supports bullet and plain. Instructions support numbered and plain; numbering is derived from array order.

## Drag, keyboard, and resize behavior

`@dnd-kit/core`, `@dnd-kit/sortable`, and `@dnd-kit/utilities` provide pointer, touch, and keyboard sorting. Dragging starts only from explicit handles after an activation distance, which leaves normal selection and vertical scrolling available. Lists and page sections also have move-up and move-down controls as a non-drag alternative.

Enter inserts the next list row. Backspace on an empty row removes it safely. Focus follows inserted, removed, and keyboard-moved rows. Instruction numbers are never persisted separately.

Block resize handles snap to `narrow`, `medium`, `wide`, or `full`. Pointer movement changes only transient component state; the selected semantic value is committed once on pointer-up. Desktop writes the base layout width. Tablet and mobile write a corresponding responsive override, preserving inherited values at other breakpoints. No pixel width or absolute position is stored.

## Categories, tags, and slugs

Vite imports the repository's canonical `src/content/categories.json` and `src/data/tag-groups.json` sources at build time. The CMS has no separate hand-maintained taxonomy list. Title edits regenerate the slug only while it still matches the previous generated slug; after a manual slug edit, later title changes preserve it. Publish readiness accepts only lowercase letters, digits, and single hyphen separators, and rejects path separators or traversal.

## Draft images

The device picker accepts JPEG, PNG, and WebP. Validation checks file size, decoded dimensions, and magic bytes rather than trusting the extension. Accepted blobs are stored in the app WebView's IndexedDB database. Firestore receives only filename, alt text, local attachment ID, source device ID, MIME type, byte size, dimensions, and a nullable future repository path.

Object URLs are created only for the active local preview and revoked when replaced or unmounted. A missing blob from the source device shows a recovery prompt. A draft opened on another device retains its metadata and states that the image must be selected again or published from the original device. No filesystem capability, broad Android storage permission, Firebase Storage upload, base64 field, or data URL is used.

## Validation and publishing boundary

`validateDraftForStorage` protects every local and Firestore write. `validateDraftForPublish` additionally requires a non-placeholder title, safe slug, category, ingredient, instruction, valid normalized recipe, and all required layout blocks. The inspector displays the resulting issue list continuously.

Publish remains disabled with a Milestone 9 message. This milestone performs no GitHub mutation, image upload, live-site update, repository uniqueness check, or community rating mutation.

## Verification

`tests/visual-editor.test.mjs` covers the default template, inline identity edits, ingredient entry and reorder, instruction reorder, section reorder, semantic and responsive widths, invalid widths, readiness, unsafe slugs, JSON/Firestore-safe image metadata, shared renderer input, and image signature detection. Existing block, recipe renderer, draft, auth, Tauri, generated-output, and Firestore Rules tests remain part of the full check.
