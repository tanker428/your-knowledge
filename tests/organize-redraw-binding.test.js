import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { buildLookups } from "../src/domain/registry.js";
import { initApp } from "../src/ui/app.js";

const rootUrl = new URL("../", import.meta.url);
const core = JSON.parse(await readFile(new URL("domain/core/vocabulary.json", rootUrl), "utf8"));
const registry = {
  genericCategories: core.genericCategories,
  learningRoles: core.learningRoles,
  relationTypes: core.relationTypes,
  packs: [],
  categoriesByPack: {},
  visitTemplates: [],
};
const replacedGlobals = new Map();

function observation(id, label) {
  return {
    id,
    photoId: "photo-1",
    label,
    observationType: "physical",
    region: { x: 10, y: 10, w: 30, h: 30 },
    genericCategories: [],
    domainCategories: [],
    domainPacks: [],
    learningRoles: [],
    status: "confirmed",
    included: true,
  };
}

function projectFixture() {
  return {
    id: "default",
    schemaVersion: "2.0.0",
    updatedAt: 1,
    userId: "user-local",
    activeVisitId: "visit-1",
    visits: [{ id: "visit-1", title: "Test Visit", placeName: "Test", createdAt: 1, updatedAt: 1, source: "user", domainPackIds: [] }],
    photos: [{
      id: "photo-1",
      visitId: "visit-1",
      file: "test.jpg",
      order: 1,
      title: "Test Photo",
      status: "in-progress",
      source: "user",
      rotation: 0,
      observations: [observation("o1", "Target")],
    }],
    relations: [],
    facts: [],
    entities: [],
    referenceFacts: [],
    quizResults: [],
    learningEvents: [],
    userKnowledgeStates: [],
    sourceMetadata: {},
  };
}

async function boot() {
  const [html, css] = await Promise.all([
    readFile(new URL("index.html", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8"),
  ]);
  const dom = new JSDOM(html.replace("</head>", `<style>${css}</style></head>`), {
    url: "https://example.test/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  const globals = ["window", "document", "navigator", "location", "history", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "FormData", "File", "Blob"];
  for (const name of globals) {
    if (!replacedGlobals.has(name)) replacedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] });
  }
  const animationGlobals = {
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
  };
  for (const [name, value] of Object.entries(animationGlobals)) {
    if (!replacedGlobals.has(name)) replacedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  window.scrollTo = () => {};
  window.confirm = () => true;

  let redrawListenerAdds = 0;
  const originalAddEventListener = window.EventTarget.prototype.addEventListener;
  window.EventTarget.prototype.addEventListener = function patchedAddEventListener(type, listener, options) {
    if (type === "click" && this?.id === "redrawObservationRegionButton") {
      redrawListenerAdds += 1;
    }
    return originalAddEventListener.call(this, type, listener, options);
  };

  const project = projectFixture();
  const repository = {
    loadProject: async () => structuredClone(project),
    saveProject: async () => {},
    loadPhotoBinary: async () => null,
  };
  await initApp({
    repository: /** @type {any} */ (repository),
    registry,
    lookups: buildLookups(registry),
    analysisProvider: /** @type {any} */ ({ isConnected: () => false }),
    storageStatus: { supported: false, persisted: false, usageBytes: null, quotaBytes: null },
    serviceWorker: { supported: false, applyUpdate: async () => {} },
    referenceData: { graph: { nodes: [], edges: [], metadata: {} } },
  });

  return { dom, getRedrawListenerAdds: () => redrawListenerAdds };
}

afterEach(() => {
  globalThis.window?.close();
  for (const [name, descriptor] of replacedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  replacedGlobals.clear();
});

describe("organize Observation redraw binding", () => {
  it("does not add another redraw handler on every organize render", async () => {
    const { dom, getRedrawListenerAdds } = await boot();
    const { document } = dom.window;

    expect(getRedrawListenerAdds()).toBe(1);

    document.querySelector('[data-step="2"]').click();
    document.querySelector('[data-step="1"]').click();
    document.querySelector("#nextStepButton").click();
    document.querySelector("#previousStepButton").click();

    expect(getRedrawListenerAdds()).toBe(1);
  });
});
