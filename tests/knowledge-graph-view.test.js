import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { buildVisitKnowledgeGraph } from "../src/domain/knowledge-graph.js";
import { buildKnowledgeGraphView, buildObservationFocusGraph, buildRadialLayout, buildVisitOverviewGraph, expandReferenceGraphNodes, filterGraphByAxis, getKnowledgeGraphNodeDetail, getRadialNodeShape, mergeReferencedReferenceGraph } from "../src/features/knowledge-graph/selectors.js";

const registries = { genericCategories: [{ id: "display", label: "展示物" }], learningRoles: [], categoriesByPack: {} };
const referenceGraph = {
  nodes: [
    { id: "taxon:root", label: "分類根", axis: "taxonomy", kind: "taxonomy", status: "verified", sourceType: "curated", internalOnly: false, visible: true },
    { id: "taxon:child", label: "分類子", axis: "taxonomy", kind: "taxonomy", status: "verified", sourceType: "curated", internalOnly: false, visible: true },
    { id: "taxon:grandchild", label: "分類孫", axis: "taxonomy", kind: "taxonomy", status: "verified", sourceType: "curated", internalOnly: false, visible: true },
    { id: "taxon:greatgrandchild", label: "分類曾孫", axis: "taxonomy", kind: "taxonomy", status: "verified", sourceType: "curated", internalOnly: false, visible: true },
    { id: "geo:period", label: "地質時代", axis: "geological-time", kind: "time", status: "verified", sourceType: "curated", internalOnly: false, visible: true },
    { id: "geo:eon:phanerozoic", label: "顕生代", axis: "geological-time", kind: "time", status: "verified", sourceType: "curated", internalOnly: true, visible: false },
  ],
  edges: [{ id: "subclass", type: "SUBCLASS_OF", sourceId: "taxon:child", targetId: "taxon:root" }, { id: "subclass-grandchild", type: "SUBCLASS_OF", sourceId: "taxon:grandchild", targetId: "taxon:child" }, { id: "subclass-greatgrandchild", type: "SUBCLASS_OF", sourceId: "taxon:greatgrandchild", targetId: "taxon:grandchild" }],
  metadata: {},
};

function project() {
  return {
    activeVisitId: "v1",
    visits: [{ id: "v1", title: "訪問", source: "user" }, { id: "v2", title: "別訪問", source: "user" }],
    photos: [
      { id: "p1", visitId: "v1", title: "写真1", order: 1, observations: [{ id: "o1", photoId: "p1", label: "対象", status: "confirmed", included: true, genericCategories: ["display"], domainCategories: [], learningRoles: [], entityId: "e1" }] },
      { id: "p2", visitId: "v1", title: "写真2", order: 2, observations: [{ id: "o2", photoId: "p2", label: "説明", status: "confirmed", included: true, genericCategories: [], domainCategories: [], learningRoles: [], entityId: null }] },
      { id: "p3", visitId: "v2", title: "別訪問", order: 1, observations: [{ id: "o3", photoId: "p3", label: "別対象", status: "confirmed", included: true, genericCategories: [], domainCategories: [], learningRoles: [], entityId: null }] },
    ],
    relations: [{ id: "r1", sourceId: "o1", targetId: "o2", type: "explains", directed: true, status: "confirmed" }, { id: "r2", sourceId: "o1", targetId: "o3", type: "explains", status: "confirmed" }],
    entities: [{ id: "e1", name: "対象Entity" }],
    referenceFacts: [{ id: "f1", subjectId: "e1", predicate: "classifiedAs", value: "taxon:child", axis: "taxonomy", status: "verified", sourceType: "curated" }, { id: "f-time", targetObservationId: "o1", predicate: "occursDuring", value: "geo:period", axis: "geological-time", status: "verified", sourceType: "curated" }, { id: "f2", targetObservationId: "o1", predicate: "draft", value: "taxon:root", status: "draft", sourceType: "curated" }, { id: "f3", targetObservationId: "o1", predicate: "old", value: "taxon:root", status: "deprecated", sourceType: "curated" }],
  };
}

describe("knowledge graph view selectors", () => {
  it("keeps internal node and edge names out of user-facing graph copy", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain('GenericCategory: "対象の種類"');
    expect(source).toContain('DomainCategory: "テーマ別の分類"');
    expect(source).toContain('LearningRole: "学ぶうえでの役割"');
    expect(source).toContain('ClassificationAssertion: "分類情報"');
    expect(source).toContain('PART_OF: "含まれる時代"');
    expect(source).not.toContain('GenericCategory: "汎用分類"');
  });

  it("builds an active-visit overview with Photo to Observation and Relation", () => {
    const overview = buildKnowledgeGraphView(project(), "v1", registries, referenceGraph).overview;
    expect(overview.nodes.some((node) => node.id === "Photo:p3")).toBe(false);
    expect(overview.nodes.some((node) => node.type === "Visit" && node.visitId === "v1")).toBe(true);
    expect(overview.edges.some((edge) => edge.type === "HAS_OBSERVATION")).toBe(true);
    expect(overview.edges.some((edge) => edge.type === "RELATES_TO" && edge.relationId === "r1")).toBe(true);
    expect(overview.edges.some((edge) => edge.relationId === "r2")).toBe(false);
  });
  it("builds a one-hop focus and includes only verified related ReferenceGraph nodes", () => {
    const graph = buildVisitKnowledgeGraph(project(), "v1", registries);
    const focus = buildObservationFocusGraph(graph, "Observation:o1", referenceGraph);
    expect(focus.nodes.some((node) => node.id === "Observation:o2")).toBe(true);
    expect(focus.nodes.some((node) => node.id === "Reference:taxon:child")).toBe(true);
    expect(focus.nodes.some((node) => node.id === "Reference:geo:eon:phanerozoic")).toBe(false);
    expect(focus.nodes.some((node) => node.id === "Reference:taxon:root")).toBe(true);
    expect(focus.nodes.some((node) => node.id === "Reference:taxon:grandchild")).toBe(true);
    expect(focus.nodes.some((node) => node.id === "Reference:taxon:greatgrandchild")).toBe(false);
    expect(focus.nodes.some((node) => node.type === "ReferenceFact" && ["draft", "deprecated"].includes(node.status))).toBe(false);
    expect(focus.edges.some((edge) => edge.type === "REFERS_TO_REFERENCE" && edge.sourceId === "ReferenceFact: f1".replace(" ", ""))).toBe(true);
  });
  it("filters axes and exposes node detail", () => {
    const graph = buildVisitKnowledgeGraph(project(), "v1", registries);
    const focus = mergeReferencedReferenceGraph(buildObservationFocusGraph(graph, "Observation:o1"), referenceGraph);
    expect(filterGraphByAxis(focus, "taxonomy").nodes.filter((node) => node.type === "ReferenceNode").every((node) => node.axis === "taxonomy")).toBe(true);
    expect(filterGraphByAxis(focus, "geological-time").nodes.filter((node) => node.type === "ReferenceNode").every((node) => node.axis === "geological-time")).toBe(true);
    expect(filterGraphByAxis(focus, "taxonomy").nodes.some((node) => node.referenceFactId === "f-time")).toBe(false);
    expect(filterGraphByAxis(focus, "geological-time").nodes.some((node) => node.referenceFactId === "f1")).toBe(false);
    expect(filterGraphByAxis(focus, "relation").nodes.every((node) => ["User", "Visit", "Photo", "Observation"].includes(node.type))).toBe(true);
    expect(getKnowledgeGraphNodeDetail(focus, "Observation:o1").node.type).toBe("Observation");
  });
  it("returns an empty view for a visit with no observations", () => {
    const empty = { activeVisitId: "empty", visits: [{ id: "empty", title: "空", source: "user" }], photos: [], relations: [] };
    expect(buildKnowledgeGraphView(empty, "empty", registries, referenceGraph).empty).toBe(true);
  });
  it("does not add display state to the saved source graph", () => {
    const view = buildKnowledgeGraphView(project(), "v1", registries, referenceGraph);
    expect(view.source.metadata.includesUiState).toBe(false);
    expect(view.source.nodes.some((node) => "selected" in node || "expanded" in node)).toBe(false);
  });
  it("has a bounded single-column layout rule for 412px-class screens", async () => {
    const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
    expect(css).toContain("@media(max-width:820px)");
    expect(css).toContain(".knowledge-view-panel{grid-template-columns:1fr}");
  });
  it("builds deterministic radial rings for overview and observation focus", () => {
    const graph = buildVisitKnowledgeGraph(project(), "v1", registries);
    const overview = buildVisitOverviewGraph(graph);
    const overviewLayout = buildRadialLayout(overview, "Visit:v1");
    expect(overviewLayout.nodes.find((node) => node.id === "Visit:v1")?.ring).toBe(0);
    expect(overviewLayout.nodes.find((node) => node.id === "Photo:p1")?.ring).toBe(1);
    expect(overviewLayout.nodes.find((node) => node.id === "Observation:o1")?.ring).toBe(2);
    expect(JSON.stringify(overviewLayout)).toBe(JSON.stringify(buildRadialLayout(overview, "Visit:v1")));
    const focus = buildObservationFocusGraph(graph, "Observation:o1", referenceGraph);
    const focusLayout = buildRadialLayout(focus, "Observation:o1");
    expect(focusLayout.nodes.find((node) => node.id === "Observation:o1")?.ring).toBe(0);
    expect(focusLayout.nodes.some((node) => node.ring === 1)).toBe(true);
  });
  it("expands one ReferenceNode at a time and keeps the graph UI state-free", () => {
    const graph = buildVisitKnowledgeGraph(project(), "v1", registries);
    const focus = buildObservationFocusGraph(graph, "Observation:o1", referenceGraph);
    const collapsed = expandReferenceGraphNodes(focus, referenceGraph, []);
    const expanded = expandReferenceGraphNodes(focus, referenceGraph, ["taxon:grandchild"]);
    expect(collapsed.nodes.some((node) => node.referenceId === "taxon:greatgrandchild")).toBe(false);
    expect(expanded.nodes.some((node) => node.referenceId === "taxon:greatgrandchild")).toBe(true);
    expect(expanded.nodes.some((node) => "selected" in node || "expanded" in node)).toBe(false);
  });
  it("assigns distinct radial shapes and keeps large layouts inside the viewBox", () => {
    expect(new Set([
      getRadialNodeShape({ type: "Visit" }),
      getRadialNodeShape({ type: "Photo" }),
      getRadialNodeShape({ type: "Observation" }),
      getRadialNodeShape({ type: "Entity" }),
      getRadialNodeShape({ type: "ReferenceFact" }),
      getRadialNodeShape({ type: "ReferenceNode", axis: "taxonomy" }),
      getRadialNodeShape({ type: "ReferenceNode", axis: "geological-time" }),
    ]).size).toBe(7);
    const graph = buildVisitKnowledgeGraph(project(), "v1", registries);
    const overview = buildVisitOverviewGraph(graph);
    const layout = buildRadialLayout({ ...overview, nodes: [...overview.nodes, ...Array.from({ length: 30 }, (_, index) => ({ id: `Photo:extra-${index}`, type: "Photo" }))] }, "Visit:v1");
    expect(Math.max(...layout.nodes.map((node) => node.x))).toBeLessThanOrEqual(layout.width / 2 + layout.outerRadius);
    expect(Math.max(...layout.nodes.map((node) => node.y))).toBeLessThanOrEqual(layout.height / 2 + layout.outerRadius);
    expect(layout.width).toBeGreaterThan(760);
  });
  it("does not retain the old LearningFact label in the Knowledge Graph UI", async () => {
    const source = await readFile(new URL("../src/ui/app.js", import.meta.url), "utf8");
    const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
    expect(source).not.toContain("LearningFact");
    expect(index).toContain("Photo ≠ Observation ≠ Entity ≠ ReferenceFact");
    expect(index).not.toContain("Photo ≠ Observation ≠ Entity ≠ LearningFact");
    expect(source).not.toContain("data-kg-toggle-reference");
  });
});
