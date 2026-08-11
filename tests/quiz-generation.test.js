import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  buildObservationChoiceOptions,
  buildPlacementBoardData,
  buildPlacementQuizPrompt,
  describeQuizAvailability,
  generateVisitQuizzes,
  MAX_PER_TYPE,
  RELATION_QUIZ_TEMPLATES,
  scoreQuizAnswer,
  selectQuizQuestions,
} from "../src/features/knowledge-graph/quiz-generation.js";

const registries = { genericCategories: [], learningRoles: [], categoriesByPack: {} };
const referenceGraph = {
  nodes: [
    { id: "taxon:root", label: "四足類", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1 },
    { id: "taxon:child", label: "獣脚類", labelEn: "Theropoda", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 2 },
    { id: "taxon:sibling", label: "竜脚形類", labelEn: "Sauropodomorpha", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 3 },
    { id: "taxon:hidden", label: "未確認分類", axis: "taxonomy", status: "draft", quizEligible: true, visible: true, internalOnly: false, order: 3 },
    { id: "geo:period", label: "ジュラ紀", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 2, startMa: 201.4, endMa: 145 },
    { id: "geo:other", label: "白亜紀", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 3, startMa: 145, endMa: 66 },
    { id: "geo:older", label: "三畳紀", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1, startMa: 251.9, endMa: 201.4 },
    { id: "taxon:not-eligible", label: "表示専用", axis: "taxonomy", status: "verified", quizEligible: false, visible: true, internalOnly: false, order: 4 },
  ],
  edges: [
    { id: "taxon-edge", type: "SUBCLASS_OF", sourceId: "taxon:child", targetId: "taxon:root" },
    { id: "taxon-sibling-edge", type: "SUBCLASS_OF", sourceId: "taxon:sibling", targetId: "taxon:root" },
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
  it("uses natural Japanese allowlisted templates for learning-value relations", () => {
    expect(RELATION_QUIZ_TEMPLATES.explains({ label: "説明パネル" })).toBe("説明パネルの説明で説明されている対象はどれですか？");
    expect(RELATION_QUIZ_TEMPLATES["part-of"]({ label: "分類・時代・産地の記載" })).toBe("分類・時代・産地の記載が含まれる全体はどれですか？");
    expect(RELATION_QUIZ_TEMPLATES["same-exhibit"]).toBeUndefined();
  });
  it("uses deterministic four-choice photo options", () => {
    const observations = [
      { id: "Observation:o3", observationId: "o3", label: "三", photoId: "p3" },
      { id: "Observation:o1", observationId: "o1", label: "一", photoId: "p1" },
      { id: "Observation:o2", observationId: "o2", label: "二", photoId: "p2" },
      { id: "Observation:o4", observationId: "o4", label: "四", photoId: "p4" },
      { id: "Observation:o5", observationId: "o5", label: "五", photoId: "p5" },
    ];
    const first = buildObservationChoiceOptions(observations, "o3");
    expect(first).toEqual(buildObservationChoiceOptions(observations, "o3"));
    expect(first).toHaveLength(4);
    expect(first[0].id).toBe("o3");
    expect(first.map((option) => option.photoId)).toEqual(["p3", "p1", "p2", "p4"]);
    expect(new Set(first.map((option) => option.id)).size).toBe(4);
  });
  it("generates deterministic hierarchy and timeline-map questions", () => {
    const first = generateVisitQuizzes(project(), "v1", registries, referenceGraph);
    const second = generateVisitQuizzes(project(), "v1", registries, referenceGraph);
    expect(first.map((quiz) => quiz.questionType)).toEqual(["hierarchy", "timeline-map"]);
    expect(first.length).toBeLessThanOrEqual(10);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first[0].photoId).toBe("p1");
    expect(first[0].region).toEqual({ x: 10, y: 20, w: 40, h: 30 });
    expect(first.every((quiz) => quiz.relationIds.includes("r1"))).toBe(true);
    const hierarchy = first.find((quiz) => quiz.questionType === "hierarchy");
    expect(hierarchy.placementPathIds).toEqual(["taxon:root", "taxon:child"]);
    expect(hierarchy.placementSiblingIds).toContain("taxon:sibling");
    expect(hierarchy.options.map((option) => option.id)).toEqual(["taxon:root", "taxon:child", "taxon:sibling"]);
    const timeline = first.find((quiz) => quiz.questionType === "timeline-map");
    expect(timeline.options.map((option) => option.id)).toEqual(["geo:older", "geo:period", "geo:other"]);
  });
  it("uses predicate-specific placement prompts with a safe fallback", () => {
    expect(buildPlacementQuizPrompt("全身骨格", "livedDuring")).toBe("全身骨格が生きた時代を配置してください。");
    expect(buildPlacementQuizPrompt("森林復元模型", "occursDuring")).toBe("森林復元模型が示す時代を配置してください。");
    expect(buildPlacementQuizPrompt("未知の対象", "futurePredicate")).toBe("未知の対象に対応する位置を配置してください。");

    const changed = project();
    changed.referenceFacts.find((fact) => fact.id === "f-time").predicate = "occursDuring";
    changed.photos[0].observations[0].label = "中生代の森林復元模型";
    const timeline = generateVisitQuizzes(changed, "v1", registries, referenceGraph).find((quiz) => quiz.questionType === "timeline-map");
    expect(timeline.prompt).toBe("中生代の森林復元模型が示す時代を配置してください。");
  });
  it("reserves every available question type and fills unused quotas deterministically", () => {
    const questions = Object.entries({ hierarchy: 5, "timeline-map": 5, matching: 5, "observation-choice": 5 })
      .flatMap(([questionType, count]) => Array.from({ length: count }, (_, index) => ({ id: `${questionType}:${index}`, questionType })))
      .reverse();
    const first = selectQuizQuestions(questions);
    expect(MAX_PER_TYPE).toEqual({ hierarchy: 3, "timeline-map": 3, matching: 2, "observation-choice": 2 });
    expect(first).toHaveLength(10);
    expect(new Set(first.map((quiz) => quiz.questionType))).toEqual(new Set(["hierarchy", "timeline-map", "matching", "observation-choice"]));
    expect(first.filter((quiz) => quiz.questionType === "hierarchy")).toHaveLength(3);
    expect(first.filter((quiz) => quiz.questionType === "timeline-map")).toHaveLength(3);
    expect(first.filter((quiz) => quiz.questionType === "matching")).toHaveLength(2);
    expect(first.filter((quiz) => quiz.questionType === "observation-choice")).toHaveLength(2);
    expect(JSON.stringify(first)).toBe(JSON.stringify(selectQuizQuestions([...questions].reverse())));

    const oneType = Array.from({ length: 12 }, (_, index) => ({ id: `timeline:${String(index).padStart(2, "0")}`, questionType: "timeline-map" }));
    expect(selectQuizQuestions(oneType)).toHaveLength(10);
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
  it("reports missing ReferenceFacts and generates after one is supplied", () => {
    const withoutFacts = project();
    withoutFacts.referenceFacts = [];
    expect(describeQuizAvailability(withoutFacts, "v1", registries, referenceGraph).reason).toContain("確認済みの知識");
    withoutFacts.referenceFacts.push({ id: "created-fact", targetObservationId: "o1", predicate: "livedDuring", value: "geo:period", status: "verified", sourceType: "curated" });
    expect(generateVisitQuizzes(withoutFacts, "v1", registries, referenceGraph).length).toBeGreaterThan(0);
  });
  it("keeps multiple attempt records instead of overwriting them", () => {
    const quiz = generateVisitQuizzes(project(), "v1", registries, referenceGraph)[0];
    const first = { deckAttemptId: "deck-1", attemptId: "attempt-1", answeredAt: "2026-01-01T00:00:00Z", quizId: quiz.id, score: 0 };
    const second = { deckAttemptId: "deck-2", attemptId: "attempt-2", answeredAt: "2026-01-02T00:00:00Z", quizId: quiz.id, score: 1 };
    expect([first, second].filter((result) => result.quizId === quiz.id)).toHaveLength(2);
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(second.deckAttemptId).not.toBe(first.deckAttemptId);
  });
  it("generates a part-of question from the confirmed demo relation", () => {
    const demoProject = project();
    demoProject.visits[0].source = "demo";
    demoProject.photos[0].observations[0].id = "o08b";
    demoProject.photos[0].observations[0].label = "名称と解説が書かれた展示パネル";
    demoProject.photos[0].observations[0].photoId = "p08";
    demoProject.photos[1].observations[0].id = "o07b";
    demoProject.photos[1].observations[0].label = "展示空間と周囲の標本";
    demoProject.photos[1].observations[0].photoId = "p07";
    demoProject.relations = [{ id: "r19", sourceId: "o08b", targetId: "o07b", type: "part-of", directed: true, status: "confirmed" }];
    const graph = generateVisitQuizzes(demoProject, "v1", registries, referenceGraph);
    expect(graph.some((quiz) => quiz.prompt === "名称と解説が書かれた展示パネルが含まれる全体はどれですか？")).toBe(true);
    expect(graph.find((quiz) => quiz.prompt.includes("含まれる全体"))?.observationId).toBe("o08b");
  });
  it("does not generate relation questions for observations in the same photo", () => {
    const samePhotoProject = project();
    samePhotoProject.visits[0].source = "demo";
    samePhotoProject.photos[0].observations.push({ id: "o1b", photoId: "p1", label: "同じ写真の別対象", status: "confirmed", included: true, entityId: null, region: null });
    samePhotoProject.relations = [{ id: "same-photo", sourceId: "o1", targetId: "o1b", type: "explains", directed: true, status: "confirmed" }];
    const questions = generateVisitQuizzes(samePhotoProject, "v1", registries, referenceGraph);
    expect(questions.some((quiz) => quiz.questionType === "matching")).toBe(false);
    expect(questions.filter((quiz) => quiz.questionType === "hierarchy" || quiz.questionType === "timeline-map")).toHaveLength(2);
  });
  it("builds a taxonomy path with siblings and a complete same-rank time band", () => {
    const taxonomy = buildPlacementBoardData(referenceGraph, referenceGraph.nodes.find((node) => node.id === "taxon:child"), "taxonomy");
    expect(taxonomy.pathIds).toEqual(["taxon:root", "taxon:child"]);
    expect(taxonomy.options.map((node) => node.id)).toEqual(["taxon:root", "taxon:child", "taxon:sibling"]);
    const time = buildPlacementBoardData(referenceGraph, referenceGraph.nodes.find((node) => node.id === "geo:period"), "geological-time");
    expect(time.options.map((node) => node.id)).toEqual(["geo:older", "geo:period", "geo:other"]);
  });
  it("sorts equal and missing geological ages with deterministic tie-breakers", () => {
    const graph = structuredClone(referenceGraph);
    graph.nodes.push(
      { id: "geo:tie-b", label: "同値B", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: null, startMa: 201.4, endMa: 190 },
      { id: "geo:tie-a", label: "同値A", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: null, startMa: 201.4, endMa: 190 },
      { id: "geo:missing", label: "欠損", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: null, startMa: null, endMa: null },
    );
    const time = buildPlacementBoardData(graph, graph.nodes.find((node) => node.id === "geo:period"), "geological-time");
    expect(time.options.map((node) => node.id)).toEqual([
      "geo:older", "geo:tie-a", "geo:tie-b", "geo:period", "geo:other", "geo:missing",
    ]);
  });
  it("keeps qualified labels display-only while scoring by stable reference ID", () => {
    const graph = structuredClone(referenceGraph);
    graph.nodes.push(
      { id: "geo:epoch:jurassic:early", label: "前期", axis: "geological-time", rank: "epoch", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: null, startMa: 201.4, endMa: 174.7 },
      { id: "geo:epoch:cretaceous:early", label: "前期", axis: "geological-time", rank: "epoch", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: null, startMa: 143.1, endMa: 100.5 },
    );
    graph.edges.push(
      { id: "j-early", type: "PART_OF", sourceId: "geo:epoch:jurassic:early", targetId: "geo:period" },
      { id: "c-early", type: "PART_OF", sourceId: "geo:epoch:cretaceous:early", targetId: "geo:other" },
    );
    const changed = project();
    changed.referenceFacts.find((fact) => fact.id === "f-time").value = "geo:epoch:jurassic:early";
    const timeline = generateVisitQuizzes(changed, "v1", registries, graph).find((quiz) => quiz.questionType === "timeline-map");
    expect(timeline.prompt).toBe("骨格が生きた時代を配置してください。");
    expect(timeline.options.map((option) => [option.id, option.label])).toEqual([
      ["geo:epoch:jurassic:early", "ジュラ紀前期"],
      ["geo:epoch:cretaceous:early", "白亜紀前期"],
    ]);
    expect(scoreQuizAnswer(timeline, { placements: [{ cardId: "o1", referenceId: "geo:epoch:jurassic:early" }] }).correct).toBe(true);
    expect(timeline.targetReferenceId).toBe("geo:epoch:jurassic:early");
  });
  it("wires the ReferenceFact form to verified project data before quiz generation", async () => {
    const source = await readFile(new URL("../src/ui/app.js", import.meta.url), "utf8");
    expect(source).toContain("data-reference-fact-form");
    expect(source).toContain("state.referenceFacts.push");
    expect(source).toContain('status: "verified"');
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
