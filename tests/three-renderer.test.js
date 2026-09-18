import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  computeMagnitudeFitCameraPlacement,
  mountKnowledge3dFixture,
  mountKnowledge3dGraph,
  selectMagnitudeNodeRepresentativeObservationId,
} from "../src/features/knowledge-3d/three-fixture-renderer.js";
import {
  isWebGLAvailable,
  THREE_MODULE_URL,
  THREE_VERSION,
} from "../src/features/knowledge-3d/three-module.js";
import { VISUALIZATION_GRAPH_FIXTURE } from "../src/features/knowledge-3d/visualization-graph-fixture.js";
import {
  MAGNITUDE_QUANTITY_BOARD_Z,
  magnitudeLayout,
  SIZE_BOARD_ID,
  TIME_MAGNITUDE_BOARD_ID,
  TIME_MAGNITUDE_BOARD_Z,
} from "../src/features/knowledge-3d/layout-engine.js";
import {
  BODY_LENGTH_LOG_RECALL_SCALE_ID,
  findMagnitudeRecallScale,
} from "../src/features/knowledge-3d/magnitude-recall.js";
import { buildSilhouettePresentationSpec } from "../src/features/knowledge-3d/magnitude-silhouette.js";
import { findBundledSilhouetteAsset } from "../src/features/knowledge-3d/magnitude-silhouette-assets.js";

const LOG_SCALE = findMagnitudeRecallScale(BODY_LENGTH_LOG_RECALL_SCALE_ID);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function dom() {
  const jsdom = new JSDOM("<!doctype html><div id=\"root\"></div>");
  const container = /** @type {HTMLElement} */ (jsdom.window.document.getElementById("root"));
  Object.defineProperty(container, "clientWidth", { value: 640 });
  Object.defineProperty(container, "clientHeight", { value: 420 });
  return { jsdom, container };
}

function fakeThree(doc = document) {
  const rendererDispose = vi.fn();
  const renderListsDispose = vi.fn();
  const forceContextLoss = vi.fn();
  const geometryDispose = vi.fn();
  const materialDispose = vi.fn();
  const textureDispose = vi.fn();
  const groups = [];
  const sprites = [];
  const cameras = [];
  const textureLoadCalls = [];

  class Object3D {
    constructor() {
      this.children = [];
      this.position = {
        x: 0,
        y: 0,
        z: 0,
        set: vi.fn((x, y, z) => {
          this.position.x = x;
          this.position.y = y;
          this.position.z = z;
        }),
      };
      this.rotation = { y: 0 };
      this.scale = {
        x: 1,
        y: 1,
        z: 1,
        set: vi.fn((x, y, z) => {
          this.scale.x = x;
          this.scale.y = y;
          this.scale.z = z;
        }),
      };
      this.userData = {};
    }
    add(child) {
      this.children.push(child);
      child.parent = this;
    }
    remove(child) {
      this.children = this.children.filter((item) => item !== child);
      child.parent = null;
    }
    traverse(callback) {
      callback(this);
      this.children.forEach((child) => child.traverse ? child.traverse(callback) : callback(child));
    }
  }

  class Geometry {
    dispose = geometryDispose;
    setFromPoints(points) {
      this.points = points;
      return this;
    }
  }

  class Material {
    dispose = materialDispose;
    constructor(options = {}) {
      Object.assign(this, options);
    }
  }

  const THREE = {
    AmbientLight: class extends Object3D {},
    BufferGeometry: Geometry,
    Color: class {},
    DirectionalLight: class extends Object3D {},
    Group: class extends Object3D {
      constructor() {
        super();
        groups.push(this);
      }
    },
    Line: class extends Object3D {
      constructor(geometry, material) {
        super();
        this.geometry = geometry;
        this.material = material;
      }
    },
    LineBasicMaterial: Material,
    Mesh: class extends Object3D {
      constructor(geometry, material) {
        super();
        this.geometry = geometry;
        this.material = material;
      }
    },
    MeshStandardMaterial: Material,
    PerspectiveCamera: class extends Object3D {
      constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
        super();
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;
        this.updateProjectionMatrix = vi.fn();
        this.lookAt = vi.fn();
        cameras.push(this);
      }
    },
    Scene: class extends Object3D {},
    SphereGeometry: Geometry,
    CanvasTexture: class {
      dispose = textureDispose;
      constructor(image) {
        this.image = image;
      }
    },
    Sprite: class extends Object3D {
      constructor(material) {
        super();
        this.material = material;
        this.isSprite = true;
        sprites.push(this);
      }
    },
    SpriteMaterial: Material,
    TextureLoader: class {
      load(url, onLoad, onProgress, onError) {
        textureLoadCalls.push({ url, onLoad, onProgress, onError });
      }
    },
    Vector3: class {
      constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
      }
    },
    WebGLRenderer: class {
      constructor() {
        this.domElement = doc.createElement("canvas");
        this.renderLists = { dispose: renderListsDispose };
      }
      setPixelRatio = vi.fn();
      setSize = vi.fn();
      render = vi.fn();
      dispose = rendererDispose;
      forceContextLoss = forceContextLoss;
    },
  };

  return { THREE, cameras, rendererDispose, renderListsDispose, forceContextLoss, geometryDispose, materialDispose, textureDispose, groups, sprites, textureLoadCalls };
}

function enableCanvasLabels(document) {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName, options) => {
    const element = originalCreateElement(tagName, options);
    if (String(tagName).toLowerCase() === "canvas") {
      element.getContext = vi.fn(() => ({
        fillStyle: "",
        font: "",
        textBaseline: "",
        fillRect: vi.fn(),
        fillText: vi.fn(),
      }));
    }
    return element;
  });
}

function singleConceptGraph(id = "concept:test") {
  return {
    schemaVersion: "1.0.0",
    nodes: [{
      id,
      label: "Test concept",
      kind: "concept",
      semanticLayer: "conceptual",
      mappingStatus: "canonical",
      provenance: { verificationStatus: "verified", createdByType: "reference", confidence: 1, sourceType: "reference", sourceNote: null },
      sourceNodeIds: ["ReferenceNode:test"],
      observationIds: [],
      entityIds: [],
      visitIds: [],
      domainIds: [],
      referenceIds: ["test"],
    }],
    edges: [],
    metadata: {
      schemaVersion: "1.0.0",
      scope: "fixture",
      source: "test",
      createdAt: "1970-01-01T00:00:00.000Z",
      mappingStats: { canonical: 1 },
    },
  };
}

function magnitudePhotoGraph(observationIds = ["o-b", "o-a"]) {
  return {
    schemaVersion: "1.0.0",
    nodes: [{
      id: "entity:e-a",
      label: "Entity A",
      kind: "entity",
      semanticLayer: "referent",
      mappingStatus: "canonical",
      provenance: { verificationStatus: "verified", createdByType: "user", confidence: 1, sourceType: "upload", sourceNote: null },
      sourceNodeIds: ["Entity:e-a"],
      observationIds,
      entityIds: ["e-a"],
      visitIds: ["visit-a"],
      domainIds: [],
      referenceIds: [],
      measurements: [{
        quantityKind: "body_length",
        valueSI: 1.8,
        minSI: null,
        maxSI: null,
        unitSI: "m",
        estimated: false,
        confidence: 1,
        source: "test",
      }],
    }],
    edges: [],
    metadata: {
      schemaVersion: "1.0.0",
      scope: "fixture",
      source: "test",
      createdAt: "1970-01-01T00:00:00.000Z",
      mappingStats: { canonical: 1 },
    },
  };
}

function magnitudeSilhouetteGraph(valueSI = 4.2) {
  const graph = magnitudePhotoGraph(["o-a"]);
  const spec = testSilhouetteSpec(valueSI);
  return {
    ...graph,
    metadata: {
      ...graph.metadata,
      magnitudeSilhouettes: {
        schemaVersion: "1.0.0",
        scaleId: LOG_SCALE?.id,
        specs: spec ? [spec] : [],
      },
    },
  };
}

function testSilhouetteSpec(valueSI = 4.2) {
  const asset = findBundledSilhouetteAsset("silhouette:fukuiraptor-side:v1");
  if (!asset || !LOG_SCALE) throw new Error("missing silhouette test asset or scale");
  return buildSilhouettePresentationSpec({
    itemId: "entity:e-a",
    label: "Entity A",
    asset,
    role: "answer",
    valueSI,
    scale: LOG_SCALE,
    drawUnitsPerMeter: 0.4,
  });
}

function installObjectUrlMocks(window) {
  const createObjectURL = vi.fn(() => "blob:thumbnail");
  const revokeObjectURL = vi.fn();
  Object.defineProperty(window.URL, "createObjectURL", {
    value: createObjectURL,
    configurable: true,
  });
  Object.defineProperty(window.URL, "revokeObjectURL", {
    value: revokeObjectURL,
    configurable: true,
  });
  return { createObjectURL, revokeObjectURL };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

function expectPlacementContainsCorners(placement) {
  const view = normalize(testSubtract(placement.target, placement.position));
  const right = normalize(testCross(view, { x: 0, y: 1, z: 0 }));
  const up = normalize(testCross(right, view));
  const verticalFov = placement.verticalFovDegrees * Math.PI / 180;
  const horizontalFov = placement.horizontalFovDegrees * Math.PI / 180;
  for (const corner of placement.corners) {
    const relative = testSubtract(corner, placement.position);
    const depth = testDot(relative, view);
    const x = Math.abs(testDot(relative, right));
    const y = Math.abs(testDot(relative, up));
    expect(depth).toBeGreaterThan(0);
    expect(x).toBeLessThanOrEqual(depth * Math.tan(horizontalFov / 2) + 1e-9);
    expect(y).toBeLessThanOrEqual(depth * Math.tan(verticalFov / 2) + 1e-9);
  }
}

function expectMagnitudeFitHeadOn(placement) {
  const view = normalize(testSubtract(placement.target, placement.position));
  expect(view.x).toBeCloseTo(0, 12);
  expect(view.y).toBeCloseTo(0, 12);
  expect(view.z).toBeCloseTo(-1, 12);
}

function testSubtract(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function testDot(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function testCross(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (!length) throw new Error("zero-length vector");
  return { x: vector.x / length, y: vector.y / length, z: vector.z / length };
}

function expectCameraAtPlacement(camera, placement) {
  expect(camera.position.x).toBeCloseTo(placement.position.x, 5);
  expect(camera.position.y).toBeCloseTo(placement.position.y, 5);
  expect(camera.position.z).toBeCloseTo(placement.position.z, 5);
  expect(camera.lookAt).toHaveBeenLastCalledWith(placement.target.x, placement.target.y, placement.target.z);
}

describe("Three.js fixture renderer", () => {
  it("selects a deterministic representative Observation for magnitude thumbnails", () => {
    const graph = {
      nodes: [
        { id: "entity:e-a", entityIds: ["e-a"], observationIds: ["o-z", "o-a"] },
        { id: "concept:a", entityIds: ["e-a"], observationIds: [] },
      ],
    };

    expect(selectMagnitudeNodeRepresentativeObservationId(graph, {
      observationIds: ["o-c", " o-a ", "", "o-b"],
      entityIds: ["e-a"],
    })).toBe("o-a");
    expect(selectMagnitudeNodeRepresentativeObservationId(graph, graph.nodes[1])).toBe("o-a");
    expect(selectMagnitudeNodeRepresentativeObservationId(graph, {
      observationIds: [],
      entityIds: ["missing"],
    })).toBeNull();
  });

  it("keeps Three.js as a fixed vendored lazy module", () => {
    expect(THREE_VERSION).toBe("0.185.1");
    expect(THREE_MODULE_URL.href).toContain("/src/vendor/three/0.185.1/three.module.js");
    expect(fs.existsSync(path.join(root, "src/vendor/three/0.185.1/three.module.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/vendor/three/0.185.1/three.core.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/vendor/three/0.185.1/LICENSE"))).toBe(true);
  });

  it("computes a magnitude fit camera whose frustum contains board and node bounds", () => {
    const quantityFit = computeMagnitudeFitCameraPlacement(
      magnitudeLayout(VISUALIZATION_GRAPH_FIXTURE),
      { width: 640, height: 420 },
    );
    const timeFit = computeMagnitudeFitCameraPlacement(
      magnitudeLayout(VISUALIZATION_GRAPH_FIXTURE, { magnitudeAxisKind: "time" }),
      { width: 360, height: 640 },
    );

    expect(quantityFit).not.toBeNull();
    expect(timeFit).not.toBeNull();
    expectPlacementContainsCorners(quantityFit);
    expectPlacementContainsCorners(timeFit);
    expectMagnitudeFitHeadOn(quantityFit);
    expectMagnitudeFitHeadOn(timeFit);
    expect(computeMagnitudeFitCameraPlacement(magnitudeLayout(VISUALIZATION_GRAPH_FIXTURE), { width: 0, height: 0 })?.aspect).toBeCloseTo(640 / 420, 6);
  });

  it("includes magnitude silhouette bounds in the front-fit camera frame", () => {
    const graph = magnitudeSilhouetteGraph(12);
    const layout = magnitudeLayout(
      /** @type {import("../src/features/knowledge-3d/visualization-graph.js").VisualizationGraphV1} */ (graph),
    );
    const spec = { ...graph.metadata.magnitudeSilhouettes.specs[0], lane: 8 };
    const plainFit = computeMagnitudeFitCameraPlacement(layout, { width: 640, height: 420 });
    const silhouetteFit = computeMagnitudeFitCameraPlacement(layout, { width: 640, height: 420 }, {
      silhouetteSpecs: [spec],
    });

    expect(plainFit).not.toBeNull();
    expect(silhouetteFit).not.toBeNull();
    expect(silhouetteFit?.bounds.max.y).toBeGreaterThan(plainFit?.bounds.max.y || 0);
    expectPlacementContainsCorners(silhouetteFit);
  });

  it("does not import Three.js when WebGL is unavailable", async () => {
    const { container } = dom();
    const loadThree = vi.fn(async () => fakeThree().THREE);

    const controller = await mountKnowledge3dFixture(container, {
      webglAvailable: false,
      loadThree,
    });

    expect(controller.status).toBe("fallback");
    expect(controller.reason).toBe("webgl-unavailable");
    expect(loadThree).not.toHaveBeenCalled();
    expect(container.querySelector(".knowledge-3d-fallback")?.textContent).toContain("3D preview is unavailable");
    controller.dispose();
    expect(container.children).toHaveLength(0);
  });

  it("shows a fallback when the lazy Three.js module cannot be loaded", async () => {
    const { container } = dom();
    const loadThree = vi.fn(async () => {
      throw new Error("offline");
    });

    const controller = await mountKnowledge3dFixture(container, {
      webglAvailable: true,
      loadThree,
    });

    expect(controller.status).toBe("fallback");
    expect(controller.reason).toBe("three-load-failed");
    expect(loadThree).toHaveBeenCalledTimes(1);
  });

  it("mounts and disposes renderer resources and event listeners", async () => {
    const { jsdom, container } = dom();
    const fake = fakeThree(jsdom.window.document);
    const removeEventListener = vi.spyOn(jsdom.window, "removeEventListener");
    const cancelAnimationFrame = vi.fn();

    const controller = await mountKnowledge3dFixture(container, {
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 7,
      cancelAnimationFrame,
    });

    expect(controller.status).toBe("mounted");
    expect(container.querySelector("canvas")).not.toBeNull();
    controller.dispose();
    expect(cancelAnimationFrame).toHaveBeenCalledWith(7);
    expect(removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(fake.geometryDispose).toHaveBeenCalled();
    expect(fake.materialDispose).toHaveBeenCalled();
    expect(fake.renderListsDispose).toHaveBeenCalledTimes(1);
    expect(fake.forceContextLoss).toHaveBeenCalledTimes(1);
    expect(fake.rendererDispose).toHaveBeenCalledTimes(1);
    expect(container.children).toHaveLength(0);
  });

  it("mounts real VisualizationGraphV1 data through the graph renderer API", async () => {
    const { jsdom, container } = dom();
    const fake = fakeThree(jsdom.window.document);

    const controller = await mountKnowledge3dGraph(container, {
      graph: singleConceptGraph(),
      selectedNodeId: "concept:test",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });

    expect(controller.status).toBe("mounted");
    expect(controller.resetCamera).toEqual(expect.any(Function));
    expect(controller.updateLayout).toEqual(expect.any(Function));
    fake.groups[0].rotation.y = 1.2;
    controller.resetCamera?.();
    expect(fake.groups[0].rotation.y).toBe(0);
    controller.updateLayout?.({ mode: "size", selectedNodeId: "concept:test" });
    controller.updateLayout?.({ mode: "magnitude", selectedNodeId: "concept:test" });
    controller.updateLayout?.({ mode: "home", selectedNodeId: "concept:test" });
    controller.updateLayout?.({ mode: "relation", selectedNodeId: "concept:test" });
    controller.updateLayout?.({ mode: "home", selectedNodeId: "concept:test" });
    controller.dispose();
  });

  it("draws Size mode as a flat board with number-line guides", async () => {
    const { jsdom, container } = dom();
    const fake = fakeThree(jsdom.window.document);

    const controller = await mountKnowledge3dGraph(container, {
      graph: VISUALIZATION_GRAPH_FIXTURE,
      mode: "size",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });
    const rootGroup = fake.groups[0];
    const decorationRoot = fake.groups[1];
    const nodeMeshes = rootGroup.children.filter((child) => child.userData?.nodeId);
    const kinds = decorationRoot.children.map((child) => child.userData?.decorationKind);
    const guidedNodeIds = new Set(
      decorationRoot.children
        .filter((child) => child.userData?.decorationKind === "node-guide")
        .map((child) => child.userData.nodeId),
    );

    expect(new Set(nodeMeshes.map((mesh) => mesh.position.z))).toEqual(new Set([0]));
    expect(kinds).toContain("board-frame");
    expect(kinds).toContain("number-line");
    expect(kinds.filter((kind) => kind === "axis-tick").length).toBeGreaterThanOrEqual(3);
    expect(guidedNodeIds.has("concept:taxon:fukuiraptor")).toBe(true);
    expect(guidedNodeIds.has("entity:e-fossil")).toBe(true);
    controller.dispose();
  });

  it("draws Magnitude mode as one selected board and switches axes through updateLayout", async () => {
    const { jsdom, container } = dom();
    const fake = fakeThree(jsdom.window.document);

    const controller = await mountKnowledge3dGraph(container, {
      graph: VISUALIZATION_GRAPH_FIXTURE,
      mode: "magnitude",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });
    const rootGroup = fake.groups[0];
    const decorationRoot = fake.groups[1];
    const boardIds = new Set(
      decorationRoot.children
        .filter((child) => child.userData?.decorationKind === "board-frame")
        .map((child) => child.userData.boardId),
    );
    const guidedNodeIds = new Set(
      decorationRoot.children
        .filter((child) => child.userData?.decorationKind === "node-guide")
        .map((child) => child.userData.nodeId),
    );
    const zValues = new Set(
      rootGroup.children
        .filter((child) => child.userData?.nodeId)
        .map((child) => child.position.z),
    );

    expect(boardIds).toEqual(new Set([SIZE_BOARD_ID]));
    expect(zValues).toEqual(new Set([MAGNITUDE_QUANTITY_BOARD_Z]));
    expect(guidedNodeIds.has("concept:taxon:fukuiraptor")).toBe(true);
    expect(guidedNodeIds.has("landmark:geo:early-cretaceous")).toBe(false);

    controller.updateLayout?.({
      graph: VISUALIZATION_GRAPH_FIXTURE,
      mode: "magnitude",
      magnitudeAxisKind: "time",
    });

    const switchedBoardIds = new Set(
      decorationRoot.children
        .filter((child) => child.userData?.decorationKind === "board-frame")
        .map((child) => child.userData.boardId),
    );
    const switchedGuidedNodeIds = new Set(
      decorationRoot.children
        .filter((child) => child.userData?.decorationKind === "node-guide")
        .map((child) => child.userData.nodeId),
    );
    const switchedZValues = new Set(
      rootGroup.children
        .filter((child) => child.userData?.nodeId)
        .map((child) => child.position.z),
    );

    expect(switchedBoardIds).toEqual(new Set([TIME_MAGNITUDE_BOARD_ID]));
    expect(switchedZValues).toEqual(new Set([TIME_MAGNITUDE_BOARD_Z]));
    expect(switchedGuidedNodeIds.has("concept:taxon:fukuiraptor")).toBe(false);
    expect(switchedGuidedNodeIds.has("landmark:geo:early-cretaceous")).toBe(true);
    controller.dispose();
  });

  it("fits the Magnitude camera on enter, reset, and axis switch only", async () => {
    const { jsdom, container } = dom();
    const fake = fakeThree(jsdom.window.document);
    const quantityFit = computeMagnitudeFitCameraPlacement(
      magnitudeLayout(VISUALIZATION_GRAPH_FIXTURE),
      { width: 640, height: 420 },
    );
    const timeFit = computeMagnitudeFitCameraPlacement(
      magnitudeLayout(VISUALIZATION_GRAPH_FIXTURE, { magnitudeAxisKind: "time" }),
      { width: 640, height: 420 },
    );
    if (!quantityFit || !timeFit) throw new Error("missing fit placement");

    const controller = await mountKnowledge3dGraph(container, {
      graph: VISUALIZATION_GRAPH_FIXTURE,
      mode: "magnitude",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });

    const camera = fake.cameras[0];
    expectCameraAtPlacement(camera, quantityFit);

    container.dispatchEvent(new jsdom.window.WheelEvent("wheel", { deltaY: -100, cancelable: true }));
    expect(camera.position.z).not.toBeCloseTo(quantityFit.position.z, 5);
    fake.groups[0].rotation.y = 1.2;
    controller.resetCamera?.();
    expect(fake.groups[0].rotation.y).toBe(0);
    expectCameraAtPlacement(camera, quantityFit);

    controller.updateLayout?.({
      graph: VISUALIZATION_GRAPH_FIXTURE,
      mode: "magnitude",
      magnitudeAxisKind: "time",
    });
    expectCameraAtPlacement(camera, timeFit);

    controller.updateLayout?.({
      graph: VISUALIZATION_GRAPH_FIXTURE,
      mode: "home",
    });
    expect(camera.position.x).toBeCloseTo(10, 5);
    expect(camera.position.y).toBeCloseTo(8, 5);
    expect(camera.position.z).toBeCloseTo(14, 5);
    controller.dispose();
  });

  it("renders Magnitude nodes as representative Observation thumbnails", async () => {
    const { jsdom, container } = dom();
    enableCanvasLabels(jsdom.window.document);
    const urls = installObjectUrlMocks(jsdom.window);
    const fake = fakeThree(jsdom.window.document);
    const thumbnailBlob = new Blob(["thumbnail"], { type: "image/jpeg" });
    const loadObservationThumbnail = vi.fn(async () => thumbnailBlob);

    const controller = await mountKnowledge3dGraph(container, {
      graph: magnitudePhotoGraph(),
      mode: "magnitude",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
      loadObservationThumbnail,
    });
    await flushPromises();

    expect(loadObservationThumbnail).toHaveBeenCalledWith("o-a");
    expect(urls.createObjectURL).toHaveBeenCalledWith(thumbnailBlob);
    expect(fake.textureLoadCalls).toHaveLength(1);

    fake.textureLoadCalls[0].onLoad({
      image: { width: 320, height: 240 },
      dispose: fake.textureDispose,
    });

    const rootGroup = fake.groups[0];
    const nodeObject = rootGroup.children.find((child) => child.userData?.nodeId === "entity:e-a");
    expect(nodeObject?.userData.renderMode).toBe("magnitude-thumbnail");
    expect(nodeObject?.children.some((child) => child.userData?.magnitudeThumbnail)).toBe(true);
    expect(nodeObject?.children.some((child) => child.userData?.magnitudeFallback)).toBe(false);
    expect(urls.revokeObjectURL).toHaveBeenCalledWith("blob:thumbnail");

    controller.dispose();
    expect(fake.textureDispose).toHaveBeenCalled();
  });

  it("moves a Magnitude answer marker instantly to the answer value", async () => {
    const { jsdom, container } = dom();
    const fake = fakeThree(jsdom.window.document);
    const initialGraph = magnitudePhotoGraph(["o-a"]);
    const answerGraph = magnitudePhotoGraph(["o-a"]);
    answerGraph.nodes[0].measurements[0].valueSI = 10;

    const controller = await mountKnowledge3dGraph(container, {
      graph: initialGraph,
      mode: "magnitude",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });

    const rootGroup = fake.groups[0];
    const nodeObject = rootGroup.children.find((child) => child.userData?.nodeId === "entity:e-a");
    const answerNode = magnitudeLayout(
      /** @type {import("../src/features/knowledge-3d/visualization-graph.js").VisualizationGraphV1} */ (answerGraph),
    ).nodes.find((node) => node.id === "entity:e-a");
    if (!nodeObject || !answerNode) throw new Error("missing magnitude answer marker");

    controller.updateLayout?.({
      graph: answerGraph,
      mode: "magnitude",
      instant: true,
    });

    expect(nodeObject.position.x).toBeCloseTo(answerNode.x, 12);
    controller.dispose();
  });

  it("renders Magnitude silhouette specs without reloading SVGs during answer updates", async () => {
    const { jsdom, container } = dom();
    enableCanvasLabels(jsdom.window.document);
    const fake = fakeThree(jsdom.window.document);
    const initialGraph = magnitudeSilhouetteGraph(4);
    const answerGraph = magnitudeSilhouetteGraph(8);

    const controller = await mountKnowledge3dGraph(container, {
      graph: initialGraph,
      mode: "magnitude",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });

    expect(fake.textureLoadCalls).toHaveLength(1);
    fake.textureLoadCalls[0].onLoad({
      image: { width: 1200, height: 420 },
      dispose: fake.textureDispose,
    });

    const silhouetteRoot = fake.groups[2];
    const silhouette = silhouetteRoot.children.find((child) => child.userData?.magnitudeSilhouette);
    const image = silhouette?.children.find((child) => child.userData?.magnitudeSilhouetteImage);
    if (!silhouette || !image) throw new Error("missing rendered silhouette");
    const initialWidth = image.scale.x;

    controller.updateLayout?.({
      graph: answerGraph,
      mode: "magnitude",
      instant: true,
    });

    const updatedImage = silhouette.children.find((child) => child.userData?.magnitudeSilhouetteImage);
    expect(fake.textureLoadCalls).toHaveLength(1);
    expect(updatedImage?.scale.x).toBeGreaterThan(initialWidth);
    controller.dispose();
    expect(fake.textureDispose).toHaveBeenCalled();
  });

  it("positions the selected Magnitude label above loaded thumbnails", async () => {
    const { jsdom, container } = dom();
    enableCanvasLabels(jsdom.window.document);
    installObjectUrlMocks(jsdom.window);
    const fake = fakeThree(jsdom.window.document);
    const loadObservationThumbnail = vi.fn(async () => new Blob(["thumbnail"], { type: "image/jpeg" }));

    const controller = await mountKnowledge3dGraph(container, {
      graph: magnitudePhotoGraph(),
      mode: "magnitude",
      selectedNodeId: "entity:e-a",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
      loadObservationThumbnail,
    });
    await flushPromises();

    fake.textureLoadCalls[0].onLoad({
      image: { width: 320, height: 240 },
      dispose: fake.textureDispose,
    });

    const rootGroup = fake.groups[0];
    const nodeObject = rootGroup.children.find((child) => child.userData?.nodeId === "entity:e-a");
    const thumbnail = nodeObject?.children.find((child) => child.userData?.magnitudeThumbnail);
    const selectedLabel = rootGroup.children.find((child) => child.isSprite);
    if (!nodeObject || !thumbnail || !selectedLabel) throw new Error("missing selected thumbnail label test objects");

    const thumbnailTop = nodeObject.position.y + (thumbnail.scale.y * nodeObject.scale.y) / 2;
    const labelBottom = selectedLabel.position.y - selectedLabel.scale.y / 2;
    expect(labelBottom).toBeGreaterThan(thumbnailTop);
    expect(selectedLabel.position.y - nodeObject.position.y).toBeGreaterThan(0.55);

    controller.dispose();
  });

  it("keeps a clear label fallback for Magnitude nodes without a photo", async () => {
    const { jsdom, container } = dom();
    enableCanvasLabels(jsdom.window.document);
    const fake = fakeThree(jsdom.window.document);
    const loadObservationThumbnail = vi.fn(async () => null);

    const controller = await mountKnowledge3dGraph(container, {
      graph: singleConceptGraph("concept:photo-less"),
      mode: "magnitude",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
      loadObservationThumbnail,
    });
    await flushPromises();

    const rootGroup = fake.groups[0];
    const nodeObject = rootGroup.children.find((child) => child.userData?.nodeId === "concept:photo-less");
    const fallback = nodeObject?.children.find((child) => child.userData?.magnitudeFallback);
    expect(loadObservationThumbnail).not.toHaveBeenCalled();
    expect(fallback).toBeTruthy();
    expect(fallback?.children.some((child) => child.userData?.magnitudeFallbackLabel)).toBe(true);

    controller.dispose();
  });

  it("does not apply a Magnitude thumbnail after the scene is disposed", async () => {
    const { jsdom, container } = dom();
    const urls = installObjectUrlMocks(jsdom.window);
    const fake = fakeThree(jsdom.window.document);
    /** @type {(blob: Blob) => void} */
    let resolveThumbnail = () => {};
    const thumbnailPromise = new Promise((resolve) => {
      resolveThumbnail = resolve;
    });
    const loadObservationThumbnail = vi.fn(() => thumbnailPromise);

    const controller = await mountKnowledge3dGraph(container, {
      graph: magnitudePhotoGraph(["o-a"]),
      mode: "magnitude",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
      loadObservationThumbnail,
    });
    await flushPromises();
    controller.dispose();

    resolveThumbnail(new Blob(["thumbnail"], { type: "image/jpeg" }));
    await flushPromises();

    expect(urls.createObjectURL).not.toHaveBeenCalled();
    expect(fake.textureLoadCalls).toHaveLength(0);
  });

  it("keeps auto rotation off by default and disables it for Size or reduced motion", async () => {
    {
      const { jsdom, container } = dom();
      const fake = fakeThree(jsdom.window.document);
      const controller = await mountKnowledge3dGraph(container, {
        graph: singleConceptGraph(),
        webglAvailable: true,
        loadThree: async () => fake.THREE,
        runtime: { window: jsdom.window, document: jsdom.window.document },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: vi.fn(),
      });
      expect(fake.groups[0].rotation.y).toBe(0);
      controller.dispose();
    }

    {
      const { jsdom, container } = dom();
      const fake = fakeThree(jsdom.window.document);
      const controller = await mountKnowledge3dGraph(container, {
        graph: singleConceptGraph(),
        autoRotate: true,
        webglAvailable: true,
        loadThree: async () => fake.THREE,
        runtime: { window: jsdom.window, document: jsdom.window.document },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: vi.fn(),
      });
      expect(fake.groups[0].rotation.y).toBeGreaterThan(0);
      controller.dispose();
    }

    {
      const { jsdom, container } = dom();
      const fake = fakeThree(jsdom.window.document);
      const controller = await mountKnowledge3dGraph(container, {
        graph: singleConceptGraph(),
        mode: "size",
        autoRotate: true,
        webglAvailable: true,
        loadThree: async () => fake.THREE,
        runtime: { window: jsdom.window, document: jsdom.window.document },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: vi.fn(),
      });
      expect(fake.groups[0].rotation.y).toBe(0);
      controller.dispose();
    }

    {
      const { jsdom, container } = dom();
      const fake = fakeThree(jsdom.window.document);
      const controller = await mountKnowledge3dGraph(container, {
        graph: singleConceptGraph(),
        mode: "magnitude",
        autoRotate: true,
        webglAvailable: true,
        loadThree: async () => fake.THREE,
        runtime: { window: jsdom.window, document: jsdom.window.document },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: vi.fn(),
      });
      expect(fake.groups[0].rotation.y).toBe(0);
      controller.dispose();
    }

    {
      const { jsdom, container } = dom();
      jsdom.window.matchMedia = vi.fn(() => ({ matches: true }));
      const fake = fakeThree(jsdom.window.document);
      const controller = await mountKnowledge3dGraph(container, {
        graph: singleConceptGraph(),
        autoRotate: true,
        webglAvailable: true,
        loadThree: async () => fake.THREE,
        runtime: { window: jsdom.window, document: jsdom.window.document },
        requestAnimationFrame: () => 0,
        cancelAnimationFrame: vi.fn(),
      });
      expect(fake.groups[0].rotation.y).toBe(0);
      controller.dispose();
    }
  });

  it("keeps text labels to the selected node only", async () => {
    const { jsdom, container } = dom();
    enableCanvasLabels(jsdom.window.document);
    const fake = fakeThree(jsdom.window.document);
    const graph = {
      schemaVersion: "1.0.0",
      nodes: ["one", "two", "three"].map((id) => ({
        id: `concept:${id}`,
        label: id,
        kind: "concept",
        semanticLayer: "conceptual",
        mappingStatus: "canonical",
        provenance: { verificationStatus: "verified", createdByType: "reference", confidence: 1, sourceType: "reference", sourceNote: null },
        sourceNodeIds: [`ReferenceNode:${id}`],
        observationIds: [],
        entityIds: [],
        visitIds: [],
        domainIds: [],
        referenceIds: [id],
      })),
      edges: [],
      metadata: {
        schemaVersion: "1.0.0",
        scope: "fixture",
        source: "test",
        createdAt: "1970-01-01T00:00:00.000Z",
        mappingStats: { canonical: 3 },
      },
    };

    const controller = await mountKnowledge3dGraph(container, {
      graph,
      selectedNodeId: "concept:one",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });
    const rootGroup = fake.groups[0];

    expect(rootGroup.children.filter((child) => child.isSprite)).toHaveLength(1);
    controller.updateLayout?.({ selectedNodeId: "concept:two" });
    expect(rootGroup.children.filter((child) => child.isSprite)).toHaveLength(1);
    expect(fake.sprites).toHaveLength(2);
    controller.dispose();
  });

  it("documents generated service worker exclusion for lazy Three.js assets", () => {
    const build = fs.readFileSync(path.join(root, "scripts/build.mjs"), "utf8");
    expect(build).toContain("LAZY_SHELL_ASSET_PREFIXES");
    expect(build).toContain("EXTERNAL_URL_WARNING_EXCLUDE_PREFIXES");
    expect(build).toContain("./src/vendor/three/");
    expect(fs.readFileSync(path.join(root, "tsconfig.json"), "utf8")).toContain("\"src/vendor\"");
    expect(fs.readFileSync(path.join(root, "eslint.config.js"), "utf8")).toContain("src/vendor/**");
  });

  it("zooms the camera with the wheel and restores it on camera reset", async () => {
    const { jsdom, container } = dom();
    const fake = fakeThree(jsdom.window.document);

    const controller = await mountKnowledge3dGraph(container, {
      graph: singleConceptGraph(),
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });

    const camera = fake.cameras[0];
    expect(camera.position.x).toBeCloseTo(10, 5);

    const wheel = (deltaY) => container.dispatchEvent(
      new jsdom.window.WheelEvent("wheel", { deltaY, cancelable: true }),
    );

    wheel(-100);
    expect(camera.position.x).toBeLessThan(10);

    wheel(100);
    expect(camera.position.x).toBeCloseTo(10, 5);

    // Zooming past the limit clamps instead of passing through the origin.
    for (let index = 0; index < 40; index += 1) wheel(-100);
    expect(camera.position.x).toBeCloseTo(3.5, 5);
    expect(camera.position.x).toBeGreaterThan(0);

    controller.resetCamera?.();
    expect(camera.position.x).toBeCloseTo(10, 5);
    expect(camera.position.y).toBeCloseTo(8, 5);
    expect(camera.position.z).toBeCloseTo(14, 5);
    controller.dispose();
  });

  it("draws labels on top of nodes and edges", async () => {
    const { jsdom, container } = dom();
    enableCanvasLabels(jsdom.window.document);
    const fake = fakeThree(jsdom.window.document);

    const controller = await mountKnowledge3dGraph(container, {
      graph: singleConceptGraph("concept:label"),
      selectedNodeId: "concept:label",
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });

    expect(fake.sprites.length).toBeGreaterThan(0);
    for (const sprite of fake.sprites) {
      expect(sprite.material.depthTest).toBe(false);
      expect(sprite.material.depthWrite).toBe(false);
      expect(sprite.renderOrder).toBeGreaterThan(0);
    }
    controller.dispose();
  });

  it("detects WebGL availability conservatively", () => {
    expect(isWebGLAvailable({})).toBe(false);
    expect(isWebGLAvailable({ document: dom().jsdom.window.document })).toBe(false);
  });
});
