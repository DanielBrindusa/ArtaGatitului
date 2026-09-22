# Arta Gatitului Application Development

Milestone 4 turns the Tauri 2 Windows shell into a public reader for the real published Arta Gătitului site. The static website remains an independent GitHub Pages build and is not frozen into the installer. Android View Mode, authentication, drafts, editing, and publishing remain deferred.

## Project structure

```text
.
  cms/
    index.html
    vite.config.ts
    tsconfig.json
    src/
      app/useAppRoute.ts
      components/
      preview/demoContent.ts
      views/
  src/
    shared/
      index.mjs
      index.d.mts
      ...
  src-tauri/
    capabilities/cms-local.json
    permissions/view-mode.toml
    icons/
    src/lib.rs
    src/view_mode.rs
    src/main.rs
    build.rs
    Cargo.toml
    tauri.conf.json
    tauri.android.conf.json
```

`cms/` is the single frontend for future Windows and Android application targets. It has three lightweight hash-routed areas: View, Edit, and Settings. Windows View Mode is functional. Edit still establishes only the top bar, Block Library, preview canvas, and Inspector layout; its controls and Publish command are intentionally disabled. Real Edit Mode authentication starts in Milestone 6; the current `Development mode` label is not an authentication mechanism.

The preview demonstration imports the framework-independent model, schema, design tokens, normalization, and renderer from `src/shared`. `src/shared/index.d.mts` describes that JavaScript API to strict TypeScript without duplicating the runtime implementation. The demo data is local and separate from production recipes.

## Windows View Mode

The local `main` webview owns the application chrome, View/Edit/Settings navigation, connectivity UI, and the small View toolbar. On Windows, Rust creates a second child webview named `public-view` inside the same native window. That child loads the canonical public URL:

```text
https://danielbrindusa.github.io/ArtaGatitului/
```

The React shell measures the content surface with `ResizeObserver` and sends validated logical-pixel bounds to Rust. The child webview therefore follows normal window resizing and Windows display scaling while the toolbar remains local. In ordinary browser development, where a child Tauri webview does not exist, View Mode uses a sandboxed iframe so the live site and responsive shell can still be inspected. Browser-preview Back and Forward controls are disabled because cross-origin iframe history is intentionally inaccessible; the native Windows controls are fully wired.

Published content remains remote. A normal refresh receives GitHub Pages updates according to its HTTP cache headers and the website service worker, without rebuilding or reinstalling the desktop application.

### Navigation

- Back: toolbar or `Alt+Left`.
- Forward: toolbar or `Alt+Right`.
- Home: toolbar; navigates to the canonical public root.
- Refresh: toolbar or `Ctrl+R`.
- `Ctrl+L` is suppressed because the application has no general-purpose address bar.
- Same-origin links under `/ArtaGatitului` remain in `public-view`.
- New-window links to the same project are redirected into the existing View Mode webview.
- External `http`, `https`, and `mailto` links are denied inside View Mode and passed to the system default application by Rust.
- Unsupported schemes, malformed URLs, lookalike hosts, and paths outside the project are blocked.

### Loading and connectivity

The child webview starts hidden while the local shell displays the product icon, name, and a lightweight loading indicator. The shell performs an eight-second `HEAD` reachability check against the exact trusted URL before exposing the child. A failed request, non-success response, redirect outside the trusted project path, browser offline event, or native control failure hides the child and shows `Nu există conexiune la internet.` with `Încearcă din nou`.

The website service worker uses network-first navigation, caches its core shell and previously visited HTML, and has an `offline.html` fallback. WebView2 may retain that cache in its application profile, but this is not treated as a complete native offline contract: when the app-shell reachability check fails, the explicit app offline state is shown instead of relying on an uncertain cached page. Recipe synchronization and comprehensive offline reading are outside Milestone 4.

### Window and branding

The Windows window opens at `1360 x 860` logical pixels and can be resized down to `720 x 600`. Tauri and WebView2 provide high-DPI scaling. The visible product name remains `Arta Gătitului`. Tauri icon assets were generated in Milestone 3 from the repository-owned root `icon.png`; no third-party branding was introduced.

## Application identity

- Display name: `Arta Gătitului`
- Package identifier: `ro.danielbrindusa.artagatitului`
- Initial version: `0.1.0`
- Main window label: `main`

The reverse-domain identifier uses the repository owner and project name because no production domain identity is established. Treat it as stable: changing it later changes Android package identity and application upgrade behavior.

## Commands

Install JavaScript dependencies once:

```powershell
npm install
```

Public static website:

```powershell
npm run validate:content
npm run build
npm test
npm run check
```

CMS frontend in a browser:

```powershell
npm run app:dev
npm run app:typecheck
npm run app:build
npm run app:preview
```

Windows application after installing the native prerequisites below:

```powershell
npm run tauri:check
npm run tauri:dev
npm run tauri:build
```

Android application after installing and configuring the Android prerequisites:

```powershell
npm run tauri:android:init
npm run tauri:android:dev
npm run tauri:android:build
```

`tauri:android:init` is a one-time generation command. Tauri writes generated Android project files under `src-tauri/gen/android`; that directory is ignored because it is generated locally. The tracked `tauri.android.conf.json`, shared frontend, Rust host, and Android icon assets are the durable Android foundation.

## Security boundary

Remote website content is untrusted relative to the native process:

- `cms-local` selects only the local `main` webview. It uses `webviews`, not `windows`, because a window selector would also grant permissions to child webviews.
- `public-view` matches no capability and there is no `remote` URL grant. Its JavaScript therefore cannot invoke application, core, or plugin commands.
- The only application permission is `view-mode-control`, containing `set_view_bounds`, `set_view_visibility`, and `navigate_view`.
- The three commands also verify that the caller label is `main`. Navigation accepts a fixed action enum represented by four strings, never an arbitrary URL.
- No filesystem, shell, process, secret-store, GitHub, Firebase, or opener permission is exposed to frontend code.
- The opener plugin's automatic JavaScript link handling is disabled. Rust calls it only after validating an intercepted external URL.
- `withGlobalTauri` and the asset protocol remain disabled. The local CSP names the one public HTTPS origin needed for health checks and browser-only preview; it uses no remote wildcard.
- Top-level remote navigation requires HTTPS, the exact host `danielbrindusa.github.io`, and `/ArtaGatitului` as a path boundary. Credentials and nonstandard ports are rejected.
- Downloads initiated by the remote child are denied in this milestone.
- DevTools are enabled only in debug builds. Release builds do not enable the Tauri `devtools` feature.

Automated tests inspect the capability selector, custom permission allowlist, command caller check, URL policy, CSP, new-window denial, loading UI, and offline recovery. Rust unit tests additionally cover allowed project URLs and insecure/lookalike rejection; running them requires the Rust toolchain.

## Dependencies and scope

- `react` and `react-dom`: stateful application shell and future editor surface.
- `typescript`: strict contracts for the frontend and shared JavaScript imports.
- `vite` and `@vitejs/plugin-react`: small frontend development and Tauri build boundary.
- `lucide-react`: accessible, consistent interface icons without a component-suite dependency.
- `@tauri-apps/api`: typed `invoke` access from the local shell to the three scoped View Mode commands.
- `@tauri-apps/cli`: official Tauri 2 development, build, icon, and mobile commands.
- Rust `tauri` and `tauri-build`: native application runner, child-webview host, and generated build context. The pinned `unstable` Tauri feature is required for the documented multiwebview API.
- Rust `tauri-plugin-opener`: opens validated external URLs in the system browser from trusted Rust code; no frontend opener permission is granted.

Firebase, Firestore, drag-and-drop, rich-text, GitHub, and UI-suite packages remain deferred to the milestones that need them.

## Milestone 4 verification

The browser fallback inside the application shell was used to inspect the deployed website at a narrow 524-pixel viewport. Verified pages and behavior:

- home page, CSS, hero background, navigation, generated category and recipe grids;
- search for `pui`, returning 12 live results;
- randomizer, including a second generated menu with changed selections;
- `Fel secundar`, listing 18 recipes;
- `Steak de vita`, a long recipe with before-start checks, explicit utensils/equipment, tags, ratings, and the interactive steak calculator;
- `Rata la cuptor umpluta`, a long recipe with five before-start checks;
- `Piept de pui cu lamaie si cartofi aurii`, with four before-start checks and full recipe sections.

All 37 current source recipes have an empty recipe `image` value, so no image-bearing recipe page exists to test. Site-level visual assets do load, as confirmed by the live home hero. This is a content limitation, not an app-container failure.

## Windows prerequisites and current status

The frontend builds successfully on the audited machine. WebView2 Runtime `153.0.4234.48` is installed. Native compilation, startup, navigation testing, and installer generation are not currently possible because Rust/Cargo and a Visual Studio C++ build toolchain with Windows SDK components are not installed.

Install manually:

1. Rust through `rustup`, using the stable MSVC toolchain.
2. Visual Studio 2022 Build Tools with **Desktop development with C++**, an MSVC toolset, and a Windows 10 or 11 SDK.
3. Restart the terminal so `rustc`, `cargo`, and the build tools are discoverable.
4. Run `npm run tauri:check`, then `npm run tauri:dev` and `npm run tauri:build`.

With the tracked `bundle.targets: "all"` setting, a successful Windows release build is expected to produce the Windows bundle formats supported by Tauri on the installed toolchain, normally NSIS and MSI, under `src-tauri/target/release/bundle/`. Generated bundles are local artifacts and must not be committed.

The official prerequisite guide is <https://v2.tauri.app/start/prerequisites/>.

## Android prerequisites and current status

Android Studio, its bundled OpenJDK 21 runtime, Android platform `36.1`, build tools, platform-tools, and ADB are present on the audited machine. The Android NDK, Android SDK command-line tools, Rust toolchain/Android targets, and required environment variables are missing. Android initialization and compilation were therefore not run; no successful Android build is claimed.

Install or configure manually:

1. Install Rust through `rustup`.
2. In Android Studio's SDK Manager, install Android SDK Command-line Tools and NDK (Side by side).
3. Set `JAVA_HOME` to Android Studio's bundled JBR and `ANDROID_HOME` to the installed Android SDK.
4. Set `NDK_HOME` to the selected side-by-side NDK directory and add the SDK command-line tools and platform-tools to `PATH`.
5. Add the needed Rust Android targets, then run `npm run tauri:android:init`.
6. Start an emulator or attach a debug-enabled device before `npm run tauri:android:dev`.

Do not create or commit a production keystore in this phase. `.gitignore` excludes generated targets, local environment files, keystores, signing certificates, and private keys.
