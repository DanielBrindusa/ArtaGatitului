import { draftToRecipeSource } from '../drafts/draftModel.mjs';

export const GITHUB_REPOSITORY = 'DanielBrindusa/ArtaGatitului';
export const GITHUB_PUBLISH_BRANCH = 'main';

function publishedContentId(draft) {
  try {
    const source = JSON.parse(draft.sourceLink?.sourceJson ?? 'null');
    if (typeof source?.id === 'string' && source.id.trim()) return source.id;
  } catch {
    // Draft validation reports malformed source linkage before publication.
  }
  return draft.slug;
}

export function buildRecipePublicationSource(value) {
  const recipe = draftToRecipeSource(value);
  const attachment = value.data.attachments[0];
  return {
    id: publishedContentId(value),
    slug: recipe.slug,
    title: recipe.title,
    name: recipe.title,
    description: recipe.description,
    category: recipe.category,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    preparation: recipe.steps,
    beforeStart: recipe.beforeStart,
    tags: recipe.tags,
    equipment: recipe.equipment,
    prepTimeMinutes: recipe.prepTimeMinutes,
    cookTimeMinutes: recipe.cookTimeMinutes,
    totalTimeMinutes: recipe.totalTimeMinutes,
    servings: recipe.servings,
    image: attachment?.repositoryPath ?? null,
    imageAlt: attachment?.alt || recipe.imageAlt || recipe.title,
    sourceUrl: recipe.sourceUrl,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    status: 'published',
    closing: recipe.closing || 'Poftă bună!',
    extras: recipe.extras,
    ratingSummary: recipe.ratingSummary,
    keywords: recipe.keywords,
    layout: {
      modelVersion: value.layout.modelVersion,
      blocks: JSON.parse(JSON.stringify(value.layout.blocks)),
    },
  };
}

export function publicationMetadataFromResult(result) {
  if (!result || typeof result !== 'object') throw new Error('Publication result is missing.');
  if (!/^[0-9a-f]{40}$/.test(result.commitSha ?? '')) throw new Error('Publication commit SHA is invalid.');
  if (result.repository !== GITHUB_REPOSITORY) throw new Error('Publication repository is invalid.');
  if (result.branch !== GITHUB_PUBLISH_BRANCH) throw new Error('Publication branch is invalid.');
  if (typeof result.sourceDraftId !== 'string' || !result.sourceDraftId) throw new Error('Publication draft ID is invalid.');
  if (typeof result.recipeSlug !== 'string' || !result.recipeSlug) throw new Error('Publication slug is invalid.');
  if (typeof result.publishedAt !== 'string' || Number.isNaN(Date.parse(result.publishedAt))) {
    throw new Error('Publication timestamp is invalid.');
  }
  if (!['create', 'update', 'delete'].includes(result.operation)) {
    throw new Error('Publication operation is invalid.');
  }
  if (result.operation !== 'delete') {
    if (typeof result.recipePath !== 'string' || !/^src\/content\/recipes\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(result.recipePath)) {
      throw new Error('Published recipe path is invalid.');
    }
    if (!/^[0-9a-f]{40}$/.test(result.recipeBlobSha ?? '')) throw new Error('Published recipe blob is invalid.');
    if (typeof result.recipeJson !== 'string' || !result.recipeJson.trim()) throw new Error('Published recipe source is missing.');
  }
  return {
    commitSha: result.commitSha,
    repository: GITHUB_REPOSITORY,
    branch: GITHUB_PUBLISH_BRANCH,
    sourceDraftId: result.sourceDraftId,
    recipeSlug: result.recipeSlug,
    imagePath: typeof result.imagePath === 'string' ? result.imagePath : null,
    publishedAt: result.publishedAt,
    operation: result.operation === 'delete' ? 'delete' : result.operation === 'update' ? 'update' : 'create',
    recipePath: typeof result.recipePath === 'string' ? result.recipePath : null,
    recipeBlobSha: typeof result.recipeBlobSha === 'string' ? result.recipeBlobSha : null,
    recipeJson: typeof result.recipeJson === 'string' ? result.recipeJson : null,
  };
}
