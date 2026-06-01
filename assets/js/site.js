
(function () {
  const root = window.ARTA_ROOT || "";
  const data = window.ARTA_DATA || { categories: [], recipes: [] };

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  }

  function recipeUrl(slug) {
    return root + "retete/" + slug + "/";
  }

  function categoryUrl(slug) {
    return root + "categorie/" + slug + "/";
  }

  function categorySlug(name) {
    const found = data.categories.find(c => c.name === name);
    return found ? found.slug : normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  }

  function searchableRecipeText(recipe) {
    return normalize([
      recipe.name,
      recipe.category,
      recipe.description,
      (recipe.ingredients || []).join(" "),
      (recipe.steps || []).join(" "),
      (recipe.keywords || []).join(" ")
    ].join(" "));
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function card(recipe) {
    const ingredients = (recipe.ingredients || []).slice(0, 8).join(", ");
    return `
      <article class="card">
        <span class="category-pill">${escapeHtml(recipe.category)}</span>
        <h3>${escapeHtml(recipe.name)}</h3>
        <p>${escapeHtml(recipe.description || "")}</p>
        <div class="ingredients-preview"><strong>Ingrediente:</strong> ${escapeHtml(ingredients)}${recipe.ingredients && recipe.ingredients.length > 8 ? "..." : ""}</div>
        <a class="btn secondary" href="${recipeUrl(recipe.slug)}">Deschide rețeta</a>
      </article>
    `;
  }

  function renderRecipeCards(elementId, recipes) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.innerHTML = recipes.length
      ? recipes.map(card).join("")
      : `<div class="empty">Nu există rețete de afișat încă.</div>`;
  }

  function renderFeatured() {
    renderRecipeCards("featuredRecipes", data.recipes.slice(0, 6));
  }

  function renderAllRecipes() {
    renderRecipeCards("allRecipes", data.recipes);
  }

  function renderCategories() {
    const el = document.getElementById("categoryGrid");
    if (!el) return;
    el.innerHTML = data.categories.map(category => {
      const count = data.recipes.filter(r => r.category === category.name).length;
      return `
        <a class="category-card" href="${categoryUrl(category.slug)}">
          <strong>${escapeHtml(category.name)}</strong>
          <span>${escapeHtml(category.description)}<br>${count} ${count === 1 ? "rețetă" : "rețete"}</span>
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

    category.innerHTML = `<option value="all">Toate categoriile</option>` + data.categories.map(c => `<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join("");

    function run() {
      const terms = normalize(input.value).split(/\s+/).filter(Boolean);
      const selected = category.value;
      const matches = data.recipes.filter(recipe => {
        if (selected !== "all" && recipe.category !== selected) return false;
        const haystack = searchableRecipeText(recipe);
        return terms.every(term => haystack.includes(term));
      });

      count.textContent = matches.length === 1 ? "1 rețetă găsită" : `${matches.length} rețete găsite`;
      results.innerHTML = matches.length
        ? matches.map(card).join("")
        : `<div class="empty">Nu am găsit nicio rețetă. Încearcă alt ingredient, fără diacritice sau cu mai puține cuvinte.</div>`;
    }

    input.addEventListener("input", run);
    category.addEventListener("change", run);
    run();
  }

  function renderRecipeDetail() {
    const el = document.getElementById("recipeDetail");
    if (!el) return;
    const slug = document.body.dataset.recipeSlug;
    const recipe = data.recipes.find(r => r.slug === slug);
    if (!recipe) {
      el.innerHTML = `<div class="empty">Rețeta nu a fost găsită.</div>`;
      return;
    }
    document.title = recipe.name + " | Arta Gătitului";
    const catSlug = categorySlug(recipe.category);
    el.innerHTML = `
      <article class="recipe-detail-card">
        <span class="pill">${escapeHtml(recipe.category)}</span>
        <h1>${escapeHtml(recipe.name)}</h1>
        <p class="lead">${escapeHtml(recipe.description || "")}</p>
        <div class="detail-meta">
          <a class="btn secondary" href="${categoryUrl(catSlug)}">Vezi categoria</a>
          <a class="btn" href="${root}cauta.html?q=${encodeURIComponent(recipe.name)}">Caută rețete similare</a>
        </div>
        <div class="recipe-layout">
          <section class="box">
            <h2>Ingrediente</h2>
            <ul class="clean">
              ${(recipe.ingredients || []).map(i => `<li>${escapeHtml(i)}</li>`).join("")}
            </ul>
          </section>
          <section class="box">
            <h2>Mod de preparare</h2>
            <ol class="clean">
              ${(recipe.steps || []).map(s => `<li>${escapeHtml(s)}</li>`).join("")}
            </ol>
          </section>
        </div>
      </article>
    `;
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

  function renderCategoryPage() {
    const title = document.getElementById("categoryTitle");
    const desc = document.getElementById("categoryDescription");
    const list = document.getElementById("categoryRecipes");
    if (!title || !list) return;
    const slug = document.body.dataset.categorySlug;
    const category = data.categories.find(c => c.slug === slug);
    if (!category) {
      title.textContent = "Categorie negăsită";
      list.innerHTML = `<div class="empty">Această categorie nu există.</div>`;
      return;
    }
    document.title = category.name + " | Arta Gătitului";
    title.textContent = category.name;
    if (desc) desc.textContent = category.description;
    renderRecipeCards("categoryRecipes", data.recipes.filter(r => r.category === category.name));
  }

  function setupMobileMenu() {
    const btn = document.querySelector(".mobile-menu-btn");
    const links = document.querySelector(".nav-links");
    if (!btn || !links) return;
    btn.addEventListener("click", () => links.classList.toggle("open"));
  }

  function markActiveNav() {
    const current = window.location.pathname.replace(/\/index\.html$/, "/");
    document.querySelectorAll(".nav-links a").forEach(a => {
      const path = new URL(a.href).pathname.replace(/\/index\.html$/, "/");
      if (path === current) a.classList.add("active");
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
  });
})();
