import { describe, expect, it } from "vitest";
import {
  isLegacyQuizResult,
  migrateProjectDocument,
  PROJECT_SCHEMA_VERSION,
} from "../src/features/project/migrate.js";
import { DEMO_VISIT_ID, MIGRATED_VISIT_ID } from "../src/domain/visit.js";

/** @returns {any} */
const demoPhotos = () => [
  {
    id: "p01",
    file: "43083_0.jpg",
    order: 1,
    title: "デモ写真1",
    status: "organized",
    source: "sample",
    observations: [{ id: "o01a", label: "系統図", status: "confirmed" }],
  },
  {
    id: "p02",
    file: "43084_0.jpg",
    order: 2,
    title: "デモ写真2",
    status: "unorganized",
    source: "sample",
    observations: [{ id: "o02a", label: "骨格", status: "suggested" }],
  },
];

/** @returns {any} */
const context = () => ({
  demoPhotos: demoPhotos(),
  demoRelations: [
    { id: "r1", sourceId: "o01a", targetId: "o02a", type: "explains" },
  ],
  demoFacts: [
    { id: "f1", targetId: "o01a", label: "詳しい話", status: "locked" },
  ],
});

describe("migrateProjectDocument — 初回起動", () => {
  it("保存が無ければデモ訪問だけを用意する", () => {
    const result = migrateProjectDocument(null, context());
    expect(result.ok).toBe(true);
    expect(result.project.visits).toHaveLength(1);
    expect(result.project.visits[0].id).toBe(DEMO_VISIT_ID);
    expect(result.project.visits[0].source).toBe("demo");
  });

  it("初回は activeVisit を決めない（UIで選ばせるため）", () => {
    expect(
      migrateProjectDocument(null, context()).project.activeVisitId,
    ).toBeNull();
  });

  it("デモ写真がデモ訪問に属する", () => {
    const { project } = migrateProjectDocument(null, context());
    expect(project.photos).toHaveLength(2);
    expect(project.photos.every((p) => p.visitId === DEMO_VISIT_ID)).toBe(true);
  });

  it("schemaVersion を刻む", () => {
    expect(migrateProjectDocument(null, context()).project.schemaVersion).toBe(
      PROJECT_SCHEMA_VERSION,
    );
  });
});

describe("migrateProjectDocument — v1 からの移行", () => {
  /** @returns {any} */
  const v1 = () => ({
    id: "default",
    updatedAt: 1,
    photos: [
      // デモ写真の整理途中の状態
      {
        id: "p01",
        visitId: DEMO_VISIT_ID,
        status: "in-progress",
        source: "sample",
        observations: [
          { id: "o01a", label: "系統図", status: "confirmed", included: false },
        ],
      },
      // ユーザーが追加した写真（v1ではデモ訪問に混ざっていた）
      {
        id: "photo-user-1",
        visitId: DEMO_VISIT_ID,
        file: "IMG_0042.jpg",
        order: 21,
        title: "IMG_0042",
        status: "unorganized",
        source: "upload",
        domainHint: "nature",
        observations: [],
      },
    ],
    relations: [
      {
        id: "r1",
        sourceId: "o01a",
        targetId: "o02a",
        type: "explains",
        status: "confirmed",
      },
    ],
    facts: [{ id: "f1", status: "learned" }],
    quizResults: [
      {
        deck: "observed",
        score: 3,
        total: 5,
        completedAt: "2026-07-01T00:00:00.000Z",
      },
    ],
  });

  it("デモ写真とユーザー写真を別々の訪問へ振り分ける", () => {
    const { project } = migrateProjectDocument(v1(), context());
    const byId = Object.fromEntries(project.photos.map((p) => [p.id, p]));
    expect(byId["p01"].visitId).toBe(DEMO_VISIT_ID);
    expect(byId["photo-user-1"].visitId).toBe(MIGRATED_VISIT_ID);
  });

  it("ユーザー訪問を作る", () => {
    const { project } = migrateProjectDocument(v1(), context());
    const user = project.visits.find((v) => v.source === "user");
    expect(user).toBeDefined();
    expect(user.title).toBe("自分の訪問");
  });

  it("ユーザー写真があれば、そちらを開いた状態にする", () => {
    expect(migrateProjectDocument(v1(), context()).project.activeVisitId).toBe(
      MIGRATED_VISIT_ID,
    );
  });

  it("ユーザー写真が無ければデモ訪問だけで、ユーザー訪問を作らない", () => {
    const stored = v1();
    stored.photos = stored.photos.filter((p) => p.source === "sample");
    const { project } = migrateProjectDocument(stored, context());
    expect(project.visits).toHaveLength(1);
    expect(project.activeVisitId).toBe(DEMO_VISIT_ID);
  });

  it("デモ写真の整理内容を維持する", () => {
    const { project } = migrateProjectDocument(v1(), context());
    const p01 = project.photos.find((p) => p.id === "p01");
    expect(p01.status).toBe("in-progress");
    expect(p01.observations[0].included).toBe(false);
  });

  it("関係を維持する", () => {
    const { project } = migrateProjectDocument(v1(), context());
    expect(project.relations).toHaveLength(1);
    expect(project.relations[0].status).toBe("confirmed");
  });

  it("学習状態をデモ定義の上に重ねる", () => {
    const { project } = migrateProjectDocument(v1(), context());
    expect(project.facts[0].status).toBe("learned");
    expect(project.facts[0].label).toBe("詳しい話");
  });

  it("旧形式のクイズ結果は破棄し、理由を残す", () => {
    const result = migrateProjectDocument(v1(), context());
    expect(result.project.quizResults).toEqual([]);
    expect(result.notes.some((n) => n.includes("旧形式のクイズ結果"))).toBe(
      true,
    );
  });

  it("設問単位の新形式クイズ結果は残す", () => {
    const stored = v1();
    stored.quizResults = [
      {
        quizId: "q1",
        quizType: "single-choice",
        correct: true,
        visitId: DEMO_VISIT_ID,
      },
    ];
    expect(
      migrateProjectDocument(stored, context()).project.quizResults,
    ).toHaveLength(1);
  });
});

describe("migrateProjectDocument — Photo メタデータ", () => {
  it("欠けている項目を null で埋める", () => {
    const { project } = migrateProjectDocument(null, context());
    const photo = project.photos[0];
    expect(photo.capturedAt).toBeNull();
    expect(photo.fileLastModified).toBeNull();
    expect(photo.originalWidth).toBeNull();
    expect(photo.experienceMemo).toBe("");
  });

  it("fileLastModified を capturedAt へ流用しない", () => {
    const stored = {
      id: "default",
      photos: [
        {
          id: "photo-x",
          source: "upload",
          fileLastModified: 1_700_000_000_000,
          observations: [],
        },
      ],
      relations: [],
      facts: [],
    };
    const { project } = migrateProjectDocument(stored, context());
    const photo = project.photos.find((p) => p.id === "photo-x");
    expect(photo.fileLastModified).toBe(1_700_000_000_000);
    expect(photo.capturedAt).toBeNull();
  });

  it("保存済みの experienceMemo を維持する", () => {
    const stored = {
      id: "default",
      photos: [
        {
          id: "p01",
          source: "sample",
          experienceMemo: "実物は想像より大きかった",
          observations: [],
        },
      ],
      relations: [],
      facts: [],
    };
    const { project } = migrateProjectDocument(stored, context());
    expect(project.photos.find((p) => p.id === "p01").experienceMemo).toBe(
      "実物は想像より大きかった",
    );
  });
});

describe("migrateProjectDocument — すでに v2", () => {
  it("visits があれば移行しない", () => {
    const v2 = {
      id: "default",
      schemaVersion: "2.0.0",
      visits: [{ id: "v1", title: "mine", source: "user" }],
      activeVisitId: "v1",
      photos: [],
      relations: [],
      facts: [],
      quizResults: [],
    };
    const result = migrateProjectDocument(v2, context());
    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.project.visits).toHaveLength(1);
    expect(result.project.activeVisitId).toBe("v1");
  });
});

describe("migrateProjectDocument — 壊れた入力", () => {
  it("配列を渡されても投げずに断る", () => {
    const result = migrateProjectDocument([], context());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("形式");
  });

  it("文字列を渡されても投げずに断る", () => {
    expect(migrateProjectDocument("nope", context()).ok).toBe(false);
  });

  it("断るときは project を返さない（呼び出し側が旧データを保てる）", () => {
    const result = migrateProjectDocument(42, context());
    expect(result.ok).toBe(false);
    expect(result.project).toBeUndefined();
  });

  it("photos が配列でなくても投げない", () => {
    const result = migrateProjectDocument(
      { id: "default", photos: "broken" },
      context(),
    );
    expect(result.ok).toBe(true);
    expect(result.project.photos).toHaveLength(2); // デモだけが残る
  });
});

describe("isLegacyQuizResult", () => {
  it("集計形式を見分ける", () => {
    expect(isLegacyQuizResult({ deck: "observed", score: 1, total: 5 })).toBe(
      true,
    );
  });

  it("設問単位の形式は対象外", () => {
    expect(isLegacyQuizResult({ quizId: "q1", correct: true })).toBe(false);
  });

  it("null でも投げない", () => {
    expect(isLegacyQuizResult(null)).toBe(false);
  });
});
