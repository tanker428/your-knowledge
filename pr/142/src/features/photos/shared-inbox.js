/**
 * The hand-off point for Android's share sheet.
 *
 * The service worker cannot touch the page, so a POST to `share-target` is
 * parked in its own tiny IndexedDB store. When the app opens it drains that
 * store and treats the files exactly like a normal "写真を選ぶ" import.
 */

import {
  isIndexedDbAvailable,
  openDatabase,
  requestToPromise,
  transactionDone,
} from "../../repositories/indexed-db/idb.js";

export const SHARED_PHOTO_DB = "your-knowledge-shared-photos";
export const SHARED_PHOTO_STORE = "incoming";

/**
 * @returns {Promise<IDBDatabase>}
 */
function openInbox() {
  return openDatabase(SHARED_PHOTO_DB, 1, (db) => {
    if (!db.objectStoreNames.contains(SHARED_PHOTO_STORE)) {
      db.createObjectStore(SHARED_PHOTO_STORE, { keyPath: "id" });
    }
  });
}

/**
 * Take everything waiting in the inbox and clear it.
 * @returns {Promise<File[]>}
 */
export async function drainSharedPhotos() {
  if (!isIndexedDbAvailable()) return [];

  let db;
  try {
    db = await openInbox();
  } catch {
    return [];
  }

  try {
    const transaction = db.transaction(SHARED_PHOTO_STORE, "readwrite");
    const store = transaction.objectStore(SHARED_PHOTO_STORE);
    const records = await requestToPromise(store.getAll());
    if (!records.length) {
      db.close();
      return [];
    }
    store.clear();
    await transactionDone(transaction);

    return records
      .filter((/** @type {any} */ record) => record?.blob)
      .map(
        (/** @type {any} */ record) =>
          new File([record.blob], record.name || `shared-${record.id}.jpg`, {
            type: record.type || record.blob?.type || "image/jpeg",
            lastModified: record.lastModified || Date.now(),
          }),
      );
  } catch {
    return [];
  } finally {
    db.close();
  }
}
