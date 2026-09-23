import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Firestore writes stay behind the draft service and use transactions', async () => {
  const service = await readFile(new URL('../cms/src/drafts/DraftService.ts', import.meta.url), 'utf8');
  const view = await readFile(new URL('../cms/src/views/EditMode.tsx', import.meta.url), 'utf8');

  assert.match(service, /runTransaction/);
  assert.match(service, /remoteRevision !== expectedRevision/);
  assert.match(service, /serverTimestamp\(\)/);
  assert.match(service, /memoryLocalCache\(\)/);
  assert.doesNotMatch(view, /firebase\/firestore/);
});

test('production rules use an explicit approved UID allow-list and default deny', async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const allowList = rules.match(/request\.auth\.uid in \[([\s\S]*?)\]/);

  assert.ok(allowList, 'An explicit request.auth.uid allow-list is required.');
  const approvedUids = JSON.parse(`[${allowList[1]}]`);
  assert.ok(approvedUids.length > 0);
  assert.ok(approvedUids.every((uid) => typeof uid === 'string' && uid.length > 0 && uid !== '*'));
  assert.match(rules, /request\.auth != null/);
  assert.match(rules, /match \/\{document=\*\*\}/);
  assert.match(rules, /allow read, write: if false/);
  assert.doesNotMatch(rules, /allow read, write: if true/);
});

test('Tauri CSP grants Firestore network access without broad Google wildcards', async () => {
  const config = JSON.parse(await readFile(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  const csp = config.app.security.csp;

  assert.match(csp, /https:\/\/firestore\.googleapis\.com/);
  assert.doesNotMatch(csp, /https:\/\/\*/);
  assert.doesNotMatch(csp, /https:\/\/\*\.googleapis\.com/);
});
