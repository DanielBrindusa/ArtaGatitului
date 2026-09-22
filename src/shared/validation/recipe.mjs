import { RECIPE_STATUSES } from '../content/types.mjs';
import { isSafeContentUrl } from '../utils/html.mjs';

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStringArray(value, field, errors, { required = false } = {}) {
  if (!Array.isArray(value)) {
    errors.push(`${field} must be an array`);
    return;
  }
  if (required && value.length === 0) errors.push(`${field} must not be empty`);
  value.forEach((item, index) => {
    if (!nonEmptyString(item)) errors.push(`${field}[${index}] must be a non-empty string`);
  });
}

function validateNullableMinutes(recipe, field, errors) {
  const value = recipe[field];
  if (value !== undefined && value !== null && (!Number.isInteger(value) || value < 0)) {
    errors.push(`${field} must be a non-negative integer or null`);
  }
}

export function validateRecipeSource(recipe, { categoryNames } = {}) {
  const errors = [];
  if (!isRecord(recipe)) return { valid: false, errors: ['recipe must be an object'] };

  if (!nonEmptyString(recipe.slug)) errors.push('slug is required');
  if (!nonEmptyString(recipe.title)) errors.push('title is required');
  if (!nonEmptyString(recipe.category)) errors.push('category is required');
  if (categoryNames instanceof Set && nonEmptyString(recipe.category) && !categoryNames.has(recipe.category)) {
    errors.push(`category "${recipe.category}" is not listed in categories.json`);
  }

  validateStringArray(recipe.ingredients, 'ingredients', errors, { required: true });
  validateStringArray(recipe.steps, 'steps', errors, { required: true });
  if (recipe.beforeStart !== undefined) validateStringArray(recipe.beforeStart, 'beforeStart', errors);
  if (recipe.equipment !== undefined) validateStringArray(recipe.equipment, 'equipment', errors);
  if (recipe.keywords !== undefined) validateStringArray(recipe.keywords, 'keywords', errors);

  if (recipe.tags !== undefined) {
    if (!isRecord(recipe.tags)) errors.push('tags must be an object when present');
    else Object.entries(recipe.tags).forEach(([group, values]) => validateStringArray(values, `tags.${group}`, errors));
  }

  if (!RECIPE_STATUSES.includes(recipe.status)) {
    errors.push(`status must be one of ${RECIPE_STATUSES.join(', ')}`);
  }

  ['prepTimeMinutes', 'cookTimeMinutes', 'totalTimeMinutes'].forEach((field) => validateNullableMinutes(recipe, field, errors));
  if (recipe.servings !== undefined && recipe.servings !== null
    && !Number.isInteger(recipe.servings) && !nonEmptyString(recipe.servings)) {
    errors.push('servings must be an integer, a non-empty string, or null');
  }
  if (recipe.image !== undefined && recipe.image !== null
    && (!nonEmptyString(recipe.image) || !isSafeContentUrl(recipe.image))) {
    errors.push('image must be a safe relative or HTTP(S) URL');
  }
  if (recipe.sourceUrl !== undefined && recipe.sourceUrl !== null
    && (!nonEmptyString(recipe.sourceUrl) || !isSafeContentUrl(recipe.sourceUrl))) {
    errors.push('sourceUrl must be a safe relative or HTTP(S) URL');
  }
  if (recipe.closing !== undefined && recipe.closing !== null && typeof recipe.closing !== 'string') {
    errors.push('closing must be a string or null');
  }
  if (recipe.extras !== undefined) {
    if (!Array.isArray(recipe.extras)) errors.push('extras must be an array');
    else recipe.extras.forEach((extra, index) => {
      if (!isRecord(extra) || !nonEmptyString(extra.type) || !/^[a-z][a-z0-9-]*$/.test(extra.type)) {
        errors.push(`extras[${index}] must have a safe type identifier`);
      }
    });
  }
  if (recipe.ratingSummary !== undefined && recipe.ratingSummary !== null && !isRecord(recipe.ratingSummary)) {
    errors.push('ratingSummary must be an object or null');
  } else if (isRecord(recipe.ratingSummary)) {
    const ratingFields = {
      overallAverage: [0, 5],
      tasteAverage: [0, 5],
      clarityAverage: [0, 5],
      complexityAverage: [0, 5],
      cookAgainPercent: [0, 100],
    };
    Object.keys(recipe.ratingSummary).forEach((field) => {
      if (field !== 'totalRatings' && !Object.hasOwn(ratingFields, field)) {
        errors.push(`ratingSummary.${field} is not supported`);
      }
    });
    if (recipe.ratingSummary.totalRatings !== undefined
      && (!Number.isInteger(recipe.ratingSummary.totalRatings) || recipe.ratingSummary.totalRatings < 0)) {
      errors.push('ratingSummary.totalRatings must be a non-negative integer');
    }
    Object.entries(ratingFields).forEach(([field, [minimum, maximum]]) => {
      const value = recipe.ratingSummary[field];
      if (value !== undefined && (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum)) {
        errors.push(`ratingSummary.${field} must be a number from ${minimum} to ${maximum}`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}

export function assertValidRecipeSource(recipe, options) {
  const result = validateRecipeSource(recipe, options);
  if (!result.valid) throw new Error(`Invalid recipe:\n- ${result.errors.join('\n- ')}`);
  return recipe;
}
