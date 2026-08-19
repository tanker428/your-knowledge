import {
  sortVisualizationGraph,
  validateVisualizationGraph,
  VISUALIZATION_GRAPH_SCHEMA_VERSION,
} from "./visualization-graph.js";
import { measurementFromQuantityReferenceFact } from "./measurements.js";

export const REFERENCE_PREDICATE_EDGE_TYPES = Object.freeze({
  represents: "REPRESENTS",
  depicts: "DEPICTS",
  specimenOf: "SPECIMEN_OF",
  instanceOf: "INSTANCE_OF",
  classifiedAs: "CLASSIFIED_AS",
  livedDuring: "OCCURS_DURING",
  occursDuring: "OCCURS_DURING",
});

const DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z";

/**
 * @typedef {import('./visualization-graph.js').VisualizationGraphV1} VisualizationGraphV1
 * @typedef {import('./visualization-graph.js').VisualizationNode} VisualizationNode
 * @typedef {import('./visualization-graph.js').VisualizationEdge} VisualizationEdge
 * @typedef {import('./visualization-graph.js').VisualizationProvenance} VisualizationProvenance
 * @typedef {import('./visualization-graph.js').VisualizationMeasurement} VisualizationMeasurement
 */

/**
 * @typedef {object} ConceptResolverInput
 * @property {Array<Record<string, any>>} [visits]
 * @property {Array<Record<string, any>>} [observations]
 * @property {Array<Record<string, any>>} [entities]
 * @property {Array<Record<string, any>>} [referenceFacts]
 * @property {{nodes?: Array<Record<string, any>>}|null} [referenceGraph]
 * @property {{categoriesByPack?: Record<string, Array<Record<string, any>>>}|null} [registries]
 * @property {"allVisits"|"activeVisit"|"fixture"} [scope]
 * @property {string} [source]
 * @property {string} [createdAt]
 * @property {"global"|"visit"} [provisionalScope]
 */

/**
 * Build a display-only concept projection without changing Project JSON.
 *
 * This function intentionally accepts flattened data. Cross-visit filtering and
 * extraction from the live Project shape belong to the adapter in #112.
 *
 * @param {ConceptResolverInput} input
 * @returns {VisualizationGraphV1}
 */
export function buildConceptVisualizationGraph(input = {}) {
  const visits = sortById(input.visits || []);
  const observations = sortById((input.observations || []).filter(isIncludedObservation));
  const entities = sortById(input.entities || []);
  const referenceFacts = sortById(input.referenceFacts || []);
  const referenceNodes = sortById(input.referenceGraph?.nodes || []);
  const categoriesByPack = input.registries?.categoriesByPack || {};

  const referenceById = new Map(referenceNodes.map((node) => [node.id, node]));
  const observationById = new Map(observations.map((observation) => [observation.id, observation]));
  const entityById = new Map(entities.map((entity) => [entity.id, entity]));
  for (const observation of observations) {
    if (isNonEmptyString(observation.entityId) && !entityById.has(observation.entityId)) {
      entityById.set(observation.entityId, { id: observation.entityId });
    }
  }

  /** @type {Map<string, VisualizationNode>} */
  const nodes = new Map();
  /** @type {Map<string, VisualizationEdge>} */
  const edges = new Map();
  const sourceConceptTargets = new Set();
  /** @type {Map<string, Set<string>>} */
  const canonicalAxesByObservation = new Map();

  for (const visit of visits) addNode(nodes, visitNode(visit, observations));
  for (const observation of observations) addNode(nodes, observationNode(observation));
  for (const entity of sortById([...entityById.values()])) {
    addNode(nodes, entityNode(entity, observations));
  }

  for (const fact of referenceFacts) {
    if (!isReferenceValueFact(fact)) continue;
    const source = factSource(fact, observationById, entityById);
    if (!source) continue;

    for (const value of stringValues(fact.value)) {
      const referenceNode = referenceById.get(value);
      const targetNode = referenceNode
        ? nodeForReference(referenceNode, fact, source, referenceById)
        : unresolvedNodeForFact(fact, value, source);
      addNode(nodes, targetNode);
      addConceptEdge(edges, source.nodeId, targetNode.id, fact, referenceNode);
      sourceConceptTargets.add(source.nodeId);
      if (referenceNode?.axis) {
        for (const observationId of source.observationIds) {
          addAxis(canonicalAxesByObservation, observationId, referenceNode.axis);
        }
      }
    }
  }

  for (const fact of referenceFacts) {
    const measurement = measurementFromQuantityReferenceFact(fact);
    if (!measurement) continue;
    const node = nodeForMeasurementFact(fact, measurement, referenceById, observationById, entityById);
    if (node) addNode(nodes, node);
  }

  for (const observation of observations) {
    for (const entry of domainCategoryEntries(observation, categoriesByPack)) {
      if (canonicalAxesByObservation.get(observation.id)?.has(entry.axis)) continue;
      const node = domainFallbackNode(entry, observation);
      addNode(nodes, node);
      const sourceNodeId = observationNodeId(observation.id);
      addDerivedEdge(edges, sourceNodeId, node.id, "CLASSIFIED_AS", {
        sourceNote: `DomainCategory ${entry.packId}/${entry.categoryId}`,
      });
      sourceConceptTargets.add(sourceNodeId);
      if (isNonEmptyString(observation.entityId)) {
        sourceConceptTargets.add(entityNodeId(observation.entityId));
      }
    }
  }

  for (const entity of sortById([...entityById.values()])) {
    const sourceNodeId = entityNodeId(entity.id);
    if (sourceConceptTargets.has(sourceNodeId)) continue;
    const provisionalNodes = input.provisionalScope === "visit"
      ? provisionalEntityConceptNodesByVisit(entity, observations)
      : [provisionalEntityConceptNode(entity, observations)];
    for (const node of provisionalNodes) {
      addNode(nodes, node);
      addDerivedEdge(edges, sourceNodeId, node.id, "CLASSIFIED_AS", {
        sourceNote: `Provisional Entity concept ${entity.id}`,
      });
    }
    sourceConceptTargets.add(sourceNodeId);
  }

  for (const observation of observations) {
    const sourceNodeId = observationNodeId(observation.id);
    if (sourceConceptTargets.has(sourceNodeId)) continue;
    if (isNonEmptyString(observation.entityId)) continue;
    const node = provisionalObservationConceptNode(observation);
    addNode(nodes, node);
    addDerivedEdge(edges, sourceNodeId, node.id, "CLASSIFIED_AS", {
      sourceNote: `Provisional Observation concept ${observation.id}`,
    });
  }

  const graph = sortVisualizationGraph({
    schemaVersion: VISUALIZATION_GRAPH_SCHEMA_VERSION,
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    metadata: {
      schemaVersion: VISUALIZATION_GRAPH_SCHEMA_VERSION,
      scope: input.scope || "fixture",
      source: input.source || "concept-resolver",
      createdAt: input.createdAt || DEFAULT_CREATED_AT,
      mappingStats: {},
    },
  });
  graph.metadata.mappingStats = buildMappingStats(graph.nodes);

  const result = validateVisualizationGraph(graph);
  if (!result.ok) throw new Error(`VisualizationGraphV1 is invalid: ${result.errors.join("; ")}`);
  return graph;
}

/** @param {string} id */
export function conceptNodeIdForReference(id) {
  return `concept:${id}`;
}

/** @param {string} id */
export function landmarkNodeIdForReference(id) {
  return `landmark:${id}`;
}

/**
 * @param {Map<string, VisualizationNode>} nodes
 * @param {VisualizationNode} node
 */
function addNode(nodes, node) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, normalizeNodeArrays(node));
    return;
  }
  const measurements = mergeMeasurements(existing.measurements, node.measurements);
  const merged = {
    ...existing,
    sourceNodeIds: sortedUnique([...existing.sourceNodeIds, ...node.sourceNodeIds]),
    observationIds: sortedUnique([...existing.observationIds, ...node.observationIds]),
    entityIds: sortedUnique([...existing.entityIds, ...node.entityIds]),
    visitIds: sortedUnique([...existing.visitIds, ...node.visitIds]),
    domainIds: sortedUnique([...existing.domainIds, ...node.domainIds]),
    referenceIds: sortedUnique([...existing.referenceIds, ...node.referenceIds]),
  };
  if (measurements.length) merged.measurements = measurements;
  else delete merged.measurements;
  nodes.set(node.id, merged);
}

/**
 * @param {Map<string, VisualizationEdge>} edges
 * @param {string} sourceId
 * @param {string} targetId
 * @param {Record<string, any>} fact
 * @param {Record<string, any>|undefined} referenceNode
 */
function addConceptEdge(edges, sourceId, targetId, fact, referenceNode) {
  const type = edgeTypeForReferenceFact(fact, referenceNode);
  const edge = {
    id: stableId("edge", [type.toLowerCase(), sourceId, targetId, fact.id || fact.value]),
    sourceId,
    targetId,
    type,
    directed: true,
    derived: false,
    provenance: provenanceFromFact(fact),
    sourceReferenceFactId: isNonEmptyString(fact.id) ? fact.id : null,
  };
  edges.set(edge.id, edge);
}

/**
 * @param {Map<string, VisualizationEdge>} edges
 * @param {string} sourceId
 * @param {string} targetId
 * @param {string} type
 * @param {{sourceNote:string}} options
 */
function addDerivedEdge(edges, sourceId, targetId, type, options) {
  const edge = {
    id: stableId("edge", [type.toLowerCase(), sourceId, targetId, "derived"]),
    sourceId,
    targetId,
    type,
    directed: true,
    derived: true,
    provenance: suggestedProvenance(options.sourceNote),
    sourceReferenceFactId: null,
  };
  edges.set(edge.id, edge);
}

/**
 * @param {Record<string, any>} fact
 * @param {Record<string, any>|undefined} referenceNode
 */
function edgeTypeForReferenceFact(fact, referenceNode) {
  if (isNonEmptyString(fact.predicate) && REFERENCE_PREDICATE_EDGE_TYPES[fact.predicate]) {
    return REFERENCE_PREDICATE_EDGE_TYPES[fact.predicate];
  }
  if (referenceNode?.axis === "geological-time") return "OCCURS_DURING";
  return "CLASSIFIED_AS";
}

/**
 * @param {Record<string, any>} fact
 * @param {Map<string, Record<string, any>>} observationById
 * @param {Map<string, Record<string, any>>} entityById
 */
function factSource(fact, observationById, entityById) {
  if (isNonEmptyString(fact.subjectId) && entityById.has(fact.subjectId)) {
    const entity = entityById.get(fact.subjectId);
    const observationIds = observationsForEntity(entity.id, observationById);
    const resolvedObservationIds = sortedUnique([fact.observationId, fact.targetObservationId, ...observationIds]);
    return {
      nodeId: entityNodeId(fact.subjectId),
      entityId: fact.subjectId,
      observationIds: resolvedObservationIds,
      visitIds: visitIdsForObservations(resolvedObservationIds, observationById),
    };
  }
  if (isNonEmptyString(fact.subjectId) && observationById.has(fact.subjectId)) {
    return {
      nodeId: observationNodeId(fact.subjectId),
      entityId: null,
      observationIds: [fact.subjectId],
      visitIds: visitIdsForObservations([fact.subjectId], observationById),
    };
  }
  if (isNonEmptyString(fact.targetObservationId) && observationById.has(fact.targetObservationId)) {
    return {
      nodeId: observationNodeId(fact.targetObservationId),
      entityId: null,
      observationIds: [fact.targetObservationId],
      visitIds: visitIdsForObservations([fact.targetObservationId], observationById),
    };
  }
  if (isNonEmptyString(fact.observationId) && observationById.has(fact.observationId)) {
    return {
      nodeId: observationNodeId(fact.observationId),
      entityId: null,
      observationIds: [fact.observationId],
      visitIds: visitIdsForObservations([fact.observationId], observationById),
    };
  }
  return null;
}

/**
 * @param {string} entityId
 * @param {Map<string, Record<string, any>>} observationById
 */
function observationsForEntity(entityId, observationById) {
  return [...observationById.values()]
    .filter((observation) => observation.entityId === entityId)
    .map((observation) => observation.id)
    .filter(isNonEmptyString)
    .sort();
}

/**
 * @param {string[]} observationIds
 * @param {Map<string, Record<string, any>>} observationById
 */
function visitIdsForObservations(observationIds, observationById) {
  return sortedUnique(
    observationIds
      .map((id) => observationById.get(id)?.visitId)
      .filter(isNonEmptyString),
  );
}

/**
 * @param {Record<string, any>} referenceNode
 * @param {Record<string, any>} fact
 * @param {{nodeId:string, entityId:string|null, observationIds:string[], visitIds:string[]}} source
 * @param {Map<string, Record<string, any>>} referenceById
 * @returns {VisualizationNode}
 */
function nodeForReference(referenceNode, fact, source, referenceById) {
  if (referenceNode.axis === "geological-time") return landmarkNode(referenceNode, fact, source);
  if (referenceNode.axis === "taxonomy") return canonicalConceptNode(referenceNode, fact, source, referenceById);
  return unsupportedReferenceNode(referenceNode, fact, source);
}

/**
 * @param {Record<string, any>} referenceNode
 * @param {Record<string, any>} fact
 * @param {{nodeId:string, entityId:string|null, observationIds:string[], visitIds:string[]}} source
 * @param {Map<string, Record<string, any>>} referenceById
 * @returns {VisualizationNode}
 */
function canonicalConceptNode(referenceNode, fact, source, referenceById) {
  const lineage = taxonomyLineage(referenceNode, referenceById);
  return {
    id: conceptNodeIdForReference(referenceNode.id),
    label: referenceNode.label || referenceNode.scientificName || referenceNode.id,
    kind: "concept",
    semanticLayer: "conceptual",
    mappingStatus: "canonical",
    provenance: provenanceFromReferenceNode(referenceNode),
    sourceNodeIds: [`ReferenceNode:${referenceNode.id}`],
    observationIds: factObservationIds(source),
    entityIds: factEntityIds(source),
    visitIds: factVisitIds(fact, source),
    domainIds: [],
    referenceIds: [referenceNode.id],
    data: {
      referenceAxis: referenceNode.axis,
      rank: referenceNode.rank || null,
      parentIds: lineage.parentIds,
      ancestorIds: lineage.ancestorIds,
      taxonomyDepth: lineage.taxonomyDepth,
      taxonomyPath: lineage.taxonomyPath,
    },
  };
}

/**
 * Preserve a deterministic root-to-node taxonomy path in the display graph.
 * ReferenceFacts materialize only their target node, so a direct parent id is
 * insufficient when the parent itself is not referenced by another fact.
 *
 * @param {Record<string, any>} referenceNode
 * @param {Map<string, Record<string, any>>} referenceById
 */
function taxonomyLineage(referenceNode, referenceById) {
  const parentIds = referenceParentIds(referenceNode);
  const ancestorIds = collectTaxonomyAncestorIds(referenceNode, referenceById);
  const path = longestTaxonomyPath(referenceNode, referenceById, new Set());
  const taxonomyPath = path.map((node, depth) => ({
    id: node.id,
    label: node.label || node.scientificName || node.id,
    depth,
    parentId: depth > 0 ? path[depth - 1].id : null,
  }));
  return {
    parentIds,
    ancestorIds,
    taxonomyDepth: Math.max(0, taxonomyPath.length - 1),
    taxonomyPath,
  };
}

/** @param {Record<string, any>} node */
function referenceParentIds(node) {
  return sortedUnique([
    ...(Array.isArray(node?.parentIds) ? node.parentIds : []),
    node?.parentId,
  ]);
}

/**
 * @param {Record<string, any>} referenceNode
 * @param {Map<string, Record<string, any>>} referenceById
 */
function collectTaxonomyAncestorIds(referenceNode, referenceById) {
  const ancestors = new Set();
  const queue = referenceParentIds(referenceNode);
  while (queue.length) {
    const id = queue.shift();
    if (ancestors.has(id)) continue;
    ancestors.add(id);
    const parent = referenceById.get(id);
    if (parent?.axis === "taxonomy") queue.push(...referenceParentIds(parent));
  }
  ancestors.delete(referenceNode.id);
  return [...ancestors].sort();
}

/**
 * Choose the deepest available parent chain. Ties are resolved by stable id,
 * which keeps multi-parent taxonomies deterministic without using `rank`.
 * @param {Record<string, any>} referenceNode
 * @param {Map<string, Record<string, any>>} referenceById
 * @param {Set<string>} seen
 * @returns {Record<string, any>[]}
 */
function longestTaxonomyPath(referenceNode, referenceById, seen) {
  if (!referenceNode?.id || seen.has(referenceNode.id)) return [];
  const nextSeen = new Set(seen).add(referenceNode.id);
  const parentPaths = referenceParentIds(referenceNode)
    .map((id) => referenceById.get(id))
    .filter((node) => node?.axis === "taxonomy")
    .map((node) => longestTaxonomyPath(node, referenceById, nextSeen))
    .filter((path) => path.length)
    .sort((left, right) => right.length - left.length || taxonomyPathKey(left).localeCompare(taxonomyPathKey(right)));
  return [...(parentPaths[0] || []), referenceNode];
}

/** @param {Record<string, any>[]} path */
function taxonomyPathKey(path) {
  return path.map((node) => node.id).join("/");
}

/**
 * @param {Record<string, any>} referenceNode
 * @param {Record<string, any>} fact
 * @param {{nodeId:string, entityId:string|null, observationIds:string[], visitIds:string[]}} source
 * @returns {VisualizationNode}
 */
function landmarkNode(referenceNode, fact, source) {
  return {
    id: landmarkNodeIdForReference(referenceNode.id),
    label: referenceNode.label || referenceNode.id,
    kind: "landmark",
    semanticLayer: "conceptual",
    mappingStatus: "canonical",
    provenance: provenanceFromReferenceNode(referenceNode),
    sourceNodeIds: [`ReferenceNode:${referenceNode.id}`],
    observationIds: factObservationIds(source),
    entityIds: factEntityIds(source),
    visitIds: factVisitIds(fact, source),
    domainIds: [],
    referenceIds: [referenceNode.id],
    data: {
      referenceAxis: referenceNode.axis,
      startMa: referenceNode.startMa ?? null,
      endMa: referenceNode.endMa ?? null,
      timeRole: referenceNode.startMa != null || referenceNode.endMa != null ? "interval" : "landmark",
    },
  };
}

/**
 * @param {Record<string, any>} referenceNode
 * @param {Record<string, any>} fact
 * @param {{nodeId:string, entityId:string|null, observationIds:string[], visitIds:string[]}} source
 * @returns {VisualizationNode}
 */
function unsupportedReferenceNode(referenceNode, fact, source) {
  return {
    id: `concept:unresolved:${stablePart(referenceNode.id)}`,
    label: referenceNode.label || referenceNode.id,
    kind: "concept",
    semanticLayer: "conceptual",
    mappingStatus: "unresolved",
    provenance: provenanceFromReferenceNode(referenceNode),
    sourceNodeIds: [`ReferenceNode:${referenceNode.id}`],
    observationIds: factObservationIds(source),
    entityIds: factEntityIds(source),
    visitIds: factVisitIds(fact, source),
    domainIds: [],
    referenceIds: [referenceNode.id],
    data: {
      reason: "unsupported-reference-axis",
      referenceAxis: referenceNode.axis || null,
    },
  };
}

/**
 * @param {Record<string, any>} fact
 * @param {string} value
 * @param {{nodeId:string, entityId:string|null, observationIds:string[], visitIds:string[]}} source
 * @returns {VisualizationNode}
 */
function unresolvedNodeForFact(fact, value, source) {
  return {
    id: `concept:unresolved:${stablePart(value)}`,
    label: value,
    kind: "concept",
    semanticLayer: "conceptual",
    mappingStatus: "unresolved",
    provenance: provenanceFromFact(fact),
    sourceNodeIds: [isNonEmptyString(fact.id) ? `ReferenceFact:${fact.id}` : source.nodeId],
    observationIds: factObservationIds(source),
    entityIds: factEntityIds(source),
    visitIds: factVisitIds(fact, source),
    domainIds: [],
    referenceIds: [value],
    data: {
      reason: "unresolved-reference",
      unresolvedReferenceId: value,
      axis: fact.axis || null,
    },
  };
}

/**
 * @param {Record<string, any>} fact
 * @param {VisualizationMeasurement} measurement
 * @param {Map<string, Record<string, any>>} referenceById
 * @param {Map<string, Record<string, any>>} observationById
 * @param {Map<string, Record<string, any>>} entityById
 * @returns {VisualizationNode|null}
 */
function nodeForMeasurementFact(fact, measurement, referenceById, observationById, entityById) {
  if (isNonEmptyString(fact.subjectReferenceId)) {
    const referenceId = fact.subjectReferenceId.trim();
    const referenceNode = referenceById.get(referenceId);
    return referenceNode
      ? measuredReferenceNode(referenceNode, fact, measurement, referenceById)
      : unresolvedMeasurementReferenceNode(fact, referenceId, measurement);
  }

  const source = factSource(fact, observationById, entityById);
  if (!source) return null;
  if (isNonEmptyString(source.entityId)) {
    const entity = entityById.get(source.entityId) || { id: source.entityId };
    return addMeasurementTrace(
      {
        ...entityNode(entity, [...observationById.values()]),
        measurements: [measurement],
      },
      fact,
    );
  }
  const observationId = source.observationIds.find((id) => observationById.has(id));
  if (!observationId) return null;
  const observation = observationById.get(observationId);
  if (!observation) return null;
  return addMeasurementTrace(
    {
      ...observationNode(observation),
      measurements: [measurement],
    },
    fact,
  );
}

/**
 * @param {Record<string, any>} referenceNode
 * @param {Record<string, any>} fact
 * @param {VisualizationMeasurement} measurement
 * @param {Map<string, Record<string, any>>} referenceById
 * @returns {VisualizationNode}
 */
function measuredReferenceNode(referenceNode, fact, measurement, referenceById) {
  const source = {
    nodeId: isNonEmptyString(fact.id) ? `ReferenceFact:${fact.id}` : `ReferenceNode:${referenceNode.id}`,
    entityId: null,
    observationIds: [],
    visitIds: [],
  };
  return addMeasurementTrace(
    {
      ...nodeForReference(referenceNode, fact, source, referenceById),
      measurements: [measurement],
    },
    fact,
  );
}

/**
 * @param {Record<string, any>} fact
 * @param {string} referenceId
 * @param {VisualizationMeasurement} measurement
 * @returns {VisualizationNode}
 */
function unresolvedMeasurementReferenceNode(fact, referenceId, measurement) {
  return {
    id: `concept:unresolved:${stablePart(referenceId)}`,
    label: referenceId,
    kind: "concept",
    semanticLayer: "conceptual",
    mappingStatus: "unresolved",
    provenance: provenanceFromFact(fact),
    sourceNodeIds: [isNonEmptyString(fact.id) ? `ReferenceFact:${fact.id}` : `Reference:${referenceId}`],
    observationIds: [],
    entityIds: [],
    visitIds: isNonEmptyString(fact.visitId) ? [fact.visitId] : [],
    domainIds: [],
    referenceIds: [referenceId],
    measurements: [measurement],
    data: {
      reason: "unresolved-reference",
      unresolvedReferenceId: referenceId,
      axis: fact.axis || null,
    },
  };
}

/**
 * @param {VisualizationNode} node
 * @param {Record<string, any>} fact
 * @returns {VisualizationNode}
 */
function addMeasurementTrace(node, fact) {
  return {
    ...node,
    sourceNodeIds: sortedUnique([
      ...node.sourceNodeIds,
      isNonEmptyString(fact.id) ? `ReferenceFact:${fact.id}` : "",
    ]),
  };
}

/**
 * @param {{packId:string, categoryId:string, axis:string, term:Record<string, any>|null}} entry
 * @param {Record<string, any>} observation
 * @returns {VisualizationNode}
 */
function domainFallbackNode(entry, observation) {
  return {
    id: domainNodeId(entry.packId, entry.categoryId),
    label: entry.term?.label || entry.categoryId,
    kind: "cluster",
    semanticLayer: "conceptual",
    mappingStatus: "domain-fallback",
    provenance: suggestedProvenance(`DomainCategory ${entry.packId}/${entry.categoryId}`),
    sourceNodeIds: [`DomainCategory:${entry.packId}:${entry.categoryId}`],
    observationIds: [observation.id],
    entityIds: isNonEmptyString(observation.entityId) ? [observation.entityId] : [],
    visitIds: isNonEmptyString(observation.visitId) ? [observation.visitId] : [],
    domainIds: [entry.categoryId],
    referenceIds: [],
    data: {
      axis: entry.axis,
      packId: entry.packId,
      placeholderKind: "concept-placeholder",
    },
  };
}

/**
 * @param {Record<string, any>} entity
 * @param {Record<string, any>[]} observations
 * @returns {VisualizationNode}
 */
function provisionalEntityConceptNode(entity, observations) {
  const linkedObservations = observations.filter((observation) => observation.entityId === entity.id);
  return {
    id: `concept:provisional:entity:${stablePart(entity.id)}`,
    label: entity.name || entity.label || entity.id,
    kind: "concept",
    semanticLayer: "conceptual",
    mappingStatus: "provisional",
    provenance: suggestedProvenance(`Entity ${entity.id}`),
    sourceNodeIds: [`Entity:${entity.id}`],
    observationIds: sortedUnique(linkedObservations.map((observation) => observation.id).filter(isNonEmptyString)),
    entityIds: [entity.id],
    visitIds: sortedUnique(linkedObservations.map((observation) => observation.visitId).filter(isNonEmptyString)),
    domainIds: [],
    referenceIds: [],
  };
}

/**
 * @param {Record<string, any>} entity
 * @param {Record<string, any>[]} observations
 * @returns {VisualizationNode[]}
 */
function provisionalEntityConceptNodesByVisit(entity, observations) {
  const linkedObservations = observations.filter((observation) => observation.entityId === entity.id);
  const visitIds = sortedUnique(linkedObservations.map((observation) => observation.visitId));
  if (!visitIds.length) return [provisionalEntityConceptNode(entity, observations)];

  return visitIds.map((visitId) => {
    const visitObservations = linkedObservations.filter((observation) => observation.visitId === visitId);
    return {
      id: `concept:provisional:entity:${stablePart(entity.id)}:visit:${stablePart(visitId)}`,
      label: entity.name || entity.label || entity.id,
      kind: "concept",
      semanticLayer: "conceptual",
      mappingStatus: "provisional",
      provenance: suggestedProvenance(`Entity ${entity.id} in Visit ${visitId}`),
      sourceNodeIds: [`Entity:${entity.id}`],
      observationIds: sortedUnique(visitObservations.map((observation) => observation.id).filter(isNonEmptyString)),
      entityIds: [entity.id],
      visitIds: [visitId],
      domainIds: [],
      referenceIds: [],
    };
  });
}

/**
 * @param {Record<string, any>} observation
 * @returns {VisualizationNode}
 */
function provisionalObservationConceptNode(observation) {
  return {
    id: `concept:provisional:observation:${stablePart(observation.id)}`,
    label: observation.label || observation.id,
    kind: "concept",
    semanticLayer: "conceptual",
    mappingStatus: "provisional",
    provenance: suggestedProvenance(`Observation ${observation.id}`),
    sourceNodeIds: [`Observation:${observation.id}`],
    observationIds: [observation.id],
    entityIds: [],
    visitIds: isNonEmptyString(observation.visitId) ? [observation.visitId] : [],
    domainIds: [...(observation.domainCategories || [])].filter(isNonEmptyString).sort(),
    referenceIds: [],
    data: {
      observationType: observation.observationType || null,
    },
  };
}

/**
 * @param {Record<string, any>} visit
 * @param {Record<string, any>[]} observations
 * @returns {VisualizationNode}
 */
function visitNode(visit, observations) {
  const visitObservations = observations.filter((observation) => observation.visitId === visit.id);
  return {
    id: visitNodeId(visit.id),
    label: visit.title || visit.facilityName || visit.placeName || visit.id,
    kind: "experience",
    semanticLayer: "experience",
    mappingStatus: "canonical",
    provenance: provenanceFromRecord(visit),
    sourceNodeIds: [`Visit:${visit.id}`],
    observationIds: visitObservations.map((observation) => observation.id).sort(),
    entityIds: sortedUnique(visitObservations.map((observation) => observation.entityId).filter(isNonEmptyString)),
    visitIds: [visit.id],
    domainIds: [],
    referenceIds: [],
  };
}

/** @param {Record<string, any>} observation @returns {VisualizationNode} */
function observationNode(observation) {
  return {
    id: observationNodeId(observation.id),
    label: observation.label || observation.id,
    kind: "experience",
    semanticLayer: "experience",
    mappingStatus: "canonical",
    provenance: provenanceFromRecord(observation),
    sourceNodeIds: [`Observation:${observation.id}`],
    observationIds: [observation.id],
    entityIds: isNonEmptyString(observation.entityId) ? [observation.entityId] : [],
    visitIds: isNonEmptyString(observation.visitId) ? [observation.visitId] : [],
    domainIds: [...(observation.domainCategories || [])].filter(isNonEmptyString).sort(),
    referenceIds: [],
    data: {
      observationType: observation.observationType || null,
    },
  };
}

/**
 * @param {Record<string, any>} entity
 * @param {Record<string, any>[]} observations
 * @returns {VisualizationNode}
 */
function entityNode(entity, observations) {
  const linkedObservations = observations.filter((observation) => observation.entityId === entity.id);
  return {
    id: entityNodeId(entity.id),
    label: entity.name || entity.label || entity.id,
    kind: "entity",
    semanticLayer: "referent",
    mappingStatus: "canonical",
    provenance: provenanceFromRecord(entity),
    sourceNodeIds: [`Entity:${entity.id}`],
    observationIds: linkedObservations.map((observation) => observation.id).sort(),
    entityIds: [entity.id],
    visitIds: sortedUnique(linkedObservations.map((observation) => observation.visitId).filter(isNonEmptyString)),
    domainIds: [],
    referenceIds: [],
  };
}

/**
 * @param {Record<string, any>} observation
 * @param {Record<string, Array<Record<string, any>>>} categoriesByPack
 */
function domainCategoryEntries(observation, categoriesByPack) {
  const categoryIds = [...(observation.domainCategories || [])].filter(isNonEmptyString).sort();
  const packIds = [...(observation.domainPacks || [])].filter(isNonEmptyString).sort();
  return categoryIds.flatMap((categoryId) => {
    const preferred = packIds.flatMap((packId) => termEntriesForPack(packId, categoryId, categoriesByPack));
    if (preferred.length) return preferred;

    const discovered = Object.keys(categoriesByPack)
      .sort()
      .flatMap((packId) => termEntriesForPack(packId, categoryId, categoriesByPack));
    if (discovered.length) return discovered;

    return [{
      packId: packIds[0] || "unknown",
      categoryId,
      axis: "taxonomy",
      term: null,
    }];
  });
}

/**
 * @param {string} packId
 * @param {string} categoryId
 * @param {Record<string, Array<Record<string, any>>>} categoriesByPack
 */
function termEntriesForPack(packId, categoryId, categoriesByPack) {
  return (categoriesByPack[packId] || [])
    .filter((term) => term.id === categoryId)
    .map((term) => ({
      packId,
      categoryId,
      axis: term.axis || "taxonomy",
      term,
    }));
}

/** @param {Record<string, any>} fact */
function isReferenceValueFact(fact) {
  return fact?.valueType === "reference"
    || (fact?.valueType == null && isNonEmptyString(fact.axis) && stringValues(fact.value).length > 0);
}

/** @param {Record<string, any>} observation */
function isIncludedObservation(observation) {
  return observation?.included !== false && observation?.status !== "rejected";
}

/** @param {{observationIds:string[]}} source */
function factObservationIds(source) {
  return sortedUnique(source.observationIds || []);
}

/** @param {{entityId:string|null}} source */
function factEntityIds(source) {
  return isNonEmptyString(source.entityId) ? [source.entityId] : [];
}

/** @param {Record<string, any>} fact @param {{visitIds:string[]}} source */
function factVisitIds(fact, source) {
  return sortedUnique([fact.visitId, ...source.visitIds]);
}

/** @param {VisualizationNode[]} nodes */
function buildMappingStats(nodes) {
  return nodes.reduce(
    (stats, node) => {
      stats[node.mappingStatus] = (stats[node.mappingStatus] || 0) + 1;
      return stats;
    },
    /** @type {Record<string, number>} */ ({}),
  );
}

/** @param {Record<string, any>} record @returns {VisualizationProvenance} */
function provenanceFromRecord(record) {
  return {
    verificationStatus: record.status || null,
    createdByType: record.origin || record.createdByType || null,
    confidence: Number.isFinite(record.confidence) ? record.confidence : null,
    sourceType: record.sourceType || record.source || null,
    sourceNote: record.sourceNote || null,
  };
}

/** @param {Record<string, any>} fact @returns {VisualizationProvenance} */
function provenanceFromFact(fact) {
  return {
    verificationStatus: fact.status || null,
    createdByType: fact.origin || fact.createdByType || (fact.sourceType === "curated" ? "curator" : null),
    confidence: Number.isFinite(fact.confidence) ? fact.confidence : null,
    sourceType: fact.sourceType || null,
    sourceNote: fact.sourceNote || null,
  };
}

/** @param {Record<string, any>} node @returns {VisualizationProvenance} */
function provenanceFromReferenceNode(node) {
  return {
    verificationStatus: node.status || null,
    createdByType: node.sourceType === "curated" ? "curator" : null,
    confidence: null,
    sourceType: node.sourceType || null,
    sourceNote: node.sourceNote || null,
  };
}

/** @param {string} sourceNote @returns {VisualizationProvenance} */
function suggestedProvenance(sourceNote) {
  return {
    verificationStatus: "suggested",
    createdByType: "system",
    confidence: null,
    sourceType: "derived",
    sourceNote,
  };
}

/** @param {VisualizationNode} node */
function normalizeNodeArrays(node) {
  const measurements = sortMeasurements(node.measurements || []);
  const normalized = {
    ...node,
    sourceNodeIds: sortedUnique(node.sourceNodeIds || []),
    observationIds: sortedUnique(node.observationIds || []),
    entityIds: sortedUnique(node.entityIds || []),
    visitIds: sortedUnique(node.visitIds || []),
    domainIds: sortedUnique(node.domainIds || []),
    referenceIds: sortedUnique(node.referenceIds || []),
  };
  if (measurements.length) normalized.measurements = measurements;
  else delete normalized.measurements;
  return normalized;
}

/**
 * @param {VisualizationMeasurement[]|undefined} left
 * @param {VisualizationMeasurement[]|undefined} right
 * @returns {VisualizationMeasurement[]}
 */
function mergeMeasurements(left = [], right = []) {
  return sortMeasurements([...left, ...right]);
}

/** @param {VisualizationMeasurement[]} measurements */
function sortMeasurements(measurements) {
  const byKey = new Map();
  for (const measurement of measurements) {
    if (!measurement) continue;
    byKey.set(JSON.stringify(measurement), measurement);
  }
  return [...byKey.values()].sort((left, right) =>
    String(left.quantityKind).localeCompare(String(right.quantityKind))
    || String(left.unitSI || "").localeCompare(String(right.unitSI || ""))
    || String(left.source || "").localeCompare(String(right.source || ""))
    || numericCompare(left.valueSI, right.valueSI)
    || numericCompare(left.minSI, right.minSI)
    || numericCompare(left.maxSI, right.maxSI),
  );
}

/** @param {number|null|undefined} left @param {number|null|undefined} right */
function numericCompare(left, right) {
  return (left ?? Number.NEGATIVE_INFINITY) - (right ?? Number.NEGATIVE_INFINITY);
}

/**
 * @param {Map<string, Set<string>>} axesByObservation
 * @param {string} observationId
 * @param {string} axis
 */
function addAxis(axesByObservation, observationId, axis) {
  if (!isNonEmptyString(observationId) || !isNonEmptyString(axis)) return;
  const axes = axesByObservation.get(observationId) || new Set();
  axes.add(axis);
  axesByObservation.set(observationId, axes);
}

/** @param {string} id */
function visitNodeId(id) {
  return `experience:visit:${id}`;
}

/** @param {string} id */
function observationNodeId(id) {
  return `experience:observation:${id}`;
}

/** @param {string} id */
function entityNodeId(id) {
  return `entity:${id}`;
}

/** @param {string} packId @param {string} categoryId */
function domainNodeId(packId, categoryId) {
  return `domain:${packId}:${categoryId}`;
}

/** @param {unknown} value @returns {string[]} */
function stringValues(value) {
  if (isNonEmptyString(value)) return [value.trim()];
  if (!Array.isArray(value)) return [];
  const values = [];
  for (const item of value) {
    if (isNonEmptyString(item)) values.push(item.trim());
  }
  return sortedUnique(values);
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

/** @param {unknown[]} values */
function sortedUnique(values) {
  return [...new Set(values.filter(isNonEmptyString).map((value) => value.trim()))].sort();
}

/** @param {Array<Record<string, any>>} items */
function sortById(items) {
  return [...items].sort((left, right) => String(left.id || "").localeCompare(String(right.id || "")));
}

/** @param {string} prefix @param {unknown[]} parts */
function stableId(prefix, parts) {
  return `${prefix}:${parts.map(stablePart).join(":")}`;
}

/** @param {unknown} value */
function stablePart(value) {
  return encodeURIComponent(String(value));
}
