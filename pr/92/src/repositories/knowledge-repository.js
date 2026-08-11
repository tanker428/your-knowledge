/**
 * The storage boundary for Your Knowledge.
 *
 * The UI must never talk to IndexedDB (or, later, to an HTTP API or Neo4j)
 * directly — it goes through this interface. Swapping the implementation is the
 * single seam a future `ApiKnowledgeRepository` plugs into.
 *
 * Implemented today by `IndexedDbKnowledgeRepository`.
 *
 * @typedef {object} PhotoRecord
 * @property {string} id
 * @property {string} visitId
 * @property {string} file           Original filename, for display only.
 * @property {number} order
 * @property {string} title
 * @property {'unorganized'|'in-progress'|'organized'} status
 * @property {'sample'|'upload'} source
 * @property {string} [domainHint]
 * @property {number} [rotation]
 * @property {ObservationRecord[]} observations
 * @property {boolean} [photoMissing] True when the image itself is not on this device.
 * @property {string|null} [capturedAt]  Real capture time, from EXIF. Null until EXIF lands.
 * @property {number|null} [fileLastModified] File.lastModified. NEVER a stand-in for capturedAt.
 * @property {string|null} [importedAt]
 * @property {string|null} [originalFileName]
 * @property {string|null} [originalMimeType]
 * @property {number|null} [originalBytes]
 * @property {number|null} [originalWidth]   Dimensions before downscaling.
 * @property {number|null} [originalHeight]
 * @property {string} [experienceMemo] Photo-level memo, including impressions and diagnosis notes.
 *
 * @typedef {object} ObservationRecord
 * @property {string} id
 * @property {string} photoId
 * @property {string} label
 * @property {string} observationType
 * @property {{x:number,y:number,w:number,h:number}|null} region
 * @property {string[]} genericCategories
 * @property {string[]} learningRoles
 * @property {string[]} domainPacks
 * @property {string[]} domainCategories
 * @property {string|null} entityId    Stays null while the concrete name is unknown.
 * @property {number} confidence
 * @property {string} status
 * @property {boolean} [included]
 * @property {'ai'|'user'} [origin]    Who produced this record.
 *
 * @typedef {object} Project
 * @property {string} id
 * @property {number} updatedAt
 * @property {string} [schemaVersion]
 * @property {string} [userId]
 * @property {import('../domain/visit.js').Visit[]} [visits]
 * @property {string|null} [activeVisitId]
 * @property {PhotoRecord[]} photos
 * @property {object[]} relations
 * @property {{id:string,status:string}[]} facts
 * @property {object[]} [entities]                  Optional project entities.
 * @property {object[]} [referenceFacts]            Curated quiz/reference facts.
 * @property {string|null} [demoKnowledgeVersion]   Version of bundled demo knowledge.
 * @property {object[]} [quizResults]
 * @property {object[]} [learningEvents]            Append-only learning history.
 * @property {object[]} [userKnowledgeStates]       Per-user/fact learning summaries.
 * @property {string|null} [referenceDataVersion]   Version of bundled curated reference data.
 * @property {object} [sourceMetadata]              Provenance metadata for imported data.
 *
 * @typedef {object} PhotoBinary
 * @property {Blob} display    Downscaled image actually shown in the app.
 * @property {Blob} thumbnail  Small image for grids and strips.
 * @property {number} width
 * @property {number} height
 * @property {number} [originalWidth]
 * @property {number} [originalHeight]
 * @property {string} type
 * @property {number} bytes
 *
 * @typedef {object} KnowledgeRepository
 * @property {(projectId: string) => Promise<Project|null>} loadProject
 * @property {(project: Project) => Promise<void>} saveProject
 * @property {(projectId: string) => Promise<Blob>} exportProject
 * @property {(photoId: string, binary: PhotoBinary) => Promise<void>} savePhotoBinary
 * @property {(photoId: string) => Promise<PhotoBinary|null>} loadPhotoBinary
 * @property {(photoId: string) => Promise<void>} deletePhotoBinary
 * @property {() => Promise<string[]>} listPhotoBinaryIds
 * @property {() => Promise<void>} clear
 */

export const DEFAULT_PROJECT_ID = "default";

/**
 * Thrown when the browser refused to store data — almost always a full quota.
 * The UI must surface this instead of silently dropping the write.
 */
export class StorageWriteError extends Error {
  /**
   * @param {string} message
   * @param {{cause?: unknown, quotaExceeded?: boolean}} [options]
   */
  constructor(message, options = {}) {
    super(message);
    this.name = "StorageWriteError";
    this.cause = options.cause;
    this.quotaExceeded = options.quotaExceeded === true;
  }
}

/**
 * Recognise the several ways browsers report "out of space".
 * @param {unknown} error
 * @returns {boolean}
 */
export function isQuotaExceeded(error) {
  if (!error || typeof error !== "object") return false;
  const name = /** @type {{name?: string}} */ (error).name;
  return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}
