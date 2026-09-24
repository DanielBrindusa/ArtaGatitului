import { BLOCK_MODEL_VERSION, BLOCK_TYPES } from '../blocks/model.mjs';
import { normalizePage, PAGE_MODEL_VERSION, PAGE_STATUSES, PAGE_TYPES, collectPageReferences } from '../content/page.mjs';
import { isSafeContentUrl } from '../utils/html.mjs';
import { validateBlock } from './blocks.mjs';
import { validateTemplateAssignment } from '../site/model.mjs';

const PAGE_KEYS = new Set(['id', 'pageType', 'title', 'slug', 'description', 'socialImage', 'status', 'template', 'layout']);
const SAFE_ID = /^[a-z][a-z0-9-]{0,79}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function visitBlocks(blocks, callback) {
  blocks.forEach((block) => {
    callback(block);
    if (Array.isArray(block?.data?.blocks)) visitBlocks(block.data.blocks, callback);
  });
}

export function validatePageSource(value, { recipeSlugs = [], categorySlugs = [] } = {}) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, errors: ['page must be an object'] };
  Object.keys(value).forEach((key) => { if (!PAGE_KEYS.has(key)) errors.push(`page.${key} is not supported`); });
  if (!SAFE_ID.test(value.id ?? '')) errors.push('page.id must be a stable lowercase identifier');
  if (!PAGE_TYPES.includes(value.pageType)) errors.push(`page.pageType must be one of ${PAGE_TYPES.join(', ')}`);
  if (typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200) errors.push('page.title must be a non-empty string of at most 200 characters');
  if (!SAFE_SLUG.test(value.slug ?? '') || value.slug.length > 120) errors.push('page.slug must be a safe lowercase slug');
  if (value.pageType === 'home' && (value.id !== 'home' || value.slug !== 'home')) errors.push('Homepage id and slug must be home');
  if (value.pageType !== 'home' && value.slug === 'home') errors.push('Only Homepage may use the home slug');
  if (typeof value.description !== 'string' || value.description.length > 320) errors.push('page.description must be a string of at most 320 characters');
  if (value.socialImage !== null && value.socialImage !== undefined
    && (typeof value.socialImage !== 'string' || !isSafeContentUrl(value.socialImage))) {
    errors.push('page.socialImage must be a safe relative or HTTP(S) URL');
  }
  if (!PAGE_STATUSES.includes(value.status)) errors.push(`page.status must be one of ${PAGE_STATUSES.join(', ')}`);
  const templateValidation = validateTemplateAssignment(value.template, [], 'page');
  templateValidation.errors.forEach((error) => errors.push(`page.${error}`));
  if (!value.layout || typeof value.layout !== 'object' || Array.isArray(value.layout)) {
    errors.push('page.layout must be an object');
  } else {
    if (value.layout.modelVersion !== BLOCK_MODEL_VERSION) errors.push(`page.layout.modelVersion must be ${BLOCK_MODEL_VERSION}`);
    if (!Array.isArray(value.layout.blocks) || value.layout.blocks.length === 0) {
      errors.push('page.layout.blocks must contain at least one section');
    } else {
      const ids = new Set();
      value.layout.blocks.forEach((block, index) => {
        if (block?.type !== BLOCK_TYPES.SECTION) errors.push(`page.layout.blocks[${index}] must be a section`);
        const validation = validateBlock(block);
        validation.errors.forEach((error) => errors.push(`page.layout.blocks[${index}]: ${error}`));
      });
      visitBlocks(value.layout.blocks, (block) => {
        if (ids.has(block.id)) errors.push(`page block id "${block.id}" is duplicated`);
        ids.add(block.id);
      });
    }
  }
  const references = collectPageReferences(value);
  references.recipes.forEach((slug) => {
    if (recipeSlugs.length && !recipeSlugs.includes(slug)) errors.push(`page references missing recipe "${slug}"`);
  });
  visitBlocks(value.layout?.blocks || [], (block) => {
    if (block.type === BLOCK_TYPES.CATEGORY_GRID) {
      (block.data.slugs || []).forEach((slug) => {
        if (categorySlugs.length && !categorySlugs.includes(slug)) errors.push(`page references missing category "${slug}"`);
      });
    }
  });
  if (value.pageType === 'home') {
    let hasHeading = false;
    visitBlocks(value.layout?.blocks || [], (block) => {
      if (block.type === BLOCK_TYPES.HERO && block.data?.title) hasHeading = true;
      if (block.type === BLOCK_TYPES.HEADING && block.data?.level === 1) hasHeading = true;
    });
    if (!hasHeading) errors.push('Homepage requires a visible level-one heading or hero title');
  }
  return { valid: errors.length === 0, errors, page: errors.length ? null : normalizePage(value), modelVersion: PAGE_MODEL_VERSION };
}

export function assertValidPage(value, options) {
  const result = validatePageSource(value, options);
  if (!result.valid) throw new Error(`Invalid page:\n- ${result.errors.join('\n- ')}`);
  return result.page;
}
