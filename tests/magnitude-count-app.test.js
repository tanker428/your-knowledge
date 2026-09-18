import fs from "node:fs";
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initApp } from "../src/ui/app.js";
import { buildLookups } from "../src/domain/registry.js";
import { VISUALIZATION_GRAPH_FIXTURE } from "../src/features/knowledge-3d/visualization-graph-fixture.js";
import { buildProjectVisualizationGraph } from "../src/features/knowledge-3d/project-visualization-adapter.js";
import { shareOrDownload } from "../src/features/project/share-file.js";
import { BODY_LENGTH_LOG_RECALL_SCALE_ID } from "../src/features/knowledge-3d/magnitude-recall.js";

vi.mock("../src/features/knowledge-3d/project-visualization-adapter.js", () => ({ buildProjectVisualizationGraph: vi.fn() }));
vi.mock("../src/features/knowledge-3d/three-fixture-renderer.js", () => ({
  mountKnowledge3dGraph: vi.fn(async () => ({ dispose() {}, updateLayout() {}, resetCamera() {} })),
  selectMagnitudeNodeRepresentativeObservationId: vi.fn(() => null),
}));
vi.mock("../src/features/project/share-file.js", () => ({ shareOrDownload: vi.fn(async () => "downloaded") }));

const shell = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const core = JSON.parse(fs.readFileSync(new URL("../domain/core/vocabulary.json", import.meta.url), "utf8"));
const registry = { ...core, packs: [], categoriesByPack: {}, visitTemplates: [] };
let dom;
let repository;
let graph;

function node(id, valueSI) {
  return {
    ...VISUALIZATION_GRAPH_FIXTURE.nodes.find((entry) => entry.kind === "concept"),
    id, label: id === "concept:a" ? "恐竜A" : "恐竜B",
    observationIds: [], entityIds: [], referenceIds: [], sourceNodeIds: [], visitIds: [],
    measurements: [{ quantityKind: "body_length", unitSI: "m", valueSI, minSI: valueSI - 1, maxSI: valueSI + 1, estimated: true, source: "count-test-source" }],
  };
}

function get(name) {
  return dom.window.document.querySelector(`[data-magnitude-count-${name}]`);
}

function click(name) {
  const element = get(name);
  expect(element, name).not.toBeNull();
  element.click();
}

function numeric(value) {
  const input = get("numeric-input");
  input.value = value;
  input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
}

function count(times) {
  for (let i = 0; i < times; i += 1) click("increment");
}

function result() {
  return JSON.parse(dom.window.document.querySelector('#magnitudeCountPanelHost textarea').value);
}

async function boot() {
  await initApp({
    repository, registry, lookups: buildLookups(registry),
    analysisProvider: { name: "test", isConnected: () => false, analyze: vi.fn() },
    storageStatus: { supported: false, persisted: false, usageBytes: null, quotaBytes: null },
    serviceWorker: { supported: false, applyUpdate: vi.fn() }, referenceData: { graph: null },
  });
  dom.window.document.querySelector('[data-knowledge3d-scope="allVisits"]').click();
  dom.window.document.querySelector('[data-knowledge3d-mode="magnitude"]').click();
  await Promise.resolve();
}

async function savedProject() {
  dom.window.dispatchEvent(new dom.window.Event("pagehide"));
  await Promise.resolve();
  return structuredClone(repository.saveProject.mock.calls.at(-1)?.[0]);
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-19T00:00:00Z"));
  vi.clearAllMocks();
  dom = new JSDOM(shell, { url: "https://museum.test/", pretendToBeVisual: true });
  for (const key of ["window", "document", "navigator", "localStorage", "location", "history", "HTMLElement", "HTMLInputElement", "AbortController", "requestAnimationFrame", "cancelAnimationFrame"]) {
    vi.stubGlobal(key, dom.window[key]);
  }
  graph = { ...VISUALIZATION_GRAPH_FIXTURE, nodes: [node("concept:a", 12), node("concept:b", 4.2)], edges: [] };
  vi.mocked(buildProjectVisualizationGraph).mockImplementation(() => graph);
  repository = { loadProject: vi.fn(async () => null), saveProject: vi.fn(async () => {}), loadPhotoBinary: vi.fn(async () => null) };
  await boot();
});

afterEach(() => {
  dom.window.close();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("count recall app wiring", () => {
  it.each([12, 11])("scores %i operations for a 12 m item only after explicit confirmation", async (operations) => {
    expect(get("phase").textContent).not.toContain("count-test-source");
    click("start");
    expect(get("submit").disabled).toBe(true);
    expect(get("numeric-input").value).toBe("");
    count(operations);
    expect(get("phase").dataset.magnitudeCountPhase).toBe("answer");
    expect(get("readout").textContent).toContain(`回数：${operations}（${operations} m）`);
    expect(get("submit").disabled).toBe(false);
    click("submit");
    expect(result()).toMatchObject({ count: operations, correctValueSI: 12, restoredValueSI: operations, correct: true, overridden: false, hintUsed: false, inputMethod: "axis-click" });
    const saved = await savedProject();
    expect(saved.quizResults.filter((entry) => entry.quizType === "magnitude-count-recall")).toHaveLength(1);
  });

  it("rejects unanswered, invalid and cleared overrides and never seeds the correct value", async () => {
    click("start");
    const forceSubmit = () => get("submit").dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    forceSubmit();
    click("undo");
    forceSubmit();
    expect(get("submit").disabled).toBe(true);
    for (const value of ["-1", "16", "Infinity", ""]) {
      count(2);
      numeric(value);
      expect(get("submit").disabled).toBe(true);
      forceSubmit();
      expect(get("phase").dataset.magnitudeCountPhase).toBe("answer");
    }
    expect((await savedProject()).quizResults).toHaveLength(0);
    numeric("0");
    expect(get("submit").disabled).toBe(false);
    click("submit");
    expect(result()).toMatchObject({ restoredValueSI: 0, overridden: true, correct: false });
  });

  it("counts one pointer/click or keyboard activation and ignores key repeats and outside taps", () => {
    click("start");
    const area = get("increment");
    for (const name of ["pointerdown", "pointerup", "click"]) {
      area.dispatchEvent(new dom.window.MouseEvent(name, { bubbles: true, button: 0, detail: 1 }));
    }
    const key = (type, repeat = false) => area.dispatchEvent(new dom.window.KeyboardEvent(type, { key: " ", bubbles: true, cancelable: true, repeat }));
    key("keydown");
    key("keydown", true);
    key("keydown");
    area.click(); // Compatibility click must not double count the keyboard event.
    key("keyup");
    area.click();
    dom.window.document.body.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    dom.window.document.body.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(get("readout").textContent).toContain("回数：2（2 m）");
    key("keydown");
    key("keyup");
    expect(get("readout").textContent).toContain("回数：3（3 m）");
    expect(get("increment")).toBe(area); // Draft sync must keep focus and handlers.
    expect(dom.window.document.activeElement).toBe(area);
    click("submit");
    expect(result()).toMatchObject({ count: 3, inputMethod: "keyboard" });
  });

  it("supports rapid taps, Enter, and pointer input after keyboard input", () => {
    click("start");
    const area = get("increment");
    area.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Enter", cancelable: true }));
    area.dispatchEvent(new dom.window.KeyboardEvent("keyup", { key: "Enter", cancelable: true }));
    area.dispatchEvent(new dom.window.MouseEvent("pointerdown", { button: 0 }));
    count(11);
    expect(get("phase").dataset.magnitudeCountPhase).toBe("answer");
    click("submit");
    expect(result()).toMatchObject({ count: 12, inputMethod: "axis-click", correct: true });
  });

  it("undoes one operation, clears override on new operations, and resets to unanswered", () => {
    click("start");
    count(4);
    numeric("4.2");
    click("undo");
    expect(get("numeric-input").value).toBe("");
    expect(get("readout").textContent).toContain("回数：3（3 m）");
    click("reset");
    expect(get("readout").textContent).toContain("回数：0（0 m）");
    expect(get("submit").disabled).toBe(true);
    click("undo");
    expect(get("readout").textContent).toContain("回数：0");
    expect(get("submit").disabled).toBe(true);
    click("increment");
    click("undo");
    click("submit");
    expect(result()).toMatchObject({ count: 0, restoredValueSI: 0, overridden: false });
  });

  it("pauses without losing the draft, blocks inputs, and excludes paused time", () => {
    click("start");
    count(5);
    vi.setSystemTime(new Date("2026-09-19T00:00:02Z"));
    const oldArea = get("increment");
    click("pause");
    expect(get("increment").disabled).toBe(true);
    expect(get("submit").disabled).toBe(true);
    oldArea.click(); // Re-render aborted listeners on the old controls.
    get("increment").dispatchEvent(new dom.window.MouseEvent("click"));
    get("numeric-input").value = "12";
    get("numeric-input").dispatchEvent(new dom.window.Event("input"));
    vi.setSystemTime(new Date("2026-09-19T00:00:12Z"));
    click("pause");
    expect(get("readout").textContent).toContain("回数：5（5 m）");
    expect(get("numeric-input").value).toBe("");
    count(7);
    vi.setSystemTime(new Date("2026-09-19T00:00:13Z"));
    click("submit");
    expect(result()).toMatchObject({ count: 12, elapsedMs: 3000 });
  });

  it("resets for the next item and reaches 4.2 m with an override while recording four operations", () => {
    click("start");
    count(12);
    click("submit");
    click("next");
    expect(get("phase").textContent).toContain("恐竜B");
    expect(get("phase").textContent).not.toContain("4.2 m");
    click("start");
    expect(get("readout").textContent).toContain("回数：0（0 m）");
    expect(get("submit").disabled).toBe(true);
    count(4);
    const input = get("numeric-input");
    input.focus();
    numeric("4.2");
    expect(get("numeric-input")).toBe(input);
    expect(dom.window.document.activeElement).toBe(input);
    click("hint");
    click("submit");
    expect(result()).toMatchObject({ count: 4, restoredValueSI: 4.2, answerValueSI: 4.2, overridden: true, hintUsed: true, inputMethod: "numeric", correct: true, error: 0 });
    click("next");
    click("start");
    expect(get("hint-text").hidden).toBe(true);
    expect(get("numeric-input").value).toBe("");
    expect(get("submit").disabled).toBe(true);
  });

  it("guards double-confirm and persists operation telemetry separately from knowledge progress", async () => {
    const before = await savedProject();
    const recallBefore = dom.window.document.querySelector("#magnitudeRecallPanelHost").innerHTML;
    click("start");
    count(11);
    const submit = get("submit");
    submit.click();
    submit.click();
    const saved = await savedProject();
    expect(saved.quizResults).toHaveLength(before.quizResults.length + 1);
    expect(saved.quizResults.at(-1)).toMatchObject({ quizType: "magnitude-count-recall", count: 11, correct: true });
    expect(saved.quizResults.at(-1)).not.toHaveProperty("score", 11);
    expect(saved.learningEvents).toEqual(before.learningEvents);
    expect(saved.userKnowledgeStates).toEqual(before.userKnowledgeStates);
    expect(saved.facts).toEqual(before.facts);
    expect(dom.window.document.querySelector("#magnitudeRecallPanelHost").innerHTML).toBe(recallBefore);
    // Reload uses the ordinary migration path and must preserve telemetry.
    repository.loadProject.mockResolvedValue(saved);
    dom.window.document.body.innerHTML = new JSDOM(shell).window.document.body.innerHTML;
    await boot();
    const reloaded = await savedProject();
    expect(reloaded.quizResults).toEqual(saved.quizResults);
    expect(reloaded.learningEvents).toEqual(before.learningEvents);
    expect(reloaded.userKnowledgeStates).toEqual(before.userKnowledgeStates);
  });

  it("uses the shared log scale, rejects zero, and keeps metre gauge lengths proportional", () => {
    dom.window.document.querySelector(`[data-magnitude-count-scale="${BODY_LENGTH_LOG_RECALL_SCALE_ID}"]`).click();
    click("start");
    expect(get("phase").textContent).toContain("×10");
    numeric("0");
    expect(get("submit").disabled).toBe(true);
    count(10);
    expect(get("gauge").firstElementChild.style.width).toBe("10%");
    count(10);
    expect(get("gauge").firstElementChild.style.width).toBe("20%");
    numeric("0.1");
    expect(get("submit").disabled).toBe(false);
    click("submit");
    expect(result()).toMatchObject({ scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID, restoredValueSI: 0.1 });
  });

  it("never clamps or snaps an out-of-range count to the scale or correct value", () => {
    click("start");
    count(16);
    expect(get("readout").textContent).toContain("回数：16（16 m）");
    expect(get("submit").disabled).toBe(true);
    click("undo");
    expect(get("submit").disabled).toBe(false);
    click("submit");
    expect(result()).toMatchObject({ count: 15, answerValueSI: 15, correct: false });
  });

  it("ends a draft, disables stale controls, and restarts with zero unanswered", () => {
    click("start");
    count(7);
    const oldArea = get("increment");
    click("end");
    expect(get("phase").textContent).toContain("終了");
    expect(get("increment")).toBeNull();
    oldArea.click();
    click("restart");
    click("start");
    expect(get("readout").textContent).toContain("回数：0（0 m）");
    expect(get("submit").disabled).toBe(true);
  });

  it("downloads the extended result with shareOrDownload and displays a toast", async () => {
    click("start");
    count(12);
    click("submit");
    const expected = result();
    click("download");
    await Promise.resolve();
    const [blob, name] = vi.mocked(shareOrDownload).mock.calls[0];
    expect(JSON.parse(await blob.text())).toEqual(expected);
    expect(name).toMatch(/^magnitude-count-.*\.json$/);
    expect(dom.window.document.querySelector("#toast").textContent).toContain("書き出しました");
  });

  it("pauses when leaving magnitude mode and does not multiply listeners on re-entry", () => {
    click("start");
    count(3);
    const oldArea = get("increment");
    dom.window.document.querySelector('[data-knowledge3d-mode="home"]').click();
    oldArea.click();
    dom.window.document.querySelector('[data-knowledge3d-mode="magnitude"]').click();
    expect(get("increment").disabled).toBe(true);
    click("pause");
    click("increment");
    expect(get("readout").textContent).toContain("回数：4（4 m）");
    dom.window.document.querySelector('[data-knowledge3d-magnitude-axis="time"]').click();
    click("increment");
    expect(get("readout").textContent).toContain("回数：5（5 m）");
  });

  it("chooses an answerable shared scale for a larger next item and handles missing measurements", () => {
    graph.nodes[1].measurements[0].valueSI = 30;
    click("start");
    count(12);
    click("submit");
    click("next");
    expect(get("phase").textContent).toContain("対数目盛");
    click("start");
    count(30);
    click("submit");
    expect(result()).toMatchObject({ count: 30, correct: true, scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID });
    graph.nodes.forEach((entry) => { entry.measurements = []; });
    dom.window.document.querySelector('[data-knowledge3d-mode="magnitude"]').click();
    expect(dom.window.document.querySelector("#magnitudeCountPanelHost").textContent).toContain("問題がありません");
  });
});
