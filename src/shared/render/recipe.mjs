import { escapeHtml, slugify } from '../utils/html.mjs';

const TAG_CARD_PRIORITY = ['complexity', 'time', 'context', 'equipment', 'technique', 'taste', 'diet'];

const DEFAULT_TAG_GROUP_LABELS = {
  taste: 'Gust',
  complexity: 'Complexitate',
  time: 'Timp',
  context: 'Context',
  diet: 'Dietă',
  equipment: 'Echipament',
  technique: 'Tehnică',
};

export function cleanArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
}

export function isRecipeSubheading(line) {
  return /:$/.test(line) || /^[A-ZĂÂÎȘȚ0-9\s/-]{3,}$/.test(line);
}

export function renderRecipeList(lines, ordered, listStyle = ordered ? 'numbered' : 'bullet') {
  const tag = ordered ? 'ol' : 'ul';
  const items = cleanArray(lines).map((line) => {
    const cls = isRecipeSubheading(line) ? ' class="subhead"' : '';
    return `<li${cls}>${escapeHtml(line)}</li>`;
  }).join('');
  return `<${tag} class="clean recipe-list-style-${escapeHtml(listStyle)}">${items}</${tag}>`;
}

export function formatMinutes(value) {
  if (value === null || value === undefined || value === '') return '';
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) return '';
  const rounded = Math.round(minutes);
  return rounded === 1 ? '1 minut' : `${rounded} minute`;
}

export function recipeTimeItems(recipe) {
  const items = [];
  const prep = formatMinutes(recipe.prepTimeMinutes);
  const cook = formatMinutes(recipe.cookTimeMinutes);
  const total = formatMinutes(recipe.totalTimeMinutes);
  if (prep) items.push(['prepTime', 'Pregătire', prep]);
  if (cook) items.push(['cookTime', 'Gătire', cook]);
  if (total) items.push(['totalTime', 'Total', total]);
  if (recipe.servings) items.push(['servings', 'Porții', String(recipe.servings)]);
  return items;
}

export function renderRecipeMetadata(recipe, root, options = {}) {
  const fields = new Set(options.fields || ['category', 'prepTime', 'cookTime', 'totalTime', 'servings', 'equipment']);
  const categoryHref = `${root}${slugify(recipe.category)}/`;
  const equipment = cleanArray(recipe.equipment || recipe.tags?.equipment);
  const items = [];
  if (fields.has('category')) {
    items.push(['Categorie', `<a href="${escapeHtml(categoryHref)}">${escapeHtml(recipe.category)}</a>`]);
  }
  recipeTimeItems(recipe).forEach(([field, label, value]) => {
    if (fields.has(field)) items.push([label, escapeHtml(value)]);
  });
  if (fields.has('equipment') && equipment.length) items.push(['Echipament', escapeHtml(equipment.join(', '))]);

  return `
        <section class="recipe-timeline box" aria-labelledby="recipe-meta-heading">
          <h2 id="recipe-meta-heading" class="sr-only">Detalii rețetă</h2>
          ${items.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${value}</strong></div>`).join('\n          ')}
        </section>`;
}

export function renderBeforeStarting(recipe, { heading = 'Înainte să începi', listStyle = 'checklist' } = {}) {
  const items = cleanArray(recipe.beforeStart);
  if (!items.length) return '';
  if (listStyle !== 'checklist') {
    return `
        <section class="before-start box" aria-labelledby="before-start-heading">
          <h2 id="before-start-heading">${escapeHtml(heading)}</h2>
          ${renderRecipeList(items, false, listStyle)}
        </section>`;
  }
  return `
        <section class="before-start box" aria-labelledby="before-start-heading">
          <h2 id="before-start-heading">${escapeHtml(heading)}</h2>
          <p>O verificare rapidă ca să gătești mai liniștit.</p>
          <ul class="before-list">
            ${items.map((item, index) => {
              const inputId = `${recipe.slug}-before-start-${index + 1}`;
              return `<li>
              <label for="${escapeHtml(inputId)}">
                <input id="${escapeHtml(inputId)}" type="checkbox" data-check-id="${index + 1}">
                <span>${escapeHtml(item)}</span>
              </label>
            </li>`;
            }).join('\n            ')}
          </ul>
        </section>`;
}

export function normalizedRecipeTagGroups(recipe) {
  return Object.entries(recipe.tags || {}).reduce((groups, [key, values]) => {
    const clean = cleanArray(values);
    if (clean.length) groups[key] = Array.from(new Set(clean));
    return groups;
  }, {});
}

export function recipeCardTags(recipe, limit = 3) {
  const groups = normalizedRecipeTagGroups(recipe);
  const picked = [];
  TAG_CARD_PRIORITY.forEach((key) => {
    (groups[key] || []).forEach((tag) => {
      if (picked.length < limit && !picked.includes(tag)) picked.push(tag);
    });
  });
  return picked;
}

export function renderRecipeTags(recipe, root, tagGroups = {}) {
  const groups = normalizedRecipeTagGroups(recipe);
  const order = Object.keys(tagGroups).length ? Object.keys(tagGroups) : Object.keys(DEFAULT_TAG_GROUP_LABELS);
  const entries = order
    .map((key) => ({
      key,
      label: tagGroups[key]?.label || DEFAULT_TAG_GROUP_LABELS[key] || key,
      tags: groups[key] || [],
    }))
    .filter((group) => group.tags.length);
  if (!entries.length) return '';

  return `
        <section class="recipe-tags box" aria-labelledby="tags-heading">
          <h2 id="tags-heading">Etichete rețetă</h2>
          <div class="tag-groups">
            ${entries.map((group) => `
            <div class="tag-group">
              <h3>${escapeHtml(group.label)}</h3>
              <div class="tag-list">${group.tags.map((tag) => `<a class="tag-chip tag-link" href="${escapeHtml(`${root}cauta.html?q=${encodeURIComponent(tag)}`)}">${escapeHtml(tag)}</a>`).join('')}</div>
            </div>`).join('\n            ')}
          </div>
        </section>`;
}

export function renderRecipeCardTags(recipe) {
  const tags = recipeCardTags(recipe);
  return tags.length
    ? `<div class="card-tags">${tags.map((tag) => `<span class="tag-chip small">${escapeHtml(tag)}</span>`).join('')}</div>`
    : '';
}

export function renderRecipeCard(recipe, root) {
  const ingredients = cleanArray(recipe.ingredients).filter((line) => !isRecipeSubheading(line)).slice(0, 5).join(', ');
  const titleId = `recipe-card-${recipe.slug}`;
  return `
          <a class="card recipe-card" aria-labelledby="${escapeHtml(titleId)}" href="${escapeHtml(`${root}retete/${recipe.slug}/`)}">
            <span class="category-pill">${escapeHtml(recipe.category)}</span>
            <h3 id="${escapeHtml(titleId)}">${escapeHtml(recipe.name)}</h3>
            ${renderRecipeCardTags(recipe)}
            <p>${escapeHtml(recipe.description || '')}</p>
            <div class="ingredients-preview"><strong>Ingrediente:</strong> ${escapeHtml(ingredients)}${recipe.ingredients && recipe.ingredients.length > 5 ? '...' : ''}</div>
          </a>`;
}

function recipeTokens(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function recipeSearchTokens(recipe) {
  return new Set([
    ...recipeTokens(recipe.name),
    ...recipeTokens(recipe.category),
    ...cleanArray(recipe.ingredients).flatMap(recipeTokens),
    ...cleanArray(recipe.keywords).flatMap(recipeTokens),
    ...Object.values(recipe.tags || {}).flatMap((items) => cleanArray(items).flatMap(recipeTokens)),
  ]);
}

function sharedTokenCount(a, b) {
  let count = 0;
  a.forEach((token) => {
    if (b.has(token)) count += 1;
  });
  return count;
}

export function findRelatedRecipes(currentRecipe, allRecipes = [], limit = 6) {
  const currentTokens = recipeSearchTokens(currentRecipe);
  const currentCategory = slugify(currentRecipe.category);
  return allRecipes
    .filter((recipe) => recipe.slug !== currentRecipe.slug)
    .map((recipe) => {
      const sameCategory = slugify(recipe.category) === currentCategory ? 4 : 0;
      const score = sameCategory + sharedTokenCount(currentTokens, recipeSearchTokens(recipe));
      return { recipe, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.recipe.name.localeCompare(b.recipe.name, 'ro'))
    .slice(0, limit)
    .map((item) => item.recipe);
}

function complexityLabel(value) {
  const rating = Number(value);
  if (!Number.isFinite(rating)) return '';
  if (rating <= 2) return 'Începător / Ușoară';
  if (rating <= 3.5) return 'Complexitate medie';
  return 'Complexitate ridicată';
}

function ratingValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
}

export function renderPublicRatingSummary(summary) {
  if (!summary || !Number(summary.totalRatings)) {
    return '<p class="rating-note">Nu există încă evaluări publice. Nu afișăm medii inventate.</p>';
  }
  const overall = ratingValue(summary.overallAverage);
  const taste = ratingValue(summary.tasteAverage);
  const clarity = ratingValue(summary.clarityAverage);
  const complexity = ratingValue(summary.complexityAverage);
  const cookAgain = ratingValue(summary.cookAgainPercent);
  return `
          <div class="public-rating">
            <h3>Evaluări publice</h3>
            <div class="rating-summary-grid">
              ${overall ? `<div><span>General</span><strong>${overall}/5</strong></div>` : ''}
              ${taste ? `<div><span>Gust</span><strong>${taste}/5</strong></div>` : ''}
              ${clarity ? `<div><span>Instrucțiuni</span><strong>${clarity}/5</strong></div>` : ''}
              ${complexity ? `<div><span>Complexitate</span><strong>${complexity}/5</strong></div>` : ''}
              ${cookAgain !== null ? `<div><span>Aș găti din nou</span><strong>${cookAgain}%</strong></div>` : ''}
              <div><span>Evaluări</span><strong>${Number(summary.totalRatings)}</strong></div>
            </div>
            ${complexity ? `<p class="rating-note">Complexitate după evaluări: ${escapeHtml(complexityLabel(complexity))}.</p>` : ''}
          </div>`;
}

function renderRatingScale(recipe, name, label, help = '') {
  const labels = name === 'complexity'
    ? ['1 foarte ușoară', '2 ușoară', '3 medie', '4 complexă', '5 foarte complexă']
    : ['1 slab', '2 ok', '3 bun', '4 foarte bun', '5 excelent'];
  return `
            <fieldset class="rating-group" data-rating-group="${escapeHtml(name)}">
              <legend>${escapeHtml(label)}</legend>
              ${help ? `<p>${escapeHtml(help)}</p>` : ''}
              <div class="rating-options">
                ${[1, 2, 3, 4, 5].map((value) => `
                <label>
                  <input type="radio" name="${escapeHtml(`rating-${recipe.slug}-${name}`)}" value="${value}">
                  <span aria-hidden="true">${name === 'complexity' ? value : '★'}</span>
                  <span class="sr-only">${escapeHtml(labels[value - 1])}</span>
                </label>`).join('')}
              </div>
            </fieldset>`;
}

export function renderRecipeRating(recipe, { heading = 'Evaluează rețeta' } = {}) {
  return `
        <section class="recipe-rating box" data-rating-panel data-recipe-slug="${escapeHtml(recipe.slug)}" aria-labelledby="recipe-rating-heading">
          <h2 id="recipe-rating-heading">${escapeHtml(heading)}</h2>
          <p class="rating-note">Evaluarea ta este salvată doar în acest browser. Pentru evaluări publice de la toți utilizatorii, site-ul ar avea nevoie de o bază de date.</p>
          ${renderPublicRatingSummary(recipe.ratingSummary)}
          <form class="rating-form" data-rating-form>
            ${renderRatingScale(recipe, 'taste', 'Gust')}
            ${renderRatingScale(recipe, 'clarity', 'Instrucțiuni clare')}
            ${renderRatingScale(recipe, 'complexity', 'Complexitate', '1 înseamnă foarte ușoară, 5 foarte complexă.')}
            ${renderRatingScale(recipe, 'overall', 'Evaluare generală')}
            <fieldset class="rating-group cook-again" data-rating-group="cookAgain">
              <legend>Aș găti din nou</legend>
              <div class="choice-row">
                <label><input type="radio" name="${escapeHtml(`rating-${recipe.slug}-cookAgain`)}" value="true"> <span>Da</span></label>
                <label><input type="radio" name="${escapeHtml(`rating-${recipe.slug}-cookAgain`)}" value="false"> <span>Nu</span></label>
              </div>
            </fieldset>
            <p class="rating-personal" data-rating-personal-note></p>
            <div class="rating-actions">
              <button class="btn" type="submit">Salvează evaluarea</button>
              <button class="btn secondary" type="button" data-rating-reset>Șterge evaluarea mea</button>
            </div>
            <p class="builder-status" data-rating-status aria-live="polite"></p>
          </form>
        </section>`;
}

export function renderSteakCalculator(extra, index = 0) {
  if (!extra || extra.type !== 'steak-calculator') return '';
  const headingId = `steak-calculator-heading-${index + 1}`;
  return `
        <section class="steak-calculator" data-steak-calculator aria-labelledby="${escapeHtml(headingId)}">
          <h2 id="${escapeHtml(headingId)}">${escapeHtml(extra.title)}</h2>
          <p>Completează detaliile bucății de carne, tipul de tigaie și nivelul de foc pentru o estimare practică de gătire.</p>
          <div class="steak-form">
            <label class="field"><span>Greutate</span><input data-steak-weight type="number" min="120" max="1200" step="10" value="300" inputmode="numeric"></label>
            <label class="field"><span>Grosime</span><input data-steak-thickness type="number" min="1" max="7" step="0.1" value="3" inputmode="decimal"></label>
            <label class="field"><span>Gătire dorită</span><select data-steak-doneness><option value="rare">Rare</option><option value="medium-rare" selected>Medium rare</option><option value="medium">Medium</option><option value="medium-well">Medium well</option><option value="well-done">Well done</option></select></label>
            <label class="field"><span>Temperatura cărnii</span><select data-steak-start><option value="fridge">Direct din frigider</option><option value="room" selected>La temperatura camerei</option></select></label>
            <label class="field"><span>Tip steak</span><select data-steak-cut><option value="ribeye" selected>Ribeye / Antricot</option><option value="sirloin">Sirloin</option><option value="filet">Mușchi / File</option><option value="tbone">T-bone</option><option value="other">Alt tip</option></select></label>
            <label class="field"><span>Tigaie</span><select data-steak-pan><option value="steel">Tigaie de oțel</option><option value="cast-iron" selected>Tigaie de fontă</option><option value="aluminum">Tigaie de aluminiu</option><option value="stainless">Tigaie de inox</option><option value="nonstick">Tigaie antiaderentă</option></select></label>
            <label class="field"><span>Nivel foc</span><select data-steak-heat><option value="low">Mic</option><option value="low-medium">Mic-mediu</option><option value="medium">Mediu</option><option value="medium-high" selected>Mediu-mare</option><option value="high">Mare</option></select></label>
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
        </section>`;
}

export function renderRecipeHero(recipe, root, {
  showCategory = true,
  showDescription = true,
  localImageUrl = null,
} = {}) {
  const catSlug = slugify(recipe.category);
  const imageUrl = localImageUrl || recipe.image;
  return `<header class="recipe-hero">
            <div>${imageUrl ? `
              <figure class="recipe-hero-media"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(recipe.name)}"></figure>` : ''}
              <p class="eyebrow">Rețetă</p>
              ${showCategory ? `<span class="pill">${escapeHtml(recipe.category)}</span>` : ''}
              <h1>${escapeHtml(recipe.name)}</h1>
              ${showDescription ? `<p class="lead recipe-description">${escapeHtml(recipe.description || '')}</p>` : ''}
            </div>
            <div class="detail-meta">
              <a class="btn secondary" href="${escapeHtml(`${root}${catSlug}/`)}">Înapoi la categorie</a>
            </div>
          </header>`;
}

export function renderRecipeIngredients(recipe, { heading = 'Ingrediente', listStyle = 'bullet' } = {}) {
  return `<section class="box" aria-labelledby="ingredients-heading">
              <h2 id="ingredients-heading">${escapeHtml(heading)}</h2>
              ${renderRecipeList(recipe.ingredients || [], false, listStyle)}
            </section>`;
}

export function renderRecipeInstructions(recipe, { heading = 'Mod de preparare', listStyle = 'numbered' } = {}) {
  return `<section class="box" aria-labelledby="steps-heading">
              <h2 id="steps-heading">${escapeHtml(heading)}</h2>
              ${renderRecipeList(recipe.preparation || recipe.steps || [], listStyle === 'numbered', listStyle)}
              ${recipe.closing ? `<p class="closing">${escapeHtml(recipe.closing)}</p>` : ''}
            </section>`;
}

export function renderRecipeEquipment(recipe, { heading = 'Echipament', listStyle = 'bullet' } = {}) {
  const equipment = cleanArray(recipe.equipment || recipe.tags?.equipment);
  if (!equipment.length) return '';
  return `<section class="box" aria-labelledby="equipment-heading">
              <h2 id="equipment-heading">${escapeHtml(heading)}</h2>
              ${renderRecipeList(equipment, false, listStyle)}
            </section>`;
}

export function renderRelatedRecipes(recipe, root, allRecipes = [], { heading = 'Rețete similare', limit = 6 } = {}) {
  const related = findRelatedRecipes(recipe, allRecipes, limit);
  return `<section class="related" aria-labelledby="similar-recipes-heading">
            <h2 id="similar-recipes-heading">${escapeHtml(heading)}</h2>
            ${related.length ? `<div class="grid cards">${related.map((item) => renderRecipeCard(item, root)).join('')}</div>` : '<div class="empty">Nu există încă rețete similare.</div>'}
          </section>`;
}

export function renderRecipeDetail(recipe, root, slugOverride, buildContext = {}) {
  return `
        <article class="recipe-detail-card" data-static-recipe data-recipe-slug="${escapeHtml(recipe.slug)}">
          ${renderRecipeHero(recipe, root)}
          ${renderRecipeMetadata(recipe, root)}
          ${renderBeforeStarting(recipe)}
          <div class="recipe-layout">
            ${renderRecipeIngredients(recipe)}
            ${renderRecipeInstructions(recipe)}
          </div>
          ${renderRecipeTags(recipe, root, buildContext.tagGroups)}
          ${(recipe.extras || []).map(renderSteakCalculator).join('')}
          ${renderRecipeRating(recipe)}
          ${renderRelatedRecipes(recipe, root, buildContext.recipes || [])}
        </article>`;
}
