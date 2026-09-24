import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRecipeDraft, validateDraftForPublish, validateDraftForStorage } from '../cms/src/drafts/draftModel.mjs';
import {
  buildRecipePublicationSource,
  publicationMetadataFromResult,
} from '../cms/src/publishing/publicationModel.mjs';
import {
  createLinkedRecipeDraft,
  imageActionForDraft,
  semanticRecipeChanges,
  sourceIdentityFromDraft,
  synchronizeLinkedDraftStatus,
} from '../cms/src/publishing/publishedRecipeModel.mjs';

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
    operation: 'create',
    recipePath: 'src/content/recipes/paste-carbonara.json',
    recipeBlobSha: 'b'.repeat(40),
    recipeJson: `${JSON.stringify(source)}\n`,
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
  assert.match(service, /format!\("src\/content\/recipes\/\{slug\}\.json"\)/);
  assert.match(service, /format!\("assets\/images\/recipes\/\{slug\}\.\{extension\}"\)/);
  assert.match(service, /"force": false/);
  assert.match(service, /repository_id/);
  assert.doesNotMatch(client, /accessToken|refreshToken|Authorization/);
  assert.doesNotMatch(permission, /github_request|get_raw_github_token/i);
  assert.match(service, /ACTIONS_PAGE_URL: &str = "https:\/\/github\.com\/DanielBrindusa\/ArtaGatitului\/actions"/);
  assert.match(permission, /github_open_actions_page/);
  assert.match(permission, /github_list_published_recipes/);
  assert.match(permission, /github_prepare_recipe_delete/);
  assert.match(service, /current\.sha != source\.blob_sha/);
  assert.match(service, /aliases\.insert\(source\.slug\.clone\(\), input\.slug\.clone\(\)\)/);
  assert.match(service, /assert!\(!allowed_publication_path\("\.github\/workflows\/deploy\.yml"\)\)/);
});

test('published recipes become linked edit drafts with semantic review and stable identity', () => {
  const source = buildRecipePublicationSource(publishableDraft());
  source.id = 'stable-carbonara-rating-key';
  const published = {
    path: 'src/content/recipes/paste-carbonara.json',
    slug: 'paste-carbonara',
    title: source.title,
    category: source.category,
    imagePath: null,
    commitSha: 'a'.repeat(40),
    blobSha: 'b'.repeat(40),
    sourceJson: `${JSON.stringify(source)}\n`,
  };
  const linked = createLinkedRecipeDraft(published, 'editor-uid');

  assert.equal(linked.status, 'published');
  assert.deepEqual(sourceIdentityFromDraft(linked), {
    path: published.path,
    slug: published.slug,
    commitSha: published.commitSha,
    blobSha: published.blobSha,
  });
  assert.equal(imageActionForDraft(linked), 'remove');
  assert.deepEqual(semanticRecipeChanges(linked), []);

  linked.title = 'Carbonara clasica';
  linked.data.recipe.title = linked.title;
  linked.data.recipe.name = linked.title;
  const edited = synchronizeLinkedDraftStatus(linked);
  assert.equal(edited.status, 'draft');
  assert.match(semanticRecipeChanges(edited).map((change) => change.label).join('\n'), /Title changed/);

  edited.slug = 'carbonara-clasica';
  edited.data.recipe.slug = edited.slug;
  const renamedSource = buildRecipePublicationSource(edited);
  assert.equal(renamedSource.id, 'stable-carbonara-rating-key');
  assert.equal(renamedSource.slug, 'carbonara-clasica');
});

test('legacy published recipes gain an editable layout without changing GitHub on open', () => {
  const source = buildRecipePublicationSource(publishableDraft());
  delete source.layout;
  const published = {
    path: 'src/content/recipes/paste-carbonara.json',
    slug: 'paste-carbonara',
    title: source.title,
    category: source.category,
    imagePath: null,
    commitSha: 'a'.repeat(40),
    blobSha: 'b'.repeat(40),
    sourceJson: `${JSON.stringify(source)}\n`,
  };
  const linked = createLinkedRecipeDraft(published, 'editor-uid');
  assert.ok(linked.layout.blocks.some((block) => block.type === 'recipe-hero'));
  assert.ok(linked.layout.blocks.some((block) => block.type === 'ingredients'));
  assert.deepEqual(linked.data.recipe.steps, source.preparation);
  assert.equal(linked.sourceLink.blobSha, published.blobSha);
});

test('deleted published drafts are storage-valid but require explicit recreation before publish', () => {
  const draft = publishableDraft();
  draft.status = 'publishedDeleted';
  draft.data.recipe.status = 'archived';
  draft.deletedAt = '2026-09-23T12:00:00.000Z';
  draft.sourceLink = {
    path: 'src/content/recipes/paste-carbonara.json',
    slug: 'paste-carbonara',
    commitSha: 'a'.repeat(40),
    blobSha: 'b'.repeat(40),
    sourceJson: `${JSON.stringify(buildRecipePublicationSource(publishableDraft()))}\n`,
  };
  const result = validateDraftForStorage(draft);
  assert.equal(result.valid, true, result.errors.join('\n'));
  assert.match(validateDraftForPublish(draft).errors.join('\n'), /Create as new recipe/);
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
