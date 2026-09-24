import {
  BLOCK_TYPES,
  COLUMN_SPANS,
  LAYOUT_WIDTHS,
  validateBlock,
} from '../../../src/shared/index.mjs';
import { slugify } from '../../../src/shared/utils/html.mjs';
import { createBlockId, reorderItems } from './editorModel.mjs';

export const PAGE_LIBRARY_BLOCK_TYPES = Object.freeze([
  BLOCK_TYPES.SECTION,
  BLOCK_TYPES.CONTAINER,
  BLOCK_TYPES.COLUMNS,
  BLOCK_TYPES.GRID,
  BLOCK_TYPES.HEADING,
  BLOCK_TYPES.RICH_TEXT,
  BLOCK_TYPES.IMAGE,
  BLOCK_TYPES.BUTTON,
  BLOCK_TYPES.DIVIDER,
  BLOCK_TYPES.SPACER,
  BLOCK_TYPES.HERO,
  BLOCK_TYPES.SEARCH,
  BLOCK_TYPES.RECIPE_GRID,
  BLOCK_TYPES.FEATURED_RECIPES,
  BLOCK_TYPES.LATEST_RECIPES,
  BLOCK_TYPES.CATEGORY_GRID,
  BLOCK_TYPES.RANDOM_RECIPE,
]);

const CHILDREN = Object.freeze({
  [BLOCK_TYPES.SECTION]: new Set(PAGE_LIBRARY_BLOCK_TYPES.filter((type) => type !== BLOCK_TYPES.SECTION)),
  [BLOCK_TYPES.CONTAINER]: new Set(PAGE_LIBRARY_BLOCK_TYPES.filter((type) => ![BLOCK_TYPES.SECTION, BLOCK_TYPES.CONTAINER].includes(type))),
  [BLOCK_TYPES.COLUMNS]: new Set([BLOCK_TYPES.COLUMN]),
  [BLOCK_TYPES.COLUMN]: new Set(PAGE_LIBRARY_BLOCK_TYPES.filter((type) => ![BLOCK_TYPES.SECTION, BLOCK_TYPES.CONTAINER, BLOCK_TYPES.COLUMNS, BLOCK_TYPES.COLUMN, BLOCK_TYPES.GRID].includes(type))),
  [BLOCK_TYPES.GRID]: new Set(PAGE_LIBRARY_BLOCK_TYPES.filter((type) => ![BLOCK_TYPES.SECTION, BLOCK_TYPES.CONTAINER, BLOCK_TYPES.COLUMNS, BLOCK_TYPES.COLUMN, BLOCK_TYPES.GRID].includes(type))),
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function richText(text = 'Scrie conținutul paginii aici.') {
  return { nodes: [{ type: 'paragraph', children: [{ text }] }] };
}

const DEFAULTS = Object.freeze({
  [BLOCK_TYPES.CONTAINER]: { data: { blocks: [] }, layout: { width: 'wide', paddingBlock: 'md' } },
  [BLOCK_TYPES.GRID]: { data: { blocks: [] }, layout: { width: 'wide', columns: 3, gap: 'md' }, responsive: { tablet: { columns: 2 }, mobile: { columns: 1 } } },
  [BLOCK_TYPES.HEADING]: { data: { text: 'Titlu secțiune', level: 2 }, layout: { width: 'wide', paddingBlock: 'xs' } },
  [BLOCK_TYPES.RICH_TEXT]: { data: richText(), layout: { width: 'wide', paddingBlock: 'xs' } },
  [BLOCK_TYPES.IMAGE]: { data: { src: './icon.png', alt: 'Imagine pagină', loading: 'lazy' }, layout: { width: 'wide', paddingBlock: 'sm' }, variant: 'default' },
  [BLOCK_TYPES.BUTTON]: { data: { label: 'Deschide', href: '#', target: '_self' }, layout: { width: 'wide', paddingBlock: 'sm' }, variant: 'primary' },
  [BLOCK_TYPES.DIVIDER]: { data: {}, layout: { width: 'wide', paddingBlock: 'sm' }, variant: 'default' },
  [BLOCK_TYPES.SPACER]: { data: { size: 'md' }, layout: { width: 'wide' }, variant: 'default' },
  [BLOCK_TYPES.HERO]: { data: { eyebrow: 'Descoperă', title: 'Titlu pagină', body: 'Adaugă o introducere clară pentru această pagină.', showSearch: false, showRandomRecipe: false, quickLinks: [] }, layout: { width: 'wide', paddingBlock: 'lg' }, variant: 'default' },
  [BLOCK_TYPES.SEARCH]: { data: { label: 'Caută rețete', placeholder: 'Ingredient, rețetă sau etichetă', buttonLabel: 'Caută' }, layout: { width: 'medium', paddingBlock: 'md' }, variant: 'default' },
  [BLOCK_TYPES.RECIPE_GRID]: { data: { eyebrow: 'Rețete', heading: 'Selecție de rețete', source: 'manual', slugs: [], limit: 6, columns: 3 }, layout: { width: 'wide', paddingBlock: 'md' }, variant: 'default' },
  [BLOCK_TYPES.FEATURED_RECIPES]: { data: { eyebrow: 'Rețete', heading: 'Rețete recomandate', slugs: [], limit: 6 }, layout: { width: 'wide', paddingBlock: 'md' }, variant: 'default' },
  [BLOCK_TYPES.LATEST_RECIPES]: { data: { eyebrow: 'Noutăți', heading: 'Cele mai noi rețete', limit: 6 }, layout: { width: 'wide', paddingBlock: 'md' }, variant: 'default' },
  [BLOCK_TYPES.CATEGORY_GRID]: { data: { eyebrow: 'Categorii', heading: 'Alege după poftă' }, layout: { width: 'wide', paddingBlock: 'md' }, variant: 'default' },
  [BLOCK_TYPES.RANDOM_RECIPE]: { data: { label: 'Surprinde-mă cu o rețetă' }, layout: { width: 'wide', paddingBlock: 'sm' }, variant: 'primary' },
});

export function createPageBlock(type, options = {}) {
  if (!PAGE_LIBRARY_BLOCK_TYPES.includes(type) && type !== BLOCK_TYPES.COLUMN) throw new Error(`Unsupported page block type: ${String(type)}`);
  if (type === BLOCK_TYPES.SECTION) {
    return { id: options.id || createBlockId('section'), type, data: { blocks: [] }, layout: { width: 'wide', paddingBlock: 'md' }, variant: 'default' };
  }
  if (type === BLOCK_TYPES.COLUMNS) {
    const left = { id: createBlockId('column'), type: BLOCK_TYPES.COLUMN, data: { blocks: [], span: { desktop: 6, tablet: 6, mobile: 12 } }, layout: { width: 'full' }, variant: 'default' };
    const right = { id: createBlockId('column'), type: BLOCK_TYPES.COLUMN, data: { blocks: [], span: { desktop: 6, tablet: 6, mobile: 12 } }, layout: { width: 'full' }, variant: 'default' };
    return { id: options.id || createBlockId(type), type, data: { blocks: [left, right] }, layout: { width: 'wide', gap: 'md', paddingBlock: 'md' }, variant: 'default' };
  }
  if (type === BLOCK_TYPES.COLUMN) {
    return { id: options.id || createBlockId(type), type, data: { blocks: [], span: { desktop: 6, tablet: 6, mobile: 12 } }, layout: { width: 'full' }, variant: 'default' };
  }
  return { id: options.id || createBlockId(type), type, ...clone(DEFAULTS[type]) };
}

export function createDefaultPageBlocks(pageType = 'standard', title = 'Untitled page') {
  const section = createPageBlock(BLOCK_TYPES.SECTION, { id: 'page-introduction' });
  if (pageType === 'landing') {
    const hero = createPageBlock(BLOCK_TYPES.HERO, { id: 'page-hero' });
    hero.data.title = title;
    section.data.blocks = [hero];
  } else {
    const heading = createPageBlock(BLOCK_TYPES.HEADING, { id: 'page-title' });
    heading.data.text = title;
    heading.data.level = 1;
    section.data.blocks = [heading, createPageBlock(BLOCK_TYPES.RICH_TEXT, { id: 'page-copy' })];
  }
  return [section];
}

export function canNestBlock(parentType, childType) {
  return CHILDREN[parentType]?.has(childType) === true;
}

export function findPageBlock(blocks, blockId) {
  for (const block of blocks) {
    if (block.id === blockId) return block;
    const child = findPageBlock(block.data?.blocks || [], blockId);
    if (child) return child;
  }
  return null;
}

function updateTree(blocks, blockId, update) {
  return blocks.map((block) => {
    if (block.id === blockId) return update(block);
    if (!Array.isArray(block.data?.blocks)) return block;
    return { ...block, data: { ...block.data, blocks: updateTree(block.data.blocks, blockId, update) } };
  });
}

export function updatePageBlock(draft, blockId, update) {
  return { ...draft, layout: { ...draft.layout, blocks: updateTree(draft.layout.blocks, blockId, update) } };
}

function removeFromTree(blocks, blockId) {
  return blocks.filter((block) => block.id !== blockId).map((block) => (
    Array.isArray(block.data?.blocks)
      ? { ...block, data: { ...block.data, blocks: removeFromTree(block.data.blocks, blockId) } }
      : block
  ));
}

export function removePageBlock(draft, blockId) {
  return { ...draft, layout: { ...draft.layout, blocks: removeFromTree(draft.layout.blocks, blockId) } };
}

function childrenFor(draft, parentId) {
  if (parentId === null) return { parentType: 'page', blocks: draft.layout.blocks };
  const parent = findPageBlock(draft.layout.blocks, parentId);
  return parent && Array.isArray(parent.data?.blocks) ? { parentType: parent.type, blocks: parent.data.blocks } : null;
}

export function insertPageBlock(draft, parentId, type, index = Number.MAX_SAFE_INTEGER, options = {}) {
  if (parentId === null) {
    if (type !== BLOCK_TYPES.SECTION) throw new Error('Only sections may be inserted at page root.');
    const blocks = [...draft.layout.blocks];
    blocks.splice(Math.min(index, blocks.length), 0, createPageBlock(type, options));
    return { ...draft, layout: { ...draft.layout, blocks } };
  }
  const parent = findPageBlock(draft.layout.blocks, parentId);
  if (!parent || !canNestBlock(parent.type, type)) throw new Error(`${type} cannot be inserted inside ${parent?.type || 'the selected block'}.`);
  return updatePageBlock(draft, parentId, (block) => {
    const blocks = [...block.data.blocks];
    blocks.splice(Math.min(index, blocks.length), 0, createPageBlock(type, options));
    return { ...block, data: { ...block.data, blocks } };
  });
}

function extractBlock(blocks, blockId) {
  let found = null;
  const next = [];
  for (const block of blocks) {
    if (block.id === blockId) {
      found = block;
      continue;
    }
    if (Array.isArray(block.data?.blocks)) {
      const nested = extractBlock(block.data.blocks, blockId);
      if (nested.found) found = nested.found;
      next.push({ ...block, data: { ...block.data, blocks: nested.blocks } });
    } else next.push(block);
  }
  return { blocks: next, found };
}

export function movePageBlock(draft, blockId, targetParentId, targetIndex) {
  const block = findPageBlock(draft.layout.blocks, blockId);
  const target = childrenFor(draft, targetParentId);
  if (!block || !target) throw new Error('The block or drop target no longer exists.');
  if (targetParentId === null && block.type !== BLOCK_TYPES.SECTION) throw new Error('Only sections may be moved to page root.');
  if (targetParentId !== null && !canNestBlock(target.parentType, block.type)) throw new Error(`Cannot move ${block.type} into ${target.parentType}.`);
  if (blockId === targetParentId || findPageBlock(block.data?.blocks || [], targetParentId)) throw new Error('A block cannot contain itself.');
  const extracted = extractBlock(draft.layout.blocks, blockId);
  let next = { ...draft, layout: { ...draft.layout, blocks: extracted.blocks } };
  if (targetParentId === null) {
    const blocks = [...next.layout.blocks];
    blocks.splice(Math.min(targetIndex, blocks.length), 0, extracted.found);
    next = { ...next, layout: { ...next.layout, blocks } };
  } else {
    next = updatePageBlock(next, targetParentId, (parent) => {
      const blocks = [...parent.data.blocks];
      blocks.splice(Math.min(targetIndex, blocks.length), 0, extracted.found);
      return { ...parent, data: { ...parent.data, blocks } };
    });
  }
  const validation = next.layout.blocks.map(validateBlock).flatMap((result) => result.errors);
  if (validation.length) throw new Error(validation[0]);
  return next;
}

export function reorderPageChildren(draft, parentId, fromIndex, toIndex) {
  if (parentId === null) return { ...draft, layout: { ...draft.layout, blocks: reorderItems(draft.layout.blocks, fromIndex, toIndex) } };
  return updatePageBlock(draft, parentId, (parent) => ({
    ...parent,
    data: { ...parent.data, blocks: reorderItems(parent.data.blocks, fromIndex, toIndex) },
  }));
}

export function setPageBlockWidth(draft, blockId, breakpoint, width) {
  if (!LAYOUT_WIDTHS.includes(width)) throw new Error(`Invalid layout width: ${String(width)}`);
  return updatePageBlock(draft, blockId, (block) => breakpoint === 'desktop'
    ? { ...block, layout: { ...block.layout, width } }
    : { ...block, responsive: { ...block.responsive, [breakpoint]: { ...block.responsive?.[breakpoint], width } } });
}

export function setPageBlockVisibility(draft, blockId, breakpoint, visible) {
  return updatePageBlock(draft, blockId, (block) => ({
    ...block,
    responsive: { ...block.responsive, [breakpoint]: { ...block.responsive?.[breakpoint], visible } },
  }));
}

export function setColumnsPreset(draft, columnsId, breakpoint, spans) {
  if (!Array.isArray(spans) || spans.some((span) => !COLUMN_SPANS.includes(span))) throw new Error('Unsupported column span preset.');
  if (breakpoint !== 'mobile' && spans.reduce((sum, span) => sum + span, 0) !== 12) throw new Error('Desktop and tablet column spans must total 12.');
  if (breakpoint === 'mobile' && spans.some((span) => span !== 12)) throw new Error('Mobile columns must stack at full width.');
  return updatePageBlock(draft, columnsId, (columns) => {
    if (columns.type !== BLOCK_TYPES.COLUMNS || columns.data.blocks.length !== spans.length) throw new Error('Column preset does not match this layout.');
    return {
      ...columns,
      data: {
        ...columns.data,
        blocks: columns.data.blocks.map((column, index) => ({
          ...column,
          data: { ...column.data, span: { ...column.data.span, [breakpoint]: spans[index] } },
        })),
      },
    };
  });
}

export function updatePageTitle(draft, title) {
  const generated = slugify(draft.title).slice(0, 120);
  const slug = draft.data.page.pageType === 'home' ? 'home' : (!draft.slug || draft.slug === generated ? slugify(title).slice(0, 120) : draft.slug);
  return { ...draft, title, slug, data: { ...draft.data, page: { ...draft.data.page, title, slug } } };
}

export function updatePageSlug(draft, slug) {
  if (draft.data.page.pageType === 'home') return draft;
  return { ...draft, slug, data: { ...draft.data, page: { ...draft.data.page, slug } } };
}

export function applyPageEditorAction(draft, action) {
  switch (action.type) {
    case 'insert': return insertPageBlock(draft, action.parentId, action.blockType, action.index, action.options);
    case 'remove': return removePageBlock(draft, action.blockId);
    case 'move': return movePageBlock(draft, action.blockId, action.parentId, action.index);
    case 'reorder': return reorderPageChildren(draft, action.parentId, action.fromIndex, action.toIndex);
    case 'update-block': return updatePageBlock(draft, action.blockId, action.update);
    default: throw new Error(`Unknown page editor action: ${String(action.type)}`);
  }
}
