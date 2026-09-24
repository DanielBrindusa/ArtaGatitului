import { migrateDraft } from './draftModel.mjs';

export const LOCAL_DRAFT_BACKUP_VERSION = 1;
const KEY_PREFIX = 'arta-gatitului:draft-backup:v1';
export const LOCAL_DRAFT_CHECKPOINT_LIMIT = 5;

function now() {
  return new Date().toISOString();
}

function randomDeviceId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function emptyState() {
  return {
    version: LOCAL_DRAFT_BACKUP_VERSION,
    deviceId: randomDeviceId(),
    lastOpenedDraftId: null,
    drafts: {},
  };
}

export class LocalDraftBackup {
  constructor(uid, storage = globalThis.localStorage) {
    if (!uid) throw new Error('A Firebase UID is required to scope local draft backup.');
    if (!storage) throw new Error('Local storage is not available.');
    this.storage = storage;
    this.key = `${KEY_PREFIX}:${encodeURIComponent(uid)}`;
  }

  readState() {
    const serialized = this.storage.getItem(this.key);
    if (!serialized) return emptyState();

    try {
      const value = JSON.parse(serialized);
      if (!value || value.version !== LOCAL_DRAFT_BACKUP_VERSION || typeof value.deviceId !== 'string') {
        return emptyState();
      }
      const drafts = {};
      Object.entries(value.drafts || {}).forEach(([id, record]) => {
        try {
          if (!record || typeof record !== 'object') return;
          const draft = migrateDraft(record.draft);
          if (draft.id !== id) return;
          drafts[id] = {
            draft,
            dirty: record.dirty === true,
            baseRevision: Number.isInteger(record.baseRevision) && record.baseRevision >= 0
              ? record.baseRevision
              : draft.revision,
            backedUpAt: typeof record.backedUpAt === 'string' ? record.backedUpAt : now(),
            checkpoints: Array.isArray(record.checkpoints)
              ? record.checkpoints.slice(-LOCAL_DRAFT_CHECKPOINT_LIMIT).flatMap((checkpoint) => {
                try {
                  return [{ draft: migrateDraft(checkpoint.draft), backedUpAt: String(checkpoint.backedUpAt) }];
                } catch {
                  return [];
                }
              })
              : [],
          };
        } catch {
          // Keep other recoverable drafts when one record is malformed or from a future schema.
        }
      });
      return {
        version: LOCAL_DRAFT_BACKUP_VERSION,
        deviceId: value.deviceId,
        lastOpenedDraftId: typeof value.lastOpenedDraftId === 'string' ? value.lastOpenedDraftId : null,
        drafts,
      };
    } catch {
      return emptyState();
    }
  }

  writeState(state) {
    this.storage.setItem(this.key, JSON.stringify(state));
  }

  getDeviceId() {
    const state = this.readState();
    this.writeState(state);
    return state.deviceId;
  }

  list() {
    return Object.values(this.readState().drafts)
      .sort((left, right) => right.backedUpAt.localeCompare(left.backedUpAt));
  }

  load(id) {
    return this.readState().drafts[id] ?? null;
  }

  save(draftValue, options = {}) {
    const draft = migrateDraft(draftValue);
    const state = this.readState();
    const existing = state.drafts[draft.id];
    const checkpoints = [...(existing?.checkpoints ?? [])];
    if (options.checkpoint === true && existing && existing.draft.revision !== draft.revision) {
      checkpoints.push({ draft: existing.draft, backedUpAt: existing.backedUpAt });
    }
    state.drafts[draft.id] = {
      draft,
      dirty: options.dirty ?? existing?.dirty ?? false,
      baseRevision: options.baseRevision ?? existing?.baseRevision ?? draft.revision,
      backedUpAt: options.backedUpAt ?? now(),
      checkpoints: checkpoints.slice(-LOCAL_DRAFT_CHECKPOINT_LIMIT),
    };
    this.writeState(state);
    return state.drafts[draft.id];
  }

  checkpoints(id) {
    return this.load(id)?.checkpoints ?? [];
  }

  remove(id) {
    const state = this.readState();
    delete state.drafts[id];
    if (state.lastOpenedDraftId === id) state.lastOpenedDraftId = null;
    this.writeState(state);
  }

  getLastOpenedDraftId() {
    return this.readState().lastOpenedDraftId;
  }

  setLastOpenedDraftId(id) {
    const state = this.readState();
    state.lastOpenedDraftId = id;
    this.writeState(state);
  }
}
