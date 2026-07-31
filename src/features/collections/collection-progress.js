function isActiveObservation(item) {
  return item.observation.included !== false && item.observation.status !== "rejected";
}

function isClassified(observation) {
  const generic = observation.genericCategories || [];
  const domain = observation.domainCategories || [];
  if (!generic.length || !domain.length) return false;
  const assertions = observation.classificationAssertions || [];
  if (!assertions.length) return true;
  const ids = new Set([...generic, ...domain]);
  return [...ids].every((id) => assertions.some((assertion) => assertion.categoryId === id && assertion.status === "confirmed"));
}

function getLearnedFacts(project, visitId, observationIds, entityIds, userId) {
  const states = new Map((project.userKnowledgeStates || []).map((state) => [`${state.userId}\u0000${state.visitId}\u0000${state.referenceFactId}`, state]));
  return (project.referenceFacts || []).filter((fact) => {
    if (fact.status !== "verified" || (fact.visitId && fact.visitId !== visitId)) return false;
    const connected = observationIds.has(fact.targetObservationId || fact.observationId) || entityIds.has(fact.subjectId);
    const state = states.get(`${userId}\u0000${visitId}\u0000${fact.id}`);
    return connected && state?.masteryValue === 1;
  });
}

function makeCollection(id, title, kind, items, project, visitId, userId) {
  const observationIds = new Set(items.map((item) => item.observation.id));
  const entityIds = new Set(items.map((item) => item.observation.entityId).filter(Boolean));
  const relations = (project.relations || []).filter((relation) => relation.status === "confirmed" && observationIds.has(relation.sourceId) && observationIds.has(relation.targetId));
  const classified = items.filter((item) => isClassified(item.observation));
  const organized = items.filter((item) => item.observation.status === "confirmed");
  const learnedFacts = getLearnedFacts(project, visitId, observationIds, entityIds, userId);
  const counts = {
    discovery: items.length,
    organize: organized.length,
    classification: classified.length,
    relation: new Set(relations.flatMap((relation) => [relation.sourceId, relation.targetId])).size,
    learning: learnedFacts.length,
  };
  const stages = [
    { key: "discovery", label: "発見", count: counts.discovery, complete: counts.discovery > 0 },
    { key: "organize", label: "整理", count: counts.organize, complete: counts.discovery > 0 && counts.organize === counts.discovery },
    { key: "classification", label: "分類", count: counts.classification, complete: counts.discovery > 0 && counts.classification === counts.discovery },
    { key: "relation", label: "関係付け", count: counts.relation, complete: counts.relation > 0 },
    { key: "learning", label: "学習", count: counts.learning, complete: counts.learning > 0 },
  ];
  return {
    id, title, kind,
    photos: [...new Map(items.map((item) => [item.photo.id, item.photo])).values()],
    observationCount: items.length,
    counts, stages,
    completedStages: stages.filter((stage) => stage.complete).length,
    percent: Math.round((stages.filter((stage) => stage.complete).length / stages.length) * 100),
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
  const genericIds = [...new Set(items.flatMap((item) => item.observation.genericCategories || []))].sort();
  const domainIds = [...new Set(items.flatMap((item) => item.observation.domainCategories || []))].sort();
  for (const id of genericIds) collections.push(makeCollection(`generic:${id}`, genericLabels.get(id) || id, "generic", items.filter((item) => (item.observation.genericCategories || []).includes(id)), project, visitId, userId));
  for (const id of domainIds) collections.push(makeCollection(`domain:${id}`, domainLabels.get(id) || id, "domain", items.filter((item) => (item.observation.domainCategories || []).includes(id)), project, visitId, userId));
  return collections;
}

