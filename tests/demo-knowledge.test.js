import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SAMPLE_ENTITIES, SAMPLE_PHOTOS, SAMPLE_RELATIONS, LEARNING_FACTS } from "../src/data/demo/sample-data.js";
import { DEMO_KNOWLEDGE_VERSION, DEMO_REFERENCE_FACTS, DEMO_RETIRED_REFERENCE_FACT_IDS } from "../src/data/demo/demo-knowledge.js";
import { buildReferenceGraph } from "../src/domain/reference-registry.js";
import { buildVisitKnowledgeGraph } from "../src/domain/knowledge-graph.js";
import { describeQuizAvailability, generateVisitQuizzes, getQuizDifficultyAvailability } from "../src/features/knowledge-graph/quiz-generation.js";
import { buildObservationFocusGraph } from "../src/features/knowledge-graph/selectors.js";
import { migrateProjectDocument } from "../src/features/project/migrate.js";
import { recordQuizLearning } from "../src/domain/learning-state.js";
import { verifiedReferenceOptions } from "../src/ui/reference-fact-editor.js";

const registries = { genericCategories: [], learningRoles: [], categoriesByPack: {}, entities: SAMPLE_ENTITIES };

async function referenceGraph() {
  const [manifest, taxonomy, geologicalTime] = await Promise.all([
    readFile("domain/reference/paleontology/manifest.json", "utf8").then(JSON.parse),
    readFile("domain/reference/paleontology/taxonomy.json", "utf8").then(JSON.parse),
    readFile("domain/reference/paleontology/geological-time.json", "utf8").then(JSON.parse),
  ]);
  return buildReferenceGraph({ manifest, taxonomy, geologicalTime });
}

function demoProject(overrides = {}) {
  return migrateProjectDocument(null, {
    demoPhotos: SAMPLE_PHOTOS,
    demoRelations: SAMPLE_RELATIONS,
    demoFacts: LEARNING_FACTS,
    demoReferenceFacts: [...DEMO_REFERENCE_FACTS],
    demoRetiredReferenceFactIds: [...DEMO_RETIRED_REFERENCE_FACT_IDS],
    demoKnowledgeVersion: DEMO_KNOWLEDGE_VERSION,
    demoVisitSeed: {},
    ...overrides,
  }).project;
}

describe("demo knowledge and quiz generation", () => {
  it("seeds curated ReferenceFacts into the existing demo Project", async () => {
    const project = demoProject();
    const graph = await referenceGraph();
    expect(project.referenceFacts).toHaveLength(DEMO_REFERENCE_FACTS.length);
    expect(project.referenceFacts.every((fact) => fact.status === "verified")).toBe(true);
    expect(project.referenceFacts.every((fact) => graph.nodes.some((node) => node.id === fact.value && node.status === "verified"))).toBe(true);
    const observations = new Map(project.photos.flatMap((photo) => photo.observations).map((observation) => [observation.id, observation]));
    expect(DEMO_REFERENCE_FACTS.every((fact) => observations.get(fact.targetObservationId)?.status === "confirmed")).toBe(true);
    expect(DEMO_REFERENCE_FACTS.every((fact) => fact.sourceType === "curated" && fact.sourceNote && fact.valueType === "reference")).toBe(true);
    expect(DEMO_REFERENCE_FACTS.filter((fact) => fact.predicate === "classifiedAs").every((fact) => observations.get(fact.targetObservationId)?.observationType === "physical")).toBe(true);
    expect(DEMO_REFERENCE_FACTS.filter((fact) => fact.axis === "geological-time" && observations.get(fact.targetObservationId)?.observationType === "information").every((fact) => fact.predicate === "occursDuring")).toBe(true);
    expect(DEMO_REFERENCE_FACTS.filter((fact) => ["o19a", "o19b"].includes(fact.targetObservationId)).some((fact) => fact.predicate === "classifiedAs")).toBe(false);
    expect(project.demoKnowledgeVersion).toBe(DEMO_KNOWLEDGE_VERSION);
  });

  it.each([
    ["easy", { hierarchy: 5, "timeline-map": 5, matching: 2 }],
    ["normal", { hierarchy: 5, "timeline-map": 5, matching: 2 }],
    ["hard", { hierarchy: 5, "timeline-map": 5, matching: 2 }],
  ])("generates diverse demo questions at %s difficulty", async (difficulty, expectedCounts) => {
    const project = demoProject();
    const graph = await referenceGraph();
    const first = generateVisitQuizzes(project, "visit-fukui", registries, graph, { difficulty });
    const second = generateVisitQuizzes(project, "visit-fukui", registries, graph, { difficulty });
    expect(Object.fromEntries(["hierarchy", "timeline-map", "matching"].map((type) => [type, first.filter((quiz) => quiz.questionType === type).length]))).toEqual(expectedCounts);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.every((quiz) => new Set(quiz.options.map((option) => option.id)).size === quiz.options.length)).toBe(true);
    for (const type of ["hierarchy", "timeline-map"]) {
      const structures = first.filter((quiz) => quiz.questionType === type);
      if (structures.length) expect(new Set(structures.flatMap((quiz) => quiz.cards.map((card) => card.targetReferenceId))).size).toBeGreaterThanOrEqual(2);
      expect(structures.filter((quiz) => quiz.cards.length > 1).every((quiz) => new Set(quiz.cards.map((card) => card.targetReferenceId)).size >= 2)).toBe(true);
      if (difficulty === "hard") expect(structures.every((quiz) => quiz.cards.length >= 4)).toBe(true);
    }
    const basilosaurusEocene = first.filter((quiz) => quiz.questionType === "timeline-map")
      .flatMap((quiz) => quiz.cards)
      .filter((card) => card.entityIds.includes("Entity:e-basilo") && card.targetReferenceId === "geo:epoch:eocene");
    expect(basilosaurusEocene.every((card) => card.observationId === "o07a")).toBe(true);
  });

  it("matches difficulty availability to generated structure questions and focuses timeline boards", async () => {
    const project = demoProject();
    const graph = await referenceGraph();
    const availability = getQuizDifficultyAvailability(project, "visit-fukui", registries, graph);
    expect(availability.comparableCount).toBe(12);
    for (const difficulty of availability.difficulties) {
      const structures = generateVisitQuizzes(project, "visit-fukui", registries, graph, { difficulty: difficulty.id })
        .filter((quiz) => quiz.questionType === "hierarchy" || quiz.questionType === "timeline-map");
      expect([difficulty.id, difficulty.available, structures.length]).toEqual([difficulty.id, true, 10]);
      for (const axis of ["taxonomy", "geological-time"]) {
        expect(difficulty.axes[axis].available).toBe(structures.some((quiz) => quiz.axis === axis));
        expect(difficulty.axes[axis].questionCount).toBe(structures.filter((quiz) => quiz.axis === axis).length);
      }
    }
    const hard = describeQuizAvailability(project, "visit-fukui", registries, graph, { difficulty: "hard" });
    expect(hard.axisAvailability).toMatchObject({
      taxonomy: { available: true, comparableCount: 11, minimumCount: 4, questionCount: 5 },
      "geological-time": { available: true, comparableCount: 12, minimumCount: 4, questionCount: 5 },
    });
    expect(hard.axisReasons).toEqual([]);
    expect(hard.reason).toBeNull();
    const taxonomyContext = generateVisitQuizzes(project, "visit-fukui", registries, graph, { difficulty: "hard" })
      .filter((quiz) => quiz.questionType === "hierarchy")
      .flatMap((quiz) => quiz.options)
      .find((option) => option.id === "taxon:crocodylia-pterosauria-other");
    expect(taxonomyContext).toMatchObject({ label: "ワニ、翼竜など", placementEligible: false });
    const timeline = generateVisitQuizzes(project, "visit-fukui", registries, graph, { difficulty: "easy" })
      .find((quiz) => quiz.questionType === "timeline-map");
    expect(graph.nodes.filter((node) => node.axis === "geological-time" && node.rank === "epoch" && node.quizEligible !== false)).toHaveLength(15);
    expect(timeline.options.map((option) => option.id)).toEqual(["geo:epoch:miocene", "geo:epoch:pliocene", "geo:epoch:pleistocene"]);
    expect(timeline.options.map((option) => option.startMa)).toEqual([23.04, 5.333, 2.58]);
  });

  it("builds the demo graph from the same ReferenceFacts and confirmed Relations", () => {
    const project = demoProject();
    const graph = buildVisitKnowledgeGraph(project, "visit-fukui", registries);
    expect(graph.nodes.filter((node) => node.type === "ReferenceFact")).toHaveLength(DEMO_REFERENCE_FACTS.length);
    expect(graph.edges.filter((edge) => edge.type === "RELATES_TO" && edge.status === "confirmed").length).toBeGreaterThanOrEqual(2);
    expect(graph.metadata.includesUiState).toBe(false);
  });

  it("exposes the curated mammal hierarchy in graph focus and reference fact editor options", async () => {
    const project = demoProject();
    const graph = await referenceGraph();
    const visitGraph = buildVisitKnowledgeGraph(project, "visit-fukui", registries);
    const focus = buildObservationFocusGraph(visitGraph, "Observation:o07a", graph, registries);
    expect(focus.nodes.find((node) => node.id === "Reference:taxon:cetacea")).toMatchObject({
      label: "クジラ類",
      axis: "taxonomy",
      status: "verified",
    });
    expect(focus.nodes.map((node) => node.id)).toEqual(expect.arrayContaining([
      "Reference:taxon:eutheria",
      "Reference:taxon:theria",
      "Reference:taxon:mammalia",
    ]));
    const editorOptionIds = new Set(verifiedReferenceOptions(graph).map((node) => node.id));
    for (const id of ["taxon:mammalia", "taxon:primates", "taxon:cetacea", "taxon:proboscidea"]) {
      expect(editorOptionIds.has(id)).toBe(true);
    }
    expect(editorOptionIds.has("taxon:mammals-other")).toBe(false);
  });

  it("adds the seed once without overwriting an edited demo Project", () => {
    const project = demoProject();
    project.demoKnowledgeVersion = null;
    project.photos[0].experienceMemo = "利用者が追記したメモ";
    project.relations = project.relations.slice(0, 1);
    const migrated = migrateProjectDocument(project, {
      demoPhotos: SAMPLE_PHOTOS,
      demoRelations: SAMPLE_RELATIONS,
      demoFacts: LEARNING_FACTS,
      demoReferenceFacts: [...DEMO_REFERENCE_FACTS],
      demoRetiredReferenceFactIds: [...DEMO_RETIRED_REFERENCE_FACT_IDS],
      demoKnowledgeVersion: DEMO_KNOWLEDGE_VERSION,
      demoVisitSeed: {},
    }).project;
    expect(migrated.photos[0].experienceMemo).toBe("利用者が追記したメモ");
    expect(migrated.relations).toHaveLength(SAMPLE_RELATIONS.length);
    expect(migrated.referenceFacts).toHaveLength(DEMO_REFERENCE_FACTS.length);
  });

  it("removes retired bundled facts while preserving user facts during a demo upgrade", () => {
    const saved = demoProject();
    const userFact = {
      id: "demo-rf-o19b-pterosauria",
      targetObservationId: "o18a",
      predicate: "classifiedAs",
      value: "taxon:archosauria",
      status: "verified",
      sourceType: "user",
      sourceNote: "利用者が自作した知識",
    };
    saved.referenceFacts.push(
      { id: "demo-rf-o19a-pterosauria", targetObservationId: "o19a", predicate: "classifiedAs", value: "taxon:archosauria", status: "verified", sourceType: "curated" },
      userFact,
    );
    saved.demoKnowledgeVersion = "2026-08-10.2";
    const migrated = migrateProjectDocument(saved, {
      demoPhotos: SAMPLE_PHOTOS,
      demoRelations: SAMPLE_RELATIONS,
      demoFacts: LEARNING_FACTS,
      demoReferenceFacts: [...DEMO_REFERENCE_FACTS],
      demoRetiredReferenceFactIds: [...DEMO_RETIRED_REFERENCE_FACT_IDS],
      demoKnowledgeVersion: DEMO_KNOWLEDGE_VERSION,
      demoVisitSeed: {},
    }).project;
    expect(migrated.referenceFacts.some((fact) => DEMO_RETIRED_REFERENCE_FACT_IDS.includes(fact.id) && fact.sourceType === "curated")).toBe(false);
    expect(migrated.referenceFacts.find((fact) => fact.id === userFact.id && fact.sourceType === "user")).toEqual(userFact);
  });

  it("補充したデモRelationから既存v2プロジェクトにもマッチング問題を生成する", async () => {
    const saved = demoProject();
    saved.relations = saved.relations.filter((relation) => relation.id !== "r06");
    saved.demoKnowledgeVersion = "2026-08-07.1";
    const migrated = migrateProjectDocument(saved, {
      demoPhotos: SAMPLE_PHOTOS,
      demoRelations: SAMPLE_RELATIONS,
      demoFacts: LEARNING_FACTS,
      demoReferenceFacts: [...DEMO_REFERENCE_FACTS],
      demoRetiredReferenceFactIds: [...DEMO_RETIRED_REFERENCE_FACT_IDS],
      demoKnowledgeVersion: DEMO_KNOWLEDGE_VERSION,
      demoVisitSeed: {},
    }).project;
    const quizzes = generateVisitQuizzes(
      migrated,
      "visit-fukui",
      registries,
      await referenceGraph(),
    );
    expect(migrated.relations.some((relation) => relation.id === "r06")).toBe(true);
    expect(quizzes.some((quiz) => quiz.id === "quiz:matching:r06")).toBe(true);
  });

  it("records non-ReferenceFact demo answers as events without inventing a knowledge state", () => {
    const result = recordQuizLearning({
      events: [],
      states: [],
      userId: "user-local",
      result: {
        id: "demo-result-1",
        visitId: "visit-fukui",
        quizId: "quiz:matching:r06",
        referenceFactId: null,
        score: 1,
        correct: true,
        answeredAt: "2026-08-07T00:00:00.000Z",
      },
    });
    expect(result.events).toHaveLength(1);
    expect(result.events[0].referenceFactId).toBeNull();
    expect(result.states).toEqual([]);
  });
});
