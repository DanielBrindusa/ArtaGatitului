import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

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
  const androidConfig = await readJson('src-tauri/tauri.android.conf.json');
  const gitignore = await read('.gitignore');

  assert.match(css, /env\(safe-area-inset-top, 0px\)/);
  assert.match(css, /env\(safe-area-inset-bottom, 0px\)/);
  assert.equal(androidConfig.bundle.android.minSdkVersion, 24);
  assert.equal(androidConfig.bundle.android.versionCode, 1000);
  assert.equal(androidConfig.bundle.android.autoIncrementVersionCode, false);
  assert.match(gitignore, /src-tauri\/gen\//);
  assert.match(gitignore, /\*\.jks/);
  assert.match(gitignore, /\*\.keystore/);
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
