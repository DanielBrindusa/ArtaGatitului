import type { AnyDraft } from './draftModel.mjs';

export const DRAFT_EXPORT_FORMAT: 'arta-gatitului-cms-export';
export const DRAFT_EXPORT_VERSION: 1;
export function createDraftExport(draft: AnyDraft, exportedAt?: string): Record<string, unknown>;
export function serializeDraftExport(draft: AnyDraft, exportedAt?: string): string;
export function draftExportFileName(draft: AnyDraft, exportedAt?: string): string;
export function downloadDraftExport(draft: AnyDraft): Promise<string>;
