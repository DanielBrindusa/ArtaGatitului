import {
  BLOCK_TYPES,
  BLOCK_TYPE_VALUES,
  LAYOUT_WIDTHS,
} from '../../../src/shared/index.mjs';
import { slugify } from '../../../src/shared/utils/html.mjs';

export const REQUIRED_RECIPE_BLOCK_TYPES = Object.freeze([
  BLOCK_TYPES.RECIPE_HERO,
  BLOCK_TYPES.INGREDIENTS,
  BLOCK_TYPES.INSTRUCTIONS,
]);

export const SINGLETON_RECIPE_BLOCK_TYPES = Object.freeze([
  BLOCK_TYPES.RECIPE_HERO,
  BLOCK_TYPES.RECIPE_METADATA,
  BLOCK_TYPES.INGREDIENTS,
  BLOCK_TYPES.BEFORE_STARTING,
  BLOCK_TYPES.EQUIPMENT,
  BLOCK_TYPES.INSTRUCTIONS,
  BLOCK_TYPES.RATING,
  BLOCK_TYPES.RELATED_RECIPES,
]);

export const EDITOR_BLOCK_TYPES = Object.freeze([
  BLOCK_TYPES.RECIPE_HERO,
  BLOCK_TYPES.RECIPE_METADATA,
  BLOCK_TYPES.INGREDIENTS,
  BLOCK_TYPES.BEFORE_STARTING,
  BLOCK_TYPES.EQUIPMENT,
  BLOCK_TYPES.INSTRUCTIONS,
  BLOCK_TYPES.RATING,
  BLOCK_TYPES.RELATED_RECIPES,
  BLOCK_TYPES.HEADING,
  BLOCK_TYPES.TEXT,
  BLOCK_TYPES.IMAGE,
  BLOCK_TYPES.DIVIDER,
  BLOCK_TYPES.SPACER,
  BLOCK_TYPES.BUTTON,
]);

const DEFAULT_BLOCKS = Object.freeze({
  [BLOCK_TYPES.RECIPE_HERO]: {
    data: { showCategory: true, showDescription: true },
    layout: { width: 'full', paddingBlock: 'sm' },
    responsive: { mobile: { width: 'full' } },
  },
  [BLOCK_TYPES.RECIPE_METADATA]: {
    data: {},
    layout: { width: 'wide', paddingBlock: 'sm' },
    responsive: { mobile: { width: 'full' } },
  },
  [BLOCK_TYPES.INGREDIENTS]: {
    data: { heading: 'Ingrediente', listStyle: 'checkbox' },
    layout: { width: 'medium', paddingBlock: 'sm' },
    responsive: { mobile: { width: 'full' } },
  },
  [BLOCK_TYPES.BEFORE_STARTING]: {
    data: { heading: 'Înainte să începi', listStyle: 'checklist' },
    layout: { width: 'medium', paddingBlock: 'sm' },
    responsive: { mobile: { width: 'full' } },
  },
  [BLOCK_TYPES.EQUIPMENT]: {
    data: { heading: 'Echipament', listStyle: 'bullet' },
    layout: { width: 'medium', paddingBlock: 'sm' },
    responsive: { mobile: { width: 'full' } },
  },
  [BLOCK_TYPES.INSTRUCTIONS]: {
    data: { heading: 'Mod de preparare', listStyle: 'numbered' },
    layout: { width: 'wide', paddingBlock: 'sm' },
    responsive: { mobile: { width: 'full' } },
  },
  [BLOCK_TYPES.RATING]: {
    data: { heading: 'Evaluează rețeta' },
    layout: { width: 'wide', paddingBlock: 'sm' },
    responsive: { mobile: { width: 'full' } },
  },
  [BLOCK_TYPES.RELATED_RECIPES]: {
    data: { heading: 'Rețete similare', limit: 6 },
    layout: { width: 'wide', paddingBlock: 'sm' },
    responsive: { mobile: { width: 'full' } },
  },
  [BLOCK_TYPES.HEADING]: {
    data: { text: 'Titlu nou', level: 2 },
    layout: { width: 'wide', paddingBlock: 'xs' },
  },
  [BLOCK_TYPES.TEXT]: {
    data: { text: 'Scrie continutul aici.' },
    layout: { width: 'wide', paddingBlock: 'xs' },
  },
  [BLOCK_TYPES.IMAGE]: {
    data: { src: './icon.png', alt: 'Imagine reteta', loading: 'lazy' },
    layout: { width: 'wide', paddingBlock: 'sm' },
  },
  [BLOCK_TYPES.DIVIDER]: {
    data: {},
    layout: { width: 'wide', paddingBlock: 'sm' },
  },
  [BLOCK_TYPES.SPACER]: {
    data: { size: 'md' },
    layout: { width: 'wide' },
  },
  [BLOCK_TYPES.BUTTON]: {
    data: { label: 'Deschide', href: '#', target: '_self' },
    layout: { width: 'wide', paddingBlock: 'sm' },
    variant: 'primary',
  },
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createBlockId(type) {
  const prefix = String(type).replace(/[^a-z0-9-]/g, '') || 'block';
  const random = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  return `${prefix}-${random.toLowerCase()}`.slice(0, 80);
}

export function createEditorBlock(type, options = {}) {
  if (!EDITOR_BLOCK_TYPES.includes(type) || !BLOCK_TYPE_VALUES.includes(type)) {
    throw new Error(`Unsupported editor block type: ${String(type)}`);
  }
  const defaults = clone(DEFAULT_BLOCKS[type]);
  return {
    id: options.id || createBlockId(type),
    type,
    ...defaults,
  };
}

export function createDefaultRecipeBlocks() {
  return [
    createEditorBlock(BLOCK_TYPES.RECIPE_HERO, { id: 'recipe-hero' }),
    createEditorBlock(BLOCK_TYPES.RECIPE_METADATA, { id: 'recipe-metadata' }),
    createEditorBlock(BLOCK_TYPES.INGREDIENTS, { id: 'ingredients' }),
    createEditorBlock(BLOCK_TYPES.BEFORE_STARTING, { id: 'before-starting' }),
    createEditorBlock(BLOCK_TYPES.EQUIPMENT, { id: 'equipment' }),
    createEditorBlock(BLOCK_TYPES.INSTRUCTIONS, { id: 'instructions' }),
    createEditorBlock(BLOCK_TYPES.RATING, { id: 'rating' }),
    createEditorBlock(BLOCK_TYPES.RELATED_RECIPES, { id: 'related-recipes' }),
  ];
}

export function isSafeDraftSlug(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= 120
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
    && !value.includes('..')
    && !/[\\/]/.test(value);
}

export function updateDraftTitle(draft, title) {
  const previousGeneratedSlug = slugify(draft.title).slice(0, 120);
  const shouldRegenerateSlug = !draft.slug || draft.slug === previousGeneratedSlug;
  const slug = shouldRegenerateSlug ? slugify(title).slice(0, 120) : draft.slug;
  return {
    ...draft,
    title,
    slug,
    data: {
      ...draft.data,
      recipe: {
        ...draft.data.recipe,
        title,
        name: title,
        slug,
      },
    },
  };
}

export function updateDraftSlug(draft, slug) {
  return {
    ...draft,
    slug,
    data: {
      ...draft.data,
      recipe: { ...draft.data.recipe, slug },
    },
  };
}

export function updateRecipeFields(draft, changes) {
  return {
    ...draft,
    data: {
      ...draft.data,
      recipe: { ...draft.data.recipe, ...changes },
    },
  };
}

export function updateRecipeList(draft, field, items) {
  const cleanItems = items.map((item) => String(item));
  const changes = { [field]: cleanItems };
  if (field === 'steps') changes.preparation = [...cleanItems];
  return updateRecipeFields(draft, changes);
}

export function insertListItem(items, index, value = '') {
  const next = [...items];
  next.splice(Math.max(0, Math.min(index, next.length)), 0, value);
  return next;
}

export function removeListItem(items, index) {
  return items.filter((_, itemIndex) => itemIndex !== index);
}

export function reorderItems(items, fromIndex, toIndex) {
  if (fromIndex === toIndex) return [...items];
  if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) {
    throw new RangeError('Reorder indexes must reference existing items.');
  }
  const next = [...items];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}

export function reorderDraftBlocks(draft, fromIndex, toIndex) {
  return {
    ...draft,
    layout: {
      ...draft.layout,
      blocks: reorderItems(draft.layout.blocks, fromIndex, toIndex),
    },
  };
}

export function insertDraftBlock(draft, type, index = draft.layout.blocks.length, options = {}) {
  if (SINGLETON_RECIPE_BLOCK_TYPES.includes(type)
    && draft.layout.blocks.some((block) => block.type === type)) return draft;
  const blocks = [...draft.layout.blocks];
  blocks.splice(Math.max(0, Math.min(index, blocks.length)), 0, createEditorBlock(type, options));
  return { ...draft, layout: { ...draft.layout, blocks } };
}

export function removeDraftBlock(draft, blockId) {
  const block = draft.layout.blocks.find((item) => item.id === blockId);
  if (!block || REQUIRED_RECIPE_BLOCK_TYPES.includes(block.type)) return draft;
  return {
    ...draft,
    layout: {
      ...draft.layout,
      blocks: draft.layout.blocks.filter((item) => item.id !== blockId),
    },
  };
}

export function updateDraftBlock(draft, blockId, update) {
  return {
    ...draft,
    layout: {
      ...draft.layout,
      blocks: draft.layout.blocks.map((block) => (
        block.id === blockId ? update(block) : block
      )),
    },
  };
}

export function setBlockWidth(draft, blockId, breakpoint, width) {
  if (!LAYOUT_WIDTHS.includes(width)) throw new Error(`Invalid layout width: ${String(width)}`);
  return updateDraftBlock(draft, blockId, (block) => {
    if (breakpoint === 'desktop') {
      return { ...block, layout: { ...block.layout, width } };
    }
    if (!['tablet', 'mobile'].includes(breakpoint)) {
      throw new Error(`Invalid responsive breakpoint: ${String(breakpoint)}`);
    }
    return {
      ...block,
      responsive: {
        ...block.responsive,
        [breakpoint]: { ...block.responsive?.[breakpoint], width },
      },
    };
  });
}

export function resolvedBlockWidth(block, breakpoint) {
  return block.responsive?.[breakpoint]?.width ?? block.layout?.width ?? 'wide';
}

export function setBlockVisibility(draft, blockId, breakpoint, visible) {
  if (!['desktop', 'tablet', 'mobile'].includes(breakpoint)) {
    throw new Error(`Invalid responsive breakpoint: ${String(breakpoint)}`);
  }
  return updateDraftBlock(draft, blockId, (block) => ({
    ...block,
    responsive: {
      ...block.responsive,
      [breakpoint]: { ...block.responsive?.[breakpoint], visible },
    },
  }));
}
