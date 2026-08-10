function isActiveObservation(item) {
  return item.observation.included !== false && item.observation.status !== "rejected";
}

function isClassified(observation) {
  const generic = (observation.genericCategories || []).filter((id) => id !== "unknown");
  const domain = observation.domainCategories || [];
  if (!generic.length || !domain.length) return false;
  const assertions = observation.classificationAssertions || [];
  if (!assertions.length) return true;
  const ids = new Set([...generic, ...domain]);
  return [...ids].every((id) => assertions.some((assertion) => assertion.categoryId === id && assertion.status === "confirmed"));
}

function getLearnedObservationIds(project, visitId, items, userId) {
  const states = new Map((project.userKnowledgeStates || []).map((state) => [`${state.userId}\u0000${state.visitId}\u0000${state.referenceFactId}`, state]));
  const learnedFacts = (project.referenceFacts || []).filter((fact) => {
    if (fact.status !== "verified" || (fact.visitId && fact.visitId !== visitId)) return false;
    const state = states.get(`${userId}\u0000${visitId}\u0000${fact.id}`);
    return state?.masteryValue === 1;
  });
  return new Set(items.filter(({ observation }) => learnedFacts.some((fact) =>
    fact.targetObservationId === observation.id ||
    fact.observationId === observation.id ||
    fact.subjectId === observation.entityId,
  )).map(({ observation }) => observation.id));
}

function makeCollection(id, title, kind, items, project, visitId, userId) {
  const observationIds = new Set(items.map((item) => item.observation.id));
  const relations = (project.relations || []).filter((relation) => relation.status === "confirmed" && (observationIds.has(relation.sourceId) || observationIds.has(relation.targetId)));
  const classified = items.filter((item) => isClassified(item.observation));
  const organized = items.filter((item) => item.observation.status === "confirmed");
  const learnedObservationIds = getLearnedObservationIds(project, visitId, items, userId);
  const relatedObservationIds = new Set(relations.flatMap((relation) => [relation.sourceId, relation.targetId]));
  const counts = {
    discovery: items.length,
    organize: organized.length,
    classification: classified.length,
    relation: items.filter(({ observation }) => relatedObservationIds.has(observation.id)).length,
    learning: items.filter(({ observation }) => learnedObservationIds.has(observation.id)).length,
  };
  const denominator = items.length;
  const stages = [
    { key: "discovery", label: "発見", count: counts.discovery, denominator, complete: counts.discovery === denominator },
    { key: "organize", label: "整理", count: counts.organize, denominator, complete: counts.organize === denominator },
    { key: "classification", label: "分類", count: counts.classification, denominator, complete: counts.classification === denominator },
    { key: "relation", label: "関係付け", count: counts.relation, denominator, complete: counts.relation === denominator },
    { key: "learning", label: "学習", count: counts.learning, denominator, complete: counts.learning === denominator },
  ];
  return {
    id, title, kind,
    photos: [...new Map(items.map((item) => [item.photo.id, item.photo])).values()],
    observationCount: items.length,
    counts, stages,
    completedStages: stages.filter((stage) => stage.complete).length,
    percent: denominator ? Math.round((Object.values(counts).reduce((sum, count) => sum + count, 0) / (denominator * stages.length)) * 100) : 0,
  };
}

/** Build deterministic Visit/generic/domain collections from the active Visit. */
export function buildCollectionProgress(project, visitId, userId = project?.userId || "user-local", registry = {}) {
  const visit = (project?.visits || []).find((item) => item.id === visitId);
  if (!visit) return [];
  const items = (project.photos || []).filter((photo) => photo.visitId === visitId).flatMap((photo) => (photo.observations || []).map((observation) => ({ observation, photo })).filter(isActiveObservation));
  if (!items.length) return [];
  const collections = [makeCollection(`visit:${visitId}`, visit.title || "この訪問", "visit", items, project, visitId, userId)];
  const genericLabels = new Map((registry.genericCategories || []).map((item) => [item.id, item.label]));
  const domainLabels = new Map();
  for (const values of Object.values(registry.categoriesByPack || {})) for (const item of values || []) domainLabels.set(item.id, item.label);
  const genericIds = [...new Set(items.flatMap((item) => item.observation.genericCategories || []).filter((id) => id !== "unknown"))].sort();
  const domainIds = [...new Set(items.flatMap((item) => item.observation.domainCategories || []))].sort();
  for (const id of genericIds) collections.push(makeCollection(`generic:${id}`, genericLabels.get(id) || id, "generic", items.filter((item) => (item.observation.genericCategories || []).includes(id)), project, visitId, userId));
  for (const id of domainIds) collections.push(makeCollection(`domain:${id}`, domainLabels.get(id) || id, "domain", items.filter((item) => (item.observation.domainCategories || []).includes(id)), project, visitId, userId));
  return collections;
}

/**
 * Collection covers use transient in-memory photo URLs, while the rest of the
 * project can remain the persistence-safe document returned by `toProject`.
 */
export function buildCollectionProgressForView(project, photos, visitId, userId = project?.userId || "user-local", registry = {}) {
  return buildCollectionProgress({ ...project, photos }, visitId, userId, registry);
}
