import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  AUTH_STATUSES,
  authStateForUser,
  canAccessEditor,
  parseApprovedEditorUids,
  resolveAppSurface,
} from '../cms/src/auth/authState.mjs';

const repositoryRoot = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

async function readJson(path) {
  return JSON.parse(await read(path));
}

test('approved editor UIDs are normalized without changing identity semantics', () => {
  assert.deepEqual(
    parseApprovedEditorUids(' owner-uid,second-uid, owner-uid ,, '),
    ['owner-uid', 'second-uid'],
  );
  assert.deepEqual(parseApprovedEditorUids(undefined), []);
});

test('only an authenticated approved UID receives editor state', () => {
  const approved = ['approved-uid'];
  const unauthenticated = authStateForUser(null, approved);
  const editor = authStateForUser({ uid: 'approved-uid', email: 'editor@example.test' }, approved);
  const unauthorized = authStateForUser({ uid: 'other-uid', email: 'other@example.test' }, approved);

  assert.deepEqual(unauthenticated, { status: AUTH_STATUSES.unauthenticated });
  assert.equal(editor.status, AUTH_STATUSES.editor);
  assert.equal(canAccessEditor(editor), true);
  assert.equal(unauthorized.status, AUTH_STATUSES.unauthorized);
  assert.equal(canAccessEditor(unauthorized), false);
});

test('public View is independent while every authoring route is guarded', () => {
  const unavailableStates = [
    { status: AUTH_STATUSES.initializing },
    { status: AUTH_STATUSES.unauthenticated },
    { status: AUTH_STATUSES.error, kind: 'network', message: 'offline' },
    { status: AUTH_STATUSES.configurationError, message: 'missing' },
  ];

  for (const state of unavailableStates) {
    assert.equal(resolveAppSurface('view', state), 'view');
    assert.equal(resolveAppSurface('edit', state), 'auth');
    assert.equal(resolveAppSurface('settings', state), 'auth');
  }

  const editor = authStateForUser({ uid: 'approved-uid', email: null }, ['approved-uid']);
  assert.equal(resolveAppSurface('edit', editor), 'edit');
  assert.equal(resolveAppSurface('settings', editor), 'settings');
  assert.equal(resolveAppSurface('view', editor), 'view');
});

test('Firebase boundary supports sign-in, persistence, observation, and sign-out without registration', async () => {
  const gateway = await read('cms/src/auth/firebaseAuthGateway.ts');
  const provider = await read('cms/src/auth/AuthProvider.tsx');
  const login = await read('cms/src/components/AuthGate.tsx');
  const app = await read('cms/src/App.tsx');

  assert.match(gateway, /browserLocalPersistence/);
  assert.match(gateway, /onAuthStateChanged/);
  assert.match(gateway, /signInWithEmailAndPassword/);
  assert.match(gateway, /signOut as firebaseSignOut/);
  assert.doesNotMatch(gateway, /createUserWithEmailAndPassword|signInAnonymously|signInWithPopup/);
  assert.match(provider, /authStateForUser/);
  assert.match(provider, /signOut\(\): Promise<boolean>/);
  assert.match(app, /if \(await auth\.signOut\(\)\) navigate\('view'\)/);
  assert.match(login, /type="password"/);
  assert.match(login, /setPassword\(''\)/);
  assert.doesNotMatch(`${gateway}\n${provider}\n${login}`, /console\.(log|debug)|localStorage.*password/i);
  assert.doesNotMatch(`${gateway}\n${provider}`, /firestore|firebase\/storage|firebase\/functions/i);
});

test('Firebase configuration is externalized and contains no password or Admin credential fields', async () => {
  const example = await read('cms/.env.example');
  const assignmentNames = example
    .split(/\r?\n/)
    .filter((line) => /^[A-Z0-9_]+=/.test(line))
    .map((line) => line.slice(0, line.indexOf('=')));

  assert.deepEqual(assignmentNames, [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_MESSAGING_SENDER_ID',
    'VITE_FIREBASE_EDITOR_UIDS',
  ]);
  assert.doesNotMatch(assignmentNames.join('\n'), /PASSWORD|PRIVATE_KEY|SERVICE_ACCOUNT|ADMIN/i);
  assert.doesNotMatch(example, /BEGIN PRIVATE KEY|"private_key"|@gmail\.com/i);
});

test('Tauri permits only the exact Firebase Authentication and Firestore REST origins', async () => {
  const config = await readJson('src-tauri/tauri.conf.json');
  const csp = config.app.security.csp;
  const devCsp = config.app.security.devCsp;

  for (const policy of [csp, devCsp]) {
    assert.match(policy, /https:\/\/identitytoolkit\.googleapis\.com/);
    assert.match(policy, /https:\/\/securetoken\.googleapis\.com/);
    assert.match(policy, /https:\/\/firestore\.googleapis\.com/);
    assert.doesNotMatch(policy, /https:\/\/\*/);
    assert.doesNotMatch(policy, /firebaseio|storage\.googleapis|firebaseapp\.com/);
  }
});

test('Android public View exposes only a navigation path back to the guarded local editor', async () => {
  const nativeSource = await read('src-tauri/src/view_mode.rs');
  const androidCapability = await readJson('src-tauri/capabilities/cms-android.json');

  assert.match(nativeSource, /arta-native-editor-link/);
  assert.match(nativeSource, /http:\/\/tauri\.localhost\/#edit/);
  assert.match(nativeSource, /http:\/\/localhost:1420\/#edit/);
  assert.deepEqual(androidCapability.permissions, ['github-publishing']);
  assert.equal(androidCapability.local, true);
  assert.deepEqual(androidCapability.webviews, ['main']);
  assert.equal('remote' in androidCapability, false);
});
