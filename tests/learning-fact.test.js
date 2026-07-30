import { describe, expect, it } from "vitest";
import {
  createLearningFact,
  normalizeLearningFact,
  removeLearningFact,
  updateLearningFact,
} from "../src/domain/learning-fact.js";
import {
  focusRelatedObservation,
  learningFactsForObservation,
  observationEntriesForVisit,
  oneHopRelations,
} from "../src/domain/knowledge.js";
import { visitFacts } from "../src/domain/visit.js";

const photos = [
  {
    id: "p1",
    visitId: "v1",
    observations: [
      { id: "o1", label: "骨格", included: true },
      { id: "o2", label: "説明パネル", included: true },
      { id: "o3", label: "除外", included: false },
    ],
  },
  { id: "p2", visitId: "v2", observations: [{ id: "o4", label: "別訪問" }] },
];

describe("LearningFact", () => {
  it("ユーザーFactを学習済みの完全な形で作る", () => {
    const fact = createLearningFact({
      targetObservationId: "o1",
      label: "初期のクジラ",
      detail: "バシロサウルスは初期のクジラ類に含まれる。",
      sourceType: "panel",
      sourceNote: "展示パネル右下",
      sourceObservationId: "o2",
      quizPrompt: "バシロサウルスは何類に含まれる？",
    });
    expect(fact).toMatchObject({
      targetObservationId: "o1",
      label: "初期のクジラ",
      detail: "バシロサウルスは初期のクジラ類に含まれる。",
      sourceType: "panel",
      sourceNote: "展示パネル右下",
      sourceObservationId: "o2",
      quizPrompt: "バシロサウルスは何類に含まれる？",
      status: "learned",
    });
    expect(fact.id).toBeTruthy();
    expect(fact.createdAt).toBeTruthy();
    expect(fact.updatedAt).toBeTruthy();
  });

  it("Factを編集・削除でき、保存再読み込みで全項目を保持する", () => {
    const created = createLearningFact({ targetObservationId: "o1", label: "旧" , sourceType: "user" });
    const updated = updateLearningFact(created, {
      label: "新しい知識",
      detail: "詳細",
      sourceNote: "ノート",
      sourceObservationId: "o2",
      quizPrompt: "質問",
    });
    const reloaded = JSON.parse(JSON.stringify(updated));
    expect(reloaded).toMatchObject({
      targetObservationId: "o1",
      label: "新しい知識",
      detail: "詳細",
      sourceNote: "ノート",
      sourceObservationId: "o2",
      quizPrompt: "質問",
      status: "learned",
    });
    expect(removeLearningFact([reloaded], reloaded.id)).toEqual([]);
  });

  it("旧targetIdのデモFactもtargetObservationIdとして扱う", () => {
    expect(normalizeLearningFact({ id: "f1", targetId: "o1", status: "locked" })).toMatchObject({
      targetId: "o1",
      targetObservationId: "o1",
      sourceNote: "",
      quizPrompt: "",
    });
  });
});

describe("Minimal Knowledge View", () => {
  const facts = [
    { id: "f1", targetObservationId: "o1", status: "learned" },
    { id: "f2", targetObservationId: "o4", status: "learned" },
  ];

  it("activeVisit内のObservationだけを候補にする", () => {
    expect(observationEntriesForVisit(photos, "v1").map(({ observation }) => observation.id)).toEqual(["o1", "o2"]);
    expect(visitFacts({ photos, facts }, "v1").map((fact) => fact.id)).toEqual(["f1"]);
  });

  it("confirmed Relationの1ホップだけを返し、別Visitを除外する", () => {
    const relations = [
      { id: "r1", sourceId: "o1", targetId: "o2", status: "confirmed" },
      { id: "r2", sourceId: "o2", targetId: "o3", status: "confirmed" },
      { id: "r3", sourceId: "o1", targetId: "o4", status: "confirmed" },
      { id: "r4", sourceId: "o1", targetId: "o2", status: "suggested" },
      { id: "r5", sourceId: "o1", targetId: "o3", status: "confirmed" },
    ];
    expect(oneHopRelations(relations, photos, "v1", "o1").map((relation) => relation.id)).toEqual(["r1"]);
    expect(learningFactsForObservation(facts, "o1").map((fact) => fact.id)).toEqual(["f1"]);
  });

  it("Relation先を中心Observationへ切り替える", () => {
    expect(focusRelatedObservation("o1", "o2")).toBe("o2");
    expect(focusRelatedObservation("o1", "")).toBe("o1");
  });
});
