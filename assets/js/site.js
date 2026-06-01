(function () {
  const root = window.ARTA_ROOT || "";
  const data = window.ARTA_DATA || { categories: [], recipes: [], aliases: {} };

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

  function categorySlug(name) {
    const category = data.categories.find((item) => item.name === name);
    return category ? category.slug : normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function recipeBySlug(slug) {
    const resolved = data.aliases && data.aliases[slug] ? data.aliases[slug] : slug;
    return data.recipes.find((recipe) => recipe.slug === resolved);
  }

  function isSubheading(line) {
    return /:$/.test(line) || /^[A-ZĂÂÎȘȚ0-9\s/-]{3,}$/.test(line);
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
    return `
      <article class="card">
        <span class="category-pill">${escapeHtml(recipe.category)}</span>
        <h3 id="${titleId}">${escapeHtml(recipe.name)}</h3>
        <p>${escapeHtml(recipe.description || "")}</p>
        <div class="ingredients-preview"><strong>Ingrediente:</strong> ${escapeHtml(ingredients)}${recipe.ingredients && recipe.ingredients.length > 5 ? "..." : ""}</div>
        <a class="btn secondary" aria-label="Vezi rețeta: ${escapeHtml(recipe.name)}" href="${recipeUrl(recipe.slug)}">Vezi rețeta</a>
      </article>
    `;
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
      return `
        <a class="category-card" href="${categoryUrl(category.slug)}">
          <strong>${escapeHtml(category.name)}</strong>
          <span>${escapeHtml(category.description)}<br>${count ? countLabel : "urmează rețete noi"}</span>
        </a>
      `;
    }).join("");
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
      const terms = normalize(input.value).split(/\s+/).filter(Boolean);
      const selected = category.value;
      const matches = data.recipes.filter((recipe) => {
        if (selected !== "all" && recipe.category !== selected) return false;
        const haystack = searchableRecipeText(recipe);
        return terms.every((term) => haystack.includes(term));
      });

      count.textContent = matches.length === 1 ? "1 rețetă găsită" : `${matches.length} rețete găsite`;
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
      return `<li${cls}>${escapeHtml(line)}</li>`;
    }).join("");
    return `<${tag} class="clean">${items}</${tag}>`;
  }

  function steakCalculator(extra) {
    if (!extra || extra.type !== "steak-calculator") return "";
    return `
      <section class="steak-calculator">
        <h2>${escapeHtml(extra.title)}</h2>
        <div class="steak-grid">
          <div class="steak-chip"><strong>Rare</strong><span>50-52°C</span></div>
          <div class="steak-chip"><strong>Medium rare</strong><span>55-57°C</span></div>
          <div class="steak-chip"><strong>Medium</strong><span>60-63°C</span></div>
          <div class="steak-chip"><strong>Well done</strong><span>70°C+</span></div>
        </div>
      </section>
    `;
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
            <a class="btn" href="${root}cauta.html?q=${encodeURIComponent(recipe.name)}">Caută similare</a>
          </div>
        </div>
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
        ${(recipe.extras || []).map(steakCalculator).join("")}
      </article>
      ${related.length ? `<section class="related"><h2>Din aceeași categorie</h2><div class="grid cards">${related.map(card).join("")}</div></section>` : ""}
    `;
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

  function setupRandomizer() {
    const button = document.getElementById("randomRecipeButton");
    const result = document.getElementById("randomRecipeResult");
    if (!button || !result) return;

    function choose() {
      const recipe = data.recipes[Math.floor(Math.random() * data.recipes.length)];
      result.innerHTML = recipe ? card(recipe) : '<div class="empty">Nu există încă rețete pentru randomizer.</div>';
    }

    button.addEventListener("click", choose);
    choose();
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
    document.querySelectorAll(".nav-links a").forEach((link) => {
      const path = new URL(link.href).pathname.replace(/\/index\.html$/, "/");
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
  });
})();
