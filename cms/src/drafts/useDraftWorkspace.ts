import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readFirebaseAuthConfiguration } from '../auth/firebaseConfig';
import {
  createFirestoreDraftService,
  DraftConflictError,
  type DraftService,
  type EditorPreferences,
} from './DraftService';
import {
  createRecipeDraft,
  duplicateRecipeDraft,
  type RecipeDraft,
} from './draftModel.mjs';
import {
  LocalDraftBackup,
  type DraftBackupRecord,
} from './localDraftBackup.mjs';
import { shouldConflictOnMissingRemote } from './draftSyncPolicy.mjs';

const AUTOSAVE_DELAY_MS = 1_000;

export type DraftSaveState = 'loading' | 'saved' | 'local' | 'saving' | 'offline' | 'conflict' | 'error';
type FlushResult = 'saved' | 'offline' | 'conflict' | 'error';

interface ActiveDraft extends DraftBackupRecord {}

export interface DraftListItem extends DraftBackupRecord {
  hasConflict: boolean;
}

export interface DraftConflict {
  localDraft: RecipeDraft;
  remoteDraft: RecipeDraft | null;
}

function online() {
  return typeof navigator === 'undefined' || navigator.onLine;
}

function saveLabel(state: DraftSaveState) {
  switch (state) {
    case 'loading': return 'Loading drafts';
    case 'local': return 'Saved locally';
    case 'saving': return 'Saving...';
    case 'offline': return 'Offline - saved locally';
    case 'conflict': return 'Sync conflict';
    case 'error': return 'Sync failed';
    default: return 'Saved';
  }
}

export function useDraftWorkspace(uid: string) {
  const configuration = useMemo(() => readFirebaseAuthConfiguration(), []);
  if (configuration.status !== 'ready') {
    throw new Error('Draft synchronization requires Firebase configuration.');
  }

  const service = useMemo<DraftService>(
    () => createFirestoreDraftService(configuration.configuration.firebase),
    [configuration],
  );
  const backup = useMemo(() => new LocalDraftBackup(uid), [uid]);
  const [records, setRecords] = useState<DraftBackupRecord[]>([]);
  const [active, setActiveState] = useState<ActiveDraft | null>(null);
  const [saveState, setSaveState] = useState<DraftSaveState>('loading');
  const [conflict, setConflict] = useState<DraftConflict | null>(null);
  const [conflictIds, setConflictIds] = useState<Set<string>>(() => new Set());
  const [previewBreakpoint, setPreviewBreakpointState] = useState<EditorPreferences['previewBreakpoint']>('desktop');
  const [deleteCandidate, setDeleteCandidate] = useState<RecipeDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const activeRef = useRef<ActiveDraft | null>(null);
  const editGenerationRef = useRef(0);
  const autosaveTimerRef = useRef<number | undefined>(undefined);
  const savePromiseRef = useRef<Promise<FlushResult> | null>(null);
  const savingRef = useRef<{ id: string; targetRevision: number } | null>(null);
  const conflictRef = useRef<DraftConflict | null>(null);
  const scheduleSaveRef = useRef<() => void>(() => undefined);
  const preferredDraftIdRef = useRef<string | null>(backup.getLastOpenedDraftId());
  const initialPreferencesAppliedRef = useRef(false);

  const setActive = useCallback((value: ActiveDraft | null) => {
    activeRef.current = value;
    setActiveState(value);
  }, []);

  const setWorkspaceConflict = useCallback((value: DraftConflict | null) => {
    conflictRef.current = value;
    setConflict(value);
    if (value && autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
  }, []);

  const refreshRecords = useCallback(() => {
    setRecords(backup.list());
  }, [backup]);

  const storeRecord = useCallback((record: ActiveDraft) => {
    try {
      const saved = backup.save(record.draft, {
        dirty: record.dirty,
        baseRevision: record.baseRevision,
        backedUpAt: record.backedUpAt,
      });
      refreshRecords();
      return saved;
    } catch {
      setSaveState('error');
      setErrorMessage('The local recovery copy could not be written.');
      return record;
    }
  }, [backup, refreshRecords]);

  const flush = useCallback(async (): Promise<FlushResult> => {
    if (conflictRef.current) return 'conflict';
    if (savePromiseRef.current) {
      const result = await savePromiseRef.current;
      if (result === 'saved' && activeRef.current?.dirty) return flush();
      return result;
    }
    const current = activeRef.current;
    if (!current?.dirty) return 'saved';
    if (!online()) {
      setSaveState('offline');
      return 'offline';
    }

    const generation = editGenerationRef.current;
    const draftToSave = current.draft;
    savingRef.current = { id: draftToSave.id, targetRevision: current.baseRevision + 1 };
    setSaveState('saving');
    setErrorMessage(null);

    const operation = (async (): Promise<FlushResult> => {
      try {
        const savedDraft = await service.saveDraft(draftToSave, current.baseRevision, uid);
        const latest = activeRef.current;
        if (latest?.draft.id === savedDraft.id) {
          const changedDuringSave = editGenerationRef.current !== generation;
          const nextDraft = changedDuringSave
            ? {
              ...latest.draft,
              revision: savedDraft.revision,
              createdAt: savedDraft.createdAt,
              updatedAt: savedDraft.updatedAt,
              updatedByUid: savedDraft.updatedByUid,
            }
            : savedDraft;
          const next = {
            draft: nextDraft,
            dirty: changedDuringSave,
            baseRevision: savedDraft.revision,
            backedUpAt: new Date().toISOString(),
          };
          setActive(next);
          storeRecord(next);
          setSaveState(changedDuringSave ? 'local' : 'saved');
          if (changedDuringSave) scheduleSaveRef.current();
        }
        setConflictIds((currentIds) => {
          const next = new Set(currentIds);
          next.delete(savedDraft.id);
          return next;
        });
        return 'saved';
      } catch (error) {
        if (error instanceof DraftConflictError) {
          const latest = activeRef.current;
          if (latest) setWorkspaceConflict({ localDraft: latest.draft, remoteDraft: error.remoteDraft });
          setConflictIds((currentIds) => new Set(currentIds).add(draftToSave.id));
          setSaveState('conflict');
          return 'conflict';
        }
        setSaveState(online() ? 'error' : 'offline');
        setErrorMessage(online()
          ? 'Firestore could not synchronize this draft. The local recovery copy is intact.'
          : null);
        return online() ? 'error' : 'offline';
      } finally {
        savingRef.current = null;
      }
    })();

    savePromiseRef.current = operation;
    const result = await operation;
    savePromiseRef.current = null;
    return result;
  }, [service, setActive, setWorkspaceConflict, storeRecord, uid]);

  const scheduleSave = useCallback(() => {
    if (autosaveTimerRef.current !== undefined) window.clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = undefined;
      void flush();
    }, AUTOSAVE_DELAY_MS);
  }, [flush]);
  scheduleSaveRef.current = scheduleSave;

  useEffect(() => {
    const localRecords = backup.list();
    setRecords(localRecords);
    const preferred = preferredDraftIdRef.current;
    const initial = localRecords.find((record) => record.draft.id === preferred) ?? localRecords[0];
    if (initial) {
      setActive(initial);
      setSaveState(initial.dirty ? (online() ? 'local' : 'offline') : 'saved');
    } else {
      setSaveState('saved');
    }

    const unsubscribeDrafts = service.subscribeToDraftList(
      (snapshots, fromCache) => {
        const remoteIds = new Set<string>();
        snapshots.forEach(({ draft, hasPendingWrites }) => {
          remoteIds.add(draft.id);
          if (hasPendingWrites) return;
          const local = backup.load(draft.id);
          const expectedOwnRevision = savingRef.current?.id === draft.id
            ? savingRef.current.targetRevision
            : null;
          if (draft.revision === expectedOwnRevision) return;
          if (local?.dirty && draft.revision > local.baseRevision && draft.revision !== expectedOwnRevision) {
            setConflictIds((ids) => new Set(ids).add(draft.id));
            return;
          }
          if (local?.dirty) return;
          if (!local || draft.revision >= local.draft.revision) {
            backup.save(draft, { dirty: false, baseRevision: draft.revision });
          }
        });

        if (!fromCache) {
          backup.list().forEach((local) => {
            if (local.draft.revision > 0 && !local.dirty && !remoteIds.has(local.draft.id)) {
              backup.remove(local.draft.id);
            }
          });
        }
        refreshRecords();

        const preferred = preferredDraftIdRef.current
          ? backup.load(preferredDraftIdRef.current)
          : null;
        if (preferred && activeRef.current?.draft.id !== preferred.draft.id && !activeRef.current?.dirty) {
          setActive(preferred);
        } else if (!activeRef.current) {
          const local = preferred ?? backup.list()[0];
          if (local) setActive(local);
        }
      },
      () => {
        setSaveState(online() ? 'error' : 'offline');
        if (online()) setErrorMessage('Firestore drafts are unavailable. Local recovery copies remain accessible.');
      },
    );

    const unsubscribePreferences = service.subscribeToPreferences(
      uid,
      (preferences) => {
        if (!preferences) return;
        preferredDraftIdRef.current = preferences.lastOpenedDraftId;
        setPreviewBreakpointState(preferences.previewBreakpoint);
        if (!initialPreferencesAppliedRef.current) {
          initialPreferencesAppliedRef.current = true;
          const preferred = preferences.lastOpenedDraftId
            ? backup.load(preferences.lastOpenedDraftId)
            : null;
          if (preferred && !activeRef.current?.dirty) {
            setActive(preferred);
            backup.setLastOpenedDraftId(preferred.draft.id);
          }
        }
      },
      () => undefined,
    );

    return () => {
      unsubscribeDrafts();
      unsubscribePreferences();
    };
  }, [backup, refreshRecords, service, setActive, uid]);

  const activeId = active?.draft.id ?? null;
  useEffect(() => {
    if (!activeId) return undefined;
    return service.subscribeToDraft(
      activeId,
      (snapshot, fromCache) => {
        const current = activeRef.current;
        if (!current || current.draft.id !== activeId || snapshot?.hasPendingWrites) return;
        if (!snapshot) {
          if (fromCache) return;
          if (shouldConflictOnMissingRemote(current)) {
            setWorkspaceConflict({ localDraft: current.draft, remoteDraft: null });
            setSaveState('conflict');
          } else if (!current.dirty) {
            backup.remove(activeId);
            setActive(null);
            refreshRecords();
          }
          return;
        }
        if (snapshot.draft.revision <= current.baseRevision) return;
        const expectedOwnRevision = savingRef.current?.id === activeId
          ? savingRef.current.targetRevision
          : null;
        if (snapshot.draft.revision === expectedOwnRevision) return;
        if (current.dirty) {
          setWorkspaceConflict({ localDraft: current.draft, remoteDraft: snapshot.draft });
          setConflictIds((ids) => new Set(ids).add(activeId));
          setSaveState('conflict');
          return;
        }
        const next = {
          draft: snapshot.draft,
          dirty: false,
          baseRevision: snapshot.draft.revision,
          backedUpAt: new Date().toISOString(),
        };
        setActive(next);
        storeRecord(next);
        setSaveState('saved');
      },
      () => {
        if (activeRef.current?.dirty) setSaveState(online() ? 'error' : 'offline');
      },
    );
  }, [activeId, backup, refreshRecords, service, setActive, setWorkspaceConflict, storeRecord]);

  useEffect(() => {
    const handleOnline = () => void flush();
    const handleOffline = () => {
      if (activeRef.current?.dirty) setSaveState('offline');
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
    };
    const handlePageHide = () => void flush();
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('pagehide', handlePageHide);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('pagehide', handlePageHide);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (autosaveTimerRef.current !== undefined) window.clearTimeout(autosaveTimerRef.current);
      void flush();
    };
  }, [flush]);

  const updateDraft = useCallback((update: (draft: RecipeDraft) => RecipeDraft) => {
    const current = activeRef.current;
    if (!current) return;
    const nextDraft = update(current.draft);
    editGenerationRef.current += 1;
    const next = {
      draft: nextDraft,
      dirty: true,
      baseRevision: current.baseRevision,
      backedUpAt: new Date().toISOString(),
    };
    setActive(next);
    setSaveState(online() ? 'local' : 'offline');
    storeRecord(next);
    scheduleSave();
  }, [scheduleSave, setActive, storeRecord]);

  const selectDraft = useCallback(async (id: string) => {
    if (activeRef.current?.draft.id === id) return;
    const result = await flush();
    if (result === 'conflict') return;
    let record = backup.load(id);
    if (!record && online()) {
      try {
        const remote = await service.loadDraft(id);
        if (remote) record = backup.save(remote, { dirty: false, baseRevision: remote.revision });
      } catch {
        setSaveState('error');
        setErrorMessage('This draft could not be opened from Firestore.');
        return;
      }
    }
    if (!record) return;
    setActive(record);
    backup.setLastOpenedDraftId(id);
    preferredDraftIdRef.current = id;
    setSaveState(record.dirty ? (online() ? 'local' : 'offline') : 'saved');
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: id,
      previewBreakpoint,
    }).catch(() => undefined);
  }, [backup, flush, previewBreakpoint, service, setActive, uid]);

  const newDraft = useCallback(async () => {
    if (await flush() === 'conflict') return;
    const draft = createRecipeDraft(uid);
    const record = {
      draft,
      dirty: true,
      baseRevision: 0,
      backedUpAt: new Date().toISOString(),
    };
    setActive(record);
    setSaveState(online() ? 'local' : 'offline');
    storeRecord(record);
    backup.setLastOpenedDraftId(draft.id);
    preferredDraftIdRef.current = draft.id;
    editGenerationRef.current += 1;
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: draft.id,
      previewBreakpoint,
    }).catch(() => undefined);
    scheduleSave();
  }, [backup, flush, previewBreakpoint, scheduleSave, service, setActive, storeRecord, uid]);

  const duplicateDraft = useCallback(async (id: string) => {
    if (await flush() === 'conflict') return;
    let source = backup.load(id)?.draft ?? null;
    if (!source && online()) {
      try {
        source = await service.loadDraft(id);
      } catch {
        setSaveState('error');
        setErrorMessage('This draft could not be duplicated from Firestore.');
        return;
      }
    }
    if (!source) return;
    const draft = duplicateRecipeDraft(source, uid);
    const record = {
      draft,
      dirty: true,
      baseRevision: 0,
      backedUpAt: new Date().toISOString(),
    };
    setActive(record);
    setSaveState(online() ? 'local' : 'offline');
    storeRecord(record);
    backup.setLastOpenedDraftId(draft.id);
    editGenerationRef.current += 1;
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: draft.id,
      previewBreakpoint,
    }).catch(() => undefined);
    scheduleSave();
  }, [backup, flush, previewBreakpoint, scheduleSave, service, setActive, storeRecord, uid]);

  const confirmDelete = useCallback(async () => {
    const draft = deleteCandidate;
    if (!draft) return;
    try {
      if (draft.revision > 0) {
        if (!online()) {
          setSaveState('offline');
          setErrorMessage('Reconnect before deleting a synchronized draft.');
          return;
        }
        await service.deleteDraft(draft.id, draft.revision);
      }
      backup.remove(draft.id);
      setConflictIds((ids) => {
        const next = new Set(ids);
        next.delete(draft.id);
        return next;
      });
      if (activeRef.current?.draft.id === draft.id) setActive(null);
      refreshRecords();
      setDeleteCandidate(null);
      setSaveState('saved');
    } catch (error) {
      if (error instanceof DraftConflictError) {
        setDeleteCandidate(null);
        setWorkspaceConflict({ localDraft: draft, remoteDraft: error.remoteDraft });
        setSaveState('conflict');
      } else {
        setSaveState('error');
        setErrorMessage('The draft could not be deleted. No local or cloud data was removed.');
      }
    }
  }, [backup, deleteCandidate, refreshRecords, service, setActive, setWorkspaceConflict]);

  const useCloudVersion = useCallback(() => {
    const currentConflict = conflictRef.current;
    if (!currentConflict) return;
    setWorkspaceConflict(null);
    if (currentConflict.remoteDraft) {
      const record = backup.save(currentConflict.remoteDraft, {
        dirty: false,
        baseRevision: currentConflict.remoteDraft.revision,
      });
      setActive(record);
      backup.setLastOpenedDraftId(currentConflict.remoteDraft.id);
      preferredDraftIdRef.current = currentConflict.remoteDraft.id;
    } else {
      backup.remove(currentConflict.localDraft.id);
      setActive(null);
      backup.setLastOpenedDraftId(null);
      preferredDraftIdRef.current = null;
    }
    setConflictIds((ids) => {
      const next = new Set(ids);
      next.delete(currentConflict.localDraft.id);
      return next;
    });
    refreshRecords();
    setSaveState('saved');
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: currentConflict.remoteDraft?.id ?? null,
      previewBreakpoint,
    }).catch(() => undefined);
  }, [backup, previewBreakpoint, refreshRecords, service, setActive, setWorkspaceConflict, uid]);

  const saveConflictAsCopy = useCallback(() => {
    const currentConflict = conflictRef.current;
    if (!currentConflict) return;
    setWorkspaceConflict(null);
    if (currentConflict.remoteDraft) {
      backup.save(currentConflict.remoteDraft, {
        dirty: false,
        baseRevision: currentConflict.remoteDraft.revision,
      });
    } else {
      backup.remove(currentConflict.localDraft.id);
    }
    const copy = duplicateRecipeDraft(currentConflict.localDraft, uid);
    const record = {
      draft: copy,
      dirty: true,
      baseRevision: 0,
      backedUpAt: new Date().toISOString(),
    };
    setActive(record);
    setSaveState(online() ? 'local' : 'offline');
    storeRecord(record);
    setConflictIds((ids) => {
      const next = new Set(ids);
      next.delete(currentConflict.localDraft.id);
      return next;
    });
    backup.setLastOpenedDraftId(copy.id);
    editGenerationRef.current += 1;
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: copy.id,
      previewBreakpoint,
    }).catch(() => undefined);
    scheduleSave();
  }, [backup, previewBreakpoint, scheduleSave, service, setActive, setWorkspaceConflict, storeRecord, uid]);

  const setPreviewBreakpoint = useCallback((value: EditorPreferences['previewBreakpoint']) => {
    setPreviewBreakpointState(value);
    const draftId = activeRef.current?.draft.id ?? null;
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: draftId,
      previewBreakpoint: value,
    }).catch(() => undefined);
  }, [service, uid]);

  const drafts = useMemo<DraftListItem[]>(() => records.map((record) => ({
    ...record,
    hasConflict: conflictIds.has(record.draft.id),
  })), [conflictIds, records]);

  return {
    drafts,
    activeDraft: active?.draft ?? null,
    saveState,
    saveLabel: saveLabel(saveState),
    conflict,
    previewBreakpoint,
    deleteCandidate,
    errorMessage,
    updateDraft,
    selectDraft,
    newDraft,
    duplicateDraft,
    requestDelete: setDeleteCandidate,
    cancelDelete: () => setDeleteCandidate(null),
    confirmDelete,
    useCloudVersion,
    saveConflictAsCopy,
    setPreviewBreakpoint,
    flush,
    dismissError: () => setErrorMessage(null),
  };
}
