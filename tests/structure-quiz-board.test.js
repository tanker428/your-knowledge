import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  placementForTimelineReference,
  renderHierarchyQuizBoard,
  renderTimelineQuizBoard,
  shiftTimelinePlacement,
} from "../src/ui/structure-quiz-board.js";

const cards = [
  { cardId: "o1", observationId: "o1", label: "翼竜", targetReferenceId: "taxon:child" },
];

describe("structure quiz boards", () => {
  it("renders named JSON taxonomy nodes separately from empty Observation drop slots", () => {
    const quiz = {
      questionType: "hierarchy",
      cards,
      options: [
        { id: "taxon:root", label: "双弓類", parentIds: [] },
        { id: "taxon:parent", label: "主竜類", parentIds: ["taxon:root"] },
        { id: "taxon:child", label: "恐竜類", labelEn: "Dinosauria", parentIds: ["taxon:parent"] },
        { id: "taxon:sibling", label: "翼竜など", parentIds: ["taxon:parent"], placementEligible: false },
      ],
    };
    const dom = new JSDOM(renderHierarchyQuizBoard(quiz, [], null, false));
    const document = dom.window.document;
    expect([...document.querySelectorAll(".quiz-reference-node strong")].map((node) => node.textContent)).toEqual(["双弓類", "主竜類", "恐竜類", "翼竜など"]);
    expect(document.querySelectorAll("[data-quiz-drop]")).toHaveLength(3);
    expect([...document.querySelectorAll("[role=treeitem]")].map((node) => node.getAttribute("aria-level"))).toEqual(["1", "2", "3", "3"]);
    expect(document.querySelector("[data-quiz-drop='taxon:child']").getAttribute("aria-label")).toContain("恐竜類");
    expect(document.querySelector(".quiz-tree-unavailable").textContent).toBe("文脈表示（配置不可）");
    expect(document.querySelector(".quiz-tree-unavailable").getAttribute("aria-label")).toContain("翼竜など");
    expect(document.querySelector("[data-quiz-drop='taxon:sibling']")).toBeNull();
  });

  it("renders normalized durations as proportional period bars and single ages as points", () => {
    const quiz = {
      questionType: "timeline-map",
      cards: [{ ...cards[0], targetReferenceId: "time:middle" }],
      options: [
        { id: "time:old", label: "古い期間", startMa: 300, endMa: 200 },
        { id: "time:middle", label: "短い期間", startMa: 200, endMa: 150 },
        { id: "time:point", label: "一点", startMa: 100, endMa: null },
      ],
    };
    const dom = new JSDOM(renderTimelineQuizBoard(quiz, [], null, false));
    const periods = [...dom.window.document.querySelectorAll(".quiz-time-slot.period")];
    const point = dom.window.document.querySelector(".quiz-time-slot.point");
    expect(periods).toHaveLength(2);
    expect(Number(periods[0].style.getPropertyValue("--time-width").replace("%", ""))).toBeGreaterThan(Number(periods[1].style.getPropertyValue("--time-width").replace("%", "")));
    expect(point.style.getPropertyValue("--time-width")).toBe("0%");
    expect(dom.window.document.querySelectorAll("[data-quiz-drop]")).toHaveLength(3);
  });

  it("shows the learner placement and correct location together after scoring", () => {
    const quiz = {
      questionType: "hierarchy",
      cards,
      options: [
        { id: "taxon:wrong", label: "別分類", parentIds: [] },
        { id: "taxon:child", label: "正解分類", parentIds: [] },
      ],
    };
    const scored = { items: [{ cardId: "o1", selectedReferenceId: "taxon:wrong", targetReferenceId: "taxon:child", correct: false }] };
    const dom = new JSDOM(renderHierarchyQuizBoard(quiz, [{ cardId: "o1", referenceId: "taxon:wrong" }], scored, true));
    expect(dom.window.document.querySelector("[data-quiz-drop='taxon:wrong']").textContent).toContain("自分");
    expect(dom.window.document.querySelector("[data-quiz-drop='taxon:child']").textContent).toContain("正解");
    expect([...dom.window.document.querySelectorAll("[data-quiz-drop]")].every((button) => button.disabled)).toBe(true);
  });

  it("moves a placement in both old and new directions while retaining normalized boundaries", () => {
    const quiz = {
      questionType: "timeline-map",
      options: [
        { id: "old", startMa: 300, endMa: 200 },
        { id: "middle", startMa: 200, endMa: 100 },
        { id: "new", startMa: 100, endMa: 0 },
      ],
    };
    const middle = { placements: [placementForTimelineReference(quiz, "o1", "middle")] };
    expect(shiftTimelinePlacement(quiz, middle, "o1", -1).placements[0]).toEqual({ cardId: "o1", referenceId: "old", startMa: 300, endMa: 200 });
    expect(shiftTimelinePlacement(quiz, middle, "o1", 1).placements[0]).toEqual({ cardId: "o1", referenceId: "new", startMa: 100, endMa: 0 });
  });
});
