import type { ContentBlock, NormalizedRecipe, PageSource, PageType } from '../../../src/shared/index.mjs';

export type DraftStatus = 'draft' | 'ready' | 'published' | 'publishedDeleted';
export type DraftContentType = 'recipe' | 'page' | 'site';

export type RecipeDraftContent = NormalizedRecipe;

export interface DraftImageAttachment {
  id: string;
  fileName: string;
  alt: string;
  localAttachmentId: string | null;
  sourceDeviceId: string | null;
  repositoryPath: string | null;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null;
  byteSize: number | null;
  width: number | null;
  height: number | null;
}

export interface RecipeDraft {
  id: string;
  contentType: 'recipe';
  schemaVersion: 1;
  title: string;
  slug: string;
  status: DraftStatus;
  data: {
    modelVersion: 1;
    recipe: RecipeDraftContent;
    attachments: DraftImageAttachment[];
  };
  layout: {
    modelVersion: 1;
    blocks: ContentBlock[];
  };
  createdAt: string | null;
  updatedAt: string | null;
  updatedByUid: string;
  revision: number;
  publishedCommitSha: string | null;
  publishedRepository: string | null;
  publishedBranch: string | null;
  publishedSourceDraftId: string | null;
  publishedSlug: string | null;
  publishedAt: string | null;
  sourceLink: PublishedSourceLink | null;
  deletedAt: string | null;
}

export interface PageDraft {
  id: string;
  contentType: 'page';
  schemaVersion: 1;
  title: string;
  slug: string;
  status: DraftStatus;
  data: {
    modelVersion: 1;
    page: Omit<PageSource, 'layout'>;
    attachments: DraftImageAttachment[];
  };
  layout: { modelVersion: 1; blocks: ContentBlock[] };
  createdAt: string | null;
  updatedAt: string | null;
  updatedByUid: string;
  revision: number;
  publishedCommitSha: string | null;
  publishedRepository: string | null;
  publishedBranch: string | null;
  publishedSourceDraftId: string | null;
  publishedSlug: string | null;
  publishedAt: string | null;
  sourceLink: PublishedSourceLink | null;
  deletedAt: string | null;
}

export interface SiteSourceBaseline {
  path: string;
  blobSha: string | null;
  sourceJson: string;
}

export interface SiteBundle {
  templates: { modelVersion: 1; templates: Array<Record<string, unknown>> };
  globalBlocks: { modelVersion: 1; blocks: Array<Record<string, unknown>> };
  navigation: Record<string, unknown>;
  settings: Record<string, unknown>;
  theme: Record<string, unknown>;
  categories: Array<Record<string, unknown>>;
  tagGroups: Record<string, unknown>;
  recipes: NormalizedRecipe[];
  pages: PageSource[];
}

export interface SiteDraft {
  id: string;
  contentType: 'site';
  schemaVersion: 1;
  title: string;
  slug: 'site-management';
  status: Exclude<DraftStatus, 'publishedDeleted'>;
  data: { modelVersion: 1; site: SiteBundle; sources: SiteSourceBaseline[] };
  layout: { modelVersion: 1; blocks: [] };
  createdAt: string | null;
  updatedAt: string | null;
  updatedByUid: string;
  revision: number;
  publishedCommitSha: string | null;
  publishedRepository: string | null;
  publishedBranch: string | null;
  publishedSourceDraftId: string | null;
  publishedSlug: string | null;
  publishedAt: string | null;
  sourceLink: null;
  deletedAt: null;
}

export type AnyDraft = RecipeDraft | PageDraft | SiteDraft;

export interface PublishedSourceLink {
  path: string;
  slug: string;
  commitSha: string;
  blobSha: string;
  sourceJson: string;
}

export interface DraftPublicationMetadata {
  commitSha: string;
  repository: 'DanielBrindusa/ArtaGatitului';
  branch: 'main';
  sourceDraftId: string;
  recipeSlug: string;
  imagePath: string | null;
  publishedAt: string;
  operation: 'create' | 'update' | 'delete';
  recipePath: string | null;
  recipeBlobSha: string | null;
  recipeJson: string | null;
}

export interface PagePublicationMetadata extends Omit<DraftPublicationMetadata, 'recipeSlug' | 'recipePath' | 'recipeBlobSha' | 'recipeJson'> {
  pageSlug: string;
  pagePath: string | null;
  pageBlobSha: string | null;
  pageJson: string | null;
}

export interface DraftValidationResult { valid: boolean; errors: string[] }

export const DRAFT_SCHEMA_VERSION: 1;
export const DRAFT_STATUSES: readonly DraftStatus[];
export const DRAFT_CONTENT_TYPES: readonly DraftContentType[];
export const MAX_DRAFT_BYTES: number;

export class UnsupportedDraftSchemaError extends Error { schemaVersion: unknown }
export class DraftValidationError extends Error { errors: string[] }

export function migrateDraft(value: unknown): AnyDraft;
export function slugifyDraftTitle(value: unknown): string;
export function createDraftId(): string;
export function createRecipeDraft(updatedByUid: string, options?: { id?: string; title?: string }): RecipeDraft;
export function createPageDraft(updatedByUid: string, options?: { id?: string; title?: string; pageType?: Exclude<PageType, 'home'> }): PageDraft;
export function createSiteDraft(updatedByUid: string, options: { id?: string; site: SiteBundle; sources?: SiteSourceBaseline[] }): SiteDraft;
export function duplicateRecipeDraft(source: unknown, updatedByUid: string, options?: { id?: string; title?: string }): RecipeDraft;
export function duplicatePageDraft(source: unknown, updatedByUid: string, options?: { id?: string; title?: string }): PageDraft;
export function duplicateSiteDraft(source: unknown, updatedByUid: string, options?: { id?: string; title?: string }): SiteDraft;
export function isRecipeDraft(value: AnyDraft | null | undefined): value is RecipeDraft;
export function isPageDraft(value: AnyDraft | null | undefined): value is PageDraft;
export function isSiteDraft(value: AnyDraft | null | undefined): value is SiteDraft;
export function validateDraftForStorage(value: unknown): DraftValidationResult;
export function assertDraftForStorage<T>(value: T): T;
export function draftToRecipeSource(value: unknown): NormalizedRecipe;
export function draftToPageSource(value: unknown): PageSource;
export function draftToSiteBundle(value: unknown): SiteBundle;
export function validateDraftForPublish(value: unknown, options?: { recipeSlugs?: string[]; categorySlugs?: string[] }): DraftValidationResult;
