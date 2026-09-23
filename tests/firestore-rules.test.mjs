import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const approvedUid = 'approved-editor-test-uid';
const projectId = 'demo-artagatitului';
let environment;

function draftDocument(id, revision = 1) {
  return {
    id,
    contentType: 'recipe',
    schemaVersion: 1,
    title: 'Test draft',
    slug: 'test-draft',
    status: 'draft',
    data: {
      modelVersion: 1,
      recipe: {
        id,
        slug: 'test-draft',
        title: 'Test draft',
        name: 'Test draft',
        description: '',
        category: '',
        ingredients: [],
        steps: [],
        preparation: [],
        beforeStart: [],
        tags: {},
        equipment: [],
        prepTimeMinutes: null,
        cookTimeMinutes: null,
        totalTimeMinutes: null,
        servings: null,
        image: null,
        imageAlt: null,
        sourceUrl: null,
        createdAt: null,
        updatedAt: null,
        status: 'draft',
        closing: '',
        extras: [],
        ratingSummary: null,
        keywords: [],
      },
      attachments: [],
    },
    layout: { modelVersion: 1, blocks: [] },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
    revision,
    publishedCommitSha: null,
    publishedRepository: null,
    publishedBranch: null,
    publishedSourceDraftId: null,
    publishedSlug: null,
    publishedAt: null,
    sourceLink: null,
    deletedAt: null,
  };
}

function pageDraftDocument(id, revision = 1) {
  const draft = draftDocument(id, revision);
  return {
    ...draft,
    contentType: 'page',
    title: 'Despre noi',
    slug: 'despre-noi',
    data: {
      modelVersion: 1,
      page: {
        id,
        pageType: 'standard',
        title: 'Despre noi',
        slug: 'despre-noi',
        description: 'Pagina echipei.',
        socialImage: null,
        status: 'draft',
      },
      attachments: [],
    },
    layout: { modelVersion: 1, blocks: [{ id: 'page-main', type: 'section', data: { blocks: [] } }] },
  };
}

test.before(async () => {
  if (!emulatorAvailable) return;
  const rulesTemplate = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  const rules = rulesTemplate.replace(
    /request\.auth\.uid in \[[\s\S]*?\]/,
    `request.auth.uid in ["${approvedUid}"]`,
  );
  environment = await initializeTestEnvironment({ projectId, firestore: { rules } });
});

test.beforeEach(async () => {
  if (environment) await environment.clearFirestore();
});

test.after(async () => {
  if (environment) await environment.cleanup();
});

test('unauthenticated users cannot read or write drafts and settings', { skip: !emulatorAvailable }, async () => {
  const database = environment.unauthenticatedContext().firestore();
  await assertFails(getDoc(doc(database, 'workspaces/arta-gatitului/drafts/draft-one')));
  await assertFails(setDoc(doc(database, 'workspaces/arta-gatitului/drafts/draft-one'), draftDocument('draft-one')));
  await assertFails(getDoc(doc(database, 'workspaces/arta-gatitului/settings/editor')));
  await assertFails(setDoc(doc(database, 'workspaces/arta-gatitului/settings/editor'), {
    schemaVersion: 1,
    value: {},
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
  }));
});

test('authenticated but unapproved users cannot access the workspace', { skip: !emulatorAvailable }, async () => {
  const database = environment.authenticatedContext('unapproved-uid').firestore();
  await assertFails(getDoc(doc(database, 'workspaces/arta-gatitului/drafts/draft-one')));
  await assertFails(setDoc(doc(database, 'workspaces/arta-gatitului/drafts/draft-one'), {
    ...draftDocument('draft-one'),
    updatedByUid: 'unapproved-uid',
  }));
});

test('approved editors can access only the intended workspace paths', { skip: !emulatorAvailable }, async () => {
  const database = environment.authenticatedContext(approvedUid).firestore();
  await assertSucceeds(setDoc(doc(database, 'workspaces/arta-gatitului/drafts/draft-one'), draftDocument('draft-one')));
  await assertSucceeds(getDoc(doc(database, 'workspaces/arta-gatitului/drafts/draft-one')));
  await assertSucceeds(setDoc(doc(database, 'workspaces/arta-gatitului/settings/editor'), {
    schemaVersion: 1,
    value: { panel: 'drafts' },
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
  }));
  await assertFails(getDoc(doc(database, 'workspaces/another-workspace/drafts/draft-one')));
  await assertFails(setDoc(doc(database, 'unrelated/document'), { value: true }));
});

test('page drafts use the same revision-protected workspace collection', { skip: !emulatorAvailable }, async () => {
  const database = environment.authenticatedContext(approvedUid).firestore();
  const reference = doc(database, 'workspaces/arta-gatitului/drafts/draft-page-one');
  await assertSucceeds(setDoc(reference, pageDraftDocument('draft-page-one')));
  await assertSucceeds(updateDoc(reference, {
    revision: 2,
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
  }));
  await assertFails(updateDoc(reference, {
    revision: 3,
    contentType: 'script',
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
  }));
});

test('draft rules require a monotonic revision and immutable creation time', { skip: !emulatorAvailable }, async () => {
  const database = environment.authenticatedContext(approvedUid).firestore();
  const reference = doc(database, 'workspaces/arta-gatitului/drafts/draft-one');
  await assertSucceeds(setDoc(reference, draftDocument('draft-one')));
  const invalidDraft = draftDocument('draft-invalid');
  invalidDraft.data.recipe.prepTimeMinutes = -1;
  await assertFails(setDoc(
    doc(database, 'workspaces/arta-gatitului/drafts/draft-invalid'),
    invalidDraft,
  ));
  await assertFails(updateDoc(reference, { revision: 1, updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(reference, {
    revision: 2,
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
  }));
  const snapshot = await getDoc(reference);
  assert.equal(snapshot.data().revision, 2);
});

test('publication metadata is complete, repository-pinned, and retained on the draft', { skip: !emulatorAvailable }, async () => {
  const database = environment.authenticatedContext(approvedUid).firestore();
  const reference = doc(database, 'workspaces/arta-gatitului/drafts/draft-published');
  await assertSucceeds(setDoc(reference, draftDocument('draft-published')));
  const published = draftDocument('draft-published', 2);
  published.status = 'published';
  published.data.recipe.status = 'published';
  published.publishedCommitSha = 'a'.repeat(40);
  published.publishedRepository = 'DanielBrindusa/ArtaGatitului';
  published.publishedBranch = 'main';
  published.publishedSourceDraftId = 'draft-published';
  published.publishedSlug = 'test-draft';
  published.publishedAt = serverTimestamp();
  published.createdAt = (await getDoc(reference)).data().createdAt;
  await assertSucceeds(setDoc(reference, published));
  await assertFails(updateDoc(reference, {
    revision: 3,
    publishedBranch: 'app-development',
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
  }));
});

test('linked published drafts can become edits and explicit deletion tombstones', { skip: !emulatorAvailable }, async () => {
  const database = environment.authenticatedContext(approvedUid).firestore();
  const reference = doc(database, 'workspaces/arta-gatitului/drafts/draft-linked');
  const source = {
    id: 'stable-recipe-id',
    slug: 'test-draft',
    title: 'Test draft',
    name: 'Test draft',
    description: '',
    category: 'Test',
    ingredients: ['Ingredient'],
    steps: ['Step'],
    preparation: ['Step'],
    beforeStart: [],
    tags: {},
    equipment: [],
    prepTimeMinutes: null,
    cookTimeMinutes: null,
    totalTimeMinutes: null,
    servings: null,
    image: null,
    imageAlt: null,
    sourceUrl: null,
    createdAt: null,
    updatedAt: null,
    status: 'published',
    closing: '',
    extras: [],
    ratingSummary: null,
    keywords: [],
  };
  const linked = draftDocument('draft-linked');
  linked.status = 'published';
  linked.data.recipe.status = 'published';
  linked.sourceLink = {
    path: 'src/content/recipes/test-draft.json',
    slug: 'test-draft',
    commitSha: 'a'.repeat(40),
    blobSha: 'b'.repeat(40),
    sourceJson: JSON.stringify(source),
  };
  await assertSucceeds(setDoc(reference, linked));

  const createdAt = (await getDoc(reference)).data().createdAt;
  const edited = { ...linked, status: 'draft', revision: 2, createdAt };
  edited.data = { ...linked.data, recipe: { ...linked.data.recipe, status: 'draft' } };
  await assertSucceeds(setDoc(reference, edited));

  const deleted = { ...edited, status: 'publishedDeleted', revision: 3, deletedAt: serverTimestamp() };
  deleted.data = { ...edited.data, recipe: { ...edited.data.recipe, status: 'archived' } };
  deleted.publishedCommitSha = 'c'.repeat(40);
  deleted.publishedRepository = 'DanielBrindusa/ArtaGatitului';
  deleted.publishedBranch = 'main';
  deleted.publishedSourceDraftId = 'draft-linked';
  deleted.publishedSlug = 'test-draft';
  deleted.publishedAt = serverTimestamp();
  await assertSucceeds(setDoc(reference, deleted));

  await assertFails(updateDoc(reference, {
    revision: 4,
    deletedAt: null,
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
  }));
});

test('approved editors can access only their own preferences', { skip: !emulatorAvailable }, async () => {
  const database = environment.authenticatedContext(approvedUid).firestore();
  const ownPreference = doc(database, 'users', approvedUid, 'preferences', 'editor');
  const otherPreference = doc(database, 'users', 'another-editor', 'preferences', 'editor');
  const value = {
    schemaVersion: 1,
    lastOpenedDraftId: 'draft-one',
    previewBreakpoint: 'desktop',
    updatedAt: serverTimestamp(),
    updatedByUid: approvedUid,
  };
  await assertSucceeds(setDoc(ownPreference, value));
  await assertSucceeds(getDoc(ownPreference));
  await assertFails(setDoc(otherPreference, value));
  await assertFails(getDoc(otherPreference));
});
