import type { RecipeDraft } from './draftModel.mjs';

export interface DraftBackupRecord {
  draft: RecipeDraft;
  dirty: boolean;
  baseRevision: number;
  backedUpAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const LOCAL_DRAFT_BACKUP_VERSION: 1;

export class LocalDraftBackup {
  constructor(uid: string, storage?: StorageLike);
  getDeviceId(): string;
  list(): DraftBackupRecord[];
  load(id: string): DraftBackupRecord | null;
  save(draft: unknown, options?: Partial<Pick<DraftBackupRecord, 'dirty' | 'baseRevision' | 'backedUpAt'>>): DraftBackupRecord;
  remove(id: string): void;
  getLastOpenedDraftId(): string | null;
  setLastOpenedDraftId(id: string | null): void;
}
