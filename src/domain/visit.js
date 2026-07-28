/**
 * Visit — 訪問。
 *
 * このアプリの持ち物はすべて、どこかの Visit に属する。写真も、そこから切り出した
 * Observation も、関係も、学習も、問題の履歴も。Visit を切り替えると画面全体が
 * その訪問のものだけになる。
 *
 * デモ訪問（同梱20枚）とユーザー訪問は同じ形をしていて、違うのは `source` だけ。
 * デモは「再生成できるサンプル」なので、初期化も削除もできる。ユーザーの訪問が本命。
 */

/** 同梱デモ訪問のID。既存デモ写真の `visitId` と一致させる必要がある。 */
export const DEMO_VISIT_ID = "visit-fukui";

/** 移行時に、既存のアップロード写真をまとめる先。 */
export const MIGRATED_VISIT_ID = "visit-migrated";

/**
 * @typedef {object} Visit
 * @property {string} id
 * @property {string} title       訪問名。空にはできない
 * @property {string} placeName   場所名。任意
 * @property {string|null} visitedAt  訪問日（YYYY-MM-DD）。任意
 * @property {string[]} domainPackIds 分野パックのID
 * @property {'demo'|'user'} source
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @param {string} prefix
 * @returns {string}
 */
function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 入力を Visit の形へ整える。値の検証は `validateVisit()` が行う。
 *
 * @param {object} input
 * @param {string} input.title
 * @param {string} [input.id]
 * @param {string} [input.placeName]
 * @param {string|null} [input.visitedAt]
 * @param {string[]} [input.domainPackIds]
 * @param {'demo'|'user'} [input.source]
 * @param {string} [input.createdAt]
 * @returns {Visit}
 */
export function createVisit(input) {
  const now = new Date().toISOString();
  return {
    id: input.id || newId("visit"),
    title: (input.title || "").trim(),
    placeName: (input.placeName || "").trim(),
    visitedAt: input.visitedAt || null,
    domainPackIds: input.domainPackIds?.length
      ? [...input.domainPackIds]
      : ["other"],
    source: input.source || "user",
    createdAt: input.createdAt || now,
    updatedAt: now,
  };
}

/**
 * Project保存用にLearningFactを複製する。Factの契約フィールドを縮約しない。
 *
 * @param {any[]} facts
 * @returns {any[]}
 */
export function copyFactsForProject(facts) {
  return facts.map((fact) => ({ ...fact }));
}

/**
 * 現在のVisitのObservationに接続されたLearningFactだけを返す。
 * LearningFact自体にvisitIdを持たせず、Observationとの接続を正とする。
 *
 * @param {{photos: any[], facts: any[]}} project
 * @param {string|null|undefined} visitId
 * @returns {any[]}
 */
export function visitFacts(project, visitId) {
  if (!visitId) return [];
  const observationIds = new Set(
    project.photos
      .filter((photo) => photo.visitId === visitId)
      .flatMap((photo) =>
        (photo.observations || []).map((observation) => observation.id),
      ),
  );
  return project.facts.filter(
    (fact) =>
      observationIds.has(fact.targetObservationId ?? fact.targetId) ||
      observationIds.has(fact.sourceObservationId),
  );
}

/**
 * 既存の集計形式を保ったVisitスコープ付きquiz結果を作る。
 *
 * @param {object} result
 * @param {string|null} visitId
 * @param {string} [id]
 * @returns {object}
 */
export function createQuizResult(result, visitId, id = newId("quiz-result")) {
  return { ...result, id, visitId };
}

/**
 * Core 5実装までは、同梱問題をデモVisitにだけ公開する。
 *
 * @param {Visit|null|undefined} visit
 * @param {any[]} quizzes
 * @returns {any[]}
 */
export function quizzesForVisit(visit, quizzes) {
  return isDemoVisit(visit) ? quizzes : [];
}

/**
 * 同梱デモ訪問。ID は既存デモ写真の `visitId` と揃える。
 *
 * @param {{title?: string, placeName?: string, domainPackIds?: string[]}} [seed]
 * @returns {Visit}
 */
export function createDemoVisit(seed = {}) {
  return createVisit({
    id: DEMO_VISIT_ID,
    title: seed.title || "恐竜博物館の訪問",
    placeName: seed.placeName || "自然史・恐竜博物館",
    visitedAt: null,
    domainPackIds: seed.domainPackIds?.length
      ? seed.domainPackIds
      : ["paleontology"],
    source: "demo",
  });
}

/**
 * @param {unknown} visit
 * @returns {visit is Visit}
 */
export function isVisit(visit) {
  return Boolean(visit) && typeof (/** @type {any} */ (visit).id) === "string";
}

/**
 * @param {Visit|null|undefined} visit
 * @returns {boolean}
 */
export function isDemoVisit(visit) {
  return visit?.source === "demo";
}

/**
 * 保存前の検証。UI から呼び、失敗理由をそのまま表示できる文言で返す。
 *
 * `reason` は ok:false のときだけ入る。判別可能ユニオンにすると、素のJSから
 * 型アサーション無しに `.reason` を読めなくなるため、任意プロパティにしている
 * （`project-json.js` の `ValidationResult` と同じ方針）。
 *
 * @typedef {object} VisitValidation
 * @property {boolean} ok
 * @property {string} [reason]
 *
 * @param {Partial<Visit>} visit
 * @returns {VisitValidation}
 */
export function validateVisit(visit) {
  const title = (visit.title || "").trim();
  if (!title) return { ok: false, reason: "訪問名を入力してください。" };
  if (title.length > 80)
    return { ok: false, reason: "訪問名は80文字までにしてください。" };
  if ((visit.placeName || "").length > 120) {
    return { ok: false, reason: "場所名は120文字までにしてください。" };
  }
  if (visit.visitedAt && !/^\d{4}-\d{2}-\d{2}$/.test(visit.visitedAt)) {
    return {
      ok: false,
      reason: "訪問日は YYYY-MM-DD の形式で入力してください。",
    };
  }
  if (!visit.domainPackIds?.length) {
    return { ok: false, reason: "分野パックを1つ以上選んでください。" };
  }
  return { ok: true };
}

/**
 * 分野パックを変更しても、保存済み Observation の分類は消さない。
 * ここでは Visit のフィールドだけを更新する。
 *
 * @param {Visit} visit
 * @param {Partial<Pick<Visit, 'title'|'placeName'|'visitedAt'|'domainPackIds'>>} patch
 * @returns {Visit}
 */
export function updateVisit(visit, patch) {
  return {
    ...visit,
    title: patch.title !== undefined ? patch.title.trim() : visit.title,
    placeName:
      patch.placeName !== undefined ? patch.placeName.trim() : visit.placeName,
    visitedAt:
      patch.visitedAt !== undefined ? patch.visitedAt || null : visit.visitedAt,
    domainPackIds: patch.domainPackIds?.length
      ? [...patch.domainPackIds]
      : visit.domainPackIds,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 削除後に選ぶべき Visit を決める。activeVisit が居なくなる状態を作らないための規則。
 *
 * 残っているユーザー訪問を優先し、無ければデモ訪問。どちらも無ければ null。
 *
 * @param {Visit[]} visits    削除後に残る Visit 一覧
 * @returns {string|null}
 */
export function pickNextActiveVisitId(visits) {
  if (!visits.length) return null;
  const user = visits.filter((visit) => visit.source === "user");
  const pool = user.length ? user : visits;
  // 直近に更新したものへ移る方が、作業の続きに戻りやすい。
  const sorted = [...pool].sort((a, b) =>
    (b.updatedAt || "").localeCompare(a.updatedAt || ""),
  );
  return sorted[0].id;
}

/**
 * Visit を消したときに道連れにするレコードを洗い出す。
 *
 * 参照切れを残さないことが目的なので、Photo だけでなく、その Photo が抱える
 * Observation を指している Relation・LearningFact・quizResults まで見る。
 *
 * @param {object} project
 * @param {any[]} project.photos
 * @param {any[]} project.relations
 * @param {any[]} [project.facts]
 * @param {any[]} [project.quizResults]
 * @param {string} visitId
 * @returns {{photoIds: string[], observationIds: string[], relationIds: string[], factIds: string[], quizResultIds: string[], quizResultCount: number}}
 */
export function collectVisitCascade(project, visitId) {
  const photos = project.photos.filter(
    (/** @type {any} */ photo) => photo.visitId === visitId,
  );
  const photoIds = photos.map((/** @type {any} */ photo) => photo.id);
  const observationIds = photos.flatMap((/** @type {any} */ photo) =>
    (photo.observations || []).map(
      (/** @type {any} */ observation) => observation.id,
    ),
  );
  const observationSet = new Set(observationIds);

  const relationIds = (project.relations || [])
    .filter(
      (/** @type {any} */ relation) =>
        observationSet.has(relation.sourceId) ||
        observationSet.has(relation.targetId),
    )
    .map((/** @type {any} */ relation) => relation.id);

  const factIds = (project.facts || [])
    .filter((/** @type {any} */ fact) =>
      observationSet.has(fact.targetObservationId ?? fact.targetId) ||
      observationSet.has(fact.sourceObservationId),
    )
    .map((/** @type {any} */ fact) => fact.id);

  const quizResultIds = (project.quizResults || [])
    .filter(
      (/** @type {any} */ result) =>
        result.visitId === visitId || observationSet.has(result.targetId),
    )
    .map((/** @type {any} */ result) => result.id)
    .filter(Boolean);
  const quizResultCount = (project.quizResults || []).filter(
    (/** @type {any} */ result) =>
      result.visitId === visitId || observationSet.has(result.targetId),
  ).length;

  return {
    photoIds,
    observationIds,
    relationIds,
    factIds,
    quizResultIds,
    quizResultCount,
  };
}
