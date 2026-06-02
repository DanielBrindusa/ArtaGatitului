(function () {
  const root = window.ARTA_ROOT || "";
  const data = window.ARTA_DATA || { categories: [], recipes: [], aliases: {} };
  const TAG_GROUPS = {
    taste: { label: "Gust", options: ["Dulce", "Sărat", "Picant", "Acrișor", "Cremos", "Crocant", "Aromat", "Fresh", "Ușor", "Sățios", "Condimentat", "Fin", "Rustic"] },
    complexity: { label: "Complexitate", options: ["Începător", "Ușor", "Complexitate medie", "Complexitate ridicată", "Necesită atenție", "Risc mic de greșeală", "Risc mediu de greșeală", "Risc ridicat de greșeală"] },
    time: { label: "Timp", options: ["Sub 15 minute", "Sub 30 minute", "Sub 60 minute", "Rețetă rapidă", "Necesită timp de așteptare", "Bună pentru pregătit din timp"] },
    context: { label: "Context", options: ["Mic dejun", "Prânz", "Cină", "Gustare", "Pentru familie", "Pentru musafiri", "Pentru weekend", "Pentru zile aglomerate", "Comfort food"] },
    diet: { label: "Dietă", options: ["Cu carne", "Fără carne", "Vegetarian", "Fără lactate", "Fără ou", "Fără gluten", "Ușor de adaptat"] },
    equipment: { label: "Echipament", options: ["Fără cuptor", "Necesită cuptor", "La tigaie", "La oală", "Necesită blender", "Necesită mixer", "Necesită tavă", "Necesită termometru"] },
    technique: { label: "Tehnică", options: ["Fierbere", "Coacere", "Prăjire", "Sotare", "Marinare", "Frământare", "La tigaie", "La cuptor", "Fără gătire"] }
  };
  const TAG_CARD_PRIORITY = ["complexity", "time", "context", "equipment", "technique", "taste", "diet"];
  const THEME_KEY = "arta-gatitului-theme";
  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let revealObserver = null;

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
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

  function searchUrl(query) {
    return root + "cauta.html?q=" + encodeURIComponent(query);
  }

  function categorySlug(name) {
    const category = data.categories.find((item) => item.name === name);
    return category ? category.slug : normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function categoryIcon(name) {
    const key = normalize(name).replace(/[^a-z0-9]+/g, "-");
    const icons = {
      "mic-dejun": "MD",
      "fel-principal": "FP",
      "fel-secundar": "FS",
      desert: "DS",
      bauturi: "BT",
      salate: "SL",
      rontaieli: "RN"
    };
    return icons[key] || (String(name || "").trim().slice(0, 2).toUpperCase() || "AG");
  }

  function recipeBySlug(slug) {
    const resolved = data.aliases && data.aliases[slug] ? data.aliases[slug] : slug;
    return data.recipes.find((recipe) => recipe.slug === resolved);
  }

  function isSubheading(line) {
    return /:$/.test(line) || /^[A-ZĂÂÎȘȚ0-9\s/-]{3,}$/.test(line);
  }

  function tokenizeText(value) {
    return normalize(value).match(/[a-z0-9]+/g) || [];
  }

  const IGNORED_INGREDIENT_TOKENS = new Set([
    "g", "gr", "kg", "ml", "l", "litru", "litri", "lingura", "linguri", "lingurita", "lingurite",
    "buc", "bucata", "bucati", "felie", "felii", "cana", "cani", "pachet", "pachete",
    "dupa", "gust", "aproximativ", "optional", "proaspat", "proaspata", "proaspete",
    "de", "din", "cu", "si", "sau", "la", "pentru", "cat", "cate", "putin", "putina"
  ]);

  const INGREDIENT_ALIASES = {
    ou: ["oua"],
    oua: ["ou"],
    cartof: ["cartofi"],
    cartofi: ["cartof"],
    rosie: ["rosii"],
    rosii: ["rosie"],
    ceapa: ["cepe"],
    cepe: ["ceapa"],
    galusca: ["galuste"],
    galuste: ["galusca"],
    lamaie: ["lamai"],
    lamai: ["lamaie"]
  };

  function expandIngredientToken(token) {
    return [token, ...(INGREDIENT_ALIASES[token] || [])];
  }

  function ingredientTokens(value) {
    return Array.from(new Set(tokenizeText(value)
      .filter((token) => !/^\d+$/.test(token) && !IGNORED_INGREDIENT_TOKENS.has(token))
      .flatMap(expandIngredientToken)));
  }

  function recipeIngredientTokens(recipe) {
    return new Set(((recipe && recipe.ingredients) || []).flatMap(ingredientTokens));
  }

  function normalizedTagGroups(tags) {
    if (!tags) return {};
    if (Array.isArray(tags)) return tags.length ? { context: tags } : {};
    return Object.entries(tags).reduce((groups, [key, values]) => {
      const clean = Array.isArray(values) ? values.map((value) => String(value || "").trim()).filter(Boolean) : [];
      if (clean.length) groups[key] = Array.from(new Set(clean));
      return groups;
    }, {});
  }

  function flatTags(recipe) {
    return Object.values(normalizedTagGroups(recipe && recipe.tags)).flat();
  }

  function tagTokens(recipe) {
    return new Set(flatTags(recipe).flatMap(tokenizeText));
  }

  function cardTags(recipe, limit = 3) {
    const groups = normalizedTagGroups(recipe && recipe.tags);
    const picked = [];
    TAG_CARD_PRIORITY.forEach((key) => {
      (groups[key] || []).forEach((tag) => {
        if (picked.length < limit && !picked.includes(tag)) picked.push(tag);
      });
    });
    return picked;
  }

  function tagsMarkup(recipe, compact = false) {
    const groups = normalizedTagGroups(recipe && recipe.tags);
    const entries = Object.entries(TAG_GROUPS)
      .map(([key, config]) => ({ key, label: config.label, tags: groups[key] || [] }))
      .filter((group) => group.tags.length);
    if (!entries.length) return "";

    if (compact) {
      return `<div class="card-tags">${cardTags(recipe).map((tag) => `<span class="tag-chip small">${escapeHtml(tag)}</span>`).join("")}</div>`;
    }

    return `
      <section class="recipe-tags box" aria-labelledby="recipeTagsTitle">
        <h2 id="recipeTagsTitle">Etichete rețetă</h2>
        <div class="tag-groups">
          ${entries.map((group) => `
            <div class="tag-group">
              <h3>${escapeHtml(group.label)}</h3>
              <div class="tag-list">${group.tags.map((tag) => `<a class="tag-chip tag-link" href="${searchUrl(tag)}">${escapeHtml(tag)}</a>`).join("")}</div>
            </div>
          `).join("")}
        </div>
      </section>
    `;
  }

  function recipeSearchTokens(recipe) {
    return new Set(tokenizeText([
      recipe && recipe.name,
      recipe && recipe.category,
      recipe && recipe.description,
      ((recipe && recipe.ingredients) || []).join(" "),
      ((recipe && recipe.preparation) || []).join(" "),
      ((recipe && recipe.beforeStart) || []).join(" "),
      ((recipe && recipe.keywords) || []).join(" "),
      flatTags(recipe).join(" ")
    ].join(" ")));
  }

  function recipeMatchesSearch(recipe, queryTokens) {
    if (!queryTokens.length) return true;
    // Full-token matching avoids false positives such as "ou" matching a random
    // longer word. Add explicit keywords when singular/plural shortcuts are desired.
    const tokens = recipeSearchTokens(recipe);
    return queryTokens.every((token) => tokens.has(token));
  }

  function applyStagger(container) {
    if (!container) return;
    Array.from(container.children).forEach((child, index) => {
      if (child && child.style) child.style.setProperty("--stagger", Math.min(index, 14));
    });
  }

  function markRevealTargets(scope) {
    if (prefersReducedMotion) return;
    const rootEl = scope || document;
    rootEl.querySelectorAll(".section, .page-title, .search-panel, .ingredient-panel, .randomizer-panel, .builder-card, .box, .card, .category-card, .recipe-detail-card, .related, .meal-slot").forEach((el) => {
      if (!el.hasAttribute("data-reveal")) el.setAttribute("data-reveal", "");
      if (revealObserver) revealObserver.observe(el);
      else if (document.documentElement.classList.contains("reveal-ready")) el.classList.add("is-revealed");
    });
  }

  function pulseElement(el) {
    if (!el || prefersReducedMotion) return;
    el.classList.remove("pulse-once");
    void el.offsetWidth;
    el.classList.add("pulse-once");
  }

  function emptyState(message, actions) {
    const actionMarkup = actions === false ? "" : [
      '<div class="empty-actions">',
      '<button class="btn secondary" type="button" data-clear-search>Curăță căutarea</button>',
      '<a class="btn secondary" href="' + root + 'cauta.html">Vezi toate rețetele</a>',
      '<a class="btn secondary" href="' + root + 'categorii.html">Explorează categoriile</a>',
      '</div>'
    ].join("");
    return '<div class="empty"><p>' + escapeHtml(message) + '</p>' + actionMarkup + '</div>';
  }

  function card(recipe) {
    const ingredients = (recipe.ingredients || []).filter((line) => !isSubheading(line)).slice(0, 5).join(", ");
    const titleId = "recipe-card-" + recipe.slug;
    return `
      <a class="card recipe-card" aria-labelledby="${titleId}" href="${recipeUrl(recipe.slug)}">
        <span class="category-pill">${escapeHtml(recipe.category)}</span>
        <h3 id="${titleId}">${escapeHtml(recipe.name)}</h3>
        ${tagsMarkup(recipe, true)}
        <p>${escapeHtml(recipe.description || "")}</p>
        <div class="ingredients-preview"><strong>Ingrediente:</strong> ${escapeHtml(ingredients)}${recipe.ingredients && recipe.ingredients.length > 5 ? "..." : ""}</div>
      </a>
    `;
  }

  function renderRecipeCards(elementId, recipes) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = recipes.length ? recipes.map(card).join("") : '<div class="empty">Nu există rețete de afișat încă.</div>';
    if (!recipes.length) el.innerHTML = emptyState("Nu există rețete de afișat încă.", false);
    applyStagger(el);
    markRevealTargets(el);
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
      return `
        <a class="category-card" href="${categoryUrl(category.slug)}" data-icon="${escapeHtml(categoryIcon(category.name))}">
          <strong>${escapeHtml(category.name)}</strong>
          <span>${escapeHtml(category.description)}<br>${count ? countLabel : "urmează rețete noi"}</span>
        </a>
      `;
    }).join("");
    applyStagger(el);
    markRevealTargets(el);
  }

  function setupSearch() {
    const input = document.getElementById("recipeSearchInput");
    const category = document.getElementById("recipeCategoryFilter");
    const count = document.getElementById("recipeCount");
    const results = document.getElementById("searchResults");
    if (!input || !category || !results) return;

    category.innerHTML = '<option value="all">Toate categoriile</option>' + data.categories.map((item) => `<option value="${escapeHtml(item.name)}">${escapeHtml(item.name)}</option>`).join("");
    if (!category.value) category.value = "all";

    function run() {
      const terms = tokenizeText(input.value);
      const selected = category.value;
      const matches = data.recipes.filter((recipe) => {
        if (selected !== "all" && recipe.category !== selected) return false;
        return recipeMatchesSearch(recipe, terms);
      });

      count.textContent = matches.length === 1 ? "1 rețetă găsită" : `${matches.length} rețete găsite`;
      results.innerHTML = matches.length ? matches.map(card).join("") : '<div class="empty">Nu am găsit nicio rețetă. Încearcă un ingredient, o categorie sau mai puține cuvinte.</div>';
      pulseElement(count);
      if (!matches.length) results.innerHTML = emptyState("Nu am găsit nicio rețetă. Încearcă alt ingredient sau explorează categoriile.");
      applyStagger(results);
      markRevealTargets(results);
      results.classList.remove("is-refreshing");
      void results.offsetWidth;
      results.classList.add("is-refreshing");
    }

    input.addEventListener("input", run);
    category.addEventListener("change", run);
    results.addEventListener("click", (event) => {
      const button = event.target.closest("[data-clear-search]");
      if (!button) return;
      input.value = "";
      category.value = "all";
      run();
      input.focus();
    });
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

  function analyzeIngredientMatch(recipe, availableTokens) {
    const rows = ((recipe && recipe.ingredients) || [])
      .filter((line) => !isSubheading(line))
      .map((line) => ({ label: line, tokens: ingredientTokens(line) }))
      .filter((row) => row.tokens.length);

    const matched = [];
    const missing = [];
    rows.forEach((row) => {
      const hasMatch = row.tokens.some((token) => availableTokens.has(token));
      if (hasMatch) matched.push(row.label);
      else missing.push(row.label);
    });

    const total = rows.length;
    let matchedCount = matched.length;
    let score = total ? matchedCount / total : 0;
    const keywordMatches = Array.from(keywordTokens(recipe)).filter((token) => availableTokens.has(token));
    if (!matchedCount && keywordMatches.length) {
      matched.push("cuvânt-cheie: " + keywordMatches.slice(0, 3).join(", "));
      matchedCount = 1;
      score = total ? Math.min(.28, 1 / total) : .2;
    }
    return { recipe, matched, missing, total, matchedCount, missingCount: missing.length, score };
  }

  function matchBadge(match) {
    if (match.missingCount === 0) return "Complet";
    if (match.score >= .88 || match.missingCount <= 1) return "Aproape complet";
    return match.missingCount === 1 ? "Lipsește 1 ingredient" : "Lipsesc " + match.missingCount + " ingrediente";
  }

  function renderMatchChips(items, className) {
    if (!items.length) return '<span class="match-chip">nimic de afișat</span>';
    return items.slice(0, 8).map((item) => `<span class="match-chip ${className || ""}">${escapeHtml(item)}</span>`).join("");
  }

  function ingredientMatchCard(match) {
    const recipe = match.recipe;
    const percent = Math.round(match.score * 100);
    const titleId = "ingredient-match-" + recipe.slug;
    const matchedText = match.matched.slice(0, 3).join(", ");
    const missingText = match.missing.length ? " Mai lipsesc: " + match.missing.slice(0, 3).join(", ") + "." : " Ai toate ingredientele importante detectate.";
    return `
      <a class="card recipe-card match-card" aria-labelledby="${titleId}" href="${recipeUrl(recipe.slug)}">
        <div class="match-card-head">
          <span class="category-pill">${escapeHtml(recipe.category)}</span>
          <span class="match-badge">${escapeHtml(matchBadge(match))}</span>
        </div>
        <h3 id="${titleId}">${escapeHtml(recipe.name)}</h3>
        <p>${escapeHtml(recipe.description || "")}</p>
        <div class="match-meter" aria-label="Potrivire ${percent}%"><span style="width: ${percent}%"></span></div>
        <p class="match-detail"><strong>${percent}% potrivire</strong> Recomandată fiindcă ai: ${escapeHtml(matchedText || "ingrediente potrivite")}.${escapeHtml(missingText)}</p>
        <div class="match-detail">
          <strong>Ingrediente potrivite</strong>
          <div class="match-chip-list">${renderMatchChips(match.matched)}</div>
        </div>
        <div class="match-detail">
          <strong>Ingrediente lipsă</strong>
          <div class="match-chip-list">${renderMatchChips(match.missing, "missing")}</div>
        </div>
      </a>
    `;
  }

  function renderMatchSection(title, matches) {
    if (!matches.length) return "";
    return `
      <section class="match-section" aria-labelledby="${normalize(title).replace(/[^a-z0-9]+/g, "-")}">
        <h2 id="${normalize(title).replace(/[^a-z0-9]+/g, "-")}">${escapeHtml(title)}</h2>
        <div class="grid cards">${matches.map(ingredientMatchCard).join("")}</div>
      </section>
    `;
  }

  function setupIngredientMatcher() {
    const form = document.getElementById("ingredientMatcherForm");
    const input = document.getElementById("availableIngredients");
    const chips = document.getElementById("ingredientChips");
    const summary = document.getElementById("ingredientMatchSummary");
    const results = document.getElementById("ingredientMatchResults");
    const reset = document.getElementById("resetIngredientMatcher");
    if (!form || !input || !chips || !summary || !results) return;

    const storageKey = "arta-gatitului-available-ingredients";

    function availableTokens() {
      return Array.from(new Set(ingredientTokens(input.value)));
    }

    function renderChips(tokens) {
      chips.innerHTML = tokens.length
        ? tokens.map((token) => `<span class="ingredient-chip">${escapeHtml(token)}</span>`).join("")
        : '<span class="ingredient-chip">Scrie ingredientele de acasă</span>';
    }

    function run() {
      const tokens = availableTokens();
      const tokenSet = new Set(tokens);
      renderChips(tokens);

      if (!tokens.length) {
        summary.textContent = "Introdu ingredientele ca să primești recomandări.";
        results.innerHTML = '<div class="empty">Exemplu: pui, cartofi, ou, lapte, usturoi.</div>';
        results.innerHTML = emptyState("Exemplu: pui, cartofi, ou, lapte, usturoi.", false);
        return;
      }

      window.localStorage.setItem(storageKey, input.value);
      const matches = data.recipes
        .map((recipe) => analyzeIngredientMatch(recipe, tokenSet))
        .filter((match) => match.total > 0 && match.matchedCount > 0)
        .sort((a, b) => {
          const scoreDiff = b.score - a.score;
          if (scoreDiff) return scoreDiff;
          const missingDiff = a.missingCount - b.missingCount;
          if (missingDiff) return missingDiff;
          return a.recipe.name.localeCompare(b.recipe.name, "ro");
        });

      const ready = matches.filter((match) => match.score >= .88 || match.missingCount <= 1);
      const almost = matches.filter((match) => !ready.includes(match) && match.score >= .34);
      const weak = matches.filter((match) => !ready.includes(match) && !almost.includes(match) && match.score > 0).slice(0, 6);

      summary.textContent = matches.length === 1
        ? "1 rețetă se potrivește cu ingredientele introduse."
        : matches.length + " rețete se potrivesc cu ingredientele introduse.";

      results.innerHTML = matches.length
        ? [
            renderMatchSection("Poți găti acum", ready),
            renderMatchSection("Îți lipsesc câteva ingrediente", almost.slice(0, 12)),
            renderMatchSection("Potrivire slabă", weak)
          ].join("")
        : '<div class="empty">Nu am găsit potriviri încă. Încearcă ingrediente mai simple, de exemplu „pui”, „cartofi”, „ouă” sau „lapte”.</div>';
      if (!matches.length) results.innerHTML = emptyState("Nu am găsit potriviri încă. Încearcă ingrediente mai simple, de exemplu pui, cartofi, ouă sau lapte.", false);
      applyStagger(results);
      markRevealTargets(results);
      results.classList.remove("is-refreshing");
      void results.offsetWidth;
      results.classList.add("is-refreshing");
    }

    input.addEventListener("input", () => renderChips(availableTokens()));
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      run();
    });
    reset?.addEventListener("click", () => {
      input.value = "";
      window.localStorage.removeItem(storageKey);
      run();
      input.focus();
    });

    const saved = window.localStorage.getItem(storageKey);
    if (saved) input.value = saved;
    run();
  }

  function renderList(lines, ordered) {
    const tag = ordered ? "ol" : "ul";
    const items = (lines || []).map((line) => {
      const cls = isSubheading(line) ? ' class="subhead"' : "";
      return `<li${cls}>${escapeHtml(line)}</li>`;
    }).join("");
    return `<${tag} class="clean">${items}</${tag}>`;
  }

  function beforeStartSection(recipe) {
    const items = ((recipe && recipe.beforeStart) || []).map((item) => String(item || "").trim()).filter(Boolean);
    if (!items.length) return "";
    return `
      <section class="before-start box" aria-labelledby="beforeStartTitle">
        <h2 id="beforeStartTitle">Înainte să începi</h2>
        <p>O verificare rapidă ca să gătești mai liniștit.</p>
        <ul class="before-list">
          ${items.map((item, index) => `
            <li>
              <label>
                <input type="checkbox">
                <span>${escapeHtml(item)}</span>
              </label>
            </li>
          `).join("")}
        </ul>
      </section>
    `;
  }

  function complexityLabel(value) {
    const rating = Number(value);
    if (!Number.isFinite(rating)) return "";
    if (rating <= 2) return "Începător / Ușoară";
    if (rating <= 3.5) return "Complexitate medie";
    return "Complexitate ridicată";
  }

  function ratingValue(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 10) / 10 : null;
  }

  function publicRatingSummary(summary) {
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
          ${overall ? `<div><span>General</span><strong>${overall}/5</strong></div>` : ""}
          ${taste ? `<div><span>Gust</span><strong>${taste}/5</strong></div>` : ""}
          ${clarity ? `<div><span>Instrucțiuni</span><strong>${clarity}/5</strong></div>` : ""}
          ${complexity ? `<div><span>Complexitate</span><strong>${complexity}/5</strong></div>` : ""}
          ${cookAgain !== null ? `<div><span>Aș găti din nou</span><strong>${cookAgain}%</strong></div>` : ""}
          <div><span>Evaluări</span><strong>${Number(summary.totalRatings)}</strong></div>
        </div>
        ${complexity ? `<p class="rating-note">Complexitate după evaluări: ${escapeHtml(complexityLabel(complexity))}.</p>` : ""}
      </div>
    `;
  }

  function ratingScale(name, label, help) {
    const labels = name === "complexity"
      ? ["1 foarte ușoară", "2 ușoară", "3 medie", "4 complexă", "5 foarte complexă"]
      : ["1 slab", "2 ok", "3 bun", "4 foarte bun", "5 excelent"];
    return `
      <fieldset class="rating-group" data-rating-group="${name}">
        <legend>${escapeHtml(label)}</legend>
        ${help ? `<p>${escapeHtml(help)}</p>` : ""}
        <div class="rating-options">
          ${[1, 2, 3, 4, 5].map((value) => `
            <label>
              <input type="radio" name="rating-${name}" value="${value}">
              <span aria-hidden="true">${name === "complexity" ? value : "★"}</span>
              <span class="sr-only">${labels[value - 1]}</span>
            </label>
          `).join("")}
        </div>
      </fieldset>
    `;
  }

  function ratingSection(recipe) {
    return `
      <section class="recipe-rating box" data-rating-panel data-recipe-slug="${escapeHtml(recipe.slug)}" aria-labelledby="recipeRatingTitle">
        <h2 id="recipeRatingTitle">Evaluează rețeta</h2>
        <p class="rating-note">Evaluarea ta este salvată doar în acest browser. Pentru evaluări publice de la toți utilizatorii, site-ul ar avea nevoie de o bază de date.</p>
        ${publicRatingSummary(recipe.ratingSummary)}
        <form class="rating-form" data-rating-form>
          ${ratingScale("taste", "Gust")}
          ${ratingScale("clarity", "Instrucțiuni clare")}
          ${ratingScale("complexity", "Complexitate", "1 înseamnă foarte ușoară, 5 foarte complexă.")}
          ${ratingScale("overall", "Evaluare generală")}
          <fieldset class="rating-group cook-again" data-rating-group="cookAgain">
            <legend>Aș găti din nou</legend>
            <div class="choice-row">
              <label><input type="radio" name="rating-cookAgain" value="true"> <span>Da</span></label>
              <label><input type="radio" name="rating-cookAgain" value="false"> <span>Nu</span></label>
            </div>
          </fieldset>
          <p class="rating-personal" data-rating-personal-note></p>
          <div class="rating-actions">
            <button class="btn" type="submit">Salvează evaluarea</button>
            <button class="btn secondary" type="button" data-rating-reset>Șterge evaluarea mea</button>
          </div>
          <p class="builder-status" data-rating-status aria-live="polite"></p>
        </form>
      </section>
    `;
  }

  function steakCalculator(extra) {
    if (!extra || extra.type !== "steak-calculator") return "";
    return `
      <section class="steak-calculator" data-steak-calculator>
        <h2>${escapeHtml(extra.title)}</h2>
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
    `;
  }

  function sharedTokenCount(a, b) {
    let count = 0;
    a.forEach((token) => {
      if (b.has(token)) count += 1;
    });
    return count;
  }

  function importantTitleTokens(recipe) {
    return new Set(ingredientTokens(recipe && recipe.name));
  }

  function keywordTokens(recipe) {
    return new Set(((recipe && recipe.keywords) || []).flatMap(tokenizeText));
  }

  function similarRecipes(currentRecipe) {
    if (!currentRecipe) return [];
    const currentCategory = normalize(currentRecipe.category);
    const currentIngredients = recipeIngredientTokens(currentRecipe);
    const currentKeywords = keywordTokens(currentRecipe);
    const currentTitle = importantTitleTokens(currentRecipe);

    return data.recipes
      .filter((recipe) => recipe.slug !== currentRecipe.slug)
      .map((recipe) => {
        const sameCategory = normalize(recipe.category) === currentCategory ? 3 : 0;
        const keywordScore = sharedTokenCount(currentKeywords, keywordTokens(recipe)) * 2;
        const ingredientScore = sharedTokenCount(currentIngredients, recipeIngredientTokens(recipe));
        const titleScore = sharedTokenCount(currentTitle, importantTitleTokens(recipe));
        const tagScore = sharedTokenCount(tagTokens(currentRecipe), tagTokens(recipe)) * 2;
        return { recipe, score: sameCategory + keywordScore + ingredientScore + titleScore + tagScore };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff) return scoreDiff;
        return a.recipe.name.localeCompare(b.recipe.name, "ro");
      })
      .slice(0, 6)
      .map((item) => item.recipe);
  }

  function recipeTimeline(recipe) {
    const markers = [];
    if (recipe && recipe.prepTime) markers.push(["Pregătire", recipe.prepTime]);
    if (recipe && recipe.cookTime) markers.push(["Gătire", recipe.cookTime]);
    if (recipe && recipe.restTime) markers.push(["Odihnire", recipe.restTime]);
    if (!markers.length) return "";
    return '<section class="recipe-timeline box" aria-label="Timeline rețetă">' +
      markers.map((item) => '<div><span>' + escapeHtml(item[0]) + '</span><strong>' + escapeHtml(item[1]) + '</strong></div>').join("") +
      '</section>';
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
    const related = similarRecipes(recipe);

    el.innerHTML = `
      <article class="recipe-detail-card">
        <div class="recipe-hero">
          <div>
            <span class="pill">${escapeHtml(recipe.category)}</span>
            <h1>${escapeHtml(recipe.name)}</h1>
            <p class="lead">${escapeHtml(recipe.description || "")}</p>
          </div>
          <div class="detail-meta">
            <a class="btn secondary" href="${categoryUrl(catSlug)}">Înapoi la categorie</a>
          </div>
        </div>
        ${recipeTimeline(recipe)}
        ${beforeStartSection(recipe)}
        <div class="recipe-layout">
          <section class="box">
            <h2>Ingrediente</h2>
            ${renderList(recipe.ingredients || [], false)}
          </section>
          <section class="box">
            <h2>Mod de preparare</h2>
            ${renderList(recipe.preparation || [], true)}
            ${recipe.closing ? `<p class="closing">${escapeHtml(recipe.closing)}</p>` : ""}
          </section>
        </div>
        ${tagsMarkup(recipe)}
        ${(recipe.extras || []).map(steakCalculator).join("")}
        ${ratingSection(recipe)}
      </article>
      <section class="related" aria-labelledby="similarRecipesTitle">
        <h2 id="similarRecipesTitle">Rețete similare</h2>
        ${related.length ? `<div class="grid cards">${related.map(card).join("")}</div>` : '<div class="empty">Nu există încă rețete similare.</div>'}
      </section>
    `;
    markRevealTargets(el);
    el.querySelectorAll(".grid").forEach(applyStagger);
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
    return `
      <section class="meal-slot">
        <h2 class="meal-slot-title">${escapeHtml(slot.label)}</h2>
        ${recipe ? card(recipe) : `<div class="empty meal-empty">Nu există încă rețete pentru această categorie.</div>`}
      </section>
    `;
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
        ? `<div class="meal-grid">${slots.map(mealCard).join("")}</div>`
        : '<div class="empty">Nu există încă rețete pentru randomizer.</div>';
      applyStagger(result);
      markRevealTargets(result);
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
      const timerBox = calculator.querySelector(".steak-timer");
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
        return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
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
        result.innerHTML = `
          <div class="steak-result-grid">
            <div class="steak-metric"><span>Pe fiecare parte</span><strong>${formatSeconds(plan.sideSeconds)}</strong></div>
            <div class="steak-metric"><span>Total în tigaie</span><strong>${formatSeconds(plan.totalSeconds)}</strong></div>
            <div class="steak-metric"><span>Foc recomandat</span><strong>${plan.heat.label}</strong></div>
            <div class="steak-metric"><span>Temp. internă aprox.</span><strong>${plan.target.temp}</strong></div>
            <div class="steak-metric"><span>Odihnă</span><strong>${plan.target.rest} min</strong></div>
          </div>
          <p class="steak-note">Pentru ${plan.weight} g, ${plan.thickness} cm și tipul ${plan.cut.label}, gătește pe foc ${plan.heat.label} într-o ${plan.pan.label}. ${plan.pan.advice}. Întoarce steak-ul după ${formatSeconds(plan.sideSeconds)}. Timpii sunt estimări și pot varia în funcție de aragaz, tigaie și grosimea reală; folosește un termometru pentru cea mai sigură verificare.</p>
        `;
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
        if (timerBox) timerBox.classList.remove("is-running");
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
          notify(`Scoate steak-ul din tigaie. Începe odihnirea: ${plan.target.rest} minute.`);
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
        if (timerBox) timerBox.classList.add("is-running");
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
      beforeStart: document.getElementById("builderBeforeStart"),
      steps: document.getElementById("builderSteps"),
      tags: document.getElementById("builderTags"),
      ratingSummary: {
        overallAverage: document.getElementById("builderOverallAverage"),
        tasteAverage: document.getElementById("builderTasteAverage"),
        clarityAverage: document.getElementById("builderClarityAverage"),
        complexityAverage: document.getElementById("builderComplexityAverage"),
        cookAgainPercent: document.getElementById("builderCookAgainPercent"),
        totalRatings: document.getElementById("builderTotalRatings")
      },
      preview: document.getElementById("recipeBuilderPreview"),
      exportOutput: document.getElementById("recipeExportOutput"),
      validation: document.getElementById("builderValidation"),
      status: document.getElementById("builderStatus"),
      importInput: document.getElementById("importRecipeJson")
    };
    if (!els.title || !els.slug || !els.category || !els.ingredients || !els.beforeStart || !els.steps || !els.tags || !els.preview || !els.exportOutput) return;

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
      if (els.status) {
        els.status.classList.toggle("is-success", Boolean(message));
        pulseElement(els.status);
      }
    }

    function createText(tag, className, text) {
      const el = document.createElement(tag);
      if (className) el.className = className;
      el.textContent = text || "";
      return el;
    }

    function selectedBuilderTags() {
      const groups = {};
      Object.keys(TAG_GROUPS).forEach((key) => {
        const values = Array.from(els.tags.querySelectorAll('input[data-tag-group="' + key + '"]:checked')).map((input) => input.value);
        if (values.length) groups[key] = values;
      });
      return groups;
    }

    function ratingSummaryState() {
      const summary = {};
      Object.entries(els.ratingSummary).forEach(([key, input]) => {
        if (!input || input.value === "") return;
        const value = Number(input.value);
        if (Number.isFinite(value)) summary[key] = key === "totalRatings" ? Math.max(0, Math.round(value)) : value;
      });
      return Object.keys(summary).length ? summary : null;
    }

    function cleanObject(object) {
      return Object.fromEntries(Object.entries(object).filter(([, value]) => {
        if (Array.isArray(value)) return value.length > 0;
        if (value && typeof value === "object") return Object.keys(value).length > 0;
        return value !== "" && value !== null && value !== undefined;
      }));
    }

    function addRow(type, value = "") {
      const containers = {
        ingredients: els.ingredients,
        beforeStart: els.beforeStart,
        steps: els.steps
      };
      const container = containers[type] || els.ingredients;
      const row = document.createElement("div");
      row.className = "builder-row";

      const input = type === "steps" ? document.createElement("textarea") : document.createElement("input");
      input.dataset.builderRowInput = "true";
      input.value = value;
      input.placeholder = type === "steps"
        ? "Descrie pasul de preparare"
        : type === "beforeStart"
          ? "ex. Preîncălzește cuptorul la 180°C"
          : "ex. 2 ouă";
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
        beforeStart: rowValues(els.beforeStart),
        preparation: rowValues(els.steps),
        tags: selectedBuilderTags(),
        ratingSummary: ratingSummaryState()
      };
    }

    function keywordList(state) {
      return Array.from(new Set([
        ...state.name.split(/\s+/),
        ...state.category.split(/\s+/),
        ...state.keywordsText.split(/[,\s]+/),
        ...state.ingredients.flatMap((line) => line.split(/\s+/)),
        ...Object.values(state.tags).flatMap((items) => items.flatMap((tag) => tag.split(/\s+/)))
      ].map(builderSlug).filter(Boolean)));
    }

    function publicRecipeObject() {
      const state = currentState();
      return cleanObject({
        name: state.name,
        slug: state.slug,
        category: state.category,
        description: state.description,
        ingredients: state.ingredients,
        beforeStart: state.beforeStart,
        preparation: state.preparation,
        closing: "Poftă bună!",
        extras: [],
        sourceUrl: "",
        tags: state.tags,
        ratingSummary: state.ratingSummary,
        keywords: keywordList(state)
      });
    }

    function fallbackRecipeObject() {
      const recipe = publicRecipeObject();
      return cleanObject({
        name: recipe.name,
        slug: recipe.slug,
        category: recipe.category,
        sourceUrl: recipe.sourceUrl,
        description: recipe.description,
        beforeStart: recipe.beforeStart,
        preparation: recipe.preparation,
        ingredients: recipe.ingredients,
        closing: recipe.closing,
        extras: recipe.extras,
        tags: recipe.tags,
        ratingSummary: recipe.ratingSummary
      });
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

      if (state.beforeStart.length) {
        const before = document.createElement("section");
        before.className = "builder-preview-section box before-start";
        before.append(createText("h2", "", "Înainte să începi"));
        const list = document.createElement("ul");
        list.className = "before-list";
        state.beforeStart.forEach((line) => {
          const item = document.createElement("li");
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          label.append(input, createText("span", "", line));
          item.append(label);
          list.append(item);
        });
        before.append(list);
        article.append(before);
      }

      if (Object.keys(state.tags).length) {
        const tagsSection = document.createElement("section");
        tagsSection.className = "builder-preview-section box recipe-tags";
        tagsSection.append(createText("h2", "", "Etichete rețetă"));
        const groups = document.createElement("div");
        groups.className = "tag-groups";
        Object.entries(TAG_GROUPS).forEach(([key, config]) => {
          const values = state.tags[key] || [];
          if (!values.length) return;
          const group = document.createElement("div");
          group.className = "tag-group";
          group.append(createText("h3", "", config.label));
          const list = document.createElement("div");
          list.className = "tag-list";
          values.forEach((tag) => list.append(createText("span", "tag-chip", tag)));
          group.append(list);
          groups.append(group);
        });
        tagsSection.append(groups);
        article.append(tagsSection);
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

      if (state.ratingSummary) {
        const rating = document.createElement("section");
        rating.className = "builder-preview-section box";
        rating.append(createText("h2", "", "Date evaluări publice"));
        rating.append(createText("p", "rating-note", "Se afișează public doar dacă aceste valori sunt reale."));
        const grid = document.createElement("div");
        grid.className = "rating-summary-grid";
        Object.entries(state.ratingSummary).forEach(([key, value]) => {
          const item = document.createElement("div");
          item.append(createText("span", "", key), createText("strong", "", String(value)));
          grid.append(item);
        });
        rating.append(grid);
        article.append(rating);
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
      els.beforeStart.textContent = "";
      els.steps.textContent = "";
      const importedTags = normalizedTagGroups(recipe.tags);
      els.tags.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = Boolean(importedTags[input.dataset.tagGroup] && importedTags[input.dataset.tagGroup].includes(input.value));
      });
      Object.entries(els.ratingSummary).forEach(([key, input]) => {
        if (input) input.value = recipe.ratingSummary && recipe.ratingSummary[key] !== undefined ? recipe.ratingSummary[key] : "";
      });
      (Array.isArray(recipe.ingredients) && recipe.ingredients.length ? recipe.ingredients : [""]).forEach((line) => addRow("ingredients", line));
      (Array.isArray(recipe.beforeStart) && recipe.beforeStart.length ? recipe.beforeStart : [""]).forEach((line) => addRow("beforeStart", line));
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
      els.beforeStart.textContent = "";
      els.steps.textContent = "";
      els.tags.querySelectorAll('input[type="checkbox"]').forEach((input) => {
        input.checked = false;
      });
      Object.values(els.ratingSummary).forEach((input) => {
        if (input) input.value = "";
      });
      addRow("ingredients");
      addRow("beforeStart");
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

    function populateTags() {
      els.tags.textContent = "";
      Object.entries(TAG_GROUPS).forEach(([key, config]) => {
        const group = document.createElement("section");
        group.className = "builder-tag-group";
        group.append(createText("h4", "", config.label));
        const options = document.createElement("div");
        options.className = "builder-tag-options";
        config.options.forEach((tag) => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.value = tag;
          input.dataset.tagGroup = key;
          const text = createText("span", "", tag);
          label.append(input, text);
          options.append(label);
        });
        group.append(options);
        els.tags.append(group);
      });
    }

    populateCategories();
    populateTags();
    bindRowActions(els.ingredients);
    bindRowActions(els.beforeStart);
    bindRowActions(els.steps);
    addRow("ingredients");
    addRow("beforeStart");
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

  function setupRecipeRatings() {
    document.querySelectorAll("[data-rating-panel]").forEach((panel) => {
      const slug = panel.dataset.recipeSlug;
      const form = panel.querySelector("[data-rating-form]");
      const status = panel.querySelector("[data-rating-status]");
      const personalNote = panel.querySelector("[data-rating-personal-note]");
      const reset = panel.querySelector("[data-rating-reset]");
      if (!slug || !form || !status || !personalNote || !reset) return;

      const storageKey = "artaGatituluiRatings:" + slug;

      function setStatus(message, success = false) {
        status.textContent = message || "";
        status.classList.toggle("rating-status-success", Boolean(message && success));
        pulseElement(status);
      }

      function setGroupValue(group, value) {
        const input = form.querySelector('[data-rating-group="' + group + '"] input[value="' + value + '"]');
        if (input) input.checked = true;
      }

      function clearValues() {
        form.querySelectorAll('input[type="radio"]').forEach((input) => {
          input.checked = false;
        });
        personalNote.textContent = "";
      }

      function getGroupValue(group) {
        const checked = form.querySelector('[data-rating-group="' + group + '"] input:checked');
        return checked ? checked.value : "";
      }

      function readRating() {
        const taste = Number(getGroupValue("taste"));
        const clarity = Number(getGroupValue("clarity"));
        const complexity = Number(getGroupValue("complexity"));
        const overall = Number(getGroupValue("overall"));
        const cookAgainRaw = getGroupValue("cookAgain");
        if (!taste || !clarity || !complexity || !overall || !cookAgainRaw) return null;
        return {
          taste,
          clarity,
          complexity,
          cookAgain: cookAgainRaw === "true",
          overall,
          updatedAt: new Date().toISOString()
        };
      }

      function renderPersonalNote(rating) {
        if (!rating || !rating.complexity) {
          personalNote.textContent = "";
          return;
        }
        personalNote.textContent = "Complexitatea ta: " + complexityLabel(rating.complexity) + ".";
      }

      function loadRating() {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return;
        try {
          const rating = JSON.parse(raw);
          ["taste", "clarity", "complexity", "overall"].forEach((group) => {
            if (rating[group]) setGroupValue(group, String(rating[group]));
          });
          if (typeof rating.cookAgain === "boolean") setGroupValue("cookAgain", String(rating.cookAgain));
          renderPersonalNote(rating);
        } catch {
          window.localStorage.removeItem(storageKey);
        }
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const rating = readRating();
        if (!rating) {
          setStatus("Alege toate valorile înainte să salvezi evaluarea.");
          return;
        }
        window.localStorage.setItem(storageKey, JSON.stringify(rating));
        renderPersonalNote(rating);
        setStatus("Evaluarea ta a fost salvată pe acest dispozitiv.", true);
      });

      reset.addEventListener("click", () => {
        window.localStorage.removeItem(storageKey);
        clearValues();
        setStatus("Evaluarea ta locală a fost ștearsă.", true);
      });

      loadRating();
    });
  }

  function setupInstallPrompt() {
    const prompt = document.getElementById("installPrompt");
    const installButton = prompt?.querySelector("[data-install-action]");
    const dismissButton = prompt?.querySelector("[data-install-dismiss]");
    const help = prompt?.querySelector("[data-install-help]");
    if (!prompt || !installButton || !dismissButton) return;

    const dismissedKey = "arta-gatitului-install-dismissed";
    let deferredPrompt = null;
    let nativePromptAvailable = false;

    function isInstalled() {
      return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
    }

    function hide() {
      prompt.hidden = true;
    }

    function showFallbackHint() {
      if (isInstalled() || window.localStorage.getItem(dismissedKey) === "true" || nativePromptAvailable) return;
      if (help) {
        help.hidden = false;
        help.textContent = "Pe Android folosește meniul browserului și alege Adaugă pe ecranul principal. Pe iPhone: Partajare, apoi Adaugă la ecranul principal.";
      }
      installButton.textContent = "Cum instalez?";
      prompt.hidden = false;
    }

    if (isInstalled() || window.localStorage.getItem(dismissedKey) === "true") hide();

    window.addEventListener("beforeinstallprompt", (event) => {
      if (window.localStorage.getItem(dismissedKey) === "true") return;
      event.preventDefault();
      nativePromptAvailable = true;
      deferredPrompt = event;
      if (help) help.hidden = true;
      installButton.textContent = "Instalează";
      prompt.hidden = false;
    });

    installButton.addEventListener("click", async () => {
      if (!deferredPrompt) {
        showFallbackHint();
        return;
      }
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      hide();
    });

    dismissButton.addEventListener("click", () => {
      window.localStorage.setItem(dismissedKey, "true");
      hide();
    });

    window.addEventListener("appinstalled", () => {
      window.localStorage.setItem(dismissedKey, "true");
      hide();
    });

    window.setTimeout(showFallbackHint, 2200);
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(root + "service-worker.js", { scope: root || "./" }).catch(() => {});
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
    const current = window.location.pathname.replace(/\/index\.html$/, "/");
    document.querySelectorAll(".nav-primary a, .nav-links a").forEach((link) => {
      const path = new URL(link.href).pathname.replace(/\/index\.html$/, "/");
      if (path === current) {
        link.classList.add("active");
        link.setAttribute("aria-current", "page");
      }
    });
  }

  function setupScrollReveal() {
    if (prefersReducedMotion) return;
    document.documentElement.classList.add("reveal-ready");
    if (!("IntersectionObserver" in window)) {
      markRevealTargets(document);
      document.querySelectorAll("[data-reveal]").forEach((el) => el.classList.add("is-revealed"));
      return;
    }
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-revealed");
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
    document.querySelectorAll(".grid").forEach(applyStagger);
    markRevealTargets(document);
  }

  function setupPointerEffects() {
    if (prefersReducedMotion) return;
    const canHover = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!canHover) return;
    const selector = ".card, .category-card, .btn, .nav-tool, .tag-chip, .ingredient-chip, .match-chip";
    document.addEventListener("pointermove", (event) => {
      const el = event.target.closest(selector);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      el.style.setProperty("--mx", x + "px");
      el.style.setProperty("--my", y + "px");
      if (el.classList.contains("recipe-card") || el.classList.contains("category-card")) {
        const tiltY = ((x / rect.width) - .5) * 5;
        const tiltX = ((y / rect.height) - .5) * -5;
        el.style.setProperty("--tilt-x", tiltX.toFixed(2) + "deg");
        el.style.setProperty("--tilt-y", tiltY.toFixed(2) + "deg");
        el.classList.add("is-pointer-active");
      }
    });
    document.addEventListener("pointerout", (event) => {
      const el = event.target.closest(selector);
      if (!el) return;
      el.classList.remove("is-pointer-active");
      el.style.removeProperty("--tilt-x");
      el.style.removeProperty("--tilt-y");
    });
  }

  function setupHeroSurprise() {
    const button = document.getElementById("surpriseRecipeButton");
    if (!button) return;
    button.addEventListener("click", () => {
      const recipe = pickRandom(data.recipes);
      if (recipe) window.location.href = recipeUrl(recipe.slug);
    });
  }

  function commandRecords() {
    const pages = [
      { type: "Pagini", code: "PG", title: "Acasă", meta: "Pagina principală", url: root + "index.html" },
      { type: "Pagini", code: "PG", title: "Portofoliu", meta: "Toate categoriile", url: root + "portofoliu/" },
      { type: "Pagini", code: "PG", title: "Ce pot găti?", meta: "Potrivire după ingrediente", url: root + "ce-pot-gati.html" },
      { type: "Pagini", code: "PG", title: "Randomizer", meta: "Meniu complet aleatoriu", url: root + "randomizer/" },
      { type: "Pagini", code: "PG", title: "Caută", meta: "Căutare în rețete", url: root + "cauta.html" },
      { type: "Pagini", code: "PG", title: "Creator rețetă", meta: "Adaugă o rețetă local", url: root + "adauga-reteta.html" }
    ];
    const recipes = data.recipes.map((recipe) => ({
      type: "Rețete",
      code: "RT",
      title: recipe.name,
      meta: recipe.category,
      url: recipeUrl(recipe.slug),
      tokens: recipeSearchTokens(recipe)
    }));
    const categories = data.categories.map((category) => ({
      type: "Categorii",
      code: categoryIcon(category.name),
      title: category.name,
      meta: category.description,
      url: categoryUrl(category.slug),
      tokens: new Set(tokenizeText(category.name + " " + category.description))
    }));
    const tagNames = Array.from(new Set(data.recipes.flatMap(flatTags))).sort((a, b) => a.localeCompare(b, "ro"));
    const tags = tagNames.map((tag) => ({
      type: "Etichete",
      code: "ET",
      title: tag,
      meta: "Filtrează după etichetă",
      url: searchUrl(tag),
      tokens: new Set(tokenizeText(tag))
    }));
    return [...recipes, ...categories, ...tags, ...pages.map((page) => ({
      ...page,
      tokens: new Set(tokenizeText(page.title + " " + page.meta))
    }))];
  }

  function setupCommandPalette() {
    const palette = document.getElementById("commandPalette");
    const input = document.getElementById("commandPaletteInput");
    const results = document.getElementById("commandPaletteResults");
    const openers = document.querySelectorAll("[data-open-command]");
    if (!palette || !input || !results) return;

    const records = commandRecords();
    let activeIndex = 0;
    let visible = [];
    let previousFocus = null;
    let openedAt = 0;

    function isTypingTarget(target) {
      return target && (target.matches("input, textarea, select") || target.isContentEditable);
    }

    function recordMatches(record, tokens) {
      if (!tokens.length) return true;
      return tokens.every((token) => record.tokens.has(token));
    }

    function render() {
      const tokens = tokenizeText(input.value);
      visible = records
        .filter((record) => recordMatches(record, tokens))
        .slice(0, tokens.length ? 18 : 12);
      activeIndex = Math.min(activeIndex, Math.max(visible.length - 1, 0));
      if (!visible.length) {
        results.innerHTML = '<div class="empty">Nu am găsit rezultate.</div>';
        input.removeAttribute("aria-activedescendant");
        return;
      }
      let lastType = "";
      results.innerHTML = visible.map((record, index) => {
        const section = record.type !== lastType ? '<div class="command-section-title">' + escapeHtml(record.type) + '</div>' : "";
        lastType = record.type;
        const id = "command-result-" + index;
        return section +
          '<button class="command-item' + (index === activeIndex ? ' is-active' : '') + '" id="' + id + '" type="button" role="option" aria-selected="' + (index === activeIndex ? "true" : "false") + '" data-command-index="' + index + '">' +
          '<span class="command-type" aria-hidden="true">' + escapeHtml(record.code) + '</span>' +
          '<span><span class="command-title">' + escapeHtml(record.title) + '</span><span class="command-meta">' + escapeHtml(record.meta || record.type) + '</span></span>' +
          '</button>';
      }).join("");
      input.setAttribute("aria-activedescendant", "command-result-" + activeIndex);
      applyStagger(results);
    }

    function openCommand(trigger) {
      previousFocus = trigger || document.activeElement;
      openedAt = Date.now();
      palette.hidden = false;
      palette.setAttribute("aria-hidden", "false");
      document.body.classList.add("command-open");
      input.value = "";
      render();
      window.setTimeout(() => input.focus(), 0);
    }

    function closeCommand(force = false) {
      if (!force && Date.now() - openedAt < 180) return;
      palette.hidden = true;
      palette.setAttribute("aria-hidden", "true");
      document.body.classList.remove("command-open");
      if (previousFocus && typeof previousFocus.focus === "function") previousFocus.focus();
    }

    function openActive() {
      const record = visible[activeIndex];
      if (record) window.location.href = record.url;
    }

    function bindOpenButton(button) {
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCommand(button);
      });
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (palette.hidden) openCommand(button);
      });
    }

    openers.forEach(bindOpenButton);
    function handleOpenGesture(event) {
      const button = event.target.closest("[data-open-command]");
      if (!button || palette.contains(button)) return;
      event.preventDefault();
      event.stopPropagation();
      if (palette.hidden) openCommand(button);
    }

    document.addEventListener("pointerdown", handleOpenGesture, true);
    document.addEventListener("click", handleOpenGesture, true);
    palette.querySelector("[data-command-backdrop]")?.addEventListener("pointerdown", () => closeCommand());
    palette.querySelectorAll("[data-command-close]").forEach((button) => button.addEventListener("click", () => closeCommand(true)));
    input.addEventListener("input", () => {
      activeIndex = 0;
      render();
    });
    results.addEventListener("click", (event) => {
      const item = event.target.closest("[data-command-index]");
      if (!item) return;
      activeIndex = Number(item.dataset.commandIndex) || 0;
      openActive();
    });
    document.addEventListener("keydown", (event) => {
      const isShortcut = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k";
      const isSlash = event.key === "/" && !isTypingTarget(event.target);
      if ((isShortcut || isSlash) && palette.hidden) {
        event.preventDefault();
        openCommand(document.activeElement);
        return;
      }
      if (palette.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeCommand(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        activeIndex = Math.min(activeIndex + 1, visible.length - 1);
        render();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
        render();
      } else if (event.key === "Enter") {
        event.preventDefault();
        openActive();
      }
    });
  }

  function setupThemeSwitcher() {
    const panel = document.getElementById("themePanel");
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!panel || !toggle) return;
    const buttons = Array.from(panel.querySelectorAll("[data-theme-choice]"));

    function applyTheme(theme) {
      if (theme) {
        document.documentElement.dataset.theme = theme;
        window.localStorage.setItem(THEME_KEY, theme);
      } else {
        document.documentElement.removeAttribute("data-theme");
        window.localStorage.removeItem(THEME_KEY);
      }
      buttons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.themeChoice === theme)));
    }

    function setOpen(open) {
      panel.hidden = !open;
      panel.setAttribute("aria-hidden", String(!open));
      toggle.setAttribute("aria-expanded", String(open));
    }

    applyTheme(window.localStorage.getItem(THEME_KEY) || document.documentElement.dataset.theme || "");
    toggle.addEventListener("click", () => setOpen(panel.hidden));
    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        applyTheme(button.dataset.themeChoice || "");
        setOpen(false);
      });
    });
    document.addEventListener("click", (event) => {
      if (panel.hidden) return;
      if (!panel.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setOpen(false);
    });
  }

  function setupQuickActions() {
    if (document.querySelector(".quick-actions")) return;
    const hasRating = Boolean(document.querySelector("[data-rating-panel]"));
    const wrap = document.createElement("div");
    wrap.className = "quick-actions";
    wrap.setAttribute("aria-label", "Acțiuni rapide");
    wrap.innerHTML = [
      '<button class="quick-action" type="button" data-quick-top aria-label="Sus" title="Sus">↑</button>',
      '<button class="quick-action" type="button" data-open-command aria-label="Caută rapid" title="Caută rapid">K</button>',
      '<button class="quick-action" type="button" data-quick-random aria-label="Rețetă aleatorie" title="Rețetă aleatorie">R</button>',
      hasRating ? '<button class="quick-action" type="button" data-quick-rate aria-label="Evaluează rețeta" title="Evaluează">★</button>' : "",
      '<button class="quick-action" type="button" data-quick-copy aria-label="Copiază linkul" title="Copiază linkul">⧉</button>',
      '<span class="quick-action-status" data-quick-status hidden></span>'
    ].join("");
    document.body.append(wrap);
    const status = wrap.querySelector("[data-quick-status]");
    function flash(message) {
      if (!status) return;
      status.textContent = message;
      status.hidden = false;
      window.setTimeout(() => {
        status.hidden = true;
      }, 1400);
    }
    wrap.addEventListener("click", async (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.matches("[data-quick-top]")) {
        window.scrollTo({ top: 0, behavior: prefersReducedMotion ? "auto" : "smooth" });
      } else if (button.matches("[data-quick-random]")) {
        const recipe = pickRandom(data.recipes);
        if (recipe) window.location.href = recipeUrl(recipe.slug);
      } else if (button.matches("[data-quick-rate]")) {
        const rating = document.querySelector("[data-rating-panel]");
        if (rating) rating.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth", block: "start" });
      } else if (button.matches("[data-quick-copy]")) {
        try {
          await navigator.clipboard.writeText(window.location.href);
          flash("Copiat!");
        } catch {
          flash("Selectează linkul din bară.");
        }
      }
    });
  }

  function setupScrollProgress() {
    const progress = document.querySelector("[data-scroll-progress]");
    if (!progress || !document.body.dataset.recipeSlug) return;
    const bar = progress.querySelector("span");
    progress.classList.add("is-visible");
    let ticking = false;
    function update() {
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      const value = Math.min(100, Math.max(0, (window.scrollY / max) * 100));
      progress.style.setProperty("--progress", value.toFixed(2) + "%");
      if (bar) bar.style.width = value.toFixed(2) + "%";
      ticking = false;
    }
    function requestUpdate() {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    }
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);
    update();
  }

  function setupOfflineBadge() {
    const badge = document.getElementById("offlineBadge");
    if (!badge) return;
    function update() {
      badge.hidden = navigator.onLine !== false;
    }
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    update();
  }

  function setupBeforeStartChecklist() {
    document.addEventListener("change", (event) => {
      const input = event.target.closest(".before-list input[type='checkbox']");
      if (!input) return;
      const label = input.closest("label");
      if (!label) return;
      label.classList.toggle("is-checked", input.checked);
      if (input.checked) pulseElement(label);
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
    setupThemeSwitcher();
    renderFeatured();
    renderAllRecipes();
    renderCategories();
    setupSearch();
    setupPrefilledSearch();
    setupIngredientMatcher();
    renderRecipeDetail();
    setupRecipeRatings();
    renderCategoryPage();
    setupRandomizer();
    setupSteakCalculators();
    setupRecipeBuilder();
    setupHeroSurprise();
    setupBeforeStartChecklist();
    setupQuickActions();
    setupCommandPalette();
    setupScrollProgress();
    setupScrollReveal();
    setupPointerEffects();
    setupOfflineBadge();
    setupInstallPrompt();
    registerServiceWorker();
  });
})();
