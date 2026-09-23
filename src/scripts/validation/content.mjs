import fs from 'node:fs/promises';
import path from 'node:path';
import { validateRecipeSource } from '../../shared/validation/recipe.mjs';
import { collectPageReferences } from '../../shared/content/page.mjs';
import { validatePageSource } from '../../shared/validation/page.mjs';
import { validatePageSlug } from '../../shared/routing/page-routes.mjs';

const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NULLABLE_TRACKING_FIELDS = [
  'prepTimeMinutes',
  'cookTimeMinutes',
  'totalTimeMinutes',
  'servings',
  'image',
  'createdAt',
  'updatedAt',
];

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function categoryName(category) {
  return category && (category.title || category.name);
}

function relative(root, filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, '/');
}

async function readJson(filePath, label, issues, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    issues.push(`${label}: invalid JSON or unreadable file (${error.message})`);
    return null;
  }
}

export function localAssetPath(value) {
  if (!nonEmptyString(value) || /^https?:\/\//i.test(value)) return null;
  const withoutSuffix = value.split(/[?#]/, 1)[0].replaceAll('\\', '/');
  let decoded;
  try {
    decoded = decodeURIComponent(withoutSuffix);
  } catch {
    return false;
  }
  const clean = decoded.replace(/^\.\//, '').replace(/^\/+/, '');
  if (!clean || clean.split('/').includes('..') || !clean.startsWith('assets/')) return false;
  return clean;
}

export async function validateContentEntries({
  root,
  categories,
  recipes,
  pages = [],
  aliases = {},
  tagGroups = {},
}) {
  const issues = [];
  const warnings = [];
  const recipesWithNulls = [];
  const categoryNames = new Set();
  const categorySlugs = new Map();

  if (!Array.isArray(categories)) {
    issues.push('src/content/categories.json must contain an array of categories.');
  } else {
    categories.forEach((category, index) => {
      const name = categoryName(category);
      const label = `src/content/categories.json: category ${index}`;
      if (!nonEmptyString(name)) issues.push(`${label} needs a title/name`);
      else if (categoryNames.has(name)) issues.push(`${label} duplicates category name "${name}"`);
      else categoryNames.add(name);

      if (!nonEmptyString(category?.slug)) issues.push(`${label} needs a slug`);
      else if (!SAFE_SLUG.test(category.slug)) issues.push(`${label} has an unsafe slug "${category.slug}"`);
      else if (categorySlugs.has(category.slug)) {
        issues.push(`${label} duplicates slug "${category.slug}" used by category ${categorySlugs.get(category.slug)}`);
      } else {
        categorySlugs.set(category.slug, index);
      }
    });
  }

  if (!tagGroups || typeof tagGroups !== 'object' || Array.isArray(tagGroups)) {
    issues.push('src/data/tag-groups.json must contain an object of tag groups.');
  }
  if (!aliases || typeof aliases !== 'object' || Array.isArray(aliases)) {
    issues.push('src/content/aliases.json must contain an object.');
    aliases = {};
  }

  const seenSlugs = new Map();
  let parsedRecipeCount = 0;
  for (const entry of recipes) {
    const { fileName, recipe } = entry;
    const label = `src/content/recipes/${fileName}`;
    if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) {
      issues.push(`${label}: recipe must be an object`);
      continue;
    }
    parsedRecipeCount += 1;
    const validation = validateRecipeSource(recipe, { categoryNames, tagGroups });
    validation.errors.forEach((message) => issues.push(`${label}: ${message}`));

    if (nonEmptyString(recipe.slug)) {
      if (seenSlugs.has(recipe.slug)) {
        issues.push(`${label}: duplicate slug "${recipe.slug}" also used by ${seenSlugs.get(recipe.slug)}`);
      } else {
        seenSlugs.set(recipe.slug, label);
      }
      if (fileName !== `${recipe.slug}.json`) {
        warnings.push(`${label}: filename does not match slug "${recipe.slug}"`);
      }
    }

    const assetPath = localAssetPath(recipe.image);
    if (assetPath === false) {
      issues.push(`${label}: image must be a safe site-root asset path or HTTP(S) URL`);
    } else if (assetPath) {
      try {
        const stat = await fs.stat(path.join(root, ...assetPath.split('/')));
        if (!stat.isFile()) issues.push(`${label}: image asset does not reference a file: ${assetPath}`);
      } catch {
        issues.push(`${label}: image asset does not exist: ${assetPath}`);
      }
    }

    const nullFields = NULLABLE_TRACKING_FIELDS.filter(
      (field) => recipe[field] === null || recipe[field] === undefined,
    );
    if (nullFields.length) recipesWithNulls.push({ slug: recipe.slug || fileName, fields: nullFields });
  }

  for (const [alias, target] of Object.entries(aliases)) {
    if (!SAFE_SLUG.test(alias)) issues.push(`src/content/aliases.json: unsafe alias slug "${alias}"`);
    if (!nonEmptyString(target) || !seenSlugs.has(target)) {
      issues.push(`src/content/aliases.json: alias "${alias}" points to missing recipe slug "${target}"`);
    }
    if (seenSlugs.has(alias)) issues.push(`src/content/aliases.json: alias "${alias}" collides with a recipe slug`);
  }

  const recipeSlugs = [...seenSlugs.keys()];
  const pageSlugs = [];
  let homepageCount = 0;
  for (const entry of pages) {
    const { fileName, page } = entry;
    const label = `src/content/pages/${fileName}`;
    const validation = validatePageSource(page, {
      recipeSlugs,
      categorySlugs: [...categorySlugs.keys()],
    });
    validation.errors.forEach((message) => issues.push(`${label}: ${message}`));
    if (!page || typeof page !== 'object' || Array.isArray(page)) continue;
    if (page.pageType === 'home') homepageCount += 1;
    const expectedFile = page.pageType === 'home' ? 'home.json' : `${page.slug}.json`;
    if (fileName !== expectedFile) issues.push(`${label}: filename must be ${expectedFile}`);
    const route = validatePageSlug(page.slug, {
      pageType: page.pageType,
      recipeSlugs,
      categorySlugs: [...categorySlugs.keys()],
      aliasSlugs: Object.keys(aliases),
      pageSlugs,
      currentSlug: null,
    });
    route.errors.forEach((message) => issues.push(`${label}: ${message}`));
    if (page.pageType !== 'home') pageSlugs.push(page.slug);
    const assets = [page.socialImage, ...collectPageReferences(page).images];
    for (const asset of assets) {
      const assetPath = localAssetPath(asset);
      if (assetPath === false) issues.push(`${label}: image must be a safe site-root asset path or HTTP(S) URL`);
      else if (assetPath) {
        try {
          const stat = await fs.stat(path.join(root, ...assetPath.split('/')));
          if (!stat.isFile()) issues.push(`${label}: image asset does not reference a file: ${assetPath}`);
        } catch {
          issues.push(`${label}: image asset does not exist: ${assetPath}`);
        }
      }
    }
  }
  if (homepageCount !== 1) issues.push(`src/content/pages must contain exactly one Homepage; found ${homepageCount}`);

  return {
    issues,
    warnings,
    recipesWithNulls,
    categoryCount: Array.isArray(categories) ? categories.length : 0,
    recipeFileCount: recipes.length,
    pageFileCount: pages.length,
    parsedRecipeCount,
    duplicateSlugCount: Math.max(0, recipes.length - seenSlugs.size),
  };
}

export async function validateContentRepository({ root = process.cwd() } = {}) {
  const issues = [];
  const contentDir = path.join(root, 'src', 'content');
  const recipesDir = path.join(contentDir, 'recipes');
  const pagesDir = path.join(contentDir, 'pages');
  const categories = await readJson(
    path.join(contentDir, 'categories.json'),
    'src/content/categories.json',
    issues,
  );
  const aliases = await readJson(
    path.join(contentDir, 'aliases.json'),
    'src/content/aliases.json',
    issues,
    {},
  );
  const tagGroups = await readJson(
    path.join(root, 'src', 'data', 'tag-groups.json'),
    'src/data/tag-groups.json',
    issues,
  );
  const schema = await readJson(
    path.join(root, 'src', 'schema', 'recipe.schema.json'),
    'src/schema/recipe.schema.json',
    issues,
  );
  if (!schema || schema.type !== 'object') issues.push('Recipe schema could not be loaded.');
  const pageSchema = await readJson(
    path.join(root, 'src', 'schema', 'page.schema.json'),
    'src/schema/page.schema.json',
    issues,
  );
  if (!pageSchema || pageSchema.type !== 'object') issues.push('Page schema could not be loaded.');

  let recipeFiles = [];
  try {
    recipeFiles = (await fs.readdir(recipesDir)).filter((file) => file.endsWith('.json')).sort();
  } catch (error) {
    issues.push(`src/content/recipes: could not read recipe directory (${error.message})`);
  }

  const recipes = [];
  for (const fileName of recipeFiles) {
    const filePath = path.join(recipesDir, fileName);
    const recipe = await readJson(filePath, relative(root, filePath), issues);
    if (recipe) recipes.push({ fileName, recipe });
  }

  let pageFiles = [];
  try {
    pageFiles = (await fs.readdir(pagesDir)).filter((file) => file.endsWith('.json')).sort();
  } catch (error) {
    issues.push(`src/content/pages: could not read page directory (${error.message})`);
  }
  const pages = [];
  for (const fileName of pageFiles) {
    const filePath = path.join(pagesDir, fileName);
    const page = await readJson(filePath, relative(root, filePath), issues);
    if (page) pages.push({ fileName, page });
  }

  const result = await validateContentEntries({ root, categories, recipes, pages, aliases, tagGroups });
  return { ...result, issues: [...issues, ...result.issues], recipeFileCount: recipeFiles.length, pageFileCount: pageFiles.length };
}
