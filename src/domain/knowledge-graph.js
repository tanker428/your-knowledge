/**
 * Deterministic, visit-scoped knowledge graph projection.
 *
 * This module deliberately does not persist a second copy of the project. A
 * graph is generated from the current Project whenever a selector needs it.
 */

export const KNOWLEDGE_GRAPH_SCHEMA_VERSION = "1.0.0";

const NODE_TYPES = Object.freeze({
  USER: "User",
  VISIT: "Visit",
  PHOTO: "Photo",
  OBSERVATION: "Observation",
  CLASSIFICATION_ASSERTION: "ClassificationAssertion",
  GENERIC_CATEGORY: "GenericCategory",
  DOMAIN_CATEGORY: "DomainCategory",
  LEARNING_ROLE: "LearningRole",
  ENTITY: "Entity",
  REFERENCE_FACT: "ReferenceFact",
  QUESTION_SEED: "QuestionSeed",
});

/** @typedef {Record<string, any>} GraphNode */
/** @typedef {Record<string, any>} GraphEdge */
/** @typedef {{schemaVersion:string,visitId:string,nodes:GraphNode[],edges:GraphEdge[],metadata:Record<string,any>}} KnowledgeGraph */

/**
 * Build a stable graph-node identifier. Prefixing avoids collisions between
 * user-controlled IDs from different entity types.
 * @param {string} type
 * @param {string} id
 */
export function graphNodeId(type, id) {
  return `${type}:${id}`;
}

/** @param {string} prefix @param {string[]} parts */
function stableId(prefix, parts) {
  return `${prefix}:${parts.map((part) => encodeURIComponent(String(part))).join(":")}`;
}

/** @param {any} value */
function clone(value) {
  return value == null ? value : structuredClone(value);
}

/** @param {any} project @param {string} visitId @param {any} registries */
export function buildVisitKnowledgeGraph(project, visitId, registries = {}) {
  const visit = (project?.visits || []).find((item) => item.id === visitId);
  if (!visit) throw new Error(`Visit ${visitId} が見つかりません`);

  const photos = (project.photos || []).filter((photo) => photo.visitId === visitId);
  const observations = photos.flatMap((photo) =>
    (photo.observations || [])
      .filter((observation) => observation.included !== false && observation.status !== "rejected")
      .map((observation) => ({ observation, photo })),
  );
  const observationIds = new Set(observations.map(({ observation }) => observation.id));
  const activeEntityIds = new Set(observations.map(({ observation }) => observation.entityId).filter(Boolean));
  const nodes = [];
  const edges = [];
  const addNode = (node) => nodes.push(node);
  const addEdge = (edge) => edges.push(edge);

  const userId = visit.userId || project.userId || "default";
  addNode({ id: graphNodeId(NODE_TYPES.USER, userId), type: NODE_TYPES.USER, userId, name: project.userName || null });
  addNode({
    id: graphNodeId(NODE_TYPES.VISIT, visit.id), type: NODE_TYPES.VISIT,
    visitId: visit.id, title: visit.title, facilityName: visit.facilityName || visit.placeName || "",
    visitedAt: visit.visitedAt || null, domainPackIds: clone(visit.domainPackIds || []), source: visit.source || "user",
  });
  addEdge({ id: stableId("edge:HAS_VISIT", [userId, visit.id]), type: "HAS_VISIT", sourceId: graphNodeId(NODE_TYPES.USER, userId), targetId: graphNodeId(NODE_TYPES.VISIT, visit.id) });

  for (const photo of photos) {
    const photoNodeId = graphNodeId(NODE_TYPES.PHOTO, photo.id);
    addNode({ id: photoNodeId, type: NODE_TYPES.PHOTO, photoId: photo.id, visitId, title: photo.title || photo.file || "", order: photo.order ?? null, capturedAt: photo.capturedAt ?? null });
    addEdge({ id: stableId("edge:HAS_PHOTO", [visit.id, photo.id]), type: "HAS_PHOTO", sourceId: graphNodeId(NODE_TYPES.VISIT, visit.id), targetId: photoNodeId });
  }

  const genericTerms = new Map((registries.genericCategories || []).map((term) => [term.id, term]));
  const domainTerms = new Map();
  for (const categories of Object.values(registries.categoriesByPack || {})) {
    for (const term of categories || []) domainTerms.set(term.id, term);
  }
  const roleTerms = new Map((registries.learningRoles || []).map((term) => [term.id, term]));
  const entityMap = new Map((project.entities || registries.entities || []).map((entity) => [entity.id, entity]));

  for (const { observation, photo } of observations) {
    const observationNodeId = graphNodeId(NODE_TYPES.OBSERVATION, observation.id);
    addNode({ id: observationNodeId, type: NODE_TYPES.OBSERVATION, observationId: observation.id, photoId: photo.id, visitId, label: observation.label, observationType: observation.observationType, region: clone(observation.region ?? null), origin: observation.origin || "ai", status: observation.status, included: observation.included !== false, entityId: observation.entityId ?? null });
    addEdge({ id: stableId("edge:HAS_OBSERVATION", [photo.id, observation.id]), type: "HAS_OBSERVATION", sourceId: graphNodeId(NODE_TYPES.PHOTO, photo.id), targetId: observationNodeId });

    for (const categoryType of ["genericCategories", "domainCategories"]) {
      const categoryIds = observation[categoryType] || [];
      for (const categoryId of categoryIds) {
        const isGeneric = categoryType === "genericCategories";
        const term = (isGeneric ? genericTerms : domainTerms).get(categoryId) || {};
        const categoryNodeType = isGeneric ? NODE_TYPES.GENERIC_CATEGORY : NODE_TYPES.DOMAIN_CATEGORY;
        const categoryNodeId = graphNodeId(categoryNodeType, categoryId);
        if (!nodes.some((node) => node.id === categoryNodeId)) {
          addNode({ id: categoryNodeId, type: categoryNodeType, categoryId, label: term.label || categoryId, axis: isGeneric ? "classification" : (term.axis || "classification"), kind: term.kind || (isGeneric ? "generic" : "domain"), status: term.status || "confirmed" });
        }
        const assertionType = isGeneric ? "generic" : "domain";
        const assertionId = stableId("assertion", [observation.id, assertionType, categoryId]);
        const assertion = (observation.classificationAssertions || []).find((item) => item.categoryId === categoryId && item.categoryType === assertionType);
        addNode({ id: assertionId, type: NODE_TYPES.CLASSIFICATION_ASSERTION, assertionId, observationId: observation.id, categoryType: assertionType, categoryId, status: assertion?.status || "confirmed" });
        addEdge({ id: stableId("edge:HAS_CLASSIFICATION", [observation.id, assertionId]), type: "HAS_CLASSIFICATION", sourceId: observationNodeId, targetId: assertionId });
        addEdge({ id: stableId("edge:CLASSIFIES_AS", [assertionId, categoryNodeId]), type: "CLASSIFIES_AS", sourceId: assertionId, targetId: categoryNodeId });
      }
    }

    for (const roleId of observation.learningRoles || []) {
      const role = roleTerms.get(roleId) || {};
      const roleNodeId = graphNodeId(NODE_TYPES.LEARNING_ROLE, roleId);
      if (!nodes.some((node) => node.id === roleNodeId)) addNode({ id: roleNodeId, type: NODE_TYPES.LEARNING_ROLE, roleId, label: role.label || roleId });
      addEdge({ id: stableId("edge:HAS_ROLE", [observation.id, roleId]), type: "HAS_ROLE", sourceId: observationNodeId, targetId: roleNodeId });
    }

    if (observation.entityId) {
      const entity = entityMap.get(observation.entityId) || { id: observation.entityId };
      const entityNodeId = graphNodeId(NODE_TYPES.ENTITY, entity.id);
      if (!nodes.some((node) => node.id === entityNodeId)) addNode({ id: entityNodeId, type: NODE_TYPES.ENTITY, entityId: entity.id, name: entity.name || null, entityType: entity.entityType || entity.type || null, status: entity.status || null, externalIds: clone(entity.externalIds || {}) });
      addEdge({ id: stableId("edge:REFERS_TO", [observation.id, entity.id]), type: "REFERS_TO", sourceId: observationNodeId, targetId: entityNodeId });
    }
  }

  for (const relation of project.relations || []) {
    if (!observationIds.has(relation.sourceId) || !observationIds.has(relation.targetId)) continue;
    addEdge({ id: stableId("edge:RELATES_TO", [relation.id]), type: "RELATES_TO", sourceId: graphNodeId(NODE_TYPES.OBSERVATION, relation.sourceId), targetId: graphNodeId(NODE_TYPES.OBSERVATION, relation.targetId), relationId: relation.id, relationType: relation.type, directed: relation.directed ?? null, status: relation.status, origin: relation.origin || "ai", confidence: relation.confidence ?? null });
  }

  const referenceFacts = (project.referenceFacts || []).filter((fact) => {
    if (fact.visitId && fact.visitId !== visitId) return false;
    return observationIds.has(fact.targetObservationId) || observationIds.has(fact.observationId) || activeEntityIds.has(fact.subjectId);
  });
  for (const fact of referenceFacts) {
    const factNodeId = graphNodeId(NODE_TYPES.REFERENCE_FACT, fact.id);
    addNode({ id: factNodeId, type: NODE_TYPES.REFERENCE_FACT, referenceFactId: fact.id, subjectId: fact.subjectId || null, predicate: fact.predicate, value: clone(fact.value), valueType: fact.valueType, axis: fact.axis || null, sourceType: fact.sourceType, sourceNote: fact.sourceNote || "", status: fact.status });
    const targetId = fact.targetObservationId || fact.observationId;
    const subjectNodeId = targetId && observationIds.has(targetId) ? graphNodeId(NODE_TYPES.OBSERVATION, targetId) : fact.subjectId && nodes.some((node) => node.id === graphNodeId(NODE_TYPES.ENTITY, fact.subjectId)) ? graphNodeId(NODE_TYPES.ENTITY, fact.subjectId) : null;
    if (subjectNodeId) addEdge({ id: stableId("edge:HAS_REFERENCE_FACT", [subjectNodeId, fact.id]), type: "HAS_REFERENCE_FACT", sourceId: subjectNodeId, targetId: factNodeId });
  }

  const graph = { schemaVersion: KNOWLEDGE_GRAPH_SCHEMA_VERSION, visitId, nodes: sortById(nodes), edges: sortById(edges), metadata: { scope: "activeVisit", referenceGraphNotDuplicated: true, includesUiState: false } };
  const seeds = buildQuestionSeeds(graph);
  for (const seed of seeds) {
    const seedNodeId = graphNodeId(NODE_TYPES.QUESTION_SEED, seed.id);
    graph.nodes.push({ ...seed, id: seedNodeId, type: NODE_TYPES.QUESTION_SEED });
    for (const sourceId of seed.sourceIds) graph.edges.push({ id: stableId("edge:REFERENCES", [seed.id, sourceId]), type: "REFERENCES", sourceId: seedNodeId, targetId: sourceId });
    if (seed.targetId) graph.edges.push({ id: stableId("edge:TARGETS", [seed.id, seed.targetId]), type: "TARGETS", sourceId: seedNodeId, targetId: seed.targetId });
  }
  graph.nodes.sort(compareId);
  graph.edges.sort(compareId);
  validateKnowledgeGraph(graph);
  return graph;
}

/** @param {KnowledgeGraph} graph */
export function validateKnowledgeGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object") errors.push("graph must be an object");
  if (graph?.schemaVersion !== KNOWLEDGE_GRAPH_SCHEMA_VERSION) errors.push("unsupported schemaVersion");
  if (!graph?.visitId) errors.push("visitId is required");
  const nodeIds = new Set();
  for (const node of graph?.nodes || []) {
    if (!node.id || nodeIds.has(node.id)) errors.push(`duplicate node id: ${node.id}`);
    nodeIds.add(node.id);
    if (["KnowledgeFact", "LearningFact", "LearningGap"].includes(node.type)) errors.push(`forbidden node type: ${node.type}`);
    if (node.visitId && node.visitId !== graph.visitId) errors.push(`visitId mismatch: ${node.id}`);
  }
  const edgeIds = new Set();
  for (const edge of graph?.edges || []) {
    if (!edge.id || edgeIds.has(edge.id)) errors.push(`duplicate edge id: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) errors.push(`dangling edge: ${edge.id}`);
    if (edge.visitId && edge.visitId !== graph.visitId) errors.push(`visitId mismatch: ${edge.id}`);
  }
  if (errors.length) throw new Error(`KnowledgeGraph is invalid: ${errors.join("; ")}`);
  return { ok: true, errors: [] };
}

/** @param {KnowledgeGraph} graph @param {string} nodeId */
export function getGraphNodeById(graph, nodeId) { return graph.nodes.find((node) => node.id === nodeId) || null; }
/** @param {KnowledgeGraph} graph @param {string} type */
export function getGraphNodesByType(graph, type) { return graph.nodes.filter((node) => node.type === type); }
/** @param {KnowledgeGraph} graph @param {string} nodeId */
export function getOutgoingEdges(graph, nodeId) { return graph.edges.filter((edge) => edge.sourceId === nodeId); }
/** @param {KnowledgeGraph} graph @param {string} nodeId */
export function getIncomingEdges(graph, nodeId) { return graph.edges.filter((edge) => edge.targetId === nodeId); }
/** @param {KnowledgeGraph} graph @param {string} nodeId */
export function getNeighbors(graph, nodeId) {
  const ids = new Set([...getOutgoingEdges(graph, nodeId).map((edge) => edge.targetId), ...getIncomingEdges(graph, nodeId).map((edge) => edge.sourceId)]);
  return [...ids].sort().map((id) => getGraphNodeById(graph, id)).filter(Boolean);
}
/** @param {KnowledgeGraph} graph @param {string} nodeId */
export function getOneHopGraph(graph, nodeId) {
  const ids = new Set([nodeId, ...getNeighbors(graph, nodeId).map((node) => node.id)]);
  return { ...graph, nodes: graph.nodes.filter((node) => ids.has(node.id)), edges: graph.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)), metadata: { ...graph.metadata, scope: "oneHop" } };
}
/** @param {any} project @param {any} registries */
export function getGraphForActiveVisit(project, registries = {}) {
  if (!project?.activeVisitId) return null;
  return buildVisitKnowledgeGraph(project, project.activeVisitId, registries);
}

/** @param {KnowledgeGraph} graph */
export function buildQuestionSeeds(graph) {
  const seeds = [];
  for (const assertion of getGraphNodesByType(graph, NODE_TYPES.CLASSIFICATION_ASSERTION).filter((node) => node.status === "confirmed")) {
    const category = graph.edges.find((edge) => edge.type === "CLASSIFIES_AS" && edge.sourceId === assertion.id)?.targetId;
    if (category) seeds.push({ id: stableId("seed:classification", [assertion.observationId, assertion.categoryType, assertion.categoryId]), sourceType: "classification", sourceIds: [assertion.id], targetType: "category", targetId: category, questionType: "single-choice" });
  }
  for (const relation of graph.edges.filter((edge) => edge.type === "RELATES_TO" && relationStatus(edge) === "confirmed")) {
    seeds.push({ id: stableId("seed:relation", [relation.relationId]), sourceType: "relation", sourceIds: [relation.sourceId, relation.targetId], targetType: "observation", targetId: relation.targetId, questionType: "matching" });
  }
  for (const fact of getGraphNodesByType(graph, NODE_TYPES.REFERENCE_FACT).filter((node) => node.status === "verified")) {
    seeds.push({ id: stableId("seed:reference-fact", [fact.referenceFactId]), sourceType: "reference-fact", sourceIds: [fact.id], targetType: "reference-fact", targetId: fact.id, questionType: "fill" });
  }
  return seeds.sort(compareId);
}

function compareId(left, right) { return left.id.localeCompare(right.id); }
function sortById(items) { return [...items].sort(compareId); }

/** @param {GraphEdge} edge */
function relationStatus(edge) { return edge.status || ""; }

export { NODE_TYPES };
