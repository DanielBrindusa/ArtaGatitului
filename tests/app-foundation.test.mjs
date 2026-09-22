import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../', import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, repositoryRoot), 'utf8'));
}

test('Tauri exposes narrow controls only to the local shell webview', async () => {
  const config = await readJson('src-tauri/tauri.conf.json');
  const capability = await readJson('src-tauri/capabilities/cms-local.json');

  assert.equal(config.identifier, 'ro.danielbrindusa.artagatitului');
  assert.deepEqual(config.app.security.capabilities, ['cms-local']);
  assert.equal(config.app.withGlobalTauri, false);
  assert.equal(config.app.security.assetProtocol.enable, false);
  assert.equal(capability.local, true);
  assert.equal('windows' in capability, false);
  assert.deepEqual(capability.webviews, ['main']);
  assert.deepEqual(capability.permissions, ['view-mode-control']);
  assert.equal('remote' in capability, false);
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
});
