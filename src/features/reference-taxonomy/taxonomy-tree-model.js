import {
  getReferenceAncestors,
  getReferenceChildren,
  getReferenceNodeById,
  getReferenceParents,
  referenceNodeDisplayLabel,
} from "../../domain/reference-registry.js";

export const DEFAULT_TAXONOMY_ROOT_ID = "taxon:tetrapoda";
export const DEFAULT_TAXONOMY_INITIAL_EXPAND_DEPTH = 4;
const TAXONOMY_AXIS = "taxonomy";

/**
 * @typedef {import("../../domain/reference-registry.js").ReferenceGraph} ReferenceGraph
 * @typedef {import("../../domain/reference-registry.js").ReferenceNode} ReferenceNode
 * @typedef {{id:string,node:ReferenceNode,depth:number,childCount:number,expanded:boolean,pathIds:string[]}} TaxonomyTreeRow
 * @typedef {{node:ReferenceNode,label:string,scientificName:string,rank:string,score:number}} TaxonomySearchResult
 */

/**
 * Resolve the taxonomy roots supplied by the manifest-visible-root selector,
 * with a stable fallback for older manifests.
 * @param {ReferenceGraph} graph
 * @param {(string|ReferenceNode|null|undefined)[]} visibleRoots
 * @param {string} [fallbackId]
 * @returns {string[]}
 */
export function resolveTaxonomyRootIds(
  graph,
  visibleRoots,
  fallbackId = DEFAULT_TAXONOMY_ROOT_ID,
) {
  const manifestRootIds = uniqueStrings(
    visibleRoots
      .map((root) => (typeof root === "string" ? root : root?.id))
      .filter(Boolean),
  ).filter((id) => isTaxonomyTreeNode(getReferenceNodeById(graph, id)));
  if (manifestRootIds.length) return manifestRootIds;

  if (isTaxonomyTreeNode(getReferenceNodeById(graph, fallbackId))) {
    return [fallbackId];
  }

  return graph.nodes
    .filter((node) => isTaxonomyTreeNode(node))
    .filter((node) => !getReferenceParents(graph, node.id).some(isTaxonomyTreeNode))
    .sort(compareReferenceNode)
    .map((node) => node.id);
}

/**
 * Expand only a shallow prefix of the taxonomy, leaving deeper branches lazy.
 * `maxDepth` is exclusive: depth 0 roots expand when maxDepth is at least 1.
 * @param {ReferenceGraph} graph
 * @param {string[]} rootIds
 * @param {number} [maxDepth]
 * @returns {Set<string>}
 */
export function getInitialTaxonomyExpandedIds(
  graph,
  rootIds,
  maxDepth = DEFAULT_TAXONOMY_INITIAL_EXPAND_DEPTH,
) {
  const expanded = new Set();
  const queue = rootIds.map((id) => ({ id, depth: 0, pathIds: [] }));
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const node = getReferenceNodeById(graph, current.id);
    if (!isTaxonomyTreeNode(node)) continue;
    if (current.pathIds.includes(current.id)) continue;

    const nextPath = [...current.pathIds, current.id];
    const children = getTaxonomyChildren(graph, current.id, nextPath);
    if (children.length && current.depth < maxDepth) {
      expanded.add(current.id);
      for (const child of children) {
        queue.push({ id: child.id, depth: current.depth + 1, pathIds: nextPath });
      }
    }
  }
  return expanded;
}

/**
 * Return the rows currently visible in the tree. Descendants are only walked
 * when their parent ID is expanded.
 * @param {ReferenceGraph} graph
 * @param {string[]} rootIds
 * @param {Set<string>} expandedIds
 * @returns {TaxonomyTreeRow[]}
 */
export function getVisibleTaxonomyRows(graph, rootIds, expandedIds) {
  /** @type {TaxonomyTreeRow[]} */
  const rows = [];
  for (const rootId of uniqueStrings(rootIds)) {
    appendTaxonomyRows(graph, rootId, expandedIds, rows, 0, []);
  }
  return rows;
}

/**
 * @param {Set<string>} expandedIds
 * @param {ReferenceGraph} graph
 * @param {string} nodeId
 * @param {boolean} expanded
 * @returns {Set<string>}
 */
export function setTaxonomyNodeExpanded(expandedIds, graph, nodeId, expanded) {
  const next = new Set(expandedIds);
  if (expanded) {
    next.add(nodeId);
    return next;
  }
  next.delete(nodeId);
  for (const node of getReferenceDescendantsForTree(graph, nodeId)) {
    next.delete(node.id);
  }
  return next;
}

/**
 * Expand every ancestor needed to bring a node into view.
 * @param {ReferenceGraph} graph
 * @param {string} nodeId
 * @param {Set<string>} expandedIds
 * @returns {Set<string>}
 */
export function expandTaxonomyNodePath(graph, nodeId, expandedIds) {
  const next = new Set(expandedIds);
  for (const ancestor of getReferenceAncestors(graph, nodeId)) {
    if (isTaxonomyTreeNode(ancestor)) next.add(ancestor.id);
  }
  return next;
}

/**
 * Search all taxonomy nodes without changing tree expansion.
 * @param {ReferenceGraph} graph
 * @param {string} query
 * @param {{limit?: number}} [options]
 * @returns {TaxonomySearchResult[]}
 */
export function searchTaxonomyNodes(graph, query, options = {}) {
  const normalized = normalizeTaxonomySearchQuery(query);
  if (!normalized) return [];
  const limit = Number.isFinite(options.limit) ? Number(options.limit) : 24;
  return graph.nodes
    .filter(isTaxonomyTreeNode)
    .map((node) => {
      const label = referenceNodeDisplayLabel(graph, node);
      return {
        node,
        label,
        scientificName: node.scientificName || "",
        rank: node.rank || "",
        score: scoreTaxonomyMatch(node, label, normalized),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || compareReferenceNode(a.node, b.node))
    .slice(0, Math.max(0, limit));
}

/**
 * @param {string} query
 * @returns {string}
 */
export function normalizeTaxonomySearchQuery(query) {
  return query.trim().toLocaleLowerCase();
}

/**
 * @param {ReferenceGraph} graph
 * @param {ReferenceNode} node
 * @returns {string}
 */
export function taxonomyDisplayLabel(graph, node) {
  return referenceNodeDisplayLabel(graph, node);
}

/**
 * @param {ReferenceNode|null|undefined} node
 * @returns {boolean}
 */
function isTaxonomyTreeNode(node) {
  return Boolean(node && node.axis === TAXONOMY_AXIS && node.internalOnly !== true);
}

/**
 * @param {ReferenceGraph} graph
 * @param {string} id
 * @param {string[]} pathIds
 * @returns {ReferenceNode[]}
 */
function getTaxonomyChildren(graph, id, pathIds = []) {
  return getReferenceChildren(graph, id).filter(
    (node) => isTaxonomyTreeNode(node) && !pathIds.includes(node.id),
  );
}

/**
 * @param {ReferenceGraph} graph
 * @param {string} id
 * @param {Set<string>} expandedIds
 * @param {TaxonomyTreeRow[]} rows
 * @param {number} depth
 * @param {string[]} pathIds
 */
function appendTaxonomyRows(graph, id, expandedIds, rows, depth, pathIds) {
  if (pathIds.includes(id)) return;
  const node = getReferenceNodeById(graph, id);
  if (!isTaxonomyTreeNode(node)) return;

  const nextPath = [...pathIds, id];
  const children = getTaxonomyChildren(graph, id, nextPath);
  const expanded = expandedIds.has(id);
  rows.push({
    id,
    node,
    depth,
    childCount: children.length,
    expanded,
    pathIds: nextPath,
  });

  if (!expanded) return;
  for (const child of children) {
    appendTaxonomyRows(graph, child.id, expandedIds, rows, depth + 1, nextPath);
  }
}

/**
 * @param {ReferenceGraph} graph
 * @param {string} nodeId
 * @returns {ReferenceNode[]}
 */
function getReferenceDescendantsForTree(graph, nodeId) {
  /** @type {ReferenceNode[]} */
  const descendants = [];
  const seen = new Set([nodeId]);
  const queue = [nodeId];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    for (const child of getTaxonomyChildren(graph, current, [...seen])) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      descendants.push(child);
      queue.push(child.id);
    }
  }
  return descendants;
}

/**
 * @param {ReferenceNode} node
 * @param {string} label
 * @param {string} query
 * @returns {number}
 */
function scoreTaxonomyMatch(node, label, query) {
  const fields = [
    { value: label, exact: 120, prefix: 80, contains: 40 },
    { value: node.scientificName || "", exact: 110, prefix: 75, contains: 35 },
    { value: node.labelEn || "", exact: 90, prefix: 60, contains: 25 },
    { value: node.rank || "", exact: 45, prefix: 28, contains: 12 },
    { value: node.id, exact: 35, prefix: 20, contains: 8 },
  ];
  let best = 0;
  for (const field of fields) {
    const value = field.value.toLocaleLowerCase();
    if (!value) continue;
    if (value === query) best = Math.max(best, field.exact);
    else if (value.startsWith(query)) best = Math.max(best, field.prefix);
    else if (value.includes(query)) best = Math.max(best, field.contains);
  }
  return best;
}

/** @param {string[]} values */
function uniqueStrings(values) {
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()))];
}

/**
 * @param {ReferenceNode} a
 * @param {ReferenceNode} b
 */
function compareReferenceNode(a, b) {
  return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id);
}
