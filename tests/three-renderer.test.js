import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  mountKnowledge3dFixture,
  mountKnowledge3dGraph,
} from "../src/features/knowledge-3d/three-fixture-renderer.js";
import { VISUALIZATION_GRAPH_FIXTURE } from "../src/features/knowledge-3d/visualization-graph-fixture.js";
import {
  isWebGLAvailable,
  THREE_MODULE_URL,
  THREE_VERSION,
} from "../src/features/knowledge-3d/three-module.js";

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
      this.scale = { set: vi.fn() };
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
    setFromPoints() {
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
      constructor() {
        super();
        this.aspect = 1;
        this.updateProjectionMatrix = vi.fn();
        this.lookAt = vi.fn();
        cameras.push(this);
      }
    },
    Scene: class extends Object3D {},
    SphereGeometry: Geometry,
    CanvasTexture: class {
      dispose = textureDispose;
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
    Vector3: class {},
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

  return { THREE, cameras, rendererDispose, renderListsDispose, forceContextLoss, geometryDispose, materialDispose, textureDispose, groups, sprites };
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

describe("Three.js fixture renderer", () => {
  it("keeps Three.js as a fixed vendored lazy module", () => {
    expect(THREE_VERSION).toBe("0.185.1");
    expect(THREE_MODULE_URL.href).toContain("/src/vendor/three/0.185.1/three.module.js");
    expect(fs.existsSync(path.join(root, "src/vendor/three/0.185.1/three.module.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/vendor/three/0.185.1/three.core.js"))).toBe(true);
    expect(fs.existsSync(path.join(root, "src/vendor/three/0.185.1/LICENSE"))).toBe(true);
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
    controller.updateLayout?.({ mode: "home", selectedNodeId: "concept:test" });
    controller.updateLayout?.({ mode: "relation", selectedNodeId: "concept:test" });
    controller.updateLayout?.({ mode: "time", selectedNodeId: "concept:test" });
    controller.updateLayout?.({ mode: "classification", selectedNodeId: "concept:test" });
    controller.updateLayout?.({ mode: "home", selectedNodeId: "concept:test" });
    controller.dispose();
  });

  it("keeps auto rotation off by default and disables it for axis layouts or reduced motion", async () => {
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

  it("keeps Time and Classification static while rendering non-selectable structural guides", async () => {
    const { jsdom, container } = dom();
    enableCanvasLabels(jsdom.window.document);
    const fake = fakeThree(jsdom.window.document);
    const controller = await mountKnowledge3dGraph(container, {
      graph: VISUALIZATION_GRAPH_FIXTURE,
      mode: "time",
      autoRotate: true,
      webglAvailable: true,
      loadThree: async () => fake.THREE,
      runtime: { window: jsdom.window, document: jsdom.window.document },
      requestAnimationFrame: () => 0,
      cancelAnimationFrame: vi.fn(),
    });
    const rootGroup = fake.groups[0];
    const decorationGroup = fake.groups[1];

    expect(rootGroup.rotation.y).toBe(0);
    expect(rootGroup.children.some((child) => child.userData?.nodeId?.startsWith("landmark:"))).toBe(false);
    expect(decorationGroup.children.length).toBeGreaterThan(0);

    controller.updateLayout?.({ mode: "classification", autoRotate: true });
    expect(rootGroup.rotation.y).toBe(0);
    expect(decorationGroup.children.length).toBeGreaterThan(0);
    controller.updateLayout?.({ mode: "home", autoRotate: true });
    controller.dispose();
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

  it("exposes Time and Classification controls through the application UI", () => {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const app = fs.readFileSync(path.join(root, "src/ui/app.js"), "utf8");

    expect(html).toContain('data-knowledge3d-mode="time"');
    expect(html).toContain('data-knowledge3d-mode="classification"');
    expect(app).toContain('time: "Time Layout"');
    expect(app).toContain('classification: "Classification Layout"');
    expect(app).toContain("visualizationNodesForLayout");
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
