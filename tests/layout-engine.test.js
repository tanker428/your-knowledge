import { describe, expect, it } from "vitest";
import { VISUALIZATION_GRAPH_FIXTURE } from "../src/features/knowledge-3d/visualization-graph-fixture.js";
import {
  DEFAULT_SIZE_QUANTITY_KIND,
  homeLayout,
  layoutVisualizationGraph,
  relationLayout,
  SEMANTIC_LAYER_Y,
  sizeLayout,
  SIZE_LAYOUT_SCALE,
  VISUALIZATION_LAYOUT_SCHEMA_VERSION,
} from "../src/features/knowledge-3d/layout-engine.js";

describe("knowledge 3D layout engine", () => {
  it("creates deterministic Home layout with fixed semantic Y layers", () => {
    const first = homeLayout(VISUALIZATION_GRAPH_FIXTURE);
    const second = homeLayout(VISUALIZATION_GRAPH_FIXTURE);

    expect(first.schemaVersion).toBe(VISUALIZATION_LAYOUT_SCHEMA_VERSION);
    expect(first.mode).toBe("home");
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    for (const node of first.nodes) {
      expect(node.y).toBe(SEMANTIC_LAYER_Y[node.semanticLayer]);
    }
  });

  it("creates deterministic Relation layout and preserves edge visual state", () => {
    const layout = relationLayout(VISUALIZATION_GRAPH_FIXTURE);
    const explicit = layout.edges.find((edge) => edge.type === "REPRESENTS");
    const derived = layout.edges.find((edge) => edge.derived);

    expect(JSON.stringify(layout)).toBe(JSON.stringify(relationLayout(VISUALIZATION_GRAPH_FIXTURE)));
    expect(layout.mode).toBe("relation");
    expect(explicit).toMatchObject({
      style: "solid",
      opacity: 0.85,
      width: 1.5,
    });
    expect(derived).toMatchObject({
      style: "dashed",
      opacity: 0.35,
    });
  });

  it("places Size layout nodes on a fixed log scale for body_length", () => {
    const layout = sizeLayout(VISUALIZATION_GRAPH_FIXTURE);
    const concept = layout.nodes.find((node) => node.id === "concept:taxon:fukuiraptor");
    const ranged = layout.nodes.find((node) => node.id === "entity:e-fossil");

    expect(layout.mode).toBe("size");
    expect(layout.metadata.quantityKind).toBe(DEFAULT_SIZE_QUANTITY_KIND);
    expect(concept).toMatchObject({
      zone: "scaled",
      representativeValue: 4.2,
      rangeSI: null,
    });
    expect(concept?.x).toBeCloseTo(Math.log10(4.2) * SIZE_LAYOUT_SCALE, 6);
    expect(ranged).toMatchObject({
      zone: "scaled",
      representativeValue: Math.sqrt(4 * 5.5),
      rangeSI: { minSI: 4, maxSI: 5.5 },
    });
    expect(ranged?.x).toBeCloseTo(Math.log10(Math.sqrt(4 * 5.5)) * SIZE_LAYOUT_SCALE, 6);
  });

  it("keeps unknown or incompatible measurements in the unset area", () => {
    const graph = structuredClone(VISUALIZATION_GRAPH_FIXTURE);
    graph.nodes.push({
      ...graph.nodes.find((node) => node.id === "concept:taxon:theropoda"),
      id: "concept:test:mass-only",
      referenceIds: ["test:mass-only"],
      measurements: [{
        quantityKind: "body_mass",
        valueSI: 1200,
        minSI: null,
        maxSI: null,
        unitSI: "kg",
        estimated: true,
        confidence: 0.4,
        source: "test",
      }],
    });
    graph.nodes.push({
      ...graph.nodes.find((node) => node.id === "concept:taxon:theropoda"),
      id: "concept:test:zero",
      referenceIds: ["test:zero"],
      measurements: [{
        quantityKind: "body_length",
        valueSI: 0,
        minSI: null,
        maxSI: null,
        unitSI: "m",
        estimated: true,
        confidence: 0.4,
        source: "test",
      }],
    });

    const layout = sizeLayout(graph);
    const unresolved = layout.nodes.find((node) => node.id === "concept:unresolved:o-unresolved");
    const massOnly = layout.nodes.find((node) => node.id === "concept:test:mass-only");
    const zero = layout.nodes.find((node) => node.id === "concept:test:zero");

    expect(unresolved).toMatchObject({ zone: "unset", representativeValue: null });
    expect(massOnly).toMatchObject({ zone: "unset", representativeValue: null });
    expect(zero).toMatchObject({ zone: "unset", representativeValue: null });
    expect(unresolved?.x).toBeGreaterThanOrEqual(layout.metadata.unsetAreaX);
    expect(massOnly?.x).toBeGreaterThanOrEqual(layout.metadata.unsetAreaX);
    expect(zero?.x).toBeGreaterThanOrEqual(layout.metadata.unsetAreaX);
  });

  it("dispatches layoutVisualizationGraph by mode without mutating the graph", () => {
    const before = JSON.stringify(VISUALIZATION_GRAPH_FIXTURE);

    expect(layoutVisualizationGraph(VISUALIZATION_GRAPH_FIXTURE, { mode: "home" }).mode).toBe("home");
    expect(layoutVisualizationGraph(VISUALIZATION_GRAPH_FIXTURE, { mode: "relation" }).mode).toBe("relation");
    expect(layoutVisualizationGraph(VISUALIZATION_GRAPH_FIXTURE, { mode: "size" }).mode).toBe("size");
    expect(JSON.stringify(VISUALIZATION_GRAPH_FIXTURE)).toBe(before);
  });
});
