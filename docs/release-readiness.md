# Release readiness audit

This document records the Milestone 15 audit for version `1.0.0`. Re-run the commands in `docs/release-process.md` after any release change. A passing automated suite is necessary but does not replace testing on the actual Windows and Android devices that will be used.

## Architecture summary

- Public site: static HTML, CSS, JavaScript, JSON indexes, PWA files, and images generated from validated `src/content` and `src/data` sources and deployed by GitHub Pages.
- Shared layer: framework-independent normalization, validation, block models, routing, design tokens, and renderers consumed by both the static builder and CMS previews.
- CMS: one React/TypeScript/Vite frontend for Windows and Android with Firebase Authentication, Firestore drafts, local recovery, visual recipe/page/site editors, templates, globals, theme, navigation, history, undo/redo, export, and publishing review.
- Native service: Tauri 2 with narrow View Mode and GitHub commands, platform credential storage, repository/path/schema validation, one-commit non-force publication, history, and restore.
- Deployment: GitHub Actions validates both development and production changes, but deploys only `main` through GitHub Pages.

## Security review result

- Tauri capabilities are local-only and webview-scoped. No remote origin receives native commands.
- No generic filesystem, shell, process, arbitrary command, arbitrary GitHub, or secret-bearing HTTP permission is present.
- Production CSP has no wildcard and no unsafe script execution. Inline styles remain allowed because React and the constrained theme/editor use style attributes; user-provided arbitrary CSS is rejected.
- Asset protocol and global Tauri injection are disabled.
- Firestore Rules use explicit approved UIDs, validated document shapes, monotonic revisions, owner-scoped audit/preferences, and default deny.
- GitHub is pinned to repository ID `1256031473`, `DanielBrindusa/ArtaGatitului`, and `main`; writes are allowlisted and non-force.
- Rich text and normal text are escaped; schemas reject executable URLs, traversal, raw scripts, arbitrary HTML, arbitrary CSS, unknown blocks, and unknown fields.
- JPEG, PNG, and WebP are signature-checked and decoded. New website images are normalized, resized to at most 2400 pixels on the long edge, converted to WebP when optimization is needed, and limited to 4 MB for publication.
- GitHub tokens use Windows Credential Manager or Android Keystore-backed encrypted preferences. Disconnect removes local credentials; GitHub-side revocation remains a separate user action.

## Dependency and license review

`npm audit` reported zero vulnerabilities. `cargo audit` reported no vulnerability failure and seven warnings: five unmaintained `unic-*` crates pulled through Tauri's `urlpattern`, one unmaintained `proc-macro-error`, and one `glib 0.18.5` unsoundness advisory. The latter two are in Tauri's GTK/Linux target dependency graph and are not compiled into the Windows or Android artifacts. They cannot be removed directly without replacing/upgrading the current Tauri graph, so they remain monitored transitive warnings rather than a risky release-time major update.

Direct JavaScript dependencies use MIT, Apache-2.0, or ISC licenses. Direct Rust dependencies use MIT and/or Apache-2.0 compatible licenses. No commercial-only runtime library or copied proprietary UI asset was identified. Keep transitive notices available through their packages and review every lockfile change.

## Performance observations

The measured generated public site contains 126 files and approximately 3.45 MB before HTTP compression. HTML is approximately 2.53 MB across all routes, JavaScript 295 KB, JSON 417 KB, and images 143 KB. Individual pages load only the indexes needed for their feature. The service worker uses network-first HTML, stale-while-revalidate assets/data, and bounded cache-first images.

The CMS production JavaScript bundle is approximately 1.46 MB uncompressed and 391 KB gzip. Firebase and the visual editor account for most of it. It is acceptable for a local authenticated tool, but route-level code splitting is a future optimization if startup becomes problematic on older Android devices.

Firestore autosave is debounced by one second. The normal workspace uses two list/settings subscriptions plus one active-draft subscription. There is no polling loop for drafts and binary images remain device-local. This is designed for personal or small-family Spark usage, not high-concurrency editorial teams.

Stress coverage includes a recipe with 100 ingredients and 100 steps plus existing nested-page and collection tests. Production data is not modified by stress tests.

## Accessibility and responsive review

The UI uses semantic buttons and headings, labeled inputs/dialogs, visible `:focus-visible` treatment, keyboard undo/redo and reordering alternatives, reduced-motion handling, touch-aware controls, responsive panels/sheets, and image alt-text editing. Public pages use semantic generated markup and responsive breakpoints.

This is an engineering accessibility pass, not WCAG certification or an assistive-technology audit. Screen-reader behavior, switch control, and a formal color-contrast inventory remain manual release checks.

## Scenario status

Automated domain tests cover creating and validating recipes, image metadata, autosave/recovery models, published recipe edits/deletes, homepage/page moves, site settings, templates, globals, taxonomies, conflicts, one-commit plans, deployment states, history, and restore. They do not write to production Firebase or GitHub.

The following require configured accounts and real devices and must be completed manually before production merge: end-to-end Firebase login, cross-device Windows/Android synchronization, a disposable publication through GitHub Actions, View Mode observing the deployed result, Android image picker, rotation/background/process recreation, and real token revocation. Never use valuable production content for destructive testing.

## Failure behavior

- Offline/Firebase unavailable: the local recovery copy remains available and sync reports a recoverable status.
- Permission denied or unauthorized UID: authoring remains blocked; public View remains available.
- GitHub unauthorized/expired/revoked: publication stops before a commit and offers reconnect/disconnect paths.
- Branch or blob conflict: confirmation rejects stale plans and requires a fresh review.
- Build not verifiable: status is `Could not verify deployment`, not a false confirmed failure.
- Malformed draft, missing local image, unsafe path, or invalid content: publication is blocked with content-level errors.
- API/rate-limit/network failure: no force update or partial repository write is attempted; retry starts from fresh repository state.

## Zero-cost runtime audit

- GitHub Pages hosts the static site. Published repositories and Pages/Actions usage remain subject to GitHub plan and fair-use limits.
- GitHub Actions validates and deploys. Included minutes/storage are finite, especially for private repositories.
- GitHub API and a repository-scoped GitHub App provide publication. API rate limits and abuse controls apply.
- Firebase Authentication provides manually created Email/Password accounts. Spark quotas and product-specific limits apply.
- Cloud Firestore stores small draft documents and preferences. Spark daily read/write/delete and storage quotas are finite; monitor usage in Firebase.

The runtime does not require Firebase Blaze, Storage, Hosting, Cloud Functions, a VPS, a paid CMS/database/auth provider, an OpenAI API, Play Store, or Microsoft Store. Optional store distribution and Windows code signing may cost money.

## Known limitations

- Firebase and GitHub account/device tests cannot be fully automated without touching external state.
- Unsigned Windows installers can trigger SmartScreen reputation warnings.
- Android production signing is intentionally external to the repository; the release APK was signed from the external `ledger` keystore without adding signing material to Git.
- CMS bundle size is larger than the public site and may start more slowly on low-end phones.
- Local draft JSON export is backup-only. Import is intentionally not implemented, avoiding an unreviewed ingestion path.
- An image that exists only on another device must be selected again on the publishing device.

## Milestone 15 verification record

Verified locally on 2026-09-24:

- `npm run doctor`: 0 failures; only the current shell's missing GitHub Client ID warning before the release-build shell was configured.
- `npm run check:all`: passed 37 recipes, 7 categories, 107 routes, 113 Node tests, generated-output validation, strict TypeScript, and CMS production build.
- `npm run test:firestore-rules`: 11/11 emulator scenarios passed.
- Rust: 20 tests passed, one opt-in real Credential Manager test ignored, and `cargo check` passed.
- Windows: release executable built and remained running during an 8-second hidden startup smoke test. NSIS installer built. WiX `light.exe` failed to create the optional MSI without a diagnostic, so no MSI is claimed.
- Android: the optimized ARM64 release library built through the documented Windows no-symlink fallback. The distributed APK was signed with the external production `ledger` key; `apksigner` verified schemes v2 and v3, package `ro.danielbrindusa.artagatitului`, version code `1000000`, minimum SDK 24, target SDK 36, and ARM64 native code. No device or AVD was attached, so install, lifecycle, and account flows are not device-verified.
- Responsive UI: the visual editor now reserves an Android status-bar inset and uses three non-overlapping toolbar rows at phone/tablet widths. A 536x976 live inspection confirmed distinct header/action rows and no document-width overflow. Constrained desktop widths use a two-row toolbar from 901px through 1700px so actions cannot overlap mode selectors. The generated Homepage and long-recipe regression coverage remains unchanged.

Artifacts copied outside Git history to `../Builds`:

- `Arta-Gatitului-1.0.0-Windows-x64-Setup.exe`, SHA-256 `DBD85886711D8727C82187C67CCAFCA06EE7BC77E29E317A889A628160B04F7A`.
- `Arta-Gatitului-1.0.0-Windows-x64.exe`, SHA-256 `84AACDAB74804E0B639D11B200E70405BBB46490300260C192E16CF51F4A8F98`.
- `Arta-Gatitului-1.0.0-Android-arm64-signed.apk`, SHA-256 `4E8A65A7DD161D0030F8FB09FFF1983B18EA6DF743FE2A007BB2894441757487`.
