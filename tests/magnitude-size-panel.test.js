import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BODY_LENGTH_RECALL_SCALES, BODY_LENGTH_LINEAR_RECALL_SCALE_ID, BODY_LENGTH_LOG_RECALL_SCALE_ID,
  canCommitMagnitudeRecallAnswer, commitMagnitudeRecallAnswer, enterMagnitudeRecallAnswerMode,
  findMagnitudeRecallScale, normalizeScaleBoundedValue, startMagnitudeRecallTrial,
  startNextMagnitudeRecallTrial, updateMagnitudeRecallDraftAnswer,
} from "../src/features/knowledge-3d/magnitude-recall.js";
import { buildSizeReproductionAnswer } from "../src/features/knowledge-3d/magnitude-size-reproduction.js";
import { bindMagnitudeSizePanel, renderMagnitudeSizePanel, syncMagnitudeSizeAnswerUi } from "../src/ui/magnitude-size-panel.js";

const linear = findMagnitudeRecallScale(BODY_LENGTH_LINEAR_RECALL_SCALE_ID);
const log = findMagnitudeRecallScale(BODY_LENGTH_LOG_RECALL_SCALE_ID);
/** @type {import('../src/features/knowledge-3d/magnitude-recall.js').MagnitudeRecallItem} */
const item = { itemId: "dino-12", label: "ティラノサウルス", quantityKind: "body_length", unitSI: "m", correctValueSI: 12,
  rangeSI: { minSI: 10, maxSI: 14 }, representativeSource: "value", estimated: true, source: "museum-source",
  observationIds: ["o1"], entityIds: ["e1"], referenceIds: [] };
const doms = [];

function harness(scale = linear, target = item) {
  let session = startMagnitudeRecallTrial({ itemId: target.itemId, scaleId: scale.id, startedAtMs: 1000 });
  let numericValue = "";
  const results = [];
  const dom = new JSDOM('<div id="host"></div>');
  doms.push(dom);
  const root = dom.window.document.getElementById("host");
  const getView = () => ({ scales: BODY_LENGTH_RECALL_SCALES, scale, items: [target], item: target, session,
    canCommit: canCommitMagnitudeRecallAnswer(session), numericValue, resultCount: results.length });
  let dispose = () => {};
  const submit = () => {
    const next = commitMagnitudeRecallAnswer(session, { correctValueSI: target.correctValueSI, rangeSI: target.rangeSI, nowMs: 3500 });
    if (next === session || !next.result) return;
    session = next;
    results.push(next.result);
    render();
  };
  const update = (input, inputMethod, text) => {
    const answer = buildSizeReproductionAnswer({ scale, ...input });
    session = updateMagnitudeRecallDraftAnswer(session, { scale, answerValueSI: answer?.answerValueSI ?? null, inputMethod });
    numericValue = text ?? (answer ? String(Number(answer.answerValueSI.toPrecision(6))) : "");
  };
  const render = () => {
    dispose();
    root.innerHTML = renderMagnitudeSizePanel(getView());
    dispose = bindMagnitudeSizePanel(root, {
      getView, onAnswer: update, onSubmit: submit,
      onStart() { session = enterMagnitudeRecallAnswerMode(session); render(); },
      onScale() {}, onDownload() {},
      onNext() {
        session = startNextMagnitudeRecallTrial(session, { itemId: "next-dino", scaleId: scale.id, startedAtMs: 4000 });
        numericValue = "";
        render();
      },
    });
  };
  render();
  const find = (suffix) => root.querySelector(`[data-magnitude-size-${suffix}]`);
  const input = (suffix, value) => {
    find(suffix).value = value;
    find(suffix).dispatchEvent(new dom.window.Event("input", { bubbles: true }));
  };
  const pointer = (type, x, id = 1) => {
    const event = new dom.window.MouseEvent(type, { clientX: x, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: id });
    (type === "pointerdown" ? find("endpoint") : dom.window).dispatchEvent(event);
  };
  const start = () => find("start").click();
  const drag = (value, width = 600) => {
    find("track").getBoundingClientRect = () => ({ left: 20, width });
    pointer("pointerdown", 20);
    pointer("pointermove", 20 + value / scale.maxValueSI * width);
    pointer("pointerup", 20 + value / scale.maxValueSI * width);
  };
  return { dom, root, getView, find, input, pointer, start, drag, results, submit, dispose: () => dispose(),
    fromU(u) { update({ answerU: u }, "keyboard", undefined); syncMagnitudeSizeAnswerUi(root, getView()); } };
}

afterEach(() => { doms.splice(0).forEach((dom) => dom.window.close()); vi.restoreAllMocks(); });

describe("magnitude size panel", () => {
  it("hides correct size, range and source in study and answer, without seeding an answer", () => {
    const h = harness();
    expect(h.root.textContent).toContain(item.label);
    expect(h.find("reference-line").dataset.drawLength).toBe("0.408");
    for (const phase of ["study", "answer"]) {
      if (phase === "answer") h.start();
      expect(h.find("phase").dataset.magnitudeSizePhase).toBe(phase);
      expect(h.root.textContent).not.toContain("12 m");
      expect(h.root.textContent).not.toContain(item.source);
      expect(h.find("correct-line")).toBeNull();
      expect(h.find("range-line")).toBeNull();
      expect(h.getView().session.answerValueSI).toBeNull();
    }
    expect(h.find("submit").disabled).toBe(true);
    expect(h.find("numeric-input").value).toBe("");
    expect(h.find("endpoint").getAttribute("aria-valuetext")).toBe("未入力");
    expect(h.find("scale").disabled).toBe(true);
    h.submit();
    expect(h.results).toHaveLength(0);
  });

  it.each([linear, log])("scores a 12 m drag and numeric input equally on $normalization", (scale) => {
    const drag = harness(scale);
    drag.start(); drag.drag(12); drag.submit();
    const numeric = harness(scale);
    numeric.start(); numeric.input("numeric-input", "12"); numeric.submit();
    expect(drag.results[0]).toEqual({ ...numeric.results[0], inputMethod: "drag" });
    expect(numeric.results[0]).toEqual({ itemId: item.itemId, scaleId: scale.id, answerValueSI: 12,
      correctValueSI: 12, correct: true, error: 0, elapsedMs: 2500, inputMethod: "numeric" });
  });

  it("syncs endpoint, line, reference ratio, slider and numeric input bidirectionally", () => {
    const h = harness(); h.start(); h.input("numeric-input", "12");
    expect(h.find("endpoint").style.left).toBe("80%");
    expect(h.find("answer-line").style.getPropertyValue("--size-width")).toBe("80%");
    expect(Number(h.find("answer-line").dataset.drawLength) / Number(h.find("reference-line").dataset.drawLength)).toBeCloseTo(12 / 1.7, 12);
    expect(h.find("slider").value).toBe("12");
    expect(h.find("ratio").textContent).toContain("7.059");
    h.input("slider", "6");
    expect(h.find("numeric-input").value).toBe("6");
    expect(h.getView().session.inputMethod).toBe("drag");
    h.drag(9);
    expect(Number(h.find("slider").value)).toBeCloseTo(9, 12);
    expect(h.find("numeric-input").value).toBe("9");
    expect(h.find("readout").textContent).toContain("9 m");
  });

  it.each([linear, log])("maps ⑤ scale u to a proportional display on $normalization", (scale) => {
    const h = harness(scale); h.start(); h.fromU(normalizeScaleBoundedValue(12, scale));
    expect(h.getView().session.answerValueSI).toBeCloseTo(12, 12);
    expect(parseFloat(h.find("endpoint").style.left)).toBeCloseTo(12 / scale.maxValueSI * 100, 12);
    expect(Number(h.find("answer-line").dataset.drawLength)).toBeCloseTo(2.88, 12);
  });

  it("keeps focus and records keyboard arrows on endpoint, slider and numeric input", () => {
    const h = harness(); h.start();
    for (const [suffix, key] of [["endpoint", "ArrowRight"], ["slider", "ArrowRight"], ["numeric-input", "ArrowUp"]]) {
      const node = h.find(suffix); node.focus();
      node.dispatchEvent(new h.dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      expect(h.dom.window.document.activeElement).toBe(node);
      expect(h.getView().session.inputMethod).toBe("keyboard");
    }
    expect(h.getView().session.answerValueSI).toBe(0.3);
  });

  it.each(["", "-1", "16", "bad"])("clears a prior valid draft for invalid numeric input %s", (value) => {
    const h = harness(); h.start(); h.input("numeric-input", "12"); h.input("numeric-input", value);
    expect(h.getView().session.answerValueSI).toBeNull();
    expect(h.find("submit").disabled).toBe(true);
    expect(h.find("answer-line").hidden).toBe(true);
    h.submit(); expect(h.results).toHaveLength(0);
  });

  it("blocks the post-drag click, double submission and resets the next trial", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2000);
    const h = harness(); h.start(); h.drag(12);
    h.find("submit").click(); expect(h.results).toHaveLength(0);
    now.mockReturnValue(2400);
    const button = h.find("submit"); button.click(); button.click(); h.submit();
    expect(h.results).toHaveLength(1);
    h.find("next").click();
    expect(h.getView().session).toMatchObject({ phase: "study", itemId: "next-dino", answerValueSI: null, answerU: null, inputMethod: null, result: null });
    h.start();
    expect(h.find("numeric-input").value).toBe("");
    expect(h.find("submit").disabled).toBe(true);
  });

  it("ignores other pointers, cancels without using cancel coordinates, and disposes listeners", () => {
    const h = harness(); h.start();
    h.find("track").getBoundingClientRect = () => ({ left: 0, width: 150 });
    h.pointer("pointerdown", 120);
    h.pointer("pointermove", 20, 2);
    h.pointer("pointerup", 20, 2);
    expect(h.getView().session.answerValueSI).toBe(12);
    h.pointer("pointercancel", 0);
    expect(h.getView().session.answerValueSI).toBe(12);
    h.pointer("pointerdown", 100); h.dispose(); h.pointer("pointermove", 30);
    expect(h.getView().session.answerValueSI).toBeCloseTo(10, 12);
  });

  it("accepts estimated range endpoints beyond ±10%, preserving representative error and distinct lines", async () => {
    for (const value of [10, 14]) {
      const h = harness(); h.start(); h.input("numeric-input", String(value)); h.submit();
      expect(h.results[0].correct).toBe(true);
      expect(h.results[0].error).toBeCloseTo(2 / 12);
      expect(h.find("range-line").dataset.drawStart).toBe("2.4");
      expect(Number(h.find("range-line").dataset.drawEnd)).toBeCloseTo(3.36);
      expect(h.root.textContent).toContain("推定範囲：10 m - 14 m");
      expect(h.root.textContent).toContain("出典 museum-source");
      expect(h.root.textContent).toContain("16.7%");
      expect(JSON.parse(h.root.querySelector("textarea").value)).toEqual(h.results[0]);
      expect(h.find("download").textContent).toBe("結果をJSONで保存");
      expect(h.find("endpoint")).toBeNull();
    }
    const css = await readFile(new URL("../magnitude-recall.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.magnitude-size-line\.correct\s*\{[^}]*dashed/);
    expect(css).toMatch(/\.magnitude-size-line\.range\s*\{[^}]*dotted/);
    const outside = harness(); outside.start(); outside.input("numeric-input", "9"); outside.submit();
    expect(outside.results[0].correct).toBe(false);
  });

  it("does not clip feedback outside the selected scale and uses the same expanded bounds for every line", () => {
    const h = harness(linear, { ...item, correctValueSI: 20, rangeSI: { minSI: 18, maxSI: 24 } });
    h.start(); h.input("numeric-input", "12"); h.submit();
    expect(parseFloat(h.find("answer-line").style.getPropertyValue("--size-width"))).toBe(50);
    expect(parseFloat(h.find("correct-line").style.getPropertyValue("--size-width"))).toBeCloseTo(20 / 24 * 100);
  });

  it("escapes labels and source and handles empty targets", () => {
    const h = harness(linear, { ...item, label: '<img src=x onerror="bad()">', source: "<script>bad()</script>" });
    h.start(); h.input("numeric-input", "12"); h.submit();
    expect(h.root.querySelector("img, script")).toBeNull();
    expect(renderMagnitudeSizePanel({ ...h.getView(), items: [], item: null, session: null })).toContain("出題対象がありません");
  });
});
