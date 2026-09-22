import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCategory, normalizeRecipe } from '../../shared/content/normalize.mjs';
import { HERO_IMAGE, PATHS } from './config.mjs';

async function readJson(filePath, label) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${label}: ${error.message}`);
    }
    throw new Error(`Could not read ${label}: ${error.message}`);
  }
}

async function readOptionalJson(filePath, label, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${label}: ${error.message}`);
    }
    throw new Error(`Could not read ${label}: ${error.message}`);
  }
}

export async function loadContent() {
  const rawCategories = await readJson(PATHS.categoriesFile, 'src/content/categories.json');
  if (!Array.isArray(rawCategories)) {
    throw new Error('src/content/categories.json must contain an array.');
  }

  const categoryEntries = rawCategories.map(normalizeCategory).filter((category) => category.status !== 'archived');
  const categoryOrder = new Map(categoryEntries.map((category, index) => [category.name, index]));

  const recipeFileNames = (await fs.readdir(PATHS.recipesDir))
    .filter((fileName) => fileName.endsWith('.json'))
    .sort((a, b) => a.localeCompare(b, 'ro'));

  const recipes = [];
  for (const fileName of recipeFileNames) {
    const rawRecipe = await readJson(path.join(PATHS.recipesDir, fileName), `src/content/recipes/${fileName}`);
    const recipe = normalizeRecipe(rawRecipe, fileName);
    if (recipe.status !== 'archived') recipes.push(recipe);
  }

  recipes.sort((a, b) => {
    const categoryDiff = (categoryOrder.get(a.category) ?? Number.MAX_SAFE_INTEGER)
      - (categoryOrder.get(b.category) ?? Number.MAX_SAFE_INTEGER);
    return categoryDiff || a.name.localeCompare(b.name, 'ro');
  });

  const aliases = await readOptionalJson(PATHS.aliasesFile, 'src/content/aliases.json', {});
  const tagGroups = await readJson(PATHS.tagGroupsFile, 'src/data/tag-groups.json');
  const ingredientAliases = await readJson(PATHS.ingredientAliasesFile, 'src/data/ingredient-aliases.json');

  return {
    categories: categoryEntries,
    recipes,
    aliases,
    tagGroups,
    ingredientAliases,
    heroImage: HERO_IMAGE,
  };
}
