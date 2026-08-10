import { describe, expect, it } from "vitest";
import { recordQuizLearning } from "../src/domain/learning-state.js";
import {
  buildObservationChoiceOptions,
  buildPlacementBoardData,
  buildPlacementBoardDataForTargets,
  buildPlacementQuizPrompt,
  buildQuizResultEntries,
  describeQuizAvailability,
  generateAllVisitQuizzes,
  generateVisitQuizzes,
  getQuizDifficultyAvailability,
  MIN_COMPARABLE_OBSERVATIONS,
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
    { id: "taxon-context-edge", type: "SUBCLASS_OF", sourceId: "taxon:not-eligible", targetId: "taxon:root" },
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
    quizResults: [],
    learningEvents: [],
    userKnowledgeStates: [],
  };
}

function comparableProject(count = 4) {
  const value = project();
  for (let index = 2; index <= count; index += 1) {
    const observationId = `o${index + 2}`;
    value.photos[0].observations.push({
      id: observationId,
      photoId: "p1",
      label: `骨格${index}`,
      status: "confirmed",
      included: true,
      entityId: "e1",
      region: { x: index * 5, y: index * 4, w: 20, h: 20 },
    });
    value.referenceFacts.push({ id: `f-time-${index}`, targetObservationId: observationId, predicate: "livedDuring", value: index % 2 ? "geo:other" : "geo:period", status: "verified", sourceType: "curated" });
    if (index % 2) value.referenceFacts.push({ id: `f-tax-${index}`, targetObservationId: observationId, predicate: "classifiedAs", value: "taxon:sibling", status: "verified", sourceType: "curated" });
  }
  return value;
}

function correctAnswer(quiz) {
  return { placements: quiz.cards.map((card) => ({ cardId: card.cardId, referenceId: card.targetReferenceId })) };
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
    expect(new Set(first.map((option) => option.id)).size).toBe(4);
  });

  it("requires four comparable Observations on every structure axis", () => {
    expect(MIN_COMPARABLE_OBSERVATIONS).toBe(4);
    const insufficient = generateVisitQuizzes(comparableProject(3), "v1", registries, referenceGraph);
    expect(insufficient.filter((quiz) => quiz.questionType === "hierarchy")).toHaveLength(0);
    expect(insufficient.filter((quiz) => quiz.questionType === "timeline-map")).toHaveLength(0);
    const easy = generateVisitQuizzes(comparableProject(4), "v1", registries, referenceGraph);
    expect(easy.find((quiz) => quiz.questionType === "hierarchy").options.find((option) => option.id === "taxon:not-eligible"))
      .toMatchObject({ placementEligible: false });
    const availability = describeQuizAvailability(comparableProject(3), "v1", registries, referenceGraph, { difficulty: "hard" });
    expect(availability.reason).toContain("4件以上");
    expect(availability.comparableCount).toBe(3);
    expect(availability.axisAvailability).toMatchObject({
      taxonomy: { available: false, comparableCount: 3, minimumCount: 4, questionCount: 0 },
      "geological-time": { available: false, comparableCount: 3, minimumCount: 4, questionCount: 0 },
    });
    expect(availability.axisReasons).toEqual([
      "分類クイズは比較可能な対象が不足しているため出題されません（必要4件以上、現在3件）。",
      "地質時代クイズは比較可能な対象が不足しているため出題されません（必要4件以上、現在3件）。",
    ]);
  });

  it("uses the same cards array path for easy one-card structure questions", () => {
    const quizzes = generateVisitQuizzes(comparableProject(), "v1", registries, referenceGraph, { difficulty: "easy" });
    expect(quizzes.filter((quiz) => quiz.questionType === "hierarchy")).toHaveLength(4);
    expect(quizzes.filter((quiz) => quiz.questionType === "timeline-map")).toHaveLength(4);
    expect(quizzes.every((quiz) => quiz.cards.length === 1)).toBe(true);
    expect(quizzes[0]).not.toHaveProperty("observationId");
    expect(quizzes[0].cards[0]).toMatchObject({ cardId: expect.any(String), referenceFactId: expect.any(String), targetReferenceId: expect.any(String), visitId: "v1" });
    expect(JSON.stringify(quizzes)).toBe(JSON.stringify(generateVisitQuizzes(comparableProject(), "v1", registries, referenceGraph, { difficulty: "easy" })));
  });

  it("groups normal questions into two or three cards", () => {
    const quizzes = generateVisitQuizzes(comparableProject(5), "v1", registries, referenceGraph, { difficulty: "normal" });
    expect(quizzes.filter((quiz) => quiz.questionType === "hierarchy").map((quiz) => quiz.cards.length)).toEqual([3, 3, 3, 3, 3]);
    expect(quizzes.filter((quiz) => quiz.questionType === "timeline-map").map((quiz) => quiz.cards.length)).toEqual([3, 3, 3, 3, 3]);
  });

  it("groups hard questions into four or more cards", () => {
    const quizzes = generateVisitQuizzes(comparableProject(5), "v1", registries, referenceGraph, { difficulty: "hard" });
    expect(quizzes.filter((quiz) => quiz.questionType === "hierarchy").map((quiz) => quiz.cards.length)).toEqual([4, 4, 4, 4, 4]);
    expect(quizzes.filter((quiz) => quiz.questionType === "timeline-map").map((quiz) => quiz.cards.length)).toEqual([4, 4, 4, 4, 4]);
  });

  it("caps hard questions at eight cards while keeping every group at hard difficulty", () => {
    const quizzes = generateVisitQuizzes(comparableProject(50), "v1", registries, referenceGraph, { difficulty: "hard" });
    expect(quizzes.length).toBeGreaterThan(0);
    expect(quizzes.every((quiz) => quiz.cards.length >= 4 && quiz.cards.length <= 8)).toBe(true);
  });

  it("matches difficulty availability to whether structure questions are generated", () => {
    expect(getQuizDifficultyAvailability(comparableProject(3), "v1", registries, referenceGraph).difficulties.map((item) => [item.id, item.available])).toEqual([
      ["easy", false], ["normal", false], ["hard", false],
    ]);
    expect(getQuizDifficultyAvailability(comparableProject(4), "v1", registries, referenceGraph).difficulties.every((item) => item.available)).toBe(true);
    for (const count of [3, 4]) {
      const value = comparableProject(count);
      const availability = getQuizDifficultyAvailability(value, "v1", registries, referenceGraph);
      for (const difficulty of availability.difficulties) {
        const structureQuestions = generateVisitQuizzes(value, "v1", registries, referenceGraph, { difficulty: difficulty.id })
          .filter((quiz) => quiz.questionType === "hierarchy" || quiz.questionType === "timeline-map");
        if (difficulty.available) expect(structureQuestions.length).toBeGreaterThan(0);
        else expect(structureQuestions).toEqual([]);
        for (const axis of ["taxonomy", "geological-time"]) {
          expect(difficulty.axes[axis].available).toBe(structureQuestions.some((quiz) => quiz.axis === axis));
          expect(difficulty.axes[axis].questionCount).toBe(structureQuestions.filter((quiz) => quiz.axis === axis).length);
        }
      }
    }
  });

  it("uses predicate-specific one-card prompts with a safe fallback", () => {
    expect(buildPlacementQuizPrompt("全身骨格", "livedDuring")).toBe("全身骨格が生きた時代を配置してください。");
    expect(buildPlacementQuizPrompt("森林復元模型", "occursDuring")).toBe("森林復元模型が示す時代を配置してください。");
    expect(buildPlacementQuizPrompt("未知の対象", "futurePredicate")).toBe("未知の対象に対応する位置を配置してください。");

    const changed = comparableProject();
    changed.referenceFacts.find((fact) => fact.id === "f-time").predicate = "occursDuring";
    changed.photos[0].observations[0].label = "中生代の森林復元模型";
    const timeline = generateVisitQuizzes(changed, "v1", registries, referenceGraph, { difficulty: "easy" })
      .find((quiz) => quiz.questionType === "timeline-map" && quiz.cards[0].cardId === "o1");
    expect(timeline.prompt).toBe("中生代の森林復元模型が示す時代を配置してください。");
  });

  it("uses predicate-specific prompts for homogeneous multi-card questions", () => {
    const homogeneous = generateVisitQuizzes(comparableProject(), "v1", registries, referenceGraph, { difficulty: "hard" })
      .find((quiz) => quiz.questionType === "timeline-map");
    expect(homogeneous.prompt).toBe("4件の対象が生きた時代を配置してください。");

    const changed = comparableProject();
    changed.referenceFacts.find((fact) => fact.id === "f-time").predicate = "occursDuring";
    const mixed = generateVisitQuizzes(changed, "v1", registries, referenceGraph, { difficulty: "hard" })
      .find((quiz) => quiz.questionType === "timeline-map");
    expect(mixed.prompt).toBe("4件の対象を正しい時代へ配置してください。");
  });

  it("generates structure cards from Observation-targeted ReferenceFacts", () => {
    const timeline = generateVisitQuizzes(comparableProject(), "v1", registries, referenceGraph, { difficulty: "hard" })
      .find((quiz) => quiz.questionType === "timeline-map");
    expect(timeline.cards).toEqual(expect.arrayContaining([
      expect.objectContaining({ cardId: "o1", referenceFactId: "f-time", directReferenceFact: true }),
      expect.objectContaining({ cardId: "o4", referenceFactId: "f-time-2", directReferenceFact: true }),
    ]));
  });

  it("reserves every available question type and keeps MAX_PER_TYPE question-based", () => {
    const questions = Object.entries({ hierarchy: 5, "timeline-map": 5, matching: 5, "observation-choice": 5 })
      .flatMap(([questionType, count]) => Array.from({ length: count }, (_, index) => ({ id: `${questionType}:${index}`, questionType })))
      .reverse();
    const first = selectQuizQuestions(questions);
    expect(MAX_PER_TYPE).toEqual({ hierarchy: 5, "timeline-map": 5, matching: 3, "observation-choice": 2 });
    expect(first).toHaveLength(15);
    expect(first.filter((quiz) => quiz.questionType === "hierarchy")).toHaveLength(5);
    expect(first.filter((quiz) => quiz.questionType === "timeline-map")).toHaveLength(5);
    expect(first.filter((quiz) => quiz.questionType === "matching")).toHaveLength(3);
    expect(first.filter((quiz) => quiz.questionType === "observation-choice")).toHaveLength(2);
    expect(JSON.stringify(first)).toBe(JSON.stringify(selectQuizQuestions([...questions].reverse())));
  });

  it("scores every card by stable ID and reports individual plus aggregate results", () => {
    const quiz = generateVisitQuizzes(comparableProject(), "v1", registries, referenceGraph, { difficulty: "hard" })
      .find((item) => item.questionType === "hierarchy");
    const answer = correctAnswer(quiz);
    answer.placements[0].referenceId = "taxon:root";
    const scored = scoreQuizAnswer(quiz, answer);
    expect(scored).toMatchObject({ score: 0.75, correct: false, correctCount: 3, totalCount: 4, answer });
    expect(scored.items[0]).toMatchObject({ selectedReferenceId: "taxon:root", targetReferenceId: "taxon:child", correct: false });
    expect(scored.items.slice(1).every((item) => item.correct)).toBe(true);
  });

  it("requires both normalized period boundaries and gives one matching boundary half credit", () => {
    const quiz = generateVisitQuizzes(comparableProject(), "v1", registries, referenceGraph, { difficulty: "hard" })
      .find((item) => item.questionType === "timeline-map");
    const answer = correctAnswer(quiz);
    const target = quiz.options.find((option) => option.id === quiz.cards[0].targetReferenceId);
    answer.placements[0] = { ...answer.placements[0], startMa: target.startMa, endMa: target.endMa + 1 };
    const partial = scoreQuizAnswer(quiz, answer);
    expect(partial.items[0]).toMatchObject({ stableIdCorrect: true, startCorrect: true, endCorrect: false, partial: true, score: 0.5, correct: false });
    expect(partial).toMatchObject({ score: 0.875, correctCount: 3, correct: false });

    answer.placements[0].referenceId = quiz.options.find((option) => option.id !== target.id).id;
    expect(scoreQuizAnswer(quiz, answer).items[0]).toMatchObject({ stableIdCorrect: false, partial: false, score: 0 });
  });

  it("expands one visible attempt into per-ReferenceFact results without changing placements", () => {
    const quiz = generateVisitQuizzes(comparableProject(), "v1", registries, referenceGraph, { difficulty: "hard" })
      .find((item) => item.questionType === "hierarchy");
    const scored = scoreQuizAnswer(quiz, correctAnswer(quiz));
    const entries = buildQuizResultEntries(quiz, scored);
    expect(entries).toHaveLength(4);
    expect(entries.map((entry) => entry.referenceFactId)).toEqual(["f-tax", "f-tax", "f-tax-3", "f-tax"]);
    expect(entries.every((entry) => entry.visitId === "v1" && entry.score === 1 && entry.answer === scored.answer)).toBe(true);
    const reloaded = JSON.parse(JSON.stringify(entries));
    expect(reloaded[0].answer.placements).toHaveLength(4);
  });

  it("keeps mastery at ReferenceFact granularity for a multi-card attempt", () => {
    const quiz = generateVisitQuizzes(comparableProject(), "v1", registries, referenceGraph, { difficulty: "hard" })
      .find((item) => item.questionType === "timeline-map");
    const entries = buildQuizResultEntries(quiz, scoreQuizAnswer(quiz, correctAnswer(quiz)));
    let learning = { events: [], states: [] };
    entries.forEach((entry, index) => {
      learning = recordQuizLearning({
        events: learning.events,
        states: learning.states,
        result: { id: `result-${index}`, quizId: quiz.id, attemptId: "attempt-1", answeredAt: `2026-01-01T00:00:0${index}Z`, ...entry },
      });
    });
    expect(learning.events).toHaveLength(4);
    expect(learning.states.map((state) => state.referenceFactId)).toEqual(["f-time", "f-time-2", "f-time-3", "f-time-4"]);
    expect(learning.states.every((state) => state.attemptCount === 1 && state.masteryValue === 1)).toBe(true);
  });

  it("combines all visits without changing the existing visit generator signature", () => {
    const value = project();
    value.photos[0].observations.push({ id: "o4", photoId: "p1", label: "訪問1の標本2", status: "confirmed", included: true, entityId: "e1", region: { x: 5, y: 5, w: 20, h: 20 } });
    value.photos[2].observations.push(
      { id: "o5", photoId: "p3", label: "訪問2の標本1", status: "confirmed", included: true, entityId: "e1", region: { x: 5, y: 5, w: 20, h: 20 } },
      { id: "o6", photoId: "p3", label: "訪問2の標本2", status: "confirmed", included: true, entityId: "e1", region: { x: 30, y: 5, w: 20, h: 20 } },
    );
    value.referenceFacts = value.referenceFacts.filter((fact) => fact.id !== "f-other");
    value.referenceFacts.push({ id: "f-tax-sibling", targetObservationId: "o5", predicate: "classifiedAs", value: "taxon:sibling", status: "verified", sourceType: "curated" });
    expect(generateVisitQuizzes(value, "v1", registries, referenceGraph, { difficulty: "hard" })).toEqual([]);
    const all = generateAllVisitQuizzes(value, registries, referenceGraph, { difficulty: "hard" });
    const hierarchy = all.find((quiz) => quiz.questionType === "hierarchy");
    expect(hierarchy.cards.map((card) => card.visitId)).toEqual(["v1", "v1", "v2", "v2"]);
    const entries = buildQuizResultEntries(hierarchy, scoreQuizAnswer(hierarchy, correctAnswer(hierarchy)));
    expect(entries.map((entry) => entry.visitId)).toEqual(["v1", "v1", "v2", "v2"]);
  });

  it("chooses the most detailed registered stable ID for each Observation and axis", () => {
    const graph = structuredClone(referenceGraph);
    graph.nodes.push({ id: "taxon:grandchild", label: "ティラノサウルス科", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1 });
    graph.edges.push({ id: "grandchild-edge", type: "SUBCLASS_OF", sourceId: "taxon:grandchild", targetId: "taxon:child" });
    const changed = comparableProject();
    changed.referenceFacts.push({ id: "f-specific-o1", targetObservationId: "o1", predicate: "classifiedAs", value: "taxon:grandchild", status: "verified", sourceType: "curated" });
    const hierarchy = generateVisitQuizzes(changed, "v1", registries, graph, { difficulty: "hard" }).find((quiz) => quiz.questionType === "hierarchy");
    expect(hierarchy.cards.find((card) => card.cardId === "o1")).toMatchObject({ referenceFactId: "f-specific-o1", targetReferenceId: "taxon:grandchild" });
    expect(hierarchy.options.map((option) => option.id)).toContain("taxon:grandchild");
  });

  it("does not generate a structure quiz when every comparable card has the same target", () => {
    const changed = comparableProject();
    changed.referenceFacts = changed.referenceFacts.filter((fact) => !fact.id.startsWith("f-tax-"));
    expect(generateVisitQuizzes(changed, "v1", registries, referenceGraph, { difficulty: "hard" })
      .some((quiz) => quiz.questionType === "hierarchy")).toBe(false);
    expect(getQuizDifficultyAvailability(changed, "v1", registries, referenceGraph).comparableCount).toBe(4);

    for (const fact of changed.referenceFacts.filter((fact) => fact.predicate === "livedDuring")) fact.value = "geo:period";
    expect(generateVisitQuizzes(changed, "v1", registries, referenceGraph, { difficulty: "hard" })
      .some((quiz) => quiz.questionType === "timeline-map")).toBe(false);
    expect(getQuizDifficultyAvailability(changed, "v1", registries, referenceGraph).comparableCount).toBe(0);
  });

  it("groups classifiedAs cards by sibling targets under the same direct parent", () => {
    const changed = comparableProject();
    changed.referenceFacts.push({ id: "f-sibling", targetObservationId: "o6", predicate: "classifiedAs", value: "taxon:sibling", status: "verified", sourceType: "curated" });
    const hierarchy = generateVisitQuizzes(changed, "v1", registries, referenceGraph, { difficulty: "hard" })
      .find((quiz) => quiz.questionType === "hierarchy");
    expect(hierarchy.cards.map((card) => card.targetReferenceId)).toEqual(expect.arrayContaining(["taxon:child", "taxon:sibling"]));
    expect(hierarchy.cards).toHaveLength(4);
  });

  it("unions taxonomy surroundings and keeps only the target time range plus neighbors", () => {
    const taxonomy = buildPlacementBoardDataForTargets(referenceGraph, [referenceGraph.nodes.find((node) => node.id === "taxon:child"), referenceGraph.nodes.find((node) => node.id === "taxon:sibling")], "taxonomy");
    expect(taxonomy.pathIds).toEqual(expect.arrayContaining(["taxon:root", "taxon:child", "taxon:sibling"]));
    expect(taxonomy.options.map((node) => node.id)).toEqual(["taxon:root", "taxon:child", "taxon:sibling", "taxon:not-eligible"]);
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
    expect(time.options.map((node) => node.id)).toEqual(["geo:tie-b", "geo:period", "geo:other"]);
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
    const changed = comparableProject();
    changed.referenceFacts.filter((fact) => fact.predicate === "livedDuring")
      .forEach((fact, index) => { fact.value = index % 2 ? "geo:epoch:cretaceous:early" : "geo:epoch:jurassic:early"; });
    const timeline = generateVisitQuizzes(changed, "v1", registries, graph, { difficulty: "hard" }).find((quiz) => quiz.questionType === "timeline-map");
    expect(timeline.options.map((option) => [option.id, option.label])).toEqual([
      ["geo:epoch:jurassic:early", "ジュラ紀前期"],
      ["geo:epoch:cretaceous:early", "白亜紀前期"],
    ]);
    const answer = correctAnswer(timeline);
    expect(scoreQuizAnswer(timeline, answer).correct).toBe(true);
    expect(new Set(answer.placements.map((placement) => placement.referenceId))).toEqual(new Set(["geo:epoch:jurassic:early", "geo:epoch:cretaceous:early"]));
  });

  it("keeps demo observation-choice and matching questions below the structure threshold", () => {
    const demoProject = project();
    demoProject.visits[0].source = "demo";
    const questions = generateVisitQuizzes(demoProject, "v1", registries, referenceGraph);
    expect(questions.some((quiz) => quiz.questionType === "observation-choice")).toBe(true);
    expect(questions.some((quiz) => quiz.questionType === "matching")).toBe(true);
    expect(questions.some((quiz) => quiz.questionType === "hierarchy" || quiz.questionType === "timeline-map")).toBe(false);
  });

  it("excludes ineligible references from answers while retaining them as non-placeable context", () => {
    const changed = comparableProject();
    const quizzes = generateVisitQuizzes(changed, "v1", registries, referenceGraph, { difficulty: "hard" });
    expect(quizzes.flatMap((quiz) => quiz.cards).every((card) => card.visitId === "v1" && card.referenceFactId !== "f-draft" && card.referenceFactId !== "f-old" && card.referenceFactId !== "f-other")).toBe(true);
    expect(quizzes.flatMap((quiz) => quiz.cards).every((card) => card.targetReferenceId !== "taxon:not-eligible")).toBe(true);
    expect(quizzes.find((quiz) => quiz.questionType === "hierarchy").options.find((option) => option.id === "taxon:not-eligible"))
      .toMatchObject({ placementEligible: false });
  });
});
