import { describe, expect, it } from "vitest";
import {
  collectVisitCascade,
  copyFactsForProject,
  createQuizResult,
  createDemoVisit,
  createVisit,
  DEMO_VISIT_ID,
  isDemoVisit,
  pickNextActiveVisitId,
  updateVisit,
  quizzesForVisit,
  visitFacts,
  validateVisit,
} from "../src/domain/visit.js";

describe("Visit-scoped learning state", () => {
  const photos = [
    { id: "p-demo", visitId: "demo", observations: [{ id: "o-demo" }] },
    { id: "p-user", visitId: "user", observations: [{ id: "o-user" }] },
  ];
  const facts = [
    {
      id: "f-demo",
      targetId: "o-demo",
      label: "デモ知識",
      detail: "デモ詳細",
      sourceType: "panel",
      status: "learned",
    },
    {
      id: "f-user",
      targetId: "o-user",
      label: "ユーザー知識",
      detail: "ユーザー詳細",
      sourceType: "user",
      status: "learned",
    },
  ];

  it("Fact全体を保存用に保持し、再読み込み相当の入力でも残す", () => {
    const saved = copyFactsForProject(facts);
    expect(saved).toEqual(facts);
    expect(saved[0]).not.toBe(facts[0]);
    expect(saved[0]).toMatchObject({
      targetId: "o-demo",
      label: "デモ知識",
      detail: "デモ詳細",
      sourceType: "panel",
      status: "learned",
    });
  });

  it("デモFactはユーザーVisitの概要件数へ混ざらない", () => {
    expect(visitFacts({ photos, facts }, "user")).toEqual([facts[1]]);
  });

  it("ユーザーVisitではSAMPLE_QUIZZESを表示しない", () => {
    const quizzes = [{ id: "sample-q" }];
    expect(quizzesForVisit(createVisit({ title: "ユーザー訪問" }), quizzes)).toEqual([]);
    expect(quizzesForVisit(createDemoVisit(), quizzes)).toEqual(quizzes);
  });

  it("集計形式を保ったquiz結果にidとvisitIdを付ける", () => {
    const result = createQuizResult(
      { deck: "observed", score: 1, total: 2, completedAt: "now" },
      "demo",
      "qr-demo",
    );
    expect(result).toEqual({
      id: "qr-demo",
      deck: "observed",
      score: 1,
      total: 2,
      completedAt: "now",
      visitId: "demo",
    });
  });
});

describe("createVisit", () => {
  it("作った訪問はユーザーのものになる", () => {
    const visit = createVisit({ title: "恐竜博物館テスト" });
    expect(visit.source).toBe("user");
    expect(isDemoVisit(visit)).toBe(false);
  });

  it("タイトルの前後の空白を落とす", () => {
    expect(createVisit({ title: "  屋久島  " }).title).toBe("屋久島");
  });

  it("分野パック未指定なら other になる", () => {
    expect(createVisit({ title: "x" }).domainPackIds).toEqual(["other"]);
  });

  it("id を指定しなければ一意な id を振る", () => {
    const a = createVisit({ title: "a" });
    const b = createVisit({ title: "b" });
    expect(a.id).not.toBe(b.id);
  });

  it("任意項目は省略できる", () => {
    const visit = createVisit({ title: "x" });
    expect(visit.placeName).toBe("");
    expect(visit.visitedAt).toBeNull();
  });
});

describe("createDemoVisit", () => {
  it("既存デモ写真と同じ visitId を使う", () => {
    // ここがずれると同梱20枚がどの訪問にも属さなくなる。
    expect(createDemoVisit().id).toBe(DEMO_VISIT_ID);
  });

  it("source は demo", () => {
    expect(isDemoVisit(createDemoVisit())).toBe(true);
  });
});

describe("validateVisit", () => {
  it("訪問名が空なら断る", () => {
    const result = validateVisit({ title: "   ", domainPackIds: ["other"] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("訪問名");
  });

  it("分野パックが空なら断る", () => {
    const result = validateVisit({ title: "x", domainPackIds: [] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("分野パック");
  });

  it("訪問日の形式を見る", () => {
    expect(
      validateVisit({
        title: "x",
        domainPackIds: ["a"],
        visitedAt: "2026/07/28",
      }).ok,
    ).toBe(false);
    expect(
      validateVisit({
        title: "x",
        domainPackIds: ["a"],
        visitedAt: "2026-07-28",
      }).ok,
    ).toBe(true);
  });

  it("訪問日は省略できる", () => {
    expect(
      validateVisit({ title: "x", domainPackIds: ["a"], visitedAt: null }).ok,
    ).toBe(true);
  });

  it("長すぎる名前を断る", () => {
    expect(
      validateVisit({ title: "あ".repeat(81), domainPackIds: ["a"] }).ok,
    ).toBe(false);
  });
});

describe("updateVisit", () => {
  it("分野パックを変えても他の項目は保たれる", () => {
    const visit = createVisit({
      title: "恐竜博物館",
      placeName: "福井",
      domainPackIds: ["paleontology"],
    });
    const updated = updateVisit(visit, { domainPackIds: ["cultural"] });
    expect(updated.domainPackIds).toEqual(["cultural"]);
    expect(updated.title).toBe("恐竜博物館");
    expect(updated.placeName).toBe("福井");
    expect(updated.id).toBe(visit.id);
    expect(updated.createdAt).toBe(visit.createdAt);
  });

  it("渡さなかった項目は変えない", () => {
    const visit = createVisit({ title: "a", placeName: "b" });
    expect(updateVisit(visit, { title: "c" }).placeName).toBe("b");
  });

  it("訪問日を空文字で消せる", () => {
    const visit = createVisit({ title: "a", visitedAt: "2026-07-28" });
    expect(updateVisit(visit, { visitedAt: "" }).visitedAt).toBeNull();
  });
});

describe("pickNextActiveVisitId", () => {
  const demo = createDemoVisit();

  it("残りが無ければ null", () => {
    expect(pickNextActiveVisitId([])).toBeNull();
  });

  it("ユーザー訪問があればそちらを選ぶ", () => {
    const user = createVisit({ title: "mine" });
    expect(pickNextActiveVisitId([demo, user])).toBe(user.id);
  });

  it("ユーザー訪問が無ければデモを選ぶ", () => {
    expect(pickNextActiveVisitId([demo])).toBe(DEMO_VISIT_ID);
  });

  it("ユーザー訪問が複数あれば直近に更新したものを選ぶ", () => {
    const older = {
      ...createVisit({ title: "old" }),
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const newer = {
      ...createVisit({ title: "new" }),
      updatedAt: "2026-07-28T00:00:00.000Z",
    };
    expect(pickNextActiveVisitId([demo, older, newer])).toBe(newer.id);
  });
});

describe("collectVisitCascade", () => {
  /** @returns {any} */
  const project = () => ({
    photos: [
      {
        id: "p1",
        visitId: "v1",
        observations: [{ id: "o1" }, { id: "o2" }],
      },
      {
        id: "p2",
        visitId: "v2",
        observations: [{ id: "o3" }],
      },
    ],
    relations: [
      { id: "r1", sourceId: "o1", targetId: "o2" },
      { id: "r2", sourceId: "o3", targetId: "o3" },
      { id: "r3", sourceId: "o2", targetId: "o3" },
    ],
    facts: [
      { id: "f1", targetObservationId: "o1" },
      { id: "f2", targetObservationId: "o3" },
    ],
    quizResults: [
      { id: "q1", visitId: "v1" },
      { id: "q2", visitId: "v2" },
      { id: "q3", visitId: "v1" },
    ],
  });

  it("その訪問の写真と観察対象を集める", () => {
    const cascade = collectVisitCascade(project(), "v1");
    expect(cascade.photoIds).toEqual(["p1"]);
    expect(cascade.observationIds).toEqual(["o1", "o2"]);
  });

  it("片側だけ掛かる関係も巻き込む（参照切れを残さないため）", () => {
    // r3 は o2(v1) と o3(v2) をまたぐ。v1 を消すなら r3 も消さないと参照切れになる。
    expect(collectVisitCascade(project(), "v1").relationIds.sort()).toEqual([
      "r1",
      "r3",
    ]);
  });

  it("他の訪問だけの関係は巻き込まない", () => {
    expect(collectVisitCascade(project(), "v1").relationIds).not.toContain(
      "r2",
    );
  });

  it("観察対象に紐づく学習内容を巻き込む", () => {
    expect(collectVisitCascade(project(), "v1").factIds).toEqual(["f1"]);
  });

  it("sourceObservationId だけで観察対象を参照する学習内容も巻き込む", () => {
    const scoped = project();
    scoped.facts = [{ id: "f-source", sourceObservationId: "o1" }];
    expect(collectVisitCascade(scoped, "v1").factIds).toEqual(["f-source"]);
  });

  it("旧キー名 targetId の学習内容も拾う", () => {
    const legacy = project();
    legacy.facts = [{ id: "f9", targetId: "o1" }];
    expect(collectVisitCascade(legacy, "v1").factIds).toEqual(["f9"]);
  });

  it("その訪問の回答履歴を数える", () => {
    expect(collectVisitCascade(project(), "v1").quizResultCount).toBe(2);
    expect(collectVisitCascade(project(), "v1").quizResultIds).toEqual([
      "q1",
      "q3",
    ]);
  });

  it("visitId がない旧回答履歴も対象Observationから拾う", () => {
    const scoped = project();
    scoped.quizResults = [{ id: "q1", targetId: "o1" }];
    const cascade = collectVisitCascade(scoped, "v1");
    expect(cascade.quizResultIds).toEqual(["q1"]);
    expect(cascade.quizResultCount).toBe(1);
  });

  it("存在しない訪問なら何も集めない", () => {
    const cascade = collectVisitCascade(project(), "nope");
    expect(cascade.photoIds).toEqual([]);
    expect(cascade.relationIds).toEqual([]);
    expect(cascade.factIds).toEqual([]);
  });
});
