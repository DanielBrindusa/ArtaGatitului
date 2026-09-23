export const BLOCK_MODEL_VERSION = 1;

export const BLOCK_TYPES = Object.freeze({
  SECTION: 'section',
  CONTAINER: 'container',
  COLUMNS: 'columns',
  COLUMN: 'column',
  GRID: 'grid',
  HERO: 'hero',
  HEADING: 'heading',
  TEXT: 'text',
  RICH_TEXT: 'rich-text',
  IMAGE: 'image',
  DIVIDER: 'divider',
  SPACER: 'spacer',
  BUTTON: 'button',
  SEARCH: 'search',
  RECIPE_GRID: 'recipe-grid',
  FEATURED_RECIPES: 'featured-recipes',
  LATEST_RECIPES: 'latest-recipes',
  CATEGORY_GRID: 'category-grid',
  RANDOM_RECIPE: 'random-recipe',
  RECIPE_HERO: 'recipe-hero',
  RECIPE_METADATA: 'recipe-metadata',
  INGREDIENTS: 'ingredients',
  BEFORE_STARTING: 'before-starting',
  EQUIPMENT: 'equipment',
  INSTRUCTIONS: 'instructions',
  RATING: 'rating',
  RELATED_RECIPES: 'related-recipes',
});

export const BLOCK_TYPE_VALUES = Object.freeze(Object.values(BLOCK_TYPES));
export const LAYOUT_WIDTHS = Object.freeze(['narrow', 'medium', 'wide', 'full']);
export const LAYOUT_COLUMNS = Object.freeze([1, 2, 3, 4]);
export const COLUMN_SPANS = Object.freeze([3, 4, 6, 8, 9, 12]);
export const SPACING_TOKENS = Object.freeze(['none', 'xs', 'sm', 'md', 'lg', 'xl']);
export const ALIGNMENT_TOKENS = Object.freeze(['start', 'center', 'end', 'stretch']);
export const BREAKPOINTS = Object.freeze(['desktop', 'tablet', 'mobile']);
export const STYLE_TONES = Object.freeze(['default', 'accent', 'muted', 'contrast']);
export const STYLE_SURFACES = Object.freeze(['none', 'plain', 'card']);
export const STYLE_RADII = Object.freeze(['none', 'sm', 'md', 'lg']);

export const RECIPE_METADATA_FIELDS = Object.freeze([
  'category',
  'prepTime',
  'cookTime',
  'totalTime',
  'servings',
  'equipment',
]);

export const BLOCK_VARIANTS = Object.freeze({
  [BLOCK_TYPES.SECTION]: Object.freeze(['default', 'compact', 'inset', 'home-hero']),
  [BLOCK_TYPES.CONTAINER]: Object.freeze(['default']),
  [BLOCK_TYPES.COLUMNS]: Object.freeze(['default']),
  [BLOCK_TYPES.COLUMN]: Object.freeze(['default']),
  [BLOCK_TYPES.GRID]: Object.freeze(['default']),
  [BLOCK_TYPES.HERO]: Object.freeze(['default', 'home']),
  [BLOCK_TYPES.HEADING]: Object.freeze(['default', 'eyebrow']),
  [BLOCK_TYPES.TEXT]: Object.freeze(['default', 'lead']),
  [BLOCK_TYPES.RICH_TEXT]: Object.freeze(['default', 'lead']),
  [BLOCK_TYPES.IMAGE]: Object.freeze(['default', 'cover', 'contain']),
  [BLOCK_TYPES.DIVIDER]: Object.freeze(['default', 'subtle']),
  [BLOCK_TYPES.SPACER]: Object.freeze(['default']),
  [BLOCK_TYPES.BUTTON]: Object.freeze(['primary', 'secondary']),
  [BLOCK_TYPES.SEARCH]: Object.freeze(['default', 'hero']),
  [BLOCK_TYPES.RECIPE_GRID]: Object.freeze(['default']),
  [BLOCK_TYPES.FEATURED_RECIPES]: Object.freeze(['default']),
  [BLOCK_TYPES.LATEST_RECIPES]: Object.freeze(['default']),
  [BLOCK_TYPES.CATEGORY_GRID]: Object.freeze(['default']),
  [BLOCK_TYPES.RANDOM_RECIPE]: Object.freeze(['primary', 'secondary']),
  [BLOCK_TYPES.RECIPE_HERO]: Object.freeze(['default']),
  [BLOCK_TYPES.RECIPE_METADATA]: Object.freeze(['default', 'compact']),
  [BLOCK_TYPES.INGREDIENTS]: Object.freeze(['default']),
  [BLOCK_TYPES.BEFORE_STARTING]: Object.freeze(['default']),
  [BLOCK_TYPES.EQUIPMENT]: Object.freeze(['default', 'inline']),
  [BLOCK_TYPES.INSTRUCTIONS]: Object.freeze(['default']),
  [BLOCK_TYPES.RATING]: Object.freeze(['default']),
  [BLOCK_TYPES.RELATED_RECIPES]: Object.freeze(['default']),
});

/**
 * @typedef {Object} ContentBlock
 * @property {string} id Stable identifier within its page or template.
 * @property {string} type One of BLOCK_TYPE_VALUES.
 * @property {Record<string, unknown>} data Structured, non-executable block data.
 * @property {Object} [layout] Constrained base layout configuration.
 * @property {Object} [responsive] Desktop/tablet/mobile layout overrides.
 * @property {string} [variant] Registry-controlled visual variant.
 * @property {Object} [style] Tokenized style configuration.
 */
