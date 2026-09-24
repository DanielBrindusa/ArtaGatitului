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
  | 'global-reference'
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
  template?: TemplateAssignment | null;
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
  template?: TemplateAssignment | null;
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
  globalBlocks?: Array<{ id: string; name: string; status: string; block: ContentBlock }>;
  globalBlockStack?: string[];
}

export interface TemplateAssignment {
  id: string | null;
  mode: 'linked' | 'detached';
  overrides: Record<string, unknown>;
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
  GLOBAL_REFERENCE: 'global-reference';
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
export const SITE_MODEL_VERSION: 1;
export const SITE_SOURCE_PATHS: readonly string[];
export const DEFAULT_THEME: Readonly<Record<string, unknown>>;
export function sameStructuredValue(left: unknown, right: unknown): boolean;
export function normalizeTemplateAssignment(value: unknown, defaultTemplateId?: string | null): TemplateAssignment | null;
export function validateTemplateAssignment(value: unknown, templates?: Array<Record<string, unknown>>, contentType?: string | null): BlockValidationResult;
export function resolveTemplateLayout(layout: unknown, assignment: unknown, templates?: Array<Record<string, unknown>>): { modelVersion: 1; blocks: ContentBlock[] };
export function updateTemplateBlockOverride(assignment: unknown, templates: Array<Record<string, unknown>>, block: ContentBlock, patch: Record<string, unknown>): TemplateAssignment | null;
export function detachFromTemplate<T extends { layout: unknown; template?: unknown }>(content: T, templates?: Array<Record<string, unknown>>): T;
export function resetToTemplate<T>(content: T, templateId: string): T;
export function templateUsage(templates: Array<Record<string, unknown>>, contents: Array<Record<string, unknown>>): Array<{ templateId: string; count: number; items: string[] }>;
export function replaceTemplateAndDelete<T extends Record<string, unknown>>(templates: T[], contents: T[], templateId: string, replacementId: string): { templates: T[]; contents: T[] };
export function collectGlobalBlockUsage(pages: Array<Record<string, unknown>>, globalId: string): Array<{ id: string; slug: string; title: string }>;
export function detachGlobalBlockReference(reference: ContentBlock, globalBlocks: Array<Record<string, unknown>>, nextId: string): ContentBlock;
export function assertGlobalBlockDeletion(globalId: string, pages: Array<Record<string, unknown>>): true;
export function reorderNavigationItems<T>(items: T[], fromIndex: number, toIndex: number): T[];
export function navigationTargetHref(item: Record<string, unknown>, root?: string): string;
export function renameCategory<T extends Record<string, unknown>>(categories: T[], recipes: Array<Record<string, unknown>>, navigation: Record<string, unknown>, categoryId: string, changes: Record<string, unknown>): { categories: T[]; recipes: Array<Record<string, unknown>>; navigation: Record<string, unknown>; affectedRecipes: number; routeChange: { from: string; to: string } | null };
export function deleteCategoryWithReplacement<T extends Record<string, unknown>>(categories: T[], recipes: Array<Record<string, unknown>>, categoryId: string, replacementId: string): { categories: T[]; recipes: Array<Record<string, unknown>>; affectedRecipes: number };
export function mergeTag(recipes: Array<Record<string, unknown>>, groupId: string, sourceTag: string, targetTag: string): { recipes: Array<Record<string, unknown>>; affectedRecipes: number };
export function validateTheme(value: unknown): BlockValidationResult;
export function resetTheme(): Record<string, unknown>;
export function validateSiteBundle(bundle: unknown, context?: Record<string, unknown>): BlockValidationResult;
export function renderSiteThemeCss(theme: unknown): string;
