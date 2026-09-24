import {
  BLOCK_TYPES,
  BLOCK_TYPE_VALUES,
  BLOCK_VARIANTS,
  COLUMN_SPANS,
  RECIPE_METADATA_FIELDS,
  SPACING_TOKENS,
  STYLE_RADII,
  STYLE_SURFACES,
  STYLE_TONES,
} from '../blocks/model.mjs';
import { validateLayoutConfig, validateResponsiveConfig } from '../blocks/layout.mjs';
import { isSafeContentUrl } from '../utils/html.mjs';

const BLOCK_KEYS = new Set(['id', 'type', 'data', 'layout', 'responsive', 'variant', 'style']);
const STYLE_KEYS = new Set(['tone', 'surface', 'radius']);
const SAFE_ID = /^[a-z][a-z0-9-]{0,79}$/;
const RICH_TEXT_NODE_TYPES = new Set(['paragraph', 'heading', 'bullet-list', 'numbered-list']);
const CONTENT_BLOCK_TYPES = new Set([
  BLOCK_TYPES.HEADING,
  BLOCK_TYPES.TEXT,
  BLOCK_TYPES.RICH_TEXT,
  BLOCK_TYPES.IMAGE,
  BLOCK_TYPES.DIVIDER,
  BLOCK_TYPES.SPACER,
  BLOCK_TYPES.BUTTON,
  BLOCK_TYPES.HERO,
  BLOCK_TYPES.SEARCH,
  BLOCK_TYPES.RECIPE_GRID,
  BLOCK_TYPES.FEATURED_RECIPES,
  BLOCK_TYPES.LATEST_RECIPES,
  BLOCK_TYPES.CATEGORY_GRID,
  BLOCK_TYPES.RANDOM_RECIPE,
  BLOCK_TYPES.GLOBAL_REFERENCE,
]);

const CHILD_TYPES = Object.freeze({
  [BLOCK_TYPES.SECTION]: new Set([BLOCK_TYPES.CONTAINER, BLOCK_TYPES.COLUMNS, BLOCK_TYPES.GRID, ...CONTENT_BLOCK_TYPES]),
  [BLOCK_TYPES.CONTAINER]: new Set([BLOCK_TYPES.COLUMNS, BLOCK_TYPES.GRID, ...CONTENT_BLOCK_TYPES]),
  [BLOCK_TYPES.COLUMNS]: new Set([BLOCK_TYPES.COLUMN]),
  [BLOCK_TYPES.COLUMN]: CONTENT_BLOCK_TYPES,
  [BLOCK_TYPES.GRID]: CONTENT_BLOCK_TYPES,
});

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireOnlyKeys(value, keys, path, errors) {
  Object.keys(value).forEach((key) => {
    if (!keys.includes(key)) errors.push(`${path}.${key} is not supported`);
  });
}

function requireString(value, path, errors, { optional = false } = {}) {
  if (optional && value === undefined) return;
  if (typeof value !== 'string' || !value.trim()) errors.push(`${path} must be a non-empty string`);
}

function requireBoolean(value, path, errors) {
  if (value !== undefined && typeof value !== 'boolean') errors.push(`${path} must be a boolean`);
}

function requireStringArray(value, path, errors, { optional = false } = {}) {
  if (optional && value === undefined) return;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    errors.push(`${path} must be an array of non-empty strings`);
  }
}

function validateRichTextMarks(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must contain at least one text span`);
    return;
  }
  value.forEach((span, index) => {
    const spanPath = `${path}[${index}]`;
    if (!isRecord(span)) {
      errors.push(`${spanPath} must be an object`);
      return;
    }
    requireOnlyKeys(span, ['text', 'bold', 'italic', 'href'], spanPath, errors);
    requireString(span.text, `${spanPath}.text`, errors);
    requireBoolean(span.bold, `${spanPath}.bold`, errors);
    requireBoolean(span.italic, `${spanPath}.italic`, errors);
    if (span.href !== undefined) {
      requireString(span.href, `${spanPath}.href`, errors);
      if (typeof span.href === 'string' && !isSafeContentUrl(span.href, { allowHash: true })) {
        errors.push(`${spanPath}.href must be a safe relative or HTTP(S) URL`);
      }
    }
  });
}

function validateRichTextNodes(value, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must contain at least one structured node`);
    return;
  }
  value.forEach((node, index) => {
    const nodePath = `${path}[${index}]`;
    if (!isRecord(node)) {
      errors.push(`${nodePath} must be an object`);
      return;
    }
    requireOnlyKeys(node, ['type', 'level', 'children', 'items'], nodePath, errors);
    if (!RICH_TEXT_NODE_TYPES.has(node.type)) {
      errors.push(`${nodePath}.type is not a supported rich-text node`);
      return;
    }
    if (node.type === 'heading') {
      if (![2, 3, 4, 5, 6].includes(node.level)) errors.push(`${nodePath}.level must be from 2 to 6`);
      validateRichTextMarks(node.children, `${nodePath}.children`, errors);
    } else if (node.type === 'paragraph') {
      validateRichTextMarks(node.children, `${nodePath}.children`, errors);
    } else {
      if (!Array.isArray(node.items) || node.items.length === 0) {
        errors.push(`${nodePath}.items must contain at least one list item`);
      } else {
        node.items.forEach((item, itemIndex) => validateRichTextMarks(item, `${nodePath}.items[${itemIndex}]`, errors));
      }
    }
  });
}

function validateChildBlocks(data, block, dataPath, errors, depth) {
  requireOnlyKeys(data, block.type === BLOCK_TYPES.COLUMN ? ['blocks', 'span'] : ['blocks'], dataPath, errors);
  if (!Array.isArray(data.blocks)) {
    errors.push(`${dataPath}.blocks must be an array`);
    return;
  }
  const allowed = CHILD_TYPES[block.type];
  data.blocks.forEach((child, index) => {
    const childPath = `${dataPath}.blocks[${index}]`;
    if (isRecord(child) && allowed && !allowed.has(child.type)) {
      errors.push(`${childPath}.type cannot be nested inside ${block.type}`);
    }
    validateBlockInto(child, childPath, errors, depth + 1, block.type);
  });
  if (block.type === BLOCK_TYPES.COLUMNS) {
    if (data.blocks.length < 2 || data.blocks.length > 4) errors.push(`${dataPath}.blocks must contain 2 to 4 columns`);
    ['desktop', 'tablet'].forEach((breakpoint) => {
      const total = data.blocks.reduce((sum, child) => sum + Number(child?.data?.span?.[breakpoint] ?? 0), 0);
      if (total !== 12) errors.push(`${dataPath}.blocks ${breakpoint} spans must total 12`);
    });
    if (data.blocks.some((child) => child?.data?.span?.mobile !== 12)) {
      errors.push(`${dataPath}.blocks must stack to span 12 on mobile`);
    }
  }
  if (block.type === BLOCK_TYPES.COLUMN) {
    if (!isRecord(data.span)) errors.push(`${dataPath}.span must be an object`);
    else {
      requireOnlyKeys(data.span, ['desktop', 'tablet', 'mobile'], `${dataPath}.span`, errors);
      ['desktop', 'tablet', 'mobile'].forEach((breakpoint) => {
        if (!COLUMN_SPANS.includes(data.span[breakpoint])) errors.push(`${dataPath}.span.${breakpoint} must be a supported grid span`);
      });
    }
  }
}

function validateData(block, path, errors, depth) {
  const dataPath = `${path}.data`;
  const data = block.data;
  if (!isRecord(data)) {
    errors.push(`${dataPath} must be an object`);
    return;
  }

  switch (block.type) {
    case BLOCK_TYPES.SECTION:
    case BLOCK_TYPES.CONTAINER:
    case BLOCK_TYPES.COLUMNS:
    case BLOCK_TYPES.COLUMN:
    case BLOCK_TYPES.GRID:
      validateChildBlocks(data, block, dataPath, errors, depth);
      break;
    case BLOCK_TYPES.HERO:
      requireOnlyKeys(data, ['eyebrow', 'title', 'body', 'showSearch', 'searchPlaceholder', 'showRandomRecipe', 'secondaryAction', 'quickLinks'], dataPath, errors);
      requireString(data.eyebrow, `${dataPath}.eyebrow`, errors, { optional: true });
      requireString(data.title, `${dataPath}.title`, errors);
      requireString(data.body, `${dataPath}.body`, errors, { optional: true });
      requireBoolean(data.showSearch, `${dataPath}.showSearch`, errors);
      requireString(data.searchPlaceholder, `${dataPath}.searchPlaceholder`, errors, { optional: true });
      requireBoolean(data.showRandomRecipe, `${dataPath}.showRandomRecipe`, errors);
      if (data.secondaryAction !== undefined) {
        if (!isRecord(data.secondaryAction)) errors.push(`${dataPath}.secondaryAction must be an object`);
        else {
          requireOnlyKeys(data.secondaryAction, ['label', 'href'], `${dataPath}.secondaryAction`, errors);
          requireString(data.secondaryAction.label, `${dataPath}.secondaryAction.label`, errors);
          requireString(data.secondaryAction.href, `${dataPath}.secondaryAction.href`, errors);
          if (typeof data.secondaryAction.href === 'string' && !isSafeContentUrl(data.secondaryAction.href, { allowHash: true })) errors.push(`${dataPath}.secondaryAction.href must be safe`);
        }
      }
      if (data.quickLinks !== undefined) {
        if (!Array.isArray(data.quickLinks)) errors.push(`${dataPath}.quickLinks must be an array`);
        else data.quickLinks.forEach((link, index) => {
          const linkPath = `${dataPath}.quickLinks[${index}]`;
          if (!isRecord(link)) errors.push(`${linkPath} must be an object`);
          else {
            requireOnlyKeys(link, ['label', 'href'], linkPath, errors);
            requireString(link.label, `${linkPath}.label`, errors);
            requireString(link.href, `${linkPath}.href`, errors);
            if (typeof link.href === 'string' && !isSafeContentUrl(link.href, { allowHash: true })) errors.push(`${linkPath}.href must be safe`);
          }
        });
      }
      break;
    case BLOCK_TYPES.HEADING:
      requireOnlyKeys(data, ['text', 'level'], dataPath, errors);
      requireString(data.text, `${dataPath}.text`, errors);
      if (![1, 2, 3, 4, 5, 6].includes(data.level)) errors.push(`${dataPath}.level must be an integer from 1 to 6`);
      break;
    case BLOCK_TYPES.TEXT:
      requireOnlyKeys(data, ['text'], dataPath, errors);
      requireString(data.text, `${dataPath}.text`, errors);
      break;
    case BLOCK_TYPES.RICH_TEXT:
      requireOnlyKeys(data, ['nodes'], dataPath, errors);
      validateRichTextNodes(data.nodes, `${dataPath}.nodes`, errors);
      break;
    case BLOCK_TYPES.IMAGE:
      requireOnlyKeys(data, ['src', 'alt', 'caption', 'loading', 'attachmentId'], dataPath, errors);
      requireString(data.src, `${dataPath}.src`, errors);
      requireString(data.alt, `${dataPath}.alt`, errors);
      requireString(data.caption, `${dataPath}.caption`, errors, { optional: true });
      if (typeof data.src === 'string' && !isSafeContentUrl(data.src)) errors.push(`${dataPath}.src must be a safe relative or HTTP(S) URL`);
      if (data.loading !== undefined && !['lazy', 'eager'].includes(data.loading)) errors.push(`${dataPath}.loading must be lazy or eager`);
      if (data.attachmentId !== undefined && (typeof data.attachmentId !== 'string' || !SAFE_ID.test(data.attachmentId))) errors.push(`${dataPath}.attachmentId must be a safe identifier`);
      break;
    case BLOCK_TYPES.DIVIDER:
      requireOnlyKeys(data, [], dataPath, errors);
      break;
    case BLOCK_TYPES.SPACER:
      requireOnlyKeys(data, ['size'], dataPath, errors);
      if (!SPACING_TOKENS.includes(data.size)) errors.push(`${dataPath}.size must be a spacing token`);
      break;
    case BLOCK_TYPES.BUTTON:
      requireOnlyKeys(data, ['label', 'href', 'target'], dataPath, errors);
      requireString(data.label, `${dataPath}.label`, errors);
      requireString(data.href, `${dataPath}.href`, errors);
      if (typeof data.href === 'string' && !isSafeContentUrl(data.href, { allowHash: true })) errors.push(`${dataPath}.href must be a safe relative or HTTP(S) URL`);
      if (data.target !== undefined && !['_self', '_blank'].includes(data.target)) errors.push(`${dataPath}.target must be _self or _blank`);
      break;
    case BLOCK_TYPES.SEARCH:
      requireOnlyKeys(data, ['label', 'placeholder', 'buttonLabel'], dataPath, errors);
      requireString(data.label, `${dataPath}.label`, errors, { optional: true });
      requireString(data.placeholder, `${dataPath}.placeholder`, errors);
      requireString(data.buttonLabel, `${dataPath}.buttonLabel`, errors);
      break;
    case BLOCK_TYPES.RECIPE_GRID:
      requireOnlyKeys(data, ['eyebrow', 'heading', 'source', 'slugs', 'category', 'tag', 'limit', 'columns'], dataPath, errors);
      requireString(data.eyebrow, `${dataPath}.eyebrow`, errors, { optional: true });
      requireString(data.heading, `${dataPath}.heading`, errors, { optional: true });
      if (!['manual', 'category', 'tag', 'latest'].includes(data.source)) errors.push(`${dataPath}.source is not supported`);
      requireStringArray(data.slugs, `${dataPath}.slugs`, errors, { optional: true });
      requireString(data.category, `${dataPath}.category`, errors, { optional: true });
      requireString(data.tag, `${dataPath}.tag`, errors, { optional: true });
      if (!Number.isInteger(data.limit) || data.limit < 1 || data.limit > 24) errors.push(`${dataPath}.limit must be from 1 to 24`);
      if (![1, 2, 3, 4].includes(data.columns)) errors.push(`${dataPath}.columns must be from 1 to 4`);
      break;
    case BLOCK_TYPES.FEATURED_RECIPES:
      requireOnlyKeys(data, ['eyebrow', 'heading', 'slugs', 'limit'], dataPath, errors);
      requireString(data.eyebrow, `${dataPath}.eyebrow`, errors, { optional: true });
      requireString(data.heading, `${dataPath}.heading`, errors);
      requireStringArray(data.slugs, `${dataPath}.slugs`, errors);
      if (!Number.isInteger(data.limit) || data.limit < 1 || data.limit > 24) errors.push(`${dataPath}.limit must be from 1 to 24`);
      break;
    case BLOCK_TYPES.LATEST_RECIPES:
      requireOnlyKeys(data, ['eyebrow', 'heading', 'limit'], dataPath, errors);
      requireString(data.eyebrow, `${dataPath}.eyebrow`, errors, { optional: true });
      requireString(data.heading, `${dataPath}.heading`, errors);
      if (!Number.isInteger(data.limit) || data.limit < 1 || data.limit > 24) errors.push(`${dataPath}.limit must be from 1 to 24`);
      break;
    case BLOCK_TYPES.CATEGORY_GRID:
      requireOnlyKeys(data, ['eyebrow', 'heading', 'slugs'], dataPath, errors);
      requireString(data.eyebrow, `${dataPath}.eyebrow`, errors, { optional: true });
      requireString(data.heading, `${dataPath}.heading`, errors);
      requireStringArray(data.slugs, `${dataPath}.slugs`, errors, { optional: true });
      break;
    case BLOCK_TYPES.RANDOM_RECIPE:
      requireOnlyKeys(data, ['label'], dataPath, errors);
      requireString(data.label, `${dataPath}.label`, errors);
      break;
    case BLOCK_TYPES.GLOBAL_REFERENCE:
      requireOnlyKeys(data, ['globalId'], dataPath, errors);
      requireString(data.globalId, `${dataPath}.globalId`, errors);
      if (typeof data.globalId === 'string' && !SAFE_ID.test(data.globalId)) errors.push(`${dataPath}.globalId must be a safe identifier`);
      break;
    case BLOCK_TYPES.RECIPE_HERO:
      requireOnlyKeys(data, ['showCategory', 'showDescription'], dataPath, errors);
      requireBoolean(data.showCategory, `${dataPath}.showCategory`, errors);
      requireBoolean(data.showDescription, `${dataPath}.showDescription`, errors);
      break;
    case BLOCK_TYPES.RECIPE_METADATA:
      requireOnlyKeys(data, ['fields'], dataPath, errors);
      requireStringArray(data.fields, `${dataPath}.fields`, errors, { optional: true });
      if (Array.isArray(data.fields) && data.fields.some((field) => !RECIPE_METADATA_FIELDS.includes(field))) {
        errors.push(`${dataPath}.fields contains an unsupported metadata field`);
      }
      break;
    case BLOCK_TYPES.INGREDIENTS:
      requireOnlyKeys(data, ['heading', 'listStyle'], dataPath, errors);
      requireString(data.heading, `${dataPath}.heading`, errors, { optional: true });
      if (data.listStyle !== undefined && !['checkbox', 'bullet', 'plain'].includes(data.listStyle)) {
        errors.push(`${dataPath}.listStyle is not supported for ingredients`);
      }
      break;
    case BLOCK_TYPES.BEFORE_STARTING:
      requireOnlyKeys(data, ['heading', 'listStyle'], dataPath, errors);
      requireString(data.heading, `${dataPath}.heading`, errors, { optional: true });
      if (data.listStyle !== undefined && !['checklist', 'bullet', 'plain'].includes(data.listStyle)) {
        errors.push(`${dataPath}.listStyle is not supported for before-starting`);
      }
      break;
    case BLOCK_TYPES.EQUIPMENT:
      requireOnlyKeys(data, ['heading', 'listStyle'], dataPath, errors);
      requireString(data.heading, `${dataPath}.heading`, errors, { optional: true });
      if (data.listStyle !== undefined && !['bullet', 'plain'].includes(data.listStyle)) {
        errors.push(`${dataPath}.listStyle is not supported for equipment`);
      }
      break;
    case BLOCK_TYPES.INSTRUCTIONS:
      requireOnlyKeys(data, ['heading', 'listStyle'], dataPath, errors);
      requireString(data.heading, `${dataPath}.heading`, errors, { optional: true });
      if (data.listStyle !== undefined && !['numbered', 'plain'].includes(data.listStyle)) {
        errors.push(`${dataPath}.listStyle is not supported for instructions`);
      }
      break;
    case BLOCK_TYPES.RATING:
      requireOnlyKeys(data, ['heading'], dataPath, errors);
      requireString(data.heading, `${dataPath}.heading`, errors, { optional: true });
      break;
    case BLOCK_TYPES.RELATED_RECIPES:
      requireOnlyKeys(data, ['heading', 'limit'], dataPath, errors);
      requireString(data.heading, `${dataPath}.heading`, errors, { optional: true });
      if (data.limit !== undefined && (!Number.isInteger(data.limit) || data.limit < 1 || data.limit > 12)) {
        errors.push(`${dataPath}.limit must be an integer from 1 to 12`);
      }
      break;
    default:
      break;
  }
}

function validateStyle(style, path, errors) {
  if (style === undefined) return;
  if (!isRecord(style)) {
    errors.push(`${path} must be an object`);
    return;
  }
  Object.keys(style).forEach((key) => {
    if (!STYLE_KEYS.has(key)) errors.push(`${path}.${key} is not supported`);
  });
  if (style.tone !== undefined && !STYLE_TONES.includes(style.tone)) errors.push(`${path}.tone is not supported`);
  if (style.surface !== undefined && !STYLE_SURFACES.includes(style.surface)) errors.push(`${path}.surface is not supported`);
  if (style.radius !== undefined && !STYLE_RADII.includes(style.radius)) errors.push(`${path}.radius is not supported`);
}

function validateBlockInto(block, path, errors, depth, parentType = null) {
  if (depth > 5) {
    errors.push(`${path} exceeds the maximum nesting depth`);
    return;
  }
  if (!isRecord(block)) {
    errors.push(`${path} must be an object`);
    return;
  }
  Object.keys(block).forEach((key) => {
    if (!BLOCK_KEYS.has(key)) errors.push(`${path}.${key} is not supported`);
  });
  if (typeof block.id !== 'string' || !SAFE_ID.test(block.id)) errors.push(`${path}.id must be a stable lowercase identifier`);
  if (!BLOCK_TYPE_VALUES.includes(block.type)) errors.push(`${path}.type is not a registered block type`);
  if (block.type === BLOCK_TYPES.COLUMN && parentType !== BLOCK_TYPES.COLUMNS) {
    errors.push(`${path}.type column is allowed only inside columns`);
  }
  if (BLOCK_TYPE_VALUES.includes(block.type)) {
    const variants = BLOCK_VARIANTS[block.type];
    if (block.variant !== undefined && !variants.includes(block.variant)) errors.push(`${path}.variant is not supported for ${block.type}`);
    validateData(block, path, errors, depth);
  }
  errors.push(...validateLayoutConfig(block.layout, { path: `${path}.layout` }));
  errors.push(...validateResponsiveConfig(block.responsive, `${path}.responsive`));
  validateStyle(block.style, `${path}.style`, errors);
}

export function validateBlock(block) {
  const errors = [];
  validateBlockInto(block, 'block', errors, 0);
  return { valid: errors.length === 0, errors };
}

export function assertValidBlock(block) {
  const result = validateBlock(block);
  if (!result.valid) throw new Error(`Invalid block:\n- ${result.errors.join('\n- ')}`);
  return block;
}
