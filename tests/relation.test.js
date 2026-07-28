import { describe, expect, it } from "vitest";
import {
  createRelation,
  isDirectedRelation,
  relationCandidates,
  relationDuplicate,
  relationKey,
  removeRelation,
  updateRelation,
  validateRelationInput,
} from "../src/domain/relation.js";
import { observationReferences } from "../src/domain/observation.js";

const relationTypes = [
  { id: "explains", label: "説明している", directed: true },
  { id: "part-of", label: "部分と全体", directed: true },
  { id: "same-exhibit", label: "同じ展示", directed: false },
  { id: "same-theme", label: "同じテーマ", directed: false },
];

const photos = [
  {
    id: "p1",
    visitId: "v1",
    order: 1,
    observations: [{ id: "o1", label: "説明" }, { id: "o2", label: "標本" }],
  },
  {
    id: "p2",
    visitId: "v1",
    order: 2,
    observations: [{ id: "o3", label: "骨格" }],
  },
  {
    id: "p3",
    visitId: "v2",
    order: 2,
    observations: [{ id: "o4", label: "別Visit" }],
  },
];

describe("Relation data contract", () => {
  it("手動Relationの初期値を確定値で作る", () => {
    expect(createRelation({ id: "r1", sourceId: "o1", targetId: "o2", type: "explains" })).toEqual({
      id: "r1",
      sourceId: "o1",
      targetId: "o2",
      type: "explains",
      status: "confirmed",
      confidence: 1,
      origin: "user",
    });
  });

  it("Relationを編集・削除できる", () => {
    const relation = createRelation({ id: "r1", sourceId: "o1", targetId: "o2", type: "explains" });
    const updated = updateRelation(relation, { targetId: "o3", type: "same-exhibit" });
    expect(updated).toMatchObject({ targetId: "o3", type: "same-exhibit" });
    expect(removeRelation([updated], "r1")).toEqual([]);
  });

  it("自己Relationを拒否する", () => {
    expect(validateRelationInput([], { sourceId: "o1", targetId: "o1", type: "explains" }, relationTypes)).toContain("同じObservation");
  });

  it("有向Relationは逆向きを別Relationとして許可する", () => {
    const existing = createRelation({ id: "r1", sourceId: "o1", targetId: "o2", type: "explains" });
    const reverse = { sourceId: "o2", targetId: "o1", type: "explains" };
    expect(relationDuplicate([existing], reverse, relationTypes)).toBe(false);
    expect(relationKey(existing, relationTypes)).not.toBe(relationKey(reverse, relationTypes));
  });

  it("無向Relationは逆向き重複を拒否する", () => {
    const existing = createRelation({ id: "r1", sourceId: "o1", targetId: "o2", type: "same-exhibit" });
    expect(relationDuplicate([existing], { sourceId: "o2", targetId: "o1", type: "same-exhibit" }, relationTypes)).toBe(true);
  });

  it("同じペアでも種別が違えば保存できる", () => {
    const existing = createRelation({ id: "r1", sourceId: "o1", targetId: "o2", type: "same-exhibit" });
    expect(relationDuplicate([existing], { sourceId: "o1", targetId: "o2", type: "same-theme" }, relationTypes)).toBe(false);
  });

  it("保存と再読み込み後もRelationを維持する", () => {
    const relation = createRelation({ id: "r1", sourceId: "o1", targetId: "o3", type: "explains" });
    expect(JSON.parse(JSON.stringify([relation]))).toEqual([relation]);
  });

  it("有向属性を語彙から判定する", () => {
    expect(isDirectedRelation(relationTypes, "explains")).toBe(true);
    expect(isDirectedRelation(relationTypes, "same-exhibit")).toBe(false);
  });
});

describe("Relation candidates", () => {
  it("同じ写真の候補だけを返す", () => {
    expect(relationCandidates({ photos, activeVisitId: "v1", sourceId: "o1" }).map((item) => item.observation.id)).toEqual(["o2"]);
  });

  it("近い写真と訪問全体へ段階的に広げる", () => {
    expect(relationCandidates({ photos, activeVisitId: "v1", sourceId: "o1", scope: "nearby" }).map((item) => item.observation.id)).toEqual(["o2", "o3"]);
    expect(relationCandidates({ photos, activeVisitId: "v1", sourceId: "o1", scope: "visit" }).map((item) => item.observation.id)).toEqual(["o2", "o3"]);
  });

  it("activeVisit外のObservationを候補から除外する", () => {
    expect(relationCandidates({ photos, activeVisitId: "v1", sourceId: "o1", scope: "visit" }).map((item) => item.observation.id)).not.toContain("o4");
  });

  it("別写真のObservation同士を接続できる", () => {
    const relation = createRelation({ id: "r-cross", sourceId: "o1", targetId: "o3", type: "explains" });
    expect(relation.sourceId).toBe("o1");
    expect(relation.targetId).toBe("o3");
  });

  it("Observation削除時に関連Relationだけを参照対象にする", () => {
    const references = observationReferences(
      {
        relations: [
          { id: "r1", sourceId: "o1", targetId: "o3" },
          { id: "r2", sourceId: "o4", targetId: "o3" },
        ],
        facts: [],
      },
      "o1",
    );
    expect(references.relations.map((relation) => relation.id)).toEqual(["r1"]);
  });
});
