import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(path, 'utf8');

test('release version is consistent across web, Tauri, Cargo, and Android', async () => {
  const [packageJson, tauriJson, androidJson, cargo, release] = await Promise.all([
    read('package.json').then(JSON.parse),
    read('src-tauri/tauri.conf.json').then(JSON.parse),
    read('src-tauri/tauri.android.conf.json').then(JSON.parse),
    read('src-tauri/Cargo.toml'),
    read('cms/src/app/release.ts'),
  ]);
  assert.equal(packageJson.version, '1.0.0');
  assert.equal(tauriJson.version, packageJson.version);
  assert.match(cargo, /^version = "1\.0\.0"$/m);
  assert.equal(androidJson.bundle.android.versionCode, 1_000_000);
  assert.match(release, /APP_VERSION = '1\.0\.0'/);
});

test('remote website has no privileged Tauri capability', async () => {
  const [desktop, android, tauri] = await Promise.all([
    read('src-tauri/capabilities/cms-local.json').then(JSON.parse),
    read('src-tauri/capabilities/cms-android.json').then(JSON.parse),
    read('src-tauri/tauri.conf.json').then(JSON.parse),
  ]);
  assert.equal(desktop.local, true);
  assert.equal(android.local, true);
  assert.equal('remote' in desktop, false);
  assert.equal('remote' in android, false);
  assert.deepEqual(desktop.webviews, ['main']);
  assert.equal(tauri.app.withGlobalTauri, false);
  assert.equal(tauri.app.security.assetProtocol.enable, false);
  assert.doesNotMatch(desktop.permissions.join(' '), /fs|shell|process|http/);
  assert.doesNotMatch(android.permissions.join(' '), /fs|shell|process|http/);
});

test('production CSP is narrow and excludes wildcard and unsafe script execution', async () => {
  const tauri = JSON.parse(await read('src-tauri/tauri.conf.json'));
  const csp = tauri.app.security.csp;
  assert.doesNotMatch(csp, /(?:^|[ ;])\*(?:[ ;]|$)/);
  assert.doesNotMatch(csp, /script-src[^;]*'unsafe-(?:inline|eval)'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /base-uri 'none'/);
  assert.match(csp, /form-action 'none'/);
});

test('native GitHub publication stays repository-pinned, path-allowlisted, and non-force', async () => {
  const source = await read('src-tauri/src/github/mod.rs');
  assert.match(source, /DanielBrindusa/);
  assert.match(source, /ArtaGatitului/);
  assert.match(source, /allowed|allowlist/i);
  assert.doesNotMatch(source, /force\s*:\s*true/);
  assert.match(source, /assert!\(!allowed_publication_path\("\.github\/workflows\/deploy\.yml"\)\)/);
});

test('doctor validates configuration names without printing configured secret values', async () => {
  const doctor = await read('src/scripts/doctor.mjs');
  assert.match(doctor, /ARTA_GITHUB_APP_CLIENT_ID/);
  assert.match(doctor, /environment variable is present/);
  assert.doesNotMatch(doctor, /console\.log\([^\n]*(?:process\.env|names\.get)/);
});
