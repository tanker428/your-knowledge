import { describe, expect, it } from "vitest";
import {
  buildConceptVisualizationGraph,
  conceptNodeIdForReference,
  landmarkNodeIdForReference,
} from "../src/features/knowledge-3d/concept-resolver.js";
import { validateVisualizationGraph } from "../src/features/knowledge-3d/visualization-graph.js";

const visits = [
  { id: "visit-a", title: "Visit A", source: "user" },
  { id: "visit-b", title: "Visit B", source: "user" },
];

const observations = [
  {
    id: "o-domain",
    visitId: "visit-a",
    label: "Domain-only observation",
    domainPacks: ["paleo"],
    domainCategories: ["theropod"],
    status: "confirmed",
  },
  {
    id: "o-legacy",
    visitId: "visit-a",
    label: "Legacy fact observation",
    domainPacks: ["paleo"],
    domainCategories: ["theropod"],
    status: "confirmed",
  },
  {
    id: "o-missing",
    visitId: "visit-a",
    label: "Missing reference observation",
    domainPacks: [],
    domainCategories: [],
    status: "confirmed",
  },
  {
    id: "o-model-a",
    visitId: "visit-a",
    label: "Model A",
    entityId: "e-model-a",
    domainPacks: ["paleo"],
    domainCategories: ["theropod"],
    status: "confirmed",
  },
  {
    id: "o-model-b",
    visitId: "visit-b",
    label: "Model B",
    entityId: "e-model-b",
    domainPacks: ["paleo"],
    domainCategories: [],
    status: "confirmed",
  },
  {
    id: "o-observation-concept",
    visitId: "visit-a",
    label: "Observation marked concept",
    observationType: "concept",
    domainPacks: [],
    domainCategories: [],
    status: "confirmed",
  },
  {
    id: "o-other",
    visitId: "visit-a",
    label: "Same label other ID",
    entityId: "e-other",
    domainPacks: [],
    domainCategories: [],
    status: "confirmed",
  },
  {
    id: "o-provisional-entity",
    visitId: "visit-a",
    label: "Unmapped entity observation",
    entityId: "e-provisional",
    domainPacks: [],
    domainCategories: [],
    status: "confirmed",
  },
  {
    id: "o-time",
    visitId: "visit-a",
    label: "Time observation",
    domainPacks: [],
    domainCategories: [],
    status: "confirmed",
  },
];

const entities = [
  { id: "e-model-a", name: "Model A entity" },
  { id: "e-model-b", name: "Model B entity" },
  { id: "e-other", name: "Other same-label entity" },
  { id: "e-provisional", name: "Unmapped entity" },
];

const referenceGraph = {
  nodes: [
    {
      id: "geo:barremian",
      label: "Barremian",
      axis: "geological-time",
      startMa: 129.4,
      endMa: 121.4,
      status: "verified",
      sourceType: "curated",
    },
    {
      id: "taxon:shared-a",
      label: "Shared label",
      axis: "taxonomy",
      rank: "genus",
      status: "verified",
      sourceType: "curated",
    },
    {
      id: "taxon:shared-b",
      label: "Shared label",
      axis: "taxonomy",
      rank: "genus",
      status: "verified",
      sourceType: "curated",
    },
  ],
};

const referenceFacts = [
  {
    id: "rf-legacy-no-type",
    targetObservationId: "o-legacy",
    predicate: "classifiedAs",
    value: "taxon:shared-a",
    axis: "taxonomy",
    status: "verified",
    sourceType: "curated",
  },
  {
    id: "rf-missing",
    targetObservationId: "o-missing",
    predicate: "classifiedAs",
    valueType: "reference",
    value: "taxon:missing",
    axis: "taxonomy",
    status: "verified",
    sourceType: "curated",
  },
  {
    id: "rf-missing-other",
    targetObservationId: "o-domain",
    predicate: "classifiedAs",
    valueType: "reference",
    value: "taxon:missing",
    axis: "taxonomy",
    status: "verified",
    sourceType: "curated",
  },
  {
    id: "rf-model-a",
    subjectId: "e-model-a",
    predicate: "represents",
    valueType: "reference",
    value: "taxon:shared-a",
    axis: "taxonomy",
    status: "verified",
    sourceType: "curated",
  },
  {
    id: "rf-model-b",
    subjectId: "e-model-b",
    predicate: "represents",
    valueType: "reference",
    value: "taxon:shared-a",
    axis: "taxonomy",
    status: "verified",
    sourceType: "curated",
  },
  {
    id: "rf-shared-a-body-length",
    subjectReferenceId: "taxon:shared-a",
    predicate: "bodyLength",
    valueType: "quantity",
    value: {
      quantityKind: "body_length",
      valueSI: 4.2,
      minSI: null,
      maxSI: null,
      unitSI: "m",
      estimated: true,
    },
    confidence: 0.8,
    status: "verified",
    sourceType: "curated",
    sourceNote: "test measurement",
  },
  {
    id: "rf-other-same-label",
    subjectId: "e-other",
    predicate: "classifiedAs",
    valueType: "reference",
    value: "taxon:shared-b",
    axis: "taxonomy",
    status: "verified",
    sourceType: "curated",
  },
  {
    id: "rf-time",
    targetObservationId: "o-time",
    predicate: "livedDuring",
    valueType: "reference",
    value: "geo:barremian",
    axis: "geological-time",
    status: "verified",
    sourceType: "curated",
  },
];

const registries = {
  categoriesByPack: {
    paleo: [{ id: "theropod", label: "Theropod", axis: "taxonomy" }],
  },
};

function graph() {
  return buildConceptVisualizationGraph({
    visits,
    observations,
    entities,
    referenceFacts,
    referenceGraph,
    registries,
    scope: "fixture",
    source: "test",
    createdAt: "2026-08-14T00:00:00.000Z",
  });
}

describe("buildConceptVisualizationGraph", () => {
  it("builds a valid deterministic VisualizationGraphV1", () => {
    const first = graph();
    const second = graph();

    expect(validateVisualizationGraph(first)).toEqual({ ok: true, errors: [] });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("merges canonical taxonomy Concepts only by ReferenceNode stable ID", () => {
    const built = graph();
    const sharedA = built.nodes.find((node) => node.id === conceptNodeIdForReference("taxon:shared-a"));
    const sharedB = built.nodes.find((node) => node.id === conceptNodeIdForReference("taxon:shared-b"));

    expect(sharedA).toMatchObject({
      kind: "concept",
      mappingStatus: "canonical",
      semanticLayer: "conceptual",
      label: "Shared label",
      referenceIds: ["taxon:shared-a"],
      entityIds: ["e-model-a", "e-model-b"],
      visitIds: ["visit-a", "visit-b"],
    });
    expect(sharedA?.observationIds).toEqual(["o-legacy", "o-model-a", "o-model-b"]);
    expect(sharedB).toMatchObject({
      id: "concept:taxon:shared-b",
      label: "Shared label",
      referenceIds: ["taxon:shared-b"],
      entityIds: ["e-other"],
    });
  });

  it("suppresses same-axis DomainCategory fallback when canonical Concept exists", () => {
    const built = graph();
    const fallback = built.nodes.find((node) => node.id === "domain:paleo:theropod");

    expect(fallback).toMatchObject({
      kind: "cluster",
      mappingStatus: "domain-fallback",
      observationIds: ["o-domain"],
      domainIds: ["theropod"],
    });
    expect(fallback?.observationIds).not.toContain("o-model-a");
    expect(fallback?.observationIds).not.toContain("o-legacy");
    expect(built.edges).toContainEqual(
      expect.objectContaining({
        sourceId: "experience:observation:o-domain",
        targetId: "domain:paleo:theropod",
        type: "CLASSIFIED_AS",
        derived: true,
        provenance: expect.objectContaining({ verificationStatus: "suggested" }),
      }),
    );
  });

  it("keeps geological-time as a landmark instead of a Concept", () => {
    const built = graph();

    expect(built.nodes).toContainEqual(
      expect.objectContaining({
        id: landmarkNodeIdForReference("geo:barremian"),
        kind: "landmark",
        mappingStatus: "canonical",
        referenceIds: ["geo:barremian"],
      }),
    );
    expect(built.nodes.find((node) => node.id === "concept:geo:barremian")).toBeUndefined();
    expect(built.edges).toContainEqual(
      expect.objectContaining({
        sourceId: "experience:observation:o-time",
        targetId: "landmark:geo:barremian",
        type: "OCCURS_DURING",
      }),
    );
  });

  it("creates unresolved and provisional nodes without saving persistent Concepts", () => {
    const built = graph();

    expect(built.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "concept:unresolved:taxon%3Amissing",
          mappingStatus: "unresolved",
          observationIds: ["o-domain", "o-missing"],
          referenceIds: ["taxon:missing"],
          sourceNodeIds: ["ReferenceFact:rf-missing", "ReferenceFact:rf-missing-other"],
        }),
        expect.objectContaining({
          id: "concept:provisional:entity:e-provisional",
          mappingStatus: "provisional",
          entityIds: ["e-provisional"],
        }),
        expect.objectContaining({
          id: "concept:provisional:observation:o-observation-concept",
          mappingStatus: "provisional",
          data: expect.objectContaining({ observationType: "concept" }),
        }),
      ]),
    );
    expect(built.nodes.some((node) => node.id === "concept:o-observation-concept")).toBe(false);
  });

  it("aggregates unresolved reference Concepts by reference id rather than by fact id", () => {
    const built = graph();
    const unresolved = built.nodes.filter((node) => node.id === "concept:unresolved:taxon%3Amissing");

    expect(unresolved).toHaveLength(1);
    expect(unresolved[0]).toMatchObject({
      label: "taxon:missing",
      mappingStatus: "unresolved",
      referenceIds: ["taxon:missing"],
      observationIds: ["o-domain", "o-missing"],
      sourceNodeIds: ["ReferenceFact:rf-missing", "ReferenceFact:rf-missing-other"],
      data: expect.objectContaining({
        unresolvedReferenceId: "taxon:missing",
      }),
    });
  });

  it("attaches quantity ReferenceFacts to canonical Concepts through subjectReferenceId", () => {
    const built = graph();
    const sharedA = built.nodes.find((node) => node.id === conceptNodeIdForReference("taxon:shared-a"));
    const sharedB = built.nodes.find((node) => node.id === conceptNodeIdForReference("taxon:shared-b"));

    expect(sharedA?.measurements).toEqual([
      {
        quantityKind: "body_length",
        valueSI: 4.2,
        minSI: null,
        maxSI: null,
        unitSI: "m",
        estimated: true,
        confidence: 0.8,
        source: "test measurement",
      },
    ]);
    expect(sharedA?.sourceNodeIds).toContain("ReferenceFact:rf-shared-a-body-length");
    expect(sharedB?.measurements).toBeUndefined();
  });

  it("uses explicit ReferenceFact predicates and does not auto-generate INSTANCE_OF", () => {
    const built = graph();

    expect(built.edges).toContainEqual(
      expect.objectContaining({
        sourceId: "entity:e-model-a",
        targetId: "concept:taxon:shared-a",
        type: "REPRESENTS",
        derived: false,
        sourceReferenceFactId: "rf-model-a",
      }),
    );
    expect(built.edges.some((edge) => edge.type === "INSTANCE_OF")).toBe(false);
  });
});
