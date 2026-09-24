const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SYSTEM_PAGE_ROUTES = Object.freeze([
  'assets',
  'categorie',
  'retete',
  'randomizer',
  'portofoliu',
  'soon-to-come',
  'categorii',
  'cauta',
  'ce-pot-gati',
  'adauga-reteta',
  'offline',
  'index',
]);

export function validatePageSlug(value, {
  pageType = 'standard',
  recipeSlugs = [],
  categorySlugs = [],
  aliasSlugs = [],
  pageSlugs = [],
  currentSlug = null,
} = {}) {
  const slug = String(value || '').trim();
  const errors = [];
  if (!SAFE_SLUG.test(slug) || slug.length > 120) {
    errors.push('Page slug must use lowercase letters, numbers, and single hyphens only.');
    return { valid: false, errors };
  }
  if (pageType === 'home') {
    if (slug !== 'home') errors.push('The Homepage slug must remain home.');
    return { valid: errors.length === 0, errors };
  }
  const reserved = new Set(SYSTEM_PAGE_ROUTES);
  if (slug === 'home' || reserved.has(slug)) errors.push(`The route "${slug}" is reserved by the website.`);
  if (recipeSlugs.includes(slug) || aliasSlugs.includes(slug)) errors.push(`The route "${slug}" belongs to a recipe.`);
  if (categorySlugs.includes(slug)) errors.push(`The route "${slug}" belongs to a category.`);
  if (slug !== currentSlug && pageSlugs.includes(slug)) errors.push(`A page already uses the route "${slug}".`);
  return { valid: errors.length === 0, errors };
}

export function pageOutputPath(page) {
  return page.pageType === 'home' ? 'index.html' : `${page.slug}/index.html`;
}
