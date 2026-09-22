# Arta Gatitului Application Development

Milestone 3 adds a React and TypeScript application shell plus a minimal Tauri 2 host. The existing static website remains an independent GitHub Pages build. This milestone does not implement the full Windows or Android View Mode, authentication, drafts, editing, or publishing.

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
    icons/
    src/lib.rs
    src/main.rs
    build.rs
    Cargo.toml
    tauri.conf.json
    tauri.android.conf.json
```

`cms/` is the single frontend for future Windows and Android application targets. It has three lightweight hash-routed areas: View, Edit, and Settings. Edit currently establishes only the top bar, Block Library, preview canvas, and Inspector layout. Its controls and Publish command are intentionally disabled. Real Edit Mode authentication starts in Milestone 6; the current `Development mode` label is not an authentication mechanism.

The preview demonstration imports the framework-independent model, schema, design tokens, normalization, and renderer from `src/shared`. `src/shared/index.d.mts` describes that JavaScript API to strict TypeScript without duplicating the runtime implementation. The demo data is local and separate from production recipes.

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

The current native authority is deliberately empty:

- `cms-local` applies only to local content in the `main` window.
- Its `permissions` list is empty and it has no `remote` URL grant.
- No Tauri plugin or custom Rust command is registered.
- `withGlobalTauri` is disabled, so the frontend receives no global bridge.
- The asset protocol is disabled.
- Production and development Content Security Policies restrict scripts, frames, forms, objects, and connections.
- The shared-renderer proof is displayed in an iframe with an empty `sandbox` and a script-blocking iframe CSP.

Remote public website content must be treated as untrusted. A later View Mode that loads remote content must use a separate window or webview label and must not inherit local CMS capabilities. Native commands should be narrow, typed, and individually permissioned only when a later milestone requires them. Do not introduce a generic command dispatcher, unrestricted filesystem permissions, or secret-bearing frontend APIs.

## Dependencies and scope

- `react` and `react-dom`: stateful application shell and future editor surface.
- `typescript`: strict contracts for the frontend and shared JavaScript imports.
- `vite` and `@vitejs/plugin-react`: small frontend development and Tauri build boundary.
- `lucide-react`: accessible, consistent interface icons without a component-suite dependency.
- `@tauri-apps/cli`: official Tauri 2 development, build, icon, and mobile commands.
- Rust `tauri` and `tauri-build`: minimal native application runner and generated build context.

`@tauri-apps/api` is not installed because this milestone makes no native frontend calls. Firebase, Firestore, drag-and-drop, rich-text, GitHub, and UI-suite packages remain deferred to the milestones that need them.

## Windows prerequisites and current status

The frontend builds successfully on the audited machine. WebView2 Runtime `153.0.4234.48` is installed. Native compilation and startup are not currently possible because Rust/Cargo and a Visual Studio C++ build toolchain with Windows SDK components are not installed.

Install manually:

1. Rust through `rustup`, using the stable MSVC toolchain.
2. Visual Studio 2022 Build Tools with **Desktop development with C++**, an MSVC toolset, and a Windows 10 or 11 SDK.
3. Restart the terminal so `rustc`, `cargo`, and the build tools are discoverable.
4. Run `npm run tauri:check`, then `npm run tauri:dev` and `npm run tauri:build`.

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
