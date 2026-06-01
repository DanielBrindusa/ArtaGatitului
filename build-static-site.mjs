import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const INVENTORY_PATH = path.join(ROOT, 'site-audit', 'godaddy-page-text-inventory.json');
const RECIPES_MD_PATH = path.join(ROOT, 'site-audit', 'godaddy-recipes-only.md');

const SITE_NAME = 'Arta Gătitului';
const HERO_IMAGE = 'https://img1.wsimg.com/isteam/stock/19687/:/rs=w:1800,m';
const CATEGORY_PAGES = {
  '/fel-principal': { name: 'Fel principal', slug: 'fel-principal', description: 'Supe, ciorbe și mâncăruri consistente pentru masa principală.' },
  '/fel-secundar': { name: 'Fel secundar', slug: 'fel-secundar', description: 'Rețete calde, garnituri și feluri care completează masa.' },
  '/desert': { name: 'Desert', slug: 'desert', description: 'Dulciuri simple pentru familie și musafiri.' },
  '/rontaieli': { name: 'Rontaieli', slug: 'rontaieli', description: 'Gustări rapide, platouri și idei de ronțăit.' },
  '/salate': { name: 'Salate', slug: 'salate', description: 'Salate și creme reci, bune lângă pâine prăjită.' },
  '/bauturi': { name: 'Băuturi', slug: 'bauturi', description: 'Băuturi și idei care urmează să fie adăugate.' },
  '/mic-dejun': { name: 'Mic dejun', slug: 'mic-dejun', description: 'Idei pentru dimineți gustoase, rapide sau mai tihnite.' },
};

const LOCAL_FALLBACK_RECIPES = [
  {
    name: 'Tocăniță de pui cu ardei copți',
    slug: 'tocanita-de-pui-cu-ardei',
    category: 'Fel secundar',
    sourceUrl: 'https://artagatitului.godaddysites.com/tocanita-de-pui-cu-ardei',
    preparation: [
      'Gătește pulpele de pui până se rumenesc ușor.',
      'Adaugă ceapa, usturoiul, ardeii copți și bulionul.',
      'Lasă tocănița să fiarbă până când sosul se leagă.',
      'Servește cu pătrunjel și pâine ciabatta.',
    ],
    ingredients: [
      'pulpe de pui',
      'ardei capia',
      'ceapă',
      'usturoi',
      'bulion',
      'ulei de măsline',
      'pătrunjel',
      'busuioc',
      'curry',
      'piper',
      'sare',
      'pâine ciabatta',
    ],
  },
];

const RECIPE_ALIASES = {
  'cartofi-prajiti-cu-sos-de-iaurt-si-menta': 'cartofi-prajiti-cu-sos',
  'ciorba-de-fasole-cu-afumatura': 'ciorba-de-fasole',
  'conopida-cu-orez-si-sos-rosu': 'conopida-cu-orez-1',
  'piept-de-pui-cu-lamaie-si-cartofi-aurii': 'pui-cu-lamaie-si-cartofi',
  'tocanita-de-pui-cu-ardei-copti': 'tocanita-de-pui-cu-ardei',
};

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/(^|\s|-)([a-z])/g, (match) => match.toUpperCase());
}

function displayRecipeName(name) {
  const text = String(name || '').trim();
  if (!text) return text;
  return text === text.toUpperCase() ? titleCase(text) : text;
}

function readRecipeSections(markdown) {
  return markdown
    .split(/\n## /)
    .slice(1)
    .map((section) => {
      const lines = section.split('\n');
      const heading = lines.shift().trim();
      const urlLine = lines.find((line) => line.startsWith('URL: '));
      const bulletLines = lines
        .filter((line) => line.startsWith('- '))
        .map((line) => line.slice(2).trim())
        .filter(Boolean);

      return {
        heading,
        url: urlLine ? urlLine.slice(5).trim() : '',
        lines: bulletLines,
      };
    });
}

function splitRecipe(section) {
  const slug = new URL(section.url).pathname.replace(/^\/+/, '');
  const actualTitle = displayRecipeName(section.lines[0] || section.heading);
  const prepIndex = section.lines.indexOf('Mod de preparare');
  const ingredientsIndex = section.lines.indexOf('Ingrediente');
  const poftaIndex = section.lines.indexOf('Pofta buna!');
  const preparationEnd = ingredientsIndex >= 0 ? ingredientsIndex : section.lines.length;

  const preparation = prepIndex >= 0
    ? section.lines.slice(prepIndex + 1, preparationEnd).filter((line) => line !== 'Pofta buna!')
    : [];

  let ingredients = ingredientsIndex >= 0
    ? section.lines.slice(ingredientsIndex + 1)
    : [];

  const extras = [];
  const steakCalculatorIndex = ingredients.findIndex((line) => line.toLowerCase().includes('calculator gatire steak'));
  if (steakCalculatorIndex >= 0) {
    extras.push({
      type: 'steak-calculator',
      title: ingredients[steakCalculatorIndex],
    });
    ingredients = ingredients.slice(0, steakCalculatorIndex);
  }

  return {
    name: actualTitle,
    slug,
    category: '',
    sourceUrl: section.url,
    description: makeDescription(actualTitle, preparation, ingredients),
    preparation,
    ingredients,
    closing: poftaIndex >= 0 ? 'Poftă bună!' : '',
    extras,
  };
}

function makeDescription(name, preparation, ingredients) {
  const firstStep = preparation.find((line) => !isSubheading(line));
  if (firstStep) return firstStep;
  const preview = ingredients.filter((line) => !isSubheading(line)).slice(0, 3).join(', ');
  return preview ? `${name} cu ${preview}.` : `${name}.`;
}

function isSubheading(line) {
  return /:$/.test(line) || /^[A-ZĂÂÎȘȚ0-9\s/-]{3,}$/.test(line);
}

function buildCategoryMap(inventory) {
  const map = new Map();
  for (const [pagePath, category] of Object.entries(CATEGORY_PAGES)) {
    const page = inventory.pages.find((entry) => new URL(entry.url).pathname === pagePath);
    if (!page) continue;

    for (const link of page.links) {
      const slug = new URL(link).pathname.replace(/^\/+/, '');
      if (!slug || slug === 'soon-to-come' || CATEGORY_PAGES[`/${slug}`] || slug === 'portofoliu' || slug === 'randomizer') continue;
      map.set(slug, category.name);
    }
  }
  return map;
}

function mergeRecipes(parsedRecipes, categoryMap) {
  const recipesBySlug = new Map();

  for (const recipe of parsedRecipes) {
    if (recipe.slug === 'soon-to-come') continue;
    recipe.category = categoryMap.get(recipe.slug) || 'Fel secundar';
    recipesBySlug.set(recipe.slug, recipe);
  }

  for (const fallback of LOCAL_FALLBACK_RECIPES) {
    if (!recipesBySlug.has(fallback.slug)) {
      recipesBySlug.set(fallback.slug, {
        ...fallback,
        description: makeDescription(fallback.name, fallback.preparation, fallback.ingredients),
        closing: 'Poftă bună!',
        extras: [],
      });
    }
  }

  const categoryOrder = Object.values(CATEGORY_PAGES).map((category) => category.name);
  return [...recipesBySlug.values()].sort((a, b) => {
    const categoryDiff = categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category);
    return categoryDiff || a.name.localeCompare(b.name, 'ro');
  });
}

function dataFile(categories, recipes) {
  const data = {
    categories,
    heroImage: HERO_IMAGE,
    recipes: recipes.map((recipe) => ({
      name: recipe.name,
      slug: recipe.slug,
      category: recipe.category,
      description: recipe.description,
      ingredients: recipe.ingredients,
      preparation: recipe.preparation,
      closing: recipe.closing,
      extras: recipe.extras,
      sourceUrl: recipe.sourceUrl,
      keywords: Array.from(new Set([
        ...recipe.name.split(/\s+/),
        ...recipe.category.split(/\s+/),
        ...recipe.ingredients.flatMap((line) => line.split(/\s+/)),
      ].map(slugify).filter(Boolean))),
    })),
    aliases: RECIPE_ALIASES,
  };

  return `window.ARTA_DATA = ${JSON.stringify(data, null, 2)};\n`;
}

function nav(root) {
  const primaryLinks = [
    ['Acasă', 'index.html'],
    ['Portofoliu', 'portofoliu/'],
    ['Randomizer', 'randomizer/'],
    ['Caută', 'cauta.html'],
  ];
  const menuLinks = [
    ['Categorii', 'categorii.html'],
    ['Fel principal', 'fel-principal/'],
    ['Fel secundar', 'fel-secundar/'],
    ['Desert', 'desert/'],
    ['Rontaieli', 'rontaieli/'],
    ['Salate', 'salate/'],
    ['Băuturi', 'bauturi/'],
    ['Mic dejun', 'mic-dejun/'],
  ];

  return `
    <header class="site-header">
      <div class="nav-wrap">
        <a class="logo" href="${root}index.html" aria-label="${SITE_NAME}">
          <span class="logo-mark">AG</span>
          <span>${SITE_NAME}</span>
        </a>
        <nav class="nav-primary" aria-label="Navigație principală">
          ${primaryLinks.map(([label, href]) => `<a href="${root}${href}">${label}</a>`).join('\n          ')}
        </nav>
        <button class="mobile-menu-btn" type="button" aria-expanded="false" aria-controls="siteNav" aria-label="Deschide meniul de categorii">
          <span aria-hidden="true">☰</span>
          <span>Categorii</span>
        </button>
        <nav class="nav-links" id="siteNav" aria-label="Categorii rețete">
          ${menuLinks.map(([label, href]) => `<a href="${root}${href}">${label}</a>`).join('\n          ')}
        </nav>
      </div>
    </header>`;
}

function footer(root) {
  return `
    <footer class="footer">
      <p>Copyright © <span id="year"></span> ${SITE_NAME} - Toate drepturile rezervate.</p>
    </footer>`;
}

function page({ title, description, root = '', bodyAttrs = '', main }) {
  const documentTitle = title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`;
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(documentTitle)}</title>
  <meta name="description" content="${escapeHtml(description)}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Source+Sans+3:wght@400;600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${root}assets/css/style.css">
</head>
<body${bodyAttrs ? ` ${bodyAttrs}` : ''}>
<a class="skip-link" href="#main-content">Sari la conținut</a>
${nav(root)}
${main}
${footer(root)}
<script>document.getElementById('year').textContent = new Date().getFullYear();</script>
<script>window.ARTA_ROOT = "${root}";</script>
<script src="${root}assets/js/recipes.js"></script>
<script src="${root}assets/js/site.js"></script>
</body>
</html>
`;
}

function homePage() {
  return page({
    title: SITE_NAME,
    description: 'Viață ocupată, mâncare sănătoasă. Rețete organizate pe categorii și căutare după ingrediente.',
    main: `
      <main id="main-content">
        <section class="hero hero-home">
          <div class="hero-inner">
            <p class="eyebrow">Viață ocupată, mâncare sănătoasă</p>
            <h1>${SITE_NAME}</h1>
            <p class="lead">Rețetele tale, adunate într-un site rapid, curat și ușor de folosit pe orice ecran.</p>
            <form class="hero-search" action="cauta.html" method="get" role="search">
              <label class="sr-only" for="homeSearch">Caută după rețetă sau ingredient</label>
              <input id="homeSearch" name="q" type="search" placeholder="Caută după rețetă sau ingredient" autocomplete="off">
              <button class="btn" type="submit">Caută</button>
            </form>
          </div>
        </section>

        <section class="section compact">
          <div class="section-head">
            <div>
              <p class="eyebrow">Categorii</p>
              <h2>Alege după poftă</h2>
            </div>
          </div>
          <div id="categoryGrid" class="grid categories"></div>
        </section>

        <section class="section">
          <div class="section-head">
            <div>
              <p class="eyebrow">Rețete</p>
              <h2>Rețete pentru acasă</h2>
            </div>
          </div>
          <div id="featuredRecipes" class="grid cards"></div>
        </section>
      </main>`,
  });
}

function categoriesIndexPage() {
  return page({
    title: 'Categorii',
    description: 'Toate categoriile și rețetele din Arta Gătitului.',
    main: `
      <main class="section" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Categorii</p>
          <h1>Toate categoriile</h1>
          <p>Răsfoiește rețetele după tipul mesei sau caută direct după ingredient.</p>
        </div>
        <div id="categoryGrid" class="grid categories"></div>

        <section class="subsection">
          <div class="section-head">
            <div>
              <p class="eyebrow">Index</p>
              <h2>Toate rețetele</h2>
            </div>
          </div>
          <div id="allRecipes" class="grid cards"></div>
        </section>
      </main>`,
  });
}

function searchPage() {
  return page({
    title: 'Caută rețete',
    description: 'Caută rețete după nume, categorie sau ingrediente.',
    main: `
      <main class="section" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Căutare</p>
          <h1>Caută rețete</h1>
          <p>Scrie un nume de rețetă, un ingredient sau alege o categorie.</p>
        </div>

        <section class="search-panel" aria-labelledby="searchPanelTitle">
          <div class="search-panel-head">
            <h2 id="searchPanelTitle">Găsește rapid ce vrei să gătești</h2>
            <p>Căutarea ignoră diacriticele, deci „galuste” găsește și „găluște”.</p>
          </div>
          <div class="search-row">
            <label class="field">
              <span>Caută după text</span>
              <input id="recipeSearchInput" type="search" placeholder="pui, cartofi, fasole, avocado..." autocomplete="off">
            </label>
            <label class="field">
              <span>Categorie</span>
              <select id="recipeCategoryFilter"></select>
            </label>
          </div>
        </section>

        <div id="recipeCount" class="count" aria-live="polite"></div>
        <div id="searchResults" class="grid cards"></div>
      </main>`,
  });
}

function categoryPage(category, root = '../../') {
  return page({
    title: category.name,
    description: category.description,
    root,
    bodyAttrs: `data-category-slug="${category.slug}"`,
    main: `
      <main class="section" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Categorie</p>
          <h1 id="categoryTitle">${escapeHtml(category.name)}</h1>
          <p id="categoryDescription">${escapeHtml(category.description)}</p>
        </div>
        <div id="categoryRecipes" class="grid cards"></div>
      </main>`,
  });
}

function recipePage(recipe, root = '../../', slugOverride = recipe.slug) {
  return page({
    title: recipe.name,
    description: recipe.description,
    root,
    bodyAttrs: `data-recipe-slug="${slugOverride}"`,
    main: `
      <main class="section" id="main-content">
        <div id="recipeDetail"></div>
      </main>`,
  });
}

function portfolioPage() {
  return page({
    title: 'Portofoliu',
    description: 'Portofoliul de rețete Arta Gătitului.',
    root: '../',
    main: `
      <main class="section" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Portofoliu</p>
          <h1>Portofoliu</h1>
          <p>Vezi colecția de categorii și intră rapid în rețetele deja migrate.</p>
        </div>
        <div id="categoryGrid" class="grid categories"></div>
      </main>`,
  });
}

function randomizerPage() {
  return page({
    title: 'Randomizer',
    description: 'Generator aleatoriu de meniu complet.',
    root: '../',
    main: `
      <main class="section randomizer-page" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Randomizer</p>
          <h1>Generator meniu complet</h1>
          <p>Nu știi ce să gătești? Lasă site-ul să aleagă câte ceva pentru mic dejun, masă principală, desert și gustări.</p>
        </div>
        <section class="randomizer-panel" aria-live="polite">
          <button class="btn" type="button" id="randomRecipeButton">Generează meniul</button>
          <div id="randomRecipeResult" class="random-result"></div>
        </section>
      </main>`,
  });
}

function soonPage(section) {
  const lines = section.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n          ');
  return page({
    title: 'SOON TO COME...',
    description: 'Noi rețete apar periodic pe site.',
    root: '../',
    main: `
      <main class="section" id="main-content">
        <div class="soon-card">
          ${lines}
          <a class="btn" href="../randomizer/">Alege o rețetă aleatorie</a>
        </div>
      </main>`,
  });
}

function cssFile() {
  return `:root {
  --color-bg: #0f1117;
  --color-bg-soft: #151924;
  --color-surface: #181d29;
  --color-surface-alt: #202638;
  --color-text: #fff3e8;
  --color-text-muted: #d4bba8;
  --color-primary: #ff8a5b;
  --color-primary-hover: #ffb088;
  --color-primary-soft: rgba(255, 138, 91, .16);
  --color-secondary: #62d6a8;
  --color-secondary-hover: #8ff0c8;
  --color-border: rgba(255, 214, 186, .18);
  --color-focus: #ffd166;
  --shadow-card: 0 22px 60px rgba(0, 0, 0, .42);
  --shadow-soft: 0 14px 38px rgba(0, 0, 0, .28);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 8px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;
  --space-8: 64px;
  --container: 1180px;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  margin: 0;
  min-width: 320px;
  font-family: "Source Sans 3", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  font-size: 1rem;
  line-height: 1.6;
  color: var(--color-text);
  background: var(--color-bg);
}

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background:
    linear-gradient(120deg, rgba(255, 138, 91, .13), transparent 36%, rgba(98, 214, 168, .1)),
    linear-gradient(180deg, rgba(15, 17, 23, .95), rgba(15, 17, 23, .995)),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, .025) 0, rgba(255, 255, 255, .025) 1px, transparent 1px, transparent 58px);
  background-size: 180% 180%, auto, auto;
  animation: ambientShift 18s ease-in-out infinite alternate;
}

@keyframes ambientShift {
  from {
    background-position: 0% 0%, 0 0, 0 0;
  }

  to {
    background-position: 100% 18%, 0 0, 24px 0;
  }
}

a {
  color: var(--color-primary);
}

img,
svg {
  display: block;
  max-width: 100%;
}

h1,
h2,
h3 {
  margin: 0;
  font-family: Cinzel, Georgia, serif;
  font-weight: 700;
  line-height: 1.14;
  letter-spacing: 0;
  color: var(--color-text);
}

h1 {
  font-size: 3.6rem;
}

h2 {
  font-size: 2rem;
}

h3 {
  font-size: 1.24rem;
}

p {
  margin: 0;
}

:focus-visible {
  outline: 3px solid var(--color-focus);
  outline-offset: 3px;
}

::selection {
  color: #fff;
  background: var(--color-primary);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.skip-link {
  position: fixed;
  top: var(--space-3);
  left: var(--space-3);
  z-index: 100;
  transform: translateY(-160%);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  background: var(--color-text);
  color: #fff;
  text-decoration: none;
  font-weight: 800;
}

.skip-link:focus {
  transform: translateY(0);
}

.site-header {
  position: sticky;
  top: 0;
  z-index: 20;
  border-bottom: 1px solid var(--color-border);
  background: rgba(15, 17, 23, .86);
  box-shadow: 0 12px 34px rgba(0, 0, 0, .18);
  backdrop-filter: blur(14px);
}

.nav-wrap {
  width: min(1360px, 100%);
  margin: 0 auto;
  padding: var(--space-3) var(--space-4);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  position: relative;
}

.logo {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--color-text);
  text-decoration: none;
  font-family: Cinzel, Georgia, serif;
  font-size: 1.05rem;
  font-weight: 700;
  white-space: nowrap;
}

.logo-mark {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #1a100c;
  font-family: "Source Sans 3", system-ui, sans-serif;
  font-size: .82rem;
  font-weight: 900;
}

.nav-primary {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--space-1);
  overflow-x: visible;
}

.nav-primary a,
.nav-links a {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  text-decoration: none;
  font-size: .96rem;
  font-weight: 800;
  white-space: nowrap;
  transition: background-color .16s ease, color .16s ease, transform .16s ease;
}

.nav-links a:hover,
.nav-links a.active,
.nav-primary a:hover,
.nav-primary a.active {
  color: var(--color-primary-hover);
  background: var(--color-primary-soft);
}

.nav-links a.active,
.nav-primary a.active {
  box-shadow: inset 0 -3px 0 var(--color-primary);
}

.nav-links a:hover,
.nav-primary a:hover {
  transform: translateY(-1px);
}

.nav-links {
  display: none;
  position: absolute;
  top: calc(100% + var(--space-2));
  right: var(--space-4);
  z-index: 30;
  width: min(300px, calc(100vw - 32px));
  max-height: calc(100vh - 92px);
  overflow: auto;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: rgba(24, 29, 41, .98);
  box-shadow: var(--shadow-card);
  flex-direction: column;
  align-items: stretch;
}

.nav-links.open {
  display: flex;
}

.mobile-menu-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  margin-left: 0;
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  padding: var(--space-2) var(--space-4);
  font: inherit;
  font-weight: 900;
  cursor: pointer;
}

.hero {
  min-height: 500px;
  display: flex;
  align-items: center;
  color: #fff;
  background-image: linear-gradient(90deg, rgba(15, 17, 23, .92), rgba(15, 17, 23, .54)), url('${HERO_IMAGE}');
  background-size: cover;
  background-position: center;
}

.hero-inner {
  width: min(var(--container), 100%);
  margin: 0 auto;
  padding: var(--space-8) var(--space-4);
}

.hero h1 {
  max-width: 760px;
  color: #fff;
  font-size: 4.7rem;
}

.lead {
  max-width: 670px;
  margin-top: var(--space-4);
  color: var(--color-text-muted);
  font-size: 1.14rem;
}

.hero .lead {
  color: rgba(255, 255, 255, .93);
  font-size: 1.24rem;
}

.eyebrow {
  margin-bottom: var(--space-2);
  color: var(--color-primary);
  text-transform: uppercase;
  font-size: .82rem;
  font-weight: 900;
  letter-spacing: 0;
}

.hero .eyebrow {
  color: #ffd7b7;
}

.hero-search {
  width: min(720px, 100%);
  margin-top: var(--space-6);
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-3);
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(24, 29, 41, .72);
  box-shadow: 0 18px 46px rgba(0, 0, 0, .24);
}

.hero-search input {
  min-height: 54px;
  border-color: transparent;
  box-shadow: none;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  min-width: 44px;
  padding: 11px var(--space-4);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: var(--color-primary);
  color: #1a100c;
  text-decoration: none;
  font: inherit;
  font-weight: 900;
  line-height: 1.2;
  cursor: pointer;
  transition: background-color .16s ease, border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease;
}

.btn:disabled {
  cursor: not-allowed;
  opacity: .64;
}

.btn:hover {
  border-color: var(--color-primary-hover);
  background: var(--color-primary-hover);
  color: #1a100c;
}

.btn:active {
  transform: translateY(1px);
}

.btn.light {
  border-color: rgba(255, 255, 255, .32);
  background: rgba(255, 255, 255, .12);
  color: #fff;
}

.btn.ghost {
  border-color: rgba(255, 255, 255, .72);
  background: transparent;
  color: #fff;
}

.btn.ghost:hover {
  border-color: #fff;
  background: rgba(255, 255, 255, .14);
}

.btn.secondary {
  border-color: var(--color-border);
  background: var(--color-surface);
  color: var(--color-primary-hover);
}

.btn.secondary:hover {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
}

.text-link {
  color: var(--color-primary);
  font-weight: 900;
  text-decoration-thickness: 2px;
  text-underline-offset: 4px;
}

.section {
  width: min(var(--container), 100%);
  margin: 0 auto;
  padding: var(--space-7) var(--space-4);
}

.section.compact {
  padding-top: var(--space-6);
}

.subsection {
  margin-top: var(--space-7);
}

.section-head {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: var(--space-5);
  margin-bottom: var(--space-5);
}

.page-title {
  max-width: 820px;
  margin-bottom: var(--space-6);
}

.page-title p:not(.eyebrow),
#categoryDescription {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
  font-size: 1.14rem;
}

.grid {
  display: grid;
  gap: var(--space-4);
}

.grid.cards {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.grid.categories {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.card,
.category-card,
.recipe-detail-card,
.search-panel,
.randomizer-panel,
.soon-card,
.box,
.steak-calculator {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(10px);
}

.card {
  position: relative;
  min-height: 100%;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  color: var(--color-text);
  text-decoration: none;
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease;
}

.card::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(255, 138, 91, .18), transparent 38%, rgba(98, 214, 168, .12));
  opacity: .72;
}

.card::after {
  content: "";
  position: absolute;
  inset: -40% -80%;
  pointer-events: none;
  background: linear-gradient(105deg, transparent 38%, rgba(255, 255, 255, .12), transparent 62%);
  transform: translateX(-28%);
  opacity: 0;
  transition: transform .45s ease, opacity .2s ease;
}

.card > * {
  position: relative;
  z-index: 1;
}

.card h3 {
  margin-top: var(--space-3);
}

.card p {
  margin: var(--space-3) 0 var(--space-4);
  color: var(--color-text-muted);
}

.category-pill,
.pill {
  width: fit-content;
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
  font-size: .86rem;
  font-weight: 900;
}

.ingredients-preview {
  margin-bottom: var(--space-5);
  color: var(--color-text-muted);
  font-size: .98rem;
}

.recipe-card {
  cursor: pointer;
}

.recipe-card .ingredients-preview {
  margin-top: auto;
}

.category-card {
  position: relative;
  min-height: 158px;
  padding: var(--space-5);
  color: var(--color-text);
  text-decoration: none;
  overflow: hidden;
  transition: transform .2s ease, box-shadow .2s ease, border-color .2s ease, background-color .2s ease;
}

.category-card::after {
  content: "";
  position: absolute;
  right: var(--space-4);
  bottom: var(--space-4);
  width: 46px;
  height: 5px;
  border-radius: 999px;
  background: var(--color-primary);
}

.category-card:nth-child(2n)::after {
  background: var(--color-secondary);
}

.category-card:nth-child(3n)::after {
  background: #b97818;
}

.category-card strong {
  display: block;
  margin-bottom: var(--space-2);
  font-family: Cinzel, Georgia, serif;
  font-size: 1.16rem;
}

.category-card span {
  color: var(--color-text-muted);
  font-size: .98rem;
}

.category-card:hover,
.category-card:focus-visible,
.card:hover,
.card:focus-visible {
  box-shadow: var(--shadow-card);
  transform: translateY(-4px);
  border-color: rgba(255, 138, 91, .42);
}

.card:hover::after,
.card:focus-visible::after {
  transform: translateX(28%);
  opacity: 1;
}

.search-panel {
  margin-bottom: var(--space-5);
  padding: var(--space-5);
  background: var(--color-surface);
}

.search-panel-head {
  max-width: 720px;
  margin-bottom: var(--space-5);
}

.search-panel-head h2 {
  font-size: 1.55rem;
}

.search-panel-head p {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.search-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 260px;
  gap: var(--space-4);
  align-items: end;
}

.field {
  display: grid;
  gap: var(--space-2);
  color: var(--color-text);
  font-weight: 900;
}

input,
select {
  width: 100%;
  min-height: 50px;
  border: 2px solid rgba(255, 214, 186, .28);
  border-radius: var(--radius-sm);
  background: #111620;
  color: var(--color-text);
  padding: 12px 14px;
  font: inherit;
  outline: none;
}

input::placeholder {
  color: #b99f8f;
  opacity: 1;
}

input:hover,
select:hover {
  border-color: var(--color-primary);
}

input:focus,
select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 4px rgba(159, 63, 34, .18);
}

.count {
  margin: var(--space-4) 0 var(--space-5);
  color: var(--color-primary-hover);
  font-weight: 900;
}

.empty {
  padding: var(--space-5);
  border: 2px dashed rgba(255, 214, 186, .32);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text-muted);
  text-align: center;
}

.recipe-detail-card {
  padding: var(--space-6);
}

.recipe-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-5);
  align-items: start;
  padding-bottom: var(--space-5);
  border-bottom: 1px solid var(--color-border);
}

.recipe-hero h1 {
  margin-top: var(--space-3);
  font-size: 3rem;
}

.recipe-hero .lead {
  color: var(--color-text-muted);
}

.detail-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: var(--space-3);
}

.recipe-layout {
  display: grid;
  grid-template-columns: .85fr 1.15fr;
  gap: var(--space-5);
  margin-top: var(--space-5);
}

.box {
  padding: var(--space-5);
  background: var(--color-surface-alt);
  box-shadow: none;
}

.box h2 {
  font-size: 1.5rem;
}

ul.clean,
ol.clean {
  margin: var(--space-4) 0 0;
  padding-left: 22px;
}

ul.clean li,
ol.clean li {
  margin: var(--space-2) 0;
}

.subhead {
  list-style: none;
  margin-left: -22px;
  color: var(--color-primary-hover);
  font-weight: 900;
}

.closing {
  margin-top: var(--space-5);
  color: var(--color-primary-hover);
  font-weight: 900;
}

.related {
  margin-top: var(--space-6);
}

.related h2 {
  margin-bottom: var(--space-4);
}

.randomizer-panel,
.soon-card {
  padding: var(--space-5);
}

.randomizer-panel {
  position: relative;
  overflow: hidden;
}

.randomizer-panel::before {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 138, 91, .12), transparent 44%),
    linear-gradient(315deg, rgba(98, 214, 168, .1), transparent 38%);
  opacity: .9;
}

.randomizer-panel > * {
  position: relative;
}

.random-result {
  margin-top: var(--space-5);
}

.meal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--space-4);
}

.meal-slot {
  display: grid;
  gap: var(--space-3);
}

.meal-slot-title {
  color: var(--color-primary-hover);
  font-family: "Source Sans 3", system-ui, sans-serif;
  font-size: .92rem;
  font-weight: 900;
  text-transform: uppercase;
}

.meal-empty {
  min-height: 100%;
  text-align: left;
}

.soon-card {
  max-width: 760px;
}

.soon-card p {
  margin: var(--space-2) 0;
  color: var(--color-text-muted);
}

.soon-card .btn {
  margin-top: var(--space-4);
}

.steak-calculator {
  margin-top: var(--space-5);
  padding: var(--space-5);
  background: var(--color-surface-alt);
  box-shadow: none;
}

.steak-calculator > p {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.steak-form {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
  margin-top: var(--space-5);
}

.steak-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.steak-result {
  margin-top: var(--space-5);
  padding: var(--space-5);
  border: 1px solid rgba(255, 214, 186, .16);
  border-radius: var(--radius-lg);
  background: rgba(15, 17, 23, .52);
}

.steak-result-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
}

.steak-metric {
  padding: var(--space-3);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, .045);
}

.steak-metric span {
  display: block;
  color: var(--color-text-muted);
  font-size: .9rem;
  font-weight: 800;
}

.steak-metric strong {
  display: block;
  margin-top: var(--space-1);
  color: var(--color-text);
  font-size: 1.2rem;
}

.steak-note {
  margin-top: var(--space-4);
  color: var(--color-text-muted);
}

.steak-timer {
  display: grid;
  grid-template-columns: minmax(150px, auto) minmax(0, 1fr);
  gap: var(--space-4);
  align-items: center;
  margin-top: var(--space-5);
}

.timer-display {
  padding: var(--space-3) var(--space-4);
  border: 1px solid rgba(255, 214, 186, .18);
  border-radius: var(--radius-md);
  background: #0f1117;
  color: var(--color-primary-hover);
  font-size: 2rem;
  font-weight: 900;
  text-align: center;
}

.timer-status {
  color: var(--color-text-muted);
  font-weight: 800;
}

.steak-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-4);
}

.steak-chip {
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
}

.steak-chip strong {
  display: block;
}

.footer {
  margin-top: var(--space-6);
  padding: var(--space-6) var(--space-4);
  border-top: 1px solid var(--color-border);
  color: var(--color-text-muted);
  text-align: center;
}

.footer p + p {
  margin-top: var(--space-2);
}

.footer a {
  color: var(--color-primary-hover);
  font-weight: 900;
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: .01ms !important;
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
  }
}

@media (max-width: 1040px) {
  h1 {
    font-size: 3rem;
  }

  .hero h1 {
    font-size: 3.8rem;
  }

  .grid.cards,
  .grid.categories {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .recipe-layout,
  .recipe-hero,
  .search-row,
  .steak-form,
  .steak-result-grid,
  .steak-timer,
  .steak-grid {
    grid-template-columns: 1fr;
  }

  .detail-meta {
    justify-content: start;
  }
}

@media (max-width: 1280px) {
  .nav-wrap {
    padding: var(--space-3);
  }

  .mobile-menu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .nav-links {
    display: none;
    position: absolute;
    top: 66px;
    left: var(--space-3);
    right: var(--space-3);
    max-height: calc(100vh - 86px);
    overflow: auto;
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    box-shadow: var(--shadow-card);
    flex-direction: column;
    align-items: stretch;
  }

  .nav-links.open {
    display: flex;
  }

  .nav-links a {
    min-height: 44px;
  }
}

@media (max-width: 760px) {
  h1 {
    font-size: 2.28rem;
  }

  h2 {
    font-size: 1.6rem;
  }

  h3 {
    font-size: 1.12rem;
  }

  .nav-wrap {
    flex-wrap: wrap;
  }

  .nav-primary {
    order: 3;
    width: 100%;
    margin-left: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--space-1);
  }

  .nav-primary a {
    justify-content: center;
    min-height: 42px;
    padding: var(--space-2);
    font-size: .9rem;
  }

  .hero {
    min-height: 450px;
  }

  .hero-inner {
    padding: var(--space-7) var(--space-4);
  }

  .hero h1 {
    font-size: 2.68rem;
  }

  .hero-search {
    grid-template-columns: 1fr;
  }

  .hero-search .btn {
    width: 100%;
  }

  .grid.cards,
  .grid.categories {
    grid-template-columns: 1fr;
  }

  .section {
    padding: var(--space-6) var(--space-4);
  }

  .section-head {
    display: block;
  }

  .section-head .text-link {
    display: inline-flex;
    margin-top: var(--space-3);
  }

  .card,
  .category-card,
  .recipe-detail-card,
  .search-panel,
  .randomizer-panel,
  .soon-card,
  .steak-calculator,
  .box {
    padding: var(--space-4);
  }
}

@media (max-width: 380px) {
  body {
    font-size: .98rem;
  }

  h1,
  .hero h1 {
    font-size: 2.16rem;
  }

  .logo span:last-child {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}
`;
}

function jsFile() {
  return `(function () {
  const root = window.ARTA_ROOT || "";
  const data = window.ARTA_DATA || { categories: [], recipes: [], aliases: {} };

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function recipeUrl(slug) {
    return root + "retete/" + slug + "/";
  }

  function categoryUrl(slug) {
    return root + slug + "/";
  }

  function categorySlug(name) {
    const category = data.categories.find((item) => item.name === name);
    return category ? category.slug : normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function recipeBySlug(slug) {
    const resolved = data.aliases && data.aliases[slug] ? data.aliases[slug] : slug;
    return data.recipes.find((recipe) => recipe.slug === resolved);
  }

  function isSubheading(line) {
    return /:$/.test(line) || /^[A-ZĂÂÎȘȚ0-9\\s/-]{3,}$/.test(line);
  }

  function searchableRecipeText(recipe) {
    return normalize([
      recipe.name,
      recipe.category,
      recipe.description,
      (recipe.ingredients || []).join(" "),
      (recipe.preparation || []).join(" "),
      (recipe.keywords || []).join(" ")
    ].join(" "));
  }

  function card(recipe) {
    const ingredients = (recipe.ingredients || []).filter((line) => !isSubheading(line)).slice(0, 5).join(", ");
    const titleId = "recipe-card-" + recipe.slug;
    return \`
      <a class="card recipe-card" aria-labelledby="\${titleId}" href="\${recipeUrl(recipe.slug)}">
        <span class="category-pill">\${escapeHtml(recipe.category)}</span>
        <h3 id="\${titleId}">\${escapeHtml(recipe.name)}</h3>
        <p>\${escapeHtml(recipe.description || "")}</p>
        <div class="ingredients-preview"><strong>Ingrediente:</strong> \${escapeHtml(ingredients)}\${recipe.ingredients && recipe.ingredients.length > 5 ? "..." : ""}</div>
      </a>
    \`;
  }

  function renderRecipeCards(elementId, recipes) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = recipes.length ? recipes.map(card).join("") : '<div class="empty">Nu există rețete de afișat încă.</div>';
  }

  function renderFeatured() {
    renderRecipeCards("featuredRecipes", data.recipes.slice(0, 9));
  }

  function renderAllRecipes() {
    renderRecipeCards("allRecipes", data.recipes);
  }

  function renderCategories() {
    const el = document.getElementById("categoryGrid");
    if (!el) return;
    el.innerHTML = data.categories.map((category) => {
      const count = data.recipes.filter((recipe) => recipe.category === category.name).length;
      const countLabel = count === 1 ? "1 rețetă" : count + " rețete";
      return \`
        <a class="category-card" href="\${categoryUrl(category.slug)}">
          <strong>\${escapeHtml(category.name)}</strong>
          <span>\${escapeHtml(category.description)}<br>\${count ? countLabel : "urmează rețete noi"}</span>
        </a>
      \`;
    }).join("");
  }

  function setupSearch() {
    const input = document.getElementById("recipeSearchInput");
    const category = document.getElementById("recipeCategoryFilter");
    const count = document.getElementById("recipeCount");
    const results = document.getElementById("searchResults");
    if (!input || !category || !results) return;

    category.innerHTML = '<option value="all">Toate categoriile</option>' + data.categories.map((item) => \`<option value="\${escapeHtml(item.name)}">\${escapeHtml(item.name)}</option>\`).join("");
    if (!category.value) category.value = "all";

    function run() {
      const terms = normalize(input.value).split(/\\s+/).filter(Boolean);
      const selected = category.value;
      const matches = data.recipes.filter((recipe) => {
        if (selected !== "all" && recipe.category !== selected) return false;
        const haystack = searchableRecipeText(recipe);
        return terms.every((term) => haystack.includes(term));
      });

      count.textContent = matches.length === 1 ? "1 rețetă găsită" : \`\${matches.length} rețete găsite\`;
      results.innerHTML = matches.length ? matches.map(card).join("") : '<div class="empty">Nu am găsit nicio rețetă. Încearcă un ingredient, o categorie sau mai puține cuvinte.</div>';
    }

    input.addEventListener("input", run);
    category.addEventListener("change", run);
    run();
  }

  function setupPrefilledSearch() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const input = document.getElementById("recipeSearchInput");
    if (q && input) {
      input.value = q;
      input.dispatchEvent(new Event("input"));
    }
  }

  function renderList(lines, ordered) {
    const tag = ordered ? "ol" : "ul";
    const items = (lines || []).map((line) => {
      const cls = isSubheading(line) ? ' class="subhead"' : "";
      return \`<li\${cls}>\${escapeHtml(line)}</li>\`;
    }).join("");
    return \`<\${tag} class="clean">\${items}</\${tag}>\`;
  }

  function steakCalculator(extra) {
    if (!extra || extra.type !== "steak-calculator") return "";
    return \`
      <section class="steak-calculator" data-steak-calculator>
        <h2>\${escapeHtml(extra.title)}</h2>
        <p>Completează detaliile bucății de carne, tipul de tigaie și nivelul de foc pentru o estimare practică de gătire.</p>
        <div class="steak-form">
          <label class="field">
            <span>Greutate</span>
            <input data-steak-weight type="number" min="120" max="1200" step="10" value="300" inputmode="numeric">
          </label>
          <label class="field">
            <span>Grosime</span>
            <input data-steak-thickness type="number" min="1" max="7" step="0.1" value="3" inputmode="decimal">
          </label>
          <label class="field">
            <span>Gătire dorită</span>
            <select data-steak-doneness>
              <option value="rare">Rare</option>
              <option value="medium-rare" selected>Medium rare</option>
              <option value="medium">Medium</option>
              <option value="medium-well">Medium well</option>
              <option value="well-done">Well done</option>
            </select>
          </label>
          <label class="field">
            <span>Temperatura cărnii</span>
            <select data-steak-start>
              <option value="fridge">Direct din frigider</option>
              <option value="room" selected>La temperatura camerei</option>
            </select>
          </label>
          <label class="field">
            <span>Tigaie</span>
            <select data-steak-pan>
              <option value="steel">Tigaie de oțel</option>
              <option value="cast-iron" selected>Tigaie de fontă</option>
              <option value="aluminum">Tigaie de aluminiu</option>
              <option value="stainless">Tigaie de inox</option>
            </select>
          </label>
          <label class="field">
            <span>Nivel foc</span>
            <select data-steak-heat>
              <option value="low">Mic</option>
              <option value="low-medium">Mic-mediu</option>
              <option value="medium">Mediu</option>
              <option value="medium-high" selected>Mediu-mare</option>
              <option value="high">Mare</option>
            </select>
          </label>
        </div>
        <div class="steak-result" data-steak-result></div>
        <div class="steak-actions">
          <button class="btn" type="button" data-steak-start-timer>Pornește timer</button>
          <button class="btn secondary" type="button" data-steak-pause-timer>Pauză</button>
          <button class="btn secondary" type="button" data-steak-reset-timer>Reset</button>
        </div>
        <div class="steak-timer" aria-live="polite">
          <div class="timer-display" data-steak-time>00:00</div>
          <div class="timer-status" data-steak-status>Timerul va suna când trebuie întors steak-ul și când este gata.</div>
        </div>
        <div class="steak-grid">
          <div class="steak-chip"><strong>Rare</strong><span>50-52°C</span></div>
          <div class="steak-chip"><strong>Medium rare</strong><span>55-57°C</span></div>
          <div class="steak-chip"><strong>Medium</strong><span>60-63°C</span></div>
          <div class="steak-chip"><strong>Well done</strong><span>70°C+</span></div>
        </div>
      </section>
    \`;
  }

  function renderRecipeDetail() {
    const el = document.getElementById("recipeDetail");
    if (!el) return;
    const slug = document.body.dataset.recipeSlug;
    const recipe = recipeBySlug(slug);
    if (!recipe) {
      el.innerHTML = '<div class="empty">Rețeta nu a fost găsită.</div>';
      return;
    }

    document.title = recipe.name + " | Arta Gătitului";
    const catSlug = categorySlug(recipe.category);
    const related = data.recipes
      .filter((item) => item.category === recipe.category && item.slug !== recipe.slug)
      .slice(0, 3);

    el.innerHTML = \`
      <article class="recipe-detail-card">
        <div class="recipe-hero">
          <div>
            <span class="pill">\${escapeHtml(recipe.category)}</span>
            <h1>\${escapeHtml(recipe.name)}</h1>
            <p class="lead">\${escapeHtml(recipe.description || "")}</p>
          </div>
          <div class="detail-meta">
            <a class="btn secondary" href="\${categoryUrl(catSlug)}">Înapoi la categorie</a>
          </div>
        </div>
        <div class="recipe-layout">
          <section class="box">
            <h2>Ingrediente</h2>
            \${renderList(recipe.ingredients || [], false)}
          </section>
          <section class="box">
            <h2>Mod de preparare</h2>
            \${renderList(recipe.preparation || [], true)}
            \${recipe.closing ? \`<p class="closing">\${escapeHtml(recipe.closing)}</p>\` : ""}
          </section>
        </div>
        \${(recipe.extras || []).map(steakCalculator).join("")}
      </article>
      \${related.length ? \`<section class="related"><h2>Din aceeași categorie</h2><div class="grid cards">\${related.map(card).join("")}</div></section>\` : ""}
    \`;
  }

  function renderCategoryPage() {
    const title = document.getElementById("categoryTitle");
    const desc = document.getElementById("categoryDescription");
    const list = document.getElementById("categoryRecipes");
    if (!title || !list) return;

    const slug = document.body.dataset.categorySlug;
    const category = data.categories.find((item) => item.slug === slug);
    if (!category) {
      title.textContent = "Categorie negăsită";
      list.innerHTML = '<div class="empty">Această categorie nu există.</div>';
      return;
    }

    document.title = category.name + " | Arta Gătitului";
    title.textContent = category.name;
    if (desc) desc.textContent = category.description;
    renderRecipeCards("categoryRecipes", data.recipes.filter((recipe) => recipe.category === category.name));
  }

  function pickRandom(items) {
    return items[Math.floor(Math.random() * items.length)];
  }

  function mealCard(slot) {
    const recipes = data.recipes.filter((recipe) => recipe.category === slot.category);
    const recipe = pickRandom(recipes);
    return \`
      <section class="meal-slot">
        <h2 class="meal-slot-title">\${escapeHtml(slot.label)}</h2>
        \${recipe ? card(recipe) : \`<div class="empty meal-empty">Încă nu există rețete în categoria \${escapeHtml(slot.category)}.</div>\`}
      </section>
    \`;
  }

  function setupRandomizer() {
    const button = document.getElementById("randomRecipeButton");
    const result = document.getElementById("randomRecipeResult");
    if (!button || !result) return;

    const slots = [
      { label: "Mic dejun", category: "Mic dejun" },
      { label: "Fel principal", category: "Fel principal" },
      { label: "Fel secundar", category: "Fel secundar" },
      { label: "Desert", category: "Desert" },
      { label: "Băutură", category: "Băuturi" },
      { label: "Salată", category: "Salate" },
      { label: "Rontaieli", category: "Rontaieli" }
    ];

    function choose() {
      result.innerHTML = data.recipes.length
        ? \`<div class="meal-grid">\${slots.map(mealCard).join("")}</div>\`
        : '<div class="empty">Nu există încă rețete pentru randomizer.</div>';
    }

    button.addEventListener("click", choose);
    choose();
  }

  function setupSteakCalculators() {
    document.querySelectorAll("[data-steak-calculator]").forEach((calculator) => {
      const fields = {
        weight: calculator.querySelector("[data-steak-weight]"),
        thickness: calculator.querySelector("[data-steak-thickness]"),
        doneness: calculator.querySelector("[data-steak-doneness]"),
        start: calculator.querySelector("[data-steak-start]"),
        pan: calculator.querySelector("[data-steak-pan]"),
        heat: calculator.querySelector("[data-steak-heat]")
      };
      const result = calculator.querySelector("[data-steak-result]");
      const time = calculator.querySelector("[data-steak-time]");
      const status = calculator.querySelector("[data-steak-status]");
      const startButton = calculator.querySelector("[data-steak-start-timer]");
      const pauseButton = calculator.querySelector("[data-steak-pause-timer]");
      const resetButton = calculator.querySelector("[data-steak-reset-timer]");
      if (!result || !time || !status || !startButton || !pauseButton || !resetButton) return;

      const doneness = {
        rare: { label: "Rare", temp: "50-52°C", adjust: -18, rest: 5 },
        "medium-rare": { label: "Medium rare", temp: "55-57°C", adjust: 0, rest: 6 },
        medium: { label: "Medium", temp: "60-63°C", adjust: 18, rest: 7 },
        "medium-well": { label: "Medium well", temp: "65-68°C", adjust: 34, rest: 8 },
        "well-done": { label: "Well done", temp: "70°C+", adjust: 52, rest: 8 }
      };
      const pans = {
        steel: { label: "tigaie de oțel", factor: 1, advice: "Încălzește tigaia bine înainte de carne" },
        "cast-iron": { label: "tigaie de fontă", factor: .92, advice: "Ține căldura foarte bine, deci focul mediu-mare este de obicei suficient" },
        aluminum: { label: "tigaie de aluminiu", factor: 1.08, advice: "Răspunde rapid la schimbări, dar pierde căldură mai ușor" },
        stainless: { label: "tigaie de inox", factor: 1.03, advice: "Preîncălzește până când o picătură de apă alunecă pe suprafață" }
      };
      const heats = {
        low: { label: "mic", factor: 1.35 },
        "low-medium": { label: "mic-mediu", factor: 1.18 },
        medium: { label: "mediu", factor: 1 },
        "medium-high": { label: "mediu-mare", factor: .88 },
        high: { label: "mare", factor: .78 }
      };
      const starts = {
        fridge: { label: "direct din frigider", factor: 1.12 },
        room: { label: "la temperatura camerei", factor: .94 }
      };

      let timer = null;
      let plan = null;
      let remaining = 0;
      let flipped = false;

      function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
      }

      function readNumber(input, fallback, min, max) {
        const value = Number(input && input.value);
        return clamp(Number.isFinite(value) ? value : fallback, min, max);
      }

      function formatSeconds(seconds) {
        const safe = Math.max(0, Math.round(seconds));
        const minutes = Math.floor(safe / 60);
        const rest = safe % 60;
        return \`\${String(minutes).padStart(2, "0")}:\${String(rest).padStart(2, "0")}\`;
      }

      function beep() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return;
        const context = new Context();
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(.001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(.22, context.currentTime + .03);
        gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .42);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + .45);
      }

      function calculate() {
        const weight = readNumber(fields.weight, 300, 120, 1200);
        const thickness = readNumber(fields.thickness, 3, 1, 7);
        const target = doneness[fields.doneness.value] || doneness["medium-rare"];
        const pan = pans[fields.pan.value] || pans["cast-iron"];
        const heat = heats[fields.heat.value] || heats["medium-high"];
        const start = starts[fields.start.value] || starts.room;
        const weightBoost = Math.max(0, weight - 250) * .055;
        const rawSide = (thickness * 72 + weightBoost + target.adjust) * pan.factor * heat.factor * start.factor;
        const sideSeconds = Math.round(clamp(rawSide, 70, 480) / 5) * 5;
        const totalSeconds = sideSeconds * 2;
        return { weight, thickness, target, pan, heat, start, sideSeconds, totalSeconds };
      }

      function renderPlan() {
        plan = calculate();
        result.innerHTML = \`
          <div class="steak-result-grid">
            <div class="steak-metric"><span>Pe fiecare parte</span><strong>\${formatSeconds(plan.sideSeconds)}</strong></div>
            <div class="steak-metric"><span>Total în tigaie</span><strong>\${formatSeconds(plan.totalSeconds)}</strong></div>
            <div class="steak-metric"><span>Temperatură țintă</span><strong>\${plan.target.temp}</strong></div>
            <div class="steak-metric"><span>Odihnă</span><strong>\${plan.target.rest} min</strong></div>
          </div>
          <p class="steak-note">Pentru \${plan.weight} g și \${plan.thickness} cm, gătește pe foc \${plan.heat.label} într-o \${plan.pan.label}. \${plan.pan.advice}. Întoarce steak-ul după \${formatSeconds(plan.sideSeconds)}. Folosește un termometru pentru cea mai sigură verificare.</p>
        \`;
        resetTimer(false);
      }

      function updateTimer() {
        time.textContent = formatSeconds(remaining);
      }

      function stopTimer() {
        if (timer) window.clearInterval(timer);
        timer = null;
      }

      function resetTimer(updateStatus = true) {
        stopTimer();
        if (!plan) plan = calculate();
        remaining = plan.totalSeconds;
        flipped = false;
        updateTimer();
        if (updateStatus) status.textContent = "Timer resetat. Pornește când pui steak-ul în tigaie.";
      }

      function finishMessage(message) {
        status.textContent = message;
        beep();
      }

      function tick() {
        remaining -= 1;
        const elapsed = plan.totalSeconds - remaining;
        if (!flipped && elapsed >= plan.sideSeconds) {
          flipped = true;
          finishMessage("Întoarce steak-ul acum.");
        }
        if (remaining <= 0) {
          remaining = 0;
          updateTimer();
          stopTimer();
          finishMessage(\`Gata. Lasă steak-ul la odihnit \${plan.target.rest} minute.\`);
          return;
        }
        updateTimer();
      }

      Object.values(fields).forEach((field) => {
        field.addEventListener("input", renderPlan);
        field.addEventListener("change", renderPlan);
      });
      startButton.addEventListener("click", () => {
        if (!plan) renderPlan();
        if (remaining <= 0) resetTimer(false);
        if (timer) return;
        status.textContent = "Timer pornit. Vei auzi un semnal la întoarcere și la final.";
        timer = window.setInterval(tick, 1000);
      });
      pauseButton.addEventListener("click", () => {
        stopTimer();
        status.textContent = "Timer pus pe pauză.";
      });
      resetButton.addEventListener("click", () => resetTimer(true));

      renderPlan();
    });
  }

  function setupMobileMenu() {
    const btn = document.querySelector(".mobile-menu-btn");
    const links = document.querySelector(".nav-links");
    if (!btn || !links) return;

    function setOpen(open) {
      links.classList.toggle("open", open);
      btn.setAttribute("aria-expanded", String(open));
    }

    btn.addEventListener("click", () => {
      setOpen(!links.classList.contains("open"));
    });

    links.addEventListener("click", (event) => {
      if (event.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  }

  function markActiveNav() {
    const current = window.location.pathname.replace(/\\/index\\.html$/, "/");
    document.querySelectorAll(".nav-primary a, .nav-links a").forEach((link) => {
      const path = new URL(link.href).pathname.replace(/\\/index\\.html$/, "/");
      if (path === current) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupMobileMenu();
    markActiveNav();
    renderFeatured();
    renderAllRecipes();
    renderCategories();
    setupSearch();
    setupPrefilledSearch();
    renderRecipeDetail();
    renderCategoryPage();
    setupRandomizer();
    setupSteakCalculators();
  });
})();
`;
}

async function writeFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, contents, 'utf8');
}

async function main() {
  const inventory = JSON.parse(await fs.readFile(INVENTORY_PATH, 'utf8'));
  const markdown = await fs.readFile(RECIPES_MD_PATH, 'utf8');
  const sections = readRecipeSections(markdown);
  const soonSection = sections.find((section) => section.url.endsWith('/soon-to-come'));
  const categoryMap = buildCategoryMap(inventory);
  const recipes = mergeRecipes(sections.map(splitRecipe), categoryMap);
  const categories = Object.values(CATEGORY_PAGES);

  await writeFile(path.join(ROOT, 'assets', 'js', 'recipes.js'), dataFile(categories, recipes));
  await writeFile(path.join(ROOT, 'assets', 'js', 'site.js'), jsFile());
  await writeFile(path.join(ROOT, 'assets', 'css', 'style.css'), cssFile());

  await writeFile(path.join(ROOT, 'index.html'), homePage());
  await writeFile(path.join(ROOT, 'categorii.html'), categoriesIndexPage());
  await writeFile(path.join(ROOT, 'cauta.html'), searchPage());
  await writeFile(path.join(ROOT, 'portofoliu', 'index.html'), portfolioPage());
  await writeFile(path.join(ROOT, 'randomizer', 'index.html'), randomizerPage());
  if (soonSection) {
    await writeFile(path.join(ROOT, 'soon-to-come', 'index.html'), soonPage(soonSection));
  }

  for (const category of categories) {
    await writeFile(path.join(ROOT, 'categorie', category.slug, 'index.html'), categoryPage(category));
    await writeFile(path.join(ROOT, category.slug, 'index.html'), categoryPage(category, '../'));
  }

  const recipeBySlug = new Map(recipes.map((recipe) => [recipe.slug, recipe]));
  for (const recipe of recipes) {
    await writeFile(path.join(ROOT, 'retete', recipe.slug, 'index.html'), recipePage(recipe));
    await writeFile(path.join(ROOT, recipe.slug, 'index.html'), recipePage(recipe, '../'));
  }

  for (const [alias, target] of Object.entries(RECIPE_ALIASES)) {
    const recipe = recipeBySlug.get(target);
    if (recipe) {
      await writeFile(path.join(ROOT, 'retete', alias, 'index.html'), recipePage(recipe, '../../', alias));
      await writeFile(path.join(ROOT, alias, 'index.html'), recipePage(recipe, '../', alias));
    }
  }

  console.log(`Generated ${recipes.length} recipes, ${categories.length} categories, and ${Object.keys(RECIPE_ALIASES).length} aliases.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
