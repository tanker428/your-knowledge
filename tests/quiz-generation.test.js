import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { generateVisitQuizzes, scoreQuizAnswer } from "../src/features/knowledge-graph/quiz-generation.js";

const registries = { genericCategories: [], learningRoles: [], categoriesByPack: {} };
const referenceGraph = {
  nodes: [
    { id: "taxon:root", label: "四足類", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1 },
    { id: "taxon:child", label: "獣脚類", labelEn: "Theropoda", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 2 },
    { id: "taxon:hidden", label: "未確認分類", axis: "taxonomy", status: "draft", quizEligible: true, visible: true, internalOnly: false, order: 3 },
    { id: "geo:period", label: "ジュラ紀", axis: "geological-time", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1 },
    { id: "geo:other", label: "白亜紀", axis: "geological-time", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 2 },
    { id: "taxon:not-eligible", label: "表示専用", axis: "taxonomy", status: "verified", quizEligible: false, visible: true, internalOnly: false, order: 4 },
  ],
  edges: [
    { id: "taxon-edge", type: "SUBCLASS_OF", sourceId: "taxon:child", targetId: "taxon:root" },
  ],
  metadata: { displayRootIdsByAxis: { taxonomy: ["taxon:root"], "geological-time": ["geo:period"] } },
};

function project() {
  return {
    activeVisitId: "v1",
    visits: [{ id: "v1", title: "古生物館", source: "user" }, { id: "v2", title: "別訪問", source: "user" }],
    photos: [
      { id: "p1", visitId: "v1", title: "骨格展示", order: 1, observations: [{ id: "o1", photoId: "p1", label: "骨格", status: "confirmed", included: true, entityId: "e1", region: { x: 10, y: 20, w: 40, h: 30 } }] },
      { id: "p2", visitId: "v1", title: "説明パネル", order: 2, observations: [{ id: "o2", photoId: "p2", label: "説明", status: "confirmed", included: true, entityId: null }] },
      { id: "p3", visitId: "v2", title: "別訪問", order: 1, observations: [{ id: "o3", photoId: "p3", label: "別対象", status: "confirmed", included: true, entityId: "other" }] },
    ],
    relations: [{ id: "r1", sourceId: "o2", targetId: "o1", type: "explains", status: "confirmed" }, { id: "r2", sourceId: "o1", targetId: "o3", type: "explains", status: "confirmed" }],
    entities: [{ id: "e1", name: "標本" }, { id: "other", name: "別訪問" }],
    referenceFacts: [
      { id: "f-tax", subjectId: "e1", predicate: "classifiedAs", value: "taxon:child", status: "verified", sourceType: "curated" },
      { id: "f-time", targetObservationId: "o1", predicate: "livedDuring", value: "geo:period", status: "verified", sourceType: "curated" },
      { id: "f-draft", subjectId: "e1", predicate: "classifiedAs", value: "taxon:hidden", status: "draft", sourceType: "curated" },
      { id: "f-old", subjectId: "e1", predicate: "classifiedAs", value: "taxon:not-found", status: "deprecated", sourceType: "curated" },
      { id: "f-other", subjectId: "other", predicate: "classifiedAs", value: "taxon:child", status: "verified", sourceType: "curated" },
    ],
  };
}

describe("quiz generation from the visit knowledge graph", () => {
  it("generates deterministic hierarchy and timeline-map questions", () => {
    const first = generateVisitQuizzes(project(), "v1", registries, referenceGraph);
    const second = generateVisitQuizzes(project(), "v1", registries, referenceGraph);
    expect(first.map((quiz) => quiz.questionType)).toEqual(["hierarchy", "timeline-map"]);
    expect(first.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first[0].photoId).toBe("p1");
    expect(first[0].region).toEqual({ x: 10, y: 20, w: 40, h: 30 });
    expect(first.every((quiz) => quiz.relationIds.includes("r1"))).toBe(true);
  });
  it("scores placements and keeps the generic answer shape", () => {
    const quiz = generateVisitQuizzes(project(), "v1", registries, referenceGraph).find((item) => item.questionType === "hierarchy");
    expect(scoreQuizAnswer(quiz, { placements: [{ cardId: "o1", referenceId: "taxon:child" }] })).toMatchObject({ score: 1, correct: true, answer: { placements: [{ cardId: "o1", referenceId: "taxon:child" }] } });
    expect(scoreQuizAnswer(quiz, { placements: [{ cardId: "o1", referenceId: "taxon:root" }] }).score).toBe(0);
  });
  it("preserves a per-question answer after JSON reload", () => {
    const quiz = generateVisitQuizzes(project(), "v1", registries, referenceGraph)[0];
    const score = scoreQuizAnswer(quiz, { placements: [{ cardId: quiz.observationId, referenceId: quiz.targetReferenceId }] });
    const saved = { id: "result-1", visitId: "v1", quizId: quiz.id, answer: score.answer, score: score.score, correct: score.correct };
    const reloaded = JSON.parse(JSON.stringify([saved]))[0];
    expect(reloaded.quizId).toBe(quiz.id);
    expect(reloaded.answer.placements[0].referenceId).toBe(quiz.targetReferenceId);
    expect(reloaded.correct).toBe(true);
  });
  it("excludes other visits, unconfirmed facts, and unknown or ineligible references", () => {
    const quizzes = generateVisitQuizzes(project(), "v1", registries, referenceGraph);
    expect(quizzes.every((quiz) => ["o1"].includes(quiz.observationId))).toBe(true);
    expect(quizzes.every((quiz) => quiz.referenceFactId !== "f-draft" && quiz.referenceFactId !== "f-old" && quiz.referenceFactId !== "f-other")).toBe(true);
    expect(quizzes.every((quiz) => quiz.options.every((option) => option.id !== "taxon:not-eligible"))).toBe(true);
  });
  it("does not depend on bundled sample quizzes", async () => {
    const source = await readFile(new URL("../src/features/knowledge-graph/quiz-generation.js", import.meta.url), "utf8");
    expect(source).not.toContain("SAMPLE_QUIZZES");
  });
});
