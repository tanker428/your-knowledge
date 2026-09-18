import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildLookups } from "../src/domain/registry.js";
import { initApp } from "../src/ui/app.js";
import { mountKnowledge3dGraph } from "../src/features/knowledge-3d/three-fixture-renderer.js";
import { shareOrDownload } from "../src/features/project/share-file.js";
import { buildExportDocument, documentToProject, validateProjectDocument } from "../src/features/project/project-json.js";

vi.mock("../src/features/knowledge-3d/three-fixture-renderer.js", () => ({
  mountKnowledge3dGraph: vi.fn(async () => ({ updateLayout: vi.fn(), resetCamera: vi.fn(), dispose: vi.fn() })),
  selectMagnitudeNodeRepresentativeObservationId: () => null,
}));
vi.mock("../src/features/project/share-file.js", () => ({ shareOrDownload: vi.fn(async () => "downloaded") }));

const rootUrl = new URL("../", import.meta.url);
const core = JSON.parse(await readFile(new URL("domain/core/vocabulary.json", rootUrl), "utf8"));
const registry = { genericCategories: core.genericCategories, learningRoles: core.learningRoles,
  relationTypes: core.relationTypes, packs: [], categoriesByPack: {}, visitTemplates: [] };
const doms = [];

function fixture(observationCount = 1) {
  return {
    id: "default", schemaVersion: "2.0.0", userId: "user-local", updatedAt: 1, activeVisitId: "v1",
    visits: [{ id: "v1", title: "Museum", placeName: "Museum", createdAt: 1, updatedAt: 1, source: "user", domainPackIds: [] }],
    photos: [{ id: "p1", visitId: "v1", file: "dino.jpg", order: 1, title: "Dinosaur", status: "organized", source: "user",
      observations: Array.from({ length: observationCount + 1 }, (_, index) => ({
        id: `o${index}`, photoId: "p1", label: "Dinosaur", entityId: index === observationCount ? "e2" : "e1",
        observationType: "physical", region: null, genericCategories: [], domainCategories: [],
        domainPacks: [], learningRoles: [], status: "confirmed", included: true,
      })),
    }],
    entities: [{ id: "e1", name: "Dino twelve" }, { id: "e2", name: "Dino six" }],
    referenceFacts: [12, 6].map((value, index) => ({ id: `length-${index}`, subjectId: `e${index + 1}`,
      predicate: "bodyLength", valueType: "quantity", value: { quantityKind: "body_length", valueSI: index ? value : null,
        minSI: index ? null : 10, maxSI: index ? null : 14.4, unitSI: "m", estimated: true },
      status: "verified", sourceType: "curated", sourceNote: "museum-source" })),
    relations: [], facts: [], quizResults: [], learningEvents: [], userKnowledgeStates: [], sourceMetadata: {},
  };
}

async function boot(count = 1) {
  const dom = new JSDOM(await readFile(new URL("index.html", rootUrl), "utf8"), { url: "https://example.test/", pretendToBeVisual: true });
  doms.push(dom);
  for (const key of ["window", "document", "navigator", "location", "history", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "FormData", "File", "Blob"]) vi.stubGlobal(key, dom.window[key]);
  vi.stubGlobal("requestAnimationFrame", (callback) => setTimeout(() => callback(Date.now()), 0));
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  dom.window.scrollTo = () => {};
  dom.window.localStorage.setItem("your-knowledge:tutorial:seen", "seen");
  let saved = fixture(count);
  await initApp({ repository: /** @type {any} */ ({
    loadProject: async () => saved, saveProject: async (value) => { saved = structuredClone(value); }, loadPhotoBinary: async () => null,
  }), registry, lookups: buildLookups(registry), analysisProvider: /** @type {any} */ ({ isConnected: () => false }),
  storageStatus: { supported: false, persisted: false, usageBytes: null, quotaBytes: null },
  serviceWorker: { supported: false, applyUpdate: async () => {} }, referenceData: { graph: { nodes: [], edges: [], metadata: {} } } });
  const find = (selector) => dom.window.document.querySelector(selector);
  const input = (selector, value) => { const field = find(selector); field.value = value; field.dispatchEvent(new dom.window.Event("input", { bubbles: true })); };
  find('[data-knowledge3d-mode="magnitude"]').click();
  await Promise.resolve();
  return { dom, find, input, saved: () => saved, flush() { dom.window.dispatchEvent(new dom.window.Event("pagehide")); } };
}

afterEach(async () => {
  for (const dom of doms.splice(0)) { dom.window.dispatchEvent(new dom.window.Event("pagehide")); dom.window.close(); }
  await Promise.resolve();
  vi.unstubAllGlobals(); vi.clearAllMocks();
});

describe("size reproduction in app", () => {
  it("keeps recall drafts/cursors separate and persists, exports and downloads one size TrialResult", async () => {
    const h = await boot();
    expect(h.find("#magnitudeRecallPanelHost").nextElementSibling.id).toBe("magnitudeSizePanelHost");
    h.find('[data-magnitude-recall-start]').click();
    h.input('[data-magnitude-recall-numeric-input]', "3");
    h.find('[data-magnitude-size-start]').click();
    expect(h.find('[data-magnitude-size-submit]').disabled).toBe(true);
    h.input('[data-magnitude-size-numeric-input]', "12");
    const submit = h.find('[data-magnitude-size-submit]'); submit.click(); submit.click();
    expect(h.find('[data-magnitude-recall-numeric-input]').value).toBe("3");
    const result = JSON.parse(h.find('#magnitudeSizePanelHost textarea').value);
    expect(result).toMatchObject({ itemId: "entity:e1", answerValueSI: 12, correctValueSI: 12, correct: true, error: 0, inputMethod: "numeric" });
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    h.flush(); await Promise.resolve();
    expect(h.saved().quizResults).toHaveLength(1);
    expect(h.saved().quizResults[0]).toMatchObject({ quizType: "magnitude-size-reproduction", ...result });
    const exported = buildExportDocument({ project: /** @type {any} */ (h.saved()) });
    expect(validateProjectDocument(exported).ok).toBe(true);
    expect(documentToProject(exported, new Set(), "default").project.quizResults).toEqual(h.saved().quizResults);
    h.find('[data-magnitude-size-download]').click(); await Promise.resolve();
    expect(shareOrDownload).toHaveBeenCalledOnce();
    expect(vi.mocked(shareOrDownload).mock.calls[0][1]).toContain("magnitude-size-entity:e1-");
    const blob = vi.mocked(shareOrDownload).mock.calls[0][0];
    const reader = new h.dom.window.FileReader();
    const text = await new Promise((resolve) => { reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
    expect(JSON.parse(String(text))).toEqual(result);
    h.find('[data-magnitude-size-next]').click();
    expect(h.find('#magnitudeSizePanelHost').textContent).toContain("Dino six");
    expect(h.find('#magnitudeRecallPanelHost').textContent).toContain("Dino twelve");
    h.find('[data-magnitude-size-start]').click();
    expect(h.find('[data-magnitude-size-numeric-input]').value).toBe("");
    expect(h.find('[data-magnitude-size-submit]').disabled).toBe(true);
    h.find('[data-knowledge-display-mode="2d"]').click();
    expect(h.find('#magnitudeSizePanelHost')).toBeNull();
  });

  it.each([1, 8])("scores the same with %i observations, camera resets and changed selection", async (count) => {
    const h = await boot(count);
    h.find('[data-magnitude-size-start]').click();
    h.input('[data-magnitude-size-numeric-input]', "14");
    h.find('[data-knowledge3d-reset-camera]').click();
    const rendererOptions = vi.mocked(mountKnowledge3dGraph).mock.calls.at(-1)[1];
    rendererOptions.onNodeSelect("entity:e2");
    expect(h.find('[data-magnitude-size-numeric-input]').value).toBe("14");
    h.find('[data-magnitude-size-submit]').click();
    const result = JSON.parse(h.find('#magnitudeSizePanelHost textarea').value);
    expect(result).toMatchObject({ answerValueSI: 14, correctValueSI: 12, correct: true, inputMethod: "numeric" });
    expect(result.error).toBeCloseTo(2 / 12, 12);
  });
});
