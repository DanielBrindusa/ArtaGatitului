# Published recipe editing and deletion

Milestone 11 extends the visual recipe editor to existing production recipes while keeping GitHub `main` authoritative. Opening a recipe never writes to GitHub.

## Read and draft flow

The native GitHub service reads the recursive `main` tree and accepts recipe blobs only from `src/content/recipes/<slug>.json`. Repository JSON is size-limited, parsed as data, checked for approved fields and unsafe URL values, validated, and normalized before it reaches the editor.

The **Recipes** browser searches the current GitHub title, category, and slug. Opening a recipe creates a deterministic Firestore edit draft containing:

- source path and original slug;
- source commit SHA and recipe blob SHA;
- the normalized source JSON snapshot;
- the normal Firestore revision and local recovery metadata.

The Milestone 8 visual editor is reused without a second editing model. Legacy sources without a block layout receive the default layout only in the draft; GitHub is unchanged until the editor reviews and publishes.

If a linked draft already exists, the editor offers **Continue draft** or **Discard draft**. Discard requires a second deliberate confirmation and deletes the synchronized draft before reloading current GitHub source.

## Change and conflict handling

Linked drafts display **Published**, **Draft changes**, or **Deleted**. The recipe browser also displays **Remote changed** when its current GitHub blob differs from the draft's source blob.

Review Changes compares normalized content rather than JSON formatting or property order. It summarizes title, slug, category, ingredient, instruction, checklist, equipment, tag, metadata, image, and block-layout changes. The review also lists each repository path as add, modify, or delete.

Immediately before commit, the native service fetches the latest production tree and verifies the expected blob identity for every affected path. Unrelated branch advancement is accepted and the reviewed changes are rebuilt on the latest tree. A changed or removed recipe blob, occupied destination slug, changed alias file, or changed image destination stops publication and requires a fresh load/review. Branch updates are always non-force.

## Slug rename and redirects

A rename is one commit containing the new recipe source, deletion of the old source, and an update to `src/content/aliases.json`. The new slug must not collide with a recipe or existing alias. Aliases that pointed to the old slug are retargeted, and the old slug becomes an alias for the new slug.

The static build generates `noindex` redirect pages for both `/retete/<old-slug>/` and the legacy root route. Canonical URLs, recipe/search/ingredient indexes, categories, randomizer data, related-recipe input, and sitemap are regenerated from source. Generated files are never edited by the CMS.

## Images and ratings

An update can retain the current image, replace it with a validated local JPEG/PNG/WebP, remove the recipe reference, or change alt text. Replacement and removal preserve the previous repository asset. The CMS never guesses that the old asset is orphaned.

Production deletion may remove an image only when the user opts in and repository analysis proves that the asset is an approved recipe-image path referenced by exactly that recipe. Shared, remote, missing, or uncertain assets are retained.

Visitor ratings remain browser-local. Published recipe source keeps a stable `id` across slug renames, and rating panels use that ID as the local-storage identity. Deleting a recipe does not delete unrelated browser rating data or reassign it to another recipe.

## Production deletion

Deletion starts from current GitHub source and requires typing the exact published title. Before review, the native service:

- verifies the recipe blob is still current;
- finds aliases that can be removed automatically;
- scans structured JSON under `src/content` for recipe slug, path, or route references;
- blocks deletion on references it cannot repair confidently;
- determines whether the recipe image is uniquely referenced.

The final review shows every affected source path. One non-force commit deletes the recipe JSON, removes aliases targeting it, and optionally deletes a proven-unique image. It cannot modify workflows, application code, package files, Firebase configuration, generated output, or arbitrary repository paths.

After success, Firestore retains the linked draft as `publishedDeleted` with archived recipe content, commit metadata, deletion time, and the original source snapshot. Publish readiness rejects this state. Reusing its content requires the explicit **Create as new recipe** action, which creates an unlinked draft with a new ID and slug.

## Verification boundaries

Automated tests exercise normalization, linkage, semantic changes, stable identity, deleted-draft lockout, command registration, path allowlists, non-force updates, Firestore rules, static generation, and Windows/Android shell architecture. Real GitHub mutation is not performed by tests. Production deletion must not be used as an integration-test mechanism; any live test should use temporary content on a dedicated safe branch.
