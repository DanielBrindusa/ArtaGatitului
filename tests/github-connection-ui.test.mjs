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
let withRequestTimeout;
let AuthorizationRequestTimeoutError;
let waitForDeviceAuthorization;
try {
  ({ GitHubConnectionDialog } = await server.ssrLoadModule('/src/publishing/GitHubConnectionDialog.tsx'));
  ({ withRequestTimeout, AuthorizationRequestTimeoutError } = await server.ssrLoadModule('/src/publishing/withRequestTimeout.ts'));
  ({ waitForDeviceAuthorization } = await server.ssrLoadModule('/src/publishing/deviceFlowPolling.ts'));
} finally { await server.close(); }
const controller = {
  connectionOpen: true, connecting: false, deviceFlow: null, error: null,
  connection: { available: true, configured: true, repositoryVerified: false, message: 'Connect GitHub to publish.' },
  waitingLabel: 'Waiting for approval in GitHub...',
};
const render = (overrides = {}) => renderToStaticMarkup(React.createElement(GitHubConnectionDialog, { publishing: { ...controller, ...overrides } }));

test('a native authorization request that never settles becomes a retryable error', async () => {
  await assert.rejects(withRequestTimeout(new Promise(() => {}), 5), /try Connect GitHub again/);
});

test('authorization timeouts preserve successful responses and native errors', async () => {
  const result = { userCode: 'TEST-CODE' };
  assert.equal(await withRequestTimeout(Promise.resolve(result), 100), result);
  await assert.rejects(withRequestTimeout(Promise.reject(new Error('Offline')), 100), /Offline/);
});

test('a late native rejection is handled after the authorization timeout', async () => {
  let rejectNative;
  const native = new Promise((_, reject) => { rejectNative = reject; });
  await assert.rejects(withRequestTimeout(native, 5), /try Connect GitHub again/);
  rejectNative(new Error('Late response'));
  await new Promise((resolve) => setImmediate(resolve));
});

test('Android bundles and initializes the native HTTPS verifier without disabling TLS checks', async () => {
  const storage = await readFile(new URL('src-tauri/src/github/storage.rs', root), 'utf8');
  const build = await readFile(new URL('src-tauri/build.rs', root), 'utf8');
  const gradle = await readFile(new URL('src-tauri/android/rustls.gradle.kts', root), 'utf8');
  const rules = await readFile(new URL('src-tauri/android/rustls.pro', root), 'utf8');
  const client = await readFile(new URL('cms/src/publishing/githubClient.ts', root), 'utf8');
  assert.match(storage, /rustls_platform_verifier::android::init_with_env/);
  assert.match(build, /android\/rustls.gradle.kts/);
  assert.match(gradle, /rustls:rustls-platform-verifier/);
  assert.match(rules, /-keep, includedescriptorclasses class org.rustls.platformverifier/);
  assert.match(client, /withRequestTimeout\(invoke<DeviceFlowStart>/);
  assert.match(client, /withRequestTimeout\(invoke<DeviceFlowPoll>/);
});

test('GitHub connection has an explicit busy state instead of a silent repeated click', () => {
  const html = render({ connecting: true });
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /disabled=""/);
  assert.match(html, /Requesting authorization code/);
});

test('device authorization clearly exposes code, browser action and waiting status', () => {
  const html = render({ deviceFlow: { userCode: 'TEST-CODE', expiresAt: '2026-09-25T20:15:00Z' } });
  assert.match(html, /value="TEST-CODE"/);
  assert.match(html, /Copy code/);
  assert.match(html, /Open GitHub/);
  assert.match(html, /Waiting for approval/);
  assert.match(html, /Code valid until/);
  assert.doesNotMatch(html, /automatically opens/);
});

test('GitHub errors and verified repository are visible in every editor', () => {
  assert.match(render({ error: 'Network unavailable' }), /role="alert"[^]*Network unavailable/);
  assert.match(render({ connection: { repositoryVerified: true, repository: 'owner/site', branch: 'main' } }), /Connected and verified[^]*owner\/site[^]*main/);
  assert.equal(render({ connectionOpen: false }), '');
});

test('an authorized connection can retry repository verification without requesting a new code', () => {
  const html = render({ connection: { available: true, configured: true, connected: true, repositoryVerified: false } });
  assert.match(html, /Check connection again/);
  assert.doesNotMatch(html, />Connect GitHub</);
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
    assert.match(source, /await waitForDeviceAuthorization\(flow,/);
    assert.match(source, /isCurrent: \(\) => pollingGeneration.current === generation/);
    assert.match(source, /if \(!polled \|\| pollingGeneration.current !== generation\) return/);
    assert.match(source, /catch \(pollError\) \{\s*if \(pollingGeneration.current !== generation\) return/);
  }
});

function pollingHarness(responses, overrides = {}) {
  let clock = 0;
  let calls = 0;
  const waits = [];
  const messages = [];
  const options = {
    now: () => clock,
    sleep: async (ms) => { waits.push(ms); clock += ms; },
    isVisible: () => true,
    isCurrent: () => true,
    onWaiting: (message) => messages.push(message),
    poll: async () => {
      const response = responses[calls++];
      if (response instanceof Error || typeof response === 'string') throw response;
      assert.ok(response, 'unexpected extra authorization request');
      return response;
    },
    ...overrides,
  };
  return { options, waits, messages, calls: () => calls, now: () => clock };
}
const flow = { userCode: 'TEST-CODE', expiresAt: new Date(900_000).toISOString(), intervalSeconds: 5 };
const connected = { state: 'connected', connection: { connected: true, repositoryVerified: true } };

test('temporary network failures retain the original code and continue to approval', async () => {
  const h = pollingHarness([
    { state: 'retrying', retryAfterSeconds: 10, message: 'Connection interrupted. Your code is still valid.' },
    { state: 'pending', retryAfterSeconds: 10 }, connected,
  ]);
  assert.equal(await waitForDeviceAuthorization(flow, h.options), connected);
  assert.deepEqual(h.waits, [5_000, 10_000, 10_000]);
  assert.match(h.messages[0], /still valid/);
});

test('browser approval can take minutes without any background network requests', async () => {
  const h = pollingHarness([connected]);
  h.options.isVisible = () => h.now() >= 180_000;
  h.options.poll = async () => {
    assert.ok(h.now() >= 180_000);
    return connected;
  };
  assert.equal(await waitForDeviceAuthorization(flow, h.options), connected);
  assert.equal(h.now(), 180_000);
});

test('a poll interrupted while opening the browser resumes with the same flow', async () => {
  let visible = true;
  const h = pollingHarness([]);
  let requests = 0;
  h.options.isVisible = () => visible || h.now() >= 120_000;
  h.options.poll = async () => {
    if (++requests === 1) {
      visible = false;
      throw new AuthorizationRequestTimeoutError();
    }
    assert.ok(h.now() >= 120_000);
    return connected;
  };
  assert.equal(await waitForDeviceAuthorization(flow, h.options), connected);
  assert.equal(requests, 2);
  assert.match(h.messages[0], /Keeping your code/);
});

test('slow-down intervals are respected and denial is terminal', async () => {
  const denied = { state: 'denied', message: 'Authorization cancelled.' };
  const h = pollingHarness([{ state: 'slowDown', retryAfterSeconds: 15 }, denied]);
  assert.equal(await waitForDeviceAuthorization(flow, h.options), denied);
  assert.deepEqual(h.waits, [5_000, 15_000]);
});

test('network retries stop at the real code expiration rather than extending it', async () => {
  const h = pollingHarness([]);
  let requests = 0;
  h.options.poll = async () => { requests++; throw new AuthorizationRequestTimeoutError(); };
  assert.equal((await waitForDeviceAuthorization(flow, h.options)).state, 'expired');
  assert.equal(h.now(), 900_000);
  assert.ok(requests < 20);
});

test('an expired code does not cause a request after returning from the browser', async () => {
  const h = pollingHarness([], { isVisible: () => false });
  assert.equal((await waitForDeviceAuthorization(flow, h.options)).state, 'expired');
  assert.equal(h.calls(), 0);
});

test('closing or replacing a flow suppresses late success and errors', async () => {
  for (const outcome of [connected, new Error('Late failure')]) {
    let current = true;
    const h = pollingHarness([], { isCurrent: () => current });
    h.options.poll = async () => {
      current = false;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    };
    assert.equal(await waitForDeviceAuthorization(flow, h.options), null);
    assert.deepEqual(h.messages, []);
  }
});

test('configuration errors stay visible instead of being retried as network errors', async () => {
  const h = pollingHarness(['Enable Device Flow in the GitHub App settings.']);
  await assert.rejects(waitForDeviceAuthorization(flow, h.options), (error) => error.includes('Enable Device Flow'));
  assert.equal(h.calls(), 1);
});
