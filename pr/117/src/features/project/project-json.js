import { normalizePhotoRotation } from "../../domain/photo-rotation.js";

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
export const SCHEMA_VERSION = "2.0.0";

/** Majors we know how to read. Anything else is refused. */
const SUPPORTED_MAJORS = new Set([1, 2]);
const REFERENCE_FACT_VALUE_TYPES = new Set([
  "entity-reference",
  "observation-reference",
  "quantity",
  "reference",
  "text",
]);

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
 * A non-fatal diagnostic from resolving ReferenceFact values against a
 * ReferenceGraph. These issues should be displayed or logged, not used to
 * reject the whole project file.
 *
 * @typedef {object} ReferenceDiagnostic
 * @property {"reference-data-version-mismatch"|"unresolved-reference"|"axis-mismatch"} type
 * @property {string|null} [referenceFactId]
 * @property {string} [value]
 * @property {string|null} [axis]
 * @property {string|null} [referenceAxis]
 * @property {string} [expectedVersion]
 * @property {string} [actualVersion]
 */

/**
 * Build the export document.
 *
 * @param {object} input
 * @param {import('../../repositories/knowledge-repository.js').Project} input.project
 * @param {object} [input.visit] Legacy, ignored by v2.
 * @param {object[]} [input.entities]
 * @param {object[]} [input.learningFacts] Legacy, never exported as LearningFact.
 * @param {object[]} [input.collections] Derived data, never exported.
 * @param {object[]} [input.quizResults]
 * @param {object[]} [input.learningEvents]
 * @param {object[]} [input.userKnowledgeStates]
 * @returns {object}
 */
export function buildExportDocument(input) {
  const {
    project,
    quizResults = [],
    learningEvents = [],
    userKnowledgeStates = [],
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
      userId: project.userId || "user-local",
      activeVisitId: project.activeVisitId ?? null,
      visits: project.visits || (input.visit ? [input.visit] : []),
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
      rotation: normalizePhotoRotation(photo.rotation),
      capturedAt: photo.capturedAt ?? null,
      fileLastModified: photo.fileLastModified ?? null,
      importedAt: photo.importedAt ?? null,
      originalFileName: photo.originalFileName ?? photo.file ?? null,
      originalMimeType: photo.originalMimeType ?? null,
      originalBytes: photo.originalBytes ?? null,
      originalWidth: photo.originalWidth ?? null,
      originalHeight: photo.originalHeight ?? null,
      experienceMemo: photo.experienceMemo ?? "",
    })),
    observations,
    relations: project.relations,
    entities: Array.isArray(project.entities) ? project.entities : [],
    referenceFacts: project.referenceFacts || [],
    demoKnowledgeVersion: project.demoKnowledgeVersion ?? null,
    // Legacy facts are retained under an explicit quarantine key so an old
    // user's data is not silently destroyed or reclassified as ReferenceFact.
    legacyFacts: project.facts || [],
    quizResults: project.quizResults || quizResults,
    learningEvents: project.learningEvents || learningEvents,
    userKnowledgeStates: project.userKnowledgeStates || userKnowledgeStates,
    referenceDataVersion: project.referenceDataVersion ?? null,
    sourceMetadata: project.sourceMetadata || {},
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
      reason: `schemaVersion ${doc.schemaVersion} には対応していません。このアプリが読めるのは 1.x / 2.x です。アプリを更新してから読み込んでください。`,
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

  if (version.major >= 2 && (!doc.project || typeof doc.project !== "object" || !Array.isArray(doc.project.visits))) {
    return { ok: false, reason: 'v2 JSONの "project.visits" が配列ではありません。' };
  }

  for (const key of ["entities", "referenceFacts", "quizResults", "learningEvents", "userKnowledgeStates"]) {
    if (doc[key] !== undefined && !Array.isArray(doc[key])) {
      return { ok: false, reason: `"${key}" が配列ではありません。ファイルが壊れている可能性があります。` };
    }
  }

  const checkUniqueIds = (key, values) => {
    if (!Array.isArray(values)) return null;
    const seen = new Set();
    for (const [index, item] of values.entries()) {
      if (item?.id === undefined) continue;
      if (typeof item.id !== "string" || !item.id) return `${key}[${index}] の id が不正です。`;
      if (seen.has(item.id)) return `${key} の id ${JSON.stringify(item.id)} が重複しています。`;
      seen.add(item.id);
    }
    return null;
  };
  for (const [key, values] of Object.entries({
    visits: doc.project?.visits,
    photos: doc.photos,
    observations: doc.observations,
    relations: doc.relations,
    entities: doc.entities,
    referenceFacts: doc.referenceFacts,
    quizResults: doc.quizResults,
    learningEvents: doc.learningEvents,
  })) {
    const error = checkUniqueIds(key, values);
    if (error) return { ok: false, reason: error };
  }

  const visitIds = new Set((doc.project?.visits || []).map((visit) => visit.id));
  if (doc.project?.activeVisitId != null && !visitIds.has(doc.project.activeVisitId)) {
    return { ok: false, reason: `activeVisitId ${JSON.stringify(doc.project.activeVisitId)} が存在しません。` };
  }

  for (const [index, photo] of doc.photos.entries()) {
    if (!photo || typeof photo.id !== "string" || !photo.id) {
      return { ok: false, reason: `photos[${index}] に id がありません。` };
    }
  }

  const photoIds = new Set(
    doc.photos.map((/** @type {any} */ photo) => photo.id),
  );
  for (const [index, photo] of doc.photos.entries()) {
    if (typeof photo.visitId !== "string" || !visitIds.has(photo.visitId)) {
      return { ok: false, reason: `photos[${index}] (${photo.id}) のvisitIdが存在しません。` };
    }
  }
  const observationIds = new Set();
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
    observationIds.add(observation.id);
  }

  for (const [index, relation] of doc.relations.entries()) {
    if (!observationIds.has(relation.sourceId) || !observationIds.has(relation.targetId)) {
      return { ok: false, reason: `relations[${index}] が存在しないObservationを参照しています。` };
    }
  }

  const entityIds = new Set((doc.entities || []).map((entity) => entity.id));
  for (const [index, fact] of (doc.referenceFacts || []).entries()) {
    if (fact.subjectId != null && !entityIds.has(fact.subjectId) && !observationIds.has(fact.subjectId)) {
      return { ok: false, reason: `referenceFacts[${index}] のsubjectIdが存在しません。` };
    }
    if (fact.subjectReferenceId != null && !isNonEmptyString(fact.subjectReferenceId)) {
      return { ok: false, reason: `referenceFacts[${index}] has an invalid subjectReferenceId.` };
    }
    for (const key of ["observationId", "targetObservationId"]) {
      if (fact[key] != null && !observationIds.has(fact[key])) {
        return { ok: false, reason: `referenceFacts[${index}] の${key}が存在しません。` };
      }
    }
    if (fact.valueType != null && !REFERENCE_FACT_VALUE_TYPES.has(fact.valueType)) {
      return { ok: false, reason: `referenceFacts[${index}] has an unsupported valueType.` };
    }
    if (fact.valueType === "entity-reference") {
      const values = stringValues(fact.value);
      if (!values.length || values.some((value) => !entityIds.has(value))) {
        return { ok: false, reason: `referenceFacts[${index}] has an invalid entity reference value.` };
      }
    }
    if (fact.valueType === "observation-reference") {
      const values = stringValues(fact.value);
      if (!values.length || values.some((value) => !observationIds.has(value))) {
        return { ok: false, reason: `referenceFacts[${index}] has an invalid observation reference value.` };
      }
    }
    if (fact.valueType === "reference") {
      if (!isNonEmptyString(fact.axis)) {
        return { ok: false, reason: `referenceFacts[${index}] has no reference axis.` };
      }
      if (!stringValues(fact.value).length) {
        return { ok: false, reason: `referenceFacts[${index}] has an empty reference value.` };
      }
    }
    if (fact.valueType === "quantity") {
      const error = validateQuantityFactValue(fact.value, index);
      if (error) return { ok: false, reason: error };
    }
    const referenceValue = fact.valueType === "entity-reference" || fact.valueType === "observation-reference";
    if (referenceValue && typeof fact.value === "string") {
      const exists = entityIds.has(fact.value) || observationIds.has(fact.value);
      if (!exists) return { ok: false, reason: `referenceFacts[${index}] のvalue参照先が存在しません。` };
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
 * Resolve ReferenceFact valueType:"reference" values against a ReferenceGraph.
 * This is semantic validation for optional diagnostics. It must not block
 * project import because ReferenceGraph data can be missing or newer than the
 * exported project.
 *
 * @param {object} documentOrProject Export document or in-memory project.
 * @param {{metadata?: {referenceDataVersion?: string|null}, nodes?: Array<{id?: string, axis?: string|null}>}|null|undefined} referenceGraph
 * @returns {ReferenceDiagnostic[]}
 */
export function validateReferenceFactReferences(documentOrProject, referenceGraph) {
  const root = /** @type {Record<string, any>} */ (documentOrProject || {});
  const referenceFacts = Array.isArray(root.referenceFacts) ? root.referenceFacts : [];
  const graphNodes = Array.isArray(referenceGraph?.nodes) ? referenceGraph.nodes : [];
  const nodeById = new Map(
    graphNodes
      .filter((node) => isNonEmptyString(node.id))
      .map((node) => [/** @type {string} */ (node.id), node]),
  );

  /** @type {ReferenceDiagnostic[]} */
  const diagnostics = [];
  const projectVersion = root.referenceDataVersion;
  const graphVersion = referenceGraph?.metadata?.referenceDataVersion;
  if (
    isNonEmptyString(projectVersion) &&
    isNonEmptyString(graphVersion) &&
    projectVersion !== graphVersion
  ) {
    diagnostics.push({
      type: "reference-data-version-mismatch",
      expectedVersion: projectVersion,
      actualVersion: graphVersion,
    });
  }

  for (const fact of referenceFacts) {
    if (fact?.valueType !== "reference") continue;
    for (const value of stringValues(fact.value)) {
      const referenceNode = nodeById.get(value);
      if (!referenceNode) {
        diagnostics.push({
          type: "unresolved-reference",
          referenceFactId: isNonEmptyString(fact.id) ? fact.id : null,
          value,
          axis: isNonEmptyString(fact.axis) ? fact.axis : null,
        });
        continue;
      }
      if (
        isNonEmptyString(fact.axis) &&
        isNonEmptyString(referenceNode.axis) &&
        fact.axis !== referenceNode.axis
      ) {
        diagnostics.push({
          type: "axis-mismatch",
          referenceFactId: isNonEmptyString(fact.id) ? fact.id : null,
          value,
          axis: fact.axis,
          referenceAxis: referenceNode.axis,
        });
      }
    }
  }

  return diagnostics;
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
      schemaVersion: SCHEMA_VERSION,
      userId: doc.project?.userId || "user-local",
      activeVisitId: doc.project?.activeVisitId ?? doc.project?.visit?.id ?? null,
      visits: Array.isArray(doc.project?.visits)
        ? doc.project.visits.map((visit) => ({ ...visit }))
        : doc.project?.visit
          ? [{ ...doc.project.visit }]
          : [],
      updatedAt: Date.now(),
      photos,
      relations: doc.relations || [],
      entities: (doc.entities || []).map((entity) => ({ ...entity })),
      referenceFacts: (doc.referenceFacts || []).map((fact) => ({ ...fact })),
      demoKnowledgeVersion: doc.demoKnowledgeVersion ?? null,
      facts: (doc.legacyFacts || doc.facts || []).map((fact) => ({ ...fact })),
      quizResults: doc.quizResults || [],
      learningEvents: doc.learningEvents || [],
      userKnowledgeStates: doc.userKnowledgeStates || [],
      referenceDataVersion: doc.referenceDataVersion ?? null,
      sourceMetadata: doc.sourceMetadata || {},
    },
    missingPhotoIds,
  };
}

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function stringValues(value) {
  if (isNonEmptyString(value)) return [value.trim()];
  if (!Array.isArray(value)) return [];

  const values = [];
  for (const item of value) {
    if (!isNonEmptyString(item)) return [];
    values.push(item.trim());
  }
  return values;
}

/**
 * @param {unknown} value
 * @param {number} index
 * @returns {string|null}
 */
function validateQuantityFactValue(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return `referenceFacts[${index}] has an invalid quantity value.`;
  }
  const quantity = /** @type {Record<string, any>} */ (value);
  if (!isNonEmptyString(quantity.quantityKind)) {
    return `referenceFacts[${index}] has no quantityKind.`;
  }
  for (const key of ["valueSI", "minSI", "maxSI"]) {
    if (quantity[key] != null && !isFiniteNumber(quantity[key])) {
      return `referenceFacts[${index}] has an invalid ${key}.`;
    }
  }
  if (quantity.unitSI != null && !isNonEmptyString(quantity.unitSI)) {
    return `referenceFacts[${index}] has an invalid unitSI.`;
  }
  if (quantity.estimated != null && typeof quantity.estimated !== "boolean") {
    return `referenceFacts[${index}] has an invalid estimated flag.`;
  }
  return null;
}

/** @param {unknown} value */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
