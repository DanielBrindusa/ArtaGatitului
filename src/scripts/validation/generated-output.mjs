import fs from 'node:fs/promises';
import path from 'node:path';
import { BUILD_VERSION, SITE_CONFIG } from '../build/config.mjs';
import { buildRoutePlan, validateRoutePlan } from '../build/routes.mjs';
import { buildSitemapUrls } from '../build/generate-sitemap.mjs';

export const REQUIRED_PUBLIC_FILES = Object.freeze([
  'index.html',
  'manifest.json',
  'manifest.webmanifest',
  'service-worker.js',
  'sitemap.xml',
  'robots.txt',
  'icon.png',
  'assets/css/style.css',
  'assets/js/site.js',
  'assets/js/recipes.js',
  'assets/data/recipe-index.json',
  'assets/data/search-index.json',
  'assets/data/ingredient-index.json',
  'assets/data/categories.json',
  'assets/data/tag-groups.json',
  'assets/data/ingredient-aliases.json',
  'assets/icons/icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
]);

function normalizedPath(value) {
  return value.replaceAll('\\', '/');
}

async function fileExists(root, relativePath) {
  try {
    return (await fs.stat(path.join(root, ...relativePath.split('/')))).isFile();
  } catch {
    return false;
  }
}

async function readJson(root, relativePath, issues) {
  try {
    return JSON.parse(await fs.readFile(path.join(root, ...relativePath.split('/')), 'utf8'));
  } catch (error) {
    issues.push(`${relativePath} is missing or invalid JSON (${error.message})`);
    return null;
  }
}

function setDifference(expected, actual) {
  return [...expected].filter((value) => !actual.has(value));
}

function referenceFile(reference, htmlPath) {
  const value = reference.trim();
  if (!value || value.startsWith('#') || /^(?:mailto:|tel:|data:|blob:)/i.test(value)) return null;
  if (/^javascript:/i.test(value)) return false;
  const siteUrl = new URL(SITE_CONFIG.siteUrl);
  const pageUrl = new URL(normalizedPath(htmlPath), siteUrl);
  let resolved;
  try {
    resolved = new URL(value, pageUrl);
  } catch {
    return false;
  }
  if (resolved.origin !== siteUrl.origin) return null;
  if (!resolved.pathname.startsWith(siteUrl.pathname)) return false;
  let relativePath;
  try {
    relativePath = decodeURIComponent(resolved.pathname.slice(siteUrl.pathname.length));
  } catch {
    return false;
  }
  if (!relativePath) return 'index.html';
  if (relativePath.endsWith('/')) return `${relativePath}index.html`;
  return normalizedPath(relativePath);
}

async function validateHtmlLinks(outputRoot, routePlan, issues) {
  for (const route of routePlan.routes) {
    const filePath = path.join(outputRoot, ...route.filePath.split('/'));
    let html;
    try {
      html = await fs.readFile(filePath, 'utf8');
    } catch {
      continue;
    }
    const references = [...html.matchAll(/\b(?:href|src)="([^"]+)"/gi)].map((match) => match[1]);
    for (const reference of references) {
      const target = referenceFile(reference, route.filePath);
      if (target === false) {
        issues.push(`${route.filePath} contains unsafe or out-of-project reference "${reference}"`);
      } else if (target && !(await fileExists(outputRoot, target))) {
        issues.push(`${route.filePath} references missing generated file ${target}`);
      }
    }
  }
}

export async function validateGeneratedOutput({ outputRoot, content }) {
  const issues = [];
  const routePlan = validateRoutePlan(buildRoutePlan(content));
  const expectedFiles = new Set([
    ...REQUIRED_PUBLIC_FILES,
    ...routePlan.routes.map((route) => route.filePath),
  ]);

  for (const relativePath of expectedFiles) {
    if (!(await fileExists(outputRoot, relativePath))) issues.push(`Missing generated file: ${relativePath}`);
  }

  const recipeSlugs = new Set(content.recipes.map((recipe) => recipe.slug));
  const categorySlugs = new Set(content.categories.map((category) => category.slug));
  const recipeIndex = await readJson(outputRoot, 'assets/data/recipe-index.json', issues);
  const searchIndex = await readJson(outputRoot, 'assets/data/search-index.json', issues);
  const ingredientIndex = await readJson(outputRoot, 'assets/data/ingredient-index.json', issues);
  const categoryIndex = await readJson(outputRoot, 'assets/data/categories.json', issues);

  const indexes = [
    ['recipe index', recipeIndex],
    ['search index', searchIndex],
    ['ingredient index', ingredientIndex],
  ];
  for (const [label, index] of indexes) {
    if (!Array.isArray(index)) continue;
    const missing = setDifference(recipeSlugs, new Set(index.map((entry) => entry.slug)));
    if (missing.length) issues.push(`The ${label} is missing recipes: ${missing.join(', ')}`);
  }
  if (Array.isArray(categoryIndex)) {
    const missing = setDifference(categorySlugs, new Set(categoryIndex.map((entry) => entry.slug)));
    if (missing.length) issues.push(`The category index is missing categories: ${missing.join(', ')}`);
  }

  const sitemapPath = path.join(outputRoot, 'sitemap.xml');
  let sitemap = '';
  try {
    sitemap = await fs.readFile(sitemapPath, 'utf8');
    const expectedUrls = buildSitemapUrls(routePlan);
    expectedUrls.forEach((url) => {
      if (!sitemap.includes(`<loc>${url}</loc>`)) issues.push(`sitemap.xml is missing ${url}`);
    });
    if (/localhost|file:\/\/|YOUR-GITHUB-USERNAME/i.test(sitemap)) {
      issues.push('sitemap.xml contains a local or placeholder URL.');
    }
  } catch (error) {
    issues.push(`sitemap.xml could not be read (${error.message})`);
  }

  for (const recipe of content.recipes) {
    const recipePath = `retete/${recipe.slug}/index.html`;
    try {
      const html = await fs.readFile(path.join(outputRoot, ...recipePath.split('/')), 'utf8');
      const canonical = `${SITE_CONFIG.siteUrl}retete/${recipe.slug}/`;
      if (!html.includes(`<link rel="canonical" href="${canonical}">`)) {
        issues.push(`${recipePath} has an incorrect canonical URL.`);
      }
      if (!html.includes(`<meta name="arta-build-version" content="${BUILD_VERSION}">`)) {
        issues.push(`${recipePath} does not identify the current build version.`);
      }
    } catch {
      // The missing route is already reported above.
    }
  }

  const manifest = await readJson(outputRoot, 'manifest.webmanifest', issues);
  if (manifest && (manifest.start_url !== './' || manifest.scope !== './')) {
    issues.push('manifest.webmanifest must keep project-relative start_url and scope values.');
  }
  try {
    const serviceWorker = await fs.readFile(path.join(outputRoot, 'service-worker.js'), 'utf8');
    for (const required of ['manifest.webmanifest', 'assets/css/style.css', 'assets/js/site.js', 'assets/data/recipe-index.json']) {
      if (!serviceWorker.includes(required)) issues.push(`service-worker.js does not retain ${required}.`);
    }
  } catch {
    // The missing file is already reported above.
  }

  await validateHtmlLinks(outputRoot, routePlan, issues);
  return { valid: issues.length === 0, issues, routePlan, expectedFiles };
}
