import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRecipeDraft,
  duplicateRecipeDraft,
  migrateDraft,
  UnsupportedDraftSchemaError,
  validateDraftForPublish,
  validateDraftForStorage,
} from '../cms/src/drafts/draftModel.mjs';
import { LocalDraftBackup } from '../cms/src/drafts/localDraftBackup.mjs';
import { shouldConflictOnMissingRemote } from '../cms/src/drafts/draftSyncPolicy.mjs';

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, value);
  }
}

test('new recipe drafts use the shared content and block model versions', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-test', title: 'Supa crema' });
  const result = validateDraftForStorage(draft);

  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.equal(draft.schemaVersion, 1);
  assert.equal(draft.data.modelVersion, 1);
  assert.equal(draft.layout.modelVersion, 1);
  assert.equal(draft.revision, 0);
  assert.equal(draft.data.recipe.title, draft.title);
  assert.ok(draft.layout.blocks.length > 0);
});

test('incomplete editor drafts can be stored but are not publish-ready', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-incomplete' });

  assert.equal(validateDraftForStorage(draft).valid, true);
  assert.equal(validateDraftForPublish(draft).valid, false);

  draft.data.recipe.category = 'Supe';
  draft.data.recipe.ingredients = ['500 ml supa'];
  draft.data.recipe.steps = ['Fierbe ingredientele.'];
  draft.data.recipe.preparation = [...draft.data.recipe.steps];
  assert.equal(validateDraftForPublish(draft).valid, true);
});

test('draft validation rejects inline image bytes and data URLs', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-image' });
  draft.data.attachments.push({
    id: 'image-one',
    fileName: 'recipe.jpg',
    alt: 'Recipe',
    localAttachmentId: 'local-one',
    sourceDeviceId: 'device-one',
    repositoryPath: 'data:image/jpeg;base64,AAAA',
  });

  const result = validateDraftForStorage(draft);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /data URL/);
});

test('draft storage rejects executable content URLs before Firestore upload', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-unsafe-url' });
  draft.data.recipe.sourceUrl = 'javascript:alert(1)';

  const result = validateDraftForStorage(draft);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /safe relative or HTTP\(S\) URL/);
});

test('draft size limits count UTF-8 bytes rather than JavaScript characters', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-large' });
  draft.data.recipe.description = '\u{1f642}'.repeat(200_000);

  const result = validateDraftForStorage(draft);
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /byte application limit/);
});

test('future draft schema versions fail safely', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-future' });
  assert.throws(
    () => migrateDraft({ ...draft, schemaVersion: 99 }),
    UnsupportedDraftSchemaError,
  );
});

test('schema-v1 migration rejects malformed or uncontrolled stored fields', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-malformed' });
  assert.throws(
    () => migrateDraft({
      ...draft,
      arbitraryExecutableConfig: 'alert(1)',
      data: {
        ...draft.data,
        recipe: { ...draft.data.recipe, prepTimeMinutes: -5 },
      },
    }),
    /not supported|non-negative/,
  );
});

test('duplicating a draft creates an independent unsynchronized copy', () => {
  const source = createRecipeDraft('editor-one', { id: 'draft-source', title: 'Carbonara' });
  source.revision = 7;
  source.createdAt = '2026-01-01T00:00:00.000Z';
  source.updatedAt = '2026-01-02T00:00:00.000Z';
  const copy = duplicateRecipeDraft(source, 'editor-two', { id: 'draft-copy' });

  assert.equal(copy.id, 'draft-copy');
  assert.equal(copy.revision, 0);
  assert.equal(copy.updatedByUid, 'editor-two');
  assert.equal(copy.createdAt, null);
  assert.equal(copy.publishedAt, null);
  assert.match(copy.title, /copy$/);
});

test('local backups are versioned, user-scoped, and retain dirty base revisions', () => {
  const storage = new MemoryStorage();
  const editorOne = new LocalDraftBackup('editor-one', storage);
  const editorTwo = new LocalDraftBackup('editor-two', storage);
  const draft = createRecipeDraft('editor-one', { id: 'draft-local' });

  editorOne.save(draft, { dirty: true, baseRevision: 3, backedUpAt: '2026-01-01T00:00:00.000Z' });
  editorOne.setLastOpenedDraftId(draft.id);

  assert.equal(editorOne.load(draft.id).dirty, true);
  assert.equal(editorOne.load(draft.id).baseRevision, 3);
  assert.equal(editorOne.getLastOpenedDraftId(), draft.id);
  assert.equal(editorTwo.list().length, 0);
});

test('a missing cloud snapshot does not conflict with a brand-new unsaved draft', () => {
  const draft = createRecipeDraft('editor-one', { id: 'draft-new' });

  assert.equal(shouldConflictOnMissingRemote({
    draft,
    dirty: true,
    baseRevision: 0,
    backedUpAt: '2026-01-01T00:00:00.000Z',
  }), false);

  draft.revision = 3;
  assert.equal(shouldConflictOnMissingRemote({
    draft,
    dirty: true,
    baseRevision: 3,
    backedUpAt: '2026-01-01T00:00:00.000Z',
  }), true);
});
