# Threat model

## Scope and security goals

Arta Gatitului has three distinct execution zones: the public static website, the local React CMS shell, and the native Tauri service. Firebase stores authenticated draft data. GitHub stores published source and deploys the generated site. The primary goals are to keep unpublished content private, prevent remote web content from reaching native authority, constrain publication to reviewed CMS content, and avoid storing credentials in ordinary files or cloud documents.

Protected assets include Firebase editor sessions, unpublished drafts, GitHub access and refresh tokens, the `main` branch, published content integrity, local image working copies, and Android signing material. Public recipe data and Firebase Web App identifiers are not secrets.

## Trust boundaries

- The GitHub Pages website is untrusted remote content, even though it is owned by this project.
- The local CMS webview may request only commands explicitly granted to the local `main` webview by Tauri capabilities.
- Firebase Authentication proves identity. Firestore Security Rules, not React routing, authorize draft access.
- The Rust GitHub publisher is the publication authority. It validates repository identity, branch state, paths, schemas, and expected blob identities again across the IPC boundary.
- Windows Credential Manager and Android Keystore-backed encrypted preferences are trusted platform stores. Browser local storage and Firestore are not credential stores.
- GitHub Actions consumes committed source and produces public files. Generated output is not accepted as CMS input.

## Threats, mitigations, and residual risk

### Malicious public website or injected remote script

The remote View content has no matching remote capability. Both capabilities are `local: true` and limited to the local `main` webview. `withGlobalTauri` and the asset protocol are disabled. Desktop View uses a separate child webview; Android replaces the local shell while remote content is displayed and recreates the local shell before editing. CSP permits only required origins and denies objects, forms, and base URL changes. The remote page therefore cannot invoke GitHub publishing, credential storage, Firestore editor operations, filesystem, shell, or process APIs.

Residual risk: a vulnerability in the OS webview or Tauri runtime could cross this boundary. Keep supported runtimes patched and rebuild after relevant security advisories.

### Unauthorized or unapproved Firebase user

There is no account registration UI. Email/Password users are created manually. The client UID allowlist controls editor presentation, while Firestore Rules independently require an authenticated UID in an explicit allowlist and default-deny all unrecognized paths. Rules tests cover unauthenticated, unknown authenticated, approved, owner-scoped, malformed, nested, and future paths.

Residual risk: an administrator who edits only the client allowlist, or deploys different rules than the repository, can create inconsistent behavior. Keep the two UID lists synchronized and run the emulator tests before deploying rules.

### Stolen GitHub token

The GitHub App is installed only on `DanielBrindusa/ArtaGatitului` with Contents read/write and Metadata read. User tokens expire and are refreshed. Tokens are stored only in platform secure storage and are cleared locally on disconnect. Repository ID, owner, name, and `main` are compiled trusted configuration.

Residual risk: a token stolen from an unlocked device can publish within its remaining authorization and repository scope. Revoke the authorized GitHub App and remove its installation when a device is lost; local disconnect alone does not revoke GitHub authorization.

### Malicious content and IPC input

Content uses allowlisted schemas and block types. Text is escaped, URLs reject executable schemes, routes/slugs reject traversal, theme values are controlled tokens, raw executable HTML/CSS is not accepted, and image type is checked from file bytes. Filenames are normalized before repository paths are formed. Rust reconstructs and validates source with narrow typed commands and rejects unknown fields and paths.

Residual risk: sanitization bugs remain possible. Content validation and renderer tests must run for every release, and dependencies must be audited.

### Compromised or malformed draft

Firestore documents are size- and shape-constrained by rules. Loaded drafts migrate through the current schema. Publication runs current validation and the native service validates again before creating a commit. Draft JSON is never copied directly into generated HTML or repository paths.

Residual risk: a malicious approved editor can alter content within permitted business rules. Git history and publication audit metadata provide accountability and restore points.

### Repository race or conflicting publication

Each review plan records the current branch and affected blob identities. Confirmation refetches current state, rejects stale affected files, builds a new commit on the latest accepted tree, and performs a non-force branch update. Runtime code has no force-push path.

Residual risk: unrelated commits can still cause a retry or a deployment ordering delay. Review the refreshed change summary and retry instead of bypassing the conflict.

### Device loss, offline use, and local recovery

GitHub tokens use native secure storage. Firebase manages its own session in the webview profile. Draft recovery copies are user-scoped and contain content but no GitHub credentials. Exported JSON omits editor UID, device IDs, local image handles, Git source baselines, and credentials.

Residual risk: local drafts and an active Firebase session may remain readable to someone who can unlock the operating-system account. Use device encryption and lock-screen protection, revoke Firebase sessions and GitHub authorization after loss, and remove app data before transferring a device.

### Supply chain and build compromise

JavaScript dependencies are locked by `package-lock.json`; Rust dependencies are locked by `Cargo.lock`. CI uses `npm ci`, least-privilege workflow permissions, and deploys only a validated `main` build. `npm audit`, `cargo audit`, tests, and generated-output validation are release gates.

Residual risk: registries, actions, compilers, or developer machines can be compromised. Review lockfile changes, use official GitHub actions, and rebuild from a clean checkout for high-assurance releases.

## Security invariants

- No remote Tauri capability and no generic filesystem, shell, process, or secret-bearing HTTP bridge.
- Firestore is default deny and approved UIDs are explicit.
- GitHub repository, numeric repository ID, and `main` branch are pinned.
- Runtime writes are limited to validated recipe, page, site-configuration, alias, and image paths.
- Git history is never force-updated.
- Access tokens, refresh tokens, passwords, private keys, and signing passwords are never logged or stored in Firestore, local storage, source, exports, or environment files committed to Git.
