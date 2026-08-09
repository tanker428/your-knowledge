import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { SAMPLE_ENTITIES, SAMPLE_PHOTOS, SAMPLE_RELATIONS, LEARNING_FACTS } from "../src/data/demo/sample-data.js";
import { DEMO_KNOWLEDGE_VERSION, DEMO_REFERENCE_FACTS } from "../src/data/demo/demo-knowledge.js";
import { buildReferenceGraph } from "../src/domain/reference-registry.js";
import { buildVisitKnowledgeGraph } from "../src/domain/knowledge-graph.js";
import { generateVisitQuizzes } from "../src/features/knowledge-graph/quiz-generation.js";
import { migrateProjectDocument } from "../src/features/project/migrate.js";
import { recordQuizLearning } from "../src/domain/learning-state.js";

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
    expect(project.demoKnowledgeVersion).toBe(DEMO_KNOWLEDGE_VERSION);
  });

  it("generates deterministic demo questions in at least three forms", async () => {
    const project = demoProject();
    const graph = await referenceGraph();
    const first = generateVisitQuizzes(project, "visit-fukui", registries, graph);
    const second = generateVisitQuizzes(project, "visit-fukui", registries, graph);
    expect(first.length).toBeGreaterThanOrEqual(5);
    expect(new Set(first.map((quiz) => quiz.questionType)).size).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.every((quiz) => new Set(quiz.options.map((option) => option.id)).size === quiz.options.length)).toBe(true);
    expect(first.filter((quiz) => quiz.questionType === "timeline-map").every((quiz) => quiz.options.some((option) => option.id === quiz.targetReferenceId))).toBe(true);
  });

  it("builds the demo graph from the same ReferenceFacts and confirmed Relations", () => {
    const project = demoProject();
    const graph = buildVisitKnowledgeGraph(project, "visit-fukui", registries);
    expect(graph.nodes.filter((node) => node.type === "ReferenceFact")).toHaveLength(DEMO_REFERENCE_FACTS.length);
    expect(graph.edges.filter((edge) => edge.type === "RELATES_TO" && edge.status === "confirmed").length).toBeGreaterThanOrEqual(2);
    expect(graph.metadata.includesUiState).toBe(false);
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
      demoKnowledgeVersion: DEMO_KNOWLEDGE_VERSION,
      demoVisitSeed: {},
    }).project;
    expect(migrated.photos[0].experienceMemo).toBe("利用者が追記したメモ");
    expect(migrated.relations).toHaveLength(SAMPLE_RELATIONS.length);
    expect(migrated.referenceFacts).toHaveLength(DEMO_REFERENCE_FACTS.length);
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
