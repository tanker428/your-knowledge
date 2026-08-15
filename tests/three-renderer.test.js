import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  mountKnowledge3dFixture,
  mountKnowledge3dGraph,
} from "../src/features/knowledge-3d/three-fixture-renderer.js";
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
  const geometryDispose = vi.fn();
  const materialDispose = vi.fn();

  class Object3D {
    constructor() {
      this.children = [];
      this.position = { set: vi.fn() };
      this.rotation = { y: 0 };
      this.scale = { set: vi.fn() };
      this.userData = {};
    }
    add(child) {
      this.children.push(child);
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
  }

  const THREE = {
    AmbientLight: class extends Object3D {},
    BufferGeometry: Geometry,
    Color: class {},
    DirectionalLight: class extends Object3D {},
    Group: class extends Object3D {},
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
      }
    },
    Scene: class extends Object3D {},
    SphereGeometry: Geometry,
    Vector3: class {},
    WebGLRenderer: class {
      constructor() {
        this.domElement = doc.createElement("canvas");
      }
      setPixelRatio = vi.fn();
      setSize = vi.fn();
      render = vi.fn();
      dispose = rendererDispose;
    },
  };

  return { THREE, rendererDispose, geometryDispose, materialDispose };
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
    expect(fake.rendererDispose).toHaveBeenCalledTimes(1);
    expect(container.children).toHaveLength(0);
  });

  it("mounts real VisualizationGraphV1 data through the graph renderer API", async () => {
    const { jsdom, container } = dom();
    const fake = fakeThree(jsdom.window.document);

    const controller = await mountKnowledge3dGraph(container, {
      graph: {
        schemaVersion: "1.0.0",
        nodes: [{
          id: "concept:test",
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
      },
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
    controller.resetCamera?.();
    controller.updateLayout?.({ mode: "size", selectedNodeId: "concept:test" });
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

  it("detects WebGL availability conservatively", () => {
    expect(isWebGLAvailable({})).toBe(false);
    expect(isWebGLAvailable({ document: dom().jsdom.window.document })).toBe(false);
  });
});
