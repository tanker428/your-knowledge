import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  BODY_LENGTH_LOG_RECALL_SCALE_ID,
  findMagnitudeRecallScale,
} from "../src/features/knowledge-3d/magnitude-recall.js";
import { renderMagnitudeRecallPanel } from "../src/ui/magnitude-recall-panel.js";

const scale = findMagnitudeRecallScale(BODY_LENGTH_LOG_RECALL_SCALE_ID);
const item = {
  itemId: "concept:taxon:fukuiraptor",
  label: "Fukuiraptor",
  quantityKind: "body_length",
  unitSI: "m",
  correctValueSI: 4.2,
  rangeSI: { minSI: 4, maxSI: 5.5 },
  representativeSource: "range",
  estimated: true,
  source: "rf-body-length-range",
  observationIds: ["o-fossil"],
  entityIds: ["e-fossil"],
  referenceIds: ["taxon:fukuiraptor"],
};

function docFor(view) {
  return new JSDOM(renderMagnitudeRecallPanel({
    scales: [scale],
    scale,
    items: [item],
    item,
    numericValue: "",
    numericNeedsConfirm: false,
    resultCount: 0,
    ...view,
  })).window.document;
}

describe("magnitude recall panel", () => {
  it("renders study mode with the target in a tray and without correct value clues", () => {
    const document = docFor({
      session: {
        phase: "study",
        itemId: item.itemId,
        scaleId: scale.id,
        answerValueSI: null,
        answerU: null,
        inputMethod: null,
        startedAtMs: 0,
        answeredAtMs: null,
        result: null,
      },
    });

    expect(document.querySelector("[data-magnitude-recall-phase]")?.getAttribute("data-magnitude-recall-phase")).toBe("study");
    expect(document.querySelector(".magnitude-recall-tray")?.textContent).toContain("Fukuiraptor");
    expect(document.body.textContent).not.toContain("4.2 m");
    expect(document.body.textContent).not.toContain("rf-body-length-range");
  });

  it("renders answer mode with disabled submit before input and disabled scale switching", () => {
    const document = docFor({
      session: {
        phase: "answer",
        itemId: item.itemId,
        scaleId: scale.id,
        answerValueSI: null,
        answerU: null,
        inputMethod: null,
        startedAtMs: 0,
        answeredAtMs: null,
        result: null,
      },
      canCommit: false,
    });

    expect(document.querySelector("[data-magnitude-recall-submit]")?.hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("[data-magnitude-recall-scale]")?.hasAttribute("disabled")).toBe(true);
    expect(document.querySelector("[data-magnitude-recall-axis]")?.getAttribute("aria-valuetext")).toBe("未入力");
  });

  it("renders numeric reconfirmation and feedback TrialResult JSON", () => {
    const confirming = docFor({
      session: {
        phase: "answer",
        itemId: item.itemId,
        scaleId: scale.id,
        answerValueSI: 4.1,
        answerU: 0.5378175246332112,
        inputMethod: "numeric",
        startedAtMs: 0,
        answeredAtMs: null,
        result: null,
      },
      numericValue: "4.1",
      numericNeedsConfirm: true,
      canCommit: true,
    });

    expect(confirming.querySelector("[data-magnitude-recall-submit]")?.hasAttribute("disabled")).toBe(true);
    expect(confirming.querySelector("[data-magnitude-recall-confirm-numeric]")?.textContent).toContain("この数値で回答");

    const feedback = docFor({
      session: {
        phase: "feedback",
        itemId: item.itemId,
        scaleId: scale.id,
        answerValueSI: 4.1,
        answerU: 0.5378175246332112,
        inputMethod: "numeric",
        startedAtMs: 0,
        answeredAtMs: 1000,
        result: {
          itemId: item.itemId,
          scaleId: scale.id,
          answerValueSI: 4.1,
          correctValueSI: 4.2,
          correct: true,
          error: Math.abs(4.1 - 4.2) / 4.2,
          elapsedMs: 1000,
          inputMethod: "numeric",
        },
      },
      resultCount: 1,
    });

    expect(feedback.body.textContent).toContain("正解値");
    expect(feedback.body.textContent).toContain("推定範囲 4 m - 5.5 m");
    expect(feedback.body.textContent).toContain("出典 rf-body-length-range");
    expect(feedback.querySelector("textarea")?.value).toContain('"inputMethod": "numeric"');
  });
});
