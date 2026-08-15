export const VISUALIZATION_GRAPH_SCHEMA_VERSION = "1.0.0";

export const VISUALIZATION_NODE_KINDS = Object.freeze([
  "experience",
  "entity",
  "concept",
  "landmark",
  "cluster",
]);

export const VISUALIZATION_SEMANTIC_LAYERS = Object.freeze([
  "experience",
  "referent",
  "conceptual",
]);

export const VISUALIZATION_MAPPING_STATUSES = Object.freeze([
  "canonical",
  "domain-fallback",
  "provisional",
  "unresolved",
]);

/**
 * @typedef {"experience"|"entity"|"concept"|"landmark"|"cluster"} VisualizationNodeKind
 * @typedef {"experience"|"referent"|"conceptual"} VisualizationSemanticLayer
 * @typedef {"canonical"|"domain-fallback"|"provisional"|"unresolved"} VisualizationMappingStatus
 * @typedef {"allVisits"|"activeVisit"|"fixture"} VisualizationScope
 */

/**
 * Normalized, display-time provenance. It mirrors existing project fields
 * without introducing a saved Assertion model.
 *
 * @typedef {object} VisualizationProvenance
 * @property {string|null} verificationStatus
 * @property {string|null} createdByType
 * @property {number|null} confidence
 * @property {string|null} sourceType
 * @property {string|null} sourceNote
 */

/**
 * @typedef {object} VisualizationMeasurement
 * @property {string} quantityKind
 * @property {number|null} valueSI
 * @property {number|null} minSI
 * @property {number|null} maxSI
 * @property {string|null} unitSI
 * @property {boolean} estimated
 * @property {number|null} confidence
 * @property {string|null} source
 */

/**
 * A node in the display-only 3D projection.
 *
 * Source arrays are retained so aggregated nodes can be traced back to the
 * project and ReferenceGraph data that produced them.
 *
 * @typedef {object} VisualizationNode
 * @property {string} id
 * @property {string} label
 * @property {VisualizationNodeKind} kind
 * @property {VisualizationSemanticLayer} semanticLayer
 * @property {VisualizationMappingStatus} mappingStatus
 * @property {VisualizationProvenance} provenance
 * @property {string[]} sourceNodeIds
 * @property {string[]} observationIds
 * @property {string[]} entityIds
 * @property {string[]} visitIds
 * @property {string[]} domainIds
 * @property {string[]} referenceIds
 * @property {VisualizationMeasurement[]} [measurements]
 * @property {Record<string, any>} [data]
 */

/**
 * @typedef {object} VisualizationEdge
 * @property {string} id
 * @property {string} sourceId
 * @property {string} targetId
 * @property {string} type
 * @property {boolean} directed
 * @property {boolean} derived
 * @property {VisualizationProvenance} provenance
 * @property {string|null} sourceReferenceFactId
 * @property {Record<string, any>} [data]
 */

/**
 * @typedef {object} VisualizationGraphMetadata
 * @property {string} schemaVersion
 * @property {VisualizationScope} scope
 * @property {string} source
 * @property {string} createdAt
 * @property {Record<string, number>} mappingStats
 */

/**
 * @typedef {object} VisualizationGraphV1
 * @property {string} schemaVersion
 * @property {VisualizationNode[]} nodes
 * @property {VisualizationEdge[]} edges
 * @property {VisualizationGraphMetadata} metadata
 */

/**
 * @typedef {object} VisualizationGraphValidationResult
 * @property {boolean} ok
 * @property {string[]} errors
 */

/**
 * @param {VisualizationGraphV1} graph
 * @returns {VisualizationGraphValidationResult}
 */
export function validateVisualizationGraph(graph) {
  const errors = [];
  if (!graph || typeof graph !== "object") {
    return { ok: false, errors: ["graph must be an object"] };
  }
  if (graph.schemaVersion !== VISUALIZATION_GRAPH_SCHEMA_VERSION) {
    errors.push("unsupported schemaVersion");
  }
  if (graph.metadata?.schemaVersion !== VISUALIZATION_GRAPH_SCHEMA_VERSION) {
    errors.push("metadata schemaVersion mismatch");
  }
  if (!Array.isArray(graph.nodes)) errors.push("nodes must be an array");
  if (!Array.isArray(graph.edges)) errors.push("edges must be an array");
  if (errors.length) return { ok: false, errors };

  validateSortedUniqueItems(graph.nodes, "node", errors);
  validateSortedUniqueItems(graph.edges, "edge", errors);
  validateNodes(graph.nodes, errors);
  validateEdges(graph.nodes, graph.edges, errors);
  validateJsonSerializable(graph, errors);

  return { ok: errors.length === 0, errors };
}

/**
 * @param {VisualizationGraphV1} graph
 * @returns {VisualizationGraphV1}
 */
export function sortVisualizationGraph(graph) {
  return {
    ...graph,
    nodes: [...graph.nodes].sort(compareById),
    edges: [...graph.edges].sort(compareById),
  };
}

/**
 * @param {VisualizationNode[]|VisualizationEdge[]} items
 * @param {string} label
 * @param {string[]} errors
 */
function validateSortedUniqueItems(items, label, errors) {
  const ids = new Set();
  for (const [index, item] of items.entries()) {
    if (!isNonEmptyString(item?.id)) {
      errors.push(`${label}[${index}] is missing id`);
      continue;
    }
    if (ids.has(item.id)) errors.push(`duplicate ${label} id: ${item.id}`);
    ids.add(item.id);
    if (index > 0 && compareById(items[index - 1], item) > 0) {
      errors.push(`${label}s must be sorted by id`);
    }
  }
}

/**
 * @param {VisualizationNode[]} nodes
 * @param {string[]} errors
 */
function validateNodes(nodes, errors) {
  for (const node of nodes) {
    if (!isNonEmptyString(node.label)) errors.push(`node label is required: ${node.id}`);
    if (!VISUALIZATION_NODE_KINDS.includes(node.kind)) errors.push(`invalid node kind: ${node.id}`);
    if (!VISUALIZATION_SEMANTIC_LAYERS.includes(node.semanticLayer)) errors.push(`invalid semanticLayer: ${node.id}`);
    if (!VISUALIZATION_MAPPING_STATUSES.includes(node.mappingStatus)) errors.push(`invalid mappingStatus: ${node.id}`);
    if (!node.provenance || typeof node.provenance !== "object") errors.push(`node provenance is required: ${node.id}`);
    for (const key of ["sourceNodeIds", "observationIds", "entityIds", "visitIds", "domainIds", "referenceIds"]) {
      if (!Array.isArray(node[key])) errors.push(`node ${key} must be an array: ${node.id}`);
    }
    if (!hasTraceSource(node)) errors.push(`node has no source trace: ${node.id}`);
    if (node.measurements != null && !Array.isArray(node.measurements)) {
      errors.push(`node measurements must be an array: ${node.id}`);
    }
    if (Array.isArray(node.measurements)) validateMeasurements(node, errors);
  }
}

/**
 * @param {VisualizationNode} node
 * @param {string[]} errors
 */
function validateMeasurements(node, errors) {
  for (const [index, measurement] of node.measurements.entries()) {
    const label = `${node.id}.measurements[${index}]`;
    if (!isNonEmptyString(measurement?.quantityKind)) errors.push(`measurement quantityKind is required: ${label}`);
    for (const key of ["valueSI", "minSI", "maxSI", "confidence"]) {
      if (measurement[key] !== null && measurement[key] !== undefined && !isFiniteNumber(measurement[key])) {
        errors.push(`measurement ${key} must be null or finite number: ${label}`);
      }
    }
    if (measurement.unitSI !== null && measurement.unitSI !== undefined && !isNonEmptyString(measurement.unitSI)) {
      errors.push(`measurement unitSI must be null or string: ${label}`);
    }
    if (typeof measurement.estimated !== "boolean") {
      errors.push(`measurement estimated must be boolean: ${label}`);
    }
    if (measurement.source !== null && measurement.source !== undefined && typeof measurement.source !== "string") {
      errors.push(`measurement source must be null or string: ${label}`);
    }
  }
}

/**
 * @param {VisualizationNode[]} nodes
 * @param {VisualizationEdge[]} edges
 * @param {string[]} errors
 */
function validateEdges(nodes, edges, errors) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const edge of edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      errors.push(`dangling edge: ${edge.id}`);
    }
    if (typeof edge.type !== "string" || edge.type.length === 0) {
      errors.push(`edge type is required: ${edge.id}`);
    }
    if (typeof edge.directed !== "boolean") errors.push(`edge directed must be boolean: ${edge.id}`);
    if (typeof edge.derived !== "boolean") errors.push(`edge derived must be boolean: ${edge.id}`);
    if (!edge.provenance || typeof edge.provenance !== "object") errors.push(`edge provenance is required: ${edge.id}`);
    if (edge.sourceReferenceFactId !== null && edge.sourceReferenceFactId !== undefined && !isNonEmptyString(edge.sourceReferenceFactId)) {
      errors.push(`edge sourceReferenceFactId must be null or string: ${edge.id}`);
    }
  }
}

/** @param {unknown} value @param {string[]} errors */
function validateJsonSerializable(value, errors) {
  try {
    JSON.parse(JSON.stringify(value));
  } catch {
    errors.push("graph must be JSON serializable");
  }
}

/** @param {VisualizationNode} node */
function hasTraceSource(node) {
  return [
    node.sourceNodeIds,
    node.observationIds,
    node.entityIds,
    node.visitIds,
    node.domainIds,
    node.referenceIds,
  ].some((values) => Array.isArray(values) && values.length > 0);
}

/** @param {{id:string}} left @param {{id:string}} right */
function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

/** @param {unknown} value @returns {value is string} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/** @param {unknown} value */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}
