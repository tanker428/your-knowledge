import {
  buildVisitKnowledgeGraph,
  getGraphNodeById,
  getGraphNodesByType,
  getOneHopGraph,
} from "../../domain/knowledge-graph.js";
import {
  getReferenceAncestors,
  getReferenceChildren,
  getReferenceNodeById,
} from "../../domain/reference-registry.js";

const DISPLAY_TYPES = new Set(["User", "Visit", "Photo", "Observation", "QuestionSeed"]);

export function buildKnowledgeGraphView(project, visitId, registries = {}, referenceGraph = null) {
  const graph = buildVisitKnowledgeGraph(project, visitId, registries);
  return { source: graph, overview: buildVisitOverviewGraph(graph), focus: null, referenceGraph, empty: getGraphNodesByType(graph, "Observation").length === 0 };
}

export function buildVisitOverviewGraph(graph) {
  const ids = new Set(graph.nodes.filter((node) => DISPLAY_TYPES.has(node.type)).map((node) => node.id));
  return projectGraph(graph, ids, "overview");
}

export function buildObservationFocusGraph(graph, observationNodeId, referenceGraph = null) {
  const oneHop = getOneHopGraph(graph, observationNodeId);
  const ids = new Set(oneHop.nodes.map((node) => node.id));
  const entityIds = new Set(oneHop.nodes.filter((node) => node.type === "Entity").map((node) => node.id));
  for (const edge of graph.edges) {
    if (edge.type === "HAS_REFERENCE_FACT" && entityIds.has(edge.sourceId)) {
      ids.add(edge.targetId);
      for (const factEdge of graph.edges.filter((candidate) => candidate.type === "HAS_REFERENCE_FACT" && candidate.targetId === edge.targetId)) ids.add(factEdge.sourceId);
    }
  }
  const focus = { ...graph, nodes: graph.nodes.filter((node) => ids.has(node.id)), edges: graph.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)) };
  const verifiedFactIds = new Set(focus.nodes.filter((node) => node.type !== "ReferenceFact" || node.status === "verified").map((node) => node.id));
  const verifiedFocus = { ...focus, nodes: focus.nodes.filter((node) => verifiedFactIds.has(node.id)), edges: focus.edges.filter((edge) => verifiedFactIds.has(edge.sourceId) && verifiedFactIds.has(edge.targetId)) };
  const view = projectGraph(verifiedFocus, new Set(verifiedFocus.nodes.map((node) => node.id)), "focus");
  return referenceGraph ? mergeReferencedReferenceGraph(view, referenceGraph) : view;
}

export function mergeReferencedReferenceGraph(viewGraph, referenceGraph) {
  if (!referenceGraph) return viewGraph;
  const nodes = [...viewGraph.nodes];
  const edges = [...viewGraph.edges];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const referenceIds = new Set();
  for (const fact of nodes.filter((node) => node.type === "ReferenceFact" && node.status === "verified")) {
    const values = Array.isArray(fact.value) ? fact.value : [fact.value];
    for (const id of values) if (typeof id === "string" && getReferenceNodeById(referenceGraph, id)) referenceIds.add(id);
  }
  for (const id of referenceIds) {
    for (const node of [getReferenceNodeById(referenceGraph, id), ...getReferenceAncestors(referenceGraph, id), ...getReferenceChildren(referenceGraph, id)]) {
      if (!node || node.internalOnly || node.visible === false) continue;
      const displayId = `Reference:${node.id}`;
      if (nodeIds.has(displayId)) continue;
      nodeIds.add(displayId);
      nodes.push({ id: displayId, type: "ReferenceNode", referenceId: node.id, label: node.label, axis: node.axis, kind: node.kind, status: node.status, sourceType: node.sourceType, internalOnly: false });
    }
  }
  for (const fact of nodes.filter((node) => node.type === "ReferenceFact" && node.status === "verified")) {
    for (const id of (Array.isArray(fact.value) ? fact.value : [fact.value])) {
      const targetId = typeof id === "string" ? `Reference:${id}` : null;
      if (!targetId || !nodeIds.has(targetId)) continue;
      const edgeId = `ReferenceFactEdge:${fact.referenceFactId}:${id}`;
      if (!edges.some((edge) => edge.id === edgeId)) edges.push({ id: edgeId, type: "REFERS_TO_REFERENCE", sourceId: fact.id, targetId });
    }
  }
  for (const edge of referenceGraph.edges) {
    const sourceId = `Reference:${edge.sourceId}`;
    const targetId = `Reference:${edge.targetId}`;
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) continue;
    const edgeId = `ReferenceEdge:${edge.id}`;
    if (!edges.some((item) => item.id === edgeId)) edges.push({ id: edgeId, type: edge.type, sourceId, targetId, reference: true });
  }
  return { ...viewGraph, nodes: nodes.sort(compareId), edges: edges.sort(compareId), metadata: { ...viewGraph.metadata, referenceGraphMerged: true } };
}

export function filterGraphByAxis(graph, axis) {
  if (axis === "all") return graph;
  if (axis === "relation") {
    const ids = new Set(graph.nodes.filter((node) => ["User", "Visit", "Photo", "Observation"].includes(node.type)).map((node) => node.id));
    return projectGraph(graph, ids, axis);
  }
  const referenceFactIds = new Set(graph.edges.filter((edge) => edge.type === "REFERS_TO_REFERENCE" && graph.nodes.find((node) => node.id === edge.targetId)?.axis === axis).map((edge) => edge.sourceId));
  const ids = new Set(graph.nodes.filter((node) => node.axis === axis || ["User", "Visit", "Photo", "Observation", "Entity"].includes(node.type) || (node.type === "ReferenceFact" && (node.axis === axis || referenceFactIds.has(node.id)))).map((node) => node.id));
  return projectGraph(graph, ids, axis);
}

export function getKnowledgeGraphNodeDetail(graph, nodeId) {
  const node = getGraphNodeById(graph, nodeId);
  if (!node) return null;
  return { node, incoming: graph.edges.filter((edge) => edge.targetId === nodeId), outgoing: graph.edges.filter((edge) => edge.sourceId === nodeId) };
}

/**
 * Deterministic radial coordinates for either a Visit overview or an
 * Observation focus graph. Coordinates are in a stable 1000x700 viewBox.
 */
export function buildRadialLayout(graph, centerId) {
  const center = getGraphNodeById(graph, centerId);
  if (!center) return { width: 1000, height: 700, centerId, nodes: [], edges: [] };
  const centerType = center.type === "Visit" ? "Visit" : "Observation";
  const centerNodeIds = new Set([centerId]);
  const ringOne = [];
  const ringTwo = [];
  const direct = new Set(graph.edges.filter((edge) => edge.sourceId === centerId || edge.targetId === centerId).flatMap((edge) => [edge.sourceId, edge.targetId]));
  direct.delete(centerId);
  for (const node of graph.nodes) {
    if (node.id === centerId) continue;
    if (centerType === "Visit" && node.type === "Photo") ringOne.push(node);
    else if (centerType === "Observation" && direct.has(node.id)) ringOne.push(node);
    else if (centerType === "Visit" && node.type === "Observation") ringTwo.push(node);
    else if (centerType === "Observation" && !direct.has(node.id) && ["ReferenceNode", "ReferenceFact", "GenericCategory", "DomainCategory", "LearningRole"].includes(node.type)) ringTwo.push(node);
  }
  ringOne.sort(compareId);
  ringTwo.sort(compareId);
  ringOne.forEach((node) => centerNodeIds.add(node.id));
  ringTwo.forEach((node) => centerNodeIds.add(node.id));
  const positions = [{ id: centerId, x: 500, y: 350, ring: 0 }];
  addRingPositions(positions, ringOne, 190, 1);
  addRingPositions(positions, ringTwo, Math.max(300, ringTwo.length * 38), 2);
  return { width: 1000, height: 700, centerId, centerType, nodes: positions, edges: graph.edges.filter((edge) => centerNodeIds.has(edge.sourceId) && centerNodeIds.has(edge.targetId)).sort(compareId) };
}

function addRingPositions(positions, nodes, radius, ring) {
  const count = nodes.length;
  if (!count) return;
  const effectiveRadius = Math.max(radius, count * 42);
  nodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    positions.push({ id: node.id, x: Math.round((500 + Math.cos(angle) * effectiveRadius) * 100) / 100, y: Math.round((350 + Math.sin(angle) * effectiveRadius) * 100) / 100, ring });
  });
}

function projectGraph(graph, ids, scope) {
  return { ...graph, nodes: graph.nodes.filter((node) => ids.has(node.id)), edges: graph.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)), metadata: { ...graph.metadata, displayScope: scope } };
}
function compareId(a, b) { return a.id.localeCompare(b.id); }
