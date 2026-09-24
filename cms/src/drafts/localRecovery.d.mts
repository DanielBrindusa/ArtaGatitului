import type { AnyDraft } from './draftModel.mjs';
import type { DraftBackupRecord } from './localDraftBackup.mjs';
export function shouldOfferLocalRecovery(local: DraftBackupRecord | null, remote: AnyDraft | null): boolean;
export function recoveryFieldDifferences(localDraft: AnyDraft, remoteDraft: AnyDraft): Array<{ path: string; local: unknown; remote: unknown }>;
