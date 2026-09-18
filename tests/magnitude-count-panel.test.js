import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
  BODY_LENGTH_LOG_RECALL_SCALE_ID,
  BODY_LENGTH_RECALL_SCALES,
  findMagnitudeRecallScale,
  startMagnitudeRecallTrial,
} from "../src/features/knowledge-3d/magnitude-recall.js";
import { scoreCountRecallTrial } from "../src/features/knowledge-3d/magnitude-count-recall.js";
import { renderMagnitudeCountPanel, syncMagnitudeCountPanel } from "../src/ui/magnitude-count-panel.js";

const scale = findMagnitudeRecallScale(BODY_LENGTH_LINEAR_RECALL_SCALE_ID);
/** @type {import('../src/ui/magnitude-count-panel.js').RecallItem} */
const item = {
  itemId: "concept:a", label: "恐竜A", quantityKind: "body_length", unitSI: "m",
  correctValueSI: 12, rangeSI: { minSI: 11, maxSI: 13 }, representativeSource: "value",
  estimated: true, source: "curated-source", observationIds: [], entityIds: [], referenceIds: [],
};

/** @param {Partial<import('../src/ui/magnitude-count-panel.js').CountPanelView>} [changes] */
function view(changes = {}) {
  return {
    scales: BODY_LENGTH_RECALL_SCALES, scale, item,
    session: { ...startMagnitudeRecallTrial({ itemId: item.itemId, scaleId: scale.id }), result: null },
    count: 0, metersPerCount: 1, numericValue: "", canCommit: false, paused: false,
    ended: false, hintUsed: false, resultCount: 0, ...changes,
  };
}

function docFor(input) {
  return new JSDOM(renderMagnitudeCountPanel(input)).window.document;
}

describe("count recall panel", () => {
  it("shows the task, count rule, zero meaning and confirmation instructions without correct-value clues", () => {
    const document = docFor(view());
    expect(document.body.textContent).toContain("恐竜Aの体長を操作で示してください（この教材では1回＝1 m）");
    expect(document.body.textContent).toContain("0回は0 m");
    expect(document.body.textContent).toContain("確定");
    expect(document.body.textContent).not.toContain("12 m");
    expect(document.body.textContent).not.toContain("curated-source");
    expect(document.querySelector(".magnitude-count-correct-marker")).toBeNull();
    expect(document.querySelector("[data-magnitude-count-numeric-input]")).toBeNull();
  });

  it("renders blank unanswered controls and gates the scale and submit in answer mode", () => {
    const draft = view();
    draft.session.phase = "answer";
    const document = docFor(draft);
    expect(document.querySelector("[data-magnitude-count-submit]").hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("[data-magnitude-count-scale]").hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("[data-magnitude-count-readout]").textContent).toBe("回数：0（0 m）");
    expect(document.querySelector("input").value).toBe("");
    expect(document.querySelector(".magnitude-count-range")).toBeNull();
  });

  it("syncs proportional count gauge and numeric override in place, and gates paused answers", () => {
    const draft = view({ count: 6, canCommit: true });
    draft.session = { ...draft.session, phase: "answer", answerValueSI: 6, answerU: 0.4, inputMethod: "axis-click" };
    const document = docFor(draft);
    const area = document.querySelector("[data-magnitude-count-increment]");
    const input = document.querySelector("input");
    input.focus();
    expect(document.querySelector(".magnitude-count-gauge span").getAttribute("style")).toBe("width:40%");
    draft.count = 12;
    draft.numericValue = "12.5";
    draft.session.answerValueSI = 12.5;
    syncMagnitudeCountPanel(document.body, draft);
    expect(document.activeElement).toBe(input);
    expect(document.querySelector("[data-magnitude-count-increment]")).toBe(area);
    expect(document.querySelector(".magnitude-count-gauge span").getAttribute("style")).toBe("width: 80%;");
    expect(document.querySelector("[data-magnitude-count-readout]").textContent).toContain("回数：12（12 m） ／ 微調整：12.5 m");
    expect(document.querySelector("[data-magnitude-count-submit]").hasAttribute("disabled")).toBe(false);
    const paused = docFor({ ...draft, paused: true });
    for (const selector of ["input", "[data-magnitude-count-increment]", "[data-magnitude-count-undo]", "[data-magnitude-count-reset]", "[data-magnitude-count-submit]"]) {
      expect(paused.querySelector(selector).hasAttribute("disabled")).toBe(true);
    }
    expect(paused.querySelector("[data-magnitude-count-pause]").textContent).toBe("再開");
  });

  it("explains the shared logarithmic base and multiplier without changing the per-count rule", () => {
    const log = findMagnitudeRecallScale(BODY_LENGTH_LOG_RECALL_SCALE_ID);
    const document = docFor(view({ scale: log }));
    expect(document.body.textContent).toContain("基準 0.1 m");
    expect(document.body.textContent).toContain("×10");
    expect(document.body.textContent).toContain("1回＝1 m");
    expect(document.body.textContent).toContain("0回（0 m）はこのスケールでは回答できません");
  });

  it("shows distinct answer/correct/range markers and complete count telemetry only in feedback", () => {
    const draft = view();
    const result = scoreCountRecallTrial({ itemId: item.itemId, scaleId: scale.id, count: 11, overrideValueSI: 11.5, correctValueSI: 12, elapsedMs: 750, inputMethod: "numeric", hintUsed: true });
    const document = docFor({ ...draft, session: { ...draft.session, phase: "feedback", result }, resultCount: 1 });
    for (const text of ["復元した回答", "11.5 m", "正解値", "12 m", "推定範囲 11 m–13 m", "単位 m", "出典 curated-source", "4.2%", "11回", "微調整 あり", "ヒント あり"]) {
      expect(document.body.textContent).toContain(text);
    }
    expect(document.querySelector(".magnitude-count-answer-marker")).not.toBeNull();
    expect(document.querySelector(".magnitude-count-correct-marker")).not.toBeNull();
    expect(document.querySelector(".magnitude-count-range")).not.toBeNull();
    expect(JSON.parse(document.querySelector("textarea").value)).toEqual(result);
    expect(document.querySelector("[data-magnitude-count-submit]")).toBeNull();
    expect(document.querySelector("[data-magnitude-count-download]")).not.toBeNull();
    expect(document.querySelector("[data-magnitude-count-next]")).not.toBeNull();
  });

  it("escapes labels and sources, and handles absent data or an ended session", () => {
    const malicious = { ...item, label: '<img src=x onerror="alert(1)">', source: "</textarea><script>alert(1)</script>", rangeSI: null };
    const draft = view({ item: malicious });
    draft.session.phase = "feedback";
    draft.session.result = scoreCountRecallTrial({ itemId: item.itemId, scaleId: scale.id, count: 1, correctValueSI: 12, elapsedMs: 0, inputMethod: "axis-click" });
    const document = docFor(draft);
    expect(document.querySelector("img, script")).toBeNull();
    expect(document.body.textContent).toContain(malicious.source);
    expect(document.body.textContent).toContain("推定範囲 なし");
    expect(docFor(view({ item: null, session: null })).body.textContent).toContain("問題がありません");
    const ended = docFor(view({ ended: true }));
    expect(ended.querySelector("[data-magnitude-count-restart]")).not.toBeNull();
    expect(ended.querySelector("[data-magnitude-count-start]")).toBeNull();
  });
});
