import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { createPageDraft, draftToPageSource, validateDraftForStorage } from '../cms/src/drafts/draftModel.mjs';
import {
  createPageBlock,
  findPageBlock,
  insertPageBlock,
  movePageBlock,
  removePageBlock,
  reorderPageChildren,
  setColumnsPreset,
  setPageBlockVisibility,
  setPageBlockWidth,
} from '../cms/src/editor/pageEditorModel.mjs';
import { BLOCK_TYPES } from '../src/shared/blocks/model.mjs';
import { renderBlockTree } from '../src/shared/render/blocks.mjs';
import { validatePageSlug } from '../src/shared/routing/page-routes.mjs';
import { validatePageSource } from '../src/shared/validation/page.mjs';

test('page schema accepts structured Homepage and rejects invalid nesting', async () => {
  const home = JSON.parse(await fs.readFile('src/content/pages/home.json', 'utf8'));
  assert.deepEqual(validatePageSource(home), { valid: true, errors: [], page: home, modelVersion: 1 });

  const invalid = structuredClone(home);
  invalid.layout.blocks[0].data.blocks.push(createPageBlock(BLOCK_TYPES.SECTION));
  assert.equal(validatePageSource(invalid).valid, false);
  assert.match(validatePageSource(invalid).errors.join('\n'), /cannot be nested inside section/);
});

test('page creation, addition, reorder, and cross-column moves stay structured', () => {
  let draft = createPageDraft('editor-uid', { id: 'draft-page-test', title: 'Despre noi', pageType: 'standard' });
  assert.equal(validateDraftForStorage(draft).valid, true);
  const sectionId = draft.layout.blocks[0].id;
  draft = insertPageBlock(draft, sectionId, BLOCK_TYPES.COLUMNS, 1, { id: 'content-columns' });
  const columns = findPageBlock(draft.layout.blocks, 'content-columns');
  const rightColumnId = columns.data.blocks[1].id;
  draft = movePageBlock(draft, 'page-copy', rightColumnId, 0);
  assert.equal(findPageBlock(draft.layout.blocks, rightColumnId).data.blocks[0].id, 'page-copy');
  draft = reorderPageChildren(draft, sectionId, 1, 0);
  assert.equal(draft.layout.blocks[0].data.blocks[0].id, 'content-columns');
  assert.equal(validateDraftForStorage(draft).valid, true);
});

test('page resizing, breakpoint visibility, and column presets use constrained tokens', () => {
  let draft = createPageDraft('editor-uid', { id: 'draft-layout-test', title: 'Layout', pageType: 'standard' });
  const sectionId = draft.layout.blocks[0].id;
  draft = insertPageBlock(draft, sectionId, BLOCK_TYPES.COLUMNS, 0, { id: 'layout-columns' });
  draft = setPageBlockWidth(draft, sectionId, 'tablet', 'medium');
  draft = setPageBlockVisibility(draft, 'page-copy', 'mobile', false);
  draft = setColumnsPreset(draft, 'layout-columns', 'desktop', [4, 8]);
  draft = setColumnsPreset(draft, 'layout-columns', 'mobile', [12, 12]);
  const columns = findPageBlock(draft.layout.blocks, 'layout-columns');
  assert.deepEqual(columns.data.blocks.map((column) => column.data.span.desktop), [4, 8]);
  assert.equal(findPageBlock(draft.layout.blocks, sectionId).responsive.tablet.width, 'medium');
  assert.equal(findPageBlock(draft.layout.blocks, 'page-copy').responsive.mobile.visible, false);
  assert.throws(() => setColumnsPreset(draft, 'layout-columns', 'desktop', [3, 8]), /total 12/);
});

test('route validation blocks reserved, recipe, category, and existing page collisions', () => {
  const options = { recipeSlugs: ['supa-crema'], categorySlugs: ['deserturi'], pageSlugs: ['despre-noi'] };
  for (const slug of ['assets', 'supa-crema', 'deserturi', 'despre-noi']) {
    assert.equal(validatePageSlug(slug, options).valid, false, slug);
  }
  assert.equal(validatePageSlug('povestea-noastra', options).valid, true);
});

test('unsafe links and stale discovery references are rejected', () => {
  const draft = createPageDraft('editor-uid', { id: 'draft-reference-test', title: 'Selecție', pageType: 'standard' });
  const source = draftToPageSource(draft);
  source.layout.blocks[0].data.blocks.push({ id: 'unsafe-link', type: 'button', data: { label: 'Rulează', href: 'javascript:alert(1)' } });
  source.layout.blocks[0].data.blocks.push({ id: 'missing-recipes', type: 'featured-recipes', data: { heading: 'Favorite', slugs: ['nu-exista'], limit: 4 } });
  const result = validatePageSource(source, { recipeSlugs: ['exista'] });
  assert.equal(result.valid, false);
  assert.match(result.errors.join('\n'), /href must be a safe/);
  assert.match(result.errors.join('\n'), /missing recipe "nu-exista"/);
});

test('Homepage cannot become an empty or deletable page', async () => {
  const home = JSON.parse(await fs.readFile('src/content/pages/home.json', 'utf8'));
  const draft = createPageDraft('editor-uid', { id: 'draft-home-test', title: home.title, pageType: 'standard' });
  Object.assign(draft, {
    slug: 'home',
    data: { ...draft.data, page: { id: 'home', pageType: 'home', title: home.title, slug: 'home', description: home.description, socialImage: home.socialImage, status: 'draft' } },
    layout: home.layout,
  });
  const emptied = removePageBlock(draft, home.layout.blocks[0].id);
  assert.equal(validatePageSource(draftToPageSource(emptied)).valid, false);
  const native = await fs.readFile('src-tauri/src/github/mod.rs', 'utf8');
  assert.match(native, /Homepage cannot be deleted/);
});

test('structured Homepage renders through the shared page renderer', async () => {
  const home = JSON.parse(await fs.readFile('src/content/pages/home.json', 'utf8'));
  const html = renderBlockTree(home.layout.blocks, { page: home, recipes: [], categories: [], root: './' });
  assert.match(html, /hero-home/);
  assert.match(html, /id="categoryGrid"/);
  assert.match(html, /id="featuredRecipes"/);
  assert.doesNotMatch(html, /<script/i);
});

test('native page publication remains confined to approved source and asset paths', async () => {
  const source = await fs.readFile('src-tauri/src/github/mod.rs', 'utf8');
  const permissions = await fs.readFile('src-tauri/permissions/github-publishing.toml', 'utf8');
  assert.match(source, /src\/content\/pages\/\{slug\}\.json/);
  assert.match(source, /assets\/images\/pages\/\{slug\}-\{\}/);
  assert.match(source, /Structured content links to this page/);
  assert.match(source, /Published page routes cannot be renamed yet/);
  assert.match(permissions, /github_prepare_page_publish/);
  assert.match(permissions, /github_prepare_page_delete/);
});
