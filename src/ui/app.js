import {
  DEFAULT_PROJECT_ID,
  StorageWriteError,
} from "../repositories/knowledge-repository.js";
import {
  formatBytes,
  isRunningOutOfSpace,
  readEstimate,
} from "../repositories/storage-persistence.js";
import {
  importPhotos,
  selectImageFiles,
} from "../features/photos/photo-import.js";
import { drainSharedPhotos } from "../features/photos/shared-inbox.js";
import { shareOrDownload } from "../features/project/share-file.js";
import {
  buildExportDocument,
  documentToProject,
  readProjectFile,
} from "../features/project/project-json.js";
import {
  LEARNING_FACTS,
  SAMPLE_COLLECTIONS,
  SAMPLE_ENTITIES,
  SAMPLE_PHOTOS,
  SAMPLE_RELATIONS,
  SAMPLE_STORIES,
  SAMPLE_VISIT,
  SAMPLE_VISITS,
} from "../data/demo/sample-data.js";
import { DEMO_KNOWLEDGE_VERSION, DEMO_REFERENCE_FACTS, DEMO_RETIRED_REFERENCE_FACT_IDS } from "../data/demo/demo-knowledge.js";
import {
  collectVisitCascade,
  copyFactsForProject,
  createVisit,
  DEMO_VISIT_ID,
  isDemoVisit,
  pickNextActiveVisitId,
  updateVisit,
  visitFacts,
  validateVisit,
} from "../domain/visit.js";
import {
  createObservation,
  displayedImageRect,
  observationReferences,
  regionFromPoints,
  removeObservation,
  resetRegionDraft,
  restoreRegionAfterCancel,
  updateObservation,
} from "../domain/observation.js";
import {
  isTutorialSeen,
  markTutorialSeen,
  nextTutorialIndex,
  previousTutorialIndex,
  renderTutorialStep as renderTutorialStepContent,
} from "./tutorial.js";
import {
  applyRelationTypeSelection,
  isApprovableRelation,
  isDirectedRelation,
  isSelectableObservation,
  relationCandidates,
  RELATION_SCOPES,
  relationReviewActions,
  relationsForPhotoInVisit,
  removeRelation,
  endpointPresentation,
  endpointSelectionLabel,
  relationTypeDisplay,
  scopeForRelationEndpoints,
  searchRelationEntries,
  swapRelationEndpoints,
} from "../domain/relation.js";
import {
  migrateProjectDocument,
  PROJECT_SCHEMA_VERSION,
} from "../features/project/migrate.js";
import {
  buildKnowledgeGraphView,
  buildObservationFocusGraph,
  buildRadialLayout,
  expandReferenceGraphNodes,
  filterGraphByAxis,
  getKnowledgeGraphNodeDetail,
  getRadialNodeShape,
  shouldShowKnowledgeAxisControls,
} from "../features/knowledge-graph/selectors.js";
import {
  buildQuizResultEntries,
  describeQuizAvailability,
  getQuizCards,
  MIN_COMPARABLE_OBSERVATIONS,
  QUIZ_DIFFICULTIES,
  QUIZ_QUESTION_TYPES,
  scoreQuizAnswer,
} from "../features/knowledge-graph/quiz-generation.js";
import { getReferenceChildren } from "../domain/reference-registry.js";
import { LOCAL_USER_ID, mergeQuizResultsIntoLearningEvents, rebuildUserKnowledgeStates, recordQuizLearning, removeVisitLearningRecords } from "../domain/learning-state.js";
import { getLearnedReferenceFacts } from "../domain/learned-reference-facts.js";
import { buildCollectionProgressForView } from "../features/collections/collection-progress.js";
import { displayedPointToStoredPoint, normalizePhotoRotation, rotatePhoto } from "../domain/photo-rotation.js";
import { bindObservationAddButton, observationNumberAnchorClass, renderObservationCandidateStep } from "./organize-view.js";
import {
  applyMagnifierGeometry,
  bindMagnifierInteractions,
  calculateMagnifierGeometry,
  clampMagnifierZoom,
  MAGNIFIER_MIN_ZOOM,
  MAGNIFIER_ZOOM_STEP,
  mountMagnifier,
} from "./organize-magnifier.js";
import { renderKnowledgeDisplayAttributes } from "./knowledge-display.js";
import { knowledgeEdgeLabel, knowledgeNodeLabel, knowledgeNodeText } from "./knowledge-labels.js";
import { renderQuizPhotoMedia } from "./quiz-photo.js";
import { renderObservationQuizCard } from "./observation-quiz-card.js";
import {
  placementForTimelineReference,
  quizPlacementMarkers,
  renderHierarchyQuizBoard,
  renderQuizPlacementMarkers,
  renderTimelineQuizBoard,
  shiftTimelinePlacement,
} from "./structure-quiz-board.js";
import { buildVerifiedReferenceFact, renderReferenceFactEditor } from "./reference-fact-editor.js";
import { quizAttemptContextKey, reconcileQuizQuestionTypes, renderQuizQuestionTypeControls, updateQuizQuestionTypeSelection } from "./quiz-setup.js";
import { MISSING_PHOTO_SRC } from "./photo-assets.js";
import { escapeHtml } from "./html.js";

const MAX_UPLOAD_BATCH = 120;
const STATUS_LABELS = {
  unorganized: "未整理",
  "in-progress": "整理中",
  organized: "整理済み",
};
const OBSERVATION_TYPE_LABELS = {
  physical: "実体",
  information: "説明・図表",
  space: "場所・空間",
  concept: "概念",
  feature: "部分・特徴",
};
const LEARNING_ROLE_DESCRIPTIONS = {
  direct: "今回の中心となる展示物や対象です。",
  explains: "他の対象を説明するパネルや資料です。",
  comparison: "違いや共通点を比べるための対象です。",
  context: "時代、環境、歴史などを補足する対象です。",
  detail: "全体の一部や、注目した細かな箇所です。",
  route: "展示場所、移動経路、周辺環境です。",
  memory: "自分の体験や印象に関係する対象です。",
  evidence: "判断の根拠となる標本、図表、説明です。",
};
const FACT_SOURCE_LABELS = {
  panel: "説明パネルから",
  learning: "追加学習から",
  external: "外部資料から",
  user: "自分のメモ",
};

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {any}
 */
const $ = (selector, root = document) => root.querySelector(selector);

/**
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {any[]}
 */
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const clone = (/** @type {any} */ value) => JSON.parse(JSON.stringify(value));
const uid = (/** @type {string} */ prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Boot the whole UI.
 *
 * Every external dependency is injected so the UI never reaches for a concrete
 * storage engine or an analysis backend on its own.
 *
 * @param {object} deps
 * @param {import('../repositories/knowledge-repository.js').KnowledgeRepository} deps.repository
 * @param {import('../domain/registry.js').DomainRegistry} deps.registry
 * @param {ReturnType<typeof import('../domain/registry.js').buildLookups>} deps.lookups
 * @param {import('../services/analysis/analysis-provider.js').AnalysisProvider} deps.analysisProvider
 * @param {import('../repositories/storage-persistence.js').StorageStatus} deps.storageStatus
 * @param {{supported: boolean, applyUpdate: () => Promise<void>}} deps.serviceWorker
 * @param {{graph:any}} deps.referenceData
 */
export async function initApp(deps) {
  const {
    repository,
    registry,
    lookups,
    analysisProvider,
    storageStatus,
    serviceWorker,
    referenceData,
  } = deps;
  const { genericLabel, relationLabel, packLabel, packCategoryLabel } = lookups;

  /** Object URLs handed out for imported photos; revoked when replaced. */
  const objectUrls = new Map();

  let entityMap = new Map(SAMPLE_ENTITIES.map((item) => [item.id, item]));

  // ---------------------------------------------------------------- state ---

  const state = {
    userId: LOCAL_USER_ID,
    /** @type {import('../domain/visit.js').Visit[]} */
    visits: [],
    /** @type {string|null} */
    activeVisitId: null,
    /** @type {string|null} */
    editingVisitId: null,
    /** @type {any[]} */
    photos: [],
    /** @type {any[]} */
    relations: [],
    /** @type {any[]} */
    facts: [],
    entities: SAMPLE_ENTITIES.map((item) => ({ ...item })),
    referenceFacts: [],
    demoKnowledgeVersion: null,
    referenceDataVersion: null,
    sourceMetadata: {},
    /** @type {any[]} */
    quizResults: [],
    learningEvents: [],
    userKnowledgeStates: [],
    photoFilter: "all",
    /** @type {File[]} */
    selectedFiles: [],
    selectedFileRotations: [],
    /** @type {string|null} */
    modalPhotoId: null,
    relationPreviewObservationId: null,
    organizePhotoId: "p03",
    organizeStep: 1,
    /** @type {string|null} */
    activeObservationId: "o03a",
    knowledgeMode: "observed",
    knowledgeViewMode: "overview",
    knowledgeLayoutMode: "radial",
    knowledgeZoom: 1,
    knowledgeAxis: "all",
    knowledgeExpanded: new Set(),
    knowledgeDetailNodeId: null,
    /** @type {string|null} */
    knowledgeObservationId: "o07a",
    knowledgeSearch: "",
    deck: "observed",
    quizIndex: 0,
    quizScore: 0,
    quizAnswered: false,
    quizCompleted: false,
    quizCurrentAnswer: null,
    quizActiveCardId: null,
    quizAnswerQuizId: null,
    quizRetry: false,
    quizDifficulty: "easy",
    quizScope: "active",
    quizQuestionTypes: QUIZ_QUESTION_TYPES.map((type) => type.id),
    quizStarted: false,
    deckAttemptId: null,
    quizAttemptVisitId: null,
    importing: false,
    /** @type {AbortController|null} */
    importAbort: null,
    editingObservationId: null,
    pendingObservationRegion: null,
    regionDrawing: false,
    regionPointerId: null,
    regionDrawStart: null,
    regionDraft: null,
    observationDraft: null,
    regionDrawingOriginalRegion: null,
    regionDrawingObservationId: null,
    editingRelationId: null,
    relationDraft: null,
    /** @type {string} */
    relationScope: RELATION_SCOPES.PHOTO,
    relationPicker: null,
    relationSearch: { source: "", target: "" },
  };

  let tutorialIndex = 0;

  let imageSurfaceObserver = null;
  let imageSurfaceResizeBound = false;
  let imageSurfaceFrame = null;
  let organizeInteractionMode = "pan";
  let organizeMagnifierActive = false;
  let organizeLensPoint = null;
  let organizeMagnifierBinding = null;
  let organizeLensZoom = MAGNIFIER_MIN_ZOOM;

  /**
   * The bundled demo photos, as records. The migration layers saved state on
   * top of these, so the 20 samples survive any storage mishap.
   * @returns {any[]}
   */
  function demoPhotos() {
    return clone(SAMPLE_PHOTOS).map((/** @type {any} */ photo) => ({
      ...photo,
      visitId: photo.visitId || DEMO_VISIT_ID,
      source: "sample",
      observations: photo.observations.map(
        (/** @type {any} */ observation) => ({
          photoId: photo.id,
          included: true,
          origin: "ai",
          ...observation,
        }),
      ),
    }));
  }

  /** Everything the migration needs to rebuild the demo visit. */
  function migrationContext() {
    return {
      demoPhotos: demoPhotos(),
      demoRelations: clone(SAMPLE_RELATIONS),
      demoFacts: clone(LEARNING_FACTS),
      demoReferenceFacts: clone(DEMO_REFERENCE_FACTS),
      demoRetiredReferenceFactIds: [...DEMO_RETIRED_REFERENCE_FACT_IDS],
      demoKnowledgeVersion: DEMO_KNOWLEDGE_VERSION,
      demoVisitSeeds: SAMPLE_VISITS.map((visit) => ({
        id: visit.id,
        title: visit.title,
        placeName: visit.place,
        domainPackIds: visit.domainHints,
      })),
    };
  }

  /**
   * Load a stored project into state, migrating it if needed.
   *
   * Migration goes through the shared `migrateProjectDocument()` — there is no
   * second migration path in this file (see Issue #9).
   *
   * @param {any} saved
   * @returns {Promise<{ok: boolean, reason?: string, notes?: string[]}>}
   */
  async function applyProject(saved) {
    const result = migrateProjectDocument(saved, migrationContext());
    if (!result.ok) {
      // Leave whatever is on screen alone; the caller reports the reason.
      return { ok: false, reason: result.reason };
    }

    const project = result.project;
    state.userId = project.userId || LOCAL_USER_ID;
    state.visits = project.visits;
    state.activeVisitId = project.activeVisitId;
    state.photos = project.photos.map((/** @type {any} */ photo) => ({
      ...photo,
      src: photo.source === "sample" ? `assets/${photo.file}` : photo.src,
      thumbSrc: photo.source === "sample" ? `assets/${photo.file}` : photo.thumbSrc,
    }));
    state.relations = project.relations;
    state.facts = project.facts;
    state.entities = Array.isArray(project.entities)
      ? project.entities.map((entity) => ({ ...entity }))
      : SAMPLE_ENTITIES.map((entity) => ({ ...entity }));
    entityMap = new Map(state.entities.map((entity) => [entity.id, entity]));
    state.referenceFacts = project.referenceFacts || [];
    state.demoKnowledgeVersion = project.demoKnowledgeVersion || null;
    state.referenceDataVersion = project.referenceDataVersion ?? null;
    state.sourceMetadata = project.sourceMetadata || {};
    state.quizResults = project.quizResults || [];
    state.learningEvents = mergeQuizResultsIntoLearningEvents(project.learningEvents || [], state.quizResults, state.userId);
    state.userKnowledgeStates = rebuildUserKnowledgeStates(state.learningEvents);

    await attachImportedPhotoUrls();
    normaliseSelection();
    return { ok: true, notes: result.notes };
  }

  /** Resolve Blob URLs for every imported photo, flagging any that went missing. */
  async function attachImportedPhotoUrls() {
    for (const photo of state.photos) {
      if (photo.source !== "upload") continue;
      try {
        const binary = await repository.loadPhotoBinary(photo.id);
        if (!binary) {
          photo.photoMissing = true;
          photo.src = MISSING_PHOTO_SRC;
          photo.thumbSrc = MISSING_PHOTO_SRC;
          continue;
        }
        setPhotoUrls(photo, binary);
      } catch {
        photo.photoMissing = true;
        photo.src = MISSING_PHOTO_SRC;
        photo.thumbSrc = MISSING_PHOTO_SRC;
      }
    }
  }

  /**
   * @param {any} photo
   * @param {import('../repositories/knowledge-repository.js').PhotoBinary} binary
   */
  function setPhotoUrls(photo, binary) {
    const previous = objectUrls.get(photo.id);
    if (previous) {
      URL.revokeObjectURL(previous.src);
      URL.revokeObjectURL(previous.thumbSrc);
    }
    const urls = {
      src: URL.createObjectURL(binary.display),
      thumbSrc: URL.createObjectURL(binary.thumbnail),
    };
    objectUrls.set(photo.id, urls);
    photo.src = urls.src;
    photo.thumbSrc = urls.thumbSrc;
    photo.photoMissing = false;
  }

  // ---------------------------------------------------------------- visit ---

  /** @returns {import('../domain/visit.js').Visit|null} */
  function activeVisit() {
    return state.visits.find((visit) => visit.id === state.activeVisitId) || null;
  }

  /**
   * The photos of the current visit. **Every screen renders from this, never
   * from `state.photos`** — that is what keeps demo and user data apart.
   * @returns {any[]}
   */
  function visitPhotos() {
    if (!state.activeVisitId) return [];
    return state.photos.filter((photo) => photo.visitId === state.activeVisitId);
  }

  /** True while the demo visit is open. Demo-only content keys off this. */
  function viewingDemo() {
    return isDemoVisit(activeVisit());
  }

  /** Keep the "currently selected" ids pointing at something in this visit. */
  function normaliseSelection() {
    const photos = visitPhotos();
    if (!photos.some((photo) => photo.id === state.organizePhotoId)) {
      state.organizePhotoId = photos[0]?.id || null;
    }
    const photo = photoById(state.organizePhotoId);
    if (
      photo &&
      !photo.observations.some(
        (/** @type {any} */ item) => item.id === state.activeObservationId,
      )
    ) {
      state.activeObservationId =
        photo.observations.find(
          (/** @type {any} */ item) => item.included !== false,
        )?.id || null;
    }
  }

  // -------------------------------------------------------------- storage ---

  /** @type {ReturnType<typeof setTimeout>|null} */
  let persistTimer = null;

  /** @returns {import('../repositories/knowledge-repository.js').Project} */
  function toProject() {
    return {
      id: DEFAULT_PROJECT_ID,
      schemaVersion: PROJECT_SCHEMA_VERSION,
      updatedAt: Date.now(),
      userId: state.userId,
      visits: state.visits,
      activeVisitId: state.activeVisitId,
      photos: state.photos.map((photo) => ({
        id: photo.id,
        visitId: photo.visitId,
        file: photo.file,
        order: photo.order,
        title: photo.title,
        status: photo.status,
        source: photo.source,
        domainHint: photo.domainHint,
        rotation: normalizePhotoRotation(photo.rotation),

        capturedAt: photo.capturedAt ?? null,
        fileLastModified: photo.fileLastModified ?? null,
        importedAt: photo.importedAt ?? null,
        originalFileName: photo.originalFileName ?? null,
        originalMimeType: photo.originalMimeType ?? null,
        originalBytes: photo.originalBytes ?? null,
        originalWidth: photo.originalWidth ?? null,
        originalHeight: photo.originalHeight ?? null,
        experienceMemo: photo.experienceMemo ?? "",

        observations: photo.observations,
      })),
      relations: state.relations,
      facts: copyFactsForProject(state.facts),
      entities: state.entities.map((entity) => ({ ...entity })),
      referenceFacts: state.referenceFacts.map((fact) => ({ ...fact })),
      demoKnowledgeVersion: state.demoKnowledgeVersion,
      referenceDataVersion: state.referenceDataVersion,
      sourceMetadata: { ...state.sourceMetadata },
      quizResults: state.quizResults,
      learningEvents: state.learningEvents,
      userKnowledgeStates: state.userKnowledgeStates,
    };
  }

  /** Coalesce the many small edits the organise screen produces into one write. */
  function persist() {
    if ($("#collectionGrid")) renderCollections();
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => void flushPersist(), 250);
  }

  async function flushPersist() {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    try {
      await repository.saveProject(toProject());
      hideStorageAlert();
    } catch (error) {
      showStorageAlert(
        error instanceof StorageWriteError
          ? error.message
          : "整理内容を端末へ保存できませんでした。JSONを書き出して控えを取ってください。",
      );
    }
  }

  /** @param {string} message */
  function showStorageAlert(message) {
    const banner = $("#storageAlert");
    if (!banner) return;
    $("#storageAlertText").textContent = message;
    banner.classList.add("show");
  }

  function hideStorageAlert() {
    $("#storageAlert")?.classList.remove("show");
  }

  async function renderStorageNote() {
    const note = $("#storageNote");
    if (!note) return;
    const estimate = await readEstimate();
    const persisted = storageStatus.persisted
      ? "永続保存が有効です"
      : storageStatus.supported
        ? "永続保存は未許可です（ホーム画面へ追加すると有効になりやすくなります）"
        : "この環境では永続保存を要求できません";
    note.textContent = `${persisted}・使用量 ${formatBytes(estimate.usageBytes)} / ${formatBytes(estimate.quotaBytes)}`;
    if (isRunningOutOfSpace(estimate)) {
      showStorageAlert(
        "端末の空き容量が少なくなっています。JSONを書き出してから写真を整理してください。",
      );
    }
  }

  // -------------------------------------------------------------- helpers ---

  /**
   * Observations of the current visit only. Knowledge map, quizzes and
   * collections all read through here, so none of them can leak across visits.
   */
  function allObservations({ includedOnly = false } = {}) {
    return visitPhotos().flatMap((photo) =>
      photo.observations
        .filter(
          (/** @type {any} */ observation) =>
            !includedOnly || observation.included !== false,
        )
        .map((/** @type {any} */ observation) => ({
          ...observation,
          photoId: photo.id,
        })),
    );
  }

  function photoById(/** @type {string|null} */ id) {
    return state.photos.find((photo) => photo.id === id);
  }

  function originalPhotoSource(/** @type {any} */ photo) {
    return photo?.src || photo?.originalSrc || MISSING_PHOTO_SRC;
  }

  function mountPhotoMagnifier(
    /** @type {any} */ container,
    /** @type {any} */ image,
    /** @type {any} */ photo,
    { showControls = true } = {},
  ) {
    return mountMagnifier(container, image, {
      showControls,
      rotation: normalizePhotoRotation(photo?.rotation),
      source: originalPhotoSource(photo),
    });
  }

  function observationById(/** @type {string|null} */ id) {
    for (const photo of state.photos) {
      const observation = photo.observations.find(
        (/** @type {any} */ item) => item.id === id,
      );
      if (observation) return { observation, photo };
    }
    return null;
  }

  const factUnlocked = (/** @type {any} */ fact) => fact?.status === "learned";
  const packCategories = (/** @type {string} */ packId) =>
    registry.categoriesByPack[packId] || [];

  function showToast(/** @type {string} */ message) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(/** @type {any} */ (showToast).timer);
    /** @type {any} */ (showToast).timer = setTimeout(
      () => toast.classList.remove("show"),
      2800,
    );
  }

  function switchView(/** @type {string} */ viewName) {
    cancelRegionDrawing({ clearDraft: true });
    if (viewName !== "organize") organizeMagnifierBinding?.reset();
    $$(".view").forEach((view) =>
      view.classList.toggle("active", view.id === `view-${viewName}`),
    );
    $$("[data-view]").forEach((button) =>
      button.classList.toggle("active", button.dataset.view === viewName),
    );
    if (viewName === "photos") renderPhotos();
    if (viewName === "organize") renderOrganize();
    if (viewName === "knowledge") renderKnowledge();
    if (viewName === "learn") renderLearn();
    if (viewName === "collection") renderCollections();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function countConfirmedObservations() {
    return allObservations({ includedOnly: true }).filter(
      (item) => item.status === "confirmed",
    ).length;
  }

  // ------------------------------------------------------------ rendering ---

  function renderOverview() {
    const observations = allObservations({ includedOnly: true });
    const learned = visitFacts(
      { photos: state.photos, facts: state.facts },
      state.activeVisitId,
    ).filter(factUnlocked).length;
    $("#statPhotos").textContent = visitPhotos().length;
    $("#statObservations").textContent = observations.length;
    $("#statConfirmed").textContent = countConfirmedObservations();
    $("#statLearned").textContent = learned;
    $("#heroObservationCount").textContent = `${observations.length}の観察対象`;

    $("#visitTemplateGrid").innerHTML = registry.visitTemplates
      .map(
        (template) => `
      <article class="visit-template-card">
        <span class="visit-template-icon">${escapeHtml(template.icon)}</span>
        <div><h3>${escapeHtml(template.title)}</h3><p>${escapeHtml(template.description)}</p></div>
        <span class="template-state">${template.id === "paleontology" ? "サンプルあり" : "同じ基盤で対応"}</span>
      </article>`,
      )
      .join("");
  }

  function renderPhotos() {
    const filtered = visitPhotos().filter((photo) => {
      if (state.photoFilter === "all") return true;
      if (state.photoFilter === "multi")
        return (
          photo.observations.filter(
            (/** @type {any} */ item) => item.included !== false,
          ).length > 1
        );
      return photo.status === state.photoFilter;
    });

    $("#photoGrid").innerHTML = filtered.length
      ? filtered
          .map((photo) => {
            const observations = photo.observations.filter(
              (/** @type {any} */ item) => item.included !== false,
            );
            const categoryIds = [
              ...new Set(
                observations.flatMap(
                  (/** @type {any} */ item) => item.genericCategories,
                ),
              ),
            ].slice(0, 3);
            return `
        <article class="photo-card">
          <button class="photo-card-button" data-photo-id="${escapeHtml(photo.id)}">
            <div class="photo-thumb${photo.photoMissing ? " photo-missing" : ""}">
              <img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="${escapeHtml(photo.title)}" loading="lazy" ${rotationStyle(photo.rotation) ? `style="${rotationStyle(photo.rotation)}"` : ""} />
              <span class="photo-order">${String(photo.order || 0).padStart(2, "0")}</span>
              <span class="photo-status status-${escapeHtml(photo.status)}">${escapeHtml(STATUS_LABELS[photo.status] || "未整理")}</span>
              ${photo.photoMissing ? '<span class="photo-missing-flag">写真未接続</span>' : ""}
            </div>
            <div class="photo-card-body">
              <div class="photo-card-meta"><span>${observations.length} 対象</span><span>${observations.filter((/** @type {any} */ item) => item.status === "confirmed").length} 確認済み</span></div>
              <h3>${escapeHtml(photo.title)}</h3>
              <div class="mini-tag-list">${categoryIds.map((id) => `<span>${escapeHtml(genericLabel(id))}</span>`).join("") || "<span>対象未登録</span>"}</div>
            </div>
          </button>
        </article>`;
          })
          .join("")
      : '<div class="empty-state"><strong>該当する写真はありません</strong><p>別の絞り込みを選択してください。</p></div>';

    $$("[data-photo-id]").forEach((button) =>
      button.addEventListener("click", () =>
        openPhotoModal(button.dataset.photoId),
      ),
    );
  }

  function renderOverlay(
    /** @type {any} */ root,
    /** @type {any} */ photo,
    options = {},
  ) {
    const { interactive = false, modal = false } = options;
    const observations = photo.observations.filter(
      (/** @type {any} */ item) => item.included !== false,
    );
    root.innerHTML = observations
      .map((/** @type {any} */ observation, /** @type {number} */ index) => {
        if (!observation.region)
          return `
        <button class="whole-observation-chip ${observation.id === state.activeObservationId ? "active" : ""}" style="top:${8 + index * 34}px" data-overlay-observation="${escapeHtml(observation.id)}" ${interactive ? "" : 'tabindex="-1"'}>
          ${index + 1}. ${escapeHtml(observation.label)}
        </button>`;
        const { x, y, w, h } = observation.region;
        return `
        <button class="observation-box ${observation.id === state.activeObservationId ? "active" : ""}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%" data-overlay-observation="${escapeHtml(observation.id)}" aria-label="${escapeHtml(observation.label)}" ${interactive ? "" : 'tabindex="-1"'}>
          <span class="${observationNumberAnchorClass(photo.rotation)}">${index + 1}</span>
        </button>`;
      })
      .join("");

    if (interactive) {
      $$("[data-overlay-observation]", root).forEach((button) =>
        button.addEventListener("click", () => {
          state.activeObservationId = button.dataset.overlayObservation;
          renderOrganize();
        }),
      );
    }
    if (modal) root.classList.add("modal-overlay-active");
  }

  function alignImageSurface(/** @type {any} */ surface, /** @type {any} */ container, /** @type {any} */ image) {
    if (!surface || !container || !image) return;
    const containerRect = container.getBoundingClientRect();
    const area = displayedImageRect(
      containerRect,
      image.naturalWidth || image.clientWidth,
      image.naturalHeight || image.clientHeight,
    );
    surface.style.left = `${area.left - containerRect.left}px`;
    surface.style.top = `${area.top - containerRect.top}px`;
    surface.style.width = `${area.width}px`;
    surface.style.height = `${area.height}px`;
  }

  function alignOrganizeSurfaces() {
    const stage = $("#organizeImageStage");
    const container = $("#annotatedPhoto");
    const image = $("#organizeImage");
    if (stage && container && image) {
      const containerRect = container.getBoundingClientRect();
      const area = displayedImageRect(
        containerRect,
        image.naturalWidth || image.clientWidth,
        image.naturalHeight || image.clientHeight,
      );
      stage.style.left = `${area.left - containerRect.left}px`;
      stage.style.top = `${area.top - containerRect.top}px`;
      stage.style.width = `${area.width}px`;
      stage.style.height = `${area.height}px`;
    } else {
      alignImageSurface($("#observationOverlay"), container, image);
      alignImageSurface($("#regionDrawLayer"), container, image);
    }
    const layer = $("#regionDrawLayer");
    const overlay = $("#observationOverlay");
    if (layer) {
      layer.style.pointerEvents = state.regionDrawing ? "auto" : "none";
      layer.style.zIndex = state.regionDrawing ? "4" : "2";
    }
    if (overlay) overlay.style.pointerEvents = state.regionDrawing ? "none" : "auto";
    if (container) {
      container.dataset.interactionMode = organizeInteractionMode;
      container.style.touchAction = organizeMagnifierActive ? "none" : "auto";
    }
    const zoomHint = $("#imageZoomHint");
    if (zoomHint) {
      zoomHint.classList.toggle("hidden", !image.src);
    }
    renderOrganizeMagnifier();
    const cancelButton = $("#cancelRegionDrawingButton");
    if (cancelButton) cancelButton.classList.toggle("hidden", !state.regionDrawing);
  }

  function scheduleImageSurfaceAlignment() {
    if (imageSurfaceFrame !== null) return;
    imageSurfaceFrame = requestAnimationFrame(() => {
      imageSurfaceFrame = null;
      alignOrganizeSurfaces();
      const modalImage = $("#modalImage");
      alignImageSurface(
        $("#modalOverlay"),
        $("#photoModal .modal-image-wrap"),
        modalImage,
      );
    });
  }

  function observeImageSurfaceSizes() {
    const containers = [
      $("#annotatedPhoto"),
      $("#photoModal .modal-image-wrap"),
    ].filter(Boolean);
    if (typeof ResizeObserver !== "undefined") {
      if (!imageSurfaceObserver) {
        imageSurfaceObserver = new ResizeObserver(scheduleImageSurfaceAlignment);
      }
      imageSurfaceObserver.disconnect();
      containers.forEach((container) => imageSurfaceObserver.observe(container));
    } else if (!imageSurfaceResizeBound) {
      window.addEventListener("resize", scheduleImageSurfaceAlignment);
      window.addEventListener("orientationchange", scheduleImageSurfaceAlignment);
      imageSurfaceResizeBound = true;
    }
  }

  function cleanupImageSurfaceObserver() {
    if (imageSurfaceFrame !== null) cancelAnimationFrame(imageSurfaceFrame);
    imageSurfaceFrame = null;
    imageSurfaceObserver?.disconnect();
    if (imageSurfaceResizeBound) {
      window.removeEventListener("resize", scheduleImageSurfaceAlignment);
      window.removeEventListener("orientationchange", scheduleImageSurfaceAlignment);
      imageSurfaceResizeBound = false;
    }
  }

  function imagePointPercent(/** @type {PointerEvent} */ event) {
    const baseRect = organizeBaseRect();
    if (!baseRect) return null;
    const point = displayedPointToStoredPoint({
      x: (event.clientX - baseRect.left) / baseRect.width,
      y: (event.clientY - baseRect.top) / baseRect.height,
    }, currentOrganizePhoto()?.rotation);
    return { x: point.x * 100, y: point.y * 100 };
  }

  function organizeBaseRect() {
    const stage = $("#organizeImageStage");
    if (!stage) return null;
    const rect = stage.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  function rotationTransform(rotation) {
    const value = normalizePhotoRotation(rotation);
    return value ? `rotate(${value}deg) scale(.82)` : "";
  }

  function rotationStyle(rotation) {
    const transform = rotationTransform(rotation);
    return transform ? `transform:${transform}` : "";
  }

  function rotatedPhotoFrame(/** @type {any} */ photo, content) {
    return `<span class="photo-rotation-frame" style="${rotationStyle(photo?.rotation)}">${content}</span>`;
  }

  function rotatePhotoById(photoId) {
    const photo = photoById(photoId);
    if (!photo) return;
    photo.rotation = rotatePhoto(photo.rotation);
    persist();
    renderAll();
    if (state.modalPhotoId === photoId) openPhotoModal(photoId);
    if (state.organizePhotoId === photoId) renderOrganize();
    showToast(`写真の向きを${photo.rotation}度にしました`);
  }

  function hideOrganizeLens() {
    organizeMagnifierActive = false;
    organizeLensPoint = null;
    const lens = $("#imageMagnifierLens");
    const controls = $("#imageMagnifierControls");
    lens?.classList.add("hidden");
    controls?.classList.add("hidden");
    alignOrganizeSurfaces();
  }

  function updateOrganizeLens(point) {
    const baseRect = organizeBaseRect();
    const container = $("#annotatedPhoto");
    const lens = $("#imageMagnifierLens");
    const lensImage = $("#imageMagnifierLensImage");
    const controls = $("#imageMagnifierControls");
    if (!baseRect || !container || !lens || !lensImage) return;
    const containerRect = container.getBoundingClientRect();
    const rotation = normalizePhotoRotation(currentOrganizePhoto()?.rotation);
    const geometry = calculateMagnifierGeometry(
      baseRect,
      containerRect,
      point,
      rotation,
      organizeLensZoom,
    );
    applyMagnifierGeometry({
      lens,
      image: lensImage,
      controls,
      level: $("#imageMagnifierLevel"),
      source: $("#organizeImage")?.src,
      geometry,
      rotation,
      zoom: organizeLensZoom,
    });
  }

  function renderOrganizeMagnifier() {
    if (organizeMagnifierActive && organizeLensPoint) updateOrganizeLens(organizeLensPoint);
    else {
      $("#imageMagnifierLens")?.classList.add("hidden");
      $("#imageMagnifierControls")?.classList.add("hidden");
    }
  }

  function setOrganizeLensZoom(direction) {
    organizeLensZoom = clampMagnifierZoom(
      organizeLensZoom + direction * MAGNIFIER_ZOOM_STEP,
    );
    if (organizeLensPoint) updateOrganizeLens(organizeLensPoint);
  }

  function bindMagnifierLens() {
    const container = $("#annotatedPhoto");
    if (!container || organizeMagnifierBinding) return;
    organizeMagnifierBinding = bindMagnifierInteractions({
      container,
      windowTarget: window,
      zoomInButton: $("#imageMagnifierInButton"),
      zoomOutButton: $("#imageMagnifierOutButton"),
      getBaseRect: organizeBaseRect,
      isBlocked: () => state.regionDrawing || organizeInteractionMode === "region",
      activate: (point) => {
        organizeMagnifierActive = true;
        organizeLensPoint = point;
        alignOrganizeSurfaces();
      },
      move: (point) => {
        organizeLensPoint = point;
        updateOrganizeLens(point);
      },
      deactivate: hideOrganizeLens,
      changeZoom: setOrganizeLensZoom,
    });
  }

  function renderRegionDraft() {
    const box = $("#regionDraftBox");
    const region = state.regionDraft;
    if (!box) return;
    box.classList.toggle("hidden", !region);
    if (region) {
      box.style.left = `${region.x}%`;
      box.style.top = `${region.y}%`;
      box.style.width = `${region.w}%`;
      box.style.height = `${region.h}%`;
    }
  }

  function bindRegionDrawing() {
    const layer = $("#regionDrawLayer");
    if (!layer || layer.dataset.bound) return;
    layer.dataset.bound = "true";
    layer.addEventListener("pointerdown", (/** @type {PointerEvent} */ event) => {
      if (!state.regionDrawing) return;
      const point = imagePointPercent(event);
      if (!point) return;
      state.regionPointerId = event.pointerId;
      state.regionDrawStart = point;
      state.regionDraft = { x: point.x, y: point.y, w: 0, h: 0 };
      layer.setPointerCapture(event.pointerId);
      event.preventDefault();
      renderRegionDraft();
    });
    layer.addEventListener("pointermove", (/** @type {PointerEvent} */ event) => {
      if (event.pointerId !== state.regionPointerId || !state.regionDrawStart)
        return;
      const point = imagePointPercent(event);
      if (!point) return;
      state.regionDraft = {
        x: Math.min(state.regionDrawStart.x, point.x),
        y: Math.min(state.regionDrawStart.y, point.y),
        w: Math.abs(point.x - state.regionDrawStart.x),
        h: Math.abs(point.y - state.regionDrawStart.y),
      };
      event.preventDefault();
      renderRegionDraft();
    });
    layer.addEventListener("pointerup", (/** @type {PointerEvent} */ event) => {
      if (event.pointerId !== state.regionPointerId || !state.regionDrawStart)
        return;
      const point = imagePointPercent(event);
      const region = point
        ? regionFromPoints(state.regionDrawStart, point)
        : null;
      state.regionPointerId = null;
      state.regionDrawStart = null;
      state.regionDraft = null;
      renderRegionDraft();
      if (!region) {
        showToast("範囲が小さすぎます。幅と高さを3%以上にしてください");
        return;
      }
      state.regionDrawing = false;
      organizeInteractionMode = "pan";
      state.pendingObservationRegion = region;
      if (state.observationDraft) {
        state.observationDraft.region = region;
        state.observationDraft.regionMode = "region";
      }
      openObservationEditor(state.editingObservationId, { preserveDraft: true });
      alignOrganizeSurfaces();
    });
    layer.addEventListener("pointercancel", () => {
      cancelRegionDrawing({ restoreEditor: true });
    });
  }

  function startRegionDrawing() {
    if (!state.observationDraft) return;
    organizeInteractionMode = "region";
    state.regionDrawingOriginalRegion = restoreRegionAfterCancel(
      state.observationDraft.region,
    );
    state.regionDrawingObservationId = state.editingObservationId;
    state.regionDrawing = true;
    state.regionPointerId = null;
    state.regionDrawStart = null;
    state.regionDraft = null;
    closeModal("addObservationModal");
    renderOrganize();
    observeImageSurfaceSizes();
    alignOrganizeSurfaces();
    showToast("写真上をドラッグして範囲を指定してください");
  }

  function cancelRegionDrawing(options = {}) {
    const { clearDraft = false, restoreEditor = false } = options;
    state.regionDrawing = false;
    organizeInteractionMode = "pan";
    const reset = resetRegionDraft();
    state.regionPointerId = reset.pointerId;
    state.regionDrawStart = reset.start;
    state.regionDraft = reset.region;
    if (clearDraft) {
      state.observationDraft = null;
      state.editingObservationId = null;
      state.pendingObservationRegion = null;
    } else if (state.observationDraft) {
      const isExistingObservation =
        state.regionDrawingObservationId === state.editingObservationId &&
        state.editingObservationId !== null;
      state.observationDraft.region = isExistingObservation
        ? restoreRegionAfterCancel(state.regionDrawingOriginalRegion)
        : null;
      state.observationDraft.regionMode = "region";
      state.pendingObservationRegion = state.observationDraft.region;
    }
    state.regionDrawingOriginalRegion = null;
    state.regionDrawingObservationId = null;
    renderRegionDraft();
    alignOrganizeSurfaces();
    if (restoreEditor && state.observationDraft) {
      openObservationEditor(state.editingObservationId, { preserveDraft: true });
    }
  }

  function openObservationEditor(/** @type {string|null} */ observationId, options = {}) {
    const photo = currentOrganizePhoto();
    if (!photo) return;
    const observation = observationId
      ? photo.observations.find((item) => item.id === observationId)
      : null;
    state.editingObservationId = observation?.id || null;
    if (!options.preserveDraft || !state.observationDraft) {
      state.observationDraft = {
        label: observation?.label || "",
        observationType: observation?.observationType || "physical",
        regionMode: observation?.region ? "region" : "whole",
        region: observation?.region || null,
      };
    }
    const draft = state.observationDraft;
    state.pendingObservationRegion = draft.region;
    $("#newObservationLabel").value = draft.label;
    $("#newObservationType").value = draft.observationType;
    const mode = draft.regionMode;
    const radio = $(`#newObservationRegion input[value="${mode}"]`);
    if (radio) radio.checked = true;
    $("#addObservationTitle").textContent = observation
      ? "観察対象を編集"
      : "観察対象を追加";
    $("#saveObservationButton").textContent = observation ? "保存する" : "追加する";
    $("#redrawObservationRegionButton")?.classList.toggle("hidden", !observation);
    openModal("addObservationModal");
  }

  function saveObservation() {
    const wasEditing = Boolean(state.editingObservationId);
    const label = $("#newObservationLabel").value.trim();
    if (!label) {
      showToast("名前を入力してください");
      return;
    }
    const photo = currentOrganizePhoto();
    if (!photo) return;
    const mode = $("#newObservationRegion input:checked")?.value || "whole";
    const region = mode === "region" ? state.observationDraft?.region : null;
    if (mode === "region" && !region) {
      state.observationDraft = { ...state.observationDraft, label, observationType: $("#newObservationType").value, regionMode: mode, region: null };
      startRegionDrawing();
      return;
    }
    if (state.editingObservationId) {
      const observation = photo.observations.find(
        (item) => item.id === state.editingObservationId,
      );
      if (observation) {
        Object.assign(
          observation,
          updateObservation(observation, {
            label,
            observationType: $("#newObservationType").value,
            region,
          }),
        );
      }
    } else {
      photo.observations.push(
        createObservation({
          id: uid("observation"),
          photoId: photo.id,
          label,
          observationType: $("#newObservationType").value,
          region,
          domainPackId:
            photo.domainHint || activeVisit()?.domainPackIds?.[0] || "other",
        }),
      );
      state.activeObservationId = photo.observations.at(-1).id;
    }
    photo.status = "in-progress";
    state.editingObservationId = null;
    state.pendingObservationRegion = null;
    state.observationDraft = null;
    $("#newObservationLabel").value = "";
    closeModal("addObservationModal");
    persist();
    renderOrganize();
    showToast(wasEditing ? "観察対象を更新しました" : "観察対象を保存しました");
  }

  function deleteObservation(/** @type {string} */ observationId) {
    const photo = currentOrganizePhoto();
    const observation = photo?.observations.find((item) => item.id === observationId);
    if (!photo || !observation) return;
    const references = observationReferences(state, observationId);
    const referenceSummary = references.relations.length || references.facts.length
      ? `\n関係 ${references.relations.length}件、学習内容 ${references.facts.length}件も削除されます。`
      : "";
    if (!window.confirm(`「${observation.label}」を削除しますか？${referenceSummary}`)) return;
    const result = removeObservation(photo, observationId);
    photo.observations = result.photo.observations;
    const relationIds = new Set(references.relations.map((item) => item.id));
    const factIds = new Set(references.facts.map((item) => item.id));
    state.relations = state.relations.filter((item) => !relationIds.has(item.id));
    state.facts = state.facts.filter((item) => !factIds.has(item.id));
    state.quizResults = state.quizResults.filter(
      (result) => result.targetId !== observationId,
    );
    state.activeObservationId =
      photo.observations.find((item) => item.included !== false)?.id || null;
    photo.status = "in-progress";
    persist();
    renderOrganize();
    showToast("観察対象を削除しました");
  }

  function openPhotoModal(/** @type {string} */ photoId) {
    const photo = photoById(photoId);
    if (!photo) return;
    state.modalPhotoId = photoId;
    $("#modalImage").src = photo.src;
    $("#modalImage").alt = photo.title;
    $("#modalImage").style.transform = rotationTransform(photo.rotation);
    $("#modalOverlay").style.transform = rotationTransform(photo.rotation);
    $("#modalRotationLabel").textContent = `向き ${normalizePhotoRotation(photo.rotation)}度`;
    $("#modalStatus").textContent = STATUS_LABELS[photo.status] || "未整理";
    const observations = photo.observations.filter(
      (/** @type {any} */ item) => item.included !== false,
    );
    $("#modalCount").textContent = `${observations.length}の観察対象`;
    $("#modalTitle").textContent = photo.title;
    renderOverlay($("#modalOverlay"), photo, { modal: true });
    observeImageSurfaceSizes();
    const modalImage = $("#modalImage");
    modalImage.onload = () =>
      alignImageSurface($("#modalOverlay"), $("#photoModal .modal-image-wrap"), modalImage);
    alignImageSurface($("#modalOverlay"), $("#photoModal .modal-image-wrap"), modalImage);
    $("#modalObservations").innerHTML = observations
      .map(
        (/** @type {any} */ observation, /** @type {number} */ index) => `
      <article class="${observation.id === state.relationPreviewObservationId ? "relation-preview-target" : ""}" ${observation.id === state.relationPreviewObservationId ? 'aria-current="true"' : ""}><span class="observation-number">${index + 1}</span><div><strong>${escapeHtml(observation.label)}</strong>${observation.id === state.relationPreviewObservationId ? '<b class="relation-preview-badge">選択候補</b>' : ""}<small>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || "")}</small><div class="mini-tag-list">${observation.genericCategories.map((/** @type {string} */ id) => `<span>${escapeHtml(genericLabel(id))}</span>`).join("")}</div></div></article>`,
      )
      .join("");
    const chooseButton = $("#choosePreviewRelationButton");
    chooseButton?.classList.toggle("hidden", !state.relationPreviewObservationId);
    if (chooseButton) chooseButton.textContent = state.relationPicker === "source" ? "この対象を関係元に選ぶ" : "この対象を関係先に選ぶ";
    openModal("photoModal", { aboveModal: Boolean(state.relationPreviewObservationId) });
  }

  function openRelationPreview(/** @type {string} */ observationId) {
    const entry = relationEntryById(observationId);
    if (!entry) return;
    state.relationPreviewObservationId = observationId;
    openPhotoModal(entry.photo.id);
  }

  function chooseRelationPreview() {
    const id = state.relationPreviewObservationId;
    if (!id || !state.relationPicker) return;
    chooseRelationEndpoint(state.relationPicker, id);
    state.relationPreviewObservationId = null;
    closeModal("photoModal");
  }

  function openModal(/** @type {string} */ id, { aboveModal = false } = {}) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.toggle("modal-layer-preview", aboveModal);
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(/** @type {string} */ id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (id === "photoModal") state.relationPreviewObservationId = null;
    modal.classList.remove("modal-layer-preview");
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function setOrganizePhoto(/** @type {string} */ photoId) {
    const photo = photoById(photoId);
    if (!photo) return;
    cancelRegionDrawing({ clearDraft: true });
    state.organizePhotoId = photoId;
    organizeMagnifierActive = false;
    organizeMagnifierBinding?.reset();
    organizeLensPoint = null;
    organizeLensZoom = MAGNIFIER_MIN_ZOOM;
    state.organizeStep = 1;
    state.activeObservationId =
      photo.observations.find(
        (/** @type {any} */ item) => item.included !== false,
      )?.id || null;
    renderOrganize();
  }

  function renderOrganizeStrip() {
    $("#organizePhotoStrip").innerHTML = visitPhotos()
      .map(
        (photo) => `
      <button class="strip-photo ${photo.id === state.organizePhotoId ? "active" : ""}" data-organize-photo="${escapeHtml(photo.id)}" title="${escapeHtml(photo.title)}">
        <img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" ${rotationStyle(photo.rotation) ? `style="${rotationStyle(photo.rotation)}"` : ""} /><span>${photo.order}</span><i class="status-dot status-${escapeHtml(photo.status)}"></i>
      </button>`,
      )
      .join("");
    $$("[data-organize-photo]").forEach((button) =>
      button.addEventListener("click", () =>
        setOrganizePhoto(button.dataset.organizePhoto),
      ),
    );
  }

  const currentOrganizePhoto = () => photoById(state.organizePhotoId);

  function currentObservation() {
    const photo = currentOrganizePhoto();
    return (
      photo?.observations.find(
        (/** @type {any} */ item) => item.id === state.activeObservationId,
      ) ||
      photo?.observations.find(
        (/** @type {any} */ item) => item.included !== false,
      ) ||
      null
    );
  }

  function renderObservationTabs(/** @type {any} */ photo) {
    const included = photo.observations.filter(
      (/** @type {any} */ item) => item.included !== false,
    );
    return `<div class="observation-tabs">${included
      .map(
        (/** @type {any} */ observation, /** @type {number} */ index) => `
      <button class="${observation.id === state.activeObservationId ? "active" : ""}" data-select-observation="${escapeHtml(observation.id)}"><span>${index + 1}</span>${escapeHtml(observation.label)}</button>`,
      )
      .join("")}</div>`;
  }

  function renderStepOne(/** @type {any} */ photo) {
    return renderObservationCandidateStep(photo, {
      analysisConnected: analysisProvider.isConnected(),
      observationTypeLabels: OBSERVATION_TYPE_LABELS,
      activeObservationId: state.activeObservationId,
    });
  }

  function chipButton(
    /** @type {string} */ id,
    /** @type {string} */ label,
    /** @type {boolean} */ selected,
    /** @type {string} */ type,
    /** @type {string} */ description = "",
  ) {
    const info = description ? `<span class="chip-info" data-chip-info="${escapeHtml(description)}" role="button" tabindex="0" aria-label="${escapeHtml(label)}の説明">ⓘ</span>` : "";
    return `<button class="label-chip ${selected ? "selected" : ""}" data-chip-type="${escapeHtml(type)}" data-chip-id="${escapeHtml(id)}">${selected ? "✓ " : ""}${escapeHtml(label)}${info}</button>`;
  }

  function renderStepTwo(
    /** @type {any} */ photo,
    /** @type {any} */ observation,
  ) {
    if (!observation)
      return '<div class="empty-state"><strong>対象がありません</strong><p>ステップ1で対象を追加してください。</p></div>';
    return `
      <div class="assistant-message"><span class="assistant-avatar">Y</span><div><strong>この対象は、どのようなものですか？</strong><p>写真に写っている対象の種類と、学ぶうえでの役割を選びます。複数選択でき、あとで変更できます。</p></div></div>
      ${renderObservationTabs(photo)}
      <div class="classification-block"><h3>${escapeHtml(observation.label)}</h3><small>対象の種類</small><div class="chip-grid">${registry.genericCategories.map((item) => chipButton(item.id, `${item.icon} ${item.label}`, observation.genericCategories.includes(item.id), "generic", item.description || "写真に写っている対象の種類です。")).join("")}</div></div>
      <div class="classification-block"><small>学ぶうえでの役割</small><div class="chip-grid roles">${registry.learningRoles.map((item) => chipButton(item.id, item.label, observation.learningRoles.includes(item.id), "role", LEARNING_ROLE_DESCRIPTIONS[item.id] || "この対象を学ぶときの役割です。")).join("")}</div></div>
      <div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-generic">全対象の種類を一括確認</button><span>曖昧な対象だけ個別に直せます</span></div>`;
  }

  function renderStepThree(
    /** @type {any} */ photo,
    /** @type {any} */ observation,
  ) {
    if (!observation)
      return '<div class="empty-state"><strong>対象がありません</strong></div>';
    const activePacks = observation.domainPacks.length
      ? observation.domainPacks
      : ["other"];
    const categoryButtons = activePacks.flatMap(
      (/** @type {string} */ packId) =>
        packCategories(packId).map((item) => ({ ...item, packId })),
    );
    return `
      <div class="assistant-message"><span class="assistant-avatar">Y</span><div><strong>この対象を、今回のテーマに沿って分類します</strong><p>自然史・古生物など、選択した分野に合う分類を追加します。次の画面でより詳しい知識を登録できます。</p></div></div>
      ${renderObservationTabs(photo)}
      <div class="classification-block"><h3>${escapeHtml(observation.label)}</h3><small>分野パック</small><div class="chip-grid domains">${registry.packs.map((item) => chipButton(item.id, `${item.icon} ${item.label}`, observation.domainPacks.includes(item.id), "domain")).join("")}</div></div>
      <div class="classification-block"><small>テーマに沿った分類</small><div class="chip-grid">${categoryButtons.map((item) => `<button class="label-chip ${observation.domainCategories.includes(item.id) ? "selected" : ""}" data-chip-type="domain-category" data-chip-domain="${escapeHtml(item.packId)}" data-chip-id="${escapeHtml(item.id)}">${observation.domainCategories.includes(item.id) ? "✓ " : ""}${escapeHtml(item.label)}<span class="chip-info" data-chip-info="${escapeHtml(item.description || "今回の展示や学習テーマに沿った分類です。")}" role="button" tabindex="0" aria-label="${escapeHtml(item.label)}の説明">ⓘ</span></button>`).join("") || '<p class="muted-copy">分野パックを選択してください。</p>'}</div></div>
      <div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-domain">全対象の分野分類を一括確認</button><span>具体名は明確な場合だけ任意で追加します</span></div>`;
  }

  function relevantRelations(/** @type {any} */ photo) {
    return relationsForPhotoInVisit(
      state.relations,
      state.photos,
      state.activeVisitId,
      photo.id,
    );
  }

  function activeVisitObservationIds() {
    return new Set(
      visitPhotos().flatMap((/** @type {any} */ item) =>
        item.observations.map((/** @type {any} */ observation) => observation.id),
      ),
    );
  }

  function relationType(/** @type {string} */ type) {
    return registry.relationTypes.find((item) => item.id === type) || null;
  }

  function relationConnector(/** @type {any} */ relation) {
    return isDirectedRelation(registry.relationTypes, relation.type) ? "→" : "↔";
  }

  function relationEndpoint(/** @type {any} */ found) {
    if (!found) return "";
    const photo = found.photo;
    return `<div class="relation-endpoint"><img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" style="${rotationStyle(photo.rotation)}" /><span><strong>${escapeHtml(found.observation.label)}</strong><small>#${escapeHtml(photo.order)} ${escapeHtml(photo.title)}</small></span></div>`;
  }

  function relationCard(/** @type {any} */ relation) {
    const source = observationById(relation.sourceId);
    const target = observationById(relation.targetId);
    if (!source || !target) return "";
    const reviewActions = relationReviewActions(relation);
    return `
      <article class="relation-card ${relation.status === "confirmed" ? "confirmed" : relation.status === "rejected" ? "rejected" : ""}">
        <div class="relation-card-main">${relationEndpoint(source)}<b class="relation-connector" title="${escapeHtml(relationLabel(relation.type))}">${relationConnector(relation)}</b>${relationEndpoint(target)}</div>
        <div class="relation-card-meta"><span>${escapeHtml(relationLabel(relation.type))}</span><span>${relation.origin === "user" ? "手動作成" : `候補 ${Math.round((relation.confidence || 0) * 100)}%`}</span></div>
        <div class="relation-card-actions"><button data-edit-relation="${escapeHtml(relation.id)}">編集</button><button data-delete-relation="${escapeHtml(relation.id)}">削除</button>${reviewActions.includes("confirm") ? `<button data-relation-action="confirm" data-relation-id="${escapeHtml(relation.id)}">✓ 採用</button>` : ""}${reviewActions.includes("reject") ? `<button data-relation-action="reject" data-relation-id="${escapeHtml(relation.id)}">× 却下</button>` : ""}</div>
      </article>`;
  }

  function renderStepFour(/** @type {any} */ photo) {
    const relations = relevantRelations(photo);
    const approvableRelations = relations.filter(isApprovableRelation);
    return `
      <div class="assistant-message"><span class="assistant-avatar">Y</span><div><strong>最後に、対象同士の関係だけを確認します。</strong><p>同じ展示、説明している、部分と全体、同じテーマなどを複数設定できます。</p></div></div>
      <div class="quick-action-row"><button class="primary-button inline" id="addRelationButton" type="button">＋ 関係を追加</button><span>現在の訪問内のObservationだけを結べます</span></div>
      <div class="relation-list">${relations.length ? relations.map(relationCard).join("") : '<div class="empty-state"><strong>関係候補はまだありません</strong><p>「＋ 関係を追加」から手動で作成できます。</p></div>'}</div>
      ${approvableRelations.length ? '<div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-relations">候補を一括承認</button><span>誤った候補だけ外してください</span></div>' : ""}`;
  }

  function relationEntriesForVisit() {
    return visitPhotos().flatMap((photo) =>
      photo.observations
        .filter(isSelectableObservation)
        .map((observation) => ({ observation, photo })),
    );
  }

  function relationEntryById(/** @type {string} */ id) {
    return relationEntriesForVisit().find((entry) => entry.observation.id === id) || null;
  }

  function endpointMarkup(entry) {
    if (!entry) return '<div class="empty-state"><strong>未選択</strong><p>候補から選択してください。</p></div>';
    const presentation = endpointPresentation(entry);
    const regionStyle = presentation.region
      ? `left:${presentation.region.x}%;top:${presentation.region.y}%;width:${presentation.region.w}%;height:${presentation.region.h}%;`
      : "";
    return `<button type="button" class="endpoint-card" data-endpoint-id="${escapeHtml(entry.observation.id)}"><span class="endpoint-card-inner"><span class="endpoint-image">${rotatedPhotoFrame(entry.photo, `<img src="${escapeHtml(entry.photo.thumbSrc || entry.photo.src)}" alt="" />${presentation.region ? `<i class="endpoint-region" style="${regionStyle}"></i>` : '<em class="endpoint-whole-label">写真全体</em>'}`)}</span><span><strong>${escapeHtml(entry.observation.label)}</strong><small>${escapeHtml(OBSERVATION_TYPE_LABELS[entry.observation.observationType] || "観察対象")}・#${escapeHtml(entry.photo.order)} ${escapeHtml(entry.photo.title)}</small></span></span></button>`;
  }

  function optionMarkup(entry, /** @type {"source"|"target"} */ kind) {
    const presentation = endpointPresentation(entry);
    const regionStyle = presentation.region
      ? `left:${presentation.region.x}%;top:${presentation.region.y}%;width:${presentation.region.w}%;height:${presentation.region.h}%;`
      : "";
    const label = kind === "source" ? "関係元に選ぶ" : "関係先に選ぶ";
    return `<div class="endpoint-option"><button type="button" class="endpoint-preview-button" data-endpoint-preview="${escapeHtml(entry.observation.id)}" aria-label="${escapeHtml(entry.observation.label)}の写真を拡大"><span class="endpoint-image">${rotatedPhotoFrame(entry.photo, `<img src="${escapeHtml(entry.photo.thumbSrc || entry.photo.src)}" alt="" />${presentation.region ? `<i class="endpoint-region" style="${regionStyle}"></i>` : '<em class="endpoint-whole-label">写真全体</em>'}`)}</span><span><strong>${escapeHtml(entry.observation.label)}</strong><small>${escapeHtml(entry.photo.title)}・#${escapeHtml(entry.photo.order)}・${escapeHtml(OBSERVATION_TYPE_LABELS[entry.observation.observationType] || "観察対象")}</small></span></button><button type="button" class="endpoint-select-button" data-endpoint-select="${escapeHtml(entry.observation.id)}">${label}</button></div>`;
  }

  function renderRelationOptions(/** @type {"source"|"target"} */ kind) {
    const options = $(kind === "source" ? "#relationSourceOptions" : "#relationTargetOptions");
    if (!options) return;
    const query = state.relationSearch[kind];
    const entries = kind === "source"
      ? relationEntriesForVisit()
      : relationCandidates({ photos: state.photos, activeVisitId: state.activeVisitId, sourceId: state.relationDraft.sourceId, scope: state.relationScope });
    const filtered = searchRelationEntries(entries, query);
    options.innerHTML = `<input class="endpoint-search" type="search" placeholder="写真名・Observation名で検索" value="${escapeHtml(query)}" data-endpoint-search="${kind}" />${filtered.length ? filtered.map((entry) => optionMarkup(entry, kind)).join("") : '<p class="muted-copy">該当する候補はありません。</p>'}`;
    options.classList.toggle("hidden", state.relationPicker !== kind);
    options.querySelectorAll(".endpoint-option").forEach((card) => {
      const entry = relationEntryById(card.dataset.endpointOption);
      mountPhotoMagnifier(
        card.querySelector(".endpoint-image"),
        card.querySelector("img"),
        entry?.photo,
        { showControls: false },
      );
    });
  }

  function renderRelationEditor() {
    const draft = state.relationDraft;
    if (!draft) return;
    const selectedTypes = draft.types || [];
    const editing = Boolean(state.editingRelationId);
    const sourceEntry = relationEntryById(draft.sourceId);
    const targetEntry = relationEntryById(draft.targetId);
    $("#relationSourceCard").innerHTML = endpointMarkup(sourceEntry);
    $("#relationTargetCard").innerHTML = endpointMarkup(targetEntry);
    const sourceImageHost = $("#relationSourceCard .endpoint-image");
    const targetImageHost = $("#relationTargetCard .endpoint-image");
    mountPhotoMagnifier(
      sourceImageHost,
      sourceImageHost?.querySelector("img"),
      sourceEntry?.photo,
      { showControls: false },
    );
    mountPhotoMagnifier(
      targetImageHost,
      targetImageHost?.querySelector("img"),
      targetEntry?.photo,
      { showControls: false },
    );
    $("#chooseRelationSourceButton").textContent = endpointSelectionLabel("source", Boolean(sourceEntry));
    $("#chooseRelationTargetButton").textContent = endpointSelectionLabel("target", Boolean(targetEntry));
    $("#relationTypeLegend").textContent = editing ? "関係種別" : "まとめて登録する種類";
    $("#relationTypeChoices").innerHTML = registry.relationTypes.map((type) => `<label class="relation-type-choice"><span class="relation-type-check"><input type="${editing ? "radio" : "checkbox"}" name="relation-type-choice" data-relation-type-choice="${escapeHtml(type.id)}" ${selectedTypes.includes(type.id) ? "checked" : ""} /></span><span class="relation-type-name">${escapeHtml(relationTypeDisplay(type).optionLabel)}</span></label>`).join("");
    $("#relationTypeHelp").textContent = editing
      ? "編集中は1種類だけ変更できます。別の種類も必要な場合は新しいRelationとして追加してください。"
      : "選択した種類を、既存形式のRelationとして1件ずつ保存します。";
    const selectedTypeEntries = selectedTypes.map(relationType).filter(Boolean);
    const directedTypes = selectedTypeEntries.filter((type) => type.directed);
    $("#relationTypeDirectionHint").textContent = selectedTypeEntries.length
      ? `${selectedTypeEntries.length}種類を選択中・方向あり ${directedTypes.length}種類 / 方向なし ${selectedTypeEntries.length - directedTypes.length}種類`
      : "関係種別を1つ以上選択してください";
    renderRelationOptions("source");
    renderRelationOptions("target");
    const swapButton = $("#swapRelationEndpointsButton");
    swapButton.classList.toggle("hidden", directedTypes.length === 0);
    $("#relationDirectionNote").textContent = selectedTypeEntries.length
      ? directedTypes.length
        ? "方向ありのRelationは関係元から関係先へ保存します。方向なしのRelationは入れ替えても同じ関係として扱います。"
        : "選択中のRelationはすべて方向なしです。関係元と関係先を入れ替えても同じ関係として扱います。"
      : "";
    $$("[data-relation-scope]").forEach((button) =>
      button.classList.toggle("active", button.dataset.relationScope === state.relationScope),
    );
  }

  function showRelationPicker(/** @type {"source"|"target"} */ kind) {
    state.relationPicker = kind;
    renderRelationEditor();
  }

  function chooseRelationEndpoint(/** @type {"source"|"target"} */ kind, /** @type {string} */ id) {
    if (kind === "source") {
      state.relationDraft.sourceId = id;
      state.relationDraft.targetId = "";
    } else {
      state.relationDraft.targetId = id;
    }
    state.relationPicker = null;
    state.relationSearch = { source: "", target: "" };
    renderRelationEditor();
  }

  function openRelationEditor(/** @type {string|null} */ relationId = null) {
    const existing = relationId
      ? state.relations.find((relation) => relation.id === relationId)
      : null;
    const current = currentObservation();
    const first = relationEntriesForVisit()[0];
    const sourceId =
      existing?.sourceId ||
      (isSelectableObservation(current) ? current.id : first?.observation.id) ||
      "";
    state.editingRelationId = existing?.id || null;
    state.relationScope = RELATION_SCOPES.PHOTO;
    state.relationPicker = null;
    state.relationSearch = { source: "", target: "" };
    state.relationDraft = {
      sourceId,
      targetId: existing?.targetId || "",
      types: existing ? [existing.type] : [registry.relationTypes[0]?.id || ""],
    };
    if (existing)
      state.relationScope = scopeForRelationEndpoints(
        state.photos,
        existing.sourceId,
        existing.targetId,
        state.relationScope,
      );
    $("#relationEditorTitle").textContent = existing ? "関係を編集" : "関係を追加";
    renderRelationEditor();
    openModal("relationEditorModal");
  }

  function swapRelationEditorEndpoints() {
    if (!state.relationDraft || !state.relationDraft.types.some((type) => isDirectedRelation(registry.relationTypes, type))) return;
    state.relationDraft = swapRelationEndpoints(state.relationDraft);
    state.relationScope = scopeForRelationEndpoints(
      state.photos,
      state.relationDraft.sourceId,
      state.relationDraft.targetId,
      state.relationScope,
    );
    renderRelationEditor();
  }

  function saveRelation() {
    const wasEditing = Boolean(state.editingRelationId);
    const result = applyRelationTypeSelection({
      relations: state.relations,
      draft: state.relationDraft,
      relationTypes: registry.relationTypes,
      editingId: state.editingRelationId,
      createId: () => uid("relation"),
    });
    if (result.error) { showToast(result.error); return; }
    if (!result.savedRelations.length) {
      showToast("選択した関係はすべて保存済みです");
      return;
    }
    state.relations = result.relations;
    closeModal("relationEditorModal");
    state.editingRelationId = null;
    state.relationDraft = null;
    persist();
    renderOrganize();
    renderKnowledge();
    renderCollections();
    showToast(
      wasEditing
        ? "関係を更新しました"
        : result.skippedTypes.length
          ? `${result.savedRelations.length}件を保存し、保存済みの${result.skippedTypes.length}件をスキップしました`
          : `${result.savedRelations.length}件の関係を保存しました`,
    );
  }

  function deleteRelation(/** @type {string} */ relationId) {
    const relation = state.relations.find((item) => item.id === relationId);
    if (!relation) return;
    if (!window.confirm(`「${relationLabel(relation.type)}」を削除しますか？`)) return;
    state.relations = removeRelation(state.relations, relationId);
    persist();
    renderOrganize();
    renderKnowledge();
    renderCollections();
    showToast("関係を削除しました");
  }

  function renderOrganize() {
    renderVisitBar();
    const photo = currentOrganizePhoto();
    const empty = $("#organizeEmpty");
    const workspace = $("#organizeWorkspace");
    if (!photo) {
      empty?.classList.remove("hidden");
      workspace?.classList.add("hidden");
      $("#organizePhotoStrip").innerHTML = "";
      return;
    }
    empty?.classList.add("hidden");
    workspace?.classList.remove("hidden");

    renderOrganizeStrip();
    $("#organizePhotoTitle").textContent = photo.title;
    // 体験メモは写真のもの。ここだけで入力する。
    const memoInput = $("#experienceMemoInput");
    if (memoInput && memoInput.dataset.photoId !== photo.id) {
      memoInput.value = photo.experienceMemo ?? "";
      memoInput.dataset.photoId = photo.id;
    }
    $("#organizeImage").src = photo.src;
    $("#organizeImageStage").style.transform = photo.rotation
      ? `rotate(${normalizePhotoRotation(photo.rotation)}deg)`
      : "";
    $("#organizeImage").style.transform = "";
    $("#organizeRotationLabel").textContent = `向き ${normalizePhotoRotation(photo.rotation)}度`;
    renderOverlay($("#observationOverlay"), photo, { interactive: true });
    bindRegionDrawing();
    bindMagnifierLens();
    $("#organizeImage").onload = alignOrganizeSurfaces;
    observeImageSurfaceSizes();
    alignOrganizeSurfaces();
    renderRegionDraft();

    $$("#organizeStepper [data-step]").forEach((button) =>
      button.classList.toggle(
        "active",
        Number(button.dataset.step) === state.organizeStep,
      ),
    );
    const observation = currentObservation();
    const html =
      state.organizeStep === 1
        ? renderStepOne(photo)
        : state.organizeStep === 2
          ? renderStepTwo(photo, observation)
          : state.organizeStep === 3
            ? renderStepThree(photo, observation)
            : renderStepFour(photo);
    $("#organizeChat").innerHTML = html;
    $("#previousStepButton").disabled = state.organizeStep === 1;
    $("#nextStepButton").textContent =
      state.organizeStep === 4 ? "整理を完了する ✓" : "次へ →";
    bindOrganizeControls();
    renderObservationPreview(photo);
  }

  function renderObservationPreview(/** @type {any} */ photo) {
    const observations = photo.observations.filter(
      (/** @type {any} */ item) => item.included !== false,
    );
    $("#observationPreviewList").innerHTML = observations.length
      ? observations
          .map(
            (/** @type {any} */ observation, /** @type {number} */ index) => {
              const packId = observation.domainPacks[0];
              return `<button class="preview-observation ${observation.id === state.activeObservationId ? "active" : ""}" data-preview-observation="${escapeHtml(observation.id)}">
        <span class="observation-number">${index + 1}</span><span><strong>${escapeHtml(observation.label)}</strong><small>${observation.genericCategories.map(genericLabel).join("・") || "対象の種類未設定"}</small><em>${packId ? `${packLabel(packId)} / ${observation.domainCategories.map((/** @type {string} */ id) => packCategoryLabel(packId, id)).join("・")}` : "分野未設定"}</em></span><i>${observation.status === "confirmed" ? "✓" : "候補"}</i>
      </button>`;
            },
          )
          .join("")
      : '<div class="empty-state"><strong>対象がありません</strong></div>';
    $("#organizeSummary").innerHTML =
      `<strong>${observations.length}</strong><span>この写真から保存する観察対象</span><small>写真1枚 ＝ 知識1件ではありません</small>`;
    $$("[data-preview-observation]").forEach((button) =>
      button.addEventListener("click", () => {
        state.activeObservationId = button.dataset.previewObservation;
        renderOrganize();
      }),
    );
  }

  function bindOrganizeControls() {
    $$("[data-toggle-observation]").forEach((button) =>
      button.addEventListener("click", () => {
        const found = observationById(button.dataset.toggleObservation);
        if (!found) return;
        found.observation.included = found.observation.included === false;
        if (found.observation.included && !state.activeObservationId)
          state.activeObservationId = found.observation.id;
        if (
          !found.observation.included &&
          state.activeObservationId === found.observation.id
        ) {
          state.activeObservationId =
            found.photo.observations.find(
              (/** @type {any} */ item) => item.included !== false,
            )?.id || null;
        }
        found.photo.status = "in-progress";
        persist();
        renderOrganize();
      }),
    );

    $$("[data-edit-observation]").forEach((button) =>
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        openObservationEditor(button.dataset.editObservation);
      }),
    );

    $$("[data-delete-observation]").forEach((button) =>
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        deleteObservation(button.dataset.deleteObservation);
      }),
    );

    $$("[data-select-observation]").forEach((button) =>
      button.addEventListener("click", () => {
        state.activeObservationId = button.dataset.selectObservation;
        renderOrganize();
      }),
    );

    $$("[data-chip-type]").forEach((button) =>
      button.addEventListener("click", () => {
        const observation = currentObservation();
        if (!observation) return;
        const id = button.dataset.chipId;
        const type = button.dataset.chipType;
        const field =
          type === "generic"
            ? "genericCategories"
            : type === "role"
              ? "learningRoles"
              : type === "domain"
                ? "domainPacks"
                : "domainCategories";
        const list = observation[field];
        const index = list.indexOf(id);
        if (index >= 0) list.splice(index, 1);
        else list.push(id);
        if (type === "domain" && index >= 0) {
          const allowed = new Set(packCategories(id).map((item) => item.id));
          observation.domainCategories = observation.domainCategories.filter(
            (/** @type {string} */ categoryId) => !allowed.has(categoryId),
          );
        }
        currentOrganizePhoto().status = "in-progress";
        persist();
        renderOrganize();
      }),
    );

    $$("[data-chip-info]").forEach((info) => {
      const explain = () => showToast(info.dataset.chipInfo || "この項目の説明は準備中です。");
      info.addEventListener("click", (event) => { event.stopPropagation(); explain(); });
      info.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); explain(); }
      });
    });

    $$("[data-bulk-action]").forEach((button) =>
      button.addEventListener("click", () => {
        const photo = currentOrganizePhoto();
        const action = button.dataset.bulkAction;
        const included = photo.observations.filter(
          (/** @type {any} */ item) => item.included !== false,
        );
        if (action === "include-all")
          photo.observations.forEach((/** @type {any} */ item) => {
            item.included = true;
          });
        if (action === "confirm-generic")
          included.forEach((/** @type {any} */ item) => {
            item.genericConfirmed = true;
          });
        if (action === "confirm-domain")
          included.forEach((/** @type {any} */ item) => {
            item.domainConfirmed = true;
          });
        if (action === "confirm-relations")
          relevantRelations(photo)
            .filter(isApprovableRelation)
            .forEach((/** @type {any} */ relation) => {
              relation.status = "confirmed";
            });
        photo.status = "in-progress";
        persist();
        renderOrganize();
        showToast("候補を一括確認しました");
      }),
    );

    $$("[data-relation-action]").forEach((button) =>
      button.addEventListener("click", () => {
        const relation = state.relations.find(
          (/** @type {any} */ item) => item.id === button.dataset.relationId,
        );
        if (!relation) return;
        relation.status =
          button.dataset.relationAction === "confirm"
            ? "confirmed"
            : "rejected";
        persist();
        renderOrganize();
      }),
    );

    bindObservationAddButton(document, () => openObservationEditor(null));
    $("#addRelationButton")?.addEventListener("click", () =>
      openRelationEditor(null),
    );
    $$('[data-edit-relation]').forEach((button) =>
      button.addEventListener("click", () =>
        openRelationEditor(button.dataset.editRelation),
      ),
    );
    $$('[data-delete-relation]').forEach((button) =>
      button.addEventListener("click", () =>
        deleteRelation(button.dataset.deleteRelation),
      ),
    );
  }

  function completeOrganizePhoto() {
    const photo = currentOrganizePhoto();
    const included = photo.observations.filter(
      (/** @type {any} */ item) => item.included !== false,
    );
    included.forEach((/** @type {any} */ observation) => {
      if (
        observation.genericCategories.length &&
        observation.domainCategories.length
      )
        observation.status = "confirmed";
    });
    photo.status =
      included.length &&
      included.every((/** @type {any} */ item) => item.status === "confirmed")
        ? "organized"
        : "in-progress";
    persist();
    renderAll();
    state.knowledgeObservationId =
      included[0]?.id || state.knowledgeObservationId;
    showToast(
      photo.status === "organized"
        ? "写真の整理が完了しました"
        : "途中状態として保存しました",
    );
    switchView("knowledge");
  }

  function renderLegacyKnowledge() {
    $$("#knowledgeModeControl [data-knowledge-mode]").forEach((button) =>
      button.classList.toggle(
        "active",
        button.dataset.knowledgeMode === state.knowledgeMode,
      ),
    );
    const query = state.knowledgeSearch.trim().toLowerCase();
    let observations = allObservations({ includedOnly: true });
    if (state.knowledgeMode === "learned") {
      const learnedTargets = new Set(
        state.facts
          .filter(factUnlocked)
          .map((/** @type {any} */ fact) => fact.targetId),
      );
      observations = observations.filter((item) => learnedTargets.has(item.id));
    }
    if (query)
      observations = observations.filter((item) =>
        `${item.label} ${item.genericCategories.map(genericLabel).join(" ")} ${item.domainCategories.join(" ")}`
          .toLowerCase()
          .includes(query),
      );
    observations.sort(
      (a, b) =>
        (a.status === "confirmed" ? -1 : 1) -
        (b.status === "confirmed" ? -1 : 1),
    );

    if (!observations.some((item) => item.id === state.knowledgeObservationId))
      state.knowledgeObservationId = observations[0]?.id || null;
    $("#knowledgeObservationList").innerHTML = observations.length
      ? observations
          .map((item) => {
            const photo = photoById(item.photoId);
            return `<button class="knowledge-list-item ${item.id === state.knowledgeObservationId ? "active" : ""}" data-knowledge-observation="${escapeHtml(item.id)}">
        <img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" style="${rotationStyle(photo.rotation)}" /><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(photo.title)}</small></span><i>${item.status === "confirmed" ? "✓" : "?"}</i>
      </button>`;
          })
          .join("")
      : '<div class="empty-state"><strong>表示する知識がありません</strong><p>写真整理、または「詳しく学ぶ」を進めてください。</p></div>';

    $$("[data-knowledge-observation]").forEach((button) =>
      button.addEventListener("click", () => {
        state.knowledgeObservationId = button.dataset.knowledgeObservation;
        renderKnowledge();
      }),
    );
    renderLegacyKnowledgeFocus();
  }

  function renderLegacyKnowledgeFocus() {
    const found = observationById(state.knowledgeObservationId);
    if (!found) {
      $("#knowledgeFocus").innerHTML =
        '<div class="empty-state large"><strong>観察対象を選択してください</strong></div>';
      return;
    }
    const { observation, photo } = found;
    const activeObservationIds = activeVisitObservationIds();
    const relations = state.relations.filter(
      (/** @type {any} */ relation) =>
        relation.status === "confirmed" &&
        activeObservationIds.has(relation.sourceId) &&
        activeObservationIds.has(relation.targetId) &&
        (relation.sourceId === observation.id ||
          relation.targetId === observation.id),
    );
    const facts = state.facts.filter(
      (/** @type {any} */ fact) => fact.targetId === observation.id,
    );
    const unlocked = facts.filter(factUnlocked);
    const locked = facts.filter(
      (/** @type {any} */ fact) => !factUnlocked(fact),
    );
    const entity = observation.entityId
      ? entityMap.get(observation.entityId)
      : null;
    const packId = observation.domainPacks[0] || "other";
    const learnedMode = state.knowledgeMode === "learned";
    $("#knowledgeFocus").classList.toggle(
      "knowledge-mode-learned",
      learnedMode,
    );

    const sourceBadge = learnedMode
      ? "📚 後から学んだ知識"
      : observation.origin === "user"
        ? "✍ 自分で確認した知識"
        : "📷 自分の写真から";

    $("#knowledgeFocus").innerHTML = `
      <div class="knowledge-map-header"><div><span class="source-badge">${sourceBadge}</span><h2>${escapeHtml(observation.label)}</h2><p>${learnedMode ? "確認済みの観察対象に、あとから追加した参照知識です。" : `${escapeHtml(photo.title)}の中で確認した観察対象です。`}</p></div><button class="ghost-button dark" data-open-photo="${escapeHtml(photo.id)}">元写真を見る</button></div>
      <div class="focus-map">
        <article class="map-source-card"><small>PHOTO</small><img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="${escapeHtml(photo.title)}" style="${rotationStyle(photo.rotation)}" /><strong>${escapeHtml(photo.title)}</strong></article>
        <div class="map-connector">→</div>
        <article class="map-center-card"><span>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || "観察対象")}</span><h3>${escapeHtml(observation.label)}</h3>${entity ? `<p class="optional-entity">任意の具体名：${escapeHtml(entity.name)}</p>` : '<p class="optional-entity">具体名がなくても保存可能</p>'}</article>
        <div class="map-connector">→</div>
        <div class="map-label-groups">
          <article><small>対象の種類</small><div class="mini-tag-list">${observation.genericCategories.map((/** @type {string} */ id) => `<span>${escapeHtml(genericLabel(id))}</span>`).join("")}</div></article>
          <article><small>テーマに沿った分類</small><div class="mini-tag-list accent">${observation.domainCategories.map((/** @type {string} */ id) => `<span>${escapeHtml(packCategoryLabel(packId, id))}</span>`).join("") || "<span>未設定</span>"}</div></article>
        </div>
      </div>
      <div class="knowledge-detail-grid">
        <section class="detail-panel"><div class="detail-heading"><span>RELATIONS</span><h3>確認した関係</h3></div>${
          relations.length
            ? relations
                .map((/** @type {any} */ relation) => {
                  const otherId =
                    relation.sourceId === observation.id
                      ? relation.targetId
                      : relation.sourceId;
                  const other = observationById(otherId);
                  const source = observationById(relation.sourceId);
                  const target = observationById(relation.targetId);
                  return `<button class="relation-link" data-focus-related="${escapeHtml(otherId)}"><span>${escapeHtml(source?.observation.label || "")} ${relationConnector(relation)} ${escapeHtml(target?.observation.label || "")}</span><strong>${escapeHtml(relationLabel(relation.type))}</strong><small>${escapeHtml(other?.photo.title || "")}</small></button>`;
                })
                .join("")
            : '<p class="muted-copy">確認済みの関係はまだありません。</p>'
        }</section>
        <section class="detail-panel learning-panel"><div class="detail-heading"><span>LEARNING FACTS</span><h3>後から学ぶ知識</h3></div>
          ${unlocked.map((/** @type {any} */ fact) => `<article class="learned-fact"><span>📚</span><div><strong>${escapeHtml(fact.label)}</strong><small>${escapeHtml(FACT_SOURCE_LABELS[fact.sourceType] || "")}</small></div></article>`).join("")}
          ${locked.length ? `<div class="locked-facts"><span>＋${locked.length}</span><p>入力時には要求しなかった細かな知識があります。</p><button class="primary-button" id="learnMoreButton">詳しく学ぶ</button></div>` : !facts.length ? '<p class="muted-copy">この対象には追加学習カードがまだありません。</p>' : ""}
        </section>
      </div>`;

    $$("[data-open-photo]").forEach((button) =>
      button.addEventListener("click", () =>
        openPhotoModal(button.dataset.openPhoto),
      ),
    );
    $$("[data-focus-related]").forEach((button) =>
      button.addEventListener("click", () => {
        state.knowledgeObservationId = button.dataset.focusRelated;
        renderKnowledge();
      }),
    );
    $("#learnMoreButton")?.addEventListener("click", () => {
      facts.forEach((/** @type {any} */ fact) => {
        fact.status = "learned";
      });
      persist();
      renderAll();
      renderKnowledge();
      showToast(`${facts.length}件の知識を学習カードへ追加しました`);
    });
  }

  void renderLegacyKnowledge;

  // Core 4's old knowledge screen remains above for compatibility with
  // older markup, but this later declaration is the active ReferenceFact view.
  function renderKnowledge() {
    $$("#knowledgeModeControl [data-knowledge-mode]").forEach((button) => button.classList.toggle("active", button.dataset.knowledgeMode === state.knowledgeMode));
    if (state.knowledgeMode === "learned") {
      renderLearnedReferenceFacts();
      return;
    }
    const project = toProject();
    const view = state.activeVisitId ? buildKnowledgeGraphView(project, state.activeVisitId, registry, referenceData?.graph) : null;
    const observations = view?.source.nodes.filter((node) => node.type === "Observation") || [];
    if (!observations.some((node) => node.observationId === state.knowledgeObservationId)) state.knowledgeObservationId = observations[0]?.observationId || null;
    const focus = state.knowledgeObservationId ? buildObservationFocusGraph(view.source, `Observation:${state.knowledgeObservationId}`, referenceData?.graph, registry) : null;
    const base = state.knowledgeViewMode === "focus" && focus ? focus : view?.overview;
    const expandedReferenceIds = [...state.knowledgeExpanded].filter((id) => id.startsWith("reference:")).map((id) => id.slice("reference:".length));
    const expanded = base ? expandReferenceGraphNodes(base, referenceData?.graph, expandedReferenceIds) : null;
    const graph = expanded ? filterGraphByAxis(expanded, state.knowledgeAxis) : null;
    $$("#knowledgeViewModeControl [data-knowledge-view-mode]").forEach((button) => button.classList.toggle("active", button.dataset.knowledgeViewMode === state.knowledgeViewMode));
    $$("#knowledgeLayoutControl [data-knowledge-layout]").forEach((button) => button.classList.toggle("active", button.dataset.knowledgeLayout === state.knowledgeLayoutMode));
    $("#knowledgeAxisControl")?.classList.toggle("hidden", !shouldShowKnowledgeAxisControls(state.knowledgeViewMode));
    $$("#knowledgeAxisControl [data-knowledge-axis]").forEach((button) => button.classList.toggle("active", button.dataset.knowledgeAxis === state.knowledgeAxis));
    const query = state.knowledgeSearch.trim().toLowerCase();
    $("#knowledgeObservationList").innerHTML = observations.length ? observations.filter((node) => !query || `${node.label} ${photoById(node.photoId)?.title || ""}`.toLowerCase().includes(query)).map((node) => renderKnowledgeObservationItem(node)).join("") : '<div class="empty-state"><strong>この訪問には表示できるObservationがありません</strong><p>写真を追加してObservationを整理すると、ここに知識グラフが表示されます。</p></div>';
    $("#knowledgeGraphCanvas").innerHTML = graph?.nodes.length ? renderKnowledgeGraph(graph) : '<div class="empty-state large"><strong>表示する知識グラフがありません</strong><p>activeVisitの写真とObservationを確認してください。</p></div>';
    $("#knowledgeGraphDetail").innerHTML = state.knowledgeObservationId && focus ? renderKnowledgeDetail(focus, state.knowledgeDetailNodeId || `Observation:${state.knowledgeObservationId}`) : '<div class="empty-state"><strong>ノードを選択してください</strong><p>写真内のObservationを選ぶと詳細を表示します。</p></div>';
    bindKnowledgeGraphEvents();
  }

  function renderLearnedReferenceFacts() {
    const learned = getLearnedReferenceFacts(toProject(), state.activeVisitId, state.userId, [...entityMap.values()]);
    $("#knowledgeObservationList").innerHTML = learned.length
      ? `<div class="learned-index-note"><strong>学習済み ${learned.length}件</strong><small>この訪問で正解した確認済みの知識</small></div>`
      : '<div class="empty-state"><strong>後から学ぶ知識はまだありません</strong><p>知識グラフから問題に回答すると、学習済みの知識がここに表示されます。</p></div>';
    $("#knowledgeGraphCanvas").innerHTML = learned.length
      ? `<div class="kg-canvas-header"><span>LEARNED KNOWLEDGE</span><strong>後から学ぶ知識</strong></div><div class="learned-reference-grid">${learned.map((item) => {
        const fact = item.fact;
        const photo = item.photo;
        const observation = item.observation;
        const entity = item.entity;
        const value = Array.isArray(fact.value) ? fact.value.join("、") : fact.value;
        const factLabel = fact.predicate === "classifiedAs" ? "分類" : ["livedDuring", "occursDuring", "occurs_during"].includes(fact.predicate) ? "時代" : "確認済みの知識";
        const media = photo
          ? rotatedPhotoFrame(photo, `<img src="${escapeHtml(photo.thumbSrc || photo.src || MISSING_PHOTO_SRC)}" alt="${escapeHtml(photo.title || "写真")}" />${observation?.region ? `<i style="left:${observation.region.x}%;top:${observation.region.y}%;width:${observation.region.w}%;height:${observation.region.h}%"></i>` : ""}`)
          : "<span>⌘</span>";
        return `<article class="learned-reference-card"><div class="learned-reference-media">${media}</div><div class="learned-reference-body"><span class="source-badge">✓ 確認済みの知識</span><h3>${factLabel}</h3><strong>${escapeHtml(String(value || ""))}</strong>${entity ? `<p>関連する対象：${escapeHtml(entity.name || entity.id)}</p>` : ""}${observation ? `<p>元の観察：${escapeHtml(observation.label)}${photo ? ` ／ ${escapeHtml(photo.title)}` : ""}</p>` : ""}<dl><div><dt>最終回答</dt><dd>${escapeHtml(item.state?.lastAnsweredAt || "-")}</dd></div><div><dt>試行</dt><dd>${item.state?.attemptCount ?? 0}回</dd></div><div><dt>正解</dt><dd>${item.state?.correctCount ?? 0}回</dd></div></dl>${item.questionId ? `<small class="learned-reference-question">問題：${escapeHtml(item.questionId)}</small>` : ""}<button class="text-button" data-delete-reference-fact="${escapeHtml(fact.id)}">確認済みの知識を削除</button></div></article>`;
      }).join("")}</div>`
      : '<div class="empty-state large"><strong>学習済みの知識はありません</strong><p>知識を登録しただけでは表示されません。クイズへ回答し、正解すると表示されます。</p></div>';
    $("#knowledgeGraphDetail").innerHTML = '<div class="empty-state"><strong>学習済み知識を選択してください</strong><p>表示されているカードから、関係する写真とObservationを確認できます。</p></div>';
    bindKnowledgeGraphEvents();
  }

  function renderKnowledgeObservationItem(node) {
    const photo = photoById(node.photoId);
    return `<button class="knowledge-list-item ${node.observationId === state.knowledgeObservationId ? "active" : ""}" data-knowledge-observation="${escapeHtml(node.observationId)}"><img src="${escapeHtml(photo?.thumbSrc || photo?.src || MISSING_PHOTO_SRC)}" alt="" /><span><strong>${escapeHtml(node.label)}</strong><small>${escapeHtml(photo?.title || "写真")}</small></span><i aria-hidden="true">◉</i></button>`;
  }

  function renderKnowledgeGraph(graph) {
    if (state.knowledgeLayoutMode === "radial") return renderKnowledgeRadial(graph);
    const groups = ["Visit", "Photo", "Observation", "Entity", "ReferenceFact", "ReferenceNode", "GenericCategory", "DomainCategory", "LearningRole"];
    const sections = groups.map((type) => {
      const nodes = graph.nodes.filter((node) => node.type === type);
      if (!nodes.length) return "";
      return `<section class="kg-node-group kg-${type.toLowerCase()}"><div class="kg-group-title"><span>${knowledgeNodeIcon(type)}</span><strong>${escapeHtml(knowledgeNodeLabel(type))}</strong><small>${nodes.length}</small></div><div class="kg-node-grid">${nodes.map((node) => renderKnowledgeNode(node, graph)).join("")}</div></section>`;
    }).join("");
    const relations = graph.edges.filter((edge) => edge.type === "RELATES_TO");
    const relationSection = relations.length ? `<section class="kg-relation-strip"><div class="kg-group-title"><span>↔</span><strong>関係</strong><small>${relations.length}</small></div>${relations.map((edge) => `<button class="kg-relation-row" data-kg-node="${escapeHtml(edge.targetId)}"><span>${edge.directed === false ? "↔" : "→"}</span><strong>${escapeHtml(nodeLabel(graph, edge.sourceId))}</strong><em>${escapeHtml(knowledgeEdgeLabel(edge.type, edge.relationType, registry.relationTypes))}</em><strong>${escapeHtml(nodeLabel(graph, edge.targetId))}</strong></button>`).join("")}</section>` : "";
    const backButton = state.knowledgeViewMode === "focus" ? '<button class="text-button" data-kg-overview>← 訪問全体へ戻る</button>' : "";
    return `<div class="kg-canvas-header"><span>DISPLAY GRAPH</span><strong>${state.knowledgeViewMode === "focus" ? "Observation詳細・1ホップ" : "訪問全体"}</strong><span class="kg-header-actions">${backButton}</span></div>${sections}${relationSection}`;
  }

  function renderKnowledgeRadial(graph) {
    const centerId = state.knowledgeViewMode === "focus" ? `Observation:${state.knowledgeObservationId}` : `Visit:${state.activeVisitId}`;
    const displayGraph = graph;
    const layout = buildRadialLayout(displayGraph, centerId);
    const positionMap = new Map(layout.nodes.map((node) => /** @type {[string, any]} */ ([node.id, node])));
    const relationGroups = new Map();
    for (const edge of layout.edges.filter((item) => item.type === "RELATES_TO")) {
      const key = [edge.sourceId, edge.targetId].sort().join("\u0000");
      const group = relationGroups.get(key) || [];
      group.push(edge);
      relationGroups.set(key, group);
    }
    const edgeMarkup = layout.edges.map((edge, edgeIndex) => {
      const source = positionMap.get(edge.sourceId);
      const target = positionMap.get(edge.targetId);
      if (!source || !target) return "";
      const arrow = edge.type === "RELATES_TO" && (edge.directed === true || (edge.directed == null && isDirectedRelation(registry.relationTypes, edge.relationType))) ? " marker-end=\"url(#kg-arrow)\"" : "";
      if (edge.type === "RELATES_TO") {
        const key = [edge.sourceId, edge.targetId].sort().join("\u0000");
        const group = relationGroups.get(key) || [edge];
        const parallelIndex = group.indexOf(edge);
        const canonicalDirection = edge.sourceId === key.split("\u0000")[0] ? 1 : -1;
        const path = radialRelationPath(source, target, parallelIndex, group.length, canonicalDirection);
        const pathId = `kg-relation-edge-${edgeIndex}`;
        const label = knowledgeEdgeLabel(edge.type, edge.relationType, registry.relationTypes);
        return `<path id="${pathId}" class="kg-svg-edge relation" d="${path}"${arrow} /><text class="kg-svg-edge-label"><textPath href="#${pathId}" startOffset="50%" text-anchor="middle">${escapeHtml(label)}</textPath></text>`;
      }
      return `<line class="kg-svg-edge reference" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}" />`;
    }).join("");
    const nodeMarkup = layout.nodes.map((position) => {
      const node = getKnowledgeGraphNodeDetail(displayGraph, position.id)?.node;
      if (!node) return "";
      const selected = position.id === centerId || position.id === state.knowledgeDetailNodeId;
      const photo = node.type === "Photo" || node.type === "Observation" ? photoById(node.photoId) : null;
      const rotation = normalizePhotoRotation(photo?.rotation);
      const photoTransform = rotation ? ` transform="rotate(${rotation} ${position.x} ${position.y})"` : "";
      const image = photo ? `<g${photoTransform}><image class="kg-svg-image" href="${escapeHtml(photo.thumbSrc || photo.src || MISSING_PHOTO_SRC)}" x="${position.x - 17}" y="${position.y - 17}" width="34" height="34" preserveAspectRatio="xMidYMid slice" />` : "";
      const region = node.region && photo ? `<rect class="kg-svg-region" x="${position.x - 17 + (Number(node.region.x) || 0) * 0.34}" y="${position.y - 17 + (Number(node.region.y) || 0) * 0.34}" width="${Math.max(1, (Number(node.region.w) || 0) * 0.34)}" height="${Math.max(1, (Number(node.region.h) || 0) * 0.34)}" />` : "";
      const imageClose = photo ? "</g>" : "";
      const shape = renderRadialNodeShape(node, position, selected);
      const referenceKey = node.type === "ReferenceNode" ? `reference:${node.referenceId}` : null;
      const referenceAction = referenceKey && shouldShowReferenceExpansion(node, displayGraph) ? `<text class="kg-svg-expand" data-kg-expand-reference="${escapeHtml(referenceKey)}" x="${position.x}" y="${position.y + 59}" text-anchor="middle">${state.knowledgeExpanded.has(referenceKey) ? "折り畳む" : "展開"}</text>` : "";
      return `<g class="kg-svg-node kg-svg-${node.type.toLowerCase()} ${selected ? "selected" : ""}" data-kg-node="${escapeHtml(node.id)}">${shape}${image}${region}${imageClose}<text x="${position.x}" y="${position.y + 43}" text-anchor="middle">${escapeHtml(shortGraphLabel(knowledgeNodeText(node)))}</text>${referenceAction}<title>${escapeHtml(knowledgeNodeText(node))}</title></g>`;
    }).join("");
    const zoom = state.knowledgeZoom;
    const backButton = state.knowledgeViewMode === "focus" ? '<button class="text-button" data-kg-overview>← 訪問全体へ戻る</button>' : "";
    return `<div class="kg-canvas-header"><span>RADIAL GRAPH</span><strong>${state.knowledgeViewMode === "focus" ? "Observation詳細・1ホップ" : "訪問全体"}</strong><span class="kg-header-actions">${backButton}</span></div><div class="kg-zoom-controls"><button data-kg-zoom="out" aria-label="縮小">−</button><button data-kg-zoom="reset" aria-label="中央へ戻す">100%</button><button data-kg-zoom="in" aria-label="拡大">＋</button></div><svg class="kg-radial-svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="知識グラフ"><defs><marker id="kg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs><g transform="translate(${layout.centerX} ${layout.centerY}) scale(${zoom}) translate(-${layout.centerX} -${layout.centerY})">${edgeMarkup}${nodeMarkup}</g></svg>`;
  }

  function radialRelationPath(source, target, parallelIndex, parallelCount, direction) {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const length = Math.hypot(dx, dy) || 1;
    const offset = (parallelIndex - (parallelCount - 1) / 2) * 42 * direction;
    const controlX = (source.x + target.x) / 2 - (dy / length) * offset;
    const controlY = (source.y + target.y) / 2 + (dx / length) * offset;
    return `M ${source.x} ${source.y} Q ${Math.round(controlX * 100) / 100} ${Math.round(controlY * 100) / 100} ${target.x} ${target.y}`;
  }

  function renderRadialNodeShape(node, position, selected) {
    const x = position.x;
    const y = position.y;
    const radius = selected ? 29 : 24;
    const shape = getRadialNodeShape(node);
    const className = `kg-svg-shape kg-svg-shape-${shape}`;
    if (shape === "hexagon") return `<polygon class="${className}" points="${x - 29},${y - 16} ${x - 15},${y - 29} ${x + 15},${y - 29} ${x + 29},${y - 16} ${x + 29},${y + 16} ${x + 15},${y + 29} ${x - 15},${y + 29} ${x - 29},${y + 16}" />`;
    if (shape === "diamond") return `<polygon class="${className}" points="${x},${y - 31} ${x + 31},${y} ${x},${y + 31} ${x - 31},${y}" />`;
    if (shape === "triangle") return `<polygon class="${className}" points="${x},${y - 30} ${x + 30},${y + 24} ${x - 30},${y + 24}" />`;
    if (shape === "ellipse") return `<ellipse class="${className}" cx="${x}" cy="${y}" rx="32" ry="22" />`;
    if (shape === "rounded-rect") return `<rect class="${className}" x="${x - 29}" y="${y - 24}" width="58" height="48" rx="10" />`;
    if (shape === "rect") return `<rect class="${className}" x="${x - 29}" y="${y - 22}" width="58" height="44" />`;
    return `<circle class="${className}" cx="${x}" cy="${y}" r="${radius}" />`;
  }

  function shortGraphLabel(value) {
    const text = String(value || "");
    return text.length > 12 ? `${text.slice(0, 11)}…` : text;
  }

  function renderKnowledgeNode(node, graph) {
    const photo = node.type === "Photo" || node.type === "Observation" ? photoById(node.photoId) : null;
    const image = photo ? `<span class="kg-node-image">${rotatedPhotoFrame(photo, `<img src="${escapeHtml(photo.thumbSrc || photo.src || MISSING_PHOTO_SRC)}" alt="" />${node.region ? `<i style="left:${node.region.x}%;top:${node.region.y}%;width:${node.region.w}%;height:${node.region.h}%"></i>` : ""}`)}</span>` : "";
    const card = `<button class="kg-node-card kg-shape-${node.type.toLowerCase()}" data-kg-node="${escapeHtml(node.id)}">${image}<span class="kg-node-icon">${knowledgeNodeIcon(node.type)}</span><strong>${escapeHtml(knowledgeNodeText(node))}</strong>${renderKnowledgeDisplayAttributes(node)}<small>${escapeHtml(knowledgeNodeLabel(node.type))}</small></button>`;
    return node.type === "ReferenceNode" && shouldShowReferenceExpansion(node, graph) ? `<div class="kg-reference-node-wrap">${card}<button class="text-button kg-reference-expand" data-kg-expand-reference="reference:${escapeHtml(node.referenceId)}">${state.knowledgeExpanded.has(`reference:${node.referenceId}`) ? "折り畳む" : "展開"}</button></div>` : card;
  }

  function shouldShowReferenceExpansion(node, graph) {
    if (node.type !== "ReferenceNode" || !referenceData?.graph) return false;
    const key = `reference:${node.referenceId}`;
    if (state.knowledgeExpanded.has(key)) return true;
    const visibleIds = new Set((graph?.nodes || []).map((item) => item.id));
    return getReferenceChildren(referenceData.graph, node.referenceId).some((child) => child && child.internalOnly !== true && child.visible !== false && !visibleIds.has(`Reference:${child.id}`));
  }

  function renderKnowledgeDetail(graph, nodeId) {
    const detail = getKnowledgeGraphNodeDetail(graph, nodeId);
    if (!detail) return '<div class="empty-state"><strong>ノードを選択してください</strong></div>';
    const node = detail.node;
    const photo = node.photoId ? photoById(node.photoId) : null;
    const referenceEditor = node.type === "Observation" || node.type === "Entity" ? renderReferenceFactEditor(node, referenceData?.graph) : "";
    const photoMarkup = photo ? rotatedPhotoFrame(photo, `<img src="${escapeHtml(photo.src || photo.thumbSrc || MISSING_PHOTO_SRC)}" alt="${escapeHtml(photo.title)}" />`) : "";
    return `<div class="kg-detail-header"><span>${knowledgeNodeIcon(node.type)} ${escapeHtml(knowledgeNodeLabel(node.type))}</span><h2>${escapeHtml(knowledgeNodeText(node))}</h2>${renderKnowledgeDisplayAttributes(node)}${photo ? `<button class="ghost-button dark" data-open-photo="${escapeHtml(photo.id)}">元写真を見る</button>` : ""}</div>${photo ? `<div class="kg-detail-photo">${photoMarkup}<strong>${escapeHtml(photo.title)}</strong></div>` : ""}${referenceEditor}<div class="kg-detail-meta"><p>接続 ${detail.incoming.length + detail.outgoing.length}件</p>${detail.outgoing.map((edge) => `<button data-kg-node="${escapeHtml(edge.targetId)}">→ ${escapeHtml(knowledgeEdgeLabel(edge.type, edge.relationType, registry.relationTypes))}：${escapeHtml(nodeLabel(graph, edge.targetId))}</button>`).join("")}${detail.incoming.map((edge) => `<button data-kg-node="${escapeHtml(edge.sourceId)}">← ${escapeHtml(knowledgeEdgeLabel(edge.type, edge.relationType, registry.relationTypes))}：${escapeHtml(nodeLabel(graph, edge.sourceId))}</button>`).join("")}</div>`;
  }

  function nodeLabel(graph, nodeId) { const node = getKnowledgeGraphNodeDetail(graph, nodeId)?.node; return node?.label || node?.title || nodeId; }
  function knowledgeNodeIcon(type) { return { User: "●", Visit: "⬡", Photo: "▣", Observation: "◎", Entity: "◇", ReferenceFact: "▤", ReferenceNode: "⌘", GenericCategory: "◌", DomainCategory: "◆", LearningRole: "✦" }[type] || "•"; }
  function bindKnowledgeGraphEvents() {
    $$('[data-knowledge-observation]').forEach((button) => button.addEventListener("click", () => { state.knowledgeObservationId = button.dataset.knowledgeObservation; state.knowledgeViewMode = "focus"; renderKnowledge(); }));
    $$('[data-kg-node]').forEach((button) => button.addEventListener("click", () => { const id = button.dataset.kgNode; state.knowledgeDetailNodeId = id; if (id?.startsWith("Observation:")) { state.knowledgeObservationId = id.slice("Observation:".length); state.knowledgeViewMode = "focus"; } renderKnowledge(); }));
    $("[data-kg-overview]")?.addEventListener("click", () => { state.knowledgeViewMode = "overview"; state.knowledgeDetailNodeId = null; renderKnowledge(); });
    $$('[data-kg-expand-reference]').forEach((button) => button.addEventListener("click", (event) => { event.stopPropagation(); const key = button.dataset.kgExpandReference; if (!key) return; if (state.knowledgeExpanded.has(key)) state.knowledgeExpanded.delete(key); else state.knowledgeExpanded.add(key); renderKnowledge(); }));
    $("[data-kg-zoom=out]")?.addEventListener("click", () => { state.knowledgeZoom = Math.max(0.7, state.knowledgeZoom - 0.15); renderKnowledge(); });
    $("[data-kg-zoom=in]")?.addEventListener("click", () => { state.knowledgeZoom = Math.min(1.8, state.knowledgeZoom + 0.15); renderKnowledge(); });
    $("[data-kg-zoom=reset]")?.addEventListener("click", () => { state.knowledgeZoom = 1; renderKnowledge(); });
    $$('[data-reference-fact-form]').forEach((form) => form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const nodeId = form.dataset.referenceFactForm || "";
      const fact = buildVerifiedReferenceFact({
        id: uid("reference-fact"),
        nodeId,
        referenceId: String(formData.get("referenceId") || ""),
        sourceNote: String(formData.get("sourceNote") || ""),
        referenceGraph: referenceData?.graph,
      });
      if (!fact) return;
      state.referenceFacts.push(fact);
      persist();
      renderKnowledge();
      renderLearn();
      showToast("確認済みの知識を追加しました");
    }));
    $$('[data-delete-reference-fact]').forEach((button) => button.addEventListener("click", () => {
      const factId = button.dataset.deleteReferenceFact;
      state.referenceFacts = state.referenceFacts.filter((fact) => fact.id !== factId);
      persist();
      renderKnowledge();
      showToast("確認済みの知識を削除しました");
    }));
    $$('[data-open-photo]').forEach((button) => button.addEventListener("click", () => openPhotoModal(button.dataset.openPhoto)));
  }

  function quizGenerationOptions() {
    return { scope: state.quizScope, difficulty: state.quizDifficulty, questionTypes: state.quizQuestionTypes };
  }

  function quizAvailability() {
    if (!state.activeVisitId && state.quizScope !== "all") return {
      questions: [],
      difficulties: [],
      comparableCount: 0,
      questionTypes: QUIZ_QUESTION_TYPES.map((type) => ({ ...type, questionCount: 0, available: false, reason: "まず訪問を選択してください。" })),
      reason: "まず訪問を選択または作成してください。",
    };
    return describeQuizAvailability(toProject(), state.activeVisitId, registry, referenceData?.graph, quizGenerationOptions());
  }

  function quizAttemptContext() {
    return quizAttemptContextKey({
      visitId: state.activeVisitId,
      scope: state.quizScope,
      difficulty: state.quizDifficulty,
      questionTypes: state.quizQuestionTypes,
    });
  }

  function deckQuizzes(/** @type {string} */ deck) {
    return deck === "observed" ? quizAvailability().questions : [];
  }

  function renderLearn() {
    let availability = quizAvailability();
    for (let pass = 0; pass < 3; pass += 1) {
      const selectedDifficulty = availability.difficulties?.find((item) => item.id === state.quizDifficulty);
      const firstAvailable = availability.difficulties?.find((item) => item.available);
      if (selectedDifficulty && !selectedDifficulty.available && firstAvailable) {
        state.quizDifficulty = firstAvailable.id;
        availability = quizAvailability();
        continue;
      }
      const reconciledTypes = reconcileQuizQuestionTypes(state.quizQuestionTypes, availability.questionTypes);
      if (reconciledTypes.join("\u0000") !== state.quizQuestionTypes.join("\u0000")) {
        state.quizQuestionTypes = reconciledTypes;
        availability = quizAvailability();
        continue;
      }
      break;
    }
    const cardCount = availability.questions.reduce((sum, quiz) => sum + getQuizCards(quiz).length, 0);
    $("#deckSummary").innerHTML = `<span><strong>${availability.questions.length}</strong>Knowledge Graph問題</span><span><strong>${cardCount}</strong>配置カード</span>`;
    $$("#deckSwitch [data-deck]").forEach((button) => button.classList.toggle("active", button.dataset.deck === state.deck));
    renderQuizSetupControls(availability);
    renderQuiz();
    renderStories();
  }

  function renderQuizSetupControls(availability) {
    const controls = $("#quizSetupControls");
    if (!controls) return;
    const difficulties = availability.difficulties?.length
      ? availability.difficulties
      : Object.values(QUIZ_DIFFICULTIES).map((item) => ({ ...item, available: false }));
    const axisWarnings = (availability.axisReasons || []).map((reason) => `<small class="quiz-axis-warning">${escapeHtml(reason)}</small>`).join("");
    controls.innerHTML = `<label>対象範囲<select id="quizScopeSelect"><option value="active" ${state.quizScope === "active" ? "selected" : ""}>この訪問</option><option value="all" ${state.quizScope === "all" ? "selected" : ""}>すべての訪問</option></select></label><label>難易度<select id="quizDifficultySelect">${difficulties.map((item) => `<option value="${item.id}" ${state.quizDifficulty === item.id ? "selected" : ""} ${item.available ? "" : "disabled"}>${escapeHtml(item.label)}：${escapeHtml(item.description)}${item.available ? "" : "（対象不足）"}</option>`).join("")}</select></label>${renderQuizQuestionTypeControls(availability.questionTypes || [], state.quizQuestionTypes)}<small>比較可能な対象 ${availability.comparableCount || 0}件。構造クイズは${MIN_COMPARABLE_OBSERVATIONS}件以上で生成します。</small>${axisWarnings}`;
    $("#quizScopeSelect")?.addEventListener("change", (event) => {
      state.quizScope = event.target.value;
      state.quizStarted = false;
      state.deckAttemptId = null;
      renderLearn();
    });
    $("#quizDifficultySelect")?.addEventListener("change", (event) => {
      state.quizDifficulty = event.target.value;
      state.quizStarted = false;
      state.deckAttemptId = null;
      renderLearn();
    });
    $$('[data-quiz-question-type]').forEach((input) => input.addEventListener("change", (event) => {
      const changed = updateQuizQuestionTypeSelection(
        state.quizQuestionTypes,
        event.target.dataset.quizQuestionType,
        event.target.checked,
        availability.questionTypes || [],
      );
      if (changed.prevented) {
        event.target.checked = state.quizQuestionTypes.includes(event.target.dataset.quizQuestionType);
        const hint = $("#quizTypeSelectionHint");
        if (hint) hint.textContent = "少なくとも1種類が必要です。最後の1種類はオフにできません。";
        return;
      }
      state.quizQuestionTypes = changed.selectedTypes;
      state.quizStarted = false;
      state.deckAttemptId = null;
      renderLearn();
    }));
  }

  function renderQuiz() {
    const quizzes = deckQuizzes(state.deck);
    const total = quizzes.length;
    const attemptContext = quizAttemptContext();
    if (!state.deckAttemptId || state.quizAttemptVisitId !== attemptContext) {
      state.deckAttemptId = uid("deck-attempt");
      state.quizAttemptVisitId = attemptContext;
      state.quizIndex = 0;
      state.quizCompleted = false;
    }
    const storedAttempts = new Map(quizzes.map((quiz) => [quiz.id, storedQuizAttempt(quiz)]));
    state.quizScore = quizzes.filter((quiz) => storedAttempts.get(quiz.id)?.scored.correct).length;
    $("#quizScore").textContent = state.quizScore;
    $("#quizTotal").textContent = `/ ${total}`;
    const degree = total ? Math.round((Math.min(state.quizIndex, total) / total) * 360) : 0;
    $("#quizRing").style.background = `conic-gradient(var(--accent) ${degree}deg, rgba(255,255,255,.12) ${degree}deg)`;
    if (!total) {
      const availability = quizAvailability();
      $("#quizStage").innerHTML = `<div class="locked-deck"><span>∅</span><h2>表示できる問題がありません</h2><p>${escapeHtml(availability.reason || "このデッキには問題がありません。")} 確認済みの観察対象と参照知識を整理すると問題を生成できます。</p><button class="primary-button" id="goKnowledgeButton">知識マップへ</button></div>`;
      $("#goKnowledgeButton").addEventListener("click", () => switchView("knowledge"));
      return;
    }
    if (!state.quizStarted) {
      const cards = quizzes.reduce((sum, quiz) => sum + getQuizCards(quiz).length, 0);
      $("#quizStage").innerHTML = `<div class="quiz-finished quiz-start"><div class="finish-mark">✦</div><h2>${total}問・${cards}件を配置</h2><p>対象範囲と難易度を確認してから、まとめて配置するクイズを始めます。</p><button class="primary-button" id="startQuizButton">この設定で始める</button></div>`;
      $("#startQuizButton").addEventListener("click", beginQuiz);
      return;
    }
    if (state.quizCompleted || state.quizIndex >= total) {
      $("#quizStage").innerHTML = `<div class="quiz-finished"><div class="finish-mark">✓</div><h2>${state.quizScore} / ${total} 正解</h2><p>Knowledge Graphから生成した問題を完了しました。</p><button class="primary-button" id="finishRestartButton">もう一度挑戦</button></div>`;
      $("#finishRestartButton").addEventListener("click", resetQuiz);
      return;
    }
    const quiz = quizzes[state.quizIndex];
    const cards = getQuizCards(quiz);
    const stored = storedAttempts.get(quiz.id);
    const retrying = state.quizRetry === true;
    state.quizAnswered = Boolean(stored) && !retrying;
    if (state.quizAnswerQuizId !== quiz.id) {
      state.quizAnswerQuizId = quiz.id;
      state.quizCurrentAnswer = { placements: [] };
      state.quizActiveCardId = cards[0]?.cardId || null;
    }
    const scored = state.quizAnswered ? stored.scored : null;
    const answer = state.quizAnswered ? stored.scored.answer : state.quizCurrentAnswer;
    const placements = answer?.placements || [];
    const cardMarkup = cards.map((card) => {
      const photo = photoById(card.photoId);
      const item = scored?.items.find((result) => result.cardId === card.cardId);
      const placement = placements.find((entry) => entry.cardId === card.cardId);
      const placementLabel = quiz.options.find((option) => option.id === placement?.referenceId)?.label || "未配置";
      return renderObservationQuizCard(card, photo, {
        draggable: !state.quizAnswered,
        disabled: state.quizAnswered,
        selected: !state.quizAnswered && state.quizActiveCardId === card.cardId,
        result: item ? (item.correct ? "correct" : "incorrect") : null,
        placed: Boolean(placement),
        placementLabel,
      });
    }).join("");
    const allPlaced = cards.every((card) => placements.some((placement) => placement.cardId === card.cardId));
    $("#quizStage").innerHTML = `<article class="quiz-card"><div class="quiz-content"><span class="quiz-counter">${quiz.questionType === "hierarchy" ? "CLASSIFICATION" : quiz.questionType === "timeline-map" ? "TIMELINE" : "RELATION"} ${String(state.quizIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span><h2>${escapeHtml(quiz.prompt)}</h2><p class="quiz-placement-help">カードを選んで位置をクリックするか、カードを位置へドラッグしてください。全件を配置してから採点します。</p><div class="quiz-placement-layout"><div class="observation-quiz-card-list">${cardMarkup}</div>${renderQuizPlacementBoard(quiz, placements, scored, state.quizAnswered)}</div><div id="quizFeedback">${scored ? renderQuizFeedback(quiz, scored) : ""}</div><div class="quiz-next-row"><small>${cards.length}件中 ${placements.length}件配置</small>${state.quizAnswered ? `<button class="ghost-button" id="retryQuizButton">もう一度回答</button>` : `<button class="primary-button" id="submitQuizButton" ${allPlaced ? "" : "disabled"}>まとめて採点</button>`}<button class="primary-button" id="nextQuizButton" ${state.quizAnswered ? "" : "disabled"}>${state.quizIndex === total - 1 ? "結果を見る" : "次の問題 →"}</button></div></div></article>`;
    // Keep the shared circular magnifier on every quiz photo surface.
    $$("#quizStage .observation-quiz-card").forEach((cardButton) => {
      const card = cards.find((item) => item.cardId === cardButton.dataset.observationCard);
      const photo = card?.photoId ? photoById(card.photoId) : null;
      mountPhotoMagnifier(cardButton, cardButton.querySelector(".quiz-photo-media img"), photo, {
        showControls: false,
      });
    });
    $$("#quizStage .quiz-choice-option").forEach((card) => {
      const option = quiz.options.find((item) => item.id === card.dataset.quizDrop);
      const optionPhoto = option?.photoId ? photoById(option.photoId) : null;
      mountPhotoMagnifier(card, card.querySelector("img"), optionPhoto, {
        showControls: false,
      });
    });
    const dropButtons = $$('[data-quiz-drop]');
    dropButtons.forEach((button, index) => {
      button.addEventListener("click", () => placeQuizCard(quiz, state.quizActiveCardId, button.dataset.quizDrop));
      button.addEventListener("dragover", (event) => event.preventDefault());
      button.addEventListener("drop", (event) => {
        event.preventDefault();
        placeQuizCard(quiz, event.dataTransfer?.getData("text/plain") || state.quizActiveCardId, button.dataset.quizDrop);
      });
      button.addEventListener("keydown", (event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowUp" || event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          const offset = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
          dropButtons[(index + offset + dropButtons.length) % dropButtons.length]?.focus();
        }
      });
    });
    $$('[data-observation-card]').forEach((button) => {
      button.addEventListener("click", () => { if (!state.quizAnswered) { state.quizActiveCardId = button.dataset.observationCard; renderQuiz(); } });
      button.addEventListener("dragstart", (event) => {
        state.quizActiveCardId = button.dataset.observationCard;
        event.dataTransfer?.setData("text/plain", button.dataset.observationCard);
      });
    });
    $$('[data-quiz-shift-card]').forEach((button) => button.addEventListener("click", () => {
      state.quizCurrentAnswer = shiftTimelinePlacement(quiz, state.quizCurrentAnswer, button.dataset.quizShiftCard, Number(button.dataset.quizShift));
      renderQuiz();
    }));
    $("#submitQuizButton")?.addEventListener("click", () => answerGeneratedQuiz(quiz));
    $("#retryQuizButton")?.addEventListener("click", () => {
      state.quizRetry = true;
      state.quizAnswerQuizId = null;
      state.quizCurrentAnswer = { placements: [] };
      renderQuiz();
    });
    $("#nextQuizButton").addEventListener("click", () => nextGeneratedQuiz(quizzes));
  }

  function storedQuizAttempt(quiz) {
    const records = state.quizResults.filter((result) => result.deckAttemptId === state.deckAttemptId && result.quizId === quiz.id && result.attemptId);
    const attemptId = records.at(-1)?.attemptId;
    if (!attemptId) return null;
    const attemptRecords = records.filter((result) => result.attemptId === attemptId);
    const expected = getQuizCards(quiz).length || 1;
    if (attemptRecords.length < expected) return null;
    const scored = scoreQuizAnswer(quiz, attemptRecords[0].answer);
    return { records: attemptRecords, scored };
  }

  function renderQuizPlacementBoard(/** @type {any} */ quiz, placements, scored, /** @type {boolean} */ answered) {
    const options = [...quiz.options];
    if (quiz.questionType === "hierarchy") {
      return renderHierarchyQuizBoard(quiz, placements, scored, answered, { photoById });
    }
    if (quiz.questionType !== "timeline-map") {
      return `<div class="quiz-choice-board" aria-label="候補一覧">${options.map((option) => { const optionPhoto = option.photoId ? photoById(option.photoId) : null; const markers = quizPlacementMarkers(quiz, option.id, placements, scored); const resultClass = markers.some((item) => item.className === "incorrect") ? "incorrect" : markers.some((item) => item.className === "correct") ? "correct" : markers.length ? "selected" : ""; return `<button class="quiz-placement quiz-choice-option ${resultClass}" data-quiz-drop="${escapeHtml(option.id)}" ${answered ? "disabled" : ""}>${optionPhoto ? renderQuizPhotoMedia(optionPhoto, option.region, { label: option.label, className: "quiz-choice-media" }) : `<span>${escapeHtml(option.label)}</span>`}${renderQuizPlacementMarkers(markers)}</button>`; }).join("")}</div>`;
    }
    return renderTimelineQuizBoard(quiz, placements, scored, answered, { photoById });
  }

  function placeQuizCard(quiz, cardId, referenceId) {
    const placementOption = quiz.options.find((option) => option.id === referenceId);
    if (state.quizAnswered || !cardId || !placementOption || placementOption.placementEligible === false
      || !getQuizCards(quiz).some((card) => card.cardId === cardId)) return;
    const placements = (state.quizCurrentAnswer?.placements || []).filter((placement) => placement.cardId !== cardId);
    const timelinePlacement = quiz.questionType === "timeline-map"
      ? placementForTimelineReference(quiz, cardId, referenceId)
      : null;
    placements.push(timelinePlacement || { cardId, referenceId });
    state.quizCurrentAnswer = { placements };
    const cards = getQuizCards(quiz);
    const currentIndex = cards.findIndex((card) => card.cardId === cardId);
    state.quizActiveCardId = cards.slice(currentIndex + 1).find((card) => !placements.some((placement) => placement.cardId === card.cardId))?.cardId
      || cards.find((card) => !placements.some((placement) => placement.cardId === card.cardId))?.cardId
      || cardId;
    renderQuiz();
  }

  function renderQuizFeedback(quiz, scored) {
    const rows = scored.items.map((item) => {
      const card = getQuizCards(quiz).find((candidate) => candidate.cardId === item.cardId);
      const selected = quiz.options.find((option) => option.id === item.selectedReferenceId)?.label || "未配置";
      const target = quiz.options.find((option) => option.id === item.targetReferenceId)?.label || item.targetReferenceId;
      const boundary = item.timelineKind === "period"
        ? `<span>開始：${item.selectedStartMa ?? "不明"} Ma（正解 ${item.targetStartMa ?? "不明"} Ma） ／ 終了：${item.selectedEndMa ?? "不明"} Ma（正解 ${item.targetEndMa ?? "不明"} Ma）</span>`
        : "";
      const resultLabel = item.correct ? "正解" : item.partial ? "部分正解" : "不正解";
      return `<li class="${item.correct ? "correct" : "incorrect"}"><strong>${escapeHtml(card?.label || item.cardId)}：${resultLabel}</strong><span>自分の配置：${escapeHtml(selected)} ／ 正解位置：${escapeHtml(target)}</span>${boundary}</li>`;
    }).join("");
    return `<div class="quiz-feedback"><strong>全体結果：${scored.correctCount} / ${scored.totalCount}件正解</strong><ul class="quiz-individual-results">${rows}</ul><small>分類樹・時間軸には正解位置と周辺構造を表示しています。</small><p>${escapeHtml(quiz.explanation)}</p></div>`;
  }

  function answerGeneratedQuiz(/** @type {any} */ quiz) {
    if (state.quizAnswered) return;
    const result = scoreQuizAnswer(quiz, state.quizCurrentAnswer);
    if (result.items.some((item) => !item.selectedReferenceId)) return;
    const answeredAt = new Date().toISOString();
    const attemptId = uid("quiz-attempt");
    for (const entry of buildQuizResultEntries(quiz, result)) {
      const quizResult = { id: uid("quiz-result"), deckAttemptId: state.deckAttemptId, attemptId, quizId: quiz.id, quizType: quiz.questionType, ...entry, answeredAt, completedAt: answeredAt };
      state.quizResults.push(quizResult);
      if (quizResult.referenceFactId) {
        const learning = recordQuizLearning({ events: state.learningEvents, states: state.userKnowledgeStates, result: quizResult, userId: state.userId });
        state.learningEvents = learning.events;
        state.userKnowledgeStates = learning.states;
      }
    }
    persist();
    state.quizAnswered = true;
    state.quizRetry = false;
    renderKnowledge();
    renderQuiz();
  }

  function nextGeneratedQuiz(/** @type {any[]} */ quizzes) {
    if (!state.quizAnswered) return;
    state.quizIndex += 1;
    state.quizRetry = false;
    state.quizAnswerQuizId = null;
    state.quizCurrentAnswer = { placements: [] };
    state.quizActiveCardId = null;
    if (state.quizIndex >= quizzes.length) state.quizCompleted = true;
    renderQuiz();
  }

  function beginQuiz() {
    state.deckAttemptId = uid("deck-attempt");
    state.quizAttemptVisitId = quizAttemptContext();
    state.quizStarted = true;
    state.quizIndex = 0;
    state.quizCompleted = false;
    state.quizRetry = false;
    state.quizAnswerQuizId = null;
    state.quizCurrentAnswer = { placements: [] };
    renderQuiz();
  }

  function resetQuiz() {
    state.deckAttemptId = null;
    state.quizAttemptVisitId = null;
    state.quizStarted = false;
    state.quizIndex = 0;
    state.quizScore = 0;
    state.quizAnswered = false;
    state.quizCompleted = false;
    state.quizRetry = false;
    state.quizAnswerQuizId = null;
    state.quizCurrentAnswer = { placements: [] };
    state.quizActiveCardId = null;
    renderLearn();
  }

  function renderStories() {
    // Demo-only content. A user's own visit gets nothing pre-authored.
    if (!viewingDemo()) {
      $("#storyGrid").innerHTML = "";
      $("#storyGrid").closest(".section-block")?.classList.add("hidden");
      return;
    }
    $("#storyGrid").closest(".section-block")?.classList.remove("hidden");
    $("#storyGrid").innerHTML = SAMPLE_STORIES.map(
      (/** @type {any} */ story, /** @type {number} */ index) => {
        const photos = story.photoIds.map(photoById).filter(Boolean);
        return `<article class="story-card compact-story"><div class="story-gallery">${photos
          .slice(0, 3)
          .map(
            (/** @type {any} */ photo) =>
              `<img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" style="${rotationStyle(photo.rotation)}" />`,
          )
          .join(
            "",
          )}<span class="story-number">0${index + 1}</span></div><div class="story-copy"><small>${escapeHtml(story.subtitle)}</small><h3>${escapeHtml(story.title)}</h3><p>${escapeHtml(story.description)}</p><div class="story-steps">${story.steps.map((/** @type {string} */ step, /** @type {number} */ i) => `<div class="story-step"><span>${i + 1}</span>${escapeHtml(step)}</div>`).join("")}</div></div></article>`;
      },
    ).join("");
  }

  function renderCollections() {
    // toProject intentionally strips transient Blob/asset URLs for persistence.
    // Collection covers are a view concern, so keep the in-memory image URLs here.
    const collections = buildCollectionProgressForView(
      toProject(),
      state.photos,
      state.activeVisitId,
      state.userId,
      registry,
    );

    $("#collectionGrid").innerHTML = collections.length
      ? collections.map(
      (/** @type {any} */ collection) => {
        const progress = collection;
        const collectionIcon = collection.kind === "visit" ? "◉" : collection.kind === "generic" ? "▦" : "◇";
        return `<article class="collection-card"><div class="collection-cover">${progress.photos
          .slice(0, 3)
          .map(
            (/** @type {any} */ photo) =>
              `<img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" style="${rotationStyle(photo.rotation)}" />`,
          )
          .join(
            "",
          )}<span>${collectionIcon}</span></div><div class="collection-body"><div class="collection-title-row"><div><small>${escapeHtml(collection.kind.toUpperCase())} COLLECTION</small><h3>${escapeHtml(collection.title)}</h3></div><strong>${progress.percent}%</strong></div><div class="collection-progress"><span style="width:${progress.percent}%"></span></div><div class="stage-row">${progress.stages.map((stage) => `<span class="${stage.complete ? "complete" : ""}"><i>${stage.complete ? "✓" : "○"}</i>${escapeHtml(stage.label)} ${stage.count}/${stage.denominator}</span>`).join("")}</div></div></article>`;
      },
        ).join("")
      : '<div class="empty-state"><strong>この訪問のコレクションはこれからです</strong><p>写真を追加して整理を進めると、集めた記録がここに並びます。</p></div>';

    $("#domainPackGrid").innerHTML = registry.packs
      .filter((item) => item.id !== "other")
      .map((pack) => {
        const categories = packCategories(pack.id).slice(0, 6);
        return `<article class="domain-pack-card"><span class="domain-pack-icon">${escapeHtml(pack.icon)}</span><h3>${escapeHtml(pack.label)}</h3><p>${escapeHtml(pack.description)}</p><div class="mini-tag-list">${categories.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("")}</div></article>`;
      })
      .join("");
  }

  // ---------------------------------------------------------- visit UI ---

  /** Header title, organise-screen pill, and the switcher list. */
  function renderVisitBar() {
    const visit = activeVisit();
    const title = visit ? visit.title : "訪問を選ぶ";
    $("#visitSwitchLabel").textContent = title;
    $("#organizeVisitName").textContent = title;
    $("#organizeVisitKind").textContent = visit
      ? isDemoVisit(visit)
        ? "デモ訪問"
        : "自分の訪問"
      : "未選択";

    $("#visitList").innerHTML = state.visits
      .map((item) => {
        const count = state.photos.filter((p) => p.visitId === item.id).length;
        const meta = [
          isDemoVisit(item) ? "デモ" : "自分の訪問",
          `写真${count}枚`,
          item.placeName || null,
          item.visitedAt || null,
        ]
          .filter(Boolean)
          .join("・");
        return `<button class="visit-row ${item.id === state.activeVisitId ? "active" : ""}" data-switch-visit="${escapeHtml(item.id)}">
          <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(meta)}</small></span>
          <i>${item.id === state.activeVisitId ? "✓" : ""}</i>
        </button>`;
      })
      .join("");

    $$("[data-switch-visit]").forEach((button) =>
      button.addEventListener("click", () =>
        switchVisit(button.dataset.switchVisit),
      ),
    );
  }

  /** @param {string} visitId */
  function switchVisit(visitId) {
    if (visitId === state.activeVisitId) {
      closeModal("visitSheet");
      return;
    }
    state.activeVisitId = visitId;
    // Selections belong to the old visit; drop them before rendering.
    state.organizePhotoId = null;
    state.activeObservationId = null;
    state.knowledgeObservationId = null;
    state.photoFilter = "all";
    resetQuiz();
    normaliseSelection();
    persist();
    closeModal("visitSheet");
    renderAll();
    renderVisitBar();
    renderOrganize();
    renderKnowledge();
    renderLearn();
    showToast(`${activeVisit()?.title ?? ""} へ切り替えました`);
  }

  /** @param {string|null} visitId  null なら新規作成 */
  function openVisitEditor(visitId) {
    state.editingVisitId = visitId;
    const visit = visitId ? state.visits.find((v) => v.id === visitId) : null;

    $("#visitEditorTitle").textContent = visit ? "訪問を編集" : "自分の訪問を作る";
    $("#visitTitleInput").value = visit?.title ?? "";
    $("#visitPlaceInput").value = visit?.placeName ?? "";
    $("#visitDateInput").value = visit?.visitedAt ?? "";

    const selected = new Set(visit?.domainPackIds ?? ["other"]);
    $("#visitPackList").innerHTML = registry.packs
      .map(
        (pack) => `<label class="pack-choice">
          <input type="checkbox" value="${escapeHtml(pack.id)}" ${selected.has(pack.id) ? "checked" : ""} />
          <span>${escapeHtml(pack.icon)} ${escapeHtml(pack.label)}</span>
        </label>`,
      )
      .join("");

    // Deleting is offered for every visit, demo included: the demo is a
    // regenerable sample, not something to protect (Issue #3 revision).
    $("#deleteVisitButton").classList.toggle("hidden", !visit);
    $("#visitEditorHint").textContent = visit && isDemoVisit(visit)
      ? "デモ訪問です。削除しても、次に「デモを見る」を選べば作り直せます。"
      : "分野パックを変えても、すでに付けた分類は消えません。";

    closeModal("visitSheet");
    openModal("visitEditorModal");
    $("#visitTitleInput").focus();
  }

  function readVisitEditor() {
    return {
      title: $("#visitTitleInput").value,
      placeName: $("#visitPlaceInput").value,
      visitedAt: $("#visitDateInput").value || null,
      domainPackIds: $$("#visitPackList input:checked").map(
        (input) => input.value,
      ),
    };
  }

  async function saveVisitFromEditor() {
    const input = readVisitEditor();
    const check = validateVisit(input);
    if (!check.ok) {
      showToast(check.reason);
      return;
    }

    if (state.editingVisitId) {
      const index = state.visits.findIndex((v) => v.id === state.editingVisitId);
      if (index >= 0) state.visits[index] = updateVisit(state.visits[index], input);
    } else {
      const visit = createVisit(input);
      state.visits.push(visit);
      state.activeVisitId = visit.id;
      state.organizePhotoId = null;
      state.activeObservationId = null;
      normaliseSelection();
    }

    closeModal("visitEditorModal");
    await flushPersist();
    renderAll();
    renderVisitBar();
    renderOrganize();
    renderKnowledge();
    renderLearn();
    showToast(state.editingVisitId ? "訪問を更新しました" : "訪問を作りました");
    state.editingVisitId = null;
  }

  /**
   * Delete a visit and everything that only makes sense inside it.
   * The cascade exists so nothing is left pointing at a deleted observation.
   */
  async function deleteVisit() {
    const visitId = state.editingVisitId;
    const visit = state.visits.find((v) => v.id === visitId);
    if (!visit) return;

    const cascade = collectVisitCascade(
      { photos: state.photos, relations: state.relations, facts: state.facts, quizResults: state.quizResults },
      visit.id,
    );

    const summary = [
      `写真 ${cascade.photoIds.length}枚`,
      `観察対象 ${cascade.observationIds.length}件`,
      `関係 ${cascade.relationIds.length}件`,
      `回答履歴 ${cascade.quizResultCount}件`,
    ].join(" / ");

    const proceed = window.confirm(
      `「${visit.title}」を削除します。\n\n${summary} が消えます。\n` +
        (isDemoVisit(visit)
          ? "デモ訪問は、次に「デモを見る」を選べば作り直せます。\n"
          : "この操作は元に戻せません。\n") +
        "\n続けますか？",
    );
    if (!proceed) return;

    const removedPhotos = new Set(cascade.photoIds);
    const removedRelations = new Set(cascade.relationIds);
    const removedFacts = new Set(cascade.factIds);

    for (const photoId of cascade.photoIds) {
      const urls = objectUrls.get(photoId);
      if (urls) {
        URL.revokeObjectURL(urls.src);
        URL.revokeObjectURL(urls.thumbSrc);
        objectUrls.delete(photoId);
      }
      try {
        await repository.deletePhotoBinary(photoId);
      } catch {
        // 画像が消せなくてもレコードは消す。孤児は次回の起動で拾える。
      }
    }

    state.photos = state.photos.filter((photo) => !removedPhotos.has(photo.id));
    state.relations = state.relations.filter(
      (/** @type {any} */ relation) => !removedRelations.has(relation.id),
    );
    state.facts = state.facts.filter(
      (/** @type {any} */ fact) => !removedFacts.has(fact.id),
    );
    state.quizResults = state.quizResults.filter(
      (/** @type {any} */ result) =>
        result.visitId !== visit.id &&
        !cascade.quizResultIds.includes(result.id),
    );
    const learning = removeVisitLearningRecords(state.learningEvents, state.userKnowledgeStates, visit.id);
    state.learningEvents = learning.events;
    state.userKnowledgeStates = learning.states;
    state.visits = state.visits.filter((item) => item.id !== visit.id);
    state.activeVisitId = pickNextActiveVisitId(state.visits);

    state.organizePhotoId = null;
    state.activeObservationId = null;
    state.knowledgeObservationId = null;
    resetQuiz();
    normaliseSelection();

    closeModal("visitEditorModal");
    state.editingVisitId = null;
    await flushPersist();

    if (!state.activeVisitId) {
      openModal("firstRunModal");
    }
    renderAll();
    renderVisitBar();
    renderOrganize();
    renderKnowledge();
    renderLearn();
    showToast(`「${visit.title}」を削除しました`);
  }

  /** Rebuild the demo visit from the bundled sample data. */
  async function restoreDemoVisit() {
    if (!state.visits.some((visit) => visit.id === DEMO_VISIT_ID)) {
      const context = migrationContext();
      state.visits.push(
        createVisit({
          id: DEMO_VISIT_ID,
          title: context.demoVisitSeed.title,
          placeName: context.demoVisitSeed.placeName,
          domainPackIds: context.demoVisitSeed.domainPackIds,
          source: "demo",
        }),
      );
      state.photos.push(
        ...context.demoPhotos.map((photo) => ({
          ...photo,
          src: `assets/${photo.file}`,
          thumbSrc: `assets/${photo.file}`,
          experienceMemo: "",
        })),
      );
      const existing = new Set(
        state.relations.map((/** @type {any} */ r) => r.id),
      );
      state.relations.push(
        ...context.demoRelations.filter(
          (/** @type {any} */ r) => !existing.has(r.id),
        ),
      );
      const existingFacts = new Set(
        state.facts.map((/** @type {any} */ f) => f.id),
      );
      state.facts.push(
        ...context.demoFacts.filter(
          (/** @type {any} */ f) => !existingFacts.has(f.id),
        ),
      );
    }
    state.activeVisitId = DEMO_VISIT_ID;
    state.organizePhotoId = null;
    state.activeObservationId = null;
    normaliseSelection();
    await flushPersist();
  }

  /** Only shown when no visit is selected — the very first run, or after deleting the last one. */
  function maybeShowFirstRun() {
    if (state.activeVisitId) return;
    openModal("firstRunModal");
  }

  function tutorialStorage() {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  function renderTutorialStep() {
    renderTutorialStepContent(document, tutorialIndex);
  }

  function finishTutorial() {
    markTutorialSeen(tutorialStorage());
    closeModal("tutorialModal");
    if (!state.activeVisitId) maybeShowFirstRun();
  }

  function openTutorial() {
    tutorialIndex = 0;
    renderTutorialStep();
    openModal("tutorialModal");
  }

  function maybeShowTutorial() {
    if (isTutorialSeen(tutorialStorage())) return false;
    openTutorial();
    return true;
  }

  // ------------------------------------------------------------ importing ---

  function populateUploadOptions() {
    $("#visitTypeSelect").innerHTML = registry.visitTemplates
      .map(
        (template) =>
          `<option value="${escapeHtml(template.id)}">${escapeHtml(template.title)}</option>`,
      )
      .join("");
  }

  function updateUploadPreview() {
    $("#uploadPreview").innerHTML = state.selectedFiles
      .map(
        (file, index) =>
          `<figure><img src="${escapeHtml(URL.createObjectURL(file))}" alt="${escapeHtml(file.name)}" style="transform:rotate(${state.selectedFileRotations[index] || 0}deg)" /><span class="upload-rotation-label">${state.selectedFileRotations[index] || 0}度</span><button type="button" data-rotate-upload="${index}" aria-label="90度回転">↻</button><button type="button" data-remove-upload="${index}" aria-label="削除">×</button></figure>`,
      )
      .join("");
    const disabled = !state.selectedFiles.length || state.importing;
    $("#addWithoutAnalysisButton").disabled = disabled;
    $("#analyzeUploadButton").disabled =
      disabled || !analysisProvider.isConnected();
    $$("[data-remove-upload]").forEach((button) =>
      button.addEventListener("click", () => {
        const index = Number(button.dataset.removeUpload);
        state.selectedFiles.splice(index, 1);
        state.selectedFileRotations.splice(index, 1);
        updateUploadPreview();
      }),
    );
    $$(`[data-rotate-upload]`).forEach((button) =>
      button.addEventListener("click", () => {
        const index = Number(button.dataset.rotateUpload);
        state.selectedFileRotations[index] = rotatePhoto(state.selectedFileRotations[index]);
        updateUploadPreview();
      }),
    );
  }

  function addFiles(/** @type {ArrayLike<File>} */ files) {
    const { accepted, rejected } = selectImageFiles(
      files,
      state.selectedFiles,
      MAX_UPLOAD_BATCH,
    );
    state.selectedFiles.push(...accepted);
    state.selectedFileRotations.push(...accepted.map(() => 0));
    updateUploadPreview();
    if (rejected)
      showToast(
        `重複と非画像を除いて追加しました（一度に${MAX_UPLOAD_BATCH}枚まで）`,
      );
  }

  /**
   * @param {import('../features/photos/photo-import.js').ImportProgress|null} progress
   */
  function renderImportProgress(progress) {
    const panel = $("#importProgress");
    if (!panel) return;
    if (!progress) {
      panel.classList.remove("show");
      return;
    }
    panel.classList.add("show");
    const percent = progress.total
      ? Math.round((progress.done / progress.total) * 100)
      : 0;
    $("#importProgressBar").style.width = `${percent}%`;
    $("#importProgressText").textContent = progress.currentName
      ? `${progress.done} / ${progress.total} 枚：${progress.currentName}`
      : `${progress.done} / ${progress.total} 枚`;
  }

  async function runImport() {
    if (state.importing) return;
    const visit = activeVisit();
    if (!visit) {
      showToast("先に訪問を選んでください");
      return;
    }
    const files = state.selectedFiles.splice(0);
    const rotations = state.selectedFileRotations.splice(0);
    if (!files.length) return;

    state.importing = true;
    state.importAbort = new AbortController();
    $("#cancelImportButton")?.classList.remove("hidden");
    updateUploadPreview();

    const outcome = await importPhotos(files, {
      repository,
      // Photos land in the visit the user is actually looking at — this is the
      // bug Core 1 exists to fix.
      visitId: visit.id,
      domainHint: $("#visitTypeSelect").value || visit.domainPackIds[0] || "other",
      startOrder: visitPhotos().length + 1,
      getRotation: (_file, index) => rotations[index] || 0,
      createId: () => uid("photo"),
      signal: state.importAbort.signal,
      onProgress: renderImportProgress,
      onPhotoSaved: async (record, binary) => {
        // Reflect each photo as soon as it is stored: interrupting keeps these.
        const photo = { ...record, observations: [] };
        setPhotoUrls(photo, binary);
        state.photos.push(photo);
        await flushPersist();
      },
    });

    state.importing = false;
    state.importAbort = null;
    $("#cancelImportButton")?.classList.add("hidden");
    renderImportProgress(null);
    updateUploadPreview();
    renderAll();
    void renderStorageNote();

    if (outcome.storageError) {
      showStorageAlert(outcome.storageError.message);
    }
    if (outcome.added.length) {
      closeModal("uploadModal");
      setOrganizePhoto(outcome.added[0].id);
      switchView("organize");
    }

    const parts = [];
    if (outcome.added.length)
      parts.push(`${outcome.added.length}枚を未整理として追加しました`);
    if (outcome.aborted) parts.push("残りは中止しました");
    if (outcome.failures.length)
      parts.push(`${outcome.failures.length}枚は読み込めませんでした`);
    showToast(parts.join("・") || "追加した写真はありません");
  }

  // --------------------------------------------------------------- JSON io ---

  function currentExportBlob() {
    const document_ = buildExportDocument({
      project: toProject(),
      visit: SAMPLE_VISIT,
      entities: state.entities,
      learningFacts: state.facts,
      collections: SAMPLE_COLLECTIONS,
      quizResults: state.quizResults,
      learningEvents: state.learningEvents,
      userKnowledgeStates: state.userKnowledgeStates,
    });
    return new Blob([JSON.stringify(document_, null, 2)], {
      type: "application/json",
    });
  }

  function exportFilename() {
    return `your-knowledge-${new Date().toISOString().slice(0, 10)}.json`;
  }

  async function exportJson() {
    const result = await shareOrDownload(
      currentExportBlob(),
      exportFilename(),
      "Your Knowledge",
    );
    if (result === "shared") showToast("知識データを共有しました");
    else if (result === "downloaded") showToast("知識データを書き出しました");
  }

  /**
   * Import is deliberately cautious: validate everything first, take a backup,
   * ask, and only then replace state. A bad file must change nothing.
   * @param {File} file
   */
  async function importJson(file) {
    const result = await readProjectFile(file);
    if (!result.ok) {
      showStorageAlert(
        `読み込みを中止しました：${result.reason}　既存のデータはそのままです。`,
      );
      showToast("JSONを読み込めませんでした");
      return;
    }

    const { counts } = result;
    const proceed = window.confirm(
      `写真 ${counts.photos} 件 / 観察対象 ${counts.observations} 件 / 関係 ${counts.relations} 件 を読み込みます。\n\n` +
        "現在の整理内容は置き換わります。読み込み前に、いまのデータを控えとして書き出します。\n続けますか？",
    );
    if (!proceed) {
      showToast("読み込みを中止しました");
      return;
    }

    // Backup first — the user can always get back to where they were.
    const backupName = `your-knowledge-backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    await shareOrDownload(
      currentExportBlob(),
      backupName,
      "Your Knowledge バックアップ",
    );

    const availableIds = new Set(await repository.listPhotoBinaryIds());
    const { project, missingPhotoIds } = documentToProject(
      result.data,
      availableIds,
      DEFAULT_PROJECT_ID,
    );

    try {
      await repository.saveProject(project);
    } catch (error) {
      showStorageAlert(
        error instanceof StorageWriteError
          ? error.message
          : "読み込んだデータを保存できませんでした。",
      );
      return;
    }

    await applyProject(project);
    renderAll();
    renderOrganize();
    renderKnowledge();
    renderLearn();

    showToast(
      missingPhotoIds.length
        ? `読み込みました（${missingPhotoIds.length}枚は写真未接続です）`
        : "JSONを読み込みました",
    );
  }

  // ---------------------------------------------------------------- events ---

  function renderAll() {
    renderVisitBar();
    renderOverview();
    renderPhotos();
    renderCollections();
    if ($("#view-knowledge").classList.contains("active")) renderKnowledge();
    if ($("#view-learn").classList.contains("active")) renderLearn();
  }

  function bindGlobalEvents() {
    window.addEventListener("pagehide", cleanupImageSurfaceObserver, { once: true });
    $$("[data-view]").forEach((button) =>
      button.addEventListener("click", () => switchView(button.dataset.view)),
    );
    $$("[data-jump]").forEach((button) =>
      button.addEventListener("click", (/** @type {Event} */ event) => {
        event.preventDefault();
        switchView(button.dataset.jump);
      }),
    );
    $("#startOrganizeButton").addEventListener("click", () =>
      switchView("organize"),
    );
    $("#viewMapButton").addEventListener("click", () =>
      switchView("knowledge"),
    );
    $("#openTutorialButton")?.addEventListener("click", openTutorial);
    $("#tutorialSkipButton")?.addEventListener("click", finishTutorial);
    $("#tutorialDoneButton")?.addEventListener("click", finishTutorial);
    $("#tutorialNextButton")?.addEventListener("click", () => {
      tutorialIndex = nextTutorialIndex(tutorialIndex);
      renderTutorialStep();
    });
    $("#tutorialBackButton")?.addEventListener("click", () => {
      tutorialIndex = previousTutorialIndex(tutorialIndex);
      renderTutorialStep();
    });
    ["openUploadButton", "photosUploadButton"].forEach((id) =>
      document
        .getElementById(id)
        ?.addEventListener("click", () => openModal("uploadModal")),
    );
    $$("[data-close-modal]").forEach((button) =>
      button.addEventListener("click", () => {
        if (button.dataset.closeModal === "addObservationModal") {
          cancelRegionDrawing({ clearDraft: true });
        }
        closeModal(button.dataset.closeModal);
      }),
    );
    $$(".modal-backdrop").forEach((modal) =>
      modal.addEventListener("click", (/** @type {Event} */ event) => {
        if (event.target === modal) {
          if (modal.id === "addObservationModal") cancelRegionDrawing({ clearDraft: true });
          closeModal(modal.id);
        }
      }),
    );
    document.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if ($("#tutorialModal")?.classList.contains("open")) {
        finishTutorial();
        return;
      }
      if (state.regionDrawing) {
        cancelRegionDrawing({ restoreEditor: true });
        return;
      }
      $$(".modal-backdrop.open").forEach((modal) => {
        if (modal.id === "addObservationModal") cancelRegionDrawing({ clearDraft: true });
        closeModal(modal.id);
      });
    });

    $("#newObservationLabel")?.addEventListener("input", (event) => {
      if (state.observationDraft) state.observationDraft.label = event.target.value;
    });
    $("#newObservationType")?.addEventListener("change", (event) => {
      if (state.observationDraft) state.observationDraft.observationType = event.target.value;
    });
    $$("#newObservationRegion input").forEach((input) =>
      input.addEventListener("change", (event) => {
        if (!state.observationDraft) return;
        state.observationDraft.regionMode = event.target.value;
        if (event.target.value === "whole") state.observationDraft.region = null;
        state.pendingObservationRegion = state.observationDraft.region;
      }),
    );

    $$("[data-photo-filter]").forEach((button) =>
      button.addEventListener("click", () => {
        state.photoFilter = button.dataset.photoFilter;
        $$("[data-photo-filter]").forEach((item) =>
          item.classList.toggle("active", item === button),
        );
        renderPhotos();
      }),
    );

    $("#organizeFromModalButton").addEventListener("click", () => {
      const photoId = state.modalPhotoId;
      closeModal("photoModal");
      if (photoId) setOrganizePhoto(photoId);
      switchView("organize");
    });
    $("#choosePreviewRelationButton")?.addEventListener("click", chooseRelationPreview);
    $("#rotateModalPhotoButton")?.addEventListener("click", () => {
      if (state.modalPhotoId) rotatePhotoById(state.modalPhotoId);
    });
    $("#rotateOrganizePhotoButton")?.addEventListener("click", () => {
      if (state.organizePhotoId) rotatePhotoById(state.organizePhotoId);
    });
    $("#saveObservationButton").addEventListener("click", saveObservation);
    $("#redrawObservationRegionButton")?.addEventListener("click", () => {
      if (state.observationDraft) {
        state.observationDraft.regionMode = "region";
      }
      state.pendingObservationRegion = null;
      startRegionDrawing();
    });
    $("#saveRelationButton")?.addEventListener("click", saveRelation);
    $("#chooseRelationSourceButton")?.addEventListener("click", () => showRelationPicker("source"));
    $("#chooseRelationTargetButton")?.addEventListener("click", () => showRelationPicker("target"));
    $("#relationSourceCard")?.addEventListener("click", (event) => {
      const id = event.target.closest("[data-endpoint-id]")?.dataset.endpointId;
      if (id) showRelationPicker("source");
    });
    $("#relationTargetCard")?.addEventListener("click", (event) => {
      const id = event.target.closest("[data-endpoint-id]")?.dataset.endpointId;
      if (id) showRelationPicker("target");
    });
    $("#relationSourceOptions")?.addEventListener("click", (event) => {
      const selectId = event.target.closest("[data-endpoint-select]")?.dataset.endpointSelect;
      if (selectId) { chooseRelationEndpoint("source", selectId); return; }
      const previewId = event.target.closest("[data-endpoint-preview]")?.dataset.endpointPreview;
      if (previewId) openRelationPreview(previewId);
    });
    $("#relationTargetOptions")?.addEventListener("click", (event) => {
      const selectId = event.target.closest("[data-endpoint-select]")?.dataset.endpointSelect;
      if (selectId) { chooseRelationEndpoint("target", selectId); return; }
      const previewId = event.target.closest("[data-endpoint-preview]")?.dataset.endpointPreview;
      if (previewId) openRelationPreview(previewId);
    });
    $("#relationSourceOptions")?.addEventListener("input", (event) => {
      if (event.target.dataset.endpointSearch !== "source") return;
      state.relationSearch.source = event.target.value;
      renderRelationOptions("source");
      $("#relationSourceOptions input")?.focus();
    });
    $("#relationTargetOptions")?.addEventListener("input", (event) => {
      if (event.target.dataset.endpointSearch !== "target") return;
      state.relationSearch.target = event.target.value;
      renderRelationOptions("target");
      $("#relationTargetOptions input")?.focus();
    });
    $("#swapRelationEndpointsButton")?.addEventListener("click", swapRelationEditorEndpoints);
    $("#relationTypeChoices")?.addEventListener("change", () => {
      if (!state.relationDraft) return;
      const selected = [...document.querySelectorAll("[data-relation-type-choice]:checked")].map((input) => /** @type {any} */ (input)).map((input) => input.dataset.relationTypeChoice).filter(Boolean);
      state.relationDraft.types = selected;
      renderRelationEditor();
    });
    $$("[data-relation-scope]").forEach((button) =>
      button.addEventListener("click", () => {
        state.relationScope = button.dataset.relationScope;
        renderRelationEditor();
      }),
    );
    $("#cancelRegionDrawingButton")?.addEventListener("click", () =>
      cancelRegionDrawing({ restoreEditor: true }),
    );
    $("#previousStepButton").addEventListener("click", () => {
      if (state.organizeStep > 1) {
        state.organizeStep -= 1;
        renderOrganize();
      }
    });
    $("#nextStepButton").addEventListener("click", () => {
      if (state.organizeStep < 4) {
        state.organizeStep += 1;
        renderOrganize();
      } else completeOrganizePhoto();
    });
    $$("#organizeStepper [data-step]").forEach((button) =>
      button.addEventListener("click", () => {
        state.organizeStep = Number(button.dataset.step);
        renderOrganize();
      }),
    );

    $$("#knowledgeModeControl [data-knowledge-mode]").forEach((button) =>
      button.addEventListener("click", () => {
        state.knowledgeMode = button.dataset.knowledgeMode;
        renderKnowledge();
      }),
    );
    $$("#knowledgeViewModeControl [data-knowledge-view-mode]").forEach((button) =>
      button.addEventListener("click", () => {
        state.knowledgeViewMode = button.dataset.knowledgeViewMode;
        renderKnowledge();
      }),
    );
    $$("#knowledgeLayoutControl [data-knowledge-layout]").forEach((button) => button.addEventListener("click", () => { state.knowledgeLayoutMode = button.dataset.knowledgeLayout; renderKnowledge(); }));
    $$("#knowledgeAxisControl [data-knowledge-axis]").forEach((button) =>
      button.addEventListener("click", () => {
        state.knowledgeAxis = button.dataset.knowledgeAxis;
        renderKnowledge();
      }),
    );
    $("#knowledgeSearch").addEventListener(
      "input",
      (/** @type {any} */ event) => {
        state.knowledgeSearch = event.target.value;
        renderKnowledge();
      },
    );

    $$("#deckSwitch [data-deck]").forEach((button) =>
      button.addEventListener("click", () => {
        state.deck = button.dataset.deck;
        resetQuiz();
      }),
    );
    $("#resetQuizButton").addEventListener("click", resetQuiz);

    $("#exportButton").addEventListener("click", () => void exportJson());
    $("#importButton")?.addEventListener("click", () =>
      $("#importInput").click(),
    );
    $("#importInput")?.addEventListener(
      "change",
      (/** @type {any} */ event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) void importJson(file);
      },
    );

    populateUploadOptions();
    $("#fileInput").addEventListener("change", (/** @type {any} */ event) => {
      addFiles(event.target.files);
      event.target.value = "";
    });
    const dropZone = $("#dropZone");
    ["dragenter", "dragover"].forEach((type) =>
      dropZone.addEventListener(type, (/** @type {Event} */ event) => {
        event.preventDefault();
        dropZone.classList.add("dragover");
      }),
    );
    ["dragleave", "drop"].forEach((type) =>
      dropZone.addEventListener(type, (/** @type {Event} */ event) => {
        event.preventDefault();
        dropZone.classList.remove("dragover");
      }),
    );
    dropZone.addEventListener("drop", (/** @type {any} */ event) =>
      addFiles(event.dataTransfer.files),
    );
    $("#addWithoutAnalysisButton").addEventListener(
      "click",
      () => void runImport(),
    );
    $("#analyzeUploadButton").addEventListener("click", async () => {
      const result = await analysisProvider.analyze({
        blob: new Blob(),
        filename: "",
        domainHint: "",
      });
      showToast(result.message || "AI解析は接続されていません");
    });
    $("#cancelImportButton")?.addEventListener("click", () => {
      state.importAbort?.abort();
      showToast("読み込みを中止しています…");
    });
    $("#storageAlertClose")?.addEventListener("click", hideStorageAlert);

    $("#updateNowButton")?.addEventListener(
      "click",
      () => void serviceWorker.applyUpdate(),
    );
    $("#updateLaterButton")?.addEventListener("click", () =>
      $("#updateBanner")?.classList.remove("show"),
    );

    // Never lose a pending write when the tab goes away.
    // ---- visit ----
    $("#visitSwitchButton")?.addEventListener("click", () => {
      renderVisitBar();
      openModal("visitSheet");
    });
    $("#newVisitButton")?.addEventListener("click", () => openVisitEditor(null));
    $("#editVisitButton")?.addEventListener("click", () =>
      openVisitEditor(state.activeVisitId),
    );
    $("#restoreDemoButton")?.addEventListener("click", async () => {
      await restoreDemoVisit();
      closeModal("visitSheet");
      renderAll();
      renderOrganize();
      renderKnowledge();
      renderLearn();
      showToast("デモ訪問を表示しました");
    });
    $("#saveVisitButton")?.addEventListener("click", () => void saveVisitFromEditor());
    $("#deleteVisitButton")?.addEventListener("click", () => void deleteVisit());

    $("#firstRunDemoButton")?.addEventListener("click", async () => {
      await restoreDemoVisit();
      closeModal("firstRunModal");
      renderAll();
      renderOrganize();
      renderKnowledge();
      renderLearn();
    });
    $("#firstRunCreateButton")?.addEventListener("click", () => {
      closeModal("firstRunModal");
      openVisitEditor(null);
    });

    // ---- experience memo (belongs to the Photo, not to an Observation) ----
    $("#experienceMemoInput")?.addEventListener("input", (/** @type {any} */ event) => {
      const photo = currentOrganizePhoto();
      if (!photo) return;
      photo.experienceMemo = event.target.value;
      persist();
    });
    // メモ入力を始めたら、写真ポップアップ（虫眼鏡レンズ／写真モーダル）で
    // 入力欄が隠れないようにする。入力中に何を打っているか見えるようにするため。
    $("#experienceMemoInput")?.addEventListener("focus", () => {
      organizeMagnifierBinding?.reset();
      closeModal("photoModal");
    });

    window.addEventListener("pagehide", () => void flushPersist());
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flushPersist();
    });
  }

  function setupInstallPrompt() {
    const installButton = $("#installPwaButton");
    /** @type {any} */
    let installPrompt = null;
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      installPrompt = event;
      installButton?.classList.remove("hidden");
    });
    installButton?.addEventListener("click", async () => {
      if (!installPrompt) {
        showToast("Chromeのメニューから「ホーム画面に追加」を選んでください");
        return;
      }
      await installPrompt.prompt();
      installPrompt = null;
      installButton.classList.add("hidden");
    });
    window.addEventListener("appinstalled", () => {
      installButton?.classList.add("hidden");
      showToast("Your Knowledgeをホーム画面へ追加しました");
    });
  }

  async function consumeSharedPhotos() {
    const files = await drainSharedPhotos();
    if (!files.length) return;
    addFiles(files);
    openModal("uploadModal");
    showToast(`${files.length}枚をギャラリーから受け取りました`);
    const url = new URL(location.href);
    url.searchParams.delete("shared");
    history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  // ------------------------------------------------------------------ boot ---

  let saved = null;
  try {
    saved = await repository.loadProject(DEFAULT_PROJECT_ID);
  } catch (error) {
    showStorageAlert(
      error instanceof StorageWriteError
        ? error.message
        : "保存済みデータを読み込めませんでした。サンプルのみ表示します。",
    );
  }

  const applied = await applyProject(saved);
  if (!applied.ok) {
    // 移行に失敗したときは旧データを保持したまま、デモだけで起動する。
    showStorageAlert(applied.reason || "保存データを読み込めませんでした。");
    await applyProject(null);
  }

  bindGlobalEvents();
  setupInstallPrompt();
  renderAll();
  renderOrganize();
  renderKnowledge();
  renderLearn();
  if (!maybeShowTutorial()) maybeShowFirstRun();
  void renderStorageNote();
  void consumeSharedPhotos();
}
