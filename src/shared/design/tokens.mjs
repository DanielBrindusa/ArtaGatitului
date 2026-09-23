const ROOT_TOKEN_ENTRIES = Object.freeze([
  ['color-bg', '#0f1117'],
  ['color-bg-soft', '#151924'],
  ['color-surface', '#181d29'],
  ['color-surface-alt', '#202638'],
  ['color-text', '#fff3e8'],
  ['color-text-muted', '#d4bba8'],
  ['color-primary', '#ff8a5b'],
  ['color-primary-hover', '#ffb088'],
  ['color-primary-soft', 'rgba(255, 138, 91, .16)'],
  ['color-secondary', '#62d6a8'],
  ['color-secondary-hover', '#8ff0c8'],
  ['color-border', 'rgba(255, 214, 186, .18)'],
  ['color-focus', 'rgba(255, 138, 91, .58)'],
  ['color-focus-soft', 'rgba(255, 138, 91, .22)'],
  ['shadow-card', '0 22px 60px rgba(0, 0, 0, .42)'],
  ['shadow-soft', '0 14px 38px rgba(0, 0, 0, .28)'],
  ['radius-sm', '6px'],
  ['radius-md', '8px'],
  ['radius-lg', '8px'],
  ['space-1', '4px'],
  ['space-2', '8px'],
  ['space-3', '12px'],
  ['space-4', '16px'],
  ['space-5', '24px'],
  ['space-6', '32px'],
  ['space-7', '48px'],
  ['space-8', '64px'],
  ['container', '1180px'],
]);

export const DESIGN_TOKENS = Object.freeze({
  widths: Object.freeze({ narrow: '680px', medium: '880px', wide: '1180px', full: '100%' }),
  spacing: Object.freeze({ none: '0', xs: '4px', sm: '8px', md: '16px', lg: '32px', xl: '64px' }),
  radii: Object.freeze({ none: '0', sm: '6px', md: '8px', lg: '8px' }),
  cssRoot: Object.freeze(Object.fromEntries(ROOT_TOKEN_ENTRIES)),
});

export function renderDesignTokenCss() {
  const declarations = ROOT_TOKEN_ENTRIES.map(([name, value]) => `  --${name}: ${value};`).join('\n');
  return `:root {\n${declarations}\n}`;
}

function layoutRules(prefix = 'layout') {
  const widths = Object.entries(DESIGN_TOKENS.widths).map(([token, value]) => (
    `.${prefix}-width-${token}{width:min(100%, ${value});${token === 'full' ? '' : 'margin-inline:auto;'}}`
  ));
  const columns = [1, 2, 3, 4].map((count) => (
    `.${prefix}-columns-${count}{display:grid;grid-template-columns:repeat(${count}, minmax(0, 1fr));}`
  ));
  const spacing = Object.entries(DESIGN_TOKENS.spacing).flatMap(([token, value]) => [
    `.${prefix}-gap-${token}{gap:${value};}`,
    `.${prefix}-padding-${token}{padding-block:${value};}`,
  ]);
  const alignment = ['start', 'center', 'end', 'stretch'].map((value) => (
    `.${prefix}-align-${value}{align-items:${value};}`
  ));
  return [...widths, ...columns, ...spacing, ...alignment, `.${prefix}-hidden{display:none!important;}`].join('\n');
}

export function renderLayoutTokenCss() {
  return [
    layoutRules(),
    `@media (min-width:1025px){\n${layoutRules('layout-desktop')}\n}`,
    `@media (min-width:641px) and (max-width:1024px){\n${layoutRules('layout-tablet')}\n}`,
    `@media (max-width:640px){\n${layoutRules('layout-mobile')}\n}`,
  ].join('\n');
}
