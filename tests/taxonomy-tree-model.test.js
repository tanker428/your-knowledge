import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  getReferenceGraphByAxis,
  getVisibleReferenceRoots,
  loadReferenceData,
} from "../src/domain/reference-registry.js";
import {
  DEFAULT_TAXONOMY_ROOT_ID,
  expandTaxonomyNodePath,
  getInitialTaxonomyExpandedIds,
  getVisibleTaxonomyRows,
  normalizeTaxonomySearchQuery,
  resolveTaxonomyRootIds,
  searchTaxonomyNodes,
  setTaxonomyNodeExpanded,
} from "../src/features/reference-taxonomy/taxonomy-tree-model.js";

/** @param {URL} url */
const readJson = async (url) =>
  JSON.parse(await readFile(fileURLToPath(url), "utf8"));

function fixtureGraph() {
  return {
    nodes: [
      node("taxon:root", "Tetrapoda", { order: 1 }),
      node("taxon:dinosauria", "Dinosauria", { scientificName: "Dinosauria", order: 1 }),
      node("taxon:mammalia", "Mammalia", { scientificName: "Mammalia", order: 2 }),
      node("taxon:saurischia", "Saurischia", { scientificName: "Saurischia", order: 1 }),
      node("taxon:theropoda", "Theropods", { scientificName: "Theropoda", order: 1 }),
      node("taxon:tyrannosaurus", "Tyrannosaurus", { scientificName: "Tyrannosaurus", rank: "genus", order: 1 }),
      node("taxon:traditional", "Traditional group", { quizEligible: false, order: 3 }),
      node("geo:triassic", "Triassic", { axis: "geological-time", order: 9 }),
      node("taxon:internal", "Internal", { internalOnly: true, order: 10 }),
    ],
    edges: [
      edge("taxon:dinosauria", "taxon:root"),
      edge("taxon:mammalia", "taxon:root"),
      edge("taxon:traditional", "taxon:root"),
      edge("taxon:saurischia", "taxon:dinosauria"),
      edge("taxon:theropoda", "taxon:saurischia"),
      edge("taxon:tyrannosaurus", "taxon:theropoda"),
      edge("taxon:internal", "taxon:root"),
    ],
    metadata: {
      displayRootIdsByAxis: { taxonomy: ["taxon:root"] },
    },
  };
}

/**
 * @param {string} id
 * @param {string} label
 * @param {Partial<import("../src/domain/reference-registry.js").ReferenceNode>} [overrides]
 * @returns {import("../src/domain/reference-registry.js").ReferenceNode}
 */
function node(id, label, overrides = {}) {
  return {
    id,
    label,
    labelEn: overrides.labelEn,
    scientificName: overrides.scientificName,
    kind: "taxonomy",
    axis: overrides.axis || "taxonomy",
    rank: overrides.rank || "clade",
    status: overrides.status || "verified",
    internalOnly: overrides.internalOnly === true,
    externalIds: {},
    sourceType: "curated",
    visible: overrides.visible !== false,
    quizEligible: overrides.quizEligible !== false,
    parentIds: overrides.parentIds || [],
    startMa: null,
    endMa: null,
    order: overrides.order ?? null,
  };
}

/**
 * @param {string} sourceId
 * @param {string} targetId
 * @returns {import("../src/domain/reference-registry.js").ReferenceEdge}
 */
function edge(sourceId, targetId) {
  return {
    id: `edge:${sourceId}:${targetId}`,
    type: "SUBCLASS_OF",
    sourceId,
    targetId,
  };
}

describe("taxonomy tree model", () => {
  it("resolves manifest roots and falls back to Tetrapoda when needed", () => {
    const graph = fixtureGraph();
    expect(resolveTaxonomyRootIds(graph, [graph.nodes[0]])).toEqual(["taxon:root"]);
    expect(resolveTaxonomyRootIds(graph, [])).toEqual(["taxon:root"]);

    graph.nodes.push(node(DEFAULT_TAXONOMY_ROOT_ID, "Tetrapoda fallback"));
    expect(resolveTaxonomyRootIds(graph, [])).toEqual([DEFAULT_TAXONOMY_ROOT_ID]);
  });

  it("builds only visible rows below expanded ancestors", () => {
    const graph = fixtureGraph();
    const expanded = getInitialTaxonomyExpandedIds(graph, ["taxon:root"], 2);
    expect([...expanded].sort()).toEqual(["taxon:dinosauria", "taxon:root"]);

    const rows = getVisibleTaxonomyRows(graph, ["taxon:root"], expanded);
    expect(rows.map((row) => row.id)).toEqual([
      "taxon:root",
      "taxon:dinosauria",
      "taxon:saurischia",
      "taxon:mammalia",
      "taxon:traditional",
    ]);
    expect(rows.find((row) => row.id === "taxon:saurischia")?.childCount).toBe(1);
    expect(rows.some((row) => row.id === "taxon:theropoda")).toBe(false);
    expect(rows.some((row) => row.id === "taxon:internal")).toBe(false);
  });

  it("collapses a branch by clearing descendant expansion state", () => {
    const graph = fixtureGraph();
    const expanded = new Set([
      "taxon:root",
      "taxon:dinosauria",
      "taxon:saurischia",
      "taxon:theropoda",
    ]);

    const next = setTaxonomyNodeExpanded(expanded, graph, "taxon:dinosauria", false);
    expect([...next].sort()).toEqual(["taxon:root"]);
  });

  it("expands ancestors to focus a searched node", () => {
    const graph = fixtureGraph();
    const expanded = expandTaxonomyNodePath(graph, "taxon:tyrannosaurus", new Set());
    expect([...expanded].sort()).toEqual([
      "taxon:dinosauria",
      "taxon:root",
      "taxon:saurischia",
      "taxon:theropoda",
    ]);
    expect(getVisibleTaxonomyRows(graph, ["taxon:root"], expanded).map((row) => row.id)).toContain("taxon:tyrannosaurus");
  });

  it("searches labels, scientific names, ranks, IDs, and display-only groups", () => {
    const graph = fixtureGraph();
    expect(normalizeTaxonomySearchQuery("  THERO  ")).toBe("thero");
    expect(searchTaxonomyNodes(graph, "Theropoda", { limit: 1 })[0].node.id).toBe("taxon:theropoda");
    expect(searchTaxonomyNodes(graph, "genus", { limit: 3 }).map((result) => result.node.id)).toContain("taxon:tyrannosaurus");
    expect(searchTaxonomyNodes(graph, "traditional", { limit: 3 })[0].node.quizEligible).toBe(false);
  });

  it("uses the real reference graph without requiring all taxonomy nodes in the initial DOM projection", async () => {
    const loaded = await loadReferenceData(readJson);
    const graph = getReferenceGraphByAxis(loaded.graph, "taxonomy");
    const rootIds = resolveTaxonomyRootIds(graph, getVisibleReferenceRoots(graph, "taxonomy"));
    const expanded = getInitialTaxonomyExpandedIds(graph, rootIds);
    const rows = getVisibleTaxonomyRows(graph, rootIds, expanded);

    expect(rootIds).toEqual(["taxon:tetrapoda"]);
    expect(rows[0]?.id).toBe("taxon:tetrapoda");
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.length).toBeLessThan(graph.nodes.length);
    expect(searchTaxonomyNodes(graph, "Theropoda", { limit: 5 }).map((result) => result.node.id)).toContain("taxon:theropoda");
  });
});
