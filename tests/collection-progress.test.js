import { describe, expect, it } from "vitest";
import { buildCollectionProgress } from "../src/features/collections/collection-progress.js";

function project() {
  return {
    userId: "user-1",
    visits: [
      { id: "visit-1", title: "博物館訪問" },
      { id: "visit-2", title: "別の訪問" },
    ],
    photos: [
      {
        id: "photo-1", visitId: "visit-1", title: "展示室",
        observations: [
          { id: "obs-1", label: "骨格", status: "confirmed", included: true, genericCategories: ["exhibit"], domainCategories: ["skeleton"], entityId: "entity-1" },
          { id: "obs-2", label: "説明", status: "suggested", included: true, genericCategories: ["panel"], domainCategories: ["skeleton"] },
        ],
      },
      {
        id: "photo-2", visitId: "visit-2",
        observations: [{ id: "obs-other", status: "confirmed", included: true, genericCategories: ["exhibit"], domainCategories: ["skeleton"], entityId: "entity-other" }],
      },
    ],
    relations: [{ id: "relation-1", sourceId: "obs-1", targetId: "obs-2", status: "confirmed" }],
    referenceFacts: [
      { id: "fact-learned", subjectId: "entity-1", status: "verified" },
      { id: "fact-unlearned", subjectId: "entity-1", status: "verified" },
      { id: "fact-draft", subjectId: "entity-1", status: "draft" },
      { id: "fact-other", subjectId: "entity-other", status: "verified" },
    ],
    userKnowledgeStates: [
      { userId: "user-1", visitId: "visit-1", referenceFactId: "fact-learned", masteryValue: 1 },
      { userId: "user-1", visitId: "visit-1", referenceFactId: "fact-unlearned", masteryValue: 0 },
      { userId: "user-1", visitId: "visit-2", referenceFactId: "fact-other", masteryValue: 1 },
    ],
  };
}

const registry = {
  genericCategories: [{ id: "exhibit", label: "展示物" }, { id: "panel", label: "説明パネル" }],
  categoriesByPack: { paleo: [{ id: "skeleton", label: "骨格" }] },
};

describe("collection progress", () => {
  it("derives five stages from the active visit only", () => {
    const [visit] = buildCollectionProgress(project(), "visit-1", "user-1", registry);
    expect(visit.counts).toEqual({ discovery: 2, organize: 1, classification: 2, relation: 2, learning: 1 });
    expect(visit.stages.map((stage) => stage.complete)).toEqual([true, false, true, true, true]);
    expect(visit.percent).toBe(80);
  });

  it("counts only verified facts with masteryValue 1 and keeps visits separate", () => {
    const result = buildCollectionProgress(project(), "visit-1", "user-1", registry);
    expect(result.every((collection) => !collection.title.includes("別の訪問"))).toBe(true);
    expect(result[0].counts.learning).toBe(1);
    const changed = project();
    changed.userKnowledgeStates[0].masteryValue = 0;
    expect(buildCollectionProgress(changed, "visit-1", "user-1", registry)[0].counts.learning).toBe(0);
    expect(buildCollectionProgress(project(), "visit-2", "user-1", registry)[0].counts.learning).toBe(1);
  });

  it("recomputes after edits and deletion and returns an empty state", () => {
    const changed = project();
    changed.photos[0].observations[1].status = "confirmed";
    changed.relations = [];
    changed.referenceFacts = changed.referenceFacts.filter((fact) => fact.id !== "fact-learned");
    const [visit] = buildCollectionProgress(changed, "visit-1", "user-1", registry);
    expect(visit.counts.organize).toBe(2);
    expect(visit.counts.relation).toBe(0);
    expect(visit.counts.learning).toBe(0);
    expect(buildCollectionProgress(project(), "missing", "user-1", registry)).toEqual([]);
    expect(JSON.parse(JSON.stringify(buildCollectionProgress(project(), "visit-1", "user-1", registry)))).toEqual(buildCollectionProgress(project(), "visit-1", "user-1", registry));
  });
});
