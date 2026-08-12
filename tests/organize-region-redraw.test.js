import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
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
    region: { x: 10, y: 15, w: 25, h: 30 },
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
      src: "/test.jpg",
      thumbSrc: "/test-thumb.jpg",
      rotation: 0,
      observations: [observation("o1", "Source"), observation("o2", "Target")],
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

function installGlobals(window) {
  const globals = ["window", "document", "navigator", "location", "history", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "FormData", "File", "Blob"];
  for (const name of globals) {
    if (!replacedGlobals.has(name)) {
      replacedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    }
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: window[name] });
  }
  const animationGlobals = {
    requestAnimationFrame: (callback) => setTimeout(() => callback(Date.now()), 0),
    cancelAnimationFrame: clearTimeout,
  };
  for (const [name, value] of Object.entries(animationGlobals)) {
    if (!replacedGlobals.has(name)) {
      replacedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    }
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  window.scrollTo = () => {};
  window.confirm = () => true;
}

function instrumentRedrawClickListener(window) {
  const { document } = window;
  const redrawButton = document.querySelector("#redrawObservationRegionButton");
  if (!redrawButton) throw new Error("Missing redraw observation region button");
  const originalAddEventListener = window.EventTarget.prototype.addEventListener;
  let clickBindings = 0;
  const clickInvocations = vi.fn();

  /** @this {EventTarget} @param {string} type @param {EventListenerOrEventListenerObject} listener @param {boolean|AddEventListenerOptions} [options] */
  function addEventListener(type, listener, options) {
    if (this === redrawButton && type === "click" && typeof listener === "function") {
      clickBindings += 1;
      /** @type {EventListener} */
      const wrapped = function (event) {
        clickInvocations();
        return listener.call(event.currentTarget, event);
      };
      return originalAddEventListener.call(this, type, wrapped, options);
    }
    return originalAddEventListener.call(this, type, listener, options);
  }

  Object.defineProperty(window.EventTarget.prototype, "addEventListener", {
    configurable: true,
    writable: true,
    value: addEventListener,
  });

  return {
    clickInvocations,
    getClickBindings: () => clickBindings,
  };
}

async function boot(project = projectFixture()) {
  const [html, css] = await Promise.all([
    readFile(new URL("index.html", rootUrl), "utf8"),
    readFile(new URL("styles.css", rootUrl), "utf8"),
  ]);
  const dom = new JSDOM(html.replace("</head>", `<style>${css}</style></head>`), {
    url: "https://example.test/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  installGlobals(window);
  const listenerProbe = instrumentRedrawClickListener(window);

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
  return { dom, listenerProbe };
}

afterEach(() => {
  globalThis.window?.close();
  for (const [name, descriptor] of replacedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  replacedGlobals.clear();
});

describe("Organize observation region redraw", () => {
  it("keeps one redraw listener after repeated organize renders", async () => {
    const { dom, listenerProbe } = await boot();
    const { document } = dom.window;

    for (let index = 0; index < 3; index += 1) {
      document.querySelector('[data-step="2"]').click();
      document.querySelector('[data-step="1"]').click();
    }

    expect(listenerProbe.getClickBindings()).toBe(1);

    document.querySelector('[data-edit-observation="o1"]').click();
    const redrawButton = document.querySelector("#redrawObservationRegionButton");
    expect(redrawButton.classList.contains("hidden")).toBe(false);

    redrawButton.click();

    expect(listenerProbe.clickInvocations).toHaveBeenCalledOnce();
    expect(document.querySelector("#addObservationModal").classList.contains("open")).toBe(false);
    expect(document.querySelector("#regionDrawingControls")).toBeNull();
    const cancelButton = document.querySelector("#cancelRegionDrawingButton");
    expect(cancelButton.classList.contains("hidden")).toBe(false);

    cancelButton.click();

    expect(cancelButton.classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#addObservationModal").classList.contains("open")).toBe(true);
  });
});
