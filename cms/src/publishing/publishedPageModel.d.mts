import type { PageDraft } from '../drafts/draftModel.mjs';
import type { PublishedPage } from './githubClient';

export interface SemanticPageChange { kind: string; label: string }
export function normalizePublishedPage(value: unknown): PublishedPage & { source: import('../../../src/shared/index.mjs').PageSource };
export function createLinkedPageDraft(value: PublishedPage, updatedByUid: string): PageDraft;
export function attachPublishedSourceToPageDraft(draft: PageDraft, published: PublishedPage): PageDraft;
export function semanticPageChanges(draft: PageDraft): SemanticPageChange[];
export function synchronizeLinkedPageDraftStatus(draft: PageDraft): PageDraft;
export function pageSourceIdentityFromDraft(draft: PageDraft): { path: string; slug: string; commitSha: string; blobSha: string } | null;
export function draftMatchesPublishedPage(draft: unknown, published: PublishedPage | { path: string; slug: string }): boolean;
export function publishedPageDraftId(slug: string): string;
