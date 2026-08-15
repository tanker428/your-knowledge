import { describe, expect, it } from "vitest";
import { buildVisitKnowledgeGraph } from "../src/domain/knowledge-graph.js";
import { buildProjectVisualizationGraph } from "../src/features/knowledge-3d/project-visualization-adapter.js";
import { validateVisualizationGraph } from "../src/features/knowledge-3d/visualization-graph.js";

const referenceGraph = {
  nodes: [
    {
      id: "taxon:shared",
      label: "Shared taxon",
      axis: "taxonomy",
      status: "verified",
      sourceType: "curated",
    },
  ],
};

const registries = {
  categoriesByPack: {
    paleo: [{ id: "theropod", label: "Theropod", axis: "taxonomy" }],
  },
};

function project() {
  return {
    id: "project",
    activeVisitId: "visit-a",
    visits: [
      { id: "visit-a", title: "Visit A", source: "user" },
      { id: "visit-b", title: "Visit B", source: "user" },
    ],
    photos: [
      {
        id: "photo-a",
        visitId: "visit-a",
        observations: [
          {
            id: "o-a",
            label: "Observation A",
            entityId: "e-a",
            domainPacks: ["paleo"],
            domainCategories: ["theropod"],
            status: "confirmed",
            included: true,
          },
          {
            id: "o-unmapped-a",
            label: "Unmapped A",
            entityId: "e-unmapped",
            domainPacks: [],
            domainCategories: [],
            status: "confirmed",
            included: true,
          },
        ],
      },
      {
        id: "photo-b",
        visitId: "visit-b",
        observations: [
          {
            id: "o-b",
            label: "Observation B",
            entityId: "e-b",
            domainPacks: [],
            domainCategories: [],
            status: "confirmed",
            included: true,
          },
          {
            id: "o-unmapped-b",
            label: "Unmapped B",
            entityId: "e-unmapped",
            domainPacks: [],
            domainCategories: [],
            status: "confirmed",
            included: true,
          },
          {
            id: "o-rejected",
            label: "Rejected",
            entityId: "e-rejected",
            domainPacks: [],
            domainCategories: [],
            status: "rejected",
            included: false,
          },
        ],
      },
    ],
    entities: [
      { id: "e-a", name: "Entity A" },
      { id: "e-b", name: "Entity B" },
      { id: "e-unmapped", name: "Unmapped shared entity" },
      { id: "e-rejected", name: "Rejected entity" },
    ],
    relations: [],
    referenceFacts: [
      {
        id: "rf-a",
        subjectId: "e-a",
        predicate: "classifiedAs",
        valueType: "reference",
        value: "taxon:shared",
        axis: "taxonomy",
        status: "verified",
        sourceType: "curated",
      },
      {
        id: "rf-b",
        subjectId: "e-b",
        predicate: "classifiedAs",
        valueType: "reference",
        value: "taxon:shared",
        axis: "taxonomy",
        status: "verified",
        sourceType: "curated",
      },
      {
        id: "rf-rejected",
        subjectId: "e-rejected",
        predicate: "classifiedAs",
        valueType: "reference",
        value: "taxon:shared",
        axis: "taxonomy",
        status: "verified",
        sourceType: "curated",
      },
      {
        id: "rf-shared-body-length",
        subjectReferenceId: "taxon:shared",
        predicate: "bodyLength",
        valueType: "quantity",
        value: {
          quantityKind: "body_length",
          valueSI: 3.6,
          minSI: null,
          maxSI: null,
          unitSI: "m",
          estimated: true,
        },
        confidence: 0.6,
        status: "verified",
        sourceType: "curated",
        sourceNote: "adapter measurement",
      },
    ],
  };
}

describe("buildProjectVisualizationGraph", () => {
  it("aggregates canonical Concepts across all visits by ReferenceNode stable ID", () => {
    const graph = buildProjectVisualizationGraph(project(), referenceGraph, registries, {
      scope: "allVisits",
      createdAt: "2026-08-14T00:00:00.000Z",
    });
    const concept = graph.nodes.find((node) => node.id === "concept:taxon:shared");

    expect(validateVisualizationGraph(graph)).toEqual({ ok: true, errors: [] });
    expect(graph.metadata).toMatchObject({
      scope: "allVisits",
      source: "project-visualization-adapter",
    });
    expect(concept).toMatchObject({
      mappingStatus: "canonical",
      entityIds: ["e-a", "e-b"],
      observationIds: ["o-a", "o-b"],
      visitIds: ["visit-a", "visit-b"],
    });
    expect(concept?.measurements?.[0]).toMatchObject({
      quantityKind: "body_length",
      valueSI: 3.6,
      unitSI: "m",
      source: "adapter measurement",
    });
    expect(concept?.entityIds).not.toContain("e-rejected");
  });

  it("limits activeVisit scope to the current visit", () => {
    const graph = buildProjectVisualizationGraph(project(), referenceGraph, registries, {
      scope: "activeVisit",
      createdAt: "2026-08-14T00:00:00.000Z",
    });
    const concept = graph.nodes.find((node) => node.id === "concept:taxon:shared");

    expect(validateVisualizationGraph(graph)).toEqual({ ok: true, errors: [] });
    expect(graph.metadata.scope).toBe("activeVisit");
    expect(concept).toMatchObject({
      entityIds: ["e-a"],
      observationIds: ["o-a"],
      visitIds: ["visit-a"],
    });
    expect(concept?.measurements?.[0]).toMatchObject({
      quantityKind: "body_length",
      valueSI: 3.6,
    });
    expect(graph.nodes.some((node) => node.observationIds.includes("o-b"))).toBe(false);
  });

  it("does not cross-visit aggregate provisional Concepts", () => {
    const graph = buildProjectVisualizationGraph(project(), referenceGraph, registries, {
      scope: "allVisits",
      createdAt: "2026-08-14T00:00:00.000Z",
    });

    expect(graph.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "concept:provisional:entity:e-unmapped:visit:visit-a",
          mappingStatus: "provisional",
          observationIds: ["o-unmapped-a"],
          visitIds: ["visit-a"],
        }),
        expect.objectContaining({
          id: "concept:provisional:entity:e-unmapped:visit:visit-b",
          mappingStatus: "provisional",
          observationIds: ["o-unmapped-b"],
          visitIds: ["visit-b"],
        }),
      ]),
    );
    expect(graph.nodes.find((node) => node.id === "concept:provisional:entity:e-unmapped")).toBeUndefined();
  });

  it("leaves the existing visit-scoped 2D KnowledgeGraph builder usable", () => {
    const visitGraph = buildVisitKnowledgeGraph(project(), "visit-a", registries);

    expect(visitGraph.visitId).toBe("visit-a");
    expect(visitGraph.nodes.some((node) => node.id.includes("o-b"))).toBe(false);
    expect(visitGraph.nodes.some((node) => node.id === "ReferenceFact:rf-shared-body-length")).toBe(false);
  });
});
