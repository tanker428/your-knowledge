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
      (photo.observations || []).map((observation) => ({ observation, photo })),
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
        .filter((observation) => observation.id !== sourceId)
        .map((observation) => ({ observation, photo })),
    )
    .sort(
      (left, right) =>
        Number(left.photo.order || 0) - Number(right.photo.order || 0) ||
        left.observation.id.localeCompare(right.observation.id),
    );
}
