import { describe, expect, it } from "vitest";
import { VISUALIZATION_GRAPH_FIXTURE } from "../src/features/knowledge-3d/visualization-graph-fixture.js";
import {
  DEFAULT_SIZE_QUANTITY_KIND,
  homeLayout,
  layoutVisualizationGraph,
  relationLayout,
  SEMANTIC_LAYER_Y,
  sizeLayout,
  SIZE_LAYOUT_DEFAULT_UNSET_X,
  SIZE_LAYOUT_SCALE,
  timeLayout,
  visualizationNodesForLayout,
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

  it("keeps node radii compact enough for dense 3D displays", () => {
    const layout = homeLayout(VISUALIZATION_GRAPH_FIXTURE);

    expect(Math.max(...layout.nodes.map((node) => node.radius))).toBeLessThanOrEqual(1.06);
    expect(Math.min(...layout.nodes.map((node) => node.radius))).toBeGreaterThanOrEqual(0.45);
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
    expect(layout.nodes.every((node) => node.id.startsWith("concept:") || node.id.startsWith("entity:"))).toBe(true);
    expect(layout.nodes.some((node) => node.id.startsWith("experience:"))).toBe(false);
    expect(layout.nodes.some((node) => node.id.startsWith("landmark:"))).toBe(false);
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
    expect(layout.metadata.unsetAreaX).toBe(SIZE_LAYOUT_DEFAULT_UNSET_X);
    expect(unresolved?.x).toBe(layout.metadata.unsetAreaX);
    expect(massOnly?.x).toBe(layout.metadata.unsetAreaX);
    expect(zero?.x).toBe(layout.metadata.unsetAreaX);
  });

  it("keeps UI-visible nodes identical to the nodes represented by each layout", () => {
    expect(visualizationNodesForLayout(VISUALIZATION_GRAPH_FIXTURE, { mode: "home" }))
      .toEqual(VISUALIZATION_GRAPH_FIXTURE.nodes);
    const sizeNodes = visualizationNodesForLayout(VISUALIZATION_GRAPH_FIXTURE, { mode: "size" });

    expect(sizeNodes).toHaveLength(sizeLayout(VISUALIZATION_GRAPH_FIXTURE).nodes.length);
    expect(sizeNodes.every((node) => node.kind === "concept" || node.kind === "entity")).toBe(true);
  });

  it("projects subjects to normalized geological intervals and keeps landmarks decorative", () => {
    const template = VISUALIZATION_GRAPH_FIXTURE.nodes.find((node) => node.id === "concept:taxon:theropoda");
    const landmarkTemplate = VISUALIZATION_GRAPH_FIXTURE.nodes.find((node) => node.id === "landmark:geo:barremian");
    const graph = {
      ...VISUALIZATION_GRAPH_FIXTURE,
      nodes: [
        { ...template, id: "concept:reverse", label: "Reverse", referenceIds: ["concept:reverse"] },
        { ...template, id: "concept:zero", label: "Zero", referenceIds: ["concept:zero"] },
        { ...template, id: "concept:unset", label: "Unset", referenceIds: ["concept:unset"] },
        {
          ...landmarkTemplate,
          id: "landmark:reverse",
          label: "Reverse interval",
          referenceIds: ["geo:reverse"],
          data: { referenceAxis: "geological-time", startMa: 66, endMa: 100, timeRole: "interval" },
        },
        {
          ...landmarkTemplate,
          id: "landmark:zero",
          label: "Present",
          referenceIds: ["geo:zero"],
          data: { referenceAxis: "geological-time", startMa: 0, endMa: null, timeRole: "landmark" },
        },
        {
          ...landmarkTemplate,
          id: "landmark:unknown",
          label: "Unknown",
          referenceIds: ["geo:unknown"],
          data: { referenceAxis: "geological-time", startMa: null, endMa: null, timeRole: "landmark" },
        },
        {
          ...landmarkTemplate,
          id: "landmark:wide",
          label: "Wide interval",
          referenceIds: ["geo:wide"],
          data: { referenceAxis: "geological-time", startMa: 200, endMa: 0, timeRole: "interval" },
        },
      ],
      edges: [
        {
          ...VISUALIZATION_GRAPH_FIXTURE.edges[0],
          id: "edge:time:reverse",
          sourceId: "concept:reverse",
          targetId: "landmark:reverse",
          type: "OCCURS_DURING",
        },
        {
          ...VISUALIZATION_GRAPH_FIXTURE.edges[0],
          id: "edge:time:zero",
          sourceId: "concept:zero",
          targetId: "landmark:zero",
          type: "OCCURS_DURING",
        },
        {
          ...VISUALIZATION_GRAPH_FIXTURE.edges[0],
          id: "edge:time:reverse-wide",
          sourceId: "concept:reverse",
          targetId: "landmark:wide",
          type: "OCCURS_DURING",
        },
      ],
    };

    const layout = timeLayout(graph);
    const reverse = layout.nodes.find((node) => node.id === "concept:reverse");
    const zero = layout.nodes.find((node) => node.id === "concept:zero");
    const unset = layout.nodes.find((node) => node.id === "concept:unset");
    const reverseGuide = layout.metadata.timeGuides.find((guide) => guide.referenceId === "geo:reverse");
    const zeroGuide = layout.metadata.timeGuides.find((guide) => guide.referenceId === "geo:zero");

    expect(JSON.stringify(layout)).toBe(JSON.stringify(timeLayout(graph)));
    expect(layout.nodes.some((node) => node.id.startsWith("landmark:"))).toBe(false);
    expect(reverse).toMatchObject({
      zone: "timed",
      timeRangeMa: { kind: "period", startMa: 100, endMa: 66, referenceId: "geo:reverse" },
    });
    expect(reverseGuide.endX).toBeGreaterThan(reverseGuide.startX);
    expect(zero).toMatchObject({
      zone: "timed",
      timeRangeMa: { kind: "point", startMa: 0, endMa: 0, referenceId: "geo:zero" },
    });
    expect(zeroGuide.startX).toBe(zeroGuide.endX);
    expect(unset?.zone).toBe("unset");
    expect(unset?.x).toBe(layout.metadata.unsetAreaX);
  });

  it("dispatches layoutVisualizationGraph by mode without mutating the graph", () => {
    const before = JSON.stringify(VISUALIZATION_GRAPH_FIXTURE);

    expect(layoutVisualizationGraph(VISUALIZATION_GRAPH_FIXTURE, { mode: "home" }).mode).toBe("home");
    expect(layoutVisualizationGraph(VISUALIZATION_GRAPH_FIXTURE, { mode: "relation" }).mode).toBe("relation");
    expect(layoutVisualizationGraph(VISUALIZATION_GRAPH_FIXTURE, { mode: "size" }).mode).toBe("size");
    expect(layoutVisualizationGraph(VISUALIZATION_GRAPH_FIXTURE, { mode: "time" }).mode).toBe("time");
    expect(visualizationNodesForLayout(VISUALIZATION_GRAPH_FIXTURE, { mode: "time" }).some((node) => node.kind === "landmark")).toBe(false);
    expect(JSON.stringify(VISUALIZATION_GRAPH_FIXTURE)).toBe(before);
  });
});
