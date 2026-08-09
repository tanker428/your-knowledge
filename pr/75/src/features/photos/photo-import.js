import { processImageFile } from "./image-processing.js";
import { normalizePhotoRotation } from "../../domain/photo-rotation.js";

/**
 * Sequential, interruptible photo import.
 *
 * The rules that shape this file:
 *  - never hold every full-resolution image in memory at once
 *  - persist each photo the moment it is ready, so stopping halfway keeps
 *    whatever already landed
 *  - report progress, because importing 40 photos is not instant
 *  - never claim a photo was analysed — imported photos start as 未整理
 */

/** How many photos to decode before yielding back to the browser. */
export const CHUNK_SIZE = 3;

/**
 * @typedef {object} ImportProgress
 * @property {number} done
 * @property {number} total
 * @property {number} failed
 * @property {string} currentName
 *
 * @typedef {object} ImportOutcome
 * @property {import('../../repositories/knowledge-repository.js').PhotoRecord[]} added
 * @property {{name: string, reason: string}[]} failures
 * @property {boolean} aborted
 * @property {import('../../repositories/knowledge-repository.js').StorageWriteError|null} storageError
 */

/**
 * Give the event loop a turn so the progress bar can actually paint.
 * @returns {Promise<void>}
 */
function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * @param {File[]} files
 * @param {object} options
 * @param {import('../../repositories/knowledge-repository.js').KnowledgeRepository} options.repository
 * @param {string} options.visitId
 * @param {string} options.domainHint
 * @param {number} options.startOrder
 * @param {() => string} options.createId
 * @param {(progress: ImportProgress) => void} [options.onProgress]
 * @param {(file: File, index: number) => number} [options.getRotation]
 * @param {(record: import('../../repositories/knowledge-repository.js').PhotoRecord, binary: import('../../repositories/knowledge-repository.js').PhotoBinary) => Promise<void>|void} [options.onPhotoSaved]
 * @param {AbortSignal} [options.signal]
 * @param {(file: File|Blob) => Promise<import('../../repositories/knowledge-repository.js').PhotoBinary>} [options.processImage]
 *        Injectable so the pipeline can be tested without a canvas.
 * @returns {Promise<ImportOutcome>}
 */
export async function importPhotos(files, options) {
  const {
    repository,
    visitId,
    domainHint,
    startOrder,
    createId,
    onProgress,
    getRotation,
    onPhotoSaved,
    signal,
    processImage = processImageFile,
  } = options;

  /** @type {ImportOutcome} */
  const outcome = {
    added: [],
    failures: [],
    aborted: false,
    storageError: null,
  };
  const total = files.length;
  let done = 0;

  for (let index = 0; index < total; index += 1) {
    if (signal?.aborted) {
      outcome.aborted = true;
      break;
    }

    const file = files[index];
    onProgress?.({
      done,
      total,
      failed: outcome.failures.length,
      currentName: file.name,
    });

    try {
      const binary = await processImage(file);
      const record = {
        id: createId(),
        visitId,
        file: file.name,
        order: startOrder + outcome.added.length,
        title: file.name.replace(/\.[^.]+$/, "") || "新しい写真",
        status: /** @type {const} */ ("unorganized"),
        source: /** @type {const} */ ("upload"),
        domainHint,
        rotation: normalizePhotoRotation(getRotation?.(file, index)),

        // 撮影日時は EXIF からしか取れない。未実装のため null のままにする。
        // file.lastModified はコピーで書き換わるので代わりに使わない。
        capturedAt: null,
        fileLastModified: Number.isFinite(file.lastModified) ? file.lastModified : null,
        importedAt: new Date().toISOString(),

        originalFileName: file.name,
        originalMimeType: file.type || null,
        originalBytes: Number.isFinite(file.size) ? file.size : null,
        originalWidth: binary.originalWidth ?? null,
        originalHeight: binary.originalHeight ?? null,

        // 撮ったときの感想。整理画面で書く。知識ではない。
        experienceMemo: "",

        observations: [],
      };

      // Persist before touching in-memory state: an interrupted run must never
      // leave a photo that the UI shows but storage does not have.
      await repository.savePhotoBinary(record.id, binary);
      outcome.added.push(record);
      await onPhotoSaved?.(record, binary);
    } catch (error) {
      if (
        /** @type {{name?: string}} */ (error)?.name === "StorageWriteError"
      ) {
        // Out of space: stop immediately rather than failing on every remaining file.
        outcome.storageError = /** @type {any} */ (error);
        break;
      }
      outcome.failures.push({
        name: file.name,
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    done += 1;
    if ((index + 1) % CHUNK_SIZE === 0) await yieldToBrowser();
  }

  onProgress?.({
    done,
    total,
    failed: outcome.failures.length,
    currentName: "",
  });
  return outcome;
}

/**
 * Filter a FileList down to images, dropping duplicates of what is already queued.
 *
 * @param {ArrayLike<File>} incoming
 * @param {File[]} alreadySelected
 * @param {number} limit
 * @returns {{accepted: File[], rejected: number}}
 */
export function selectImageFiles(incoming, alreadySelected, limit) {
  const key = (/** @type {File} */ file) =>
    `${file.name}:${file.size}:${file.lastModified}`;
  const seen = new Set(alreadySelected.map(key));
  /** @type {File[]} */
  const accepted = [];
  let rejected = 0;

  for (const file of Array.from(incoming)) {
    if (!file.type.startsWith("image/") || seen.has(key(file))) {
      rejected += 1;
      continue;
    }
    if (accepted.length + alreadySelected.length >= limit) {
      rejected += 1;
      continue;
    }
    seen.add(key(file));
    accepted.push(file);
  }

  return { accepted, rejected };
}
