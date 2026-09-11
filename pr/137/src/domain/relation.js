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

export function endpointSelectionLabel(kind, selected) {
  if (selected) return "選び直す";
  return kind === "source" ? "関係元を選ぶ" : "関係先を選ぶ";
}

export function relationTypeDisplay(type) {
  const directed = type?.directed === true;
  const icon = directed ? "→" : "↔";
  const directionLabel = directed ? "方向あり" : "方向なし";
  return {
    icon,
    directionLabel,
    label: `${icon} ${type?.label || ""}`.trim(),
    optionLabel: `${icon} ${type?.label || ""}（${directionLabel}）`.trim(),
  };
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

/**
 * Apply the relation types selected in the editor without changing the stored
 * Relation shape. New types are saved independently, so one existing duplicate
 * cannot prevent the remaining types from being created.
 *
 * @param {{relations:any[], draft:any, relationTypes:any[], editingId?:string|null, createId?:(type:string,index:number)=>string}} input
 */
export function applyRelationTypeSelection(input) {
  const {
    relations = [],
    draft,
    relationTypes = [],
    editingId = null,
    createId,
  } = input;
  const types = [...new Set((draft?.types || []).filter(Boolean))];
  if (!types.length) {
    return { relations, savedRelations: [], skippedTypes: [], error: "関係種別を選択してください" };
  }
  if (editingId && types.length !== 1) {
    return { relations, savedRelations: [], skippedTypes: [], error: "編集中のRelationは関係種別を1つだけ選択してください" };
  }

  const candidates = types.map((type) => ({
    sourceId: draft?.sourceId || "",
    targetId: draft?.targetId || "",
    type,
  }));
  for (const candidate of candidates) {
    const error = validateRelationInput([], candidate, relationTypes);
    if (error) return { relations, savedRelations: [], skippedTypes: [], error };
  }

  if (editingId) {
    const candidate = candidates[0];
    const error = validateRelationInput(relations, candidate, relationTypes, editingId);
    if (error) return { relations, savedRelations: [], skippedTypes: [], error };
    const index = relations.findIndex((relation) => relation.id === editingId);
    if (index < 0) {
      return { relations, savedRelations: [], skippedTypes: [], error: "編集するRelationが見つかりません" };
    }
    const updated = updateRelation(relations[index], candidate);
    const next = [...relations];
    next[index] = updated;
    return { relations: next, savedRelations: [updated], skippedTypes: [], error: null };
  }

  const next = [...relations];
  const savedRelations = [];
  const skippedTypes = [];
  for (const [index, candidate] of candidates.entries()) {
    if (relationDuplicate(next, candidate, relationTypes)) {
      skippedTypes.push(candidate.type);
      continue;
    }
    if (typeof createId !== "function") {
      return { relations, savedRelations: [], skippedTypes: [], error: "Relation IDを作成できません" };
    }
    const relation = createRelation({ ...candidate, id: createId(candidate.type, index) });
    next.push(relation);
    savedRelations.push(relation);
  }
  return { relations: next, savedRelations, skippedTypes, error: null };
}

/**
 * Relations rendered for one photo in step 4, constrained to the active Visit.
 */
export function relationsForPhotoInVisit(relations, photos, activeVisitId, photoId) {
  const visitPhotos = (photos || []).filter((photo) => photo.visitId === activeVisitId);
  const photo = visitPhotos.find((item) => item.id === photoId);
  if (!photo) return [];
  const photoObservationIds = new Set((photo.observations || []).map((observation) => observation.id));
  const visitObservationIds = new Set(
    visitPhotos.flatMap((item) => (item.observations || []).map((observation) => observation.id)),
  );
  return (relations || []).filter((relation) =>
    visitObservationIds.has(relation.sourceId) &&
    visitObservationIds.has(relation.targetId) &&
    (photoObservationIds.has(relation.sourceId) || photoObservationIds.has(relation.targetId)),
  );
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
