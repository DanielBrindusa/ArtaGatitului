import fs from 'node:fs/promises';
import path from 'node:path';
import { PATHS, ROOT, SOURCE_ICON_PATH } from './config.mjs';
import { writeBinaryFile, writeTextFile } from './html-utils.mjs';

const INGREDIENT_STOP_WORDS = new Set([
  'g', 'gr', 'kg', 'ml', 'l', 'litru', 'litri', 'lingura', 'linguri', 'lingurita', 'lingurite',
  'buc', 'bucata', 'bucati', 'felie', 'felii', 'cana', 'cani', 'pachet', 'pachete',
  'dupa', 'gust', 'aproximativ', 'optional', 'proaspat', 'proaspata', 'proaspete',
  'de', 'din', 'cu', 'si', 'sau', 'la', 'pentru', 'cat', 'cate', 'putin', 'putina',
]);

const DEFAULT_INGREDIENT_ALIASES = {
  ou: ['oua'],
  oua: ['ou'],
  cartof: ['cartofi'],
  cartofi: ['cartof'],
  rosie: ['rosii'],
  rosii: ['rosie'],
  ceapa: ['cepe'],
  cepe: ['ceapa'],
  galusca: ['galuste'],
  galuste: ['galusca'],
  lamaie: ['lamai'],
  lamai: ['lamaie'],
};

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function tokenizeText(value) {
  return normalizeText(value).match(/[a-z0-9]+/g) || [];
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

function isSubheading(line) {
  return /:$/.test(line) || /^[A-ZĂÂÎȘȚ0-9\s/-]{3,}$/.test(line);
}

function splitIngredients(recipe) {
  const rows = asArray(recipe.ingredients).filter((line) => !isSubheading(line));
  const optional = [];
  const required = [];
  rows.forEach((line) => {
    if (/\boptional\b|\bopțional\b/i.test(line)) optional.push(line);
    else required.push(line);
  });
  return { required, optional };
}

function normalizedTags(tags) {
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return {};
  return Object.fromEntries(Object.entries(tags)
    .map(([key, values]) => [
      key,
      Array.isArray(values) ? unique(values.map((value) => String(value || '').trim())) : [],
    ])
    .filter(([, values]) => values.length));
}

function flatTags(recipe) {
  return Object.values(normalizedTags(recipe.tags)).flat();
}

function buildIngredientAliasMap(source) {
  const map = Object.entries(DEFAULT_INGREDIENT_ALIASES).reduce((result, [key, values]) => {
    result[key] = values.slice();
    return result;
  }, {});

  const entries = source && Array.isArray(source.aliases) ? source.aliases : [];
  entries.forEach((entry) => {
    const terms = unique([entry.canonical, ...(Array.isArray(entry.terms) ? entry.terms : [])]
      .map(normalizeText));
    terms.forEach((term) => {
      const related = terms.filter((item) => item !== term);
      map[term] = unique([...(map[term] || []), ...related]);
    });
  });

  return map;
}

function ingredientTokens(value, aliasMap) {
  return unique(tokenizeText(value)
    .filter((token) => !/^\d+$/.test(token) && !INGREDIENT_STOP_WORDS.has(token))
    .flatMap((token) => [token, ...(aliasMap[token] || [])]));
}

function recipeKeywords(recipe) {
  if (Array.isArray(recipe.keywords) && recipe.keywords.length) {
    return unique(recipe.keywords.map((item) => normalizeText(item)));
  }

  return unique([
    recipe.name,
    recipe.title,
    recipe.category,
    recipe.description,
    ...asArray(recipe.ingredients),
    ...flatTags(recipe),
  ].flatMap(tokenizeText));
}

function publicRecipeSummary(recipe) {
  const ingredients = splitIngredients(recipe);
  const tags = normalizedTags(recipe.tags);
  return {
    slug: recipe.slug,
    title: recipe.title || recipe.name,
    name: recipe.name || recipe.title,
    category: recipe.category,
    description: recipe.description || '',
    ingredients: ingredients.required.slice(0, 5),
    ingredientsCount: ingredients.required.length + ingredients.optional.length,
    tags,
    equipment: asArray(recipe.equipment || tags.equipment),
    prepTimeMinutes: recipe.prepTimeMinutes ?? null,
    cookTimeMinutes: recipe.cookTimeMinutes ?? null,
    totalTimeMinutes: recipe.totalTimeMinutes ?? null,
    servings: recipe.servings ?? null,
    image: recipe.image ?? null,
    keywords: recipeKeywords(recipe),
  };
}

export function buildDataIndexes(content) {
  const aliasMap = buildIngredientAliasMap(content.ingredientAliases);
  const categories = content.categories.map((category) => ({
    id: category.id || category.slug,
    slug: category.slug,
    title: category.title || category.name,
    name: category.name || category.title,
    description: category.description || '',
    status: category.status || 'published',
  }));

  const recipeIndex = content.recipes.map(publicRecipeSummary);

  const searchIndex = content.recipes.map((recipe) => {
    const tags = normalizedTags(recipe.tags);
    const ingredients = asArray(recipe.ingredients);
    const searchText = [
      recipe.name,
      recipe.title,
      recipe.category,
      recipe.description,
      ingredients.join(' '),
      asArray(recipe.preparation || recipe.steps).join(' '),
      asArray(recipe.beforeStart).join(' '),
      recipeKeywords(recipe).join(' '),
      Object.values(tags).flat().join(' '),
    ].join(' ');

    return {
      slug: recipe.slug,
      title: recipe.title || recipe.name,
      name: recipe.name || recipe.title,
      category: recipe.category,
      description: recipe.description || '',
      ingredients: splitIngredients(recipe).required.slice(0, 5),
      tags,
      keywords: recipeKeywords(recipe),
      searchText: normalizeText(searchText),
      tokens: unique(tokenizeText(searchText)),
    };
  });

  const ingredientIndex = content.recipes.map((recipe) => {
    const ingredients = splitIngredients(recipe);
    const requiredIngredientTokens = ingredients.required.map((line) => ({
      label: line,
      tokens: ingredientTokens(line, aliasMap),
    })).filter((row) => row.tokens.length);
    const optionalIngredientTokens = ingredients.optional.map((line) => ({
      label: line,
      tokens: ingredientTokens(line, aliasMap),
    })).filter((row) => row.tokens.length);

    return {
      slug: recipe.slug,
      title: recipe.title || recipe.name,
      name: recipe.name || recipe.title,
      category: recipe.category,
      description: recipe.description || '',
      ingredients: [...ingredients.required, ...ingredients.optional],
      requiredIngredients: ingredients.required,
      optionalIngredients: ingredients.optional,
      requiredIngredientTokens,
      optionalIngredientTokens,
      ingredientTokens: unique([
        ...requiredIngredientTokens.flatMap((row) => row.tokens),
        ...optionalIngredientTokens.flatMap((row) => row.tokens),
        ...recipeKeywords(recipe),
      ]),
      tags: normalizedTags(recipe.tags),
      equipment: asArray(recipe.equipment || recipe.tags?.equipment),
      totalTimeMinutes: recipe.totalTimeMinutes ?? null,
      keywords: recipeKeywords(recipe),
    };
  });

  return {
    'recipe-index.json': recipeIndex,
    'search-index.json': searchIndex,
    'ingredient-index.json': ingredientIndex,
    'categories.json': categories,
    'tag-groups.json': content.tagGroups || {},
    'ingredient-aliases.json': content.ingredientAliases || { aliases: [] },
  };
}

export async function generateDataAssets(content, renderers) {
  const sourceIcon = await fs.readFile(SOURCE_ICON_PATH);
  const dataIndexes = buildDataIndexes(content);

  await writeTextFile(path.join(PATHS.assetsJsDir, 'recipes.js'), renderers.dataFile(content));
  await writeTextFile(path.join(PATHS.assetsJsDir, 'site.js'), renderers.jsFile());
  await writeTextFile(path.join(PATHS.assetsCssDir, 'style.css'), renderers.cssFile());
  await Promise.all(Object.entries(dataIndexes).map(([fileName, payload]) => (
    writeTextFile(path.join(PATHS.assetsDataDir, fileName), `${JSON.stringify(payload, null, 2)}\n`)
  )));
  await writeTextFile(path.join(ROOT, 'manifest.json'), renderers.manifestFile());
  await writeTextFile(path.join(ROOT, 'manifest.webmanifest'), renderers.manifestFile());
  await writeBinaryFile(path.join(PATHS.iconsDir, 'icon.png'), sourceIcon);
  await writeBinaryFile(path.join(PATHS.iconsDir, 'icon-192.png'), renderers.resizePng(sourceIcon, 192));
  await writeBinaryFile(path.join(PATHS.iconsDir, 'icon-512.png'), renderers.resizePng(sourceIcon, 512));
}
