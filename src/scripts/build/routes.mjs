const STATIC_ROUTES = [
  'index.html',
  'adauga-reteta.html',
  'categorii.html',
  'cauta.html',
  'ce-pot-gati.html',
  'offline.html',
  'portofoliu/index.html',
  'randomizer/index.html',
  'soon-to-come/index.html',
];

function routePath(value) {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

export function buildRoutePlan({ categories, recipes, aliases }) {
  const routes = [];
  const recipeSlugs = new Set();
  const categorySlugs = new Set();
  const aliasEntries = Object.entries(aliases || {});

  function add(kind, id, filePath) {
    routes.push({ kind, id, filePath: routePath(filePath) });
  }

  for (const filePath of STATIC_ROUTES) {
    add('static', filePath, filePath);
  }

  for (const category of categories) {
    if (!category.slug) throw new Error(`Category "${category.name || category.title || '(unknown)'}" has no valid slug.`);
    if (categorySlugs.has(category.slug)) throw new Error(`Duplicate category slug: ${category.slug}`);
    categorySlugs.add(category.slug);
    add('category', category.slug, `categorie/${category.slug}/index.html`);
    add('category-alias', category.slug, `${category.slug}/index.html`);
  }

  for (const recipe of recipes) {
    if (!recipe.slug) throw new Error(`Recipe "${recipe.name || recipe.title || '(unknown)'}" has no valid slug.`);
    if (recipeSlugs.has(recipe.slug)) throw new Error(`Duplicate recipe slug: ${recipe.slug}`);
    recipeSlugs.add(recipe.slug);
    add('recipe', recipe.slug, `retete/${recipe.slug}/index.html`);
    add('recipe-alias', recipe.slug, `${recipe.slug}/index.html`);
  }

  for (const [alias, target] of aliasEntries) {
    if (!recipeSlugs.has(target)) {
      throw new Error(`Recipe alias "${alias}" points to missing recipe slug "${target}".`);
    }
    add('legacy-recipe', alias, `retete/${alias}/index.html`);
    add('legacy-recipe-alias', alias, `${alias}/index.html`);
  }

  return { routes, aliasEntries };
}

export function validateRoutePlan(routePlan) {
  const seen = new Map();
  const collisions = [];

  for (const route of routePlan.routes) {
    const previous = seen.get(route.filePath);
    if (previous) {
      collisions.push(`${route.filePath} (${previous.kind}:${previous.id} vs ${route.kind}:${route.id})`);
    } else {
      seen.set(route.filePath, route);
    }
  }

  if (collisions.length) {
    throw new Error(`Generated route collisions detected:\n- ${collisions.join('\n- ')}`);
  }

  return routePlan;
}
