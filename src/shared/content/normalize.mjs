import { slugify } from '../utils/html.mjs';

export function asStringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

export function keywordList(recipe) {
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

export function normalizeCategory(category) {
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

export function normalizeRecipe(recipe, fileName = 'recipe') {
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
    imageAlt: recipe.imageAlt == null ? null : String(recipe.imageAlt),
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
