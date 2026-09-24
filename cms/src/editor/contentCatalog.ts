import categories from '../../../src/content/categories.json';
import tagGroups from '../../../src/data/tag-groups.json';
import templates from '../../../src/content/site/templates.json';
import globalBlocks from '../../../src/content/site/global-blocks.json';
import navigation from '../../../src/content/site/navigation.json';
import settings from '../../../src/content/site/settings.json';
import theme from '../../../src/content/site/theme.json';
import { normalizePage, normalizeRecipe, type NormalizedRecipe, type PageSource, type RecipeSource } from '../../../src/shared/index.mjs';

const recipeModules = import.meta.glob('../../../src/content/recipes/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;
const pageModules = import.meta.glob('../../../src/content/pages/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const allRecipes = Object.entries(recipeModules)
  .map(([path, source]) => normalizeRecipe(source as RecipeSource, path.split('/').pop() ?? path));
const allPages = Object.values(pageModules).map((source) => normalizePage(source));

export const publishedCategories = categories.filter((category) => category.status === 'published');
export const siteTemplates = templates;
export const siteGlobalBlocks = globalBlocks;
export const siteNavigation = navigation;
export const siteSettings = settings;
export const siteTheme = theme;
export const siteTagGroups = tagGroups;
export const siteSourceBundle = {
  templates,
  globalBlocks,
  navigation,
  settings,
  theme,
  categories,
  tagGroups,
  recipes: allRecipes,
  pages: allPages,
};

export const publishedRecipeCatalog: NormalizedRecipe[] = allRecipes
  .filter((recipe) => recipe.status === 'published')
  .sort((left, right) => left.title.localeCompare(right.title, 'ro'));

export const publishedPageCatalog: PageSource[] = allPages
  .filter((page) => page.status === 'published')
  .sort((left, right) => left.title.localeCompare(right.title, 'ro'));

export const knownCategories = publishedCategories
  .map((category) => category.title);

export const knownTagGroups = Object.fromEntries(
  Object.entries(tagGroups).map(([group, config]) => [group, config.options]),
) as Record<string, string[]>;

export const knownTags = Array.from(new Set(Object.values(knownTagGroups).flat()))
  .sort((left, right) => left.localeCompare(right, 'ro'));
