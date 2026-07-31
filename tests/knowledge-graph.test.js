import { describe, expect, it } from "vitest";
import {
  buildQuestionSeeds,
  buildVisitKnowledgeGraph,
  getGraphForActiveVisit,
  getGraphNodesByType,
  getNeighbors,
  getOneHopGraph,
  getOutgoingEdges,
  validateKnowledgeGraph,
} from "../src/domain/knowledge-graph.js";
import { loadActiveVisitKnowledgeGraph } from "../src/repositories/knowledge-graph-service.js";

const registries = {
  genericCategories: [{ id: "display", label: "展示物" }],
  learningRoles: [{ id: "context", label: "文脈" }],
  categoriesByPack: { paleo: [{ id: "theropod", label: "獣脚類", axis: "taxonomy" }] },
};

function project() {
  return {
    id: "p",
    activeVisitId: "v1",
    visits: [{ id: "v1", title: "訪問1", source: "user", domainPackIds: ["paleo"] }, { id: "v2", title: "訪問2", source: "user" }],
    photos: [
      { id: "photo-1", visitId: "v1", title: "展示", order: 1, observations: [{ id: "obs-1", photoId: "photo-1", label: "骨格", observationType: "physical", genericCategories: ["display"], domainCategories: ["theropod"], domainPacks: ["paleo"], learningRoles: ["context"], entityId: "entity-1", status: "confirmed", included: true }] },
      { id: "photo-2", visitId: "v1", title: "説明", order: 2, observations: [{ id: "obs-2", photoId: "photo-2", label: "説明パネル", observationType: "information", genericCategories: [], domainCategories: [], learningRoles: [], entityId: null, status: "confirmed", included: true }] },
      { id: "photo-other", visitId: "v2", title: "別訪問", order: 1, observations: [{ id: "obs-other", photoId: "photo-other", label: "別対象", status: "confirmed", included: true }] },
    ],
    relations: [{ id: "relation-1", sourceId: "obs-2", targetId: "obs-1", type: "explains", directed: true, status: "confirmed", origin: "user", confidence: 1 }, { id: "other-relation", sourceId: "obs-other", targetId: "obs-1", type: "explains", status: "confirmed" }],
    entities: [{ id: "entity-1", name: "対象" }],
    referenceFacts: [{ id: "ref-1", subjectId: "entity-1", predicate: "classifiedAs", value: "theropod", valueType: "entity-reference", sourceType: "curated", status: "verified" }],
    facts: [{ id: "legacy", targetObservationId: "obs-1", label: "旧LearningFact", status: "learned" }],
  };
}

describe("visit knowledge graph foundation", () => {
  it("builds only the active visit and keeps the graph JSON serializable", () => {
    const graph = buildVisitKnowledgeGraph(project(), "v1", registries);
    expect(graph.visitId).toBe("v1");
    expect(getGraphNodesByType(graph, "Photo").map((node) => node.photoId)).toEqual(["photo-1", "photo-2"]);
    expect(graph.nodes.some((node) => node.id.includes("photo-other") || node.id.includes("obs-other"))).toBe(false);
    expect(() => JSON.parse(JSON.stringify(graph))).not.toThrow();
    expect(graph.nodes.some((node) => node.type === "LearningFact" || node.type === "KnowledgeFact" || node.type === "LearningGap")).toBe(false);
  });

  it("creates classification assertions, entities, and reference facts without duplicating entities", () => {
    const graph = buildVisitKnowledgeGraph(project(), "v1", registries);
    expect(getGraphNodesByType(graph, "ClassificationAssertion")).toHaveLength(2);
    expect(getGraphNodesByType(graph, "Entity")).toHaveLength(1);
    expect(getGraphNodesByType(graph, "ReferenceFact")).toHaveLength(1);
    expect(graph.edges.some((edge) => edge.type === "HAS_REFERENCE_FACT")).toBe(true);
  });

  it("preserves directed relations and creates deterministic question seeds", () => {
    const first = buildVisitKnowledgeGraph(project(), "v1", registries);
    const second = buildVisitKnowledgeGraph(project(), "v1", registries);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(getOutgoingEdges(first, "Observation:obs-2").some((edge) => edge.type === "RELATES_TO" && edge.directed === true)).toBe(true);
    expect(buildQuestionSeeds(first).length).toBeGreaterThan(0);
    expect(getGraphNodesByType(first, "QuestionSeed").length).toBe(buildQuestionSeeds(first).length);
  });

  it("provides graph selectors and one-hop projection", () => {
    const graph = getGraphForActiveVisit(project(), registries);
    expect(getNeighbors(graph, "Observation:obs-1").map((node) => node.id)).toContain("Observation:obs-2");
    const oneHop = getOneHopGraph(graph, "Observation:obs-1");
    expect(oneHop.nodes.map((node) => node.id)).toContain("Observation:obs-1");
    expect(oneHop.nodes.map((node) => node.id)).toContain("Observation:obs-2");
    expect(() => validateKnowledgeGraph(oneHop)).not.toThrow();
  });

  it("loads through the existing repository boundary", async () => {
    const graph = await loadActiveVisitKnowledgeGraph({ loadProject: async () => project() }, "default", registries);
    expect(graph.visitId).toBe("v1");
  });
});
