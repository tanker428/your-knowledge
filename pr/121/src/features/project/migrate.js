/**
 * 保存データの移行。
 *
 * **この関数がプロジェクト内で唯一の移行経路である。** Core 1（Visit導入）と
 * Core 7（JSON v2入出力）が同じ関数を呼ぶ。`app.js` に一時的な別処理を書かない。
 *
 * 設計上の約束:
 *  - 例外を投げない。失敗は戻り値で返す
 *  - 失敗したときは呼び出し側が旧データをそのまま使えるようにする（何も壊さない）
 *  - 判断したことは `notes` に残し、UI やテストから確認できるようにする
 */

import {
  createDemoVisits,
  createVisit,
  DEMO_VISIT_ID,
  MIGRATED_VISIT_ID,
} from "../../domain/visit.js";
import { normalizePhotoRotation } from "../../domain/photo-rotation.js";

/** 保存データの版。JSON の schemaVersion と同じ値を使う。 */
export const PROJECT_SCHEMA_VERSION = "2.0.0";

/**
 * @typedef {object} MigrationResult
 * @property {boolean} ok
 * @property {string} [reason]      ok:false のときだけ
 * @property {any} [project]        ok:true のときだけ
 * @property {string[]} [notes]     何をしたかの記録
 * @property {boolean} [changed]    実際に移行が発生したか
 */

/**
 * 旧形式の集計クイズ結果か。`{deck, score, total, completedAt}` の形。
 * 設問単位の記録へ移行できないため破棄する（Decision #11）。
 *
 * @param {any} result
 * @returns {boolean}
 */
export function isLegacyQuizResult(result) {
  return (
    Boolean(result) && result.quizId === undefined && result.deck !== undefined
  );
}

/**
 * v1 の Photo を v2 の形へ整える。欠けている項目は null / 既定値で埋める。
 *
 * `capturedAt` と `fileLastModified` は別物として扱う。EXIF 未実装のため
 * `capturedAt` は当面 null のままで、`fileLastModified` を代入したりしない。
 *
 * @param {any} photo
 * @param {string} visitId
 * @returns {any}
 */
function normalisePhoto(photo, visitId) {
  return {
    id: photo.id,
    visitId,
    file: photo.file,
    order: photo.order,
    title: photo.title,
    status: photo.status || "unorganized",
    source: photo.source || "upload",
    domainHint: photo.domainHint ?? null,
    rotation: normalizePhotoRotation(photo.rotation),

    // 撮影日時。EXIF から取れたときだけ入る。
    capturedAt: photo.capturedAt ?? null,
    // ファイルの更新日時。撮影日時の代わりには使わない。
    fileLastModified: photo.fileLastModified ?? null,
    importedAt: photo.importedAt ?? null,

    originalFileName: photo.originalFileName ?? photo.file ?? null,
    originalMimeType: photo.originalMimeType ?? null,
    originalBytes: photo.originalBytes ?? null,
    originalWidth: photo.originalWidth ?? null,
    originalHeight: photo.originalHeight ?? null,

    // 撮ったときの感想・印象。知識ではない。
    experienceMemo: photo.experienceMemo ?? "",

    observations: Array.isArray(photo.observations)
      ? photo.observations.map((/** @type {any} */ observation) => ({
          ...observation,
          photoId: photo.id,
        }))
      : [],
  };
}

/**
 * 保存済みプロジェクトを現行形式へ移行する。
 *
 * 入力が null（初回起動）でも、v1 でも、すでに v2 でも受け付ける。
 *
 * @param {any} stored               IndexedDB から読んだもの。null 可
 * @param {object} context
 * @param {any[]} context.demoPhotos デモ写真（`source: 'sample'`）
 * @param {any[]} context.demoRelations
 * @param {any[]} context.demoFacts
 * @param {any[]} [context.demoReferenceFacts]
 * @param {string[]} [context.demoRetiredReferenceFactIds] 保存項目ではなく、同梱デモ更新時だけ使う廃止ID一覧
 * @param {string} [context.demoKnowledgeVersion]
 * @param {{id?: string, title?: string, placeName?: string, domainPackIds?: string[]}} [context.demoVisitSeed] 単一デモ用（後方互換）。`demoVisitSeeds` があればそちらを優先
 * @param {{id?: string, title?: string, placeName?: string, domainPackIds?: string[]}[]} [context.demoVisitSeeds] 複数デモ訪問の定義。各デモ写真は自分の `visitId` で訪問に割り当てられる
 * @returns {MigrationResult}
 */
export function migrateProjectDocument(stored, context) {
  /** @type {string[]} */
  const notes = [];

  try {
    // 複数デモ訪問対応。`demoVisitSeeds`（配列）を正とし、無ければ単一
    // `demoVisitSeed`（後方互換）→ 既定の福井デモ 1 件へフォールバックする。
    const demoVisitSeeds =
      Array.isArray(context.demoVisitSeeds) && context.demoVisitSeeds.length
        ? context.demoVisitSeeds
        : context.demoVisitSeed
          ? [context.demoVisitSeed]
          : [{}];
    const demoVisits = createDemoVisits(demoVisitSeeds);
    const demoVisitIds = new Set(demoVisits.map((visit) => visit.id));
    // デモ写真はデータ側の `visitId` に従って訪問へ割り当てる（無ければ既定デモへ）。
    const normaliseDemoPhoto = (/** @type {any} */ photo) =>
      normalisePhoto(photo, photo.visitId || DEMO_VISIT_ID);

    // ---------------------------------------------- 初回起動 ---
    if (!stored) {
      return {
        ok: true,
        changed: true,
        notes: ["保存データが無いため、デモ訪問だけを用意しました。"],
        project: {
          id: "default",
          schemaVersion: PROJECT_SCHEMA_VERSION,
          updatedAt: Date.now(),
          visits: demoVisits,
          // 初回は未選択にしておき、UI で「デモを見る／自分の訪問を作る」を選ばせる。
          activeVisitId: null,
          userId: "user-local",
          photos: context.demoPhotos.map(normaliseDemoPhoto),
          relations: context.demoRelations.map((relation) => ({ ...relation })),
          facts: context.demoFacts.map((fact) => ({ ...fact })),
          referenceFacts: (context.demoReferenceFacts || []).map((fact) => ({ ...fact })),
          demoKnowledgeVersion: context.demoKnowledgeVersion || null,
          quizResults: [],
          learningEvents: [],
          userKnowledgeStates: [],
        },
      };
    }

    if (typeof stored !== "object" || Array.isArray(stored)) {
      return {
        ok: false,
        reason:
          "保存データの形式が想定と違います（オブジェクトではありません）。",
      };
    }

    // -------------------------------------------- すでに v2 ---
    if (Array.isArray(stored.visits) && stored.visits.length) {
      const storedVisitIds = new Set(stored.visits.map((visit) => visit.id));
      // ユーザーがデモ訪問を 1 つでも残しているか。すべて消していたら補充しない。
      const hasDemoVisit = stored.visits.some(
        (visit) => demoVisitIds.has(visit.id) || visit.source === "demo",
      );
      const shouldSeedDemo = hasDemoVisit && stored.demoKnowledgeVersion !== context.demoKnowledgeVersion;

      // 版が上がったときだけ、まだ保存されていないデモ訪問（＝今回追加されたデモ）を
      // 写真・観察ごと足す。既存デモ訪問の整理進捗には触れない。
      const missingDemoVisits = shouldSeedDemo
        ? demoVisits.filter((visit) => !storedVisitIds.has(visit.id))
        : [];
      const missingDemoVisitIds = new Set(missingDemoVisits.map((visit) => visit.id));
      const missingDemoPhotos = missingDemoVisits.length
        ? (context.demoPhotos || [])
            .filter((photo) => missingDemoVisitIds.has(photo.visitId || DEMO_VISIT_ID))
            .map(normaliseDemoPhoto)
        : [];
      const missingDemoObservationIds = new Set(
        missingDemoPhotos.flatMap((photo) =>
          (photo.observations || []).map((observation) => observation.id),
        ),
      );
      const retiredDemoReferenceFactIds = shouldSeedDemo ? new Set(context.demoRetiredReferenceFactIds || []) : new Set();
      const demoReferenceFactsById = new Map((context.demoReferenceFacts || []).map((fact) => [fact.id, fact]));
      const storedReferenceFacts = Array.isArray(stored.referenceFacts)
        ? stored.referenceFacts
            .filter((fact) => !retiredDemoReferenceFactIds.has(fact.id) || fact.sourceType !== "curated")
            .map((fact) => {
              const replacement = shouldSeedDemo && fact.sourceType === "curated"
                ? demoReferenceFactsById.get(fact.id)
                : null;
              return { ...(replacement || fact) };
            })
        : [];
      const knownReferenceFactIds = new Set(storedReferenceFacts.map((fact) => fact.id));
      const storedRelations = Array.isArray(stored.relations)
        ? stored.relations.map((relation) => ({ ...relation }))
        : [];
      const knownRelationIds = new Set(storedRelations.map((relation) => relation.id));
      const demoObservationIds = new Set(
        (context.demoPhotos || []).flatMap((photo) =>
          (photo.observations || []).map((observation) => observation.id),
        ),
      );
      const demoRelationsToAdd = hasDemoVisit
        ? (context.demoRelations || [])
            .filter(
              (relation) =>
                demoObservationIds.has(relation.sourceId) &&
                demoObservationIds.has(relation.targetId) &&
                !knownRelationIds.has(relation.id),
            )
            .map((relation) => ({ ...relation }))
        : [];
      const relations = [...storedRelations, ...demoRelationsToAdd];

      // 追加デモ訪問の LearningFact（新しい観察に紐づくものだけ）を補う。
      const storedFacts = Array.isArray(stored.facts) ? stored.facts : [];
      const storedFactIds = new Set(storedFacts.map((fact) => fact.id));
      const missingDemoFacts = (context.demoFacts || []).filter(
        (fact) =>
          !storedFactIds.has(fact.id) &&
          missingDemoObservationIds.has(fact.targetId ?? fact.targetObservationId),
      );

      const demoDataChanged =
        shouldSeedDemo ||
        demoRelationsToAdd.length > 0 ||
        missingDemoVisits.length > 0;
      if (shouldSeedDemo) {
        storedReferenceFacts.push(
          ...(context.demoReferenceFacts || [])
            .filter((fact) => !knownReferenceFactIds.has(fact.id))
            .map((fact) => ({ ...fact })),
        );
      }

      const seedNotes = [];
      if (missingDemoVisits.length) {
        seedNotes.push(`新しいデモ訪問 ${missingDemoVisits.length}件を追加しました。`);
      }
      if (shouldSeedDemo || demoRelationsToAdd.length > 0) {
        seedNotes.push("保存済みデモ訪問へ不足していた初期知識を補充しました。");
      }

      return {
        ok: true,
        changed: demoDataChanged,
        notes: demoDataChanged ? seedNotes : ["移行は不要でした。"],
        project: {
          ...stored,
          schemaVersion: PROJECT_SCHEMA_VERSION,
          userId: stored.userId || "user-local",
          activeVisitId: stored.activeVisitId ?? null,
          visits: missingDemoVisits.length
            ? [...stored.visits, ...missingDemoVisits]
            : stored.visits,
          photos: missingDemoPhotos.length
            ? [
                ...(Array.isArray(stored.photos) ? stored.photos : []),
                ...missingDemoPhotos,
              ]
            : stored.photos,
          facts: missingDemoFacts.length
            ? [...storedFacts, ...missingDemoFacts]
            : stored.facts,
          quizResults: Array.isArray(stored.quizResults)
            ? stored.quizResults
            : [],
          learningEvents: Array.isArray(stored.learningEvents) ? stored.learningEvents : [],
          userKnowledgeStates: Array.isArray(stored.userKnowledgeStates) ? stored.userKnowledgeStates : [],
          relations,
          referenceFacts: storedReferenceFacts,
          demoKnowledgeVersion: demoDataChanged
            ? context.demoKnowledgeVersion
            : stored.demoKnowledgeVersion || null,
        },
      };
    }

    // ------------------------------------------------ v1 → v2 ---
    const storedPhotos = Array.isArray(stored.photos) ? stored.photos : [];

    // 保存済みのデモ写真は「整理の続き」なので、デモ写真の並びを土台に上書きする。
    const savedById = new Map(
      storedPhotos.map((/** @type {any} */ p) => [p.id, p]),
    );
    const photos = context.demoPhotos.map((demoPhoto) => {
      const saved = savedById.get(demoPhoto.id);
      const merged = saved
        ? {
            ...demoPhoto,
            status: saved.status || demoPhoto.status,
            experienceMemo: saved.experienceMemo ?? "",
            observations: Array.isArray(saved.observations)
              ? saved.observations
              : demoPhoto.observations,
          }
        : demoPhoto;
      return normaliseDemoPhoto(merged);
    });

    const demoIds = new Set(context.demoPhotos.map((photo) => photo.id));
    const uploaded = storedPhotos.filter(
      (/** @type {any} */ photo) =>
        !demoIds.has(photo.id) && photo.source !== "sample",
    );

    const visits = [...demoVisits];
    let activeVisitId = demoVisits[0]?.id ?? DEMO_VISIT_ID;

    if (uploaded.length) {
      const migratedVisit = createVisit({
        id: MIGRATED_VISIT_ID,
        title: "自分の訪問",
        placeName: "",
        visitedAt: null,
        domainPackIds: [uploaded[0].domainHint || "other"],
        source: "user",
      });
      visits.push(migratedVisit);
      // ユーザーの写真がある以上、そちらを開いた方が自然。
      activeVisitId = migratedVisit.id;
      photos.push(
        ...uploaded.map((/** @type {any} */ photo) =>
          normalisePhoto(photo, MIGRATED_VISIT_ID),
        ),
      );
      notes.push(
        `追加済みの写真 ${uploaded.length}枚を「自分の訪問」へ移しました。`,
      );
    } else {
      notes.push("追加済みの写真はありませんでした。");
    }

    // 学習状態は id と status だけを保存していたため、デモ定義の上に重ねる。
    const savedFactStatus = new Map(
      (Array.isArray(stored.facts) ? stored.facts : []).map(
        (/** @type {any} */ f) => [f.id, f.status],
      ),
    );
    const facts = context.demoFacts.map((fact) => ({
      ...fact,
      status: savedFactStatus.get(fact.id) ?? fact.status,
    }));

    const relations =
      Array.isArray(stored.relations) && stored.relations.length
        ? stored.relations.map((/** @type {any} */ r) => ({ ...r }))
        : context.demoRelations.map((relation) => ({ ...relation }));

    const storedResults = Array.isArray(stored.quizResults)
      ? stored.quizResults
      : [];
    const legacyCount = storedResults.filter(isLegacyQuizResult).length;
    const quizResults = storedResults.filter(
      (/** @type {any} */ r) => !isLegacyQuizResult(r),
    );
    if (legacyCount) {
      notes.push(
        `旧形式のクイズ結果 ${legacyCount}件は、設問単位で復元できないため破棄しました。`,
      );
    }

    return {
      ok: true,
      changed: true,
      notes,
      project: {
        id: stored.id || "default",
        schemaVersion: PROJECT_SCHEMA_VERSION,
        userId: stored.userId || "user-local",
        updatedAt: Date.now(),
        visits,
        activeVisitId,
        photos,
        relations,
        facts,
        referenceFacts: [
          ...(Array.isArray(stored.referenceFacts)
            ? stored.referenceFacts.map((fact) => ({ ...fact }))
            : []),
          ...(context.demoReferenceFacts || []).filter(
            (fact) => !(Array.isArray(stored.referenceFacts) ? stored.referenceFacts : []).some((storedFact) => storedFact.id === fact.id),
          ).map((fact) => ({ ...fact })),
        ],
        demoKnowledgeVersion: context.demoKnowledgeVersion || null,
        quizResults,
        learningEvents: Array.isArray(stored.learningEvents) ? stored.learningEvents.map((event) => ({ ...event })) : [],
        userKnowledgeStates: Array.isArray(stored.userKnowledgeStates) ? stored.userKnowledgeStates.map((state) => ({ ...state })) : [],
      },
    };
  } catch (error) {
    // ここへ来ても呼び出し側は旧データを保持したままにする。
    return {
      ok: false,
      reason: `保存データを移行できませんでした（${error instanceof Error ? error.message : String(error)}）。既存のデータはそのままです。`,
    };
  }
}
