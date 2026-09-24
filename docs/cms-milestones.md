# Arta Gatitului CMS Roadmap

This roadmap keeps exactly 15 major milestones and preserves the requested progression from audit to shared rendering, Tauri View Mode, authentication, synchronized drafts, visual CMS editing, publishing, safety, and final polish.

## Milestone 1 - Audit And Document Existing Architecture

Document the current repository, content model, generated output, build pipeline, renderer, recipe editor, PWA behavior, risks, and target CMS architecture. Do not implement later milestones.

Deliverables:

- `docs/cms-architecture.md`
- `docs/cms-milestones.md`
- Existing checks/build verified
- Documentation-only commit on `app-development`

## Milestone 2 - Extract Shared Rendering Foundations

Refactor carefully toward shared website/CMS rendering without changing public behavior.

Focus:

- Extract pure helpers from `build-static-site.mjs`
- Extract recipe, card, tag, rating, before-start, and related-recipe renderers
- Make generated recipe pages and recipe-builder preview share renderer logic where practical
- Strengthen schema coverage for currently used fields
- Keep all existing URLs and generated public output compatible

## Milestone 3 - Create Tauri 2 Application Foundation

Add the initial Tauri 2 project foundation after the shared renderer is stable.

Focus:

- Add Tauri 2 structure without changing the public website
- Configure Windows and Android-capable project basics
- Document local setup
- Add View, Edit, and Settings navigation shells without implementing editor behavior
- Prove the shared renderer can power an isolated local application preview
- Keep native capabilities empty until a later milestone requires specific access
- Avoid Firebase, GitHub auth, and CMS editing in this milestone

## Milestone 4 - Windows View Mode

Build a native Windows View Mode that displays the public recipe experience.

Focus:

- Load bundled or local static website assets
- Preserve search, categories, recipe pages, randomizer, and PWA-safe behavior
- Add native-window polish appropriate for desktop use
- Confirm service-worker/install prompt behavior does not conflict with the native shell

## Milestone 5 - Android View Mode

Extend View Mode to Android through Tauri 2.

Focus:

- Validate mobile layout inside Android shell
- Confirm offline/static asset strategy
- Test navigation, search, randomizer, recipe pages, and local ratings
- Keep editing/authentication out of scope

## Milestone 6 - Authentication Foundation

Add the foundation for authenticated Edit Mode.

Focus:

- Add Firebase Authentication configuration
- Keep zero-cost personal/small-family usage assumptions
- Do not store secrets in the repository
- Gate editor-only surfaces from public View Mode
- Keep GitHub publishing out of scope

## Milestone 7 - Firestore Synchronized Drafts

Add synchronized draft storage for authenticated editors.

Focus:

- Store drafts and small editor state in Firestore
- Keep GitHub repository as published source of truth
- Avoid Firebase Storage
- Add validation boundaries between draft data and publishable content
- Support local and remote draft conflict handling basics

## Milestone 8 - Visual Recipe CMS

Build the first authenticated visual CMS for recipes.

Focus:

- Create/edit recipe structured fields
- Edit ingredients, instructions, before-start checklist, equipment, tags, timings, servings, and images
- Use the shared renderer for live preview
- Export/save draft data in the same structure needed by the static website build
- Avoid arbitrary executable HTML/JavaScript content

## Milestone 9 - GitHub Authorization And Publishing

Add authenticated publishing from CMS drafts to GitHub.

Focus:

- Authorize GitHub operations safely
- Commit validated content changes to the repository
- Preserve branch safety and avoid force-pushes/history rewrites
- Keep publication auditable through Git history
- Handle push/authentication failures without destructive credential changes

## Milestone 10 - Automated Validation, Build, And Deployment

Add or refine GitHub Actions for validation, static build, and GitHub Pages deployment.

Focus:

- Run content validation and build in CI
- Generate/deploy static output safely
- Preserve sitemap, canonical URLs, aliases, search, randomizer, ratings, and PWA behavior
- Add build artifacts/logging useful for publishing diagnostics

## Milestone 11 - Editing And Deleting Existing Recipes

Expand CMS recipe workflows beyond adding new recipes.

Focus:

- Load existing repository recipes into Edit Mode
- Edit existing recipes without slug/URL regressions
- Support archive/delete flows with confirmations and compatibility rules
- Preserve aliases when slugs change only if explicitly approved
- Validate all content before publish

## Milestone 12 - Full Page And Homepage Visual CMS

Add visual editing for non-recipe pages and homepage sections.

Focus:

- Model homepage and normal pages as structured block data
- Edit discovery sections such as featured recipes, latest recipes, categories, search, and random recipe blocks
- Preserve existing homepage/search/category user experience
- Keep layout responsive and constrained

## Milestone 13 - Templates, Global Blocks, Navigation, And Theme Editing

Add reusable site-wide editing systems.

Focus:

- Recipe and page templates
- Global header/footer/navigation blocks
- Navigation editor
- Site settings
- Theme/design token editor
- Template attachment, overrides, and safe detachment behavior

## Milestone 14 - History, Undo/Redo, Rollback, And Publishing Safety

Make editing and publishing safer.

Focus:

- Editor undo/redo
- Draft revision history
- GitHub-backed publish history
- Rollback flows
- Publish previews and validation summaries
- Conflict detection between drafts and repository changes

## Milestone 15 - Security Hardening, Responsive Polish, And Final Windows/Android Testing

Finalize the product for the intended personal/small-family use case.

Status: implemented for version `1.0.0`; automated and local build results are recorded in `docs/release-readiness.md`, while account/device acceptance items remain in `docs/final-setup-checklist.md`.

Focus:

- Security review for authentication, Firestore rules, GitHub publishing, and content sanitization
- Responsive polish across desktop, tablet, mobile, Windows, and Android
- PWA and native shell compatibility testing
- Accessibility pass
- Performance pass
- Final documentation and operational runbooks
