const DATABASE_NAME = 'arta-gatitului-draft-assets';
const DATABASE_VERSION = 1;
const STORE_NAME = 'images';

interface StoredDraftImage {
  key: string;
  uid: string;
  draftId: string;
  attachmentId: string;
  blob: Blob;
  savedAt: string;
}

function imageKey(uid: string, draftId: string, attachmentId: string) {
  return `${uid}:${draftId}:${attachmentId}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const store = database.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('draft', ['uid', 'draftId']);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Draft image storage is unavailable.'));
  });
}

function transactionRequest<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>) {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Draft image operation failed.'));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Draft image transaction failed.'));
    };
  }));
}

export async function storeDraftImage(uid: string, draftId: string, attachmentId: string, blob: Blob) {
  const value: StoredDraftImage = {
    key: imageKey(uid, draftId, attachmentId),
    uid,
    draftId,
    attachmentId,
    blob,
    savedAt: new Date().toISOString(),
  };
  await transactionRequest('readwrite', (store) => store.put(value));
}

export async function loadDraftImage(uid: string, draftId: string, attachmentId: string) {
  const record = await transactionRequest<StoredDraftImage | undefined>(
    'readonly',
    (store) => store.get(imageKey(uid, draftId, attachmentId)),
  );
  return record?.blob ?? null;
}

export async function removeDraftImage(uid: string, draftId: string, attachmentId: string) {
  await transactionRequest('readwrite', (store) => store.delete(imageKey(uid, draftId, attachmentId)));
}
