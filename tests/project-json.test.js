import { describe, expect, it } from "vitest";
import {
  buildExportDocument,
  documentToProject,
  parseSchemaVersion,
  PROJECT_FORMAT,
  readProjectFile,
  SCHEMA_VERSION,
  validateProjectDocument,
} from "../src/features/project/project-json.js";

/** @returns {any} */
function sampleProject() {
  return {
    id: "default",
    userId: "user-local",
    activeVisitId: "visit-1",
    visits: [{ id: "visit-1", title: "訪問", source: "user" }],
    updatedAt: 0,
    photos: [
      {
        id: "p01",
        visitId: "visit-1",
        file: "a.jpg",
        order: 1,
        title: "展示ケース",
        status: "organized",
        source: "sample",
        observations: [
          {
            id: "o01a",
            photoId: "p01",
            label: "骨格標本",
            observationType: "physical",
            region: { x: 1, y: 2, w: 3, h: 4 },
            genericCategories: ["exhibit-object"],
            learningRoles: ["direct"],
            domainPacks: ["paleontology"],
            domainCategories: ["skeleton"],
            entityId: null,
            confidence: 0.9,
            status: "confirmed",
            included: true,
          },
          {
            id: "o01b",
            photoId: "p01",
            label: "説明パネル",
            observationType: "information",
            region: null,
            genericCategories: ["explanation-panel"],
            learningRoles: ["explains"],
            domainPacks: ["paleontology"],
            domainCategories: [],
            entityId: null,
            confidence: 0.4,
            status: "suggested",
            included: false,
          },
        ],
      },
      {
        id: "p99",
        visitId: "visit-1",
        file: "mine.jpg",
        order: 2,
        title: "自分の写真",
        status: "unorganized",
        source: "upload",
        observations: [],
      },
    ],
    relations: [
      {
        id: "r1",
        sourceId: "o01a",
        targetId: "o01b",
        type: "explains",
        status: "confirmed",
      },
    ],
    facts: [{ id: "f1", status: "learned" }],
    entities: [{ id: "e1", name: "ティラノサウルス" }],
    referenceFacts: [{ id: "rf1", subjectId: "e1", status: "verified" }],
    learningEvents: [{ id: "event-1", referenceFactId: "rf1", result: 1 }],
    userKnowledgeStates: [{ userId: "user-local", visitId: "visit-1", referenceFactId: "rf1", masteryValue: 1 }],
    referenceDataVersion: "paleo-2026-07",
    sourceMetadata: { curator: "museum-team", reviewedAt: "2026-07-30" },
    quizResults: [
      {
        deck: "observed",
        score: 3,
        total: 5,
        completedAt: "2026-07-28T00:00:00.000Z",
      },
    ],
  };
}

/** @returns {any} */
function exportDoc() {
  return buildExportDocument({
    project: sampleProject(),
    visit: { id: "visit-1", title: "訪問" },
    entities: [{ id: "e1", name: "ティラノサウルス" }],
    learningFacts: [
      { id: "f1", targetId: "o01a", label: "詳しい話", status: "locked" },
    ],
    collections: [{ id: "c1", title: "コレクション" }],
    quizResults: sampleProject().quizResults,
  });
}

describe("buildExportDocument", () => {
  it("stamps the format and a semantic schemaVersion", () => {
    const doc = exportDoc();
    expect(doc.format).toBe(PROJECT_FORMAT);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parseSchemaVersion(doc.schemaVersion)).toEqual({
      major: 2,
      minor: 0,
      patch: 0,
    });
  });

  it("normalises observations out of their photos, keeping photoId", () => {
    const doc = exportDoc();
    expect(doc.photos).toHaveLength(2);
    expect(doc.observations).toHaveLength(2);
    expect(
      doc.observations.every(
        (/** @type {any} */ o) => typeof o.photoId === "string",
      ),
    ).toBe(true);
  });

  it("records an excluded observation as rejected rather than dropping it", () => {
    const rejected = exportDoc().observations.find(
      (/** @type {any} */ o) => o.id === "o01b",
    );
    expect(rejected.status).toBe("rejected");
  });

  it("keeps an unknown concrete name as null instead of inventing one", () => {
    expect(
      exportDoc().observations.every(
        (/** @type {any} */ o) => o.entityId === null,
      ),
    ).toBe(true);
  });

  it("never embeds photo binaries", () => {
    const text = JSON.stringify(exportDoc());
    expect(text).not.toMatch(/data:image\//);
    expect(text).not.toMatch(/base64/);
    expect(exportDoc().project.photoStorage).toBe("indexeddb");
  });

  it("carries quiz results and omits derived collection state", () => {
    const doc = exportDoc();
    expect(doc.quizResults).toHaveLength(1);
    expect(doc.collections).toBeUndefined();
    expect(doc.learningFacts).toBeUndefined();
    expect(doc.referenceFacts).toHaveLength(1);
    expect(doc.learningEvents).toHaveLength(1);
    expect(doc.userKnowledgeStates).toHaveLength(1);
  });

  it("round-trips visits, ReferenceFacts, and learning history without image bytes", () => {
    const source = /** @type {any} */ (exportDoc());
    const restored = documentToProject(source, new Set(["p01", "p99"]), "default").project;
    expect(restored.visits).toEqual(source.project.visits);
    expect(restored.referenceFacts).toEqual(source.referenceFacts);
    expect(restored.learningEvents).toEqual(source.learningEvents);
    expect(restored.userKnowledgeStates).toEqual(source.userKnowledgeStates);
    expect(restored.referenceDataVersion).toBe("paleo-2026-07");
    expect(restored.sourceMetadata).toEqual(source.sourceMetadata);
    expect(JSON.stringify(source)).not.toMatch(/data:image\//);
  });

  it("keeps an explicitly empty entity list empty across import and re-export", () => {
    const source = /** @type {any} */ (exportDoc());
    source.entities = [];
    source.referenceFacts = [];
    const imported = documentToProject(source, new Set(["p01", "p99"]), "default").project;
    const reExported = /** @type {any} */ (buildExportDocument({ project: imported }));
    expect(imported.entities).toEqual([]);
    expect(reExported.entities).toEqual([]);
  });

  it("retains legacy facts without reclassifying them as ReferenceFact", () => {
    expect(exportDoc().legacyFacts[0].status).toBe("learned");
  });
});

describe("validateProjectDocument", () => {
  it("accepts a document this app produced", () => {
    const result = validateProjectDocument(exportDoc());
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.counts).toEqual({
        photos: 2,
        observations: 2,
        relations: 1,
      });
  });

  it.each([
    ["null", null],
    ["an array", []],
    ["a string", "nope"],
    ["a number", 42],
  ])("refuses %s", (_label, value) => {
    expect(validateProjectDocument(value).ok).toBe(false);
  });

  it("refuses another app’s JSON", () => {
    const result = validateProjectDocument({
      format: "something-else",
      schemaVersion: "1.0.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("形式ではありません");
  });

  it("refuses a future major version instead of guessing", () => {
    const result = validateProjectDocument({
      ...exportDoc(),
      schemaVersion: "3.0.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("対応していません");
  });

  it("refuses malformed v2 metadata before import can apply it", () => {
    const doc = /** @type {any} */ (exportDoc());
    doc.project.visits = "broken";
    const result = validateProjectDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("project.visits");
  });

  it.each([
    ["duplicate entity id", (doc) => { doc.entities.push({ id: "e1" }); }],
    ["dangling relation", (doc) => { doc.relations[0].targetId = "missing"; }],
    ["invalid active visit", (doc) => { doc.project.activeVisitId = "missing"; }],
    ["invalid photo visit", (doc) => { doc.photos[0].visitId = "missing"; }],
    ["invalid ReferenceFact subject", (doc) => { doc.referenceFacts[0].subjectId = "missing"; }],
    ["invalid ReferenceFact value", (doc) => { doc.referenceFacts[0].valueType = "entity-reference"; doc.referenceFacts[0].value = "missing"; }],
    ["invalid ReferenceFact observationId", (doc) => { doc.referenceFacts[0].observationId = "missing"; }],
    ["invalid ReferenceFact targetObservationId", (doc) => { doc.referenceFacts[0].targetObservationId = "missing"; }],
  ])("rejects %s without accepting the document", (_label, mutate) => {
    const doc = /** @type {any} */ (exportDoc());
    mutate(doc);
    expect(validateProjectDocument(doc).ok).toBe(false);
  });

  it("accepts and round-trips valid Observation references on a ReferenceFact", () => {
    const doc = /** @type {any} */ (exportDoc());
    doc.referenceFacts[0].observationId = "o01a";
    doc.referenceFacts[0].targetObservationId = "o01a";
    expect(validateProjectDocument(doc).ok).toBe(true);
    const restored = documentToProject(doc, new Set(["p01", "p99"]), "default").project;
    expect(/** @type {any} */ (buildExportDocument({ project: restored })).referenceFacts[0]).toMatchObject({ observationId: "o01a", targetObservationId: "o01a" });
  });

  it("accepts a newer minor version of the same major", () => {
    expect(
      validateProjectDocument({ ...exportDoc(), schemaVersion: "1.4.2" }).ok,
    ).toBe(true);
  });

  it("refuses an unparseable schemaVersion", () => {
    expect(
      validateProjectDocument({ ...exportDoc(), schemaVersion: 2 }).ok,
    ).toBe(false);
    expect(
      validateProjectDocument({ ...exportDoc(), schemaVersion: "v1" }).ok,
    ).toBe(false);
  });

  it("refuses a document whose arrays are not arrays", () => {
    expect(validateProjectDocument({ ...exportDoc(), photos: {} }).ok).toBe(
      false,
    );
    expect(
      validateProjectDocument({ ...exportDoc(), observations: null }).ok,
    ).toBe(false);
    expect(validateProjectDocument({ ...exportDoc(), relations: "x" }).ok).toBe(
      false,
    );
  });

  it("refuses an observation pointing at a photo that is not in the file", () => {
    const doc = exportDoc();
    doc.observations[0].photoId = "ghost";
    const result = validateProjectDocument(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("存在しない写真");
  });

  it("refuses a photo without an id", () => {
    const doc = exportDoc();
    delete doc.photos[0].id;
    expect(validateProjectDocument(doc).ok).toBe(false);
  });
});

describe("readProjectFile", () => {
  it("reports broken JSON without throwing", async () => {
    const result = await readProjectFile(
      new Blob(["{ not json"], { type: "application/json" }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("JSONとして解釈できません");
  });

  it("round-trips a real export", async () => {
    const blob = new Blob([JSON.stringify(exportDoc())], {
      type: "application/json",
    });
    const result = await readProjectFile(blob);
    expect(result.ok).toBe(true);
  });
});

describe("documentToProject", () => {
  it("marks photos whose binary is absent as missing rather than broken", () => {
    const { project, missingPhotoIds } = documentToProject(
      exportDoc(),
      new Set(),
      "default",
    );
    expect(missingPhotoIds).toEqual(["p99"]);
    expect(project.photos.find((p) => p.id === "p99")?.photoMissing).toBe(true);
    // The bundled sample photo ships with the app, so it is never "missing".
    expect(project.photos.find((p) => p.id === "p01")?.photoMissing).toBe(
      false,
    );
  });

  it("re-attaches a photo once its binary is present again", () => {
    const { missingPhotoIds } = documentToProject(
      exportDoc(),
      new Set(["p99"]),
      "default",
    );
    expect(missingPhotoIds).toEqual([]);
  });

  it("rebuilds one photo holding several observations", () => {
    const { project } = documentToProject(
      exportDoc(),
      new Set(["p99"]),
      "default",
    );
    const photo = project.photos.find((p) => p.id === "p01");
    expect(photo?.observations).toHaveLength(2);
  });

  it("restores the rejected flag as included:false", () => {
    const { project } = documentToProject(exportDoc(), new Set(), "default");
    const observations =
      project.photos.find((p) => p.id === "p01")?.observations ?? [];
    expect(
      observations.find((/** @type {any} */ o) => o.id === "o01b")?.included,
    ).toBe(false);
    expect(
      observations.find((/** @type {any} */ o) => o.id === "o01a")?.included,
    ).toBe(true);
  });
});
