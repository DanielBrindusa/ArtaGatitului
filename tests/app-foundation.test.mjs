import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../', import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, repositoryRoot), 'utf8'));
}

test('Tauri exposes narrow controls only to the local shell webview', async () => {
  const config = await readJson('src-tauri/tauri.conf.json');
  const desktopCapability = await readJson('src-tauri/capabilities/cms-local.json');
  const androidCapability = await readJson('src-tauri/capabilities/cms-android.json');

  assert.equal(config.identifier, 'ro.danielbrindusa.artagatitului');
  assert.deepEqual(config.app.security.capabilities, ['cms-local', 'cms-android']);
  assert.equal(config.app.withGlobalTauri, false);
  assert.equal(config.app.security.assetProtocol.enable, false);
  assert.equal(desktopCapability.local, true);
  assert.equal('windows' in desktopCapability, false);
  assert.deepEqual(desktopCapability.platforms, ['linux', 'macOS', 'windows']);
  assert.deepEqual(desktopCapability.webviews, ['main']);
  assert.deepEqual(desktopCapability.permissions, ['view-mode-control']);
  assert.equal('remote' in desktopCapability, false);
  assert.equal(androidCapability.local, true);
  assert.deepEqual(androidCapability.platforms, ['android']);
  assert.deepEqual(androidCapability.webviews, ['main']);
  assert.deepEqual(androidCapability.permissions, []);
  assert.equal('remote' in androidCapability, false);
});

test('Rust registers only the scoped View Mode command surface', async () => {
  const rustSource = await readFile(
    new URL('src-tauri/src/lib.rs', repositoryRoot),
    'utf8',
  );

  assert.match(rustSource, /tauri::Builder::default\(\)/);
  assert.match(rustSource, /open_js_links_on_click\(false\)/);
  assert.match(rustSource, /view_mode::set_view_bounds/);
  assert.match(rustSource, /view_mode::set_view_visibility/);
  assert.match(rustSource, /view_mode::navigate_view/);
  assert.doesNotMatch(rustSource, /tauri_plugin_(fs|shell|process|store)/);
});

test('desktop and Android builds use the same application identity', async () => {
  const packageConfig = await readJson('package.json');
  const tauriConfig = await readJson('src-tauri/tauri.conf.json');
  const androidConfig = await readJson('src-tauri/tauri.android.conf.json');

  assert.equal(packageConfig.version, tauriConfig.version);
  assert.equal(androidConfig.bundle.android.minSdkVersion, 24);
  assert.equal(androidConfig.bundle.android.versionCode, 1000);
  assert.equal(androidConfig.bundle.android.autoIncrementVersionCode, false);
  assert.equal(androidConfig.app.windows[0].create, false);
});
