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
        description: fallback.description || makeDescription(fallback.name, fallback.preparation, fallback.ingredients),
        closing: fallback.closing || 'Poftă bună!',
        extras: fallback.extras || [],
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
      <p class="footer-tools"><a href="${root}adauga-reteta.html">Creator rețetă</a></p>
    </footer>`;
}

function page({ title, description, root = '', bodyAttrs = '', main }) {
  const documentTitle = title === SITE_NAME ? SITE_NAME : `${title} | ${SITE_NAME}`;
  return `<!doctype html>
<html lang="ro">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
          <button class="btn" type="button" id="randomRecipeButton">Generează alt meniu</button>
          <div id="randomRecipeResult" class="random-result"></div>
        </section>
      </main>`,
  });
}

function recipeBuilderPage() {
  return page({
    title: 'Adaugă rețetă',
    description: 'Creator vizual pentru rețete noi, cu previzualizare și export pentru proiect.',
    bodyAttrs: 'data-builder-page="true"',
    main: `
      <main class="section builder-page" id="main-content">
        <div class="page-title">
          <p class="eyebrow">Instrument owner</p>
          <h1>Adaugă rețetă</h1>
          <p>Această pagină te ajută să creezi o rețetă fără să scrii cod. Previzualizarea se actualizează automat, iar exportul rămâne compatibil cu site-ul static de pe GitHub Pages.</p>
        </div>

        <section class="builder-help" aria-labelledby="builderHelpTitle">
          <div class="builder-help-intro">
            <h2 id="builderHelpTitle">Cum adaugi o rețetă nouă</h2>
            <p>Această pagină te ajută să creezi vizual o rețetă și să exportezi datele potrivite pentru proiect. Ea nu publică singură rețeta online, deoarece site-ul este static și rulează pe GitHub Pages.</p>
          </div>

          <div class="builder-guide-grid">
            <article class="builder-guide-card">
              <h3>1. Completează rețeta</h3>
              <ol class="clean">
                <li>Scrie titlul rețetei.</li>
                <li>Alege categoria exactă din listă.</li>
                <li>Adaugă descrierea scurtă.</li>
                <li>Adaugă ingredientele și pașii de preparare.</li>
                <li>Verifică previzualizarea din dreapta.</li>
              </ol>
            </article>

            <article class="builder-guide-card">
              <h3>2. Ce înseamnă slug / link</h3>
              <p>Slug-ul este partea din link a rețetei. Se generează automat din titlu, fără diacritice, fără spații și cu litere mici.</p>
              <p><strong>Exemplu:</strong> „Supă de pui cu găluște” devine <code>supa-de-pui-cu-galuste</code>, iar pagina generată va fi <code>retete/supa-de-pui-cu-galuste/index.html</code>.</p>
            </article>

            <article class="builder-guide-card">
              <h3>3. Ce copiezi în proiect</h3>
              <p>Copiază obiectul exportat și lipește-l în <code>LOCAL_FALLBACK_RECIPES</code> din <code>build-static-site.mjs</code>, la finalul listei.</p>
              <p>Păstrează virgula dintre obiecte. Nu edita direct <code>assets/js/recipes.js</code> ca sursă principală, fiindcă generatorul îl rescrie.</p>
            </article>

            <article class="builder-guide-card">
              <h3>4. Publicare pe GitHub Pages</h3>
              <ol class="clean">
                <li>Salvează modificarea în <code>build-static-site.mjs</code>.</li>
                <li>Rulează <code>node build-static-site.mjs</code> pe calculatorul tău.</li>
                <li>Urcă pe GitHub fișierele schimbate, inclusiv <code>assets/js/recipes.js</code>, <code>retete/&lt;slug&gt;/index.html</code> și <code>&lt;slug&gt;/index.html</code>.</li>
                <li>Așteaptă redeploy-ul GitHub Pages, apoi testează rețeta pe site.</li>
              </ol>
            </article>

            <article class="builder-guide-card">
              <h3>5. Greșeli frecvente</h3>
              <ul class="clean">
                <li>Lipsește virgula dintre rețete în <code>LOCAL_FALLBACK_RECIPES</code>.</li>
                <li>Slug-ul este duplicat.</li>
                <li>Categoria nu este una dintre categoriile existente.</li>
                <li>Au rămas rânduri goale la ingrediente sau pași.</li>
                <li>Ai modificat fișierul, dar nu ai rulat generatorul.</li>
                <li>GitHub Pages încă nu a terminat publicarea.</li>
              </ul>
            </article>

            <article class="builder-guide-card">
              <h3>6. Verificare finală</h3>
              <ul class="clean">
                <li>Rețeta apare în căutare.</li>
                <li>Rețeta apare în categoria corectă.</li>
                <li>Pagina rețetei se deschide corect.</li>
                <li>Cardul arată bine pe mobil și desktop.</li>
                <li>Randomizer-ul o poate folosi dacă categoria este inclusă.</li>
              </ul>
            </article>
          </div>

          <div class="builder-callout">
            <strong>Notă despre căutare:</strong> căutarea funcționează pe cuvinte complete. Dacă vrei ca o rețetă cu „ouă” să fie găsită și când cineva caută „ou”, adaugă <code>ou</code> la câmpul „Cuvinte cheie / tag-uri”.
          </div>
        </section>

        <div class="builder-layout">
          <form id="recipeBuilderForm" class="builder-card builder-editor" novalidate>
            <div class="section-head compact-head">
              <div>
                <p class="eyebrow">Editor</p>
                <h2>Date rețetă</h2>
              </div>
            </div>

            <div id="builderValidation" class="builder-validation" role="status" aria-live="polite"></div>

            <div class="builder-form-grid">
              <label class="field" data-builder-field="title">
                <span>Titlu rețetă *</span>
                <input id="builderTitle" type="text" autocomplete="off" required>
              </label>
              <label class="field" data-builder-field="slug">
                <span>Slug / URL *</span>
                <input id="builderSlug" type="text" autocomplete="off" required>
              </label>
              <label class="field" data-builder-field="category">
                <span>Categorie *</span>
                <select id="builderCategory" required></select>
              </label>
              <label class="field">
                <span>Timp pregătire</span>
                <input id="builderPrepTime" type="text" placeholder="ex. 20 min">
              </label>
              <label class="field">
                <span>Timp gătire</span>
                <input id="builderCookTime" type="text" placeholder="ex. 35 min">
              </label>
              <label class="field">
                <span>Porții / dificultate</span>
                <input id="builderServings" type="text" placeholder="ex. 4 porții, ușor">
              </label>
            </div>

            <label class="field builder-wide">
              <span>Descriere scurtă</span>
              <textarea id="builderDescription" rows="3" placeholder="O propoziție scurtă pentru card și pagina rețetei."></textarea>
            </label>

            <label class="field builder-wide">
              <span>Imagine URL / cale</span>
              <input id="builderImage" type="url" placeholder="opțional, ex. assets/images/reteta.jpg">
            </label>

            <section class="builder-list-section" aria-labelledby="ingredientsTitle">
              <div class="builder-list-head">
                <h3 id="ingredientsTitle">Ingrediente *</h3>
                <button class="btn secondary" type="button" data-add-row="ingredients">Adaugă ingredient</button>
              </div>
              <div id="builderIngredients" class="builder-list" data-list="ingredients"></div>
            </section>

            <section class="builder-list-section" aria-labelledby="stepsTitle">
              <div class="builder-list-head">
                <h3 id="stepsTitle">Pași de preparare *</h3>
                <button class="btn secondary" type="button" data-add-row="steps">Adaugă pas</button>
              </div>
              <div id="builderSteps" class="builder-list" data-list="steps"></div>
            </section>

            <label class="field builder-wide">
              <span>Note / tips</span>
              <textarea id="builderNotes" rows="3" placeholder="Opțional: trucuri, variante, observații pentru tine."></textarea>
            </label>

            <label class="field builder-wide">
              <span>Cuvinte cheie / tag-uri</span>
              <input id="builderKeywords" type="text" placeholder="ex. rapid, pui, cină">
            </label>

            <div class="builder-actions">
              <button class="btn" type="button" id="copyRecipeExport">Copiază datele rețetei</button>
              <button class="btn secondary" type="button" id="downloadRecipeJson">Descarcă JSON</button>
              <button class="btn secondary" type="button" id="saveRecipeDraft">Salvează ciornă local</button>
              <button class="btn secondary" type="button" id="loadRecipeDraft">Încarcă ciornă</button>
              <button class="btn secondary" type="button" id="resetRecipeBuilder">Resetează formularul</button>
            </div>
          </form>

          <aside class="builder-sidebar">
            <section class="builder-card">
              <p class="eyebrow">Previzualizare</p>
              <div id="recipeBuilderPreview" class="builder-preview"></div>
            </section>

            <section class="builder-card">
              <p class="eyebrow">Export</p>
              <h2>Date pentru proiect</h2>
              <p class="builder-note">Copiază blocul de mai jos și adaugă-l în <strong>LOCAL_FALLBACK_RECIPES</strong> din <strong>build-static-site.mjs</strong>. Apoi rulează <strong>node build-static-site.mjs</strong> ca să generezi pagina rețetei.</p>
              <textarea id="recipeExportOutput" class="export-area" rows="14" readonly></textarea>
              <label class="field import-field">
                <span>Importă JSON exportat</span>
                <input id="importRecipeJson" type="file" accept="application/json">
              </label>
              <p id="builderStatus" class="builder-status" aria-live="polite"></p>
            </section>
          </aside>
        </div>
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
  --color-focus: rgba(255, 138, 91, .58);
  --color-focus-soft: rgba(255, 138, 91, .22);
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
  overflow-x: hidden;
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

body::after {
  content: "";
  position: fixed;
  inset: 0;
  z-index: 80;
  pointer-events: none;
  background:
    linear-gradient(135deg, rgba(255, 138, 91, .2), rgba(98, 214, 168, .08)),
    rgba(15, 17, 23, .46);
  opacity: 0;
  transform: translateY(100%);
  transition: opacity .28s ease, transform .34s cubic-bezier(.2, .7, .2, 1);
  backdrop-filter: blur(8px);
}

@keyframes ambientShift {
  from {
    background-position: 0% 0%, 0 0, 0 0;
  }

  to {
    background-position: 100% 18%, 0 0, 24px 0;
  }
}

@keyframes softReveal {
  from {
    opacity: 0;
    transform: translateY(10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes pageEnter {
  from {
    opacity: 0;
    filter: blur(4px);
    transform: translateY(14px) scale(.985);
  }

  to {
    opacity: 1;
    filter: blur(0);
    transform: translateY(0) scale(1);
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

img {
  height: auto;
}

main,
section,
article,
aside,
footer,
header,
.nav-wrap,
.grid,
.card,
.category-card,
.recipe-detail-card,
.search-panel,
.randomizer-panel,
.builder-card,
.steak-calculator,
.box {
  min-width: 0;
}

main {
  animation: pageEnter .34s cubic-bezier(.2, .7, .2, 1) both;
}

main,
.site-header,
.footer {
  transition: opacity .28s ease, transform .28s ease, filter .28s ease;
}

body.page-leaving main,
body.page-leaving .site-header,
body.page-leaving .footer {
  opacity: 0;
  filter: blur(5px);
  transform: translateY(12px) scale(.985);
}

body.page-leaving::after {
  opacity: 1;
  transform: translateY(0);
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
  min-width: 0;
  color: var(--color-text);
  text-decoration: none;
  font-family: Cinzel, Georgia, serif;
  font-size: 1.05rem;
  font-weight: 700;
  white-space: nowrap;
}

.logo span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
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
  transition: background-color .16s ease, border-color .16s ease, color .16s ease, transform .16s ease;
}

.mobile-menu-btn:hover,
.mobile-menu-btn[aria-expanded="true"] {
  border-color: var(--color-primary);
  background: var(--color-primary-soft);
  color: var(--color-primary-hover);
}

.mobile-menu-btn:active {
  transform: translateY(1px);
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
  overflow-wrap: anywhere;
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
.builder-card,
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
  overflow-wrap: anywhere;
  animation: softReveal .42s ease both;
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
  transition: background-color .16s ease, color .16s ease, transform .16s ease;
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
  overflow-wrap: anywhere;
  animation: softReveal .42s ease both;
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

.card:active,
.category-card:active {
  transform: translateY(-1px) scale(.995);
}

.search-panel {
  margin-bottom: var(--space-5);
  padding: var(--space-5);
  background: var(--color-surface);
  animation: softReveal .42s ease both;
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
select,
textarea {
  width: 100%;
  min-height: 50px;
  border: 2px solid rgba(255, 214, 186, .28);
  border-radius: var(--radius-sm);
  background: #111620;
  color: var(--color-text);
  padding: 12px 14px;
  font: inherit;
  outline: none;
  transition: border-color .16s ease, box-shadow .16s ease, background-color .16s ease;
}

input::placeholder {
  color: #b99f8f;
  opacity: 1;
}

input:hover,
select:hover,
textarea:hover {
  border-color: var(--color-primary);
}

input:focus,
select:focus,
textarea:focus {
  outline: none;
  border-color: var(--color-primary-hover);
  box-shadow: 0 0 0 3px var(--color-focus-soft);
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
  overflow-wrap: anywhere;
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
  animation: softReveal .42s ease both;
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

.random-result.is-refreshing,
#searchResults.is-refreshing {
  animation: softReveal .28s ease both;
}

.meal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: var(--space-4);
  align-items: stretch;
}

.meal-slot {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: var(--space-3);
  min-width: 0;
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

.meal-slot .recipe-card,
.meal-empty {
  min-height: 336px;
}

.meal-slot .recipe-card {
  height: 100%;
}

.meal-slot .recipe-card h3,
.meal-slot .recipe-card p,
.meal-slot .ingredients-preview {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.meal-slot .recipe-card h3 {
  min-height: 2.8em;
  -webkit-line-clamp: 2;
}

.meal-slot .recipe-card p {
  min-height: 4.8em;
  -webkit-line-clamp: 3;
}

.meal-slot .ingredients-preview {
  min-height: 4.75em;
  -webkit-line-clamp: 3;
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

.builder-help {
  margin-bottom: var(--space-5);
  padding: var(--space-5);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: rgba(24, 29, 41, .7);
}

.builder-help h2,
.builder-guide-card h3 {
  font-size: 1.45rem;
}

.builder-help p {
  margin-top: var(--space-2);
  color: var(--color-text-muted);
}

.builder-help code {
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, .07);
  color: var(--color-primary-hover);
  font-size: .92em;
}

.builder-help-intro {
  max-width: 860px;
  margin-bottom: var(--space-5);
}

.builder-guide-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-4);
}

.builder-guide-card {
  padding: var(--space-4);
  border: 1px solid rgba(255, 214, 186, .14);
  border-radius: var(--radius-lg);
  background: rgba(15, 17, 23, .42);
}

.builder-guide-card .clean {
  margin-top: var(--space-3);
}

.builder-callout {
  margin-top: var(--space-5);
  padding: var(--space-4);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-sm);
  background: rgba(255, 138, 91, .1);
  color: var(--color-text);
}

.builder-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(320px, .92fr);
  gap: var(--space-5);
  align-items: start;
}

.builder-sidebar {
  position: sticky;
  top: 110px;
  display: grid;
  gap: var(--space-5);
}

.builder-card {
  padding: var(--space-5);
}

.builder-card h2 {
  font-size: 1.45rem;
}

.compact-head {
  margin-bottom: var(--space-4);
}

.builder-form-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-4);
}

.builder-wide,
.builder-list-section {
  margin-top: var(--space-5);
}

.builder-list-head {
  display: flex;
  justify-content: space-between;
  gap: var(--space-3);
  align-items: center;
  margin-bottom: var(--space-3);
}

.builder-list-head h3 {
  font-size: 1.16rem;
}

.builder-list {
  display: grid;
  gap: var(--space-3);
}

.builder-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: var(--space-2);
  align-items: start;
}

.builder-row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
}

.mini-btn {
  min-height: 40px;
  min-width: 40px;
  padding: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: #111620;
  color: var(--color-text);
  font: inherit;
  font-weight: 900;
  cursor: pointer;
}

.mini-btn:hover {
  border-color: var(--color-primary);
  color: var(--color-primary-hover);
}

.builder-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-3);
  margin-top: var(--space-5);
}

.builder-actions .btn {
  flex: 1 1 190px;
}

.builder-validation {
  margin-bottom: var(--space-4);
  color: var(--color-primary-hover);
  font-weight: 800;
}

.field.is-invalid input,
.field.is-invalid select,
.field.is-invalid textarea {
  border-color: var(--color-primary-hover);
  box-shadow: 0 0 0 3px var(--color-focus-soft);
}

.builder-preview {
  margin-top: var(--space-4);
}

.builder-preview-card {
  padding: var(--space-5);
  background: var(--color-surface-alt);
  box-shadow: none;
}

.builder-preview-image {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  margin-bottom: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}

.builder-preview-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin: var(--space-3) 0;
  color: var(--color-text-muted);
  font-weight: 800;
}

.builder-preview-section {
  margin-top: var(--space-5);
}

.builder-note,
.builder-status {
  margin-top: var(--space-3);
  color: var(--color-text-muted);
}

.export-area {
  min-height: 260px;
  margin-top: var(--space-4);
  resize: vertical;
  font-family: Consolas, "Liberation Mono", monospace;
  font-size: .9rem;
}

.import-field {
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

.steak-actions .btn {
  flex: 0 1 auto;
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

.timer-phase {
  color: var(--color-primary-hover);
  font-weight: 900;
}

.timer-status {
  margin-top: var(--space-1);
  color: var(--color-text-muted);
  font-weight: 800;
  overflow-wrap: anywhere;
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
    transform: none !important;
  }

  main {
    animation: none !important;
  }

  body::after {
    display: none;
  }

  body.page-leaving main,
  body.page-leaving .site-header,
  body.page-leaving .footer {
    opacity: 1;
    transform: none;
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
  .builder-layout,
  .builder-form-grid,
  .builder-guide-grid,
  .steak-form,
  .steak-result-grid,
  .steak-timer,
  .steak-grid {
    grid-template-columns: 1fr;
  }

  .builder-sidebar {
    position: static;
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
    gap: var(--space-2);
  }

  .logo {
    flex: 1 1 auto;
  }

  .mobile-menu-btn {
    flex: 0 0 auto;
    padding: var(--space-2) var(--space-3);
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
    min-height: 44px;
    padding: var(--space-2);
    font-size: .9rem;
  }

  .nav-links {
    top: calc(100% + var(--space-2));
    left: var(--space-3);
    right: var(--space-3);
  }

  .hero {
    min-height: 420px;
  }

  .hero-inner {
    padding: var(--space-7) var(--space-4);
  }

  .hero h1 {
    font-size: 2.68rem;
  }

  .recipe-hero h1 {
    font-size: 2.18rem;
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
  .builder-card,
  .steak-calculator,
  .box {
    padding: var(--space-4);
  }

  .builder-list-head,
  .builder-row {
    grid-template-columns: 1fr;
  }

  .builder-list-head {
    display: grid;
  }

  .builder-list-head .btn,
  .builder-actions .btn {
    width: 100%;
  }

  .builder-row-actions {
    width: 100%;
  }

  .mini-btn {
    flex: 1 1 44px;
  }

  .detail-meta .btn,
  .steak-actions .btn {
    width: 100%;
  }

  .meal-slot .recipe-card,
  .meal-empty {
    min-height: 300px;
  }

  .timer-display {
    font-size: 1.72rem;
  }
}

@media (max-width: 430px) {
  .nav-wrap {
    padding: var(--space-3);
  }

  .logo {
    font-size: .96rem;
  }

  .logo-mark {
    width: 36px;
    height: 36px;
  }

  .nav-primary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .nav-primary a {
    font-size: .92rem;
  }

  .section {
    padding-right: var(--space-3);
    padding-left: var(--space-3);
  }

  .hero-inner {
    padding-right: var(--space-3);
    padding-left: var(--space-3);
  }

  .hero-search {
    gap: var(--space-2);
  }

  .steak-result {
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

  .recipe-hero h1 {
    font-size: 2rem;
  }

  .logo span:last-child {
    max-width: 132px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 350px) {
  .mobile-menu-btn span:last-child {
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

  function tokenizeText(value) {
    return normalize(value).match(/[a-z0-9]+/g) || [];
  }

  function recipeSearchTokens(recipe) {
    return new Set(tokenizeText([
      recipe && recipe.name,
      recipe && recipe.category,
      recipe && recipe.description,
      ((recipe && recipe.ingredients) || []).join(" "),
      ((recipe && recipe.preparation) || []).join(" "),
      ((recipe && recipe.keywords) || []).join(" ")
    ].join(" ")));
  }

  function recipeMatchesSearch(recipe, queryTokens) {
    if (!queryTokens.length) return true;
    // Full-token matching avoids false positives such as "ou" matching a random
    // longer word. Add explicit keywords when singular/plural shortcuts are desired.
    const tokens = recipeSearchTokens(recipe);
    return queryTokens.every((token) => tokens.has(token));
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
      const terms = tokenizeText(input.value);
      const selected = category.value;
      const matches = data.recipes.filter((recipe) => {
        if (selected !== "all" && recipe.category !== selected) return false;
        return recipeMatchesSearch(recipe, terms);
      });

      count.textContent = matches.length === 1 ? "1 rețetă găsită" : \`\${matches.length} rețete găsite\`;
      results.innerHTML = matches.length ? matches.map(card).join("") : '<div class="empty">Nu am găsit nicio rețetă. Încearcă un ingredient, o categorie sau mai puține cuvinte.</div>';
      results.classList.remove("is-refreshing");
      void results.offsetWidth;
      results.classList.add("is-refreshing");
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
            <span>Tip steak</span>
            <select data-steak-cut>
              <option value="ribeye" selected>Ribeye / Antricot</option>
              <option value="sirloin">Sirloin</option>
              <option value="filet">Mușchi / File</option>
              <option value="tbone">T-bone</option>
              <option value="other">Alt tip</option>
            </select>
          </label>
          <label class="field">
            <span>Tigaie</span>
            <select data-steak-pan>
              <option value="steel">Tigaie de oțel</option>
              <option value="cast-iron" selected>Tigaie de fontă</option>
              <option value="aluminum">Tigaie de aluminiu</option>
              <option value="stainless">Tigaie de inox</option>
              <option value="nonstick">Tigaie antiaderentă</option>
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
          <div>
            <div class="timer-phase" data-steak-phase>Pregătit</div>
            <div class="timer-status" data-steak-status>Timerul va suna când trebuie întors steak-ul, când se termină gătirea și după odihnire.</div>
          </div>
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

  function compactText(value) {
    return normalize(value).replace(/[^a-z0-9]+/g, "");
  }

  function categoryMatches(categoryName, variants) {
    const value = compactText(categoryName);
    return variants.some((variant) => value === compactText(variant));
  }

  function mealCard(slot) {
    const recipes = data.recipes.filter((recipe) => categoryMatches(recipe.category, slot.variants));
    const recipe = pickRandom(recipes);
    return \`
      <section class="meal-slot">
        <h2 class="meal-slot-title">\${escapeHtml(slot.label)}</h2>
        \${recipe ? card(recipe) : \`<div class="empty meal-empty">Nu există încă rețete pentru această categorie.</div>\`}
      </section>
    \`;
  }

  function setupRandomizer() {
    const button = document.getElementById("randomRecipeButton");
    const result = document.getElementById("randomRecipeResult");
    if (!button || !result) return;

    const slots = [
      { label: "Mic dejun", variants: ["Mic dejun"] },
      { label: "Fel principal", variants: ["Fel principal"] },
      { label: "Fel secundar", variants: ["Fel secundar"] },
      { label: "Desert", variants: ["Desert"] },
      { label: "Băutură", variants: ["Bautura", "Băutură", "Bauturi", "Băuturi"] },
      { label: "Salată", variants: ["Salata", "Salată", "Salate"] },
      { label: "Rontaieli", variants: ["Rontaieli", "Ronțăieli"] }
    ];

    function choose() {
      result.innerHTML = data.recipes.length
        ? \`<div class="meal-grid">\${slots.map(mealCard).join("")}</div>\`
        : '<div class="empty">Nu există încă rețete pentru randomizer.</div>';
      result.classList.remove("is-refreshing");
      void result.offsetWidth;
      result.classList.add("is-refreshing");
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
        cut: calculator.querySelector("[data-steak-cut]"),
        pan: calculator.querySelector("[data-steak-pan]"),
        heat: calculator.querySelector("[data-steak-heat]")
      };
      const result = calculator.querySelector("[data-steak-result]");
      const time = calculator.querySelector("[data-steak-time]");
      const phase = calculator.querySelector("[data-steak-phase]");
      const status = calculator.querySelector("[data-steak-status]");
      const startButton = calculator.querySelector("[data-steak-start-timer]");
      const pauseButton = calculator.querySelector("[data-steak-pause-timer]");
      const resetButton = calculator.querySelector("[data-steak-reset-timer]");
      if (!result || !time || !phase || !status || !startButton || !pauseButton || !resetButton) return;

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
        stainless: { label: "tigaie de inox", factor: 1.03, advice: "Preîncălzește până când o picătură de apă alunecă pe suprafață" },
        nonstick: { label: "tigaie antiaderentă", factor: 1.12, advice: "Folosește foc mediu sau mediu-mare, ca să protejezi stratul antiaderent" }
      };
      const cuts = {
        ribeye: { label: "ribeye / antricot", factor: 1 },
        sirloin: { label: "sirloin", factor: .96 },
        filet: { label: "mușchi / file", factor: .9 },
        tbone: { label: "T-bone", factor: 1.08 },
        other: { label: "alt tip", factor: 1 }
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
      let elapsed = 0;
      let notifiedFlip = false;
      let notifiedCooked = false;
      let notifiedDone = false;
      let audioContext = null;

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

      function ensureAudio() {
        const Context = window.AudioContext || window.webkitAudioContext;
        if (!Context) return null;
        if (!audioContext) audioContext = new Context();
        if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
        return audioContext;
      }

      function beep() {
        const context = ensureAudio();
        if (!context) return;
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
        const cut = cuts[fields.cut.value] || cuts.ribeye;
        // Simple estimate: thickness drives the base time, then weight, doneness,
        // pan material, heat level, starting temperature, and cut type nudge it.
        const weightBoost = Math.max(0, weight - 250) * .055;
        const rawSide = (thickness * 72 + weightBoost + target.adjust) * pan.factor * heat.factor * start.factor * cut.factor;
        const sideSeconds = Math.round(clamp(rawSide, 70, 480) / 5) * 5;
        const totalSeconds = sideSeconds * 2;
        const restSeconds = target.rest * 60;
        return { weight, thickness, target, pan, heat, start, cut, sideSeconds, totalSeconds, restSeconds };
      }

      function renderPlan() {
        plan = calculate();
        result.innerHTML = \`
          <div class="steak-result-grid">
            <div class="steak-metric"><span>Pe fiecare parte</span><strong>\${formatSeconds(plan.sideSeconds)}</strong></div>
            <div class="steak-metric"><span>Total în tigaie</span><strong>\${formatSeconds(plan.totalSeconds)}</strong></div>
            <div class="steak-metric"><span>Foc recomandat</span><strong>\${plan.heat.label}</strong></div>
            <div class="steak-metric"><span>Temp. internă aprox.</span><strong>\${plan.target.temp}</strong></div>
            <div class="steak-metric"><span>Odihnă</span><strong>\${plan.target.rest} min</strong></div>
          </div>
          <p class="steak-note">Pentru \${plan.weight} g, \${plan.thickness} cm și tipul \${plan.cut.label}, gătește pe foc \${plan.heat.label} într-o \${plan.pan.label}. \${plan.pan.advice}. Întoarce steak-ul după \${formatSeconds(plan.sideSeconds)}. Timpii sunt estimări și pot varia în funcție de aragaz, tigaie și grosimea reală; folosește un termometru pentru cea mai sigură verificare.</p>
        \`;
        resetTimer(false);
      }

      function totalTimerSeconds() {
        return plan.totalSeconds + plan.restSeconds;
      }

      function timerPhase() {
        if (!plan) return { label: "Pregătit", remaining: 0 };
        if (elapsed < plan.sideSeconds) return { label: "Prima parte", remaining: plan.sideSeconds - elapsed };
        if (elapsed < plan.totalSeconds) return { label: "A doua parte", remaining: plan.totalSeconds - elapsed };
        if (elapsed < totalTimerSeconds()) return { label: "Odihnire", remaining: totalTimerSeconds() - elapsed };
        return { label: "Gata", remaining: 0 };
      }

      function updateTimer() {
        const current = timerPhase();
        phase.textContent = current.label;
        time.textContent = formatSeconds(current.remaining);
      }

      function stopTimer() {
        if (timer) window.clearInterval(timer);
        timer = null;
      }

      function resetTimer(updateStatus = true) {
        stopTimer();
        if (!plan) plan = calculate();
        elapsed = 0;
        notifiedFlip = false;
        notifiedCooked = false;
        notifiedDone = false;
        startButton.textContent = "Start";
        updateTimer();
        if (updateStatus) status.textContent = "Timer resetat. Pornește când pui steak-ul în tigaie.";
        else status.textContent = "Timer pregătit. Apasă Start când pui steak-ul în tigaie.";
      }

      function notify(message) {
        status.textContent = message;
        beep();
      }

      function tick() {
        elapsed += 1;
        if (!notifiedFlip && elapsed >= plan.sideSeconds) {
          notifiedFlip = true;
          notify("Întoarce steak-ul acum.");
        }
        if (!notifiedCooked && elapsed >= plan.totalSeconds) {
          notifiedCooked = true;
          notify(\`Scoate steak-ul din tigaie. Începe odihnirea: \${plan.target.rest} minute.\`);
        }
        if (!notifiedDone && elapsed >= totalTimerSeconds()) {
          notifiedDone = true;
          elapsed = totalTimerSeconds();
          updateTimer();
          stopTimer();
          startButton.textContent = "Start";
          notify("Gata. Steak-ul a terminat odihnirea.");
          return;
        }
        updateTimer();
      }

      Object.values(fields).forEach((field) => {
        if (!field) return;
        field.addEventListener("input", renderPlan);
        field.addEventListener("change", renderPlan);
      });
      startButton.addEventListener("click", () => {
        if (!plan) renderPlan();
        ensureAudio();
        if (elapsed >= totalTimerSeconds()) resetTimer(false);
        if (timer) return;
        startButton.textContent = "Rulează";
        status.textContent = "Timer pornit. Vei auzi un semnal la întoarcere, la finalul gătirii și după odihnire.";
        timer = window.setInterval(tick, 1000);
      });
      pauseButton.addEventListener("click", () => {
        stopTimer();
        startButton.textContent = "Continuă";
        status.textContent = "Timer pus pe pauză.";
      });
      resetButton.addEventListener("click", () => resetTimer(true));

      renderPlan();
    });
  }

  function setupRecipeBuilder() {
    const form = document.getElementById("recipeBuilderForm");
    if (!form) return;

    const els = {
      title: document.getElementById("builderTitle"),
      slug: document.getElementById("builderSlug"),
      category: document.getElementById("builderCategory"),
      prepTime: document.getElementById("builderPrepTime"),
      cookTime: document.getElementById("builderCookTime"),
      servings: document.getElementById("builderServings"),
      description: document.getElementById("builderDescription"),
      image: document.getElementById("builderImage"),
      notes: document.getElementById("builderNotes"),
      keywords: document.getElementById("builderKeywords"),
      ingredients: document.getElementById("builderIngredients"),
      steps: document.getElementById("builderSteps"),
      preview: document.getElementById("recipeBuilderPreview"),
      exportOutput: document.getElementById("recipeExportOutput"),
      validation: document.getElementById("builderValidation"),
      status: document.getElementById("builderStatus"),
      importInput: document.getElementById("importRecipeJson")
    };
    if (!els.title || !els.slug || !els.category || !els.ingredients || !els.steps || !els.preview || !els.exportOutput) return;

    const draftKey = "arta-gatitului-recipe-builder-draft";
    const existingSlugs = new Set((data.recipes || []).map((recipe) => recipe.slug));
    let slugTouched = false;
    let autosaveTimer = null;

    function builderSlug(value) {
      return normalize(value)
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
    }

    function cleanLines(values) {
      return values.map((value) => String(value || "").trim()).filter(Boolean);
    }

    function rowValues(container) {
      return cleanLines(Array.from(container.querySelectorAll("[data-builder-row-input]")).map((input) => input.value));
    }

    function setStatus(message) {
      if (els.status) els.status.textContent = message || "";
    }

    function createText(tag, className, text) {
      const el = document.createElement(tag);
      if (className) el.className = className;
      el.textContent = text || "";
      return el;
    }

    function addRow(type, value = "") {
      const container = type === "steps" ? els.steps : els.ingredients;
      const row = document.createElement("div");
      row.className = "builder-row";

      const input = type === "steps" ? document.createElement("textarea") : document.createElement("input");
      input.dataset.builderRowInput = "true";
      input.value = value;
      input.placeholder = type === "steps" ? "Descrie pasul de preparare" : "ex. 2 ouă";
      if (type === "steps") input.rows = 2;

      const actions = document.createElement("div");
      actions.className = "builder-row-actions";

      [
        ["up", "Sus"],
        ["down", "Jos"],
        ["remove", "Șterge"]
      ].forEach(([action, label]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "mini-btn";
        button.dataset.rowAction = action;
        button.textContent = label;
        actions.append(button);
      });

      row.append(input, actions);
      container.append(row);
      input.addEventListener("input", syncBuilder);
      return row;
    }

    function moveRow(row, direction) {
      const sibling = direction === "up" ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling) return;
      if (direction === "up") row.parentElement.insertBefore(row, sibling);
      else row.parentElement.insertBefore(sibling, row);
      syncBuilder();
    }

    function bindRowActions(container) {
      container.addEventListener("click", (event) => {
        const button = event.target.closest("[data-row-action]");
        if (!button) return;
        const row = button.closest(".builder-row");
        if (!row) return;
        const action = button.dataset.rowAction;
        if (action === "remove") {
          row.remove();
          if (!container.children.length) addRow(container.dataset.list);
          syncBuilder();
        } else {
          moveRow(row, action);
        }
      });
    }

    function currentState() {
      return {
        name: els.title.value.trim(),
        slug: builderSlug(els.slug.value),
        category: els.category.value,
        description: els.description.value.trim(),
        prepTime: els.prepTime.value.trim(),
        cookTime: els.cookTime.value.trim(),
        servings: els.servings.value.trim(),
        image: els.image.value.trim(),
        notes: els.notes.value.trim(),
        keywordsText: els.keywords.value.trim(),
        ingredients: rowValues(els.ingredients),
        preparation: rowValues(els.steps)
      };
    }

    function keywordList(state) {
      return Array.from(new Set([
        ...state.name.split(/\\s+/),
        ...state.category.split(/\\s+/),
        ...state.keywordsText.split(/[,\\s]+/),
        ...state.ingredients.flatMap((line) => line.split(/\\s+/))
      ].map(builderSlug).filter(Boolean)));
    }

    function publicRecipeObject() {
      const state = currentState();
      return {
        name: state.name,
        slug: state.slug,
        category: state.category,
        description: state.description,
        ingredients: state.ingredients,
        preparation: state.preparation,
        closing: "Poftă bună!",
        extras: [],
        sourceUrl: "",
        keywords: keywordList(state)
      };
    }

    function fallbackRecipeObject() {
      const recipe = publicRecipeObject();
      return {
        name: recipe.name,
        slug: recipe.slug,
        category: recipe.category,
        sourceUrl: recipe.sourceUrl,
        description: recipe.description,
        preparation: recipe.preparation,
        ingredients: recipe.ingredients,
        closing: recipe.closing,
        extras: recipe.extras
      };
    }

    function exportPackage() {
      const state = currentState();
      return {
        recipe: publicRecipeObject(),
        fallbackRecipe: fallbackRecipeObject(),
        builderMeta: {
          prepTime: state.prepTime,
          cookTime: state.cookTime,
          servings: state.servings,
          image: state.image,
          notes: state.notes
        }
      };
    }

    function clearInvalidState() {
      form.querySelectorAll(".is-invalid").forEach((field) => field.classList.remove("is-invalid"));
    }

    function markInvalid(fieldName) {
      const field = form.querySelector('[data-builder-field="' + fieldName + '"]');
      if (field) field.classList.add("is-invalid");
    }

    function validateBuilder(showMessages = true) {
      const state = currentState();
      const messages = [];
      clearInvalidState();
      if (!state.name) {
        messages.push("Titlul este obligatoriu.");
        markInvalid("title");
      }
      if (!state.slug) {
        messages.push("Slug-ul este obligatoriu.");
        markInvalid("slug");
      }
      if (!state.category) {
        messages.push("Categoria este obligatorie.");
        markInvalid("category");
      }
      if (!state.ingredients.length) messages.push("Adaugă cel puțin un ingredient.");
      if (!state.preparation.length) messages.push("Adaugă cel puțin un pas de preparare.");
      if (state.slug && existingSlugs.has(state.slug)) messages.push("Atenție: există deja o rețetă cu acest slug.");
      if (els.validation) els.validation.textContent = showMessages ? messages.join(" ") : "";
      return messages.filter((message) => !message.startsWith("Atenție")).length === 0;
    }

    function renderPreview() {
      const state = currentState();
      const preview = els.preview;
      preview.textContent = "";

      const article = document.createElement("article");
      article.className = "recipe-detail-card builder-preview-card";

      if (state.image) {
        const image = document.createElement("img");
        image.className = "builder-preview-image";
        image.alt = state.name || "Imagine rețetă";
        image.loading = "lazy";
        image.src = state.image;
        article.append(image);
      }

      const badge = createText("span", "pill", state.category || "Categorie");
      const title = createText("h1", "", state.name || "Titlu rețetă");
      const desc = createText("p", "lead", state.description || "Descrierea rețetei va apărea aici.");
      article.append(badge, title, desc);

      const metaValues = [state.prepTime, state.cookTime, state.servings].filter(Boolean);
      if (metaValues.length) {
        const meta = document.createElement("div");
        meta.className = "builder-preview-meta";
        metaValues.forEach((value) => meta.append(createText("span", "", value)));
        article.append(meta);
      }

      const layout = document.createElement("div");
      layout.className = "recipe-layout";

      const ingredientsBox = document.createElement("section");
      ingredientsBox.className = "box";
      ingredientsBox.append(createText("h2", "", "Ingrediente"));
      const ingredientsList = document.createElement("ul");
      ingredientsList.className = "clean";
      (state.ingredients.length ? state.ingredients : ["Adaugă ingredientele în editor."]).forEach((line) => ingredientsList.append(createText("li", "", line)));
      ingredientsBox.append(ingredientsList);

      const stepsBox = document.createElement("section");
      stepsBox.className = "box";
      stepsBox.append(createText("h2", "", "Mod de preparare"));
      const stepsList = document.createElement("ol");
      stepsList.className = "clean";
      (state.preparation.length ? state.preparation : ["Adaugă pașii de preparare în editor."]).forEach((line) => stepsList.append(createText("li", "", line)));
      stepsBox.append(stepsList);

      layout.append(ingredientsBox, stepsBox);
      article.append(layout);

      if (state.notes) {
        const notes = document.createElement("section");
        notes.className = "builder-preview-section box";
        notes.append(createText("h2", "", "Note"));
        notes.append(createText("p", "", state.notes));
        article.append(notes);
      }

      preview.append(article);
    }

    function updateExport() {
      els.exportOutput.value = JSON.stringify(fallbackRecipeObject(), null, 2) + ",";
    }

    function saveDraft(silent = false) {
      window.localStorage.setItem(draftKey, JSON.stringify(exportPackage()));
      if (!silent) setStatus("Ciornă salvată local în acest browser.");
    }

    function scheduleAutosave() {
      window.clearTimeout(autosaveTimer);
      autosaveTimer = window.setTimeout(() => saveDraft(true), 350);
    }

    function syncBuilder() {
      if (els.slug.value !== builderSlug(els.slug.value)) els.slug.value = builderSlug(els.slug.value);
      validateBuilder(false);
      renderPreview();
      updateExport();
      scheduleAutosave();
    }

    function loadFromPackage(payload) {
      const recipe = payload.fallbackRecipe || payload.recipe || payload;
      const meta = payload.builderMeta || {};
      els.title.value = recipe.name || "";
      els.slug.value = recipe.slug || builderSlug(recipe.name || "");
      els.category.value = recipe.category || els.category.value;
      els.description.value = recipe.description || "";
      els.prepTime.value = meta.prepTime || "";
      els.cookTime.value = meta.cookTime || "";
      els.servings.value = meta.servings || "";
      els.image.value = meta.image || "";
      els.notes.value = meta.notes || "";
      els.keywords.value = Array.isArray(recipe.keywords) ? recipe.keywords.join(", ") : "";
      els.ingredients.textContent = "";
      els.steps.textContent = "";
      (Array.isArray(recipe.ingredients) && recipe.ingredients.length ? recipe.ingredients : [""]).forEach((line) => addRow("ingredients", line));
      (Array.isArray(recipe.preparation) && recipe.preparation.length ? recipe.preparation : [""]).forEach((line) => addRow("steps", line));
      slugTouched = true;
      syncBuilder();
    }

    function resetBuilder() {
      els.title.value = "";
      els.slug.value = "";
      els.description.value = "";
      els.prepTime.value = "";
      els.cookTime.value = "";
      els.servings.value = "";
      els.image.value = "";
      els.notes.value = "";
      els.keywords.value = "";
      els.ingredients.textContent = "";
      els.steps.textContent = "";
      addRow("ingredients");
      addRow("steps");
      slugTouched = false;
      setStatus("Formular resetat.");
      syncBuilder();
    }

    async function copyExport() {
      if (!validateBuilder(true)) {
        setStatus("Completează câmpurile obligatorii înainte de export.");
        return;
      }
      const text = els.exportOutput.value;
      try {
        await navigator.clipboard.writeText(text);
        setStatus("Datele rețetei au fost copiate.");
      } catch {
        els.exportOutput.focus();
        els.exportOutput.select();
        document.execCommand("copy");
        setStatus("Datele rețetei au fost selectate pentru copiere.");
      }
    }

    function downloadJson() {
      if (!validateBuilder(true)) {
        setStatus("Completează câmpurile obligatorii înainte de descărcare.");
        return;
      }
      const state = currentState();
      const blob = new Blob([JSON.stringify(exportPackage(), null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = (state.slug || "reteta-noua") + ".json";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
      setStatus("Fișier JSON descărcat.");
    }

    function loadDraft() {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) {
        setStatus("Nu există nicio ciornă locală salvată.");
        return;
      }
      try {
        loadFromPackage(JSON.parse(raw));
        setStatus("Ciornă locală încărcată.");
      } catch {
        setStatus("Ciorna locală nu a putut fi citită.");
      }
    }

    function populateCategories() {
      els.category.textContent = "";
      (data.categories || []).forEach((category) => {
        const option = document.createElement("option");
        option.value = category.name;
        option.textContent = category.name;
        els.category.append(option);
      });
    }

    populateCategories();
    bindRowActions(els.ingredients);
    bindRowActions(els.steps);
    addRow("ingredients");
    addRow("steps");

    form.addEventListener("input", syncBuilder);
    form.addEventListener("change", syncBuilder);
    document.querySelectorAll("[data-add-row]").forEach((button) => {
      button.addEventListener("click", () => {
        addRow(button.dataset.addRow);
        syncBuilder();
      });
    });
    els.title.addEventListener("input", () => {
      if (!slugTouched || !els.slug.value) els.slug.value = builderSlug(els.title.value);
    });
    els.slug.addEventListener("input", () => {
      slugTouched = true;
      els.slug.value = builderSlug(els.slug.value);
    });
    document.getElementById("copyRecipeExport")?.addEventListener("click", copyExport);
    document.getElementById("downloadRecipeJson")?.addEventListener("click", downloadJson);
    document.getElementById("saveRecipeDraft")?.addEventListener("click", () => saveDraft(false));
    document.getElementById("loadRecipeDraft")?.addEventListener("click", loadDraft);
    document.getElementById("resetRecipeBuilder")?.addEventListener("click", resetBuilder);
    els.importInput?.addEventListener("change", async () => {
      const file = els.importInput.files && els.importInput.files[0];
      if (!file) return;
      try {
        loadFromPackage(JSON.parse(await file.text()));
        setStatus("JSON importat.");
      } catch {
        setStatus("Fișierul JSON nu a putut fi importat.");
      } finally {
        els.importInput.value = "";
      }
    });

    const saved = window.localStorage.getItem(draftKey);
    if (saved) {
      try {
        loadFromPackage(JSON.parse(saved));
        setStatus("Ciornă locală încărcată automat.");
      } catch {
        resetBuilder();
      }
    } else {
      syncBuilder();
    }
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

  function setupPageTransitions() {
    document.body.classList.add("page-loaded");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    window.addEventListener("pageshow", () => {
      document.body.classList.remove("page-leaving");
      document.body.classList.add("page-loaded");
    });

    if (prefersReducedMotion) return;

    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const link = event.target.closest("a[href]");
      if (!link) return;

      const href = link.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (link.target && link.target !== "_self") return;
      if (link.hasAttribute("download")) return;

      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin) return;

      const samePageAnchor = url.pathname === window.location.pathname && url.search === window.location.search && url.hash;
      if (samePageAnchor || url.href === window.location.href) return;

      event.preventDefault();
      document.body.classList.remove("page-loaded");
      document.body.classList.add("page-leaving");

      window.setTimeout(() => {
        window.location.href = url.href;
      }, 280);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupPageTransitions();
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
    setupRecipeBuilder();
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
  await writeFile(path.join(ROOT, 'adauga-reteta.html'), recipeBuilderPage());
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
