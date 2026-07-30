/** LearningFact is knowledge learned after the visit, not a photo impression. */

export const LEARNING_FACT_SOURCE_TYPES = Object.freeze([
  "panel",
  "learning",
  "external",
  "user",
]);

function newId() {
  return `fact-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function now() {
  return new Date().toISOString();
}

/**
 * Keep compatibility with demo/v1 records while exposing the Core 4 field name.
 * @param {any} fact
 * @returns {any}
 */
export function normalizeLearningFact(fact) {
  return {
    ...fact,
    targetObservationId: fact.targetObservationId ?? fact.targetId ?? null,
    sourceNote: fact.sourceNote ?? "",
    quizPrompt: fact.quizPrompt ?? "",
  };
}

/**
 * @param {object} input
 * @param {string} input.targetObservationId
 * @param {string} [input.id]
 * @param {string} input.label
 * @param {string} [input.detail]
 * @param {string} input.sourceType
 * @param {string} [input.sourceNote]
 * @param {string|null} [input.sourceObservationId]
 * @param {string} [input.quizPrompt]
 * @param {string} [input.createdAt]
 * @returns {any}
 */
export function createLearningFact(input) {
  const timestamp = now();
  return {
    id: input.id || newId(),
    targetObservationId: input.targetObservationId,
    label: (input.label || "").trim(),
    detail: (input.detail || "").trim(),
    sourceType: LEARNING_FACT_SOURCE_TYPES.includes(input.sourceType)
      ? input.sourceType
      : "user",
    sourceNote: (input.sourceNote || "").trim(),
    sourceObservationId: input.sourceObservationId || null,
    quizPrompt: (input.quizPrompt || "").trim(),
    status: "learned",
    createdAt: input.createdAt || timestamp,
    updatedAt: timestamp,
  };
}

/**
 * @param {any} fact
 * @param {Partial<any>} patch
 * @returns {any}
 */
export function updateLearningFact(fact, patch) {
  return {
    ...fact,
    ...(patch.targetObservationId !== undefined
      ? { targetObservationId: patch.targetObservationId }
      : {}),
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.detail !== undefined ? { detail: patch.detail.trim() } : {}),
    ...(patch.sourceType !== undefined
      ? { sourceType: LEARNING_FACT_SOURCE_TYPES.includes(patch.sourceType) ? patch.sourceType : fact.sourceType }
      : {}),
    ...(patch.sourceNote !== undefined ? { sourceNote: patch.sourceNote.trim() } : {}),
    ...(patch.sourceObservationId !== undefined
      ? { sourceObservationId: patch.sourceObservationId || null }
      : {}),
    ...(patch.quizPrompt !== undefined ? { quizPrompt: patch.quizPrompt.trim() } : {}),
    ...(patch.status !== undefined ? { status: patch.status } : {}),
    updatedAt: now(),
  };
}

/** @param {any[]} facts @param {string} id @returns {any[]} */
export function removeLearningFact(facts, id) {
  return (facts || []).filter((fact) => fact.id !== id);
}
