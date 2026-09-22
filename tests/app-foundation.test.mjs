import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../', import.meta.url);

async function readJson(path) {
  return JSON.parse(await readFile(new URL(path, repositoryRoot), 'utf8'));
}

test('Tauri exposes only the local CMS window with no native permissions', async () => {
  const config = await readJson('src-tauri/tauri.conf.json');
  const capability = await readJson('src-tauri/capabilities/cms-local.json');

  assert.equal(config.identifier, 'ro.danielbrindusa.artagatitului');
  assert.deepEqual(config.app.security.capabilities, ['cms-local']);
  assert.equal(config.app.withGlobalTauri, false);
  assert.equal(config.app.security.assetProtocol.enable, false);
  assert.equal(capability.local, true);
  assert.deepEqual(capability.windows, ['main']);
  assert.deepEqual(capability.permissions, []);
  assert.equal('remote' in capability, false);
});

test('Rust foundation does not register commands or plugins', async () => {
  const rustSource = await readFile(
    new URL('src-tauri/src/lib.rs', repositoryRoot),
    'utf8',
  );

  assert.match(rustSource, /tauri::Builder::default\(\)/);
  assert.doesNotMatch(rustSource, /invoke_handler|plugin\s*\(/);
});

test('desktop and Android builds use the same application identity', async () => {
  const packageConfig = await readJson('package.json');
  const tauriConfig = await readJson('src-tauri/tauri.conf.json');
  const androidConfig = await readJson('src-tauri/tauri.android.conf.json');

  assert.equal(packageConfig.version, tauriConfig.version);
  assert.equal(androidConfig.bundle.android.minSdkVersion, 24);
});
