import categories from '../../../src/content/categories.json';
import tagGroups from '../../../src/data/tag-groups.json';
import { normalizeRecipe, type NormalizedRecipe, type RecipeSource } from '../../../src/shared/index.mjs';

const recipeModules = import.meta.glob('../../../src/content/recipes/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

export const publishedCategories = categories.filter((category) => category.status === 'published');

export const publishedRecipeCatalog: NormalizedRecipe[] = Object.entries(recipeModules)
  .map(([path, source]) => normalizeRecipe(source as RecipeSource, path.split('/').pop() ?? path))
  .filter((recipe) => recipe.status === 'published')
  .sort((left, right) => left.title.localeCompare(right.title, 'ro'));

export const knownCategories = publishedCategories
  .map((category) => category.title);

export const knownTagGroups = Object.fromEntries(
  Object.entries(tagGroups).map(([group, config]) => [group, config.options]),
) as Record<string, string[]>;

export const knownTags = Array.from(new Set(Object.values(knownTagGroups).flat()))
  .sort((left, right) => left.localeCompare(right, 'ro'));
