import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { getLearnedReferenceFacts } from "../src/domain/learned-reference-facts.js";

function project() {
  return {
    userId: "user-1",
    photos: [
      { id: "photo-1", visitId: "visit-1", title: "骨格展示", observations: [{ id: "obs-1", photoId: "photo-1", label: "骨格", included: true, status: "confirmed", entityId: "entity-1", region: { x: 10, y: 20, w: 30, h: 40 } }] },
      { id: "photo-2", visitId: "visit-2", title: "別訪問", observations: [{ id: "obs-2", photoId: "photo-2", label: "別対象", included: true, status: "confirmed", entityId: "entity-2", region: null }] },
    ],
    entities: [{ id: "entity-1", name: "バシロサウルス" }, { id: "entity-2", name: "別対象" }],
    referenceFacts: [
      { id: "fact-learned", subjectId: "entity-1", predicate: "classifiedAs", value: "taxon:whale", status: "verified" },
      { id: "fact-unseen", targetObservationId: "obs-1", predicate: "livedDuring", value: "geo:eocene", status: "verified" },
      { id: "fact-other", subjectId: "entity-2", predicate: "classifiedAs", value: "taxon:other", status: "verified" },
    ],
    userKnowledgeStates: [
      { userId: "user-1", visitId: "visit-1", referenceFactId: "fact-learned", masteryValue: 1, attemptCount: 2, correctCount: 1, lastAnsweredAt: "2026-08-01T00:00:00Z" },
      { userId: "user-1", visitId: "visit-1", referenceFactId: "fact-unseen", masteryValue: 0, attemptCount: 1, correctCount: 0, lastAnsweredAt: "2026-08-01T00:01:00Z" },
      { userId: "user-1", visitId: "visit-2", referenceFactId: "fact-other", masteryValue: 1, attemptCount: 1, correctCount: 1, lastAnsweredAt: "2026-08-01T00:02:00Z" },
    ],
    learningEvents: [{ userId: "user-1", visitId: "visit-1", referenceFactId: "fact-learned", questionId: "question-1" }],
  };
}

describe("learned ReferenceFact selector", () => {
  it("shows only masteryValue 1 and connects Entity, Observation, and Photo", () => {
    const results = getLearnedReferenceFacts(project(), "visit-1", "user-1");
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      fact: { id: "fact-learned" },
      entity: { id: "entity-1", name: "バシロサウルス" },
      observation: { id: "obs-1", label: "骨格" },
      photo: { id: "photo-1", title: "骨格展示" },
      questionId: "question-1",
    });
    expect(results[0].state).toMatchObject({ lastAnsweredAt: "2026-08-01T00:00:00Z", attemptCount: 2, correctCount: 1 });
  });

  it("keeps visits isolated and hides a fact after a retry makes mastery zero", () => {
    const first = project();
    expect(getLearnedReferenceFacts(first, "visit-2", "user-1").map((item) => item.fact.id)).toEqual(["fact-other"]);
    first.userKnowledgeStates[0].masteryValue = 0;
    expect(getLearnedReferenceFacts(first, "visit-1", "user-1")).toEqual([]);
    first.referenceFacts = first.referenceFacts.filter((fact) => fact.id !== "fact-learned");
    expect(getLearnedReferenceFacts(first, "visit-1", "user-1")).toEqual([]);
  });

  it("wires the learned mode to the app UI without legacy knowledge types", async () => {
    const source = await readFile(new URL("../src/ui/app.js", import.meta.url), "utf8");
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    expect(source).toContain("getLearnedReferenceFacts");
    expect(source).toContain("getLearnedReferenceFacts");
    expect(source).toContain("renderLearnedReferenceFacts");
    expect(html).toContain('data-knowledge-mode="learned"');
    expect(source).not.toContain("KnowledgeFact");
    expect(source).not.toContain("LearningFact");
    expect(source).not.toContain("LearningState");
  });
});
