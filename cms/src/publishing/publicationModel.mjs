import { draftToRecipeSource } from '../drafts/draftModel.mjs';

export const GITHUB_REPOSITORY = 'DanielBrindusa/ArtaGatitului';
export const GITHUB_PUBLISH_BRANCH = 'main';

export function buildRecipePublicationSource(value) {
  const recipe = draftToRecipeSource(value);
  return {
    id: recipe.slug,
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
    image: null,
    sourceUrl: recipe.sourceUrl,
    createdAt: recipe.createdAt,
    updatedAt: recipe.updatedAt,
    status: 'published',
    closing: recipe.closing || 'Poftă bună!',
    extras: recipe.extras,
    ratingSummary: recipe.ratingSummary,
    keywords: recipe.keywords,
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
  return {
    commitSha: result.commitSha,
    repository: GITHUB_REPOSITORY,
    branch: GITHUB_PUBLISH_BRANCH,
    sourceDraftId: result.sourceDraftId,
    recipeSlug: result.recipeSlug,
    imagePath: typeof result.imagePath === 'string' ? result.imagePath : null,
    publishedAt: result.publishedAt,
  };
}
