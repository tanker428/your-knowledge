import { resolveMeasurementForLogScale } from "./measurements.js";

export const VISUALIZATION_LAYOUT_SCHEMA_VERSION = "1.0.0";

export const SEMANTIC_LAYER_Y = Object.freeze({
  experience: 0,
  referent: 1,
  conceptual: 2,
});

export const DEFAULT_SIZE_QUANTITY_KIND = "body_length";
export const SIZE_LAYOUT_SCALE = 6;
export const SIZE_LAYOUT_DEFAULT_UNSET_X = 10;

const HOME_RADIUS_BY_LAYER = Object.freeze({
  experience: 3.5,
  referent: 5,
  conceptual: 6.5,
});

/**
 * @typedef {import('./visualization-graph.js').VisualizationGraphV1} VisualizationGraphV1
 * @typedef {import('./visualization-graph.js').VisualizationNode} VisualizationNode
 * @typedef {import('./visualization-graph.js').VisualizationEdge} VisualizationEdge
 * @typedef {"home"|"relation"|"size"} LayoutMode
 */

/**
 * @typedef {object} LayoutNode
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} z
 * @property {string} zone
 * @property {string} semanticLayer
 * @property {string} mappingStatus
 * @property {number} radius
 * @property {number|null} representativeValue
 * @property {{minSI:number, maxSI:number}|null} rangeSI
 */

/**
 * @typedef {object} LayoutEdge
 * @property {string} id
 * @property {string} sourceId
 * @property {string} targetId
 * @property {string} type
 * @property {boolean} directed
 * @property {boolean} derived
 * @property {string} style
 * @property {number} opacity
 * @property {number} width
 */

/**
 * @typedef {object} VisualizationLayout
 * @property {string} schemaVersion
 * @property {LayoutMode} mode
 * @property {LayoutNode[]} nodes
 * @property {LayoutEdge[]} edges
 * @property {{sourceGraphSchemaVersion:string, quantityKind:string|null, unsetAreaX:number}} metadata
 */

/**
 * @param {VisualizationGraphV1} graph
 * @param {{mode?: LayoutMode, quantityKind?: string, sizeScale?: number, unsetAreaX?: number}} [options]
 * @returns {VisualizationLayout}
 */
export function layoutVisualizationGraph(graph, options = {}) {
  const mode = options.mode || "home";
  if (mode === "size") return sizeLayout(graph, options);
  if (mode === "relation") return relationLayout(graph);
  return homeLayout(graph);
}

/**
 * Return exactly the graph nodes represented by the selected layout. Keeping
 * this projection in the layout layer prevents the UI count and selection
 * state from drifting away from what the renderer can actually display.
 * @param {VisualizationGraphV1} graph
 * @param {{mode?: LayoutMode}} [options]
 */
export function visualizationNodesForLayout(graph, options = {}) {
  const ids = new Set(layoutVisualizationGraph(graph, options).nodes.map((node) => node.id));
  return graph.nodes.filter((node) => ids.has(node.id));
}

/** @param {VisualizationGraphV1} graph @returns {VisualizationLayout} */
export function homeLayout(graph) {
  const nodes = [];
  const nodesByLayer = groupNodesByLayer(graph.nodes);
  for (const [layer, layerNodes] of Object.entries(nodesByLayer)) {
    const radius = HOME_RADIUS_BY_LAYER[layer] ?? 5;
    layerNodes.forEach((node, index) => {
      const angle = angleForIndex(index, layerNodes.length);
      nodes.push(layoutNode(node, {
        x: round(Math.cos(angle) * radius),
        y: semanticY(node),
        z: round(Math.sin(angle) * radius),
        zone: "layer",
      }));
    });
  }
  return buildLayout("home", graph, nodes, null);
}

/** @param {VisualizationGraphV1} graph @returns {VisualizationLayout} */
export function relationLayout(graph) {
  const degreeByNode = buildDegreeMap(graph);
  const nodes = graph.nodes.map((node) => {
    const degree = degreeByNode.get(node.id) || 0;
    const radius = Math.max(2.25, 7 - degree * 0.55);
    const angle = stableAngle(node.id);
    return layoutNode(node, {
      x: round(Math.cos(angle) * radius),
      y: semanticY(node),
      z: round(Math.sin(angle) * radius),
      zone: degree > 0 ? "connected" : "isolated",
    });
  });
  return buildLayout("relation", graph, nodes, null);
}

/**
 * @param {VisualizationGraphV1} graph
 * @param {{quantityKind?: string, sizeScale?: number, unsetAreaX?: number}} [options]
 * @returns {VisualizationLayout}
 */
export function sizeLayout(graph, options = {}) {
  const quantityKind = options.quantityKind || DEFAULT_SIZE_QUANTITY_KIND;
  const scale = options.sizeScale ?? SIZE_LAYOUT_SCALE;
  const sizeNodes = graph.nodes.filter(isSizeComparableNode);
  const resolvedNodes = sizeNodes.map((node) => ({
    node,
    resolved: resolveMeasurement(node, quantityKind),
  }));
  const scaledXs = resolvedNodes
    .filter((entry) => entry.resolved)
    .map((entry) => Math.log10(entry.resolved.representativeValue) * scale);
  const unsetAreaX = options.unsetAreaX
    ?? round(Math.max(SIZE_LAYOUT_DEFAULT_UNSET_X, ...scaledXs.map((x) => x + 3)));

  let unsetIndex = 0;
  const nodes = resolvedNodes.map(({ node, resolved }) => {
    if (!resolved) {
      const next = unsetIndex;
      unsetIndex += 1;
      return layoutNode(node, {
        // Semantic depth already has its own Y axis. Adding it again to X
        // pushed conceptual unset nodes off-screen and made the zone appear
        // empty even though the nodes existed.
        x: unsetAreaX,
        y: semanticY(node),
        z: round((next % 12) - 5.5 + Math.floor(next / 12) * 1.25),
        zone: "unset",
      });
    }

    return layoutNode(node, {
      x: round(Math.log10(resolved.representativeValue) * scale),
      y: semanticY(node),
      z: round(stableJitter(node.id) * 2),
      zone: "scaled",
      representativeValue: resolved.representativeValue,
      rangeSI: resolved.rangeSI,
    });
  });

  return buildLayout("size", graph, nodes, quantityKind, unsetAreaX);
}

/**
 * @param {LayoutMode} mode
 * @param {VisualizationGraphV1} graph
 * @param {LayoutNode[]} nodes
 * @param {string|null} quantityKind
 * @param {number} [unsetAreaX]
 * @returns {VisualizationLayout}
 */
function buildLayout(mode, graph, nodes, quantityKind, unsetAreaX = 14) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return {
    schemaVersion: VISUALIZATION_LAYOUT_SCHEMA_VERSION,
    mode,
    nodes: nodes.sort(compareById),
    edges: graph.edges
      .filter((edge) => nodeIds.has(edge.sourceId) && nodeIds.has(edge.targetId))
      .map(layoutEdge)
      .sort(compareById),
    metadata: {
      sourceGraphSchemaVersion: graph.schemaVersion,
      quantityKind,
      unsetAreaX,
    },
  };
}

/**
 * @param {VisualizationNode} node
 * @param {{x:number, y:number, z:number, zone:string, representativeValue?:number|null, rangeSI?:{minSI:number, maxSI:number}|null}} position
 * @returns {LayoutNode}
 */
function layoutNode(node, position) {
  return {
    id: node.id,
    x: position.x,
    y: position.y,
    z: position.z,
    zone: position.zone,
    semanticLayer: node.semanticLayer,
    mappingStatus: node.mappingStatus,
    radius: nodeRadius(node),
    representativeValue: position.representativeValue ?? null,
    rangeSI: position.rangeSI ?? null,
  };
}

/** @param {VisualizationEdge} edge @returns {LayoutEdge} */
function layoutEdge(edge) {
  const suggested = edge.derived || edge.provenance?.verificationStatus === "suggested";
  const verified = edge.provenance?.verificationStatus === "verified";
  return {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
    type: edge.type,
    directed: edge.directed,
    derived: edge.derived,
    style: suggested ? "dashed" : "solid",
    opacity: suggested ? 0.35 : 0.85,
    width: verified ? 1.5 : 1,
  };
}

/** @param {VisualizationNode[]} nodes */
function groupNodesByLayer(nodes) {
  return nodes.reduce(
    (groups, node) => {
      (groups[node.semanticLayer] ||= []).push(node);
      groups[node.semanticLayer].sort(compareById);
      return groups;
    },
    /** @type {Record<string, VisualizationNode[]>} */ ({
      experience: [],
      referent: [],
      conceptual: [],
    }),
  );
}

/** @param {VisualizationGraphV1} graph */
function buildDegreeMap(graph) {
  const degreeByNode = new Map();
  for (const edge of graph.edges) {
    const weight = edge.derived ? 0.5 : 1;
    degreeByNode.set(edge.sourceId, (degreeByNode.get(edge.sourceId) || 0) + weight);
    degreeByNode.set(edge.targetId, (degreeByNode.get(edge.targetId) || 0) + weight);
  }
  return degreeByNode;
}

/**
 * @param {VisualizationNode} node
 * @param {string} quantityKind
 * @returns {{representativeValue:number, rangeSI:{minSI:number, maxSI:number}|null}|null}
 */
function resolveMeasurement(node, quantityKind) {
  const measurement = (node.measurements || []).find((item) => item.quantityKind === quantityKind);
  if (!measurement) return null;
  return resolveMeasurementForLogScale(measurement);
}

/** @param {VisualizationNode} node */
function isSizeComparableNode(node) {
  return node.kind === "concept" || node.kind === "entity";
}

/** @param {VisualizationNode} node */
function nodeRadius(node) {
  return round(0.34 + Math.min(0.72, Math.sqrt(node.observationIds.length || 1) * 0.11));
}

/** @param {VisualizationNode} node */
function semanticY(node) {
  return SEMANTIC_LAYER_Y[node.semanticLayer] ?? 0;
}

/** @param {number} index @param {number} count */
function angleForIndex(index, count) {
  if (count <= 0) return 0;
  return (Math.PI * 2 * index) / count;
}

/** @param {string} id */
function stableAngle(id) {
  return stableUnit(id) * Math.PI * 2;
}

/** @param {string} id */
function stableJitter(id) {
  return stableUnit(id) - 0.5;
}

/** @param {string} id */
function stableUnit(id) {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

/** @param {{id:string}} left @param {{id:string}} right */
function compareById(left, right) {
  return left.id.localeCompare(right.id);
}

/** @param {number} value */
function round(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
