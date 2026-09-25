import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const repositoryRoot = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

async function readJson(path) {
  return JSON.parse(await read(path));
}

test('Android uses the shared Tauri application and a manually secured main webview', async () => {
  const baseConfig = await readJson('src-tauri/tauri.conf.json');
  const androidConfig = await readJson('src-tauri/tauri.android.conf.json');
  const rustSource = await read('src-tauri/src/view_mode.rs');
  const runnerSource = await read('src-tauri/src/lib.rs');

  assert.equal(baseConfig.identifier, 'ro.danielbrindusa.artagatitului');
  assert.equal(androidConfig.app.windows.length, 1);
  assert.equal(androidConfig.app.windows[0].label, 'main');
  assert.equal(androidConfig.app.windows[0].url, 'index.html');
  assert.equal(androidConfig.app.windows[0].create, false);
  assert.match(runnerSource, /#\[cfg\(mobile\)\]/);
  assert.match(runnerSource, /view_mode::create_mobile_view/);
  assert.match(rustSource, /WebviewWindowBuilder::from_config/);
  assert.match(rustSource, /is_local_shell_url\(url\) \|\| is_trusted_site_url\(url\)/);
  assert.match(rustSource, /NewWindowResponse::Deny/);
  assert.match(rustSource, /on_download\(\|_, _\| false\)/);
});

test('Android public content replaces the local launcher instead of using an iframe', async () => {
  const adapter = await read('cms/src/platform/viewMode.ts');
  const view = await read('cms/src/views/ViewMode.tsx');
  const app = await read('cms/src/App.tsx');

  assert.match(adapter, /\/Android\/i\.test\(window\.navigator\.userAgent\)/);
  assert.match(adapter, /window\.location\.replace\(PUBLIC_SITE_URL\)/);
  assert.match(view, /if \(ANDROID_VIEW_MODE\) \{\s*enterAndroidPublicView\(\)/);
  assert.match(view, /VIEW_MODE_PLATFORM === 'browser' && connection === 'ready'/);
  assert.match(app, /route === 'view' && VIEW_MODE_PLATFORM === 'android'/);
});

test('Android capability grants only local GitHub publishing commands', async () => {
  const capability = await readJson('src-tauri/capabilities/cms-android.json');
  const nativeSource = await read('src-tauri/src/view_mode.rs');

  assert.equal(capability.local, true);
  assert.deepEqual(capability.platforms, ['android']);
  assert.deepEqual(capability.webviews, ['main']);
  assert.deepEqual(capability.permissions, ['github-publishing']);
  assert.equal('remote' in capability, false);
  assert.match(nativeSource, /is_local_shell_url\(&caller_url\)/);
  assert.doesNotMatch(capability.permissions.join(' '), /filesystem|shell|process|store|camera|microphone|location|contacts/i);
});

test('Android startup has safe-area treatment and stable versioning', async () => {
  const css = await read('cms/src/App.css');
  const app = await read('cms/src/App.tsx');
  const index = await read('cms/index.html');
  const androidConfig = await readJson('src-tauri/tauri.android.conf.json');
  const gitignore = await read('.gitignore');

  assert.match(index, /viewport-fit=cover/);
  assert.match(app, /app-shell-android/);
  assert.match(css, /--app-safe-top: max\(env\(safe-area-inset-top, 0px\), 24px\)/);
  assert.match(css, /--app-safe-bottom: max\(env\(safe-area-inset-bottom, 0px\), 24px\)/);
  assert.match(css, /env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
  assert.match(css, /\.app-shell-android \.draft-dialog-backdrop/);
  assert.match(css, /\.app-shell-android \.history-dialog/);
  assert.match(css, /\.history-dialog \{ position: relative;/);
  assert.match(css, /\.app-shell-android \.site-editor-topbar/);
  assert.match(css, /\.app-shell-android \.site-editor-tabs/);
  assert.match(css, /\.editor-topbar-actions \.account-menu\[open\] > div/);
  assert.match(css, /\.site-editor-actions \.account-menu\[open\] > div/);
  assert.match(css, /\.site-editor-shell \{[\s\S]*?min-width: 0;[\s\S]*?overflow-x: hidden;/);
  assert.match(css, /@media \(min-width: 901px\) and \(max-width: 2000px\)/);
  assert.match(css, /grid-template-rows: 60px 60px 60px/);
  assert.equal(androidConfig.bundle.android.minSdkVersion, 24);
  assert.equal(androidConfig.bundle.android.versionCode, 1000000);
  assert.equal(androidConfig.bundle.android.autoIncrementVersionCode, false);
  assert.match(gitignore, /src-tauri\/gen\//);
  assert.match(gitignore, /\*\.jks/);
  assert.match(gitignore, /\*\.keystore/);
});

test('Android applies real system, cutout and keyboard insets to every webview page', async () => {
  const activity = await read('src-tauri/android/MainActivity.kt');
  const build = await read('src-tauri/build.rs');
  const native = await read('src-tauri/src/view_mode.rs');
  assert.match(activity, /Type\.systemBars\(\)/);
  assert.match(activity, /Type\.displayCutout\(\)/);
  assert.match(activity, /Type\.ime\(\)/);
  assert.match(activity, /view\.setPadding\(insets.left, insets.top, insets.right, insets.bottom\)/);
  assert.match(activity, /setInsets\(handled, Insets.NONE\)/);
  assert.match(build, /android\/MainActivity.kt/);
  assert.match(native, /classList.add\('arta-native-insets'\)/);
});

test('mobile toolbars scroll without shrinking and the skip link stays hidden until keyboard focus', async () => {
  const css = await read('cms/src/App.css');
  const builder = await read('build-static-site.mjs');
  const canvas = await read('cms/src/editor/editorCanvas.css');
  assert.match(css, /\.editor-topbar-actions > \*,[\s\S]*?flex-shrink: 0/);
  assert.match(css, /\.site-editor-tabs button \{\s*flex: 0 0 auto/);
  assert.match(css, /min-width: 48px;\s*min-height: 48px/);
  assert.match(canvas, /\.editor-block-frame:not\(\.selected\) > \.resize-handle \{ display: none/);
  assert.match(builder, /\.skip-link \{\s*position: fixed;\s*top: -100vh/);
  assert.match(builder, /\.skip-link:focus-visible/);
});

test('Android public View Mode reserves system bars for pages and overlays', async () => {
  const builder = await read('build-static-site.mjs');

  assert.match(builder, /viewport-fit=cover/);
  assert.match(builder, /--safe-area-top: env\(safe-area-inset-top, 0px\)/);
  assert.match(builder, /--safe-area-bottom: env\(safe-area-inset-bottom, 0px\)/);
  assert.match(builder, /:root\.android-webview/);
  assert.match(builder, /:root\.arta-native-view/);
  assert.match(builder, /--safe-area-top: max\(env\(safe-area-inset-top, 0px\), 24px\)/);
  assert.match(builder, /padding: calc\(var\(--space-3\) \+ var\(--safe-area-top\)\)/);
  assert.match(builder, /top: calc\((?:74|82)px \+ var\(--safe-area-top\)\)/);
  assert.match(builder, /padding: calc\(min\(10vh, 72px\) \+ var\(--safe-area-top\)\)/);
  assert.match(builder, /min-height: calc\(100dvh - var\(--safe-area-top\) - var\(--safe-area-bottom\)\)/);
});

test('recipe titles wrap and empty image pickers have their own layout row', async () => {
  const canvas = await read('cms/src/editor/VisualRecipeCanvas.tsx');
  const css = await read('cms/src/editor/editorCanvas.css');
  assert.match(canvas, /<textarea\s+className="inline-title"/);
  assert.match(css, /field-sizing: content/);
  assert.match(css, /\.editor-hero-image:has\(\.editor-image-placeholder\) \{[^}]*aspect-ratio: auto/);
  assert.match(css, /\.editor-hero-image:has\(\.editor-image-placeholder\) \.editor-hero-image-actions \{ position: static/);
});

test('generated public page recognizes an Android WebView at startup', async () => {
  const html = await read('dist/generated/index.html');
  const bootstrap = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(bootstrap);
  const classes = new Set();
  runInNewContext(bootstrap, {
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel; wv) Version/4.0' },
    document: { documentElement: { classList: { add: (name) => classes.add(name) }, dataset: {} } },
    localStorage: { getItem: () => null },
  });
  assert.ok(classes.has('android-webview'));
});

test('Android initializes the native keyring context before secure storage', async () => {
  const cargo = await read('src-tauri/Cargo.toml');
  const storage = await read('src-tauri/src/github/storage.rs');

  assert.match(cargo, /ndk-context = "=0\.1\.1"/);
  assert.match(storage, /main_android_context\(\)/);
  assert.match(storage, /ndk_context::initialize_android_context/);
  assert.ok(
    storage.indexOf('initialize_android_context()?')
      < storage.indexOf('android_native_keyring_store::Store::new()'),
  );
});

test('adaptive Android launcher assets are tracked for all required densities', async () => {
  const adaptiveIcon = await read('src-tauri/icons/android/mipmap-anydpi-v26/ic_launcher.xml');
  assert.match(adaptiveIcon, /@mipmap\/ic_launcher_foreground/);
  assert.match(adaptiveIcon, /@color\/ic_launcher_background/);

  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    await access(new URL(`src-tauri/icons/android/mipmap-${density}/ic_launcher.png`, repositoryRoot));
    await access(new URL(`src-tauri/icons/android/mipmap-${density}/ic_launcher_foreground.png`, repositoryRoot));
    await access(new URL(`src-tauri/icons/android/mipmap-${density}/ic_launcher_round.png`, repositoryRoot));
  }
});

test('the shared interface and native bundles use the same canonical PNG', async () => {
  const [interfaceIcon, nativeIcon] = await Promise.all([
    readFile(new URL('icon.png', repositoryRoot)),
    readFile(new URL('src-tauri/icons/icon.png', repositoryRoot)),
  ]);

  assert.deepEqual(interfaceIcon, nativeIcon);
});
