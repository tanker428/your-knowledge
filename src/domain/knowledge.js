/** Pure helpers for the minimal, active-visit Knowledge View. */

/**
 * @param {any[]} photos
 * @param {string|null} visitId
 * @param {boolean} [includedOnly]
 * @returns {any[]}
 */
export function observationEntriesForVisit(photos, visitId, includedOnly = true) {
  if (!visitId) return [];
  return (photos || [])
    .filter((photo) => photo.visitId === visitId)
    .flatMap((photo) =>
      (photo.observations || [])
        .filter((observation) => !includedOnly || observation.included !== false)
        .map((observation) => ({ observation, photo })),
    );
}

/**
 * Return only confirmed Relation records directly connected to the center.
 * @param {any[]} relations
 * @param {any[]} photos
 * @param {string|null} visitId
 * @param {string} observationId
 * @returns {any[]}
 */
export function oneHopRelations(relations, photos, visitId, observationId) {
  const ids = new Set(
    observationEntriesForVisit(photos, visitId, false).map(
      ({ observation }) => observation.id,
    ),
  );
  return (relations || []).filter(
    (relation) =>
      relation.status === "confirmed" &&
      ids.has(relation.sourceId) &&
      ids.has(relation.targetId) &&
      (relation.sourceId === observationId || relation.targetId === observationId),
  );
}

/** @param {any[]} facts @param {string} observationId @returns {any[]} */
export function learningFactsForObservation(facts, observationId) {
  return (facts || []).filter(
    (fact) => (fact.targetObservationId ?? fact.targetId) === observationId,
  );
}

/** @param {string|null} currentId @param {string} relatedId @returns {string} */
export function focusRelatedObservation(currentId, relatedId) {
  return relatedId || currentId;
}
