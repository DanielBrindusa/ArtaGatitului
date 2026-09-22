import {
  BLOCK_TYPES,
  BLOCK_TYPE_VALUES,
  BLOCK_VARIANTS,
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

function validateData(block, path, errors, depth) {
  const dataPath = `${path}.data`;
  const data = block.data;
  if (!isRecord(data)) {
    errors.push(`${dataPath} must be an object`);
    return;
  }

  switch (block.type) {
    case BLOCK_TYPES.SECTION:
      requireOnlyKeys(data, ['blocks'], dataPath, errors);
      if (!Array.isArray(data.blocks)) errors.push(`${dataPath}.blocks must be an array`);
      else data.blocks.forEach((child, index) => validateBlockInto(child, `${dataPath}.blocks[${index}]`, errors, depth + 1));
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
      requireOnlyKeys(data, ['paragraphs'], dataPath, errors);
      requireStringArray(data.paragraphs, `${dataPath}.paragraphs`, errors);
      break;
    case BLOCK_TYPES.IMAGE:
      requireOnlyKeys(data, ['src', 'alt', 'caption', 'loading'], dataPath, errors);
      requireString(data.src, `${dataPath}.src`, errors);
      requireString(data.alt, `${dataPath}.alt`, errors);
      requireString(data.caption, `${dataPath}.caption`, errors, { optional: true });
      if (typeof data.src === 'string' && !isSafeContentUrl(data.src)) errors.push(`${dataPath}.src must be a safe relative or HTTP(S) URL`);
      if (data.loading !== undefined && !['lazy', 'eager'].includes(data.loading)) errors.push(`${dataPath}.loading must be lazy or eager`);
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
    case BLOCK_TYPES.BEFORE_STARTING:
    case BLOCK_TYPES.EQUIPMENT:
    case BLOCK_TYPES.INSTRUCTIONS:
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

function validateBlockInto(block, path, errors, depth) {
  if (depth > 20) {
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
