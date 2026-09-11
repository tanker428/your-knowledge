import {
  magnitudeValueFromMeasurement,
  normalizeMagnitudeValue,
  SECONDS_PER_MILLION_YEARS,
  TIME_UNIT_SI,
  timeMagnitudeFromMaInterval,
} from "./magnitude.js";
import { LENGTH_UNIT_SI } from "./measurements.js";

export const VISUALIZATION_LAYOUT_SCHEMA_VERSION = "1.0.0";

export const SEMANTIC_LAYER_Y = Object.freeze({
  experience: 0,
  referent: 1,
  conceptual: 2,
});

export const DEFAULT_SIZE_QUANTITY_KIND = "body_length";
export const SIZE_LAYOUT_SCALE = 6;
export const SIZE_LAYOUT_DEFAULT_UNSET_X = 10;
export const SIZE_BOARD_ID = "quantity:body_length";
export const SIZE_BOARD_Z = 0;
export const MAGNITUDE_QUANTITY_BOARD_Z = -3.8;
export const TIME_MAGNITUDE_BOARD_ID = "time:duration";
export const TIME_MAGNITUDE_BOARD_Z = 3.8;
export const TIME_MAGNITUDE_UNIT_LABEL = "Ma";

const HOME_RADIUS_BY_LAYER = Object.freeze({
  experience: 3.5,
  referent: 5,
  conceptual: 6.5,
});
const BOARD_AXIS_Y = -0.55;
const BOARD_MIN_Y = -0.82;
const BOARD_MAX_Y = 2.42;
const BOARD_X_PADDING = 1.2;
const BOARD_UNSET_PADDING = 2.8;
const MAGNITUDE_TICK_MULTIPLIERS = Object.freeze([1, 2, 5]);

/**
 * @typedef {import('./visualization-graph.js').VisualizationGraphV1} VisualizationGraphV1
 * @typedef {import('./visualization-graph.js').VisualizationNode} VisualizationNode
 * @typedef {import('./visualization-graph.js').VisualizationEdge} VisualizationEdge
 * @typedef {"home"|"relation"|"size"|"magnitude"} LayoutMode
 */

/**
 * @typedef {object} LayoutAxisTick
 * @property {number} valueSI
 * @property {number} normalizedScalar
 * @property {number} x
 * @property {string} label
 * @property {boolean} major
 */

/**
 * Display-only board metadata for renderers. Coordinates describe the derived
 * visualization surface only; they are not persisted to Project JSON or the KG.
 *
 * @typedef {object} LayoutBoard
 * @property {string} id
 * @property {"quantity"|"time"} axisKind
 * @property {string} axisLabel
 * @property {"log"|"linear"} normalization
 * @property {string} unitSI
 * @property {string} unitLabel
 * @property {number} referenceValueSI
 * @property {number} scale
 * @property {number} xMin
 * @property {number} xMax
 * @property {number} axisMinX
 * @property {number} axisMaxX
 * @property {number} yMin
 * @property {number} yMax
 * @property {number} axisY
 * @property {number} z
 * @property {number|null} unsetAreaX
 * @property {string|null} unsetLabel
 * @property {LayoutAxisTick[]} ticks
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
 * @property {string|null} boardId
 * @property {number|null} normalizedScalar
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
 * @property {{sourceGraphSchemaVersion:string, quantityKind:string|null, unsetAreaX:number, boards:LayoutBoard[]}} metadata
 */

/**
 * @param {VisualizationGraphV1} graph
 * @param {{mode?: LayoutMode, quantityKind?: string, sizeScale?: number, unsetAreaX?: number}} [options]
 * @returns {VisualizationLayout}
 */
export function layoutVisualizationGraph(graph, options = {}) {
  const mode = options.mode || "home";
  if (mode === "magnitude") return magnitudeLayout(graph, options);
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
  const sizeNodes = graph.nodes.filter(isSizeComparableNode).sort(compareById);
  const resolvedNodes = sizeNodes.map((node) => ({
    node,
    resolved: resolveMeasurement(node, quantityKind),
  }));
  const scaledXs = resolvedNodes
    .filter((entry) => entry.resolved)
    .map((entry) => entry.resolved.normalizedScalar * scale);
  const unsetAreaX = options.unsetAreaX
    ?? round(Math.max(SIZE_LAYOUT_DEFAULT_UNSET_X, ...scaledXs.map((x) => x + 3)));
  const board = quantityBoard({
    boardId: SIZE_BOARD_ID,
    quantityKind,
    scale,
    scaledXs,
    unsetAreaX,
    z: SIZE_BOARD_Z,
  });

  let unsetIndex = 0;
  const scaledLaneCounts = new Map();
  const nodes = resolvedNodes.map(({ node, resolved }) => {
    if (!resolved) {
      const next = unsetIndex;
      unsetIndex += 1;
      return layoutNode(node, {
        x: unsetAreaX,
        y: boardLaneY(node, next),
        z: board.z,
        zone: "unset",
        boardId: board.id,
      });
    }

    const laneIndex = scaledLaneCounts.get(node.semanticLayer) || 0;
    scaledLaneCounts.set(node.semanticLayer, laneIndex + 1);
    return layoutNode(node, {
      x: round(resolved.normalizedScalar * scale),
      y: boardLaneY(node, laneIndex),
      z: board.z,
      zone: "scaled",
      boardId: board.id,
      normalizedScalar: resolved.normalizedScalar,
      representativeValue: resolved.representativeValueSI,
      rangeSI: resolved.rangeSI,
    });
  });

  return buildLayout("size", graph, nodes, quantityKind, unsetAreaX, [board]);
}

/**
 * Project body length and geological interval duration onto two juxtaposed
 * magnitude boards. The time board intentionally uses duration magnitude
 * (interval width) rather than chronological position.
 *
 * @param {VisualizationGraphV1} graph
 * @param {{quantityKind?: string, sizeScale?: number, unsetAreaX?: number}} [options]
 * @returns {VisualizationLayout}
 */
export function magnitudeLayout(graph, options = {}) {
  const quantityKind = options.quantityKind || DEFAULT_SIZE_QUANTITY_KIND;
  const scale = options.sizeScale ?? SIZE_LAYOUT_SCALE;
  const quantityNodes = graph.nodes.filter(isQuantityMagnitudeNode).sort(compareById);
  const timeNodes = graph.nodes.filter(isTimeMagnitudeNode).sort(compareById);
  const quantityEntries = quantityNodes.map((node) => ({
    node,
    resolved: resolveMeasurement(node, quantityKind),
  }));
  const timeEntries = timeNodes.map((node) => ({
    node,
    resolved: resolveTimeMagnitude(node),
  }));
  const scaledXs = [...quantityEntries, ...timeEntries]
    .filter((entry) => entry.resolved)
    .map((entry) => entry.resolved.normalizedScalar * scale);
  const unsetAreaX = options.unsetAreaX
    ?? round(Math.max(SIZE_LAYOUT_DEFAULT_UNSET_X, ...scaledXs.map((x) => x + 3)));
  const axisMinX = round(Math.min(-SIZE_LAYOUT_SCALE, ...scaledXs) - BOARD_X_PADDING);
  const axisMaxX = round(Math.max(SIZE_LAYOUT_SCALE, ...scaledXs) + BOARD_X_PADDING);
  const quantity = quantityBoard({
    boardId: SIZE_BOARD_ID,
    quantityKind,
    scale,
    scaledXs,
    unsetAreaX,
    z: MAGNITUDE_QUANTITY_BOARD_Z,
    axisMinX,
    axisMaxX,
  });
  const time = timeBoard({
    scale,
    scaledXs,
    unsetAreaX,
    z: TIME_MAGNITUDE_BOARD_Z,
    axisMinX,
    axisMaxX,
  });

  const nodes = [
    ...boardLayoutNodes(quantityEntries, quantity),
    ...boardLayoutNodes(timeEntries, time),
  ];
  return buildLayout("magnitude", graph, nodes, quantityKind, unsetAreaX, [quantity, time]);
}

/**
 * @param {LayoutMode} mode
 * @param {VisualizationGraphV1} graph
 * @param {LayoutNode[]} nodes
 * @param {string|null} quantityKind
 * @param {number} [unsetAreaX]
 * @param {LayoutBoard[]} [boards]
 * @returns {VisualizationLayout}
 */
function buildLayout(mode, graph, nodes, quantityKind, unsetAreaX = 14, boards = []) {
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
      boards,
    },
  };
}

/**
 * @param {VisualizationNode} node
 * @param {{x:number, y:number, z:number, zone:string, boardId?:string|null, normalizedScalar?:number|null, representativeValue?:number|null, rangeSI?:{minSI:number, maxSI:number}|null}} position
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
    boardId: position.boardId ?? null,
    normalizedScalar: position.normalizedScalar ?? null,
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
 * @returns {{representativeValueSI:number, normalizedScalar:number, rangeSI:{minSI:number, maxSI:number}|null}|null}
 */
function resolveMeasurement(node, quantityKind) {
  const measurement = (node.measurements || []).find((item) => item.quantityKind === quantityKind);
  if (!measurement) return null;
  return normalizeMagnitudeValue(magnitudeValueFromMeasurement(measurement), sizeMagnitudeAxis(quantityKind));
}

/**
 * @param {VisualizationNode} node
 * @returns {{representativeValueSI:number, normalizedScalar:number, rangeSI:{minSI:number, maxSI:number}|null}|null}
 */
function resolveTimeMagnitude(node) {
  return normalizeMagnitudeValue(timeMagnitudeFromMaInterval({
    startMa: node.data?.startMa,
    endMa: node.data?.endMa,
    source: {
      referenceIds: node.referenceIds,
      sourceNodeIds: node.sourceNodeIds,
    },
  }), timeMagnitudeAxis());
}

/** @param {VisualizationNode} node */
function isSizeComparableNode(node) {
  return node.kind === "concept" || node.kind === "entity";
}

/** @param {VisualizationNode} node */
function isQuantityMagnitudeNode(node) {
  return isSizeComparableNode(node) && !isTimeMagnitudeNode(node);
}

/** @param {VisualizationNode} node */
function isTimeMagnitudeNode(node) {
  return node.kind === "landmark"
    || node.data?.referenceAxis === "geological-time"
    || node.data?.axis === "geological-time";
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

/**
 * @param {{boardId:string, quantityKind:string, scale:number, scaledXs:number[], unsetAreaX:number, z:number, axisMinX?:number, axisMaxX?:number}} options
 * @returns {LayoutBoard}
 */
function quantityBoard(options) {
  const scaledMin = Math.min(-SIZE_LAYOUT_SCALE, ...options.scaledXs);
  const scaledMax = Math.max(SIZE_LAYOUT_SCALE, ...options.scaledXs);
  const axisMinX = options.axisMinX ?? round(scaledMin - BOARD_X_PADDING);
  const axisMaxX = options.axisMaxX ?? round(scaledMax + BOARD_X_PADDING);
  const xMax = round(Math.max(axisMaxX, options.unsetAreaX + BOARD_UNSET_PADDING));
  return {
    id: options.boardId,
    axisKind: "quantity",
    axisLabel: options.quantityKind,
    normalization: "log",
    unitSI: LENGTH_UNIT_SI,
    unitLabel: LENGTH_UNIT_SI,
    referenceValueSI: 1,
    scale: options.scale,
    xMin: axisMinX,
    xMax,
    axisMinX,
    axisMaxX,
    yMin: BOARD_MIN_Y,
    yMax: BOARD_MAX_Y,
    axisY: BOARD_AXIS_Y,
    z: options.z,
    unsetAreaX: options.unsetAreaX,
    unsetLabel: `unset: no ${options.quantityKind}`,
    ticks: magnitudeAxisTicks(sizeMagnitudeAxis(options.quantityKind), {
      scale: options.scale,
      minX: axisMinX,
      maxX: axisMaxX,
      unitLabel: LENGTH_UNIT_SI,
    }),
  };
}

/**
 * @param {{scale:number, scaledXs:number[], unsetAreaX:number, z:number, axisMinX?:number, axisMaxX?:number}} options
 * @returns {LayoutBoard}
 */
function timeBoard(options) {
  const scaledMin = Math.min(-SIZE_LAYOUT_SCALE, ...options.scaledXs);
  const scaledMax = Math.max(SIZE_LAYOUT_SCALE, ...options.scaledXs);
  const axisMinX = options.axisMinX ?? round(scaledMin - BOARD_X_PADDING);
  const axisMaxX = options.axisMaxX ?? round(scaledMax + BOARD_X_PADDING);
  const xMax = round(Math.max(axisMaxX, options.unsetAreaX + BOARD_UNSET_PADDING));
  return {
    id: TIME_MAGNITUDE_BOARD_ID,
    axisKind: "time",
    axisLabel: "duration",
    normalization: "log",
    unitSI: TIME_UNIT_SI,
    unitLabel: TIME_MAGNITUDE_UNIT_LABEL,
    referenceValueSI: SECONDS_PER_MILLION_YEARS,
    scale: options.scale,
    xMin: axisMinX,
    xMax,
    axisMinX,
    axisMaxX,
    yMin: BOARD_MIN_Y,
    yMax: BOARD_MAX_Y,
    axisY: BOARD_AXIS_Y,
    z: options.z,
    unsetAreaX: options.unsetAreaX,
    unsetLabel: "unset: no duration",
    ticks: magnitudeAxisTicks(timeMagnitudeAxis(), {
      scale: options.scale,
      minX: axisMinX,
      maxX: axisMaxX,
      unitLabel: TIME_MAGNITUDE_UNIT_LABEL,
      labelValueSI: SECONDS_PER_MILLION_YEARS,
    }),
  };
}

/**
 * @param {string} quantityKind
 * @returns {import('./magnitude.js').MagnitudeAxis}
 */
function sizeMagnitudeAxis(quantityKind) {
  return {
    axisKind: "quantity",
    normalization: "log",
    quantityKind,
    unitSI: LENGTH_UNIT_SI,
    referenceValueSI: 1,
  };
}

/**
 * @returns {import('./magnitude.js').MagnitudeAxis}
 */
function timeMagnitudeAxis() {
  return {
    axisKind: "time",
    normalization: "log",
    unitSI: TIME_UNIT_SI,
    referenceValueSI: SECONDS_PER_MILLION_YEARS,
  };
}

/**
 * @param {import('./magnitude.js').MagnitudeAxis} axis
 * @param {{scale:number, minX:number, maxX:number, unitLabel:string, labelValueSI?:number}} options
 * @returns {LayoutAxisTick[]}
 */
function magnitudeAxisTicks(axis, options) {
  const minScalar = Math.floor(options.minX / options.scale);
  const maxScalar = Math.ceil(options.maxX / options.scale);
  const referenceValueSI = positiveFiniteNumber(axis.referenceValueSI) || 1;
  const labelValueSI = positiveFiniteNumber(options.labelValueSI) || 1;
  const ticks = [];
  for (let exponent = minScalar - 1; exponent <= maxScalar + 1; exponent += 1) {
    for (const multiplier of MAGNITUDE_TICK_MULTIPLIERS) {
      const valueSI = multiplier * (10 ** exponent) * referenceValueSI;
      const normalized = normalizeMagnitudeValue({
        axisKind: axis.axisKind,
        quantityKind: axis.quantityKind ?? null,
        valueSI,
        minSI: null,
        maxSI: null,
        unitSI: axis.unitSI,
      }, axis);
      if (!normalized) continue;
      const x = round(normalized.normalizedScalar * options.scale);
      if (x < options.minX - 0.000001 || x > options.maxX + 0.000001) continue;
      ticks.push({
        valueSI,
        normalizedScalar: normalized.normalizedScalar,
        x,
        label: `${formatMagnitudeTick(valueSI / labelValueSI)} ${options.unitLabel}`,
        major: multiplier === 1,
      });
    }
  }
  return ticks.sort((left, right) => left.x - right.x || left.valueSI - right.valueSI);
}

/**
 * @param {{node:VisualizationNode, resolved:{representativeValueSI:number, normalizedScalar:number, rangeSI:{minSI:number, maxSI:number}|null}|null}[]} entries
 * @param {LayoutBoard} board
 * @returns {LayoutNode[]}
 */
function boardLayoutNodes(entries, board) {
  let unsetIndex = 0;
  const scaledLaneCounts = new Map();
  return entries.map(({ node, resolved }) => {
    if (!resolved) {
      const next = unsetIndex;
      unsetIndex += 1;
      return layoutNode(node, {
        x: board.unsetAreaX ?? SIZE_LAYOUT_DEFAULT_UNSET_X,
        y: boardLaneY(node, next),
        z: board.z,
        zone: "unset",
        boardId: board.id,
      });
    }

    const laneIndex = scaledLaneCounts.get(node.semanticLayer) || 0;
    scaledLaneCounts.set(node.semanticLayer, laneIndex + 1);
    return layoutNode(node, {
      x: round(resolved.normalizedScalar * board.scale),
      y: boardLaneY(node, laneIndex),
      z: board.z,
      zone: "scaled",
      boardId: board.id,
      normalizedScalar: resolved.normalizedScalar,
      representativeValue: resolved.representativeValueSI,
      rangeSI: resolved.rangeSI,
    });
  });
}

/** @param {VisualizationNode} node @param {number} index */
function boardLaneY(node, index) {
  const lane = (index % 5) - 2;
  const stack = Math.floor(index / 5);
  return round(semanticY(node) + lane * 0.12 + stack * 0.18);
}

/** @param {number} value */
function formatMagnitudeTick(value) {
  if (value >= 1) return Number(value.toPrecision(4)).toLocaleString("en-US");
  return Number(value.toPrecision(4)).toString();
}

/** @param {unknown} value */
function positiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
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
