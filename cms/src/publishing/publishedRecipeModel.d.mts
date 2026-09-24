import type { RecipeDraft } from '../drafts/draftModel.mjs';
import type { PublishedRecipe } from './githubClient';

export interface SemanticChange { kind: string; label: string }

export function normalizePublishedRecipe(value: unknown): PublishedRecipe & { source: Record<string, unknown> };
export function createLinkedRecipeDraft(value: PublishedRecipe, updatedByUid: string): RecipeDraft;
export function attachPublishedSourceToDraft(draft: unknown, value: PublishedRecipe): RecipeDraft;
export function semanticRecipeChanges(draft: unknown): SemanticChange[];
export function synchronizeLinkedDraftStatus(draft: unknown): RecipeDraft;
export function sourceIdentityFromDraft(draft: unknown): PublishedSourceIdentity | null;
export function imageActionForDraft(draft: unknown): 'retain' | 'replace' | 'remove';
export function draftMatchesPublishedRecipe(draft: RecipeDraft, published: Pick<PublishedRecipe, 'path' | 'slug'>): boolean;
export function publishedDraftId(slug: string): string;

export interface PublishedSourceIdentity {
  path: string;
  slug: string;
  commitSha: string;
  blobSha: string;
}
