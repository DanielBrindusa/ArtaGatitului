import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readFirebaseAuthConfiguration } from '../auth/firebaseConfig';
import {
  createFirestoreDraftService,
  DraftConflictError,
  type DraftService,
  type EditorPreferences,
  type PublicationAuditInput,
} from './DraftService';
import {
  createPageDraft,
  createRecipeDraft,
  createSiteDraft,
  duplicatePageDraft,
  duplicateRecipeDraft,
  duplicateSiteDraft,
  isPageDraft,
  isRecipeDraft,
  isSiteDraft,
  type AnyDraft,
  type DraftPublicationMetadata,
  type PageDraft,
  type RecipeDraft,
  type SiteBundle,
  type SiteDraft,
  type SiteSourceBaseline,
} from './draftModel.mjs';
import {
  LocalDraftBackup,
  type DraftBackupRecord,
} from './localDraftBackup.mjs';
import { shouldConflictOnMissingRemote } from './draftSyncPolicy.mjs';
import { recoveryFieldDifferences, shouldOfferLocalRecovery } from './localRecovery.mjs';
import {
  applyEditorMutation,
  createEditorHistory,
  redoEditorMutation,
  synchronizeEditorPresent,
  undoEditorMutation,
  type EditorHistory,
} from '../history/editorHistory.mjs';
import type { HistoricalContent, PublishedPage, PublishedRecipe } from '../publishing/githubClient';
import {
  attachPublishedSourceToDraft,
  createLinkedRecipeDraft,
  draftMatchesPublishedRecipe,
  publishedDraftId,
  synchronizeLinkedDraftStatus,
} from '../publishing/publishedRecipeModel.mjs';
import {
  attachPublishedSourceToPageDraft,
  createLinkedPageDraft,
  draftMatchesPublishedPage,
  publishedPageDraftId,
  synchronizeLinkedPageDraftStatus,
} from '../publishing/publishedPageModel.mjs';
import { normalizePage } from '../../../src/shared/index.mjs';

const AUTOSAVE_DELAY_MS = 1_000;

export type DraftSaveState = 'loading' | 'saved' | 'local' | 'saving' | 'offline' | 'conflict' | 'error';
type FlushResult = 'saved' | 'offline' | 'conflict' | 'error';

interface ActiveDraft extends DraftBackupRecord {}

export interface DraftListItem extends DraftBackupRecord {
  hasConflict: boolean;
}

export interface DraftConflict {
  localDraft: AnyDraft;
  remoteDraft: AnyDraft | null;
}

export interface DraftLocalRecovery {
  localRecord: DraftBackupRecord;
  remoteDraft: AnyDraft;
  differences: ReturnType<typeof recoveryFieldDifferences>;
}

export interface PublishedDraftChoice {
  published: PublishedRecipe;
  existing: DraftBackupRecord;
}

export interface PublishedPageDraftChoice {
  published: PublishedPage;
  existing: DraftBackupRecord;
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
  const [localRecovery, setLocalRecovery] = useState<DraftLocalRecovery | null>(null);
  const [conflictIds, setConflictIds] = useState<Set<string>>(() => new Set());
  const [previewBreakpoint, setPreviewBreakpointState] = useState<EditorPreferences['previewBreakpoint']>('desktop');
  const [deleteCandidate, setDeleteCandidate] = useState<AnyDraft | null>(null);
  const [publishedDraftChoice, setPublishedDraftChoice] = useState<PublishedDraftChoice | null>(null);
  const [publishedPageDraftChoice, setPublishedPageDraftChoice] = useState<PublishedPageDraftChoice | null>(null);
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
  const historiesRef = useRef(new Map<string, EditorHistory<AnyDraft>>());
  const recoveryPromptedRef = useRef(new Set<string>());
  const [, setHistoryGeneration] = useState(0);

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

  const storeRecord = useCallback((record: ActiveDraft, checkpoint = false) => {
    try {
      const saved = backup.save(record.draft, {
        dirty: record.dirty,
        baseRevision: record.baseRevision,
        backedUpAt: record.backedUpAt,
        checkpoint,
      });
      refreshRecords();
      return saved;
    } catch {
      setSaveState('error');
      setErrorMessage('The local recovery copy could not be written.');
      return record;
    }
  }, [backup, refreshRecords]);

  const resetHistory = useCallback((draft: AnyDraft | null) => {
    if (draft) historiesRef.current.set(draft.id, createEditorHistory(draft));
    setHistoryGeneration((value) => value + 1);
  }, []);

  const applyLocalDraft = useCallback((draft: AnyDraft, baseRevision: number) => {
    editGenerationRef.current += 1;
    const next = {
      draft,
      dirty: true,
      baseRevision,
      backedUpAt: new Date().toISOString(),
    };
    setActive(next);
    setSaveState(online() ? 'local' : 'offline');
    storeRecord(next);
    scheduleSaveRef.current();
  }, [setActive, storeRecord]);

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
          storeRecord(next, true);
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
          if (local && shouldOfferLocalRecovery(local, draft)
            && !recoveryPromptedRef.current.has(draft.id)
            && (activeRef.current?.draft.id === draft.id || preferredDraftIdRef.current === draft.id)) {
            recoveryPromptedRef.current.add(draft.id);
            setLocalRecovery({
              localRecord: local,
              remoteDraft: draft,
              differences: recoveryFieldDifferences(local.draft, draft),
            });
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
        if (snapshot.draft.revision <= current.baseRevision) {
          if (shouldOfferLocalRecovery(current, snapshot.draft)
            && !recoveryPromptedRef.current.has(activeId)) {
            recoveryPromptedRef.current.add(activeId);
            setLocalRecovery({
              localRecord: current,
              remoteDraft: snapshot.draft,
              differences: recoveryFieldDifferences(current.draft, snapshot.draft),
            });
          }
          return;
        }
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
        resetHistory(snapshot.draft);
        setSaveState('saved');
      },
      () => {
        if (activeRef.current?.dirty) setSaveState(online() ? 'error' : 'offline');
      },
    );
  }, [activeId, backup, refreshRecords, resetHistory, service, setActive, setWorkspaceConflict, storeRecord]);

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

  const updateDraft = useCallback((update: (draft: AnyDraft) => AnyDraft) => {
    const current = activeRef.current;
    if (!current) return;
    const updatedDraft = update(current.draft);
    const nextDraft = isRecipeDraft(updatedDraft)
      ? synchronizeLinkedDraftStatus(updatedDraft)
      : isPageDraft(updatedDraft)
        ? synchronizeLinkedPageDraftStatus(updatedDraft)
        : updatedDraft;
    let history = historiesRef.current.get(current.draft.id)
      ?? createEditorHistory(current.draft);
    history = synchronizeEditorPresent(history, current.draft);
    history = applyEditorMutation(history, nextDraft);
    historiesRef.current.set(current.draft.id, history);
    setHistoryGeneration((value) => value + 1);
    applyLocalDraft(nextDraft, current.baseRevision);
  }, [applyLocalDraft]);

  const restoreHistoryValue = useCallback((direction: 'undo' | 'redo') => {
    const current = activeRef.current;
    if (!current) return;
    let history = historiesRef.current.get(current.draft.id) ?? createEditorHistory(current.draft);
    history = synchronizeEditorPresent(history, current.draft);
    const result = direction === 'undo' ? undoEditorMutation(history) : redoEditorMutation(history);
    if (!result.value) return;
    const restored = {
      ...result.value,
      revision: current.draft.revision,
      createdAt: current.draft.createdAt,
      updatedAt: current.draft.updatedAt,
      updatedByUid: current.draft.updatedByUid,
    } as AnyDraft;
    result.history.present = restored;
    historiesRef.current.set(current.draft.id, result.history);
    setHistoryGeneration((value) => value + 1);
    applyLocalDraft(restored, current.baseRevision);
  }, [applyLocalDraft]);

  const undo = useCallback(() => restoreHistoryValue('undo'), [restoreHistoryValue]);
  const redo = useCallback(() => restoreHistoryValue('redo'), [restoreHistoryValue]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [redo, undo]);

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
    if (!historiesRef.current.has(record.draft.id)) resetHistory(record.draft);
    backup.setLastOpenedDraftId(id);
    preferredDraftIdRef.current = id;
    setSaveState(record.dirty ? (online() ? 'local' : 'offline') : 'saved');
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: id,
      previewBreakpoint,
    }).catch(() => undefined);
  }, [backup, flush, previewBreakpoint, resetHistory, service, setActive, uid]);

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

  const newPageDraft = useCallback(async (pageType: 'standard' | 'landing' = 'standard') => {
    if (await flush() === 'conflict') return;
    const draft = createPageDraft(uid, { pageType });
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

  const createRestorationDraft = useCallback(async (historical: HistoricalContent) => {
    if (await flush() === 'conflict') throw new Error('Resolve the active draft conflict before restoring history.');
    const source = JSON.parse(historical.sourceJson) as Record<string, unknown>;
    if (historical.contentType === 'site') {
      const current = activeRef.current;
      if (!current || !isSiteDraft(current.draft)) {
        throw new Error('Open Site management before restoring a global site source.');
      }
      const siteKeys: Record<string, keyof SiteBundle> = {
        'src/content/site/templates.json': 'templates',
        'src/content/site/global-blocks.json': 'globalBlocks',
        'src/content/site/navigation.json': 'navigation',
        'src/content/site/settings.json': 'settings',
        'src/content/site/theme.json': 'theme',
        'src/content/categories.json': 'categories',
        'src/data/tag-groups.json': 'tagGroups',
      };
      const siteKey = siteKeys[historical.path];
      if (!siteKey) throw new Error('This site source is not supported by the restoration editor.');
      const nextDraft: SiteDraft = {
        ...current.draft,
        status: 'draft',
        data: {
          ...current.draft.data,
          site: { ...current.draft.data.site, [siteKey]: source },
        },
      };
      resetHistory(nextDraft);
      applyLocalDraft(nextDraft, current.baseRevision);
      return nextDraft;
    }
    const slug = historical.path.replace(/^src\/content\/(?:recipes|pages)\//, '').replace(/\.json$/, '');
    let draft: RecipeDraft | PageDraft;
    if (historical.contentType === 'recipe') {
      const linked = createLinkedRecipeDraft({
        path: historical.path,
        slug,
        title: String(source.title ?? source.name ?? slug),
        category: String(source.category ?? ''),
        imagePath: typeof source.image === 'string' ? source.image : null,
        commitSha: historical.commitSha,
        blobSha: historical.blobSha,
        sourceJson: historical.sourceJson,
      }, uid);
      const copy = duplicateRecipeDraft(linked, uid);
      draft = {
        ...copy,
        title: linked.title,
        slug: linked.slug,
        data: { ...linked.data, recipe: { ...linked.data.recipe, status: 'draft' } },
        layout: linked.layout,
      };
    } else {
      const linked = createLinkedPageDraft({
        path: historical.path,
        slug,
        id: String(source.id ?? slug),
        title: String(source.title ?? slug),
        pageType: source.pageType === 'home' ? 'home' : source.pageType === 'landing' ? 'landing' : 'standard',
        commitSha: historical.commitSha,
        blobSha: historical.blobSha,
        sourceJson: historical.sourceJson,
      }, uid);
      const copy = duplicatePageDraft(linked, uid);
      draft = {
        ...copy,
        title: linked.title,
        slug: linked.slug,
        data: { ...linked.data, page: { ...linked.data.page, status: 'draft' } },
        layout: linked.layout,
      };
    }
    const record = { draft, dirty: true, baseRevision: 0, backedUpAt: new Date().toISOString() };
    setActive(record);
    resetHistory(draft);
    storeRecord(record);
    backup.setLastOpenedDraftId(draft.id);
    preferredDraftIdRef.current = draft.id;
    setSaveState(online() ? 'local' : 'offline');
    scheduleSave();
    return draft;
  }, [applyLocalDraft, backup, flush, resetHistory, scheduleSave, setActive, storeRecord, uid]);

  const openSiteDraft = useCallback(async (site: SiteBundle, sources: SiteSourceBaseline[] = []) => {
    if (await flush() === 'conflict') return;
    const id = 'site-management';
    let record = backup.load(id);
    if (!record && online()) {
      try {
        const remote = await service.loadDraft(id);
        if (remote && isSiteDraft(remote)) record = backup.save(remote, { dirty: false, baseRevision: remote.revision });
      } catch {
        setErrorMessage('The site-management draft could not be opened from Firestore.');
      }
    }
    if (!record) {
      const draft = createSiteDraft(uid, { id, site, sources });
      record = { draft, dirty: true, baseRevision: 0, backedUpAt: new Date().toISOString() };
      editGenerationRef.current += 1;
    }
    setActive(record);
    setSaveState(record.dirty ? (online() ? 'local' : 'offline') : 'saved');
    storeRecord(record);
    backup.setLastOpenedDraftId(record.draft.id);
    preferredDraftIdRef.current = record.draft.id;
    if (record.dirty) scheduleSave();
  }, [backup, flush, scheduleSave, service, setActive, storeRecord, uid]);

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
    const draft = isPageDraft(source)
      ? duplicatePageDraft(source, uid)
      : isSiteDraft(source)
        ? duplicateSiteDraft(source, uid)
        : duplicateRecipeDraft(source, uid);
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
      resetHistory(record.draft);
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
  }, [backup, previewBreakpoint, refreshRecords, resetHistory, service, setActive, setWorkspaceConflict, uid]);

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
    const copy = isPageDraft(currentConflict.localDraft)
      ? duplicatePageDraft(currentConflict.localDraft, uid)
      : isSiteDraft(currentConflict.localDraft)
        ? duplicateSiteDraft(currentConflict.localDraft, uid)
        : duplicateRecipeDraft(currentConflict.localDraft, uid);
    const record = {
      draft: copy,
      dirty: true,
      baseRevision: 0,
      backedUpAt: new Date().toISOString(),
    };
    setActive(record);
    resetHistory(record.draft);
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
  }, [backup, previewBreakpoint, resetHistory, scheduleSave, service, setActive, setWorkspaceConflict, storeRecord, uid]);

  const recoverLocalVersion = useCallback(() => {
    if (!localRecovery) return;
    setLocalRecovery(null);
    setActive(localRecovery.localRecord);
    resetHistory(localRecovery.localRecord.draft);
    setSaveState(online() ? 'local' : 'offline');
    scheduleSave();
  }, [localRecovery, resetHistory, scheduleSave, setActive]);

  const useRecoveryCloudVersion = useCallback(() => {
    if (!localRecovery) return;
    const record = backup.save(localRecovery.remoteDraft, {
      dirty: false,
      baseRevision: localRecovery.remoteDraft.revision,
    });
    setLocalRecovery(null);
    setActive(record);
    resetHistory(record.draft);
    setSaveState('saved');
    refreshRecords();
  }, [backup, localRecovery, refreshRecords, resetHistory, setActive]);

  const saveRecoveryAsCopy = useCallback(() => {
    if (!localRecovery) return;
    const local = localRecovery.localRecord.draft;
    backup.save(localRecovery.remoteDraft, {
      dirty: false,
      baseRevision: localRecovery.remoteDraft.revision,
    });
    const copy = isPageDraft(local)
      ? duplicatePageDraft(local, uid)
      : isSiteDraft(local)
        ? duplicateSiteDraft(local, uid)
        : duplicateRecipeDraft(local, uid);
    const record = {
      draft: copy,
      dirty: true,
      baseRevision: 0,
      backedUpAt: new Date().toISOString(),
    };
    setLocalRecovery(null);
    setActive(record);
    resetHistory(copy);
    storeRecord(record);
    backup.setLastOpenedDraftId(copy.id);
    preferredDraftIdRef.current = copy.id;
    setSaveState(online() ? 'local' : 'offline');
    scheduleSave();
  }, [backup, localRecovery, resetHistory, scheduleSave, setActive, storeRecord, uid]);

  const setPreviewBreakpoint = useCallback((value: EditorPreferences['previewBreakpoint']) => {
    setPreviewBreakpointState(value);
    const draftId = activeRef.current?.draft.id ?? null;
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: draftId,
      previewBreakpoint: value,
    }).catch(() => undefined);
  }, [service, uid]);

  const recordPublicationAudit = useCallback((input: Omit<PublicationAuditInput, 'editorUid'>) => service.recordPublicationAudit(uid, {
    ...input,
    editorUid: uid,
  }), [service, uid]);

  const updatePublicationDeployment = useCallback((commitSha: string, deploymentStatus: PublicationAuditInput['deploymentStatus']) => service.updatePublicationDeployment(uid, commitSha, deploymentStatus), [service, uid]);

  const activatePublishedRecord = useCallback((record: DraftBackupRecord) => {
    setActive(record);
    storeRecord(record);
    backup.setLastOpenedDraftId(record.draft.id);
    preferredDraftIdRef.current = record.draft.id;
    setSaveState(record.dirty ? (online() ? 'local' : 'offline') : 'saved');
    void service.savePreferences(uid, {
      schemaVersion: 1,
      lastOpenedDraftId: record.draft.id,
      previewBreakpoint,
    }).catch(() => undefined);
    if (record.dirty) scheduleSave();
  }, [backup, previewBreakpoint, scheduleSave, service, setActive, storeRecord, uid]);

  const findPublishedRecord = useCallback(async (published: PublishedRecipe) => {
    const local = backup.list().find((record) => isRecipeDraft(record.draft) && draftMatchesPublishedRecipe(record.draft, published));
    if (local) return local;
    if (!online()) return null;
    const deterministicId = publishedDraftId(published.slug);
    try {
      const deterministic = await service.loadDraft(deterministicId);
      if (deterministic) {
        return backup.save(deterministic, { dirty: false, baseRevision: deterministic.revision });
      }
      const remote = (await service.listDrafts())
        .find((candidate) => isRecipeDraft(candidate) && draftMatchesPublishedRecipe(candidate, published));
      return remote
        ? backup.save(remote, { dirty: false, baseRevision: remote.revision })
        : null;
    } catch {
      setErrorMessage('Existing Firestore drafts could not be checked. Local recovery copies remain available.');
      return null;
    }
  }, [backup, service]);

  const openPublishedRecipe = useCallback(async (published: PublishedRecipe) => {
    if (await flush() !== 'saved') {
      throw new Error('Finish synchronizing the current draft before opening a published recipe.');
    }
    const existing = await findPublishedRecord(published);
    if (existing) {
      setPublishedDraftChoice({ published, existing });
      return;
    }
    const draft = createLinkedRecipeDraft(published, uid);
    const record = {
      draft,
      dirty: true,
      baseRevision: 0,
      backedUpAt: new Date().toISOString(),
    };
    editGenerationRef.current += 1;
    activatePublishedRecord(record);
  }, [activatePublishedRecord, findPublishedRecord, flush, uid]);

  const continuePublishedDraft = useCallback(() => {
    if (!publishedDraftChoice) return;
    const { existing, published } = publishedDraftChoice;
    const draft = existing.draft.sourceLink
      ? existing.draft
      : attachPublishedSourceToDraft(existing.draft, published);
    const changed = draft !== existing.draft;
    setPublishedDraftChoice(null);
    activatePublishedRecord({
      ...existing,
      draft,
      dirty: existing.dirty || changed,
      backedUpAt: new Date().toISOString(),
    });
  }, [activatePublishedRecord, publishedDraftChoice]);

  const discardPublishedDraft = useCallback(async () => {
    if (!publishedDraftChoice) return;
    const { existing, published } = publishedDraftChoice;
    if (existing.draft.revision > 0 && !online()) {
      throw new Error('Reconnect before discarding a synchronized edit draft.');
    }
    if (activeRef.current?.draft.id === existing.draft.id) setActive(null);
    if (existing.draft.revision > 0) {
      await service.deleteDraft(existing.draft.id, existing.draft.revision);
    }
    backup.remove(existing.draft.id);
    const draft = createLinkedRecipeDraft(published, uid);
    const record = {
      draft,
      dirty: true,
      baseRevision: 0,
      backedUpAt: new Date().toISOString(),
    };
    setPublishedDraftChoice(null);
    editGenerationRef.current += 1;
    activatePublishedRecord(record);
  }, [activatePublishedRecord, backup, publishedDraftChoice, service, setActive, uid]);

  const findPublishedPageRecord = useCallback(async (published: PublishedPage) => {
    const local = backup.list().find((record) => isPageDraft(record.draft) && draftMatchesPublishedPage(record.draft, published));
    if (local) return local;
    if (!online()) return null;
    const deterministicId = publishedPageDraftId(published.slug);
    try {
      const deterministic = await service.loadDraft(deterministicId);
      if (deterministic && isPageDraft(deterministic)) {
        return backup.save(deterministic, { dirty: false, baseRevision: deterministic.revision });
      }
      const remote = (await service.listDrafts())
        .find((candidate) => isPageDraft(candidate) && draftMatchesPublishedPage(candidate, published));
      return remote && isPageDraft(remote)
        ? backup.save(remote, { dirty: false, baseRevision: remote.revision })
        : null;
    } catch {
      setErrorMessage('Existing Firestore page drafts could not be checked. Local recovery copies remain available.');
      return null;
    }
  }, [backup, service]);

  const openPublishedPage = useCallback(async (published: PublishedPage) => {
    if (await flush() !== 'saved') throw new Error('Finish synchronizing the current draft before opening a published page.');
    const existing = await findPublishedPageRecord(published);
    if (existing) {
      setPublishedPageDraftChoice({ published, existing });
      return;
    }
    const draft = createLinkedPageDraft(published, uid);
    editGenerationRef.current += 1;
    activatePublishedRecord({ draft, dirty: true, baseRevision: 0, backedUpAt: new Date().toISOString() });
  }, [activatePublishedRecord, findPublishedPageRecord, flush, uid]);

  const continuePublishedPageDraft = useCallback(() => {
    if (!publishedPageDraftChoice || !isPageDraft(publishedPageDraftChoice.existing.draft)) return;
    const { existing, published } = publishedPageDraftChoice;
    const pageDraft = existing.draft as PageDraft;
    const draft = pageDraft.sourceLink
      ? pageDraft
      : attachPublishedSourceToPageDraft(pageDraft, published);
    setPublishedPageDraftChoice(null);
    activatePublishedRecord({
      ...existing,
      draft,
      dirty: existing.dirty || draft !== existing.draft,
      backedUpAt: new Date().toISOString(),
    });
  }, [activatePublishedRecord, publishedPageDraftChoice]);

  const discardPublishedPageDraft = useCallback(async () => {
    if (!publishedPageDraftChoice) return;
    const { existing, published } = publishedPageDraftChoice;
    if (existing.draft.revision > 0 && !online()) throw new Error('Reconnect before discarding a synchronized page draft.');
    if (activeRef.current?.draft.id === existing.draft.id) setActive(null);
    if (existing.draft.revision > 0) await service.deleteDraft(existing.draft.id, existing.draft.revision);
    backup.remove(existing.draft.id);
    const draft = createLinkedPageDraft(published, uid);
    setPublishedPageDraftChoice(null);
    editGenerationRef.current += 1;
    activatePublishedRecord({ draft, dirty: true, baseRevision: 0, backedUpAt: new Date().toISOString() });
  }, [activatePublishedRecord, backup, publishedPageDraftChoice, service, setActive, uid]);

  const recreateDeletedDraft = useCallback(async () => {
    const current = activeRef.current;
    if (!current || current.draft.status !== 'publishedDeleted') return;
    if (await flush() !== 'saved') return;
    const draft = isPageDraft(current.draft)
      ? duplicatePageDraft(current.draft, uid, { title: `${current.draft.title} (new)` })
      : duplicateRecipeDraft(current.draft, uid, { title: `${current.draft.title} (new)` });
    const record = {
      draft,
      dirty: true,
      baseRevision: 0,
      backedUpAt: new Date().toISOString(),
    };
    editGenerationRef.current += 1;
    activatePublishedRecord(record);
  }, [activatePublishedRecord, flush, uid]);

  const markPublished = useCallback(async (metadata: DraftPublicationMetadata) => {
    if (await flush() !== 'saved') {
      throw new Error('Save the current draft before recording publication.');
    }
    const current = activeRef.current;
    if (!current || !isRecipeDraft(current.draft)
      || current.draft.id !== metadata.sourceDraftId
      || current.draft.slug !== metadata.recipeSlug
      || metadata.operation === 'delete') {
      throw new Error('The published recipe no longer matches the active draft.');
    }
    if (!metadata.recipePath || !metadata.recipeBlobSha || !metadata.recipeJson) {
      throw new Error('GitHub did not return the published recipe source identity.');
    }
    if (autosaveTimerRef.current !== undefined) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = undefined;
    }
    const publishedDraft = synchronizeLinkedDraftStatus({
      ...current.draft,
      status: 'published',
      data: {
        ...current.draft.data,
        recipe: {
          ...current.draft.data.recipe,
          status: 'published',
          image: metadata.imagePath,
        },
        attachments: current.draft.data.attachments.map((attachment, index) => (
          index === 0 ? { ...attachment, repositoryPath: metadata.imagePath } : attachment
        )),
      },
      publishedCommitSha: metadata.commitSha,
      publishedRepository: metadata.repository,
      publishedBranch: metadata.branch,
      publishedSourceDraftId: metadata.sourceDraftId,
      publishedSlug: metadata.recipeSlug,
      publishedAt: metadata.publishedAt,
      sourceLink: {
        path: metadata.recipePath,
        slug: metadata.recipeSlug,
        commitSha: metadata.commitSha,
        blobSha: metadata.recipeBlobSha,
        sourceJson: metadata.recipeJson,
      },
      deletedAt: null,
    });
    const localRecord = {
      draft: publishedDraft,
      dirty: true,
      baseRevision: current.baseRevision,
      backedUpAt: new Date().toISOString(),
    };
    setActive(localRecord);
    storeRecord(localRecord);
    setSaveState('saving');
    savingRef.current = { id: publishedDraft.id, targetRevision: current.baseRevision + 1 };
    try {
      const savedDraft = await service.saveDraft(publishedDraft, current.baseRevision, uid);
      const savedRecord = {
        draft: savedDraft,
        dirty: false,
        baseRevision: savedDraft.revision,
        backedUpAt: new Date().toISOString(),
      };
      setActive(savedRecord);
      storeRecord(savedRecord);
      setSaveState('saved');
      return savedDraft;
    } catch (error) {
      if (error instanceof DraftConflictError) {
        setWorkspaceConflict({ localDraft: publishedDraft, remoteDraft: error.remoteDraft });
        setConflictIds((ids) => new Set(ids).add(publishedDraft.id));
        setSaveState('conflict');
      } else {
        setSaveState(online() ? 'error' : 'offline');
        setErrorMessage('The GitHub commit succeeded, but publication metadata is still saved only on this device.');
      }
      throw error;
    } finally {
      savingRef.current = null;
    }
  }, [flush, service, setActive, setWorkspaceConflict, storeRecord, uid]);

  const markPublishedDeleted = useCallback(async (
    published: PublishedRecipe,
    metadata: DraftPublicationMetadata,
  ) => {
    if (metadata.operation !== 'delete') throw new Error('Deletion metadata is invalid.');
    const existing = await findPublishedRecord(published);
    const base = existing?.draft && isRecipeDraft(existing.draft)
      ? existing.draft
      : createLinkedRecipeDraft(published, uid);
    const deletedDraft: RecipeDraft = {
      ...base,
      status: 'publishedDeleted',
      data: {
        ...base.data,
        recipe: { ...base.data.recipe, status: 'archived' },
      },
      publishedCommitSha: metadata.commitSha,
      publishedRepository: metadata.repository,
      publishedBranch: metadata.branch,
      publishedSourceDraftId: base.id,
      publishedSlug: metadata.recipeSlug,
      publishedAt: metadata.publishedAt,
      deletedAt: metadata.publishedAt,
    };
    const baseRevision = existing?.baseRevision ?? 0;
    const localRecord = {
      draft: deletedDraft,
      dirty: true,
      baseRevision,
      backedUpAt: new Date().toISOString(),
    };
    setActive(localRecord);
    storeRecord(localRecord);
    setSaveState('saving');
    try {
      const savedDraft = await service.saveDraft(deletedDraft, baseRevision, uid);
      const savedRecord = {
        draft: savedDraft,
        dirty: false,
        baseRevision: savedDraft.revision,
        backedUpAt: new Date().toISOString(),
      };
      setActive(savedRecord);
      storeRecord(savedRecord);
      setSaveState('saved');
      return savedDraft;
    } catch (error) {
      setSaveState(online() ? 'error' : 'offline');
      setErrorMessage('The GitHub deletion succeeded, but the deleted draft state is still saved only on this device.');
      throw error;
    }
  }, [findPublishedRecord, service, setActive, storeRecord, uid]);

  const markPagePublished = useCallback(async (metadata: DraftPublicationMetadata) => {
    if (await flush() !== 'saved') throw new Error('Save the current page draft before recording publication.');
    const current = activeRef.current;
    if (!current || !isPageDraft(current.draft)
      || current.draft.id !== metadata.sourceDraftId
      || current.draft.slug !== metadata.recipeSlug
      || metadata.operation === 'delete') {
      throw new Error('The published page no longer matches the active draft.');
    }
    if (!metadata.recipePath || !metadata.recipeBlobSha || !metadata.recipeJson) {
      throw new Error('GitHub did not return the published page source identity.');
    }
    let publishedSource;
    try {
      publishedSource = normalizePage(JSON.parse(metadata.recipeJson));
    } catch {
      throw new Error('GitHub returned invalid published page source.');
    }
    const repositoryImages = new Map<string, string>();
    const visitImages = (blocks: typeof publishedSource.layout.blocks) => {
      blocks.forEach((block) => {
        if (block.type === 'image' && typeof block.data?.src === 'string') repositoryImages.set(block.id, block.data.src);
        if (Array.isArray(block.data?.blocks)) visitImages(block.data.blocks);
      });
    };
    visitImages(publishedSource.layout.blocks);
    const pageDraft: PageDraft = synchronizeLinkedPageDraftStatus({
      ...current.draft,
      title: publishedSource.title,
      slug: publishedSource.slug,
      status: 'published',
      data: {
        ...current.draft.data,
        page: {
          id: publishedSource.id,
          pageType: publishedSource.pageType,
          title: publishedSource.title,
          slug: publishedSource.slug,
          description: publishedSource.description,
          socialImage: publishedSource.socialImage,
          status: 'published',
        },
        attachments: current.draft.data.attachments.map((attachment) => ({
          ...attachment,
          repositoryPath: repositoryImages.get(attachment.id) ?? attachment.repositoryPath,
          localAttachmentId: null,
          sourceDeviceId: null,
        })),
      },
      layout: publishedSource.layout,
      publishedCommitSha: metadata.commitSha,
      publishedRepository: metadata.repository,
      publishedBranch: metadata.branch,
      publishedSourceDraftId: metadata.sourceDraftId,
      publishedSlug: metadata.recipeSlug,
      publishedAt: metadata.publishedAt,
      sourceLink: {
        path: metadata.recipePath,
        slug: metadata.recipeSlug,
        commitSha: metadata.commitSha,
        blobSha: metadata.recipeBlobSha,
        sourceJson: metadata.recipeJson,
      },
      deletedAt: null,
    }) as PageDraft;
    const localRecord = {
      draft: pageDraft,
      dirty: true,
      baseRevision: current.baseRevision,
      backedUpAt: new Date().toISOString(),
    };
    setActive(localRecord);
    storeRecord(localRecord);
    setSaveState('saving');
    savingRef.current = { id: pageDraft.id, targetRevision: current.baseRevision + 1 };
    try {
      const savedDraft = await service.saveDraft(pageDraft, current.baseRevision, uid);
      if (!isPageDraft(savedDraft)) throw new Error('Firestore returned the wrong draft type.');
      const savedRecord = { draft: savedDraft, dirty: false, baseRevision: savedDraft.revision, backedUpAt: new Date().toISOString() };
      setActive(savedRecord);
      storeRecord(savedRecord);
      setSaveState('saved');
      return savedDraft;
    } catch (error) {
      if (error instanceof DraftConflictError) {
        setWorkspaceConflict({ localDraft: pageDraft, remoteDraft: error.remoteDraft });
        setConflictIds((ids) => new Set(ids).add(pageDraft.id));
        setSaveState('conflict');
      } else {
        setSaveState(online() ? 'error' : 'offline');
        setErrorMessage('The GitHub commit succeeded, but page publication metadata is still saved only on this device.');
      }
      throw error;
    } finally {
      savingRef.current = null;
    }
  }, [flush, service, setActive, setWorkspaceConflict, storeRecord, uid]);

  const markPagePublishedDeleted = useCallback(async (
    published: PublishedPage,
    metadata: DraftPublicationMetadata,
  ) => {
    if (published.pageType === 'home' || published.slug === 'home') throw new Error('Homepage cannot be deleted.');
    if (metadata.operation !== 'delete') throw new Error('Page deletion metadata is invalid.');
    const existing = await findPublishedPageRecord(published);
    const base = existing?.draft && isPageDraft(existing.draft)
      ? existing.draft
      : createLinkedPageDraft(published, uid);
    const deletedDraft: PageDraft = {
      ...base,
      status: 'publishedDeleted',
      data: { ...base.data, page: { ...base.data.page, status: 'archived' } },
      publishedCommitSha: metadata.commitSha,
      publishedRepository: metadata.repository,
      publishedBranch: metadata.branch,
      publishedSourceDraftId: base.id,
      publishedSlug: metadata.recipeSlug,
      publishedAt: metadata.publishedAt,
      deletedAt: metadata.publishedAt,
    };
    const baseRevision = existing?.baseRevision ?? 0;
    const localRecord = { draft: deletedDraft, dirty: true, baseRevision, backedUpAt: new Date().toISOString() };
    setActive(localRecord);
    storeRecord(localRecord);
    setSaveState('saving');
    try {
      const savedDraft = await service.saveDraft(deletedDraft, baseRevision, uid);
      if (!isPageDraft(savedDraft)) throw new Error('Firestore returned the wrong draft type.');
      const savedRecord = { draft: savedDraft, dirty: false, baseRevision: savedDraft.revision, backedUpAt: new Date().toISOString() };
      setActive(savedRecord);
      storeRecord(savedRecord);
      setSaveState('saved');
      return savedDraft;
    } catch (error) {
      setSaveState(online() ? 'error' : 'offline');
      setErrorMessage('The GitHub deletion succeeded, but the deleted page state is still saved only on this device.');
      throw error;
    }
  }, [findPublishedPageRecord, service, setActive, storeRecord, uid]);

  const drafts = useMemo<DraftListItem[]>(() => records.map((record) => ({
    ...record,
    hasConflict: conflictIds.has(record.draft.id),
  })), [conflictIds, records]);
  const currentHistory = active ? historiesRef.current.get(active.draft.id) : null;

  return {
    drafts,
    activeDraft: active?.draft ?? null,
    deviceId: backup.getDeviceId(),
    saveState,
    saveLabel: saveLabel(saveState),
    conflict,
    localRecovery,
    previewBreakpoint,
    deleteCandidate,
    publishedDraftChoice,
    errorMessage,
    updateDraft,
    undo,
    redo,
    canUndo: Boolean(currentHistory?.past.length),
    canRedo: Boolean(currentHistory?.future.length),
    selectDraft,
    newDraft,
    newPageDraft,
    createRestorationDraft,
    openSiteDraft,
    duplicateDraft,
    requestDelete: setDeleteCandidate,
    cancelDelete: () => setDeleteCandidate(null),
    confirmDelete,
    useCloudVersion,
    saveConflictAsCopy,
    recoverLocalVersion,
    useRecoveryCloudVersion,
    saveRecoveryAsCopy,
    setPreviewBreakpoint,
    recordPublicationAudit,
    updatePublicationDeployment,
    markPublished,
    markPublishedDeleted,
    markPagePublished,
    markPagePublishedDeleted,
    openPublishedRecipe,
    continuePublishedDraft,
    discardPublishedDraft,
    cancelPublishedDraftChoice: () => setPublishedDraftChoice(null),
    publishedPageDraftChoice,
    openPublishedPage,
    continuePublishedPageDraft,
    discardPublishedPageDraft,
    cancelPublishedPageDraftChoice: () => setPublishedPageDraftChoice(null),
    recreateDeletedDraft,
    flush,
    dismissError: () => setErrorMessage(null),
  };
}
