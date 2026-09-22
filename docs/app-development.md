# Arta Gatitului Application Development

Milestones 4 and 5 turn the same Tauri 2 project into public Windows and Android readers for the real published Arta Gătitului site. The static website remains an independent GitHub Pages build and is not frozen into either application package. Authentication, drafts, editing, and publishing remain deferred.

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
      platform/viewMode.ts
      preview/demoContent.ts
      views/
  src/
    shared/
      index.mjs
      index.d.mts
      ...
  src-tauri/
    capabilities/cms-local.json
    capabilities/cms-android.json
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

`cms/` is the single frontend for Windows and Android. `cms/src/platform/viewMode.ts` contains the small runtime adapter: Windows uses three narrow Rust commands, Android replaces the local launcher with the trusted public URL, and an ordinary browser uses the development iframe. The local shell still has three lightweight hash-routed areas: View, Edit, and Settings. Android intentionally enters the website-focused View surface immediately; the unfinished Edit and Settings areas remain local development surfaces. Real Edit Mode authentication starts in Milestone 6; the current `Development mode` label is not an authentication mechanism.

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

## Android View Mode

Android uses the same React frontend, Rust crate, application identifier, content URL, URL validator, and opener policy as Windows. Android does not support the desktop child-webview layout used by Milestone 4. It instead uses one manually constructed `main` WebView:

```text
bundled local main page
  -> branded loading state and connectivity check
  -> no Android native-command permissions
  -> location.replace(trusted public URL)

remote top-level main page
  -> real GitHub Pages site and website service worker
  -> no matching remote capability and no Tauri IPC authority
```

Using a remote iframe inside the privileged local WebView is intentionally forbidden. Tauri cannot reliably distinguish iframe IPC from top-level IPC on Android. Top-level replacement means the remote page is evaluated as remote content and does not match the local-only `cms-android` capability.

### Android navigation and links

- The bundled launcher is replaced rather than pushed into history, so a cold start does not create a meaningless extra Back step.
- Tauri 2.11.6's Android app plugin checks the system WebView history on Back/gesture Back. It calls `goBack()` when possible and otherwise delegates to normal Android Back, which exits or returns to the prior Activity as appropriate.
- Website links within the exact HTTPS host and `/ArtaGatitului` path stay in the same WebView.
- Same-project new-window requests are redirected into `main`; every new window is denied after routing.
- Safe external `http`, `https`, and `mailto` destinations are passed from trusted Rust code to the device handler. Unknown schemes, lookalike hosts, credentials, nonstandard ports, and paths outside the project are blocked from the app WebView.
- Downloads initiated by remote content are denied.

### Android startup, system UI, and lifecycle

The app initially shows the repository-owned icon, product name, and a lightweight loading line. At Android widths the desktop top bar and View toolbar are omitted so the website receives the full usable viewport. The local loading/offline surface pads itself with CSS safe-area insets. The Android-only initialization script adds `viewport-fit=cover` and safe-area offsets to the public site's sticky header and fixed controls; it also marks the native container as standalone so the website does not offer to install its PWA from inside the installed app.

No orientation is forced. The generated Tauri Activity handles orientation and screen-size configuration changes, so portrait, landscape, and ordinary background/foreground transitions retain the existing WebView rather than intentionally navigating home. The website service worker, local storage, checklist state, and ratings remain in the WebView profile. Android may still destroy the process under memory pressure; a later cold launch starts at the public home page. No sensitive editor state exists in this milestone.

Deep links are not registered. The stable package identifier and single top-level navigation policy leave room for a later verified Android App Link that maps published recipe URLs into the existing WebView, without changing the View Mode architecture.

### Android offline behavior

Before the first remote navigation, an eight-second trusted-URL health check shows a Romanian offline state with `Încearcă din nou` on failure. After a successful load, the public service worker provides its existing network-first navigation strategy, cached core shell, visited-page cache, and `offline.html` fallback. This is limited cached behavior, not a promise that every recipe is available offline. A first launch without network remains on the bundled retry screen; intermittent failures after browsing use the website's service-worker behavior where cached content is available.

### Window and branding

The Windows window opens at `1360 x 860` logical pixels and can be resized down to `720 x 600`. Tauri and WebView2 provide high-DPI scaling. The visible product name remains `Arta Gătitului`. Tauri icon assets were generated in Milestone 3 from the repository-owned root `icon.png`; no third-party branding was introduced.

## Application identity

- Display name: `Arta Gătitului`
- Package identifier: `ro.danielbrindusa.artagatitului`
- Initial version: `0.1.0`
- Android version name: the shared Tauri semantic version, currently `0.1.0`
- Android version code: `1000`, derived as `major * 1,000,000 + minor * 1,000 + patch`; automatic increments are disabled
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

After initialization, useful commands are:

```powershell
# List emulators and attached devices
& "$env:ANDROID_HOME\emulator\emulator.exe" -list-avds
& "$env:ANDROID_HOME\platform-tools\adb.exe" devices -l

# Run on a selected emulator/device, or let Tauri prompt
npm run tauri:android:dev -- <device-name>

# Explicit debug APK; release APK/AAB builds remain unsigned for production
npm run tauri:android:build -- --debug --apk
```

Gradle outputs are generated below `src-tauri/gen/android/app/build/outputs/`, including APKs under `apk/` and AABs under `bundle/`. They remain ignored and must not be committed. Use `--open` with the Tauri Android commands to inspect the generated project in Android Studio.

## Security boundary

Remote website content is untrusted relative to the native process:

- `cms-local` applies only to desktop targets and selects the local `main` webview. It uses `webviews`, not `windows`, because a window selector would also grant permissions to child webviews.
- `cms-android` applies only to Android, is local-only, selects `main`, and grants an empty permission list.
- `public-view` matches no capability and there is no `remote` URL grant. Its JavaScript therefore cannot invoke application, core, or plugin commands.
- The only application permission is `view-mode-control`, containing `set_view_bounds`, `set_view_visibility`, and `navigate_view`.
- The three desktop commands verify both the caller label and the bundled local-shell origin. Navigation accepts a fixed action enum represented by four strings, never an arbitrary URL.
- No filesystem, shell, process, secret-store, GitHub, Firebase, or opener permission is exposed to frontend code.
- The opener plugin's automatic JavaScript link handling is disabled. Rust calls it only after validating an intercepted external URL.
- `withGlobalTauri` and the asset protocol remain disabled. The local CSP names the one public HTTPS origin needed for health checks and browser-only preview; it uses no remote wildcard.
- Top-level remote navigation requires HTTPS, the exact host `danielbrindusa.github.io`, and `/ArtaGatitului` as a path boundary. Credentials and nonstandard ports are rejected.
- Downloads initiated by the remote child are denied in this milestone.
- Android creates no iframe and grants no remote capability. The public top-level page therefore cannot call application, core, or plugin commands even though Android reuses the `main` WebView label.
- DevTools are enabled only in debug builds. Release builds do not enable the Tauri `devtools` feature.

Automated tests inspect both platform capabilities, the custom desktop permission allowlist, command caller/origin checks, shared URL policy, CSP, new-window denial, Android top-level replacement, version strategy, adaptive icons, safe areas, loading UI, and offline recovery. Rust unit tests additionally cover allowed project URLs, local-shell origins, and insecure/lookalike rejection; running them requires the Rust toolchain.

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

## Milestone 5 verification

The deployed public site was inspected as the Android top-level destination at `360 x 800`, `412 x 915`, `915 x 412`, and `800 x 1280` CSS pixels. Home, categories, search, cards, a long recipe, checklist controls, and the full-screen mobile search dialog remained usable without horizontal overflow. The smallest observed visible control was `47 x 40` CSS pixels and the home search field was `303 x 54`; tablet category cards reflowed to two columns. This browser-based pass validates responsive website behavior, not Android system integration.

`npm run check:all` passed the content validators, 107-route static build, all 25 Node tests, and the production CMS build. `npm run app:typecheck`, `npm run app:build`, and `git diff --check` also passed. No generated public content changed when the stable build version was supplied.

Android initialization and debug APK builds were both attempted with the installed JBR and SDK paths supplied for the process:

```powershell
npm run tauri:android:init -- --ci
npm run tauri:android:build -- --debug --apk
```

Both stopped before Android project generation at Tauri's `cargo metadata` step because `cargo` is not installed. `npm run tauri:check` reached the same missing-Cargo prerequisite on Windows. No `src-tauri/gen` directory, APK, AAB, signing material, or other generated native artifact was created. Device-only claims such as native Back/gesture behavior, external intent routing, system-bar insets, rotation, process restoration, and offline transitions remain explicitly unverified until the prerequisites below and an emulator or physical device are available.

## Windows prerequisites and current status

The frontend builds successfully on the audited machine. WebView2 Runtime `153.0.4234.48` is installed. Native compilation, startup, navigation testing, and installer generation are not currently possible because Rust/Cargo and a Visual Studio C++ build toolchain with Windows SDK components are not installed.

Install manually:

1. Rust through `rustup`, using the stable MSVC toolchain.
2. Visual Studio 2022 Build Tools with **Desktop development with C++**, an MSVC toolset, and a Windows 10 or 11 SDK.
3. Restart the terminal so `rustc`, `cargo`, and the build tools are discoverable.
4. Run `npm run tauri:check`, then `npm run tauri:dev` and `npm run tauri:build`.

With the tracked `bundle.targets: "all"` setting, a successful Windows release build is expected to produce the Windows bundle formats supported by Tauri on the installed toolchain, normally NSIS and MSI, under `src-tauri/target/release/bundle/`. Generated bundles are local artifacts and must not be committed.

The official prerequisite guide is <https://v2.tauri.app/start/prerequisites/>.

## Android prerequisites, emulator, and current status

Android Studio, its bundled OpenJDK `21.0.10`, Android platform `36.1`, build tools `36.0.0`, `36.1.0`, and `37.0.0`, platform-tools, emulator binary, and ADB are present on the audited machine. No AVD is configured and no physical device is attached. The Android NDK, Android SDK command-line tools, Rust toolchain/Android targets, and required environment variables are missing. Android initialization, compilation, install, launch, Back/gesture, rotation, lifecycle, and network-toggle tests therefore cannot be run on this machine; no successful Android build or device test is claimed.

Install or configure manually:

1. Install Rust through `rustup`.
2. In Android Studio's SDK Manager, install Android SDK Command-line Tools and NDK (Side by side).
3. Set `JAVA_HOME` to Android Studio's bundled JBR and `ANDROID_HOME` to the installed Android SDK.
4. Set `NDK_HOME` to the selected side-by-side NDK directory and add the SDK command-line tools and platform-tools to `PATH`.
5. Add the needed Rust Android targets, then run `npm run tauri:android:init`.
6. Start an emulator or attach a debug-enabled device before `npm run tauri:android:dev`.

For this Windows account the expected environment setup is:

```powershell
[System.Environment]::SetEnvironmentVariable("JAVA_HOME", "C:\Program Files\Android\Android Studio\jbr", "User")
[System.Environment]::SetEnvironmentVariable("ANDROID_HOME", "$env:LocalAppData\Android\Sdk", "User")
$version = Get-ChildItem -Name "$env:LocalAppData\Android\Sdk\ndk" | Sort-Object | Select-Object -Last 1
[System.Environment]::SetEnvironmentVariable("NDK_HOME", "$env:LocalAppData\Android\Sdk\ndk\$version", "User")
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Create an AVD in Android Studio Device Manager for emulator testing, or enable USB debugging on a physical device, accept its authorization prompt, and verify it appears in `adb devices -l`. Test portrait, landscape, phone and tablet profiles, Back button/gesture, background/foreground, rotation, cold relaunch, Wi-Fi/data loss, search, categories, randomizer, long recipes, checklists, ratings, dialogs, and external links.

Tauri's generated Android manifest requests only `android.permission.INTERNET`, which is required for the public site. This milestone adds no storage, contacts, location, camera, microphone, notification, or other runtime permission. The generated Activity does not force portrait or landscape. Android launcher PNGs for all standard densities plus the adaptive foreground/background XML are already tracked and derive from the canonical root `icon.png`.

Do not create or commit a production keystore in this phase. `.gitignore` excludes generated targets, local environment files, keystores, signing certificates, and private keys.
