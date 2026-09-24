# History and recovery

Milestone 14 adds three separate recovery layers. They intentionally solve different problems and never rewrite Git history.

## Editor Undo and Redo

All recipe, page, homepage, template, global block, navigation, taxonomy, theme, and settings mutations pass through `useDraftWorkspace.updateDraft`. The workspace owns one snapshot/action history per open draft; individual React controls do not maintain private undo stacks.

- The in-memory limit is 50 actions per draft.
- Consecutive primitive edits to the same field within 800 ms are coalesced. Structural changes such as reorder, add, and delete remain separate actions.
- Undo and redo preserve the current Firestore revision metadata and pass the restored content through the normal local backup and autosave path.
- `Ctrl+Z`, `Ctrl+Y`, and `Ctrl+Shift+Z` work while focus is outside a native text control. Focused inputs and textareas keep their platform-native text undo behavior.
- Windows and Android both show explicit Undo and Redo buttons.

Undo is editor-level recovery. It does not move a Git branch or undo a published commit.

## Local recovery

Every local edit is written to the user-scoped local recovery store before the delayed Firestore autosave. Five synchronized checkpoints are retained per draft. This is intended to recover recent pending work after an application crash or forced close; it cannot guarantee recovery after every storage or operating-system failure.

When a dirty local copy is newer than the matching synchronized Firestore revision, the editor shows `A newer local recovery version was found.` It never silently replaces either version. The editor may:

- recover the local version and resume autosave;
- use the cloud version;
- save the local version as a new independent draft.

A real revision conflict uses a separate comparison dialog. Compatible top-level fields show Cloud and Mine values. The safe choices are Use cloud or Keep mine as copy; combining selected values remains an explicit manual edit.

## Publication history

The History control reads CMS-authored `cms:` commits from the configured GitHub repository's `main` branch. GitHub is the authoritative publication record. Firestore does not duplicate commit history.

History supports filters for recipes, pages, homepage, templates, navigation, theme, and other site changes. Commit details include author/date metadata supplied by GitHub, commit SHA, changed files, operation counts, asset status, and semantic JSON differences. When the active draft matches the selected path, the interface also compares that draft with the current published source.

The native service exposes only high-level history commands. It does not expose a generic Git commit, tree, ref, or force-push API to the webview.

## Content restore

Restore is content-scoped and always creates a new commit with the current `main` commit as its parent.

1. Select a CMS commit and an approved recipe, page, or site configuration source.
2. Load and normalize the historical JSON.
3. Inspect semantic differences and referenced assets.
4. Type `RESTORE` to create a local restoration draft and native review plan.
5. Review repository, branch, base commit, and every added or modified file.
6. Publish a new `cms: restore ...` commit.

The native service accepts only allowlisted source paths. Recipes receive safe migration for legacy `preparation`/`steps`, title/name, status, and missing layout metadata. Pages and site sources must validate against current schemas; restoration is blocked when migration is not confident.

Deleted recipe and page sources can be restored. If the old slug now belongs to a different content ID, automatic restoration is blocked so the editor can choose a new slug manually. Referenced historical JPEG, PNG, or WebP assets must exist in the current tree or selected historical tree. Missing current assets are read from Git history, size/type/dimension validated again, and re-added in the same restoration commit.

The publish writer checks every expected current blob immediately before commit creation, creates a commit whose parent is the latest branch commit, and updates the branch with `force: false`. It never hard-resets, force-pushes, or moves `main` backward.

Whole-repository rollback is deliberately not available in the CMS. Broad repository recovery remains a manual GitHub/Git operation for an experienced maintainer. Prefer content-level restoration or a fix-forward commit.

## Publish safety

Every production write has a separate review step showing repository, branch, base commit, added/modified/deleted files, route and dependency impact, validation checks, image status, and conflict status. Global site operations use a stronger `PUBLISH` confirmation and show the number of recipes and pages affected. Published recipe/page deletion retains exact-title confirmation and dependency checks.

Review plans expire after 15 minutes. Any changed base blob invalidates the plan and requires a fresh review.

## Deployment status

The UI uses these terms consistently:

- `Draft saved`: Firestore accepted the current draft revision.
- `Draft differs from published version`: local draft content no longer matches its GitHub source.
- `Publishing`: the reviewed commit is being created.
- `Committed`: GitHub accepted the source commit.
- `Building`: the public site does not yet expose that exact commit marker.
- `Live`: the generated site exposes the expected commit marker.
- `Build failed`: GitHub accepted the commit, but deployment returned a failure or did not become live during the bounded verification window.
- `Conflict`: cloud and local draft revisions diverged.

A committed source change is never reported as Live until the public marker matches. Build failure does not trigger automatic rollback because infrastructure may be at fault. The CMS links to GitHub Actions for inspection and recommends a corrected fix-forward commit. It does not request Actions workflow-write permission merely to rerun a job.

## Audit metadata

Successful publications write one owner-scoped Firestore audit document keyed by the new commit SHA. Allowed fields are operation, content type/ID, draft ID, editor Firebase UID, previous/new commit SHA, deployment status, and server timestamps. Rules reject additional fields and allow status-only updates after creation.

Tokens, passwords, authorization headers, private keys, source snapshots, and repository contents are never included in audit documents.
