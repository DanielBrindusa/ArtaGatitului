import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const root = new URL('../', import.meta.url);
const server = await createServer({
  configFile: fileURLToPath(new URL('cms/vite.config.ts', root)),
  server: { middlewareMode: true },
});
let GitHubConnectionDialog;
try {
  ({ GitHubConnectionDialog } = await server.ssrLoadModule('/src/publishing/GitHubConnectionDialog.tsx'));
} finally { await server.close(); }
const controller = {
  connectionOpen: true, connecting: false, deviceFlow: null, error: null,
  connection: { available: true, configured: true, repositoryVerified: false, message: 'Connect GitHub to publish.' },
  waitingLabel: 'Waiting for approval in GitHub...',
};
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(GitHubConnectionDialog, { publishing: { ...controller, ...overrides } }));

test('GitHub connection has an explicit busy state instead of a silent repeated click', () => {
  const html = render({ connecting: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Requesting authorization code/);
});

test('device authorization clearly exposes code, browser action and waiting status', () => {
  const html = render({ deviceFlow: { userCode: 'TEST-CODE' } });
  assert.match(html, /value="TEST-CODE"/);
  assert.match(html, /Copy code/);
  assert.match(html, /Open GitHub/);
  assert.match(html, /Waiting for approval/);
  assert.doesNotMatch(html, /automatically opens/);
});

test('GitHub errors and verified repository are visible in every editor', () => {
  assert.match(render({ error: 'Network unavailable' }), /role="alert"[^]*Network unavailable/);
  assert.match(render({ connection: { repositoryVerified: true, repository: 'owner/site', branch: 'main' } }), /Connected and verified[^]*owner\/site[^]*main/);
  assert.equal(render({ connectionOpen: false }), '');
});

test('Android browser-opening commands run off the WebView UI thread', async () => {
  const native = await readFile(new URL('src-tauri/src/github/mod.rs', root), 'utf8');
  assert.match(native, /pub async fn github_open_device_page/);
  assert.match(native, /pub async fn github_open_actions_page/);
});

test('every editor ignores an obsolete device-flow response or error', async () => {
  for (const name of ['useGitHubPublishing', 'useGitHubPagePublishing', 'useGitHubSitePublishing']) {
    const source = await readFile(new URL(`cms/src/publishing/${name}.ts`, root), 'utf8');
    assert.match(source, /if \(connectionStarting.current\) return/);
    assert.match(source, /await pollGitHubDeviceFlow\(\);\s*if \(pollingGeneration.current !== generation\) return/);
    assert.match(source, /catch \(pollError\) \{\s*if \(pollingGeneration.current !== generation\) return/);
  }
});
