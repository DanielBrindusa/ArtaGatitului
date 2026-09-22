import assert from 'node:assert/strict';
import test from 'node:test';
import { renderBlockTree } from '../src/shared/index.mjs';
import {
  createRecipeDraft,
  migrateDraft,
  validateDraftForPublish,
  validateDraftForStorage,
} from '../cms/src/drafts/draftModel.mjs';
import {
  createDefaultRecipeBlocks,
  insertListItem,
  reorderDraftBlocks,
  reorderItems,
  resolvedBlockWidth,
  setBlockWidth,
  updateDraftSlug,
  updateDraftTitle,
  updateRecipeList,
} from '../cms/src/editor/editorModel.mjs';
import { detectImageType } from '../cms/src/editor/imageValidation.mjs';

test('new recipe drafts start with the complete visual recipe template', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-visual', title: 'Ciorba' });
  const expected = [
    'recipe-hero',
    'recipe-metadata',
    'ingredients',
    'before-starting',
    'equipment',
    'instructions',
    'rating',
    'related-recipes',
  ];

  assert.deepEqual(draft.layout.blocks.map((block) => block.type), expected);
  assert.deepEqual(createDefaultRecipeBlocks().map((block) => block.type), expected);
  assert.equal(validateDraftForStorage(draft).valid, true);
});

test('inline title edits update normalized recipe identity and preserve a manual slug', () => {
  let draft = createRecipeDraft('editor-uid', { id: 'draft-title', title: 'Paste' });
  draft = updateDraftTitle(draft, 'Paste carbonara');
  assert.equal(draft.title, 'Paste carbonara');
  assert.equal(draft.data.recipe.name, 'Paste carbonara');
  assert.equal(draft.slug, 'paste-carbonara');

  draft = updateDraftSlug(draft, 'reteta-mea');
  draft = updateDraftTitle(draft, 'Alt titlu');
  assert.equal(draft.slug, 'reteta-mea');
});

test('ingredient entry and recipe list reordering update structured arrays', () => {
  let draft = createRecipeDraft('editor-uid', { id: 'draft-lists' });
  const ingredients = insertListItem([], 0, '400 g spaghetti');
  draft = updateRecipeList(draft, 'ingredients', insertListItem(ingredients, 1, '150 g guanciale'));
  draft = updateRecipeList(draft, 'ingredients', reorderItems(draft.data.recipe.ingredients, 1, 0));
  assert.deepEqual(draft.data.recipe.ingredients, ['150 g guanciale', '400 g spaghetti']);

  draft = updateRecipeList(draft, 'steps', ['Fierbe pastele.', 'Rumeneste guanciale.']);
  draft = updateRecipeList(draft, 'steps', reorderItems(draft.data.recipe.steps, 1, 0));
  assert.deepEqual(draft.data.recipe.steps, ['Rumeneste guanciale.', 'Fierbe pastele.']);
  assert.deepEqual(draft.data.recipe.preparation, draft.data.recipe.steps);
});

test('section order and constrained widths are stored without pixel positioning', () => {
  let draft = createRecipeDraft('editor-uid', { id: 'draft-layout' });
  draft = reorderDraftBlocks(draft, 2, 1);
  assert.equal(draft.layout.blocks[1].type, 'ingredients');

  const ingredient = draft.layout.blocks.find((block) => block.type === 'ingredients');
  draft = setBlockWidth(draft, ingredient.id, 'desktop', 'narrow');
  draft = setBlockWidth(draft, ingredient.id, 'mobile', 'full');
  const changed = draft.layout.blocks.find((block) => block.id === ingredient.id);
  assert.equal(resolvedBlockWidth(changed, 'desktop'), 'narrow');
  assert.equal(resolvedBlockWidth(changed, 'mobile'), 'full');
  assert.throws(() => setBlockWidth(draft, ingredient.id, 'desktop', '643px'), /Invalid layout width/);
});

test('publish readiness rejects unsafe slugs and accepts complete structured recipes', () => {
  let draft = createRecipeDraft('editor-uid', { id: 'draft-ready', title: 'Supa crema' });
  draft.data.recipe.category = 'Fel principal';
  draft = updateRecipeList(draft, 'ingredients', ['500 ml supa']);
  draft = updateRecipeList(draft, 'steps', ['Fierbe ingredientele.']);
  draft = updateDraftSlug(draft, '../unsafe');
  assert.equal(validateDraftForPublish(draft).valid, false);
  assert.match(validateDraftForPublish(draft).errors.join('\n'), /safe slug/);

  draft = updateDraftSlug(draft, 'supa-crema');
  assert.equal(validateDraftForPublish(draft).valid, true);
});

test('Firestore-safe image metadata survives draft serialization without bytes', () => {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-serialized', title: 'Reteta' });
  draft.data.attachments = [{
    id: 'image-local',
    fileName: 'reteta.webp',
    alt: 'Reteta terminata',
    localAttachmentId: 'image-local',
    sourceDeviceId: 'device-one',
    repositoryPath: null,
    mimeType: 'image/webp',
    byteSize: 124_000,
    width: 1600,
    height: 900,
  }];
  const serialized = JSON.stringify(draft);
  const restored = migrateDraft(JSON.parse(serialized));

  assert.equal(restored.data.attachments[0].mimeType, 'image/webp');
  assert.equal(restored.data.attachments[0].width, 1600);
  assert.doesNotMatch(serialized, /data:image|base64/i);
});

test('the shared renderer receives the same normalized recipe edited by the canvas', () => {
  let draft = createRecipeDraft('editor-uid', { id: 'draft-render', title: 'Paste carbonara' });
  draft.data.recipe.category = 'Fel principal';
  draft = updateRecipeList(draft, 'ingredients', ['400 g spaghetti']);
  draft = updateRecipeList(draft, 'steps', ['Fierbe pastele.']);
  const html = renderBlockTree(draft.layout.blocks, {
    recipe: draft.data.recipe,
    recipes: [draft.data.recipe],
    root: '#',
  });

  assert.match(html, /Paste carbonara/);
  assert.match(html, /400 g spaghetti/);
  assert.match(html, /Fierbe pastele/);
});

test('image validation inspects actual signatures instead of extensions', () => {
  assert.equal(detectImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
  assert.equal(detectImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'image/png');
  assert.equal(detectImageType(new TextEncoder().encode('RIFF1234WEBP')), 'image/webp');
  assert.equal(detectImageType(new TextEncoder().encode('not an image')), null);
});
