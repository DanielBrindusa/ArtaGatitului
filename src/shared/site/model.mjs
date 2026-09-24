import { BLOCK_MODEL_VERSION, BLOCK_TYPE_VALUES, BLOCK_TYPES, LAYOUT_WIDTHS, SPACING_TOKENS } from '../blocks/model.mjs';
import { isSafeContentUrl } from '../utils/html.mjs';
import { validateBlock } from '../validation/blocks.mjs';

export const SITE_MODEL_VERSION = 1;
export const SITE_SOURCE_PATHS = Object.freeze([
  'src/content/site/templates.json',
  'src/content/site/global-blocks.json',
  'src/content/site/navigation.json',
  'src/content/site/settings.json',
  'src/content/site/theme.json',
  'src/content/categories.json',
  'src/data/tag-groups.json',
]);
export const TEMPLATE_CONTENT_TYPES = Object.freeze(['recipe', 'page', 'category']);
export const TEMPLATE_MODES = Object.freeze(['linked', 'detached']);
export const NAVIGATION_ITEM_TYPES = Object.freeze(['home', 'page', 'recipe', 'category', 'system', 'external', 'group']);
export const MAX_NAVIGATION_DEPTH = 2;
export const APPROVED_FONTS = Object.freeze(['cinzel', 'source-sans-3', 'system-serif', 'system-sans']);

export const DEFAULT_THEME = Object.freeze({
  modelVersion: SITE_MODEL_VERSION,
  colors: Object.freeze({
    primary: '#ff8a5b', accent: '#62d6a8', background: '#0f1117', surface: '#181d29',
    text: '#fff3e8', mutedText: '#d4bba8', border: '#ffd6ba2e',
  }),
  typography: Object.freeze({ headingFont: 'cinzel', bodyFont: 'source-sans-3', fontScale: 'default' }),
  layout: Object.freeze({ contentWidth: 'wide', sectionSpacing: 'default', cardPadding: 'default' }),
  shape: Object.freeze({ cardRadius: 'md', buttonRadius: 'sm' }),
  cards: Object.freeze({ border: 'subtle', shadow: 'soft' }),
  buttons: Object.freeze({ size: 'default' }),
});

const SAFE_ID = /^[a-z][a-z0-9-]{0,79}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SAFE_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const SYSTEM_TARGETS = new Set(['portfolio', 'ingredient-matcher', 'randomizer', 'search', 'categories', 'recipe-builder']);
const THEME_ENUMS = Object.freeze({
  fontScale: ['compact', 'default', 'large'],
  contentWidth: ['medium', 'wide', 'full'],
  sectionSpacing: ['compact', 'default', 'relaxed'],
  cardPadding: ['compact', 'default', 'comfortable'],
  cardRadius: ['none', 'sm', 'md'],
  buttonRadius: ['none', 'sm', 'md'],
  border: ['none', 'subtle', 'strong'],
  shadow: ['none', 'soft', 'strong'],
  size: ['compact', 'default', 'large'],
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function record(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function string(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (record(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value ?? null;
}

export function sameStructuredValue(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

export function normalizeTemplateAssignment(value, defaultTemplateId = null) {
  if (!record(value)) {
    return defaultTemplateId ? { id: defaultTemplateId, mode: 'linked', overrides: {} } : null;
  }
  return {
    id: typeof value.id === 'string' && value.id ? value.id : null,
    mode: TEMPLATE_MODES.includes(value.mode) ? value.mode : 'linked',
    overrides: record(value.overrides) ? clone(value.overrides) : {},
  };
}

export function validateTemplateAssignment(value, templates = [], contentType = null) {
  const errors = [];
  if (value === null || value === undefined) return { valid: true, errors };
  if (!record(value)) return { valid: false, errors: ['template must be an object or null'] };
  if (!TEMPLATE_MODES.includes(value.mode)) errors.push('template.mode must be linked or detached');
  if (value.mode === 'linked') {
    if (!SAFE_ID.test(value.id ?? '')) errors.push('template.id must be a safe template identifier');
    const template = templates.find((entry) => entry.id === value.id);
    if (templates.length && !template) errors.push(`template "${value.id}" does not exist`);
    if (template && contentType && template.contentType !== contentType) errors.push('template is not compatible with this content type');
  } else if (value.id !== null) {
    errors.push('detached content must not retain a template id');
  }
  if (!record(value.overrides)) errors.push('template.overrides must be an object');
  return { valid: errors.length === 0, errors };
}

function mergePresentation(block, slot, override = {}) {
  return {
    ...block,
    layout: { ...(block.layout || {}), ...(slot.layout || {}), ...(override.layout || {}) },
    responsive: { ...(block.responsive || {}), ...(slot.responsive || {}), ...(override.responsive || {}) },
    variant: override.variant ?? slot.variant ?? block.variant,
    style: { ...(block.style || {}), ...(slot.style || {}), ...(override.style || {}) },
  };
}

export function resolveTemplateLayout(layout, assignment, templates = []) {
  const source = record(layout) && Array.isArray(layout.blocks)
    ? { modelVersion: BLOCK_MODEL_VERSION, blocks: clone(layout.blocks) }
    : { modelVersion: BLOCK_MODEL_VERSION, blocks: [] };
  const normalized = normalizeTemplateAssignment(assignment);
  if (!normalized || normalized.mode === 'detached' || !normalized.id) return source;
  const template = templates.find((entry) => entry.id === normalized.id);
  if (!template) return source;

  const remaining = [...source.blocks];
  const ordered = [];
  for (const slot of template.slots || []) {
    const index = remaining.findIndex((block) => block.id === slot.id || block.type === slot.type);
    if (index < 0) continue;
    const [block] = remaining.splice(index, 1);
    ordered.push(mergePresentation(block, slot, normalized.overrides?.[slot.id]));
  }
  return { modelVersion: BLOCK_MODEL_VERSION, blocks: [...ordered, ...remaining] };
}

export function updateTemplateBlockOverride(assignment, templates, block, patch) {
  const normalized = normalizeTemplateAssignment(assignment);
  if (!normalized || normalized.mode !== 'linked' || !normalized.id || !record(block) || !record(patch)) return null;
  const template = templates.find((entry) => entry.id === normalized.id);
  const slot = template?.slots?.find((entry) => entry.id === block.id || entry.type === block.type);
  if (!slot) return null;
  const current = record(normalized.overrides[slot.id]) ? normalized.overrides[slot.id] : {};
  const responsive = record(patch.responsive)
    ? Object.fromEntries(Object.entries(patch.responsive).map(([breakpoint, value]) => [
      breakpoint,
      { ...(record(current.responsive?.[breakpoint]) ? current.responsive[breakpoint] : {}), ...(record(value) ? value : {}) },
    ]))
    : {};
  return {
    ...normalized,
    overrides: {
      ...normalized.overrides,
      [slot.id]: {
        ...current,
        ...patch,
        ...(record(patch.layout) ? { layout: { ...(record(current.layout) ? current.layout : {}), ...patch.layout } } : {}),
        ...(record(patch.responsive) ? { responsive: { ...(record(current.responsive) ? current.responsive : {}), ...responsive } } : {}),
        ...(record(patch.style) ? { style: { ...(record(current.style) ? current.style : {}), ...patch.style } } : {}),
      },
    },
  };
}

export function detachFromTemplate(content, templates = []) {
  return {
    ...content,
    layout: resolveTemplateLayout(content.layout, content.template, templates),
    template: { id: null, mode: 'detached', overrides: {} },
  };
}

export function resetToTemplate(content, templateId) {
  return { ...content, template: { id: templateId, mode: 'linked', overrides: {} } };
}

export function templateUsage(templates, contents) {
  return (templates || []).map((template) => {
    const usedBy = (contents || []).filter((item) => item.template?.mode === 'linked' && item.template?.id === template.id);
    return { templateId: template.id, count: usedBy.length, items: usedBy.slice(0, 8).map((item) => item.title || item.name || item.slug || item.id) };
  });
}

export function replaceTemplateAndDelete(templates, contents, templateId, replacementId) {
  if (templateId === replacementId) throw new Error('Choose a different replacement template.');
  const target = templates.find((entry) => entry.id === templateId);
  const replacement = templates.find((entry) => entry.id === replacementId);
  if (!target || !replacement || target.contentType !== replacement.contentType) throw new Error('A compatible replacement template is required.');
  const nextContents = contents.map((item) => item.template?.id === templateId
    ? resetToTemplate(item, replacementId)
    : clone(item));
  return { templates: templates.filter((entry) => entry.id !== templateId), contents: nextContents };
}

export function collectGlobalBlockUsage(pages, globalId) {
  const usedBy = [];
  function hasReference(blocks) {
    return (blocks || []).some((block) => block?.type === BLOCK_TYPES.GLOBAL_REFERENCE && block.data?.globalId === globalId
      || hasReference(block?.data?.blocks));
  }
  for (const page of pages || []) if (hasReference(page.layout?.blocks)) usedBy.push({ id: page.id, slug: page.slug, title: page.title });
  return usedBy;
}

export function detachGlobalBlockReference(reference, globalBlocks, nextId) {
  const global = (globalBlocks || []).find((entry) => entry.id === reference?.data?.globalId);
  if (!global) throw new Error('The referenced global block does not exist.');
  if (!SAFE_ID.test(nextId ?? '')) throw new Error('The local block id is invalid.');
  return { ...clone(global.block), id: nextId };
}

export function assertGlobalBlockDeletion(globalId, pages) {
  const usage = collectGlobalBlockUsage(pages, globalId);
  if (usage.length) throw new Error(`Global block is used on ${usage.length} page${usage.length === 1 ? '' : 's'}.`);
  return true;
}

function validateNavigationItem(item, context, errors, depth, ids, path) {
  if (!record(item)) {
    errors.push(`${path} must be an object`);
    return;
  }
  if (depth > MAX_NAVIGATION_DEPTH) errors.push(`${path} exceeds the maximum submenu depth`);
  if (!SAFE_ID.test(item.id ?? '')) errors.push(`${path}.id is invalid`);
  if (ids.has(item.id)) errors.push(`${path}.id is duplicated`);
  ids.add(item.id);
  if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80) errors.push(`${path}.label is invalid`);
  if (!NAVIGATION_ITEM_TYPES.includes(item.type)) errors.push(`${path}.type is invalid`);
  const target = string(item.target);
  if (item.type === 'home' && target !== 'home') errors.push(`${path}.target must be home`);
  if (item.type === 'page' && !(context.pageSlugs || []).includes(target)) errors.push(`${path}.target references a missing page`);
  if (item.type === 'recipe' && !(context.recipeSlugs || []).includes(target)) errors.push(`${path}.target references a missing recipe`);
  if (item.type === 'category' && !(context.categorySlugs || []).includes(target)) errors.push(`${path}.target references a missing category`);
  if (item.type === 'system' && !SYSTEM_TARGETS.has(target)) errors.push(`${path}.target is not an approved system route`);
  if (item.type === 'external' && (!isSafeContentUrl(target) || !/^https?:\/\//i.test(target))) errors.push(`${path}.target must be a safe HTTP(S) URL`);
  if (item.type === 'group' && target) errors.push(`${path}.target must be empty for a non-clickable group`);
  if (!Array.isArray(item.children)) errors.push(`${path}.children must be an array`);
  else item.children.forEach((child, index) => validateNavigationItem(child, context, errors, depth + 1, ids, `${path}.children[${index}]`));
}

export function validateNavigation(value, context = {}) {
  const errors = [];
  if (!record(value)) return { valid: false, errors: ['navigation must be an object'] };
  if (value.modelVersion !== SITE_MODEL_VERSION) errors.push(`navigation.modelVersion must be ${SITE_MODEL_VERSION}`);
  const header = value.header;
  const footer = value.footer;
  if (!record(header)) errors.push('navigation.header must be an object');
  if (!record(footer)) errors.push('navigation.footer must be an object');
  const ids = new Set();
  for (const [key, items] of [['primaryItems', header?.primaryItems], ['menuItems', header?.menuItems], ['links', footer?.links], ['socialLinks', footer?.socialLinks]]) {
    if (!Array.isArray(items)) errors.push(`navigation.${key} must be an array`);
    else items.forEach((item, index) => validateNavigationItem(item, context, errors, 1, ids, `navigation.${key}[${index}]`));
  }
  if (typeof header?.logoMark !== 'string' || !header.logoMark.trim() || header.logoMark.length > 8) errors.push('navigation.header.logoMark is invalid');
  if (typeof header?.siteTitle !== 'string' || !header.siteTitle.trim() || header.siteTitle.length > 100) errors.push('navigation.header.siteTitle is invalid');
  if (header?.logoHref !== 'home') errors.push('navigation.header.logoHref must keep an accessible path home');
  if (typeof footer?.copyright !== 'string' || !footer.copyright.trim() || footer.copyright.length > 240) errors.push('navigation.footer.copyright is invalid');
  return { valid: errors.length === 0, errors };
}

export function reorderNavigationItems(items, fromIndex, toIndex) {
  if (!Array.isArray(items) || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function navigationTargetHref(item, root = '') {
  const target = string(item?.target);
  if (item?.type === 'external') return target;
  if (item?.type === 'home') return `${root}index.html`;
  if (item?.type === 'page') return target === 'home' ? `${root}index.html` : `${root}${target}/`;
  if (item?.type === 'recipe') return `${root}retete/${target}/`;
  if (item?.type === 'category') return `${root}${target}/`;
  const system = {
    portfolio: 'portofoliu/', 'ingredient-matcher': 'ce-pot-gati.html', randomizer: 'randomizer/',
    search: 'cauta.html', categories: 'categorii.html', 'recipe-builder': 'adauga-reteta.html',
  };
  return item?.type === 'system' && system[target] ? `${root}${system[target]}` : '';
}

export function validateTheme(value) {
  const errors = [];
  if (!record(value)) return { valid: false, errors: ['theme must be an object'] };
  if (value.modelVersion !== SITE_MODEL_VERSION) errors.push(`theme.modelVersion must be ${SITE_MODEL_VERSION}`);
  for (const key of Object.keys(DEFAULT_THEME.colors)) if (!SAFE_COLOR.test(value.colors?.[key] ?? '')) errors.push(`theme.colors.${key} must be a six- or eight-digit hex color`);
  if (!APPROVED_FONTS.includes(value.typography?.headingFont)) errors.push('theme.typography.headingFont is not approved');
  if (!APPROVED_FONTS.includes(value.typography?.bodyFont)) errors.push('theme.typography.bodyFont is not approved');
  for (const [section, key] of [['typography', 'fontScale'], ['layout', 'contentWidth'], ['layout', 'sectionSpacing'], ['layout', 'cardPadding'], ['shape', 'cardRadius'], ['shape', 'buttonRadius'], ['cards', 'border'], ['cards', 'shadow'], ['buttons', 'size']]) {
    if (!THEME_ENUMS[key].includes(value[section]?.[key])) errors.push(`theme.${section}.${key} is not an approved token`);
  }
  return { valid: errors.length === 0, errors };
}

export function resetTheme() {
  return clone(DEFAULT_THEME);
}

export function renderSiteThemeCss(themeValue) {
  const theme = validateTheme(themeValue).valid ? themeValue : DEFAULT_THEME;
  const headingFonts = { cinzel: 'Cinzel, Georgia, serif', 'source-sans-3': '"Source Sans 3", Arial, sans-serif', 'system-serif': 'Georgia, serif', 'system-sans': 'Arial, sans-serif' };
  const bodyFonts = headingFonts;
  const widths = { medium: '880px', wide: '1180px', full: '100%' };
  const scales = { compact: '.94', default: '1', large: '1.08' };
  const spacing = { compact: '.8', default: '1', relaxed: '1.2' };
  const padding = { compact: '16px', default: '24px', comfortable: '32px' };
  const radius = { none: '0', sm: '6px', md: '8px' };
  const shadow = { none: 'none', soft: '0 14px 38px rgba(0,0,0,.28)', strong: '0 22px 60px rgba(0,0,0,.42)' };
  const border = { none: 'transparent', subtle: theme.colors.border, strong: theme.colors.text };
  const buttonPadding = { compact: '9px 14px', default: '12px 18px', large: '15px 22px' };
  return `:root{--color-primary:${theme.colors.primary};--color-secondary:${theme.colors.accent};--color-bg:${theme.colors.background};--color-surface:${theme.colors.surface};--color-text:${theme.colors.text};--color-text-muted:${theme.colors.mutedText};--color-border:${theme.colors.border};--font-heading:${headingFonts[theme.typography.headingFont]};--font-body:${bodyFonts[theme.typography.bodyFont]};--font-scale:${scales[theme.typography.fontScale]};--container:${widths[theme.layout.contentWidth]};--section-spacing-scale:${spacing[theme.layout.sectionSpacing]};--card-padding:${padding[theme.layout.cardPadding]};--radius-card:${radius[theme.shape.cardRadius]};--radius-button:${radius[theme.shape.buttonRadius]};--card-border:${border[theme.cards.border]};--shadow-card:${shadow[theme.cards.shadow]};--button-padding:${buttonPadding[theme.buttons.size]};}`;
}

export function renameCategory(categories, recipes, navigation, categoryId, changes) {
  const current = categories.find((category) => category.id === categoryId);
  if (!current) throw new Error('Category does not exist.');
  const title = string(changes.title, current.title).trim();
  const slug = string(changes.slug, current.slug).trim();
  if (!title || title.length > 100 || !SAFE_SLUG.test(slug)) throw new Error('Category title or slug is invalid.');
  if (categories.some((category) => category.id !== categoryId && category.slug === slug)) throw new Error('Category slug is already in use.');
  const nextCategories = categories.map((category) => category.id === categoryId ? { ...category, ...changes, title, name: title, slug } : clone(category));
  const nextRecipes = recipes.map((recipe) => recipe.category === current.title ? { ...recipe, category: title } : clone(recipe));
  const replaceNav = (items) => (items || []).map((item) => ({
    ...item,
    target: item.type === 'category' && item.target === current.slug ? slug : item.target,
    children: replaceNav(item.children),
  }));
  const nextNavigation = clone(navigation);
  nextNavigation.header.primaryItems = replaceNav(nextNavigation.header.primaryItems);
  nextNavigation.header.menuItems = replaceNav(nextNavigation.header.menuItems);
  nextNavigation.footer.links = replaceNav(nextNavigation.footer.links);
  nextNavigation.footer.socialLinks = replaceNav(nextNavigation.footer.socialLinks);
  return { categories: nextCategories, recipes: nextRecipes, navigation: nextNavigation, affectedRecipes: nextRecipes.filter((recipe) => recipe.category === title).length, routeChange: current.slug === slug ? null : { from: current.slug, to: slug } };
}

export function deleteCategoryWithReplacement(categories, recipes, categoryId, replacementId) {
  const current = categories.find((category) => category.id === categoryId);
  const replacement = categories.find((category) => category.id === replacementId);
  if (!current || !replacement || current.id === replacement.id) throw new Error('Choose an existing replacement category.');
  const affected = recipes.filter((recipe) => recipe.category === current.title).length;
  return {
    categories: categories.filter((category) => category.id !== current.id),
    recipes: recipes.map((recipe) => recipe.category === current.title ? { ...recipe, category: replacement.title } : clone(recipe)),
    affectedRecipes: affected,
  };
}

export function mergeTag(recipes, groupId, sourceTag, targetTag) {
  if (!SAFE_ID.test(groupId ?? '') || !sourceTag || !targetTag || sourceTag === targetTag) throw new Error('Choose two different valid tags.');
  let affected = 0;
  const next = recipes.map((recipe) => {
    const values = Array.isArray(recipe.tags?.[groupId]) ? recipe.tags[groupId] : [];
    if (!values.includes(sourceTag)) return clone(recipe);
    affected += 1;
    return { ...recipe, tags: { ...recipe.tags, [groupId]: [...new Set(values.map((tag) => tag === sourceTag ? targetTag : tag))] } };
  });
  return { recipes: next, affectedRecipes: affected };
}

export function validateTemplates(value) {
  const errors = [];
  if (!record(value) || value.modelVersion !== SITE_MODEL_VERSION || !Array.isArray(value.templates)) return { valid: false, errors: ['templates must use modelVersion 1 and contain a templates array'] };
  const ids = new Set();
  for (const [index, template] of value.templates.entries()) {
    const path = `templates[${index}]`;
    if (!SAFE_ID.test(template?.id ?? '')) errors.push(`${path}.id is invalid`);
    if (ids.has(template?.id)) errors.push(`${path}.id is duplicated`);
    ids.add(template?.id);
    if (typeof template?.name !== 'string' || !template.name.trim()) errors.push(`${path}.name is required`);
    if (!TEMPLATE_CONTENT_TYPES.includes(template?.contentType)) errors.push(`${path}.contentType is invalid`);
    if (!Array.isArray(template?.slots) || !template.slots.length) errors.push(`${path}.slots must not be empty`);
    (template?.slots || []).forEach((slot, slotIndex) => {
      if (!SAFE_ID.test(slot?.id ?? '')) errors.push(`${path}.slots[${slotIndex}].id is invalid`);
      if (!BLOCK_TYPE_VALUES.includes(slot?.type)) errors.push(`${path}.slots[${slotIndex}].type is invalid`);
      if (slot?.layout?.width && !LAYOUT_WIDTHS.includes(slot.layout.width)) errors.push(`${path}.slots[${slotIndex}].layout.width is invalid`);
      if (slot?.layout?.paddingBlock && !SPACING_TOKENS.includes(slot.layout.paddingBlock)) errors.push(`${path}.slots[${slotIndex}].layout.paddingBlock is invalid`);
    });
  }
  return { valid: errors.length === 0, errors };
}

export function validateGlobalBlocks(value) {
  const errors = [];
  if (!record(value) || value.modelVersion !== SITE_MODEL_VERSION || !Array.isArray(value.blocks)) return { valid: false, errors: ['global blocks must use modelVersion 1 and contain a blocks array'] };
  const ids = new Set();
  value.blocks.forEach((entry, index) => {
    if (!SAFE_ID.test(entry?.id ?? '')) errors.push(`globalBlocks[${index}].id is invalid`);
    if (ids.has(entry?.id)) errors.push(`globalBlocks[${index}].id is duplicated`);
    ids.add(entry?.id);
    if (typeof entry?.name !== 'string' || !entry.name.trim()) errors.push(`globalBlocks[${index}].name is required`);
    const validation = validateBlock(entry?.block);
    validation.errors.forEach((error) => errors.push(`globalBlocks[${index}]: ${error}`));
    if (entry?.block?.type === BLOCK_TYPES.GLOBAL_REFERENCE) errors.push(`globalBlocks[${index}] cannot reference another global block`);
  });
  return { valid: errors.length === 0, errors };
}

export function validateSiteSettings(value, templates = []) {
  const errors = [];
  if (!record(value)) return { valid: false, errors: ['settings must be an object'] };
  if (value.modelVersion !== SITE_MODEL_VERSION) errors.push(`settings.modelVersion must be ${SITE_MODEL_VERSION}`);
  if (typeof value.siteTitle !== 'string' || !value.siteTitle.trim() || value.siteTitle.length > 100) errors.push('settings.siteTitle is invalid');
  if (typeof value.siteDescription !== 'string' || !value.siteDescription.trim() || value.siteDescription.length > 320) errors.push('settings.siteDescription is invalid');
  if (value.language !== 'ro' || value.locale !== 'ro_RO') errors.push('settings language and locale must remain ro and ro_RO');
  if (!isSafeContentUrl(value.defaultSocialImage)) errors.push('settings.defaultSocialImage must be a safe URL');
  for (const [kind, id] of Object.entries(value.defaultTemplates || {})) {
    if (!templates.some((template) => template.id === id)) errors.push(`settings.defaultTemplates.${kind} references a missing template`);
  }
  return { valid: errors.length === 0, errors };
}

export function validateSiteBundle(bundle, context = {}) {
  const results = [
    validateTemplates(bundle?.templates),
    validateGlobalBlocks(bundle?.globalBlocks),
    validateNavigation(bundle?.navigation, context),
    validateTheme(bundle?.theme),
    validateSiteSettings(bundle?.settings, bundle?.templates?.templates || []),
  ];
  const errors = results.flatMap((result) => result.errors);
  if (!Array.isArray(bundle?.categories) || !bundle.categories.length) errors.push('categories must contain at least one category');
  if (!record(bundle?.tagGroups)) errors.push('tagGroups must be an object');
  return { valid: errors.length === 0, errors };
}

export function siteImpactSummary(before, after, recipes = [], pages = []) {
  const files = [];
  const pairs = [
    ['src/content/site/templates.json', 'templates'], ['src/content/site/global-blocks.json', 'globalBlocks'],
    ['src/content/site/navigation.json', 'navigation'], ['src/content/site/settings.json', 'settings'],
    ['src/content/site/theme.json', 'theme'], ['src/content/categories.json', 'categories'], ['src/data/tag-groups.json', 'tagGroups'],
  ];
  pairs.forEach(([path, key]) => { if (!sameStructuredValue(before?.[key], after?.[key])) files.push(path); });
  const templateIds = new Set((after?.templates?.templates || []).map((template) => template.id));
  const templateAffected = [...recipes, ...pages].filter((item) => item.template?.mode === 'linked' && templateIds.has(item.template.id)).length;
  const globalIds = new Set((after?.globalBlocks?.blocks || []).map((entry) => entry.id));
  const globalAffected = pages.filter((page) => [...globalIds]
    .some((globalId) => collectGlobalBlockUsage([page], globalId).length > 0)).length;
  return {
    files,
    recipeCount: recipes.length,
    pageCount: pages.length,
    templateAffected,
    globalAffected,
    siteWide: files.includes('src/content/site/theme.json') || files.includes('src/content/site/navigation.json') || files.includes('src/content/site/settings.json'),
  };
}
