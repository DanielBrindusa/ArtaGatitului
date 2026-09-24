import type { FirebaseOptions } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseApp } from '../firebase/firebaseClient';
import {
  assertDraftForStorage,
  createPageDraft,
  createRecipeDraft,
  duplicatePageDraft,
  duplicateRecipeDraft,
  duplicateSiteDraft,
  isPageDraft,
  isSiteDraft,
  migrateDraft,
  type AnyDraft,
  type PageDraft,
  type RecipeDraft,
} from './draftModel.mjs';
import { sanitizePublicationAudit } from '../history/historyModel.mjs';

const WORKSPACE_ID = 'arta-gatitului';
let firestoreInstance: Firestore | undefined;

export interface DraftSnapshot {
  draft: AnyDraft;
  hasPendingWrites: boolean;
}

export interface EditorPreferences {
  schemaVersion: 1;
  lastOpenedDraftId: string | null;
  previewBreakpoint: 'desktop' | 'tablet' | 'mobile';
}

export interface PublicationAuditInput {
  operation: 'create' | 'update' | 'delete' | 'restore';
  contentType: 'recipe' | 'page' | 'site';
  contentId: string;
  draftId: string;
  editorUid: string;
  previousCommitSha: string | null;
  newCommitSha: string;
  deploymentStatus: 'committed' | 'building' | 'live' | 'buildFailed' | 'unknown';
}

export interface DraftService {
  createDraft(uid: string, title?: string): Promise<RecipeDraft>;
  createPageDraft(uid: string, pageType?: 'standard' | 'landing', title?: string): Promise<PageDraft>;
  loadDraft(id: string): Promise<AnyDraft | null>;
  listDrafts(): Promise<AnyDraft[]>;
  saveDraft<T extends AnyDraft>(draft: T, expectedRevision: number, uid: string): Promise<T>;
  deleteDraft(id: string, expectedRevision: number): Promise<void>;
  duplicateDraft(draft: AnyDraft, uid: string): Promise<AnyDraft>;
  subscribeToDraft(id: string, onValue: (snapshot: DraftSnapshot | null, fromCache: boolean) => void, onError: (error: unknown) => void): Unsubscribe;
  subscribeToDraftList(onValue: (drafts: DraftSnapshot[], fromCache: boolean) => void, onError: (error: unknown) => void): Unsubscribe;
  savePreferences(uid: string, preferences: EditorPreferences): Promise<void>;
  subscribeToPreferences(uid: string, onValue: (preferences: EditorPreferences | null) => void, onError: (error: unknown) => void): Unsubscribe;
  recordPublicationAudit(uid: string, input: PublicationAuditInput): Promise<void>;
  updatePublicationDeployment(uid: string, commitSha: string, deploymentStatus: PublicationAuditInput['deploymentStatus']): Promise<void>;
}

export class DraftConflictError extends Error {
  readonly remoteDraft: AnyDraft | null;

  constructor(remoteDraft: AnyDraft | null) {
    super('This draft was changed on another device.');
    this.name = 'DraftConflictError';
    this.remoteDraft = remoteDraft;
  }
}

function firestore(options: FirebaseOptions) {
  if (firestoreInstance) return firestoreInstance;
  const app = getFirebaseApp(options);
  try {
    firestoreInstance = initializeFirestore(app, {
      localCache: memoryLocalCache(),
      experimentalAutoDetectLongPolling: true,
    });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('code' in error)
      || !String(error.code).includes('failed-precondition')) throw error;
    firestoreInstance = getFirestore(app);
  }
  return firestoreInstance;
}

function timestampToIso(value: unknown) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  return null;
}

function draftFromSnapshot(snapshot: DocumentSnapshot<DocumentData> | QueryDocumentSnapshot<DocumentData>) {
  if (!snapshot.exists()) return null;
  const raw = snapshot.data({ serverTimestamps: 'estimate' });
  return migrateDraft({
    ...raw,
    id: snapshot.id,
    createdAt: timestampToIso(raw.createdAt),
    updatedAt: timestampToIso(raw.updatedAt),
    publishedAt: timestampToIso(raw.publishedAt),
    deletedAt: timestampToIso(raw.deletedAt),
  });
}

function draftPayload(draft: AnyDraft, uid: string, revision: number, createdAt: unknown) {
  assertDraftForStorage(draft);
  return {
    ...draft,
    id: draft.id,
    updatedByUid: uid,
    revision,
    createdAt,
    updatedAt: serverTimestamp(),
    publishedAt: draft.publishedAt ? Timestamp.fromDate(new Date(draft.publishedAt)) : null,
    deletedAt: draft.deletedAt ? Timestamp.fromDate(new Date(draft.deletedAt)) : null,
  };
}

function normalizePreferences(value: DocumentData | undefined): EditorPreferences | null {
  if (!value || value.schemaVersion !== 1) return null;
  const previewBreakpoint = ['desktop', 'tablet', 'mobile'].includes(value.previewBreakpoint)
    ? value.previewBreakpoint as EditorPreferences['previewBreakpoint']
    : 'desktop';
  return {
    schemaVersion: 1,
    lastOpenedDraftId: typeof value.lastOpenedDraftId === 'string' ? value.lastOpenedDraftId : null,
    previewBreakpoint,
  };
}

export function createFirestoreDraftService(options: FirebaseOptions): DraftService {
  const database = firestore(options);
  const drafts = collection(database, 'workspaces', WORKSPACE_ID, 'drafts');

  const service: DraftService = {
    async createDraft(uid, title) {
      const draft = createRecipeDraft(uid, title ? { title } : undefined);
      return service.saveDraft(draft, 0, uid);
    },

    async createPageDraft(uid, pageType = 'standard', title) {
      const draft = createPageDraft(uid, { pageType, ...(title ? { title } : {}) });
      return service.saveDraft(draft, 0, uid);
    },

    async loadDraft(id) {
      const snapshot = await getDoc(doc(drafts, id));
      return draftFromSnapshot(snapshot);
    },

    async listDrafts() {
      const snapshot = await getDocs(query(drafts, orderBy('updatedAt', 'desc')));
      return snapshot.docs.map(draftFromSnapshot).filter((draft): draft is AnyDraft => draft !== null);
    },

    async saveDraft<T extends AnyDraft>(draft: T, expectedRevision: number, uid: string): Promise<T> {
      assertDraftForStorage(draft);
      const reference = doc(drafts, draft.id);
      const savedRevision = await runTransaction(database, async (transaction) => {
        const snapshot = await transaction.get(reference);
        const remoteDraft = draftFromSnapshot(snapshot);
        const remoteRevision = remoteDraft?.revision ?? 0;
        if (remoteRevision !== expectedRevision || (!remoteDraft && expectedRevision !== 0)) {
          throw new DraftConflictError(remoteDraft);
        }

        const nextRevision = remoteRevision + 1;
        transaction.set(reference, draftPayload(
          draft,
          uid,
          nextRevision,
          snapshot.exists() ? snapshot.data().createdAt : serverTimestamp(),
        ));
        return nextRevision;
      });

      const committedAt = new Date().toISOString();
      return migrateDraft({
        ...draft,
        revision: savedRevision,
        updatedByUid: uid,
        createdAt: draft.createdAt ?? committedAt,
        updatedAt: committedAt,
      }) as T;
    },

    async deleteDraft(id, expectedRevision) {
      const reference = doc(drafts, id);
      await runTransaction(database, async (transaction) => {
        const snapshot = await transaction.get(reference);
        const remoteDraft = draftFromSnapshot(snapshot);
        if (!remoteDraft) return;
        if (remoteDraft.revision !== expectedRevision) throw new DraftConflictError(remoteDraft);
        transaction.delete(reference);
      });
    },

    async duplicateDraft(source, uid) {
      const duplicate = isPageDraft(source)
        ? duplicatePageDraft(source, uid)
        : isSiteDraft(source)
          ? duplicateSiteDraft(source, uid)
          : duplicateRecipeDraft(source, uid);
      return service.saveDraft(duplicate, 0, uid);
    },

    subscribeToDraft(id, onValue, onError) {
      return onSnapshot(
        doc(drafts, id),
        { includeMetadataChanges: true },
        (snapshot) => {
          try {
            const draft = draftFromSnapshot(snapshot);
            onValue(
              draft ? { draft, hasPendingWrites: snapshot.metadata.hasPendingWrites } : null,
              snapshot.metadata.fromCache,
            );
          } catch (error) {
            onError(error);
          }
        },
        onError,
      );
    },

    subscribeToDraftList(onValue, onError) {
      return onSnapshot(
        query(drafts, orderBy('updatedAt', 'desc')),
        { includeMetadataChanges: true },
        (snapshot) => {
          const decoded: DraftSnapshot[] = [];
          try {
            snapshot.docs.forEach((document) => {
              const draft = draftFromSnapshot(document);
              if (draft) decoded.push({
                draft,
                hasPendingWrites: document.metadata.hasPendingWrites,
              });
            });
            onValue(decoded, snapshot.metadata.fromCache);
          } catch (error) {
            onError(error);
          }
        },
        onError,
      );
    },

    async savePreferences(uid, preferences) {
      await setDoc(doc(database, 'users', uid, 'preferences', 'editor'), {
        ...preferences,
        updatedByUid: uid,
        updatedAt: serverTimestamp(),
      });
    },

    subscribeToPreferences(uid, onValue, onError) {
      return onSnapshot(
        doc(database, 'users', uid, 'preferences', 'editor'),
        (snapshot) => onValue(snapshot.exists() ? normalizePreferences(snapshot.data()) : null),
        onError,
      );
    },

    async recordPublicationAudit(uid, input) {
      const audit = sanitizePublicationAudit({ ...input, editorUid: uid });
      await setDoc(doc(database, 'users', uid, 'publicationAudit', audit.newCommitSha), {
        ...audit,
        editorUid: uid,
        timestamp: serverTimestamp(),
      });
    },

    async updatePublicationDeployment(uid, commitSha, deploymentStatus) {
      if (!/^[0-9a-f]{40}$/.test(commitSha)) throw new Error('Publication audit commit is invalid.');
      if (!['committed', 'building', 'live', 'buildFailed', 'unknown'].includes(deploymentStatus)) {
        throw new Error('Publication deployment status is invalid.');
      }
      await setDoc(doc(database, 'users', uid, 'publicationAudit', commitSha), {
        deploymentStatus,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    },
  };
  return service;
}
