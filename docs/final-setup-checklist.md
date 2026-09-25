# Final production setup checklist

Complete this checklist once before the first production merge and repeat the release sections for each distributed version.

## Firebase

- [ ] Firebase project exists and remains on the Spark plan.
- [ ] A Web App is registered; Firebase Hosting, Storage, Functions, Extensions, and Blaze billing are not required.
- [ ] Email/Password is the only required sign-in provider.
- [ ] Trusted editor accounts were created manually; there is no public registration.
- [ ] Immutable editor UID values are in `cms/.env.local` under `VITE_FIREBASE_EDITOR_UIDS`.
- [ ] Web App values in `cms/.env.local` match the selected Firebase project. No password/Admin credential is present.
- [ ] Firestore exists in Production mode in the intended permanent region. Its database name may remain `(default)`.
- [ ] The same editor UIDs are explicitly present in `firestore.rules`.
- [ ] `npm run test:firestore-rules` passes against the emulator.
- [ ] Rules/indexes were deployed to the intended project only.
- [ ] Approved login/draft sync works and a separate unapproved authenticated UID is denied.
- [ ] Firebase API-key restrictions allow only the required Firebase APIs and expected application origins.

## GitHub App and repository

- [ ] GitHub App Device Flow is enabled and webhook delivery is disabled.
- [ ] User authorization tokens are configured to expire.
- [ ] Repository permissions are Contents read/write and Metadata read; all others are No access.
- [ ] Installation is limited to `DanielBrindusa/ArtaGatitului` only.
- [ ] The built Windows and Android apps use the intended public GitHub App Client ID. Set `ARTA_GITHUB_APP_CLIENT_ID` only when overriding the bundled ID; no client secret or PAT is used.
- [ ] A clean-device connection verifies repository and `main`.
- [ ] Disconnect clears local credentials; GitHub-side revoke/uninstall behavior was tested with a disposable authorization.
- [ ] Repository rules disable force pushes and do not unintentionally block the installed App's reviewed one-commit publication.

## GitHub Pages and Actions

- [ ] Repository Settings > Pages uses GitHub Actions.
- [ ] Actions are enabled and `.github/workflows/site.yml` has only documented job permissions.
- [ ] Validation runs on `app-development` without deployment.
- [ ] Deployment runs only from `main` after validation succeeds.
- [ ] Canonical URL is `https://danielbrindusa.github.io/ArtaGatitului/`.
- [ ] First `main` workflow, Pages environment, and live build marker were verified manually.

## Release validation

- [ ] `npm ci` and `npm run doctor` complete without failures.
- [ ] `npm audit` and `cargo audit --file src-tauri/Cargo.lock` report no unresolved vulnerability that affects this release.
- [ ] `npm run check:all` passes.
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` and `cargo check --manifest-path src-tauri/Cargo.toml` pass.
- [ ] Dependency/license review is current.
- [ ] Credential scans find no password, token, PAT, Admin key, private key, keystore, or signing password in tracked/staged files.
- [ ] Version is consistent across npm, Tauri, Cargo, CMS, and Android versionCode.

## Public website regression

- [ ] Homepage, header navigation, footer, theme, featured/latest/category sections, and rich blocks render on desktop/tablet/mobile.
- [ ] Recipe pages cover ingredients, steps, before-starting, utensils, ratings, related recipes, images, and long content.
- [ ] Search, randomizer, categories, tags, aliases/redirects, and ingredient matching work.
- [ ] Sitemap, robots, canonical/Open Graph metadata, Recipe JSON-LD, manifests, service worker, offline page, and PWA install behavior are correct.
- [ ] Keyboard focus, labels, headings, alt text, contrast, and reduced motion were manually reviewed.

## Windows application

- [ ] Release bundle installs, starts, closes, restarts, and uninstalls on a clean Windows profile.
- [ ] View Mode loads the public site; remote content cannot call local commands.
- [ ] Edit/Settings authentication, drafts, local recovery, export, publishing, history, restore, sign-out, and GitHub disconnect work.
- [ ] Resizing/maximize/narrow width and representative 100%, 125%, and 150% display scaling are readable.
- [ ] Keyboard navigation, dialogs, drag-and-drop, and keyboard reorder alternatives work.
- [ ] Offline/startup failure and deployment verification errors recover safely.
- [ ] Users are warned that unsigned installers may trigger SmartScreen.

## Android application

- [ ] Debug or signed release APK installs and launches on a supported Android 7.0+ device.
- [ ] Small phone, normal phone, and tablet or emulator layouts were checked in portrait and landscape.
- [ ] System back, gesture navigation, keyboard appearance, dialogs/sheets, touch targets, drag/reorder controls, and image picker work.
- [ ] Firebase login, restart persistence, GitHub Device Flow, publishing, View/Edit switching, and disconnect work.
- [ ] Rotate, background/foreground, lock/unlock, temporary network loss, restart, and practical process recreation preserve/recover drafts.
- [ ] Cross-device sync and one deliberate conflict were tested with disposable draft content.
- [ ] Production keystore is backed up outside the repository; alias/passwords are in a password manager.
- [ ] Signed APK verification succeeds, or distribution is explicitly limited to a debug/test APK.

## Safe end-to-end scenarios

- [ ] Create a disposable recipe with image, ingredients, instructions, preview, autosave/reopen, publish, deployment, and View verification.
- [ ] Edit a disposable published recipe and verify the semantic review and deployed result.
- [ ] Delete only disposable published content and verify search/category/sitemap removal.
- [ ] Move a Homepage section, publish, verify, then restore the intended content.
- [ ] Continue one draft across Windows and Android, then test one conflict choice.
- [ ] Restore a historical disposable change through a new commit.
- [ ] No valuable production content was destructively tested.

## Distribution and merge

- [ ] Windows installer/executable and Android APK are kept outside Git history.
- [ ] Artifact checksums and version are recorded for distribution.
- [ ] `app-development` is pushed without force and CI is green.
- [ ] Final diff and known limitations in `docs/release-readiness.md` were reviewed.
- [ ] A human approved the merge to `main`; no automated assistant merged or released production.
