import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRecipeDraft, validateDraftForStorage } from '../cms/src/drafts/draftModel.mjs';
import {
  buildRecipePublicationSource,
  publicationMetadataFromResult,
} from '../cms/src/publishing/publicationModel.mjs';

const repositoryRoot = new URL('../', import.meta.url);

async function read(path) {
  return readFile(new URL(path, repositoryRoot), 'utf8');
}

function publishableDraft() {
  const draft = createRecipeDraft('editor-uid', { id: 'draft-carbonara', title: 'Paste Carbonara' });
  draft.slug = 'paste-carbonara';
  draft.data.recipe.slug = draft.slug;
  draft.data.recipe.category = 'Paste';
  draft.data.recipe.description = 'O reteta rapida si cremoasa.';
  draft.data.recipe.ingredients = ['200 g paste', '2 oua'];
  draft.data.recipe.steps = ['Fierbe pastele.', 'Amesteca sosul.'];
  draft.data.recipe.preparation = [...draft.data.recipe.steps];
  return draft;
}

test('publication source is canonical and metadata marks the originating draft', () => {
  const draft = publishableDraft();
  const source = buildRecipePublicationSource(draft);
  assert.equal(source.id, 'paste-carbonara');
  assert.equal(source.slug, 'paste-carbonara');
  assert.equal(source.status, 'published');
  assert.equal(source.image, null);
  assert.deepEqual(source.preparation, source.steps);

  const metadata = publicationMetadataFromResult({
    commitSha: 'a'.repeat(40),
    repository: 'DanielBrindusa/ArtaGatitului',
    branch: 'main',
    sourceDraftId: draft.id,
    recipeSlug: draft.slug,
    imagePath: 'assets/images/recipes/paste-carbonara.webp',
    publishedAt: '2026-09-22T12:00:00.000Z',
  });
  const published = {
    ...draft,
    status: 'published',
    publishedCommitSha: metadata.commitSha,
    publishedRepository: metadata.repository,
    publishedBranch: metadata.branch,
    publishedSourceDraftId: metadata.sourceDraftId,
    publishedSlug: metadata.recipeSlug,
    publishedAt: metadata.publishedAt,
    data: {
      ...draft.data,
      recipe: { ...draft.data.recipe, status: 'published' },
    },
  };
  assert.equal(validateDraftForStorage(published).valid, true);
  assert.throws(() => publicationMetadataFromResult({ ...metadata, branch: 'feature' }), /branch/);
});

test('native publisher has a narrow token-free command surface and safe GitHub boundaries', async () => {
  const [service, client, permission] = await Promise.all([
    read('src-tauri/src/github/mod.rs'),
    read('cms/src/publishing/githubClient.ts'),
    read('src-tauri/permissions/github-publishing.toml'),
  ]);

  assert.match(service, /REPOSITORY_ID: u64 = 1_256_031_473/);
  assert.match(service, /PUBLISH_BRANCH: &str = "main"/);
  assert.match(service, /format!\("src\/content\/recipes\/\{\}\.json", input\.slug\)/);
  assert.match(service, /format!\("assets\/images\/recipes\/\{\}\.\{\}"/);
  assert.match(service, /"force": false/);
  assert.match(service, /repository_id/);
  assert.doesNotMatch(client, /accessToken|refreshToken|Authorization/);
  assert.doesNotMatch(permission, /github_request|get_raw_github_token/i);
  assert.match(service, /assert!\(!allowed_publication_path\("\.github\/workflows\/deploy\.yml"\)\)/);
});

test('GitHub commands are local-only and remote View Mode stays unprivileged', async () => {
  const [desktop, android, viewMode] = await Promise.all([
    read('src-tauri/capabilities/cms-local.json'),
    read('src-tauri/capabilities/cms-android.json'),
    read('src-tauri/src/view_mode.rs'),
  ]);
  const local = JSON.parse(desktop);
  const mobile = JSON.parse(android);

  assert.equal(local.local, true);
  assert.equal(mobile.local, true);
  assert.equal('remote' in local, false);
  assert.equal('remote' in mobile, false);
  assert.ok(local.permissions.includes('github-publishing'));
  assert.ok(mobile.permissions.includes('github-publishing'));
  assert.deepEqual(local.webviews, ['main']);
  assert.deepEqual(mobile.webviews, ['main']);
  assert.match(viewMode, /PUBLIC_VIEW_LABEL: &str = "public-view"/);
  assert.match(viewMode, /https:\/\/danielbrindusa\.github\.io\/ArtaGatitului\//);
});

test('setup guide documents exact least-privilege Device Flow configuration', async () => {
  const guide = await read('docs/github-app-setup.md');
  assert.match(guide, /Device Flow/);
  assert.match(guide, /Contents.*Read and write/);
  assert.match(guide, /Metadata.*Read-only/);
  assert.match(guide, /ARTA_GITHUB_APP_CLIENT_ID/);
  assert.match(guide, /Do not generate, embed, or configure a client secret/);
  assert.match(guide, /Only select repositories/);
  assert.match(guide, /Disconnect GitHub/);
  assert.match(guide, /revoke/i);
  assert.match(guide, /uninstall/i);
  assert.doesNotMatch(guide, /paste (a |your )?(classic )?(personal access token|PAT)/i);
});
