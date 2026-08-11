import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  quizAttemptContextKey,
  reconcileQuizQuestionTypes,
  renderQuizQuestionTypeControls,
  updateQuizQuestionTypeSelection,
} from "../src/ui/quiz-setup.js";

const availability = [
  { id: "hierarchy", label: "分類", available: true, questionCount: 5, reason: null },
  { id: "timeline-map", label: "時系列", available: false, questionCount: 0, reason: "比較対象が不足しています。" },
  { id: "matching", label: "Relation", available: true, questionCount: 3, reason: null },
];

describe("quiz question type setup", () => {
  it("renders multi-select checkboxes, disables empty types with a reason, and keeps defaults on", () => {
    const allAvailable = availability.map((type) => ({ ...type, available: true, questionCount: type.questionCount || 5, reason: null }));
    const defaults = allAvailable.map((type) => type.id);
    const dom = new JSDOM(renderQuizQuestionTypeControls(allAvailable, defaults));
    const inputs = [...dom.window.document.querySelectorAll("[data-quiz-question-type]")];
    expect(inputs).toHaveLength(3);
    expect(inputs.every((input) => input.checked && !input.disabled)).toBe(true);

    const limited = new JSDOM(renderQuizQuestionTypeControls(availability, defaults));
    const timeline = limited.window.document.querySelector("[data-quiz-question-type='timeline-map']");
    expect(timeline.checked).toBe(false);
    expect(timeline.disabled).toBe(true);
    expect(timeline.closest("label").textContent).toContain("問題なし：比較対象が不足しています。");
  });

  it("prevents all-off and deterministically selects the first available fallback", () => {
    expect(reconcileQuizQuestionTypes(["timeline-map"], availability)).toEqual(["hierarchy"]);
    const prevented = updateQuizQuestionTypeSelection(["hierarchy"], "hierarchy", false, availability);
    expect(prevented).toEqual({ selectedTypes: ["hierarchy"], prevented: true });

    const dom = new JSDOM(renderQuizQuestionTypeControls(availability, ["hierarchy"]));
    const hierarchy = dom.window.document.querySelector("[data-quiz-question-type='hierarchy']");
    expect(hierarchy.checked).toBe(true);
    expect(hierarchy.disabled).toBe(true);
    expect(hierarchy.getAttribute("aria-describedby")).toBe("quizTypeSelectionHint");
    expect(dom.window.document.querySelector("#quizTypeSelectionHint").textContent).toContain("最後の1種類はオフにできません");

    expect(updateQuizQuestionTypeSelection(["hierarchy"], "matching", true, availability))
      .toEqual({ selectedTypes: ["hierarchy", "matching"], prevented: false });
  });

  it("changes the attempt context key when the selected type set changes", () => {
    const base = { visitId: "v1", scope: "active", difficulty: "normal" };
    expect(quizAttemptContextKey({ ...base, questionTypes: ["hierarchy", "matching"] }))
      .not.toBe(quizAttemptContextKey({ ...base, questionTypes: ["hierarchy"] }));
    expect(quizAttemptContextKey({ ...base, questionTypes: ["matching", "hierarchy"] }))
      .toBe(quizAttemptContextKey({ ...base, questionTypes: ["hierarchy", "matching"] }));
  });
});
