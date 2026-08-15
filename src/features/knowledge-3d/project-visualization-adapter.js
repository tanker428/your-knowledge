import { buildConceptVisualizationGraph } from "./concept-resolver.js";

/**
 * Build a 3D-only VisualizationGraphV1 from the existing Project shape.
 * This does not replace buildVisitKnowledgeGraph(), does not mutate Project,
 * and does not persist Concept nodes.
 *
 * @param {Record<string, any>} project
 * @param {{nodes?: Array<Record<string, any>>}|null} referenceGraph
 * @param {Record<string, any>} [registries]
 * @param {{scope?: "allVisits"|"activeVisit", createdAt?: string}} [options]
 */
export function buildProjectVisualizationGraph(
  project,
  referenceGraph,
  registries = {},
  options = {},
) {
  const scope = options.scope || "allVisits";
  const visits = selectVisits(project, scope);
  const visitIds = new Set(visits.map((visit) => visit.id));
  const observations = flattenObservations(project, visitIds);
  const observationIds = new Set(observations.map((observation) => observation.id));
  const entityIdsFromObservations = new Set(
    observations.map((observation) => observation.entityId).filter(isNonEmptyString),
  );
  const referenceFacts = selectReferenceFacts(project.referenceFacts || [], observationIds, entityIdsFromObservations, visitIds);
  const entityIds = new Set(entityIdsFromObservations);
  for (const fact of referenceFacts) {
    if (isNonEmptyString(fact.subjectId) && !observationIds.has(fact.subjectId)) {
      entityIds.add(fact.subjectId);
    }
  }
  const entities = selectEntities(project.entities || [], entityIds);

  return buildConceptVisualizationGraph({
    visits,
    observations,
    entities,
    referenceFacts,
    referenceGraph,
    registries,
    scope,
    source: "project-visualization-adapter",
    createdAt: options.createdAt,
    provisionalScope: scope === "allVisits" ? "visit" : "global",
  });
}

/**
 * @param {Record<string, any>} project
 * @param {"allVisits"|"activeVisit"} scope
 */
function selectVisits(project, scope) {
  const visits = Array.isArray(project?.visits) ? project.visits : [];
  if (scope === "activeVisit") {
    return visits.filter((visit) => visit.id === project.activeVisitId).sort(compareId);
  }
  return [...visits].sort(compareId);
}

/**
 * @param {Record<string, any>} project
 * @param {Set<string>} visitIds
 */
function flattenObservations(project, visitIds) {
  return (project?.photos || [])
    .filter((photo) => visitIds.has(photo.visitId))
    .flatMap((photo) =>
      (photo.observations || []).map((observation) => ({
        ...observation,
        photoId: observation.photoId || photo.id,
        visitId: observation.visitId || photo.visitId,
      })),
    )
    .filter((observation) => observation.included !== false && observation.status !== "rejected")
    .sort(compareId);
}

/**
 * @param {Record<string, any>[]} facts
 * @param {Set<string>} observationIds
 * @param {Set<string>} entityIds
 * @param {Set<string>} visitIds
 */
function selectReferenceFacts(facts, observationIds, entityIds, visitIds) {
  const scoped = facts
    .filter((fact) => {
      if (isNonEmptyString(fact.visitId) && !visitIds.has(fact.visitId)) return false;
      if (isNonEmptyString(fact.subjectId) && observationIds.has(fact.subjectId)) return true;
      if (isNonEmptyString(fact.subjectId) && entityIds.has(fact.subjectId)) return true;
      if (isNonEmptyString(fact.observationId) && observationIds.has(fact.observationId)) return true;
      if (isNonEmptyString(fact.targetObservationId) && observationIds.has(fact.targetObservationId)) return true;
      return false;
    });
  const scopedReferenceIds = new Set(scoped.flatMap(referenceFactValues));
  const scopedIds = new Set(scoped.map((fact) => fact.id).filter(isNonEmptyString));
  for (const fact of facts) {
    if (scopedIds.has(fact.id)) continue;
    if (isNonEmptyString(fact.visitId) && !visitIds.has(fact.visitId)) continue;
    if (fact.valueType !== "quantity") continue;
    if (!isNonEmptyString(fact.subjectReferenceId)) continue;
    if (!scopedReferenceIds.has(fact.subjectReferenceId.trim()) && !isGeneratedDemoQuantityFact(fact)) continue;
    scoped.push(fact);
    if (isNonEmptyString(fact.id)) scopedIds.add(fact.id);
  }
  return scoped.sort(compareId);
}

/**
 * @param {Record<string, any>[]} entities
 * @param {Set<string>} entityIds
 */
function selectEntities(entities, entityIds) {
  const selected = entities.filter((entity) => entityIds.has(entity.id));
  const known = new Set(selected.map((entity) => entity.id));
  for (const id of entityIds) {
    if (!known.has(id)) selected.push({ id });
  }
  return selected.sort(compareId);
}

/** @param {{id?: string}} left @param {{id?: string}} right */
function compareId(left, right) {
  return String(left.id || "").localeCompare(String(right.id || ""));
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {Record<string, any>} fact */
function referenceFactValues(fact) {
  if (fact?.valueType !== "reference" && !(fact?.valueType == null && isNonEmptyString(fact.axis))) return [];
  if (isNonEmptyString(fact.value)) return [fact.value.trim()];
  if (!Array.isArray(fact.value)) return [];
  return fact.value.filter(isNonEmptyString).map((value) => value.trim());
}

/** @param {Record<string, any>} fact */
function isGeneratedDemoQuantityFact(fact) {
  return fact.valueType === "quantity"
    && isNonEmptyString(fact.sourceNote)
    && fact.sourceNote.toLowerCase().includes("generated demo data");
}
