import fs from 'node:fs/promises';
import path from 'node:path';
import { HERO_IMAGE, PATHS } from './config.mjs';
import { slugify } from './html-utils.mjs';

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

function asStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function keywordList(recipe) {
  if (Array.isArray(recipe.keywords) && recipe.keywords.length) {
    return Array.from(new Set(recipe.keywords.map((item) => String(item || '').trim()).filter(Boolean)));
  }

  return Array.from(new Set([
    ...String(recipe.name || '').split(/\s+/),
    ...String(recipe.category || '').split(/\s+/),
    ...asStringArray(recipe.ingredients).flatMap((line) => line.split(/\s+/)),
    ...Object.values(recipe.tags || {}).flatMap((items) => Array.isArray(items) ? items.flatMap((item) => String(item).split(/\s+/)) : []),
  ].map(slugify).filter(Boolean)));
}

function normalizeCategory(category) {
  const title = String(category.title || category.name || '').trim();
  const slug = String(category.slug || slugify(title)).trim();
  if (!title) throw new Error('A category is missing title/name.');
  if (!slug) throw new Error(`Category "${title}" has no valid slug.`);

  return {
    ...category,
    id: category.id || slug,
    name: title,
    title,
    slug,
    description: String(category.description || '').trim(),
    status: category.status || 'published',
  };
}

function normalizeRecipe(recipe, fileName) {
  const title = String(recipe.title || recipe.name || '').trim();
  const slug = String(recipe.slug || slugify(title)).trim();
  if (!title) throw new Error(`${fileName} is missing title/name.`);
  if (!slug) throw new Error(`${fileName} has no valid slug.`);

  const tags = recipe.tags && typeof recipe.tags === 'object' && !Array.isArray(recipe.tags)
    ? recipe.tags
    : {};
  const steps = asStringArray(recipe.steps || recipe.preparation);
  const ingredients = asStringArray(recipe.ingredients);

  const normalized = {
    ...recipe,
    id: recipe.id || slug,
    slug,
    title,
    name: title,
    category: String(recipe.category || '').trim(),
    description: recipe.description == null ? '' : String(recipe.description),
    ingredients,
    steps,
    preparation: steps,
    beforeStart: asStringArray(recipe.beforeStart),
    tags,
    equipment: asStringArray(recipe.equipment || tags.equipment),
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe.cookTimeMinutes ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    servings: recipe.servings ?? null,
    image: recipe.image ?? null,
    sourceUrl: recipe.sourceUrl ?? null,
    createdAt: recipe.createdAt ?? null,
    updatedAt: recipe.updatedAt ?? null,
    status: recipe.status || 'published',
    closing: recipe.closing || 'Poftă bună!',
    extras: Array.isArray(recipe.extras) ? recipe.extras : [],
    ratingSummary: recipe.ratingSummary || null,
  };

  normalized.keywords = keywordList(normalized);
  return normalized;
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
