import { describe, expect, it } from "vitest";
import { buildVisitKnowledgeGraph, getGraphNodesByType, validateKnowledgeGraph } from "../src/domain/knowledge-graph.js";
import { getLearnedReferenceFacts } from "../src/domain/learned-reference-facts.js";
import { recordQuizLearning, removeVisitLearningRecords } from "../src/domain/learning-state.js";
import { buildCollectionProgress } from "../src/features/collections/collection-progress.js";
import { generateVisitQuizzes, scoreQuizAnswer } from "../src/features/knowledge-graph/quiz-generation.js";
import { buildExportDocument, documentToProject, validateProjectDocument } from "../src/features/project/project-json.js";

const userId = "user-1";

const registries = {
  genericCategories: [{ id: "exhibit", label: "展示物" }, { id: "panel", label: "説明パネル" }],
  learningRoles: [{ id: "subject", label: "主対象" }],
  categoriesByPack: { paleo: [{ id: "skeleton", label: "骨格", axis: "taxonomy" }] },
};

const referenceGraph = {
  nodes: [
    { id: "taxon:root", label: "四足類", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1 },
    { id: "taxon:child", label: "獣脚類", labelEn: "Theropoda", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 2 },
    { id: "taxon:sibling", label: "竜脚形類", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 3 },
    { id: "geo:older", label: "三畳紀", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1, startMa: 251.9, endMa: 201.4 },
    { id: "geo:period", label: "ジュラ紀", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 2, startMa: 201.4, endMa: 145 },
    { id: "geo:newer", label: "白亜紀", axis: "geological-time", rank: "period", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 3, startMa: 145, endMa: 66 },
  ],
  edges: [
    { id: "taxon-child-of-root", type: "SUBCLASS_OF", sourceId: "taxon:child", targetId: "taxon:root" },
  ],
  metadata: { displayRootIdsByAxis: { taxonomy: ["taxon:root"], "geological-time": ["geo:older", "geo:period", "geo:newer"] } },
};

function createProject() {
  return {
    id: "project-1",
    userId,
    updatedAt: 1,
    facts: [],
    activeVisitId: "visit-user",
    visits: [
      { id: "visit-user", title: "自然史博物館", placeName: "自然史博物館", visitedAt: "2026-07-30", createdAt: 1, updatedAt: 1, source: "user", domainPackIds: ["paleo"] },
      { id: "visit-demo", title: "デモ訪問", placeName: "デモ館", visitedAt: "2026-07-29", createdAt: 1, updatedAt: 1, source: "demo", domainPackIds: ["paleo"] },
    ],
    photos: [
      {
        id: "photo-user-1", visitId: "visit-user", title: "骨格展示", order: 1, source: "user", file: "bone.jpg",
        capturedAt: "2026-07-30T10:00:00Z", fileLastModified: 1, experienceMemo: "大きな展示だった",
        observations: [{
          id: "observation-bone", photoId: "photo-user-1", label: "骨格", observationType: "physical",
          region: { x: 10, y: 20, w: 40, h: 30 }, genericCategories: ["exhibit"], domainCategories: ["skeleton"],
          classificationAssertions: [{ id: "assertion-bone", categoryType: "domain", categoryId: "skeleton", status: "confirmed" }],
          learningRoles: ["subject"], domainPacks: ["paleo"], entityId: "entity-basilosaurus", status: "confirmed", included: true,
        }],
      },
      {
        id: "photo-user-2", visitId: "visit-user", title: "説明パネル", order: 2, source: "user", file: "panel.jpg",
        observations: [{
          id: "observation-panel", photoId: "photo-user-2", label: "説明パネル", observationType: "information",
          region: null, genericCategories: ["panel"], domainCategories: [], learningRoles: [], entityId: null, status: "confirmed", included: true,
        }],
      },
      {
        id: "photo-demo", visitId: "visit-demo", title: "デモ展示", order: 1, source: "sample", file: "demo.jpg",
        observations: [{ id: "observation-demo", photoId: "photo-demo", label: "デモ対象", status: "confirmed", included: true, entityId: "entity-demo" }],
      },
    ],
    relations: [
      { id: "relation-explains", sourceId: "observation-panel", targetId: "observation-bone", type: "explains", directed: true, status: "confirmed", origin: "user", confidence: 1 },
      { id: "relation-demo", sourceId: "observation-demo", targetId: "observation-bone", type: "explains", directed: true, status: "confirmed", origin: "sample", confidence: 1 },
    ],
    entities: [
      { id: "entity-basilosaurus", name: "バシロサウルス", entityType: "animal", status: "verified" },
      { id: "entity-demo", name: "デモ対象", entityType: "animal", status: "verified" },
    ],
    referenceFacts: [
      { id: "reference-taxonomy", subjectId: "entity-basilosaurus", predicate: "classifiedAs", value: "taxon:child", sourceType: "curated", status: "verified" },
      { id: "reference-time", targetObservationId: "observation-bone", predicate: "livedDuring", value: "geo:period", sourceType: "curated", status: "verified" },
      { id: "reference-demo", subjectId: "entity-demo", predicate: "classifiedAs", value: "taxon:child", sourceType: "curated", status: "verified" },
      { id: "reference-draft", subjectId: "entity-basilosaurus", predicate: "classifiedAs", value: "taxon:sibling", sourceType: "curated", status: "draft" },
    ],
    quizResults: [],
    learningEvents: [],
    userKnowledgeStates: [],
    referenceDataVersion: "paleo-1",
    sourceMetadata: { reference: "curated-fixture" },
  };
}

function correctResult(question, index) {
  const scored = scoreQuizAnswer(question, { placements: [{ cardId: question.observationId, referenceId: question.targetReferenceId }] });
  return {
    id: `result-${index}`,
    visitId: "visit-user",
    quizId: question.id,
    referenceFactId: question.referenceFactId,
    answer: scored.answer,
    score: scored.score,
    correct: scored.correct,
    attemptId: `attempt-${index}`,
    deckAttemptId: "deck-1",
    answeredAt: `2026-07-30T10:0${index}:00Z`,
  };
}

describe("Issue #10 core loop integration", () => {
  it("runs Visit -> KG -> quizzes -> learning state -> learned facts -> collection -> JSON v2 reload", () => {
    const project = /** @type {any} */ (createProject());
    const graph = buildVisitKnowledgeGraph(project, project.activeVisitId, registries);
    expect(() => validateKnowledgeGraph(graph)).not.toThrow();
    expect(getGraphNodesByType(graph, "Photo").map((node) => node.photoId)).toEqual(["photo-user-1", "photo-user-2"]);
    expect(graph.nodes.some((node) => node.id.includes("demo"))).toBe(false);
    expect(graph.edges.some((edge) => edge.relationId === "relation-explains")).toBe(true);

    const quizzes = generateVisitQuizzes(project, project.activeVisitId, registries, referenceGraph);
    expect(quizzes.map((quiz) => quiz.questionType)).toEqual(["hierarchy", "timeline-map"]);
    expect(quizzes.every((quiz) => quiz.photoId === "photo-user-1")).toBe(true);
    expect(quizzes[0].region).toEqual({ x: 10, y: 20, w: 40, h: 30 });

    for (const [index, question] of quizzes.entries()) {
      const result = correctResult(question, index + 1);
      project.quizResults.push(result);
      const recorded = recordQuizLearning({ events: project.learningEvents, states: project.userKnowledgeStates, result, userId });
      project.learningEvents = recorded.events;
      project.userKnowledgeStates = recorded.states;
    }

    expect(project.learningEvents).toHaveLength(2);
    expect(project.userKnowledgeStates).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId, visitId: "visit-user", referenceFactId: "reference-taxonomy", masteryValue: 1, attemptCount: 1, correctCount: 1 }),
      expect.objectContaining({ userId, visitId: "visit-user", referenceFactId: "reference-time", masteryValue: 1, attemptCount: 1, correctCount: 1 }),
    ]));
    expect(getLearnedReferenceFacts(project, "visit-user", userId).map((item) => item.fact.id)).toEqual(["reference-taxonomy", "reference-time"]);
    expect(getLearnedReferenceFacts(project, "visit-demo", userId)).toEqual([]);
    expect(buildCollectionProgress(project, "visit-user", userId, registries)[0]).toMatchObject({ observationCount: 2, counts: { discovery: 2, organize: 2, relation: 2, learning: 1 } });

    const document = buildExportDocument({ project });
    expect(validateProjectDocument(document).ok).toBe(true);
    const reloaded = documentToProject(document, new Set(["photo-user-1", "photo-user-2", "photo-demo"]), "project-1").project;
    expect(reloaded.quizResults).toEqual(project.quizResults);
    expect(reloaded.learningEvents).toEqual(project.learningEvents);
    expect(reloaded.userKnowledgeStates).toEqual(project.userKnowledgeStates);
    expect(getLearnedReferenceFacts(reloaded, "visit-user", userId).map((item) => item.fact.id)).toEqual(["reference-taxonomy", "reference-time"]);
    expect(buildCollectionProgress(reloaded, "visit-user", userId, registries)[0].percent).toBe(80);
  });

  it("keeps retry history, updates mastery from the latest answer, and isolates deletion by Visit", () => {
    const project = /** @type {any} */ (createProject());
    const question = generateVisitQuizzes(project, "visit-user", registries, referenceGraph).find((item) => item.referenceFactId === "reference-taxonomy");
    const first = correctResult(question, 1);
    let recorded = recordQuizLearning({ events: [], states: [], result: first, userId });
    const retry = { ...first, id: "result-retry", attemptId: "attempt-retry", deckAttemptId: "deck-2", answeredAt: "2026-07-31T10:00:00Z", score: 0, correct: false, answer: { placements: [] } };
    recorded = recordQuizLearning({ events: recorded.events, states: recorded.states, result: retry, userId });
    expect(recorded.events).toHaveLength(2);
    expect(recorded.events.map((event) => event.attemptId)).toEqual(["attempt-1", "attempt-retry"]);
    expect(recorded.states).toEqual([expect.objectContaining({ referenceFactId: "reference-taxonomy", masteryValue: 0, attemptCount: 2, correctCount: 1, lastResult: 0 })]);

    project.learningEvents = recorded.events;
    project.userKnowledgeStates = recorded.states;
    expect(getLearnedReferenceFacts(project, "visit-user", userId)).toEqual([]);
    const removed = removeVisitLearningRecords(project.learningEvents, project.userKnowledgeStates, "visit-user");
    expect(removed.events).toEqual([]);
    expect(removed.states).toEqual([]);
    expect(project.visits.some((visit) => visit.id === "visit-demo")).toBe(true);
    expect(project.referenceFacts.find((fact) => fact.id === "reference-demo")).toBeDefined();
  });

  it("does not allow a demo Visit to leak into the user flow or JSON reload", () => {
    const project = /** @type {any} */ (createProject());
    const userGraph = buildVisitKnowledgeGraph(project, "visit-user", registries);
    const demoGraph = buildVisitKnowledgeGraph(project, "visit-demo", registries);
    expect(userGraph.nodes.some((node) => node.id.includes("demo"))).toBe(false);
    expect(demoGraph.nodes.some((node) => ["Photo:photo-user-1", "Photo:photo-user-2", "Observation:observation-bone", "Observation:observation-panel", "Entity:entity-basilosaurus"].includes(node.id))).toBe(false);
    const document = buildExportDocument({ project });
    const reloaded = documentToProject(document, new Set(["photo-user-1", "photo-user-2", "photo-demo"]), "project-1").project;
    expect(reloaded.activeVisitId).toBe("visit-user");
    expect(reloaded.photos.filter((photo) => photo.visitId === "visit-user")).toHaveLength(2);
    expect(reloaded.photos.filter((photo) => photo.visitId === "visit-demo")).toHaveLength(1);
  });
});
