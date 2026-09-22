import type { ContentBlock, NormalizedRecipe } from '../../../src/shared/index.mjs';

export type DraftStatus = 'draft' | 'ready' | 'published';
export type DraftContentType = 'recipe';

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
}

export interface DraftPublicationMetadata {
  commitSha: string;
  repository: 'DanielBrindusa/ArtaGatitului';
  branch: 'main';
  sourceDraftId: string;
  recipeSlug: string;
  imagePath: string | null;
  publishedAt: string;
}

export interface DraftValidationResult { valid: boolean; errors: string[] }

export const DRAFT_SCHEMA_VERSION: 1;
export const DRAFT_STATUSES: readonly DraftStatus[];
export const DRAFT_CONTENT_TYPES: readonly DraftContentType[];
export const MAX_DRAFT_BYTES: number;

export class UnsupportedDraftSchemaError extends Error { schemaVersion: unknown }
export class DraftValidationError extends Error { errors: string[] }

export function migrateDraft(value: unknown): RecipeDraft;
export function slugifyDraftTitle(value: unknown): string;
export function createDraftId(): string;
export function createRecipeDraft(updatedByUid: string, options?: { id?: string; title?: string }): RecipeDraft;
export function duplicateRecipeDraft(source: unknown, updatedByUid: string, options?: { id?: string; title?: string }): RecipeDraft;
export function validateDraftForStorage(value: unknown): DraftValidationResult;
export function assertDraftForStorage<T>(value: T): T;
export function draftToRecipeSource(value: unknown): NormalizedRecipe;
export function validateDraftForPublish(value: unknown): DraftValidationResult;
