/**
 * Relation helpers shared by the organizer and tests.
 * Relation records intentionally remain visitId-free; visit membership is
 * derived from the Photos that own their source and target Observations.
 */

export const RELATION_SCOPES = Object.freeze({
  PHOTO: "photo",
  NEARBY: "nearby",
  VISIT: "visit",
});

export function isSelectableObservation(observation) {
  return observation?.included !== false && observation?.status !== "rejected";
}

export function relationReviewActions(relation) {
  if (relation?.origin === "user") return [];
  if (relation?.status === "suggested") return ["confirm", "reject"];
  if (relation?.status === "confirmed") return ["reject"];
  if (relation?.status === "rejected") return ["confirm"];
  return [];
}

export function isApprovableRelation(relation) {
  return relation?.origin !== "user" && relation?.status === "suggested";
}

export function swapRelationEndpoints(draft) {
  return { ...draft, sourceId: draft.targetId, targetId: draft.sourceId };
}

/** @param {string} fallback */
export function scopeForRelationEndpoints(photos, sourceId, targetId, fallback = RELATION_SCOPES.PHOTO) {
  const entries = (photos || []).flatMap((photo) =>
    (photo.observations || []).map((observation) => ({ observation, photo })),
  );
  const source = entries.find((entry) => entry.observation.id === sourceId);
  const target = entries.find((entry) => entry.observation.id === targetId);
  if (!source || !target) return fallback;
  if (source.photo.id === target.photo.id) return RELATION_SCOPES.PHOTO;
  return Math.abs(Number(source.photo.order || 0) - Number(target.photo.order || 0)) <= 2
    ? RELATION_SCOPES.NEARBY
    : RELATION_SCOPES.VISIT;
}

export function endpointPresentation(entry) {
  const region = entry?.observation?.region ?? null;
  return { region, wholePhoto: region === null };
}

export function searchRelationEntries(entries, query) {
  const normalized = String(query || "").trim().toLocaleLowerCase();
  if (!normalized) return entries || [];
  return (entries || []).filter(({ observation, photo }) =>
    `${photo.title} ${observation.label}`.toLocaleLowerCase().includes(normalized),
  );
}

export function relationTypeInfo(relationTypes, type) {
  return (relationTypes || []).find((item) => item.id === type) || null;
}

export function isDirectedRelation(relationTypes, type) {
  return relationTypeInfo(relationTypes, type)?.directed === true;
}

export function relationKey(relation, relationTypes) {
  const ids = isDirectedRelation(relationTypes, relation.type)
    ? [relation.sourceId, relation.targetId]
    : [relation.sourceId, relation.targetId].sort();
  return `${ids[0]}|${ids[1]}|${relation.type}`;
}

export function relationDuplicate(
  relations,
  candidate,
  relationTypes,
  editingId = null,
) {
  const key = relationKey(candidate, relationTypes);
  return (relations || []).some(
    (relation) =>
      relation.id !== editingId && relationKey(relation, relationTypes) === key,
  );
}

export function validateRelationInput(
  relations,
  candidate,
  relationTypes,
  editingId = null,
) {
  if (!candidate.sourceId || !candidate.targetId)
    return "関係元と関係先を選択してください";
  if (candidate.sourceId === candidate.targetId)
    return "同じObservation同士は結べません";
  if (!relationTypeInfo(relationTypes, candidate.type))
    return "関係種別を選択してください";
  if (relationDuplicate(relations, candidate, relationTypes, editingId))
    return "同じ関係はすでに保存されています";
  return null;
}

export function createRelation(input) {
  return {
    id: input.id,
    sourceId: input.sourceId,
    targetId: input.targetId,
    type: input.type,
    status: "confirmed",
    confidence: 1,
    origin: "user",
  };
}

export function updateRelation(relation, patch) {
  return {
    ...relation,
    ...(patch.sourceId !== undefined ? { sourceId: patch.sourceId } : {}),
    ...(patch.targetId !== undefined ? { targetId: patch.targetId } : {}),
    ...(patch.type !== undefined ? { type: patch.type } : {}),
  };
}

export function removeRelation(relations, relationId) {
  return (relations || []).filter((relation) => relation.id !== relationId);
}

/**
 * @param {{photos: any[], activeVisitId: string, sourceId: string, scope?: string, nearbyDistance?: number}} input
 */
export function relationCandidates(input) {
  const {
    photos,
    activeVisitId,
    sourceId,
    scope = RELATION_SCOPES.PHOTO,
    nearbyDistance = 2,
  } = input;
  const visitPhotos = (photos || []).filter(
    (photo) => photo.visitId === activeVisitId,
  );
  const source = visitPhotos
    .flatMap((photo) =>
      (photo.observations || [])
        .filter(isSelectableObservation)
        .map((observation) => ({ observation, photo })),
    )
    .find(({ observation }) => observation.id === sourceId);
  if (!source) return [];

  const eligiblePhotos = visitPhotos.filter((photo) => {
    if (scope === RELATION_SCOPES.PHOTO)
      return photo.id === source.photo.id;
    if (scope === RELATION_SCOPES.NEARBY)
      return Math.abs(Number(photo.order || 0) - Number(source.photo.order || 0)) <= nearbyDistance;
    return true;
  });

  return eligiblePhotos
    .flatMap((photo) =>
      (photo.observations || [])
        .filter(
          (observation) =>
            observation.id !== sourceId && isSelectableObservation(observation),
        )
        .map((observation) => ({ observation, photo })),
    )
    .sort(
      (left, right) =>
        Number(left.photo.order || 0) - Number(right.photo.order || 0) ||
        left.observation.id.localeCompare(right.observation.id),
    );
}
