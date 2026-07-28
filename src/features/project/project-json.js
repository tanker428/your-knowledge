/**
 * JSON export / import for a whole project.
 *
 * Design rules, straight from the spec:
 *  - photo *binaries* never go in the JSON. A base64 dump of 100 phone photos is
 *    a 300MB file no tool wants to open. Photos stay in IndexedDB; the JSON
 *    carries their ids and metadata.
 *  - a file that cannot be read must leave existing data untouched. Validation
 *    therefore happens entirely before anything is written.
 *  - an unsupported schemaVersion is refused with a reason, not force-parsed.
 */

export const PROJECT_FORMAT = "your-knowledge-project";
export const SCHEMA_VERSION = "1.0.0";

/** Majors we know how to read. Anything else is refused. */
const SUPPORTED_MAJORS = new Set([1]);

/**
 * The outcome of reading an untrusted file.
 *
 * `reason` is filled in exactly when `ok` is false, and `data`/`counts` exactly
 * when it is true. They are declared optional rather than as a discriminated
 * union so that plain-JS callers can read `.reason` without a type assertion.
 *
 * @typedef {object} ValidationResult
 * @property {boolean} ok
 * @property {string} [reason]
 * @property {any} [data]
 * @property {{photos: number, observations: number, relations: number}} [counts]
 */

/**
 * Build the export document.
 *
 * @param {object} input
 * @param {import('../../repositories/knowledge-repository.js').Project} input.project
 * @param {object} input.visit
 * @param {object[]} input.entities
 * @param {Array<{id: string, status?: string} & Record<string, any>>} input.learningFacts
 * @param {object[]} input.collections
 * @param {object[]} [input.quizResults]
 * @returns {object}
 */
export function buildExportDocument(input) {
  const {
    project,
    visit,
    entities,
    learningFacts,
    collections,
    quizResults = [],
  } = input;

  const observations = project.photos.flatMap((photo) =>
    photo.observations.map((observation) => ({
      id: observation.id,
      photoId: photo.id,
      label: observation.label,
      observationType: observation.observationType,
      region: observation.region || null,
      genericCategories: observation.genericCategories || [],
      learningRoles: observation.learningRoles || [],
      domainPacks: observation.domainPacks || [],
      domainCategories: observation.domainCategories || [],
      entityId: observation.entityId || null,
      confidence: observation.confidence ?? null,
      origin: observation.origin || "ai",
      status: observation.included === false ? "rejected" : observation.status,
    })),
  );

  return {
    format: PROJECT_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    project: {
      id: project.id,
      visit,
      // Photo binaries live in IndexedDB. Only ids and metadata travel in JSON.
      photoStorage: "indexeddb",
    },
    photos: project.photos.map((photo) => ({
      id: photo.id,
      visitId: photo.visitId,
      file: photo.file,
      order: photo.order,
      title: photo.title,
      status: photo.status,
      source: photo.source,
      domainHint: photo.domainHint || null,
    })),
    observations,
    relations: project.relations,
    entities,
    learningFacts: learningFacts.map((fact) => ({
      ...fact,
      status:
        project.facts.find((item) => item.id === fact.id)?.status ??
        fact.status,
    })),
    collections,
    quizResults,
  };
}

/**
 * Parse a semantic-ish version string.
 * @param {unknown} value
 * @returns {{major: number, minor: number, patch: number}|null}
 */
export function parseSchemaVersion(value) {
  if (typeof value !== "string") return null;
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(value.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Validate an untrusted parsed JSON value. Never throws.
 *
 * @param {unknown} value
 * @returns {ValidationResult}
 */
export function validateProjectDocument(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "JSONの中身がオブジェクトではありません。" };
  }
  const doc = /** @type {Record<string, any>} */ (value);

  if (doc.format !== PROJECT_FORMAT) {
    return {
      ok: false,
      reason: `このファイルは Your Knowledge の形式ではありません（format: ${JSON.stringify(doc.format ?? null)}）。`,
    };
  }

  const version = parseSchemaVersion(doc.schemaVersion);
  if (!version) {
    return {
      ok: false,
      reason: `schemaVersion を読み取れません（${JSON.stringify(doc.schemaVersion ?? null)}）。`,
    };
  }
  if (!SUPPORTED_MAJORS.has(version.major)) {
    return {
      ok: false,
      reason: `schemaVersion ${doc.schemaVersion} には対応していません。このアプリが読めるのは 1.x です。アプリを更新してから読み込んでください。`,
    };
  }

  for (const key of ["photos", "observations", "relations"]) {
    if (!Array.isArray(doc[key])) {
      return {
        ok: false,
        reason: `"${key}" が配列ではありません。ファイルが壊れている可能性があります。`,
      };
    }
  }

  for (const [index, photo] of doc.photos.entries()) {
    if (!photo || typeof photo.id !== "string" || !photo.id) {
      return { ok: false, reason: `photos[${index}] に id がありません。` };
    }
  }

  const photoIds = new Set(
    doc.photos.map((/** @type {any} */ photo) => photo.id),
  );
  for (const [index, observation] of doc.observations.entries()) {
    if (!observation || typeof observation.id !== "string" || !observation.id) {
      return {
        ok: false,
        reason: `observations[${index}] に id がありません。`,
      };
    }
    if (
      typeof observation.photoId !== "string" ||
      !photoIds.has(observation.photoId)
    ) {
      return {
        ok: false,
        reason: `observations[${index}] (${observation.id}) が存在しない写真 ${JSON.stringify(observation.photoId ?? null)} を参照しています。`,
      };
    }
  }

  return {
    ok: true,
    data: doc,
    counts: {
      photos: doc.photos.length,
      observations: doc.observations.length,
      relations: doc.relations.length,
    },
  };
}

/**
 * Read and validate a File. Never throws.
 *
 * @param {File|Blob} file
 * @returns {Promise<ValidationResult>}
 */
export async function readProjectFile(file) {
  let text;
  try {
    text = await file.text();
  } catch (error) {
    return {
      ok: false,
      reason: `ファイルを読み込めませんでした（${String(error)}）。`,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      reason:
        "JSONとして解釈できませんでした。ファイルが壊れている可能性があります。",
    };
  }

  return validateProjectDocument(parsed);
}

/**
 * Turn a validated document back into the in-memory project shape.
 *
 * `availablePhotoIds` are the photos whose binary is actually present on this
 * device. Anything else is marked `photoMissing` so the UI can show it as
 * 写真未接続 instead of rendering a broken image.
 *
 * @param {any} doc
 * @param {Set<string>} availablePhotoIds
 * @param {string} projectId
 * @returns {{project: import('../../repositories/knowledge-repository.js').Project, missingPhotoIds: string[]}}
 */
export function documentToProject(doc, availablePhotoIds, projectId) {
  /** @type {Record<string, any[]>} */
  const observationsByPhoto = {};
  for (const observation of doc.observations) {
    (observationsByPhoto[observation.photoId] ||= []).push({
      ...observation,
      included: observation.status !== "rejected",
    });
  }

  /** @type {string[]} */
  const missingPhotoIds = [];
  const photos = doc.photos.map((/** @type {any} */ photo) => {
    const isSample = photo.source === "sample";
    const present = isSample || availablePhotoIds.has(photo.id);
    if (!present) missingPhotoIds.push(photo.id);
    return {
      ...photo,
      photoMissing: !present,
      observations: observationsByPhoto[photo.id] || [],
    };
  });

  return {
    project: {
      id: projectId,
      updatedAt: Date.now(),
      photos,
      relations: doc.relations || [],
      facts: (doc.learningFacts || []).map((/** @type {any} */ fact) => ({
        id: fact.id,
        status: fact.status,
      })),
      quizResults: doc.quizResults || [],
    },
    missingPhotoIds,
  };
}
