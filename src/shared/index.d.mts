export type RecipeStatus = 'published' | 'draft' | 'archived';
export type BlockType =
  | 'section'
  | 'container'
  | 'columns'
  | 'column'
  | 'grid'
  | 'hero'
  | 'heading'
  | 'text'
  | 'rich-text'
  | 'image'
  | 'divider'
  | 'spacer'
  | 'button'
  | 'search'
  | 'recipe-grid'
  | 'featured-recipes'
  | 'latest-recipes'
  | 'category-grid'
  | 'random-recipe'
  | 'recipe-hero'
  | 'recipe-metadata'
  | 'ingredients'
  | 'before-starting'
  | 'equipment'
  | 'instructions'
  | 'rating'
  | 'related-recipes';
export type LayoutWidth = 'narrow' | 'medium' | 'wide' | 'full';
export type LayoutColumns = 1 | 2 | 3 | 4;
export type SpacingToken = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type AlignmentToken = 'start' | 'center' | 'end' | 'stretch';
export type Breakpoint = 'desktop' | 'tablet' | 'mobile';
export type PageType = 'home' | 'standard' | 'landing';
export type PageStatus = 'published' | 'draft' | 'archived';

export interface RecipeSource {
  id?: string;
  slug?: string;
  title?: string;
  name?: string;
  description?: string | null;
  category?: string;
  ingredients?: unknown[];
  steps?: unknown[];
  preparation?: unknown[];
  beforeStart?: unknown[];
  tags?: Record<string, unknown>;
  equipment?: unknown[];
  status?: RecipeStatus;
  [key: string]: unknown;
}

export interface NormalizedRecipe {
  id: string;
  slug: string;
  title: string;
  name: string;
  description: string;
  category: string;
  ingredients: string[];
  steps: string[];
  preparation: string[];
  beforeStart: string[];
  tags: Record<string, string[]>;
  equipment: string[];
  prepTimeMinutes: number | null;
  cookTimeMinutes: number | null;
  totalTimeMinutes: number | null;
  servings: number | string | null;
  image: string | null;
  imageAlt: string | null;
  sourceUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  status: RecipeStatus;
  closing: string;
  extras: Array<Record<string, unknown>>;
  ratingSummary: Record<string, number> | null;
  keywords: string[];
  layout?: {
    modelVersion: 1;
    blocks: ContentBlock[];
  };
  [key: string]: unknown;
}

export interface LayoutConfig {
  width?: LayoutWidth;
  columns?: LayoutColumns;
  gap?: SpacingToken;
  paddingBlock?: SpacingToken;
  align?: AlignmentToken;
}

export interface ResponsiveLayoutConfig extends LayoutConfig {
  visible?: boolean;
}

export interface ContentBlock {
  id: string;
  type: BlockType;
  data: Record<string, unknown> & { blocks?: ContentBlock[] };
  layout?: LayoutConfig;
  responsive?: Partial<Record<Breakpoint, ResponsiveLayoutConfig>>;
  variant?: string;
  style?: {
    tone?: 'default' | 'accent' | 'muted' | 'contrast';
    surface?: 'none' | 'plain' | 'card';
    radius?: 'none' | 'sm' | 'md' | 'lg';
  };
}

export interface PageSource {
  id: string;
  pageType: PageType;
  title: string;
  slug: string;
  description: string;
  socialImage: string | null;
  status: PageStatus;
  layout: { modelVersion: 1; blocks: ContentBlock[] };
}

export interface BlockValidationResult {
  valid: boolean;
  errors: string[];
}

export interface BlockRenderContext {
  recipe?: NormalizedRecipe;
  recipes?: NormalizedRecipe[];
  root?: string;
  localImageUrl?: string | null;
  localImageUrls?: Record<string, string>;
  page?: PageSource;
  categories?: Array<Record<string, unknown>>;
}

export const BLOCK_MODEL_VERSION: 1;
export const CONTENT_MODEL_VERSION: 1;
export const BLOCK_TYPES: Readonly<{
  SECTION: 'section';
  CONTAINER: 'container';
  COLUMNS: 'columns';
  COLUMN: 'column';
  GRID: 'grid';
  HERO: 'hero';
  HEADING: 'heading';
  TEXT: 'text';
  RICH_TEXT: 'rich-text';
  IMAGE: 'image';
  DIVIDER: 'divider';
  SPACER: 'spacer';
  BUTTON: 'button';
  SEARCH: 'search';
  RECIPE_GRID: 'recipe-grid';
  FEATURED_RECIPES: 'featured-recipes';
  LATEST_RECIPES: 'latest-recipes';
  CATEGORY_GRID: 'category-grid';
  RANDOM_RECIPE: 'random-recipe';
  RECIPE_HERO: 'recipe-hero';
  RECIPE_METADATA: 'recipe-metadata';
  INGREDIENTS: 'ingredients';
  BEFORE_STARTING: 'before-starting';
  EQUIPMENT: 'equipment';
  INSTRUCTIONS: 'instructions';
  RATING: 'rating';
  RELATED_RECIPES: 'related-recipes';
}>;
export const BLOCK_TYPE_VALUES: readonly BlockType[];
export const LAYOUT_WIDTHS: readonly LayoutWidth[];
export const LAYOUT_COLUMNS: readonly LayoutColumns[];
export const COLUMN_SPANS: readonly (3 | 4 | 6 | 8 | 9 | 12)[];
export const SPACING_TOKENS: readonly SpacingToken[];
export const PAGE_MODEL_VERSION: 1;
export const PAGE_TYPES: readonly PageType[];
export const PAGE_STATUSES: readonly PageStatus[];
export const SYSTEM_PAGE_ROUTES: readonly string[];

export const DESIGN_TOKENS: Readonly<{
  widths: Readonly<Record<LayoutWidth, string>>;
  spacing: Readonly<Record<SpacingToken, string>>;
  radii: Readonly<Record<'none' | 'sm' | 'md' | 'lg', string>>;
  cssRoot: Readonly<Record<string, string>>;
}>;

export function normalizeRecipe(recipe: RecipeSource, fileName?: string): NormalizedRecipe;
export function validateBlock(block: unknown): BlockValidationResult;
export function renderBlock(block: ContentBlock, context?: BlockRenderContext): string;
export function renderBlockTree(blocks: ContentBlock[], context?: BlockRenderContext): string;
export function renderDesignTokenCss(): string;
export function renderLayoutTokenCss(): string;
export function normalizePage(value: unknown): PageSource;
export function pageSourcePath(page: PageSource): string;
export function collectPageReferences(page: PageSource): { recipes: string[]; links: string[]; images: string[] };
export function validatePageSource(value: unknown, options?: { recipeSlugs?: string[]; categorySlugs?: string[] }): BlockValidationResult & { page?: PageSource | null };
export function validatePageSlug(value: unknown, options?: { pageType?: PageType; recipeSlugs?: string[]; categorySlugs?: string[]; aliasSlugs?: string[]; pageSlugs?: string[]; currentSlug?: string | null }): BlockValidationResult;
export function pageOutputPath(page: PageSource): string;
