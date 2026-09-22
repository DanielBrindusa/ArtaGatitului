import {
  ALIGNMENT_TOKENS,
  BREAKPOINTS,
  LAYOUT_COLUMNS,
  LAYOUT_WIDTHS,
  SPACING_TOKENS,
} from './model.mjs';

const LAYOUT_KEYS = new Set(['width', 'columns', 'gap', 'paddingBlock', 'align']);
const RESPONSIVE_KEYS = new Set([...LAYOUT_KEYS, 'visible']);

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function unsupportedKeys(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

export function validateLayoutConfig(value, { partial = false, path = 'layout' } = {}) {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`${path} must be an object`];

  const errors = unsupportedKeys(value, partial ? RESPONSIVE_KEYS : LAYOUT_KEYS)
    .map((key) => `${path}.${key} is not supported`);
  if (value.width !== undefined && !LAYOUT_WIDTHS.includes(value.width)) {
    errors.push(`${path}.width must be one of ${LAYOUT_WIDTHS.join(', ')}`);
  }
  if (value.columns !== undefined && !LAYOUT_COLUMNS.includes(value.columns)) {
    errors.push(`${path}.columns must be one of ${LAYOUT_COLUMNS.join(', ')}`);
  }
  if (value.gap !== undefined && !SPACING_TOKENS.includes(value.gap)) {
    errors.push(`${path}.gap must be a spacing token`);
  }
  if (value.paddingBlock !== undefined && !SPACING_TOKENS.includes(value.paddingBlock)) {
    errors.push(`${path}.paddingBlock must be a spacing token`);
  }
  if (value.align !== undefined && !ALIGNMENT_TOKENS.includes(value.align)) {
    errors.push(`${path}.align must be one of ${ALIGNMENT_TOKENS.join(', ')}`);
  }
  if (partial && value.visible !== undefined && typeof value.visible !== 'boolean') {
    errors.push(`${path}.visible must be a boolean`);
  }
  return errors;
}

export function validateResponsiveConfig(value, path = 'responsive') {
  if (value === undefined) return [];
  if (!isRecord(value)) return [`${path} must be an object`];

  const errors = Object.keys(value)
    .filter((key) => !BREAKPOINTS.includes(key))
    .map((key) => `${path}.${key} is not a supported breakpoint`);
  BREAKPOINTS.forEach((breakpoint) => {
    errors.push(...validateLayoutConfig(value[breakpoint], {
      partial: true,
      path: `${path}.${breakpoint}`,
    }));
  });
  return errors;
}

function configClasses(config, prefix = 'layout') {
  if (!config) return [];
  return [
    config.width && `${prefix}-width-${config.width}`,
    config.columns && `${prefix}-columns-${config.columns}`,
    config.gap && `${prefix}-gap-${config.gap}`,
    config.paddingBlock && `${prefix}-padding-${config.paddingBlock}`,
    config.align && `${prefix}-align-${config.align}`,
    config.visible === false && `${prefix}-hidden`,
  ].filter(Boolean);
}

export function layoutClassNames(layout = {}, responsive = {}) {
  return [
    ...configClasses(layout),
    ...BREAKPOINTS.flatMap((breakpoint) => configClasses(responsive[breakpoint], `layout-${breakpoint}`)),
  ].join(' ');
}
