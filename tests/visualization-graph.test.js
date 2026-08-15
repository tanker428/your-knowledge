import { describe, expect, it } from "vitest";
import { VISUALIZATION_GRAPH_FIXTURE } from "../src/features/knowledge-3d/visualization-graph-fixture.js";
import {
  validateVisualizationGraph,
  VISUALIZATION_GRAPH_SCHEMA_VERSION,
} from "../src/features/knowledge-3d/visualization-graph.js";

describe("VisualizationGraphV1 fixture", () => {
  it("is a valid deterministic VisualizationGraphV1", () => {
    const result = validateVisualizationGraph(VISUALIZATION_GRAPH_FIXTURE);

    expect(result).toEqual({ ok: true, errors: [] });
    expect(VISUALIZATION_GRAPH_FIXTURE.schemaVersion).toBe(VISUALIZATION_GRAPH_SCHEMA_VERSION);
    expect(VISUALIZATION_GRAPH_FIXTURE.metadata).toMatchObject({
      schemaVersion: VISUALIZATION_GRAPH_SCHEMA_VERSION,
      scope: "fixture",
      source: "knowledge-3d-mvp-fixture",
    });
    expect(VISUALIZATION_GRAPH_FIXTURE.nodes.map((node) => node.id)).toEqual(
      [...VISUALIZATION_GRAPH_FIXTURE.nodes.map((node) => node.id)].sort(),
    );
    expect(VISUALIZATION_GRAPH_FIXTURE.edges.map((edge) => edge.id)).toEqual(
      [...VISUALIZATION_GRAPH_FIXTURE.edges.map((edge) => edge.id)].sort(),
    );
  });

  it("covers canonical, fallback, provisional, unresolved, and time cases", () => {
    expect(VISUALIZATION_GRAPH_FIXTURE.nodes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "concept:taxon:fukuiraptor",
          kind: "concept",
          semanticLayer: "conceptual",
          mappingStatus: "canonical",
          referenceIds: ["taxon:fukuiraptor"],
          visitIds: ["visit-a", "visit-b"],
        }),
        expect.objectContaining({
          id: "domain:paleo:theropod",
          kind: "cluster",
          mappingStatus: "domain-fallback",
          domainIds: ["theropod"],
        }),
        expect.objectContaining({
          id: "concept:provisional:entity:e-reconstruction",
          kind: "concept",
          mappingStatus: "provisional",
          entityIds: ["e-reconstruction"],
        }),
        expect.objectContaining({
          id: "concept:unresolved:o-unresolved",
          kind: "concept",
          mappingStatus: "unresolved",
          observationIds: ["o-unresolved"],
        }),
        expect.objectContaining({
          id: "landmark:geo:early-cretaceous",
          kind: "landmark",
          referenceIds: ["geo:early-cretaceous"],
        }),
      ]),
    );
  });

  it("contains typed projection edges for Entity and Observation concept mappings", () => {
    expect(VISUALIZATION_GRAPH_FIXTURE.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "REPRESENTS", sourceReferenceFactId: "rf-represents" }),
        expect.objectContaining({ type: "DEPICTS", sourceReferenceFactId: "rf-depicts" }),
        expect.objectContaining({ type: "SPECIMEN_OF", sourceReferenceFactId: "rf-specimen-of" }),
        expect.objectContaining({ type: "INSTANCE_OF", sourceReferenceFactId: "rf-instance-of" }),
        expect.objectContaining({
          type: "CLASSIFIED_AS",
          sourceId: "experience:observation:o-unresolved",
          targetId: "concept:unresolved:o-unresolved",
          derived: true,
        }),
      ]),
    );
  });

  it("includes known, ranged, and unset body_length measurements", () => {
    const fukuiraptor = VISUALIZATION_GRAPH_FIXTURE.nodes.find((node) => node.id === "concept:taxon:fukuiraptor");
    const fossil = VISUALIZATION_GRAPH_FIXTURE.nodes.find((node) => node.id === "entity:e-fossil");
    const unresolved = VISUALIZATION_GRAPH_FIXTURE.nodes.find((node) => node.id === "concept:unresolved:o-unresolved");

    expect(fukuiraptor?.measurements?.[0]).toMatchObject({
      quantityKind: "body_length",
      valueSI: 4.2,
      unitSI: "m",
    });
    expect(fossil?.measurements?.[0]).toMatchObject({
      quantityKind: "body_length",
      minSI: 4,
      maxSI: 5.5,
      unitSI: "m",
    });
    expect(unresolved?.measurements?.[0]).toMatchObject({
      quantityKind: "body_length",
      valueSI: null,
      minSI: null,
      maxSI: null,
    });
  });
});

describe("validateVisualizationGraph", () => {
  it("detects duplicate ids, dangling edges, unsorted order, and lost provenance", () => {
    const invalid = structuredClone(VISUALIZATION_GRAPH_FIXTURE);
    invalid.nodes = [invalid.nodes[1], { ...invalid.nodes[1] }, invalid.nodes[0]];
    invalid.nodes[0].sourceNodeIds = [];
    invalid.nodes[0].observationIds = [];
    invalid.nodes[0].entityIds = [];
    invalid.nodes[0].visitIds = [];
    invalid.nodes[0].domainIds = [];
    invalid.nodes[0].referenceIds = [];
    const classifiedEdge = VISUALIZATION_GRAPH_FIXTURE.edges.find((edge) => edge.id === "edge:classified-as:o-display-panel:concept:provisional");
    const representsEdge = VISUALIZATION_GRAPH_FIXTURE.edges.find((edge) => edge.id === "edge:represents:e-reconstruction:taxon:fukuiraptor");
    invalid.edges = [
      { ...representsEdge },
      { ...classifiedEdge },
      { ...classifiedEdge },
      {
        ...classifiedEdge,
        id: "edge:dangling",
        sourceId: "missing",
      },
    ];

    const result = validateVisualizationGraph(invalid);

    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        "duplicate node id: concept:provisional:observation:o-display-panel",
        "nodes must be sorted by id",
        "node has no source trace: concept:provisional:observation:o-display-panel",
        "duplicate edge id: edge:classified-as:o-display-panel:concept:provisional",
        "edges must be sorted by id",
        "dangling edge: edge:dangling",
      ]),
    );
  });

  it("rejects measurement confidence outside the 0..1 range", () => {
    const invalid = structuredClone(VISUALIZATION_GRAPH_FIXTURE);
    invalid.nodes[0] = {
      ...invalid.nodes[0],
      measurements: [{
        quantityKind: "body_length",
        valueSI: 4,
        minSI: null,
        maxSI: null,
        unitSI: "m",
        estimated: false,
        confidence: 1.2,
        source: "test",
      }],
    };

    expect(validateVisualizationGraph(invalid)).toMatchObject({
      ok: false,
      errors: expect.arrayContaining([
        `measurement confidence must be between 0 and 1: ${invalid.nodes[0].id}.measurements[0]`,
      ]),
    });
  });
});
