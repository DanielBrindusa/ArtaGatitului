import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'src', 'content');
const RECIPES_DIR = path.join(CONTENT_DIR, 'recipes');
const CATEGORIES_PATH = path.join(CONTENT_DIR, 'categories.json');
const RECIPE_SCHEMA_PATH = path.join(ROOT, 'src', 'schema', 'recipe.schema.json');

const allowedStatuses = new Set(['published', 'draft', 'archived']);
const nullableTrackingFields = [
  'prepTimeMinutes',
  'cookTimeMinutes',
  'totalTimeMinutes',
  'servings',
  'image',
  'createdAt',
  'updatedAt',
];

async function readJson(filePath, issues) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    issues.push(`${relative(filePath)}: invalid JSON or unreadable file (${error.message})`);
    return null;
  }
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll(path.sep, '/');
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringArray(recipe, filePath, field, issues, { requireNonEmpty = false } = {}) {
  const value = recipe[field];
  if (!Array.isArray(value)) {
    issues.push(`${relative(filePath)}: ${field} must be an array`);
    return;
  }

  if (requireNonEmpty && value.length === 0) {
    issues.push(`${relative(filePath)}: ${field} must not be empty`);
  }

  value.forEach((item, index) => {
    if (!nonEmptyString(item)) {
      issues.push(`${relative(filePath)}: ${field}[${index}] must be a non-empty string`);
    }
  });
}

function categoryName(category) {
  return category && (category.title || category.name);
}

async function main() {
  const issues = [];
  const warnings = [];
  const schema = await readJson(RECIPE_SCHEMA_PATH, issues);
  const categories = await readJson(CATEGORIES_PATH, issues);

  if (!schema) {
    issues.push('Recipe schema could not be loaded.');
  }

  if (!Array.isArray(categories)) {
    issues.push('src/content/categories.json must contain an array of categories.');
  }

  const categoryNames = new Set(
    Array.isArray(categories)
      ? categories.map(categoryName).filter(nonEmptyString)
      : []
  );

  if (Array.isArray(categories)) {
    categories.forEach((category, index) => {
      if (!nonEmptyString(categoryName(category))) {
        issues.push(`src/content/categories.json: category ${index} needs a title/name`);
      }
      if (!nonEmptyString(category.slug)) {
        issues.push(`src/content/categories.json: category ${index} needs a slug`);
      }
    });
  }

  let recipeFiles = [];
  try {
    recipeFiles = (await fs.readdir(RECIPES_DIR))
      .filter((file) => file.endsWith('.json'))
      .sort();
  } catch (error) {
    issues.push(`src/content/recipes: could not read recipe directory (${error.message})`);
  }

  const seenSlugs = new Map();
  const recipesWithNulls = [];
  let validRecipeCount = 0;

  for (const file of recipeFiles) {
    const filePath = path.join(RECIPES_DIR, file);
    const recipe = await readJson(filePath, issues);
    if (!recipe) continue;

    validRecipeCount += 1;

    if (!nonEmptyString(recipe.slug)) issues.push(`${relative(filePath)}: slug is required`);
    if (!nonEmptyString(recipe.title)) issues.push(`${relative(filePath)}: title is required`);
    if (!nonEmptyString(recipe.category)) issues.push(`${relative(filePath)}: category is required`);

    if (nonEmptyString(recipe.slug)) {
      if (seenSlugs.has(recipe.slug)) {
        issues.push(`${relative(filePath)}: duplicate slug "${recipe.slug}" also used by ${seenSlugs.get(recipe.slug)}`);
      } else {
        seenSlugs.set(recipe.slug, relative(filePath));
      }

      if (file !== `${recipe.slug}.json`) {
        warnings.push(`${relative(filePath)}: filename does not match slug "${recipe.slug}"`);
      }
    }

    if (nonEmptyString(recipe.category) && !categoryNames.has(recipe.category)) {
      issues.push(`${relative(filePath)}: category "${recipe.category}" is not listed in categories.json`);
    }

    validateStringArray(recipe, filePath, 'ingredients', issues, { requireNonEmpty: true });
    validateStringArray(recipe, filePath, 'steps', issues, { requireNonEmpty: true });

    if (recipe.beforeStart !== undefined) {
      validateStringArray(recipe, filePath, 'beforeStart', issues);
    }

    if (recipe.tags !== undefined && (recipe.tags === null || typeof recipe.tags !== 'object' || Array.isArray(recipe.tags))) {
      issues.push(`${relative(filePath)}: tags must be an object when present`);
    }

    if (!allowedStatuses.has(recipe.status)) {
      issues.push(`${relative(filePath)}: status must be one of ${Array.from(allowedStatuses).join(', ')}`);
    }

    const nullFields = nullableTrackingFields.filter((field) => recipe[field] === null || recipe[field] === undefined);
    if (nullFields.length) {
      recipesWithNulls.push({ slug: recipe.slug || file, fields: nullFields });
    }
  }

  console.log('Content validation summary');
  console.log(`- Categories: ${Array.isArray(categories) ? categories.length : 0}`);
  console.log(`- Recipe files: ${recipeFiles.length}`);
  console.log(`- Parsed recipes: ${validRecipeCount}`);
  console.log(`- Duplicate slugs: ${Math.max(0, recipeFiles.length - seenSlugs.size)}`);
  console.log(`- Recipes with optional null fields: ${recipesWithNulls.length}`);

  if (warnings.length) {
    console.log('\nWarnings');
    warnings.forEach((warning) => console.log(`- ${warning}`));
  }

  if (recipesWithNulls.length) {
    console.log('\nOptional null fields');
    recipesWithNulls.forEach((entry) => console.log(`- ${entry.slug}: ${entry.fields.join(', ')}`));
  }

  if (issues.length) {
    console.log('\nValidation failed');
    issues.forEach((issue) => console.log(`- ${issue}`));
    process.exit(1);
  }

  console.log('\nValidation passed');
}

main().catch((error) => {
  console.error(`Content validation crashed: ${error.message}`);
  process.exit(1);
});
