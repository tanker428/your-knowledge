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

/** Add only the direct children of individually expanded ReferenceNodes. */
export function expandReferenceGraphNodes(viewGraph, referenceGraph, expandedReferenceIds = []) {
  if (!referenceGraph || !expandedReferenceIds.length) return viewGraph;
  const nodes = [...viewGraph.nodes];
  const edges = [...viewGraph.edges];
  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const referenceId of expandedReferenceIds) {
    const parent = getReferenceNodeById(referenceGraph, referenceId);
    if (!parent) continue;
    if (!nodeIds.has(`Reference:${referenceId}`)) continue;
    for (const child of getReferenceChildren(referenceGraph, referenceId)) {
      if (!child || child.internalOnly || child.visible === false) continue;
      const displayId = `Reference:${child.id}`;
      if (!nodeIds.has(displayId)) {
        nodeIds.add(displayId);
        nodes.push({ id: displayId, type: "ReferenceNode", referenceId: child.id, label: child.label, axis: child.axis, kind: child.kind, status: child.status, sourceType: child.sourceType, internalOnly: false });
      }
      const edgeId = `ReferenceEdge:${parent.id}:${child.id}`;
      if (!edges.some((edge) => edge.id === edgeId)) edges.push({ id: edgeId, type: child.axis === "geological-time" ? "PART_OF" : "SUBCLASS_OF", sourceId: displayId, targetId: `Reference:${parent.id}`, reference: true });
    }
  }
  return { ...viewGraph, nodes: nodes.sort(compareId), edges: edges.sort(compareId), metadata: { ...viewGraph.metadata, expandedReferenceIds: [...expandedReferenceIds].sort() } };
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
  const ringOneRadius = Math.max(190, ringOne.length * 52);
  const ringTwoRadius = Math.max(ringOneRadius + 150, ringTwo.length * 52);
  const outerRadius = ringTwo.length ? ringTwoRadius : ringOneRadius;
  const padding = 120;
  const width = Math.max(760, Math.ceil(outerRadius * 2 + padding * 2));
  const height = Math.max(560, Math.ceil(outerRadius * 2 + padding * 2));
  const centerX = width / 2;
  const centerY = height / 2;
  const positions = [{ id: centerId, x: centerX, y: centerY, ring: 0 }];
  addRingPositions(positions, ringOne, ringOneRadius, 1, centerX, centerY);
  addRingPositions(positions, ringTwo, ringTwoRadius, 2, centerX, centerY);
  return { width, height, centerX, centerY, outerRadius, centerId, centerType, nodes: positions, edges: graph.edges.filter((edge) => centerNodeIds.has(edge.sourceId) && centerNodeIds.has(edge.targetId)).sort(compareId) };
}

function addRingPositions(positions, nodes, radius, ring, centerX, centerY) {
  const count = nodes.length;
  if (!count) return;
  const effectiveRadius = Math.max(radius, count * 52);
  nodes.forEach((node, index) => {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / count;
    positions.push({ id: node.id, x: Math.round((centerX + Math.cos(angle) * effectiveRadius) * 100) / 100, y: Math.round((centerY + Math.sin(angle) * effectiveRadius) * 100) / 100, ring });
  });
}

export function getRadialNodeShape(node) {
  if (node.type === "Visit") return "hexagon";
  if (node.type === "Photo") return "rounded-rect";
  if (node.type === "Observation") return "circle";
  if (node.type === "Entity") return "diamond";
  if (node.type === "ReferenceFact") return "rect";
  if (node.type === "GenericCategory" || node.type === "DomainCategory") return "triangle";
  if (node.type === "ReferenceNode" && node.axis === "geological-time") return "ellipse";
  if (node.type === "ReferenceNode") return "triangle";
  return "circle";
}

function projectGraph(graph, ids, scope) {
  const roleNodes = new Map(graph.nodes.filter((node) => node.type === "LearningRole").map((node) => [node.id, node]));
  const nodes = graph.nodes
    .filter((node) => ids.has(node.id) && !roleNodes.has(node.id))
    .map((node) => {
      if (node.type !== "Observation") return node;
      const roles = graph.edges
        .filter((edge) => edge.type === "HAS_ROLE" && edge.sourceId === node.id && roleNodes.has(edge.targetId))
        .map((edge) => roleNodes.get(edge.targetId))
        .filter(Boolean);
      if (!roles.length) return node;
      return {
        ...node,
        displayAttributes: {
          ...(node.displayAttributes || {}),
          learningRoles: roles.map((role) => role.roleId || role.id),
          learningRoleLabels: roles.map((role) => role.label),
        },
      };
    });
  const edges = graph.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId) && !roleNodes.has(edge.sourceId) && !roleNodes.has(edge.targetId));
  return { ...graph, nodes, edges, metadata: { ...graph.metadata, displayScope: scope, learningRolesCollapsed: true } };
}
function compareId(a, b) { return a.id.localeCompare(b.id); }
