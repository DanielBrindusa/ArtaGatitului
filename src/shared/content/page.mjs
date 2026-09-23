import { BLOCK_MODEL_VERSION } from '../blocks/model.mjs';

export const PAGE_MODEL_VERSION = 1;
export const PAGE_TYPES = Object.freeze(['home', 'standard', 'landing']);
export const PAGE_STATUSES = Object.freeze(['published', 'draft', 'archived']);

function string(value, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function nullableString(value) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function normalizePage(value) {
  const page = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    id: string(page.id),
    pageType: PAGE_TYPES.includes(page.pageType) ? page.pageType : 'standard',
    title: string(page.title),
    slug: string(page.slug),
    description: string(page.description),
    socialImage: nullableString(page.socialImage),
    status: PAGE_STATUSES.includes(page.status) ? page.status : 'draft',
    layout: {
      modelVersion: BLOCK_MODEL_VERSION,
      blocks: Array.isArray(page.layout?.blocks) ? clone(page.layout.blocks) : [],
    },
  };
}

export function pageSourcePath(page) {
  return `src/content/pages/${page.pageType === 'home' ? 'home' : page.slug}.json`;
}

export function collectPageReferences(page) {
  const recipes = new Set();
  const links = new Set();
  const images = new Set();
  function visit(blocks) {
    (blocks || []).forEach((block) => {
      const data = block?.data || {};
      if (Array.isArray(data.slugs)) data.slugs.forEach((slug) => recipes.add(slug));
      if (typeof data.href === 'string') links.add(data.href);
      if (typeof data.src === 'string') images.add(data.src);
      if (data.secondaryAction?.href) links.add(data.secondaryAction.href);
      (data.quickLinks || []).forEach((link) => link?.href && links.add(link.href));
      (data.nodes || []).forEach((node) => {
        const groups = node.items || [node.children || []];
        groups.flat().forEach((span) => span?.href && links.add(span.href));
      });
      visit(data.blocks);
    });
  }
  visit(page?.layout?.blocks);
  return { recipes: [...recipes], links: [...links], images: [...images] };
}
