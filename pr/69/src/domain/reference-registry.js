import { validateJsonSchema, validateReferenceData } from "./reference-validation.js";

const ROOT_URL = new URL("../../domain/reference/paleontology/", import.meta.url);

/** @typedef {{id:string,label:string,labelEn?:string,scientificName?:string,kind:string,axis:string,rank?:string,status:string,internalOnly:boolean,externalIds?:Record<string,string|null>,sourceType:string,visible:boolean,quizEligible:boolean,parentIds?:string[],startMa?:number|null,endMa?:number|null,order?:number|null}} ReferenceNode */
/** @typedef {{id:string,type:string,sourceId:string,targetId:string}} ReferenceEdge */
/** @typedef {{nodes:ReferenceNode[],edges:ReferenceEdge[],metadata:Record<string,any>}} ReferenceGraph */

/** @param {URL} url @returns {Promise<any>} */
async function fetchJson(url) {
  const response = await fetch(url.toString(), { cache: "no-cache" });
  if (!response.ok) throw new Error(`${url} を読み込めませんでした (${response.status})`);
  return response.json();
}

/** @param {(url: URL) => Promise<any>} [loadJson] */
export function loadReferenceManifest(loadJson = fetchJson) {
  return loadJson(new URL("manifest.json", ROOT_URL));
}

/** @param {(url: URL) => Promise<any>} [loadJson] */
export async function loadTaxonomy(loadJson = fetchJson) {
  const manifest = await loadReferenceManifest(loadJson);
  return loadJson(new URL(manifest.files.taxonomy, ROOT_URL));
}

/** @param {(url: URL) => Promise<any>} [loadJson] */
export async function loadGeologicalTime(loadJson = fetchJson) {
  const manifest = await loadReferenceManifest(loadJson);
  return loadJson(new URL(manifest.files.geologicalTime, ROOT_URL));
}

/** @param {(url: URL) => Promise<any>} [loadJson] */
export async function loadReferenceData(loadJson = fetchJson) {
  const manifest = await loadReferenceManifest(loadJson);
  const [geologicalTime, taxonomy, geologicalTimeSchema, taxonomySchema] = await Promise.all([
    loadJson(new URL(manifest.files.geologicalTime, ROOT_URL)),
    loadJson(new URL(manifest.files.taxonomy, ROOT_URL)),
    loadJson(new URL(manifest.files.geologicalTimeSchema, ROOT_URL)),
    loadJson(new URL(manifest.files.taxonomySchema, ROOT_URL)),
  ]);
  const schemaErrors = [
    ...validateJsonSchema(geologicalTime, geologicalTimeSchema, "geologicalTime"),
    ...validateJsonSchema(taxonomy, taxonomySchema, "taxonomy"),
  ];
  const result = validateReferenceData({ manifest, geologicalTime, taxonomy });
  const errors = [...schemaErrors, ...(result.ok ? [] : result.errors)];
  if (errors.length) throw new Error(`参照データが不正です: ${errors.join("; ")}`);
  return { manifest, geologicalTime, taxonomy, graph: buildReferenceGraph({ manifest, geologicalTime, taxonomy }) };
}

/** @param {{manifest:any,geologicalTime:any,taxonomy:any}} input @returns {ReferenceGraph} */
export function buildReferenceGraph({ manifest, geologicalTime, taxonomy }) {
  const nodes = [
    ...(geologicalTime.nodes || []).map((node) => normalizeNode(node, "time")),
    ...(taxonomy.nodes || []).map((node) => normalizeNode(node, "taxonomy")),
  ].sort((a, b) => a.id.localeCompare(b.id));
  const edges = [
    ...(geologicalTime.relations || []).map((relation) => normalizeEdge(relation)),
    ...(taxonomy.relations || []).map((relation) => normalizeEdge(relation)),
  ].sort((a, b) => a.id.localeCompare(b.id));
  return {
    nodes,
    edges,
    metadata: {
      id: manifest.id,
      referenceDataVersion: manifest.referenceDataVersion,
      displayRootIdsByAxis: structuredClone(manifest.displayRootIdsByAxis || {}),
      axes: ["taxonomy", "geological-time"],
      sourceType: manifest.sourceType,
      status: manifest.status,
    },
  };
}

/** @param {any} node @param {string} kind @returns {ReferenceNode} */
function normalizeNode(node, kind) {
  return {
    id: node.id,
    label: node.label,
    labelEn: node.labelEn,
    scientificName: node.scientificName,
    kind,
    axis: node.axis,
    rank: node.rank,
    status: node.status,
    internalOnly: node.internalOnly === true,
    externalIds: node.externalIds || {},
    sourceType: node.sourceType || "curated",
    visible: node.ui?.visible !== false,
    quizEligible: node.quizEligible !== false,
    parentIds: node.parentIds || (node.parentId ? [node.parentId] : []),
    startMa: node.startMa ?? null,
    endMa: node.endMa ?? null,
    order: node.order ?? null,
  };
}

/** @param {any} relation @returns {ReferenceEdge} */
function normalizeEdge(relation) {
  return {
    id: relation.id,
    type: relation.type === "IS_A" ? "SUBCLASS_OF" : relation.type,
    sourceId: relation.sourceId,
    targetId: relation.targetId,
  };
}

/** @param {ReferenceGraph} graph @param {string} id */
export function getReferenceNodeById(graph, id) {
  return graph.nodes.find((node) => node.id === id) || null;
}

/**
 * Build an unambiguous label for display without changing the reference data.
 * Labels that are already unique inside their axis are intentionally left as-is.
 * @param {ReferenceGraph} graph
 * @param {ReferenceNode|null|undefined} node
 */
export function referenceNodeDisplayLabel(graph, node) {
  if (!node) return "";
  const duplicates = graph.nodes.filter((candidate) => candidate.axis === node.axis && candidate.label === node.label);
  if (duplicates.length < 2) return node.label;

  const paths = new Map(duplicates.map((candidate) => [candidate.id, getPartOfAncestorPath(graph, candidate)]));
  const path = paths.get(node.id) || [];
  for (let depth = 1; depth <= path.length; depth += 1) {
    const candidateLabel = qualifyReferenceLabel(node.label, path, depth);
    const matching = duplicates.filter((candidate) => {
      const candidatePath = paths.get(candidate.id) || [];
      return candidatePath.length >= depth
        && qualifyReferenceLabel(candidate.label, candidatePath, depth) === candidateLabel;
    });
    if (matching.length === 1) return candidateLabel;
  }
  return node.label;
}

/**
 * Geological-time `order` is only an ordinal inside a parent period, not a
 * global timeline key. Sort by numerical age and use stable data fields only
 * for ties and missing ages.
 * @param {ReferenceNode} a
 * @param {ReferenceNode} b
 */
export function compareGeologicalTimeNodes(a, b) {
  const aStart = Number.isFinite(a.startMa) ? a.startMa : null;
  const bStart = Number.isFinite(b.startMa) ? b.startMa : null;
  if (aStart !== null && bStart === null) return -1;
  if (aStart === null && bStart !== null) return 1;
  if (aStart !== null && bStart !== null && aStart !== bStart) return bStart - aStart;
  const aEnd = Number.isFinite(a.endMa) ? a.endMa : null;
  const bEnd = Number.isFinite(b.endMa) ? b.endMa : null;
  if (aEnd !== null && bEnd === null) return -1;
  if (aEnd === null && bEnd !== null) return 1;
  if (aEnd !== null && bEnd !== null && aEnd !== bEnd) return bEnd - aEnd;
  return a.id.localeCompare(b.id);
}

/** @param {ReferenceGraph} graph @param {string} id */
export function getReferenceChildren(graph, id) {
  const edges = graph.edges.filter((edge) => edge.targetId === id && isHierarchyEdge(edge));
  return sortNodes(graph, edges.map((edge) => edge.sourceId));
}

/** @param {ReferenceGraph} graph @param {string} id */
export function getReferenceParents(graph, id) {
  const edges = graph.edges.filter((edge) => edge.sourceId === id && isHierarchyEdge(edge));
  return sortNodes(graph, edges.map((edge) => edge.targetId));
}

/** @param {ReferenceGraph} graph @param {string} id */
export function getReferenceAncestors(graph, id) {
  return walkGraph(graph, id, getReferenceParents);
}

/** @param {ReferenceGraph} graph @param {string} id */
export function getReferenceDescendants(graph, id) {
  return walkGraph(graph, id, getReferenceChildren);
}

/** @param {ReferenceGraph} graph @param {string} [axis] */
export function getVisibleReferenceRoots(graph, axis) {
  const ids = axis
    ? graph.metadata.displayRootIdsByAxis?.[axis] || []
    : Object.values(graph.metadata.displayRootIdsByAxis || {}).flat();
  return ids
    .map((id) => getReferenceNodeById(graph, id))
    .filter((node) => node && node.internalOnly !== true && node.visible);
}

/** @param {ReferenceGraph} graph */
export function getVerifiedReferenceGraph(graph) {
  return filterGraph(graph, (node) => node.status === "verified");
}

/** @param {ReferenceGraph} graph */
export function getVerifiedQuizEligibleReferenceGraph(graph) {
  return filterGraph(graph, (node) => node.status === "verified" && node.quizEligible);
}

/** @param {ReferenceGraph} graph */
export function getVerifiedQuizEligibleReferenceNodes(graph) {
  return graph.nodes.filter((node) => node.status === "verified" && node.quizEligible);
}

/** @param {ReferenceGraph} graph @param {string} axis */
export function getReferenceGraphByAxis(graph, axis) {
  return filterGraph(graph, (node) => node.axis === axis);
}

/** @param {ReferenceGraph} graph @param {(node:ReferenceNode) => boolean} predicate @returns {ReferenceGraph} */
function filterGraph(graph, predicate) {
  const nodes = graph.nodes.filter(predicate);
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: graph.edges.filter((edge) => ids.has(edge.sourceId) && ids.has(edge.targetId)),
    metadata: {
      ...graph.metadata,
      displayRootIdsByAxis: Object.fromEntries(
        Object.entries(graph.metadata.displayRootIdsByAxis || {}).map(([axis, rootIds]) => [axis, rootIds.filter((id) => ids.has(id))]),
      ),
    },
  };
}

/** @param {ReferenceGraph} graph @param {string} startId @param {(graph:ReferenceGraph,id:string)=>ReferenceNode[]} next */
function walkGraph(graph, startId, next) {
  const result = [];
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const current = queue.shift();
    for (const node of next(graph, current)) {
      if (seen.has(node.id)) continue;
      seen.add(node.id);
      result.push(node);
      queue.push(node.id);
    }
  }
  return result;
}

/** @param {ReferenceGraph} graph @param {string[]} ids */
function sortNodes(graph, ids) {
  return ids.map((id) => getReferenceNodeById(graph, id)).filter(Boolean).sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
}

/** @param {ReferenceEdge} edge */
function isHierarchyEdge(edge) {
  return edge.type === "SUBCLASS_OF" || edge.type === "PART_OF";
}

/** @param {ReferenceGraph} graph @param {ReferenceNode} node */
function getPartOfAncestorPath(graph, node) {
  const path = [];
  const seen = new Set([node.id]);
  let current = node;
  while (current) {
    const parent = graph.edges
      .filter((edge) => edge.type === "PART_OF" && edge.sourceId === current.id)
      .map((edge) => getReferenceNodeById(graph, edge.targetId))
      .filter(Boolean)
      .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    path.push(parent);
    current = parent;
  }
  return path;
}

/** @param {string} label @param {ReferenceNode[]} path @param {number} depth */
function qualifyReferenceLabel(label, path, depth) {
  return `${path.slice(0, depth).reverse().map((node) => node.label).join("")}${label}`;
}
