import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it } from "vitest";
import { buildVisitKnowledgeGraph } from "../src/domain/knowledge-graph.js";
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
    region: null,
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
      status: "organized",
      source: "user",
      rotation: 90,
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

async function boot(project = projectFixture(), customRegistry = registry) {
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
  /** @type {Record<string, any>} */
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

  let persisted = structuredClone(project);
  const repository = {
    loadProject: async () => structuredClone(project),
    saveProject: async (next) => { persisted = structuredClone(next); },
    loadPhotoBinary: async () => null,
  };
  await initApp({
    repository: /** @type {any} */ (repository),
    registry: customRegistry,
    lookups: buildLookups(customRegistry),
    analysisProvider: /** @type {any} */ ({ isConnected: () => false }),
    storageStatus: { supported: false, persisted: false, usageBytes: null, quotaBytes: null },
    serviceWorker: { supported: false, applyUpdate: async () => {} },
    referenceData: { graph: { nodes: [], edges: [], metadata: {} } },
  });
  return { dom, getPersisted: () => persisted };
}

afterEach(() => {
  globalThis.window?.close();
  for (const [name, descriptor] of replacedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  replacedGlobals.clear();
});

describe("Relation bulk UI", () => {
  it("saves every selected type and renders every edge distinctly", async () => {
    const { dom, getPersisted } = await boot();
    const { document, Event } = dom.window;

    document.querySelector('[data-step="4"]').click();
    document.querySelector("#addRelationButton").click();
    expect(document.querySelector("#relationTypeSelect")).toBeNull();
    expect([...document.querySelectorAll("[data-relation-type-choice]")].every((input) => input.type === "checkbox")).toBe(true);
    const typeChoiceStyle = dom.window.getComputedStyle(document.querySelector(".relation-type-choice"));
    expect(typeChoiceStyle.gridTemplateColumns).toContain("1fr");
    expect(dom.window.getComputedStyle(document.querySelector(".relation-type-name")).whiteSpace).toBe("nowrap");
    document.querySelector("#chooseRelationTargetButton").click();
    document.querySelector('#relationTargetOptions [data-endpoint-preview="o2"]').click();
    const editorZ = dom.window.getComputedStyle(document.querySelector("#relationEditorModal")).zIndex;
    const photoZ = dom.window.getComputedStyle(document.querySelector("#photoModal")).zIndex;
    const modalOrder = [...document.querySelectorAll(".modal-backdrop")].map((node) => node.id);
    const previewTarget = document.querySelector("#modalObservations .relation-preview-target");
    const previewImageTransform = document.querySelector("#modalImage").style.transform;
    const previewOverlayTransform = document.querySelector("#modalOverlay").style.transform;

    document.querySelector("#choosePreviewRelationButton").click();
    expect(document.querySelector("#relationEditorModal").classList.contains("open")).toBe(true);
    expect(document.querySelector("#photoModal").classList.contains("open")).toBe(false);
    expect(document.querySelector("#photoModal").classList.contains("modal-layer-preview")).toBe(false);
    const selected = ["explains", "part-of", "same-theme"];
    for (const input of document.querySelectorAll("[data-relation-type-choice]")) {
      input.checked = selected.includes(input.dataset.relationTypeChoice);
    }
    document.querySelector("#relationTypeChoices").dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#saveRelationButton").click();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const saved = getPersisted().relations.filter((relation) => relation.sourceId === "o1" && relation.targetId === "o2");
    const graph = buildVisitKnowledgeGraph(getPersisted(), "visit-1", registry);
    const graphEdges = graph.edges.filter((edge) => edge.type === "RELATES_TO" && edge.status === "confirmed");
    const stepFourCount = document.querySelectorAll("#organizeChat .relation-card").length;
    document.querySelector('[data-view="knowledge"]').click();
    const renderedKnowledgeEdges = [...document.querySelectorAll("#knowledgeGraphCanvas .kg-svg-edge.relation")];
    const renderedKnowledgeRelationCount = renderedKnowledgeEdges.length;
    const measurement = {
      selectedTypeCount: selected.length,
      stateRelationCount: saved.length,
      relations: saved.map(({ type, status, sourceId, targetId }) => ({ type, status, sourceId, targetId })),
      stepFourRelevantCount: stepFourCount,
      confirmedGraphEdgeCount: graphEdges.length,
      renderedKnowledgeRelationCount,
      renderedKnowledgeEdgeGeometry: renderedKnowledgeEdges.map((edge) => edge.getAttribute("d")),
      graphEdgeIds: graphEdges.map(({ id, relationId, relationType }) => ({ id, relationId, relationType })),
      modal: { editorZ, photoZ, modalOrder, previewTarget: previewTarget?.textContent, previewImageTransform, previewOverlayTransform },
    };
    expect(saved).toHaveLength(3);
    expect(stepFourCount).toBe(3);
    expect(graphEdges).toHaveLength(3);
    expect(renderedKnowledgeRelationCount).toBe(3);
    expect(new Set(measurement.renderedKnowledgeEdgeGeometry).size).toBe(3);
    expect(document.querySelectorAll("#knowledgeGraphCanvas .kg-svg-edge-label")).toHaveLength(3);
    expect(Number(photoZ)).toBeGreaterThan(Number(editorZ));
    expect(previewTarget?.textContent).toContain("Target");
    expect(previewImageTransform).toContain("rotate(90deg)");
    expect(previewOverlayTransform).toContain("rotate(90deg)");
    expect(document.querySelector("#organizeChat .relation-endpoint img")?.style.transform).toContain("rotate(90deg)");
  });

  it("uses the same scoped candidate filtering when reselecting the relation source", async () => {
    const project = projectFixture();
    project.photos.push({
      id: "photo-2",
      visitId: "visit-1",
      file: "extra.jpg",
      order: 2,
      title: "Extra Photo",
      status: "organized",
      source: "user",
      rotation: 0,
      observations: [
        { ...observation("o3", "Remote Target"), photoId: "photo-2" },
        { ...observation("o4", "Remote Peer"), photoId: "photo-2" },
      ],
    });
    const { dom } = await boot(project);
    const { document } = dom.window;

    document.querySelector('[data-step="4"]').click();
    document.querySelector("#addRelationButton").click();
    document.querySelector('[data-relation-scope="visit"]').click();
    document.querySelector("#chooseRelationTargetButton").click();
    document.querySelector('#relationTargetOptions [data-endpoint-select="o3"]').click();
    document.querySelector("#chooseRelationSourceButton").click();

    const sourceOptions = [...document.querySelectorAll("#relationSourceOptions .endpoint-option")].map((node) => node.dataset.endpointOption);
    expect(sourceOptions).toEqual(["o1", "o2", "o4"]);
    expect(document.querySelector('#relationSourceOptions [data-endpoint-search="source"]')).not.toBeNull();
  });

  it("saves non-duplicate types when the bulk selection contains an existing relation", async () => {
    const project = projectFixture();
    project.relations = [{
      id: "existing-explains",
      sourceId: "o1",
      targetId: "o2",
      type: "explains",
      status: "confirmed",
      confidence: 1,
      origin: "user",
    }];
    const { dom, getPersisted } = await boot(project);
    const { document, Event } = dom.window;

    document.querySelector('[data-step="4"]').click();
    document.querySelector("#addRelationButton").click();
    document.querySelector("#chooseRelationTargetButton").click();
    document.querySelector('#relationTargetOptions [data-endpoint-preview="o2"]').click();
    document.querySelector("#choosePreviewRelationButton").click();
    const selected = ["explains", "part-of", "same-theme"];
    for (const input of document.querySelectorAll("[data-relation-type-choice]")) {
      input.checked = selected.includes(input.dataset.relationTypeChoice);
    }
    document.querySelector("#relationTypeChoices").dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#saveRelationButton").click();
    await new Promise((resolve) => setTimeout(resolve, 300));

    const graph = buildVisitKnowledgeGraph(getPersisted(), "visit-1", registry);
    const result = {
      selectedTypeCount: selected.length,
      persistedRelationCount: getPersisted().relations.length,
      persistedTypes: getPersisted().relations.map((relation) => relation.type),
      stepFourRelevantCount: document.querySelectorAll("#organizeChat .relation-card").length,
      confirmedGraphEdgeCount: graph.edges.filter((edge) => edge.type === "RELATES_TO" && edge.status === "confirmed").length,
      toast: document.querySelector("#toast")?.textContent,
    };
    expect(result.persistedRelationCount).toBe(3);
    expect(result.persistedTypes).toEqual(["explains", "part-of", "same-theme"]);
    expect(result.stepFourRelevantCount).toBe(3);
    expect(result.confirmedGraphEdgeCount).toBe(3);
    expect(result.toast).toContain("2件を保存");
  });

  it("separates direct selection from photo preview and clears preview state on close", async () => {
    const { dom, getPersisted } = await boot();
    const { document } = dom.window;

    document.querySelector('[data-step="4"]').click();
    document.querySelector("#addRelationButton").click();
    document.querySelector("#chooseRelationTargetButton").click();
    document.querySelector('#relationTargetOptions [data-endpoint-select="o2"]').click();
    expect(document.querySelector("#relationTargetCard").textContent).toContain("Target");
    expect(document.querySelector("#photoModal").classList.contains("open")).toBe(false);
    expect(getPersisted().relations).toEqual([]);

    document.querySelector("#chooseRelationTargetButton").click();
    document.querySelector('#relationTargetOptions [data-endpoint-preview="o2"]').click();
    expect(document.querySelector("#photoModal").classList.contains("open")).toBe(true);
    expect(document.querySelector("#modalObservations .relation-preview-target")?.textContent).toContain("Target");
    expect(getPersisted().relations).toEqual([]);
    document.querySelector('[data-close-modal="photoModal"]').click();
    expect(document.querySelector("#photoModal").classList.contains("open")).toBe(false);
    expect(document.querySelector("#photoModal").classList.contains("modal-layer-preview")).toBe(false);

    document.querySelector('[data-view="photos"]').click();
    document.querySelector('[data-photo-id="photo-1"]').click();
    expect(document.querySelector("#choosePreviewRelationButton").classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#modalObservations .relation-preview-target")).toBeNull();
    expect(dom.window.getComputedStyle(document.querySelector("#photoModal")).zIndex).toBe("100");
  });

  it("keeps memo input interaction from reopening or covering the photo modal", async () => {
    const { dom } = await boot();
    const { document, Event, MouseEvent } = dom.window;

    document.querySelector('[data-view="photos"]').click();
    document.querySelector('[data-photo-id="photo-1"]').click();
    expect(document.querySelector("#photoModal").classList.contains("open")).toBe(true);

    const memoInput = document.querySelector("#experienceMemoInput");
    memoInput.dispatchEvent(new Event("focus", { bubbles: true }));
    expect(document.querySelector("#photoModal").classList.contains("open")).toBe(false);

    memoInput.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(document.querySelector("#photoModal").classList.contains("open")).toBe(false);
  });

  it("renders distinct fallback explanations for theme category info buttons", async () => {
    const customRegistry = {
      ...registry,
      packs: [{ id: "paleo", label: "Paleo Pack", icon: "P" }],
      categoriesByPack: {
        paleo: [
          { id: "bone", label: "Bone" },
          { id: "panel", label: "Panel" },
        ],
      },
    };
    const project = projectFixture();
    project.visits[0].domainPackIds = ["paleo"];
    project.photos[0].observations[0].domainPacks = ["paleo"];
    const { dom } = await boot(project, customRegistry);
    const { document } = dom.window;

    document.querySelector('[data-step="3"]').click();
    const descriptions = [...document.querySelectorAll('[data-chip-type="domain-category"] [data-chip-info]')].map((node) => node.dataset.chipInfo);
    expect(descriptions).toHaveLength(2);
    expect(new Set(descriptions).size).toBe(2);
    expect(descriptions[0]).toContain("Paleo Pack");
    expect(descriptions[0]).toContain("Bone");
    expect(descriptions[1]).toContain("Panel");
  });

  it("limits Relation editing to one radio-selected type and updates one record", async () => {
    const project = projectFixture();
    project.relations = [{
      id: "existing-explains",
      sourceId: "o1",
      targetId: "o2",
      type: "explains",
      status: "confirmed",
      confidence: 1,
      origin: "user",
    }];
    const { dom, getPersisted } = await boot(project);
    const { document } = dom.window;

    document.querySelector('[data-step="4"]').click();
    document.querySelector('[data-edit-relation="existing-explains"]').click();
    const choices = [...document.querySelectorAll("[data-relation-type-choice]")];
    expect(choices.every((input) => input.type === "radio")).toBe(true);
    expect(choices.filter((input) => input.checked).map((input) => input.dataset.relationTypeChoice)).toEqual(["explains"]);
    document.querySelector('[data-relation-type-choice="part-of"]').click();
    document.querySelector("#saveRelationButton").click();
    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(getPersisted().relations).toEqual([
      expect.objectContaining({ id: "existing-explains", type: "part-of", sourceId: "o1", targetId: "o2", status: "confirmed" }),
    ]);
  });
});
