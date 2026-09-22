import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

async function readJson(path) {
  return JSON.parse(await read(path));
}

test('public View Mode is pinned to the published project origin and path', async () => {
  const nativeSource = await read('src-tauri/src/view_mode.rs');
  const frontendSource = await read('cms/src/views/ViewMode.tsx');

  for (const source of [nativeSource, frontendSource]) {
    assert.match(source, /https:\/\/danielbrindusa\.github\.io\/ArtaGatitului\//);
    assert.match(source, /danielbrindusa\.github\.io/);
    assert.match(source, /\/ArtaGatitului\//);
  }

  assert.match(nativeSource, /url\.scheme\(\) == "https"/);
  assert.match(nativeSource, /url\.host_str\(\) == Some\(PUBLIC_SITE_HOST\)/);
  assert.match(nativeSource, /NewWindowResponse::Deny/);
  assert.match(nativeSource, /matches!\(url\.scheme\(\), "http" \| "https" \| "mailto"\)/);
});

test('remote public content has no capability or broad native permission', async () => {
  const capability = await readJson('src-tauri/capabilities/cms-local.json');
  const permission = await read('src-tauri/permissions/view-mode.toml');
  const nativeSource = await read('src-tauri/src/view_mode.rs');

  assert.deepEqual(capability.webviews, ['main']);
  assert.equal(JSON.stringify(capability).includes('public-view'), false);
  assert.equal('remote' in capability, false);
  assert.match(permission, /"set_view_bounds"/);
  assert.match(permission, /"set_view_visibility"/);
  assert.match(permission, /"navigate_view"/);
  assert.doesNotMatch(permission, /filesystem|shell|process|secret|store|\*/i);
  assert.match(nativeSource, /caller\.label\(\) == LOCAL_SHELL_LABEL/);
});

test('View Mode provides native navigation, loading, and offline recovery', async () => {
  const source = await read('cms/src/views/ViewMode.tsx');

  assert.match(source, /type ViewAction = 'back' \| 'forward' \| 'home' \| 'reload'/);
  assert.match(source, /Alt\+Stânga/);
  assert.match(source, /event\.ctrlKey && event\.key\.toLowerCase\(\) === 'l'/);
  assert.match(source, /Se încarcă site-ul public/);
  assert.match(source, /Nu există conexiune la internet/);
  assert.match(source, /Încearcă din nou/);
  assert.match(source, /ResizeObserver/);
});

test('local CSP permits only the exact public site needed by View Mode', async () => {
  const config = await readJson('src-tauri/tauri.conf.json');

  for (const csp of [config.app.security.csp, config.app.security.devCsp]) {
    assert.match(csp, /connect-src[^;]*https:\/\/danielbrindusa\.github\.io/);
    assert.match(csp, /frame-src[^;]*https:\/\/danielbrindusa\.github\.io/);
    assert.doesNotMatch(csp, /https:\/\/\*/);
  }
});
