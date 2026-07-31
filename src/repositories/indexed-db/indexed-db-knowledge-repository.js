import { isQuotaExceeded, StorageWriteError } from "../knowledge-repository.js";
import { buildExportDocument } from "../../features/project/project-json.js";
import {
  isIndexedDbAvailable,
  openDatabase,
  requestToPromise,
  transactionDone,
} from "./idb.js";

const DB_NAME = "your-knowledge";
const DB_VERSION = 1;
const PROJECT_STORE = "projects";
const PHOTO_STORE = "photoBinaries";

/**
 * IndexedDB-backed implementation of `KnowledgeRepository`.
 *
 * Two stores, kept apart on purpose:
 *  - `projects`      small JSON-ish document (photos metadata, observations, relations, facts)
 *  - `photoBinaries` the heavy Blobs, one record per photo
 *
 * Keeping them apart means saving a label does not rewrite megabytes of image
 * data, and exporting JSON never has to touch the binaries.
 *
 * Satisfies the `KnowledgeRepository` shape declared in `knowledge-repository.js`;
 * conformance is checked where an instance is passed into `initApp`.
 */
export class IndexedDbKnowledgeRepository {
  constructor() {
    /** @type {Promise<IDBDatabase>|null} */
    this._dbPromise = null;
  }

  /**
   * @returns {Promise<IDBDatabase>}
   */
  _db() {
    if (!isIndexedDbAvailable()) {
      return Promise.reject(
        new StorageWriteError(
          "この端末のブラウザでは保存領域（IndexedDB）を利用できません。",
        ),
      );
    }
    if (!this._dbPromise) {
      this._dbPromise = openDatabase(DB_NAME, DB_VERSION, (db) => {
        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains(PHOTO_STORE)) {
          db.createObjectStore(PHOTO_STORE, { keyPath: "id" });
        }
      });
    }
    return this._dbPromise;
  }

  /**
   * @param {string} store
   * @param {IDBTransactionMode} mode
   * @param {(store: IDBObjectStore) => void|Promise<void>} work
   * @param {string} what Human-readable subject for the error message.
   * @returns {Promise<void>}
   */
  async _write(store, mode, work, what) {
    const db = await this._db();
    try {
      const transaction = db.transaction(store, mode);
      await work(transaction.objectStore(store));
      await transactionDone(transaction);
    } catch (error) {
      const quota = isQuotaExceeded(error);
      throw new StorageWriteError(
        quota
          ? `端末の保存容量が足りず、${what}を保存できませんでした。写真を減らすか、JSONを書き出してから整理してください。`
          : `${what}を保存できませんでした。`,
        { cause: error, quotaExceeded: quota },
      );
    }
  }

  /**
   * @param {string} projectId
   * @returns {Promise<import('../knowledge-repository.js').Project|null>}
   */
  async loadProject(projectId) {
    const db = await this._db();
    const transaction = db.transaction(PROJECT_STORE, "readonly");
    const record = await requestToPromise(
      transaction.objectStore(PROJECT_STORE).get(projectId),
    );
    return record || null;
  }

  /**
   * @param {import('../knowledge-repository.js').Project} project
   * @returns {Promise<void>}
   */
  async saveProject(project) {
    const record = { ...project, updatedAt: Date.now() };
    await this._write(
      PROJECT_STORE,
      "readwrite",
      (store) => void store.put(record),
      "整理内容",
    );
  }

  /**
   * Serialise the stored project to a JSON Blob. Photo binaries are deliberately
   * NOT embedded — see `features/project/project-json.js`.
   *
   * @param {string} projectId
   * @returns {Promise<Blob>}
   */
  async exportProject(projectId) {
    const project = await this.loadProject(projectId);
    return new Blob([JSON.stringify(buildExportDocument({ project: project ?? { id: projectId, updatedAt: 0, photos: [], relations: [], facts: [] } }), null, 2)], {
      type: "application/json",
    });
  }

  /**
   * @param {string} photoId
   * @param {import('../knowledge-repository.js').PhotoBinary} binary
   * @returns {Promise<void>}
   */
  async savePhotoBinary(photoId, binary) {
    await this._write(
      PHOTO_STORE,
      "readwrite",
      (store) =>
        void store.put({ id: photoId, ...binary, savedAt: Date.now() }),
      "写真",
    );
  }

  /**
   * @param {string} photoId
   * @returns {Promise<import('../knowledge-repository.js').PhotoBinary|null>}
   */
  async loadPhotoBinary(photoId) {
    const db = await this._db();
    const transaction = db.transaction(PHOTO_STORE, "readonly");
    const record = await requestToPromise(
      transaction.objectStore(PHOTO_STORE).get(photoId),
    );
    return record || null;
  }

  /**
   * @param {string} photoId
   * @returns {Promise<void>}
   */
  async deletePhotoBinary(photoId) {
    await this._write(
      PHOTO_STORE,
      "readwrite",
      (store) => void store.delete(photoId),
      "写真の削除",
    );
  }

  /**
   * @returns {Promise<string[]>}
   */
  async listPhotoBinaryIds() {
    const db = await this._db();
    const transaction = db.transaction(PHOTO_STORE, "readonly");
    return await requestToPromise(
      transaction.objectStore(PHOTO_STORE).getAllKeys(),
    );
  }

  /**
   * @returns {Promise<void>}
   */
  async clear() {
    await this._write(
      PROJECT_STORE,
      "readwrite",
      (store) => void store.clear(),
      "データの初期化",
    );
    await this._write(
      PHOTO_STORE,
      "readwrite",
      (store) => void store.clear(),
      "データの初期化",
    );
  }
}
