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
} from "../data/demo/sample-data.js";
import { DEMO_KNOWLEDGE_VERSION, DEMO_REFERENCE_FACTS } from "../data/demo/demo-knowledge.js";
import {
  collectVisitCascade,
  copyFactsForProject,
  createQuizResult,
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
  TUTORIAL_STEPS,
  isTutorialSeen,
  markTutorialSeen,
  nextTutorialIndex,
  previousTutorialIndex,
} from "./tutorial.js";
import {
  createRelation,
  isApprovableRelation,
  isDirectedRelation,
  isSelectableObservation,
  relationCandidates,
  RELATION_SCOPES,
  relationReviewActions,
  removeRelation,
  endpointPresentation,
  endpointSelectionLabel,
  relationTypeDisplay,
  scopeForRelationEndpoints,
  searchRelationEntries,
  swapRelationEndpoints,
  updateRelation,
  validateRelationInput,
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
} from "../features/knowledge-graph/selectors.js";
import { describeQuizAvailability, scoreQuizAnswer } from "../features/knowledge-graph/quiz-generation.js";
import { getReferenceChildren, getReferenceNodeById } from "../domain/reference-registry.js";
import { LOCAL_USER_ID, mergeQuizResultsIntoLearningEvents, rebuildUserKnowledgeStates, recordQuizLearning, removeVisitLearningRecords } from "../domain/learning-state.js";
import { getLearnedReferenceFacts } from "../domain/learned-reference-facts.js";
import { buildCollectionProgress } from "../features/collections/collection-progress.js";
import { displayedPointToStoredPoint, normalizePhotoRotation, rotatePhoto, unrotateImagePoint } from "../domain/photo-rotation.js";

const MAX_UPLOAD_BATCH = 120;
const STATUS_LABELS = {
  unorganized: "未整理",
  "in-progress": "整理中",
  organized: "整理済み",
};
const OBSERVATION_TYPE_LABELS = {
  physical: "実体",
  information: "情報表現",
  space: "場所・空間",
  concept: "概念",
  feature: "部分・特徴",
};
const FACT_SOURCE_LABELS = {
  panel: "説明パネルから",
  learning: "追加学習から",
  external: "外部資料から",
  user: "自分のメモ",
};

/** 1x1 transparent gif — placeholder for a photo whose binary is not on this device. */
const MISSING_PHOTO_SRC =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

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
const escapeHtml = (/** @type {unknown} */ value) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (c) =>
      /** @type {any} */ ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[c],
  );
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
    quizRetry: false,
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
  let organizeLensPointerId = null;
  let organizeLensPoint = null;
  let organizeLensLongPressTimer = null;
  let organizeLensLongPressStart = null;
  let organizeLensZoom = 2;
  const ORGANIZE_LENS_MIN_ZOOM = 2;
  const ORGANIZE_LENS_MAX_ZOOM = 6;
  const ORGANIZE_LENS_STEP = 0.5;
  const ORGANIZE_LENS_SIZE = 200;

  /**
   * The bundled demo photos, as records. The migration layers saved state on
   * top of these, so the 20 samples survive any storage mishap.
   * @returns {any[]}
   */
  function demoPhotos() {
    return clone(SAMPLE_PHOTOS).map((/** @type {any} */ photo) => ({
      ...photo,
      visitId: DEMO_VISIT_ID,
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
      demoKnowledgeVersion: DEMO_KNOWLEDGE_VERSION,
      demoVisitSeed: {
        title: SAMPLE_VISIT.title,
        placeName: SAMPLE_VISIT.place,
        domainPackIds: SAMPLE_VISIT.domainHints,
      },
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
    if (viewName !== "organize") hideOrganizeLens();
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
          <span class="observation-number-anchor-${normalizePhotoRotation(photo.rotation)}">${index + 1}</span>
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
    const controls = $("#regionDrawingControls");
    if (controls) controls.classList.toggle("hidden", !state.regionDrawing);
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

  function rotationStyle(rotation) {
    const value = normalizePhotoRotation(rotation);
    return value ? `transform:rotate(${value}deg) scale(.82)` : "";
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

  function clearOrganizeLensTimer() {
    if (organizeLensLongPressTimer !== null) clearTimeout(organizeLensLongPressTimer);
    organizeLensLongPressTimer = null;
    organizeLensLongPressStart = null;
  }

  function hideOrganizeLens() {
    clearOrganizeLensTimer();
    organizeMagnifierActive = false;
    organizeLensPointerId = null;
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
    const size = Math.max(120, Math.min(ORGANIZE_LENS_SIZE, containerRect.width - 8, containerRect.height - 8));
    const x = Math.min(baseRect.left + baseRect.width, Math.max(baseRect.left, point.x));
    const y = Math.min(baseRect.top + baseRect.height, Math.max(baseRect.top, point.y));
    const left = Math.min(Math.max(0, x - containerRect.left - size / 2), Math.max(0, containerRect.width - size));
    const top = Math.min(Math.max(0, y - containerRect.top - size / 2), Math.max(0, containerRect.height - size));
    const rotation = normalizePhotoRotation(currentOrganizePhoto()?.rotation);
    const visualPoint = {
      x: (x - baseRect.left) / baseRect.width,
      y: (y - baseRect.top) / baseRect.height,
    };
    const imagePoint = unrotateImagePoint(visualPoint, rotation);
    const unrotatedWidth = rotation === 90 || rotation === 270
      ? baseRect.height
      : baseRect.width;
    const unrotatedHeight = rotation === 90 || rotation === 270
      ? baseRect.width
      : baseRect.height;
    const vectorX = (imagePoint.x - 0.5) * unrotatedWidth * organizeLensZoom;
    const vectorY = (imagePoint.y - 0.5) * unrotatedHeight * organizeLensZoom;
    const rotatedVector = rotation === 90
      ? { x: -vectorY, y: vectorX }
      : rotation === 180
        ? { x: -vectorX, y: -vectorY }
        : rotation === 270
          ? { x: vectorY, y: -vectorX }
          : { x: vectorX, y: vectorY };
    lens.style.width = `${size}px`;
    lens.style.height = `${size}px`;
    lens.style.left = `${left}px`;
    lens.style.top = `${top}px`;
    lensImage.src = $("#organizeImage")?.src || lensImage.src;
    lensImage.style.width = `${unrotatedWidth * organizeLensZoom}px`;
    lensImage.style.height = `${unrotatedHeight * organizeLensZoom}px`;
    lensImage.style.transformOrigin = "50% 50%";
    lensImage.style.transform = `rotate(${rotation}deg)`;
    lensImage.style.left = `${left + size / 2 - rotatedVector.x - unrotatedWidth * organizeLensZoom / 2}px`;
    lensImage.style.top = `${top + size / 2 - rotatedVector.y - unrotatedHeight * organizeLensZoom / 2}px`;
    $("#imageMagnifierLevel").textContent = `${organizeLensZoom.toFixed(1)}×`;
    if (controls) {
      controls.style.left = `${Math.min(Math.max(0, left + size - 76), Math.max(0, containerRect.width - 76))}px`;
      controls.style.top = `${top + size + 8 <= containerRect.height ? top + size + 8 : Math.max(0, top - 42)}px`;
    }
    lens.classList.remove("hidden");
    controls?.classList.remove("hidden");
  }

  function renderOrganizeMagnifier() {
    if (organizeMagnifierActive && organizeLensPoint) updateOrganizeLens(organizeLensPoint);
    else {
      $("#imageMagnifierLens")?.classList.add("hidden");
      $("#imageMagnifierControls")?.classList.add("hidden");
    }
  }

  function setOrganizeLensZoom(direction) {
    organizeLensZoom = Math.min(
      ORGANIZE_LENS_MAX_ZOOM,
      Math.max(ORGANIZE_LENS_MIN_ZOOM, Math.round((organizeLensZoom + direction * ORGANIZE_LENS_STEP) * 10) / 10),
    );
    if (organizeLensPoint) updateOrganizeLens(organizeLensPoint);
  }

  function bindMagnifierLens() {
    const container = $("#annotatedPhoto");
    if (!container || container.dataset.magnifierBound) return;
    container.dataset.magnifierBound = "true";
    container.addEventListener("contextmenu", (/** @type {MouseEvent} */ event) => {
      const baseRect = organizeBaseRect();
      const target = /** @type {Element|null} */ (event.target);
      const inImage = baseRect
        && event.clientX >= baseRect.left
        && event.clientX <= baseRect.left + baseRect.width
        && event.clientY >= baseRect.top
        && event.clientY <= baseRect.top + baseRect.height;
      if (inImage || target?.closest("#observationOverlay, #regionDrawLayer")) event.preventDefault();
    });
    container.addEventListener("wheel", (/** @type {WheelEvent} */ event) => {
      if (!organizeMagnifierActive) return;
      event.preventDefault();
      setOrganizeLensZoom(event.deltaY < 0 ? 1 : -1);
    }, { passive: false });
    container.addEventListener("pointerdown", (/** @type {PointerEvent} */ event) => {
      const target = /** @type {Element|null} */ (event.target);
      if (target?.closest("#imageMagnifierControls") || state.regionDrawing || organizeInteractionMode === "region") return;
      const baseRect = organizeBaseRect();
      if (!baseRect
        || event.clientX < baseRect.left
        || event.clientX > baseRect.left + baseRect.width
        || event.clientY < baseRect.top
        || event.clientY > baseRect.top + baseRect.height) return;
      if (event.pointerType === "mouse") {
        if (event.button !== 2) return;
        organizeMagnifierActive = true;
        organizeLensPointerId = event.pointerId;
        organizeLensPoint = { x: event.clientX, y: event.clientY };
        container.setPointerCapture(event.pointerId);
        event.preventDefault();
        alignOrganizeSurfaces();
        return;
      }
      organizeLensLongPressStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      clearOrganizeLensTimer();
      organizeLensLongPressStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      organizeLensLongPressTimer = setTimeout(() => {
        if (!organizeLensLongPressStart || organizeLensLongPressStart.pointerId !== event.pointerId) return;
        organizeMagnifierActive = true;
        organizeLensPointerId = event.pointerId;
        organizeLensPoint = { x: event.clientX, y: event.clientY };
        container.setPointerCapture(event.pointerId);
        event.preventDefault();
        alignOrganizeSurfaces();
      }, 350);
    });
    container.addEventListener("pointermove", (/** @type {PointerEvent} */ event) => {
      if (organizeMagnifierActive && event.pointerId === organizeLensPointerId) {
        organizeLensPoint = { x: event.clientX, y: event.clientY };
        updateOrganizeLens(organizeLensPoint);
        event.preventDefault();
        return;
      }
      if (organizeLensLongPressStart?.pointerId === event.pointerId && Math.hypot(
        event.clientX - organizeLensLongPressStart.x,
        event.clientY - organizeLensLongPressStart.y,
      ) > 10) clearOrganizeLensTimer();
    });
    const endLens = (/** @type {PointerEvent} */ event) => {
      if (event.pointerId === organizeLensPointerId || event.pointerType === "mouse") {
        event.preventDefault();
        hideOrganizeLens();
      }
      else if (organizeLensLongPressStart?.pointerId === event.pointerId) clearOrganizeLensTimer();
    };
    container.addEventListener("pointerup", endLens);
    container.addEventListener("pointercancel", endLens);
    container.addEventListener("pointerleave", (/** @type {PointerEvent} */ event) => {
      if (event.pointerType === "mouse") hideOrganizeLens();
    });
    window.addEventListener("blur", hideOrganizeLens);
    $("#imageMagnifierInButton")?.addEventListener("click", () => setOrganizeLensZoom(1));
    $("#imageMagnifierOutButton")?.addEventListener("click", () => setOrganizeLensZoom(-1));
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
      showToast("短い名前を入力してください");
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
    $("#modalImage").style.transform = rotationStyle(photo.rotation);
    $("#modalOverlay").style.transform = rotationStyle(photo.rotation);
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
      <article><span class="observation-number">${index + 1}</span><div><strong>${escapeHtml(observation.label)}</strong><small>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || "")}</small><div class="mini-tag-list">${observation.genericCategories.map((/** @type {string} */ id) => `<span>${escapeHtml(genericLabel(id))}</span>`).join("")}</div></div></article>`,
      )
      .join("");
    const chooseButton = $("#choosePreviewRelationButton");
    chooseButton?.classList.toggle("hidden", !state.relationPreviewObservationId);
    if (chooseButton) chooseButton.textContent = state.relationPicker === "source" ? "この対象を関係元に選ぶ" : "この対象を関係先に選ぶ";
    openModal("photoModal");
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
    openModal("relationEditorModal");
  }

  function openModal(/** @type {string} */ id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal(/** @type {string} */ id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    if (id === "photoModal") state.relationPreviewObservationId = null;
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function setOrganizePhoto(/** @type {string} */ photoId) {
    const photo = photoById(photoId);
    if (!photo) return;
    cancelRegionDrawing({ clearDraft: true });
    state.organizePhotoId = photoId;
    organizeMagnifierActive = false;
    clearOrganizeLensTimer();
    organizeLensPointerId = null;
    organizeLensPoint = null;
    organizeLensZoom = ORGANIZE_LENS_MIN_ZOOM;
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
    const analysed = photo.source === "sample";
    const intro = analysed
      ? "<strong>この写真から複数の対象を見つけました。</strong><p>一つだけを中心に決める必要はありません。保存したい対象をすべて残し、不要な候補だけ外してください。</p>"
      : `<strong>この写真はまだ解析していません。</strong><p>${escapeHtml(analysisProvider.isConnected() ? "" : "AI解析は接続されていません。")}写真に写っている対象を手動で追加してください。一枚から複数追加できます。</p>`;
    return `
      <div class="assistant-message"><span class="assistant-avatar">Y</span><div>${intro}</div></div>
      <div class="candidate-list">${photo.observations
        .map(
          (/** @type {any} */ observation, /** @type {number} */ index) => `
        <article class="candidate-card ${observation.included !== false ? "selected" : ""} ${observation.id === state.activeObservationId ? "focused" : ""}">
          <button class="candidate-main" data-toggle-observation="${escapeHtml(observation.id)}">
            <span class="candidate-check">${observation.included !== false ? "✓" : "+"}</span>
            <span class="observation-number">${index + 1}</span>
            <span><strong>${escapeHtml(observation.label)}</strong><small>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || "")}・${observation.origin === "user" ? "自分で追加" : `AI候補 ${Math.round((observation.confidence || 0) * 100)}%`}</small></span>
          </button>
          <span class="candidate-actions"><button type="button" data-edit-observation="${escapeHtml(observation.id)}" aria-label="${escapeHtml(observation.label)}を編集">編集</button><button type="button" data-delete-observation="${escapeHtml(observation.id)}" aria-label="${escapeHtml(observation.label)}を削除">削除</button></span>
        </article>`,
        )
        .join("")}</div>
      ${photo.observations.length ? "" : '<div class="empty-state"><strong>対象がまだありません</strong><p>下のボタンから、写真に写っているものを追加してください。</p></div>'}
      <div class="quick-action-row"><button class="ghost-button dark" data-bulk-action="include-all">すべて残す</button><button class="text-button" id="stepAddObservation">＋ 対象を追加</button></div>`;
  }

  function chipButton(
    /** @type {string} */ id,
    /** @type {string} */ label,
    /** @type {boolean} */ selected,
    /** @type {string} */ type,
  ) {
    return `<button class="label-chip ${selected ? "selected" : ""}" data-chip-type="${escapeHtml(type)}" data-chip-id="${escapeHtml(id)}">${selected ? "✓ " : ""}${escapeHtml(label)}</button>`;
  }

  function renderStepTwo(
    /** @type {any} */ photo,
    /** @type {any} */ observation,
  ) {
    if (!observation)
      return '<div class="empty-state"><strong>対象がありません</strong><p>ステップ1で対象を追加してください。</p></div>';
    return `
      <div class="assistant-message"><span class="assistant-avatar">Y</span><div><strong>まず、場所を問わず使える汎用分類を確認します。</strong><p>「何が写っているか」と「学習上どんな役割か」は複数選択できます。</p></div></div>
      ${renderObservationTabs(photo)}
      <div class="classification-block"><h3>${escapeHtml(observation.label)}</h3><small>対象の形式</small><div class="chip-grid">${registry.genericCategories.map((item) => chipButton(item.id, `${item.icon} ${item.label}`, observation.genericCategories.includes(item.id), "generic")).join("")}</div></div>
      <div class="classification-block"><small>学習上の役割</small><div class="chip-grid roles">${registry.learningRoles.map((item) => chipButton(item.id, item.label, observation.learningRoles.includes(item.id), "role")).join("")}</div></div>
      <div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-generic">全対象の汎用分類を一括確認</button><span>曖昧な対象だけ個別に直せます</span></div>`;
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
      <div class="assistant-message"><span class="assistant-avatar">Y</span><div><strong>次に、訪問分野に合わせた浅い分類を確認します。</strong><p>年代や細かな特徴はまだ質問しません。分野パックを足せば、別の場所にも同じ手順が使えます。</p></div></div>
      ${renderObservationTabs(photo)}
      <div class="classification-block"><h3>${escapeHtml(observation.label)}</h3><small>分野パック</small><div class="chip-grid domains">${registry.packs.map((item) => chipButton(item.id, `${item.icon} ${item.label}`, observation.domainPacks.includes(item.id), "domain")).join("")}</div></div>
      <div class="classification-block"><small>分野別の浅い分類</small><div class="chip-grid">${categoryButtons.map((item) => `<button class="label-chip ${observation.domainCategories.includes(item.id) ? "selected" : ""}" data-chip-type="domain-category" data-chip-domain="${escapeHtml(item.packId)}" data-chip-id="${escapeHtml(item.id)}">${observation.domainCategories.includes(item.id) ? "✓ " : ""}${escapeHtml(item.label)}</button>`).join("") || '<p class="muted-copy">分野パックを選択してください。</p>'}</div></div>
      <div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-domain">全対象の分野分類を一括確認</button><span>具体名は明確な場合だけ任意で追加します</span></div>`;
  }

  function relevantRelations(/** @type {any} */ photo) {
    const ids = new Set(
      photo.observations.map((/** @type {any} */ item) => item.id),
    );
    const visitIds = activeVisitObservationIds();
    return state.relations.filter(
      (/** @type {any} */ relation) =>
        visitIds.has(relation.sourceId) &&
        visitIds.has(relation.targetId) &&
        (ids.has(relation.sourceId) || ids.has(relation.targetId)),
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

  function optionMarkup(entry) {
    const presentation = endpointPresentation(entry);
    const regionStyle = presentation.region
      ? `left:${presentation.region.x}%;top:${presentation.region.y}%;width:${presentation.region.w}%;height:${presentation.region.h}%;`
      : "";
    return `<button type="button" class="endpoint-option" data-endpoint-option="${escapeHtml(entry.observation.id)}"><span class="endpoint-image">${rotatedPhotoFrame(entry.photo, `<img src="${escapeHtml(entry.photo.thumbSrc || entry.photo.src)}" alt="" />${presentation.region ? `<i class="endpoint-region" style="${regionStyle}"></i>` : '<em class="endpoint-whole-label">写真全体</em>'}`)}</span><span><strong>${escapeHtml(entry.observation.label)}</strong><small>${escapeHtml(entry.photo.title)}・#${escapeHtml(entry.photo.order)}・${escapeHtml(OBSERVATION_TYPE_LABELS[entry.observation.observationType] || "観察対象")}</small></span></button>`;
  }

  function renderRelationOptions(/** @type {"source"|"target"} */ kind) {
    const options = $(kind === "source" ? "#relationSourceOptions" : "#relationTargetOptions");
    if (!options) return;
    const query = state.relationSearch[kind];
    const entries = kind === "source"
      ? relationEntriesForVisit()
      : relationCandidates({ photos: state.photos, activeVisitId: state.activeVisitId, sourceId: state.relationDraft.sourceId, scope: state.relationScope });
    const filtered = searchRelationEntries(entries, query);
    options.innerHTML = `<input class="endpoint-search" type="search" placeholder="写真名・Observation名で検索" value="${escapeHtml(query)}" data-endpoint-search="${kind}" />${filtered.length ? filtered.map(optionMarkup).join("") : '<p class="muted-copy">該当する候補はありません。</p>'}`;
    options.classList.toggle("hidden", state.relationPicker !== kind);
  }

  function renderRelationEditor() {
    const draft = state.relationDraft;
    if (!draft) return;
    const sourceEntry = relationEntryById(draft.sourceId);
    const targetEntry = relationEntryById(draft.targetId);
    $("#relationSourceCard").innerHTML = endpointMarkup(sourceEntry);
    $("#relationTargetCard").innerHTML = endpointMarkup(targetEntry);
    $("#chooseRelationSourceButton").textContent = endpointSelectionLabel("source", Boolean(sourceEntry));
    $("#chooseRelationTargetButton").textContent = endpointSelectionLabel("target", Boolean(targetEntry));
    $("#relationTypeSelect").innerHTML = registry.relationTypes
      .map((type) => `<option value="${escapeHtml(type.id)}">${escapeHtml(relationTypeDisplay(type).optionLabel)}</option>`)
      .join("");
    $("#relationTypeSelect").value = draft.type;
    $("#relationTypeChoices").innerHTML = registry.relationTypes.map((type) => `<label class="relation-type-choice"><input type="checkbox" data-relation-type-choice="${escapeHtml(type.id)}" ${(draft.types || [draft.type]).includes(type.id) ? "checked" : ""} />${escapeHtml(relationTypeDisplay(type).optionLabel)}</label>`).join("");
    const selectedType = relationType(draft.type);
    const selectedTypeDisplay = relationTypeDisplay(selectedType);
    $("#relationTypeDirectionHint").textContent = selectedType
      ? `${selectedTypeDisplay.label}・${selectedTypeDisplay.directionLabel}`
      : "";
    renderRelationOptions("source");
    renderRelationOptions("target");
    const swapButton = $("#swapRelationEndpointsButton");
    swapButton.classList.toggle("hidden", !selectedType?.directed);
    $("#relationDirectionNote").textContent = selectedType
      ? selectedType.directed
        ? "有向Relation：関係元が関係先へ向かう方向で保存します。"
        : "無向Relation：関係元と関係先を入れ替えても同じ関係として扱います。"
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
      type: existing?.type || registry.relationTypes[0]?.id || "",
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
    if (!state.relationDraft || !isDirectedRelation(registry.relationTypes, state.relationDraft.type)) return;
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
    const selectedTypes = [...document.querySelectorAll("[data-relation-type-choice]:checked")].map((input) => /** @type {any} */ (input)).map((input) => input.dataset.relationTypeChoice).filter(Boolean);
    const types = selectedTypes.length ? selectedTypes : [$("#relationTypeSelect").value];
    const candidates = types.map((type) => ({ ...state.relationDraft, type }));
    const reason = candidates.map((candidate) => validateRelationInput(state.relations, candidate, registry.relationTypes, state.editingRelationId)).find(Boolean);
    if (reason) { showToast(reason); return; }
    if (state.editingRelationId) {
      const index = state.relations.findIndex(
        (relation) => relation.id === state.editingRelationId,
      );
      if (index >= 0)
        state.relations[index] = updateRelation(state.relations[index], candidates[0]);
    } else {
      candidates.forEach((candidate) => state.relations.push({ ...createRelation({ ...candidate, id: uid("relation") }) }));
    }
    closeModal("relationEditorModal");
    state.editingRelationId = null;
    state.relationDraft = null;
    persist();
    renderOrganize();
    renderKnowledge();
    renderCollections();
    showToast(wasEditing ? "関係を更新しました" : "関係を保存しました");
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
        <span class="observation-number">${index + 1}</span><span><strong>${escapeHtml(observation.label)}</strong><small>${observation.genericCategories.map(genericLabel).join("・") || "汎用分類なし"}</small><em>${packId ? `${packLabel(packId)} / ${observation.domainCategories.map((/** @type {string} */ id) => packCategoryLabel(packId, id)).join("・")}` : "分野未設定"}</em></span><i>${observation.status === "confirmed" ? "✓" : "候補"}</i>
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

    $("#stepAddObservation")?.addEventListener("click", () =>
      openObservationEditor(null),
    );
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
    $("#redrawObservationRegionButton")?.addEventListener("click", () => {
      if (state.observationDraft) {
        state.observationDraft.regionMode = "region";
      }
      state.pendingObservationRegion = null;
      startRegionDrawing();
    });
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
          <article><small>汎用分類</small><div class="mini-tag-list">${observation.genericCategories.map((/** @type {string} */ id) => `<span>${escapeHtml(genericLabel(id))}</span>`).join("")}</div></article>
          <article><small>分野別の浅い分類</small><div class="mini-tag-list accent">${observation.domainCategories.map((/** @type {string} */ id) => `<span>${escapeHtml(packCategoryLabel(packId, id))}</span>`).join("") || "<span>未設定</span>"}</div></article>
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
    const focus = state.knowledgeObservationId ? buildObservationFocusGraph(view.source, `Observation:${state.knowledgeObservationId}`, referenceData?.graph) : null;
    const base = state.knowledgeViewMode === "focus" && focus ? focus : view?.overview;
    const expandedReferenceIds = [...state.knowledgeExpanded].filter((id) => id.startsWith("reference:")).map((id) => id.slice("reference:".length));
    const expanded = base ? expandReferenceGraphNodes(base, referenceData?.graph, expandedReferenceIds) : null;
    const graph = expanded ? filterGraphByAxis(expanded, state.knowledgeAxis) : null;
    $$("#knowledgeViewModeControl [data-knowledge-view-mode]").forEach((button) => button.classList.toggle("active", button.dataset.knowledgeViewMode === state.knowledgeViewMode));
    $$("#knowledgeLayoutControl [data-knowledge-layout]").forEach((button) => button.classList.toggle("active", button.dataset.knowledgeLayout === state.knowledgeLayoutMode));
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
    const relationSection = relations.length ? `<section class="kg-relation-strip"><div class="kg-group-title"><span>↔</span><strong>関係</strong><small>${relations.length}</small></div>${relations.map((edge) => `<button class="kg-relation-row" data-kg-node="${escapeHtml(edge.targetId)}"><span>${edge.directed === false ? "↔" : "→"}</span><strong>${escapeHtml(nodeLabel(graph, edge.sourceId))}</strong><em>${escapeHtml(edge.relationType || "RELATES_TO")}</em><strong>${escapeHtml(nodeLabel(graph, edge.targetId))}</strong></button>`).join("")}</section>` : "";
    const backButton = state.knowledgeViewMode === "focus" ? '<button class="text-button" data-kg-overview>← 訪問全体へ戻る</button>' : "";
    return `<div class="kg-canvas-header"><span>DISPLAY GRAPH</span><strong>${state.knowledgeViewMode === "focus" ? "Observation詳細・1ホップ" : "訪問全体"}</strong><span class="kg-header-actions">${backButton}</span></div>${sections}${relationSection}`;
  }

  function renderKnowledgeRadial(graph) {
    const centerId = state.knowledgeViewMode === "focus" ? `Observation:${state.knowledgeObservationId}` : `Visit:${state.activeVisitId}`;
    const displayGraph = graph;
    const layout = buildRadialLayout(displayGraph, centerId);
    const positionMap = new Map(layout.nodes.map((node) => /** @type {[string, any]} */ ([node.id, node])));
    const edgeMarkup = layout.edges.map((edge) => {
      const source = positionMap.get(edge.sourceId);
      const target = positionMap.get(edge.targetId);
      if (!source || !target) return "";
      const arrow = edge.type === "RELATES_TO" && (edge.directed === true || (edge.directed == null && isDirectedRelation(registry.relationTypes, edge.relationType))) ? " marker-end=\"url(#kg-arrow)\"" : "";
      return `<line class="kg-svg-edge ${edge.type === "RELATES_TO" ? "relation" : "reference"}" x1="${source.x}" y1="${source.y}" x2="${target.x}" y2="${target.y}"${arrow} />`;
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
      return `<g class="kg-svg-node kg-svg-${node.type.toLowerCase()} ${selected ? "selected" : ""}" data-kg-node="${escapeHtml(node.id)}">${shape}${image}${region}${imageClose}<text x="${position.x}" y="${position.y + 43}" text-anchor="middle">${escapeHtml(shortGraphLabel(node.label || node.title || node.predicate || node.referenceId || node.type))}</text>${referenceAction}<title>${escapeHtml(node.label || node.title || node.predicate || node.referenceId || node.type)}</title></g>`;
    }).join("");
    const zoom = state.knowledgeZoom;
    const backButton = state.knowledgeViewMode === "focus" ? '<button class="text-button" data-kg-overview>← 訪問全体へ戻る</button>' : "";
    return `<div class="kg-canvas-header"><span>RADIAL GRAPH</span><strong>${state.knowledgeViewMode === "focus" ? "Observation詳細・1ホップ" : "訪問全体"}</strong><span class="kg-header-actions">${backButton}</span></div><div class="kg-zoom-controls"><button data-kg-zoom="out" aria-label="縮小">−</button><button data-kg-zoom="reset" aria-label="中央へ戻す">100%</button><button data-kg-zoom="in" aria-label="拡大">＋</button></div><svg class="kg-radial-svg" viewBox="0 0 ${layout.width} ${layout.height}" role="img" aria-label="知識グラフ"><defs><marker id="kg-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker></defs><g transform="translate(${layout.centerX} ${layout.centerY}) scale(${zoom}) translate(-${layout.centerX} -${layout.centerY})">${edgeMarkup}${nodeMarkup}</g></svg>`;
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
    const card = `<button class="kg-node-card kg-shape-${node.type.toLowerCase()}" data-kg-node="${escapeHtml(node.id)}">${image}<span class="kg-node-icon">${knowledgeNodeIcon(node.type)}</span><strong>${escapeHtml(node.label || node.title || node.predicate || node.referenceId || node.type)}</strong><small>${escapeHtml(knowledgeNodeLabel(node.type))}</small></button>`;
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
    const referenceEditor = node.type === "Observation" || node.type === "Entity" ? renderReferenceFactEditor(node) : "";
    const photoMarkup = photo ? rotatedPhotoFrame(photo, `<img src="${escapeHtml(photo.src || photo.thumbSrc || MISSING_PHOTO_SRC)}" alt="${escapeHtml(photo.title)}" />`) : "";
    return `<div class="kg-detail-header"><span>${knowledgeNodeIcon(node.type)} ${escapeHtml(knowledgeNodeLabel(node.type))}</span><h2>${escapeHtml(node.label || node.title || node.predicate || node.referenceId || node.type)}</h2>${photo ? `<button class="ghost-button dark" data-open-photo="${escapeHtml(photo.id)}">元写真を見る</button>` : ""}</div>${photo ? `<div class="kg-detail-photo">${photoMarkup}<strong>${escapeHtml(photo.title)}</strong></div>` : ""}${referenceEditor}<div class="kg-detail-meta"><p>接続 ${detail.incoming.length + detail.outgoing.length}件</p>${detail.outgoing.map((edge) => `<button data-kg-node="${escapeHtml(edge.targetId)}">→ ${escapeHtml(nodeLabel(graph, edge.targetId))}</button>`).join("")}${detail.incoming.map((edge) => `<button data-kg-node="${escapeHtml(edge.sourceId)}">← ${escapeHtml(nodeLabel(graph, edge.sourceId))}</button>`).join("")}</div>`;
  }

  function renderReferenceFactEditor(node) {
    const references = (referenceData?.graph?.nodes || []).filter((item) => item.status === "verified" && item.quizEligible !== false && item.internalOnly !== true && item.visible !== false).sort((a, b) => a.axis.localeCompare(b.axis) || a.order - b.order || a.id.localeCompare(b.id));
    if (!references.length) return '<div class="kg-reference-editor"><strong>確認済みの知識を設定できません</strong><p>確認済みの分類・時代が読み込まれていません。</p></div>';
    return `<form class="kg-reference-editor" data-reference-fact-form="${escapeHtml(node.id)}"><strong>この対象の正しい分類・時代を登録</strong><p>クイズや知識マップで正解として使う、確認済みの情報を登録します。</p><label>分類・時代<select name="referenceId" required>${references.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.axis === "taxonomy" ? "分類" : "時代")}：${escapeHtml(item.label)}</option>`).join("")}</select></label><label>情報の根拠（任意）<input name="sourceNote" placeholder="確認した資料や展示説明" /></label><button class="primary-button small" type="submit">確認済みの知識を追加</button></form>`;
  }

  function nodeLabel(graph, nodeId) { const node = getKnowledgeGraphNodeDetail(graph, nodeId)?.node; return node?.label || node?.title || nodeId; }
  function knowledgeNodeLabel(type) { return { User: "利用者", Visit: "訪問", Photo: "写真", Observation: "観察対象", Entity: "関連する対象", ReferenceFact: "確認済みの知識", ReferenceNode: "参照分類・時代", GenericCategory: "汎用分類", DomainCategory: "分野分類", LearningRole: "学習役割" }[type] || type; }
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
      const reference = getReferenceNodeById(referenceData?.graph, String(formData.get("referenceId") || ""));
      const nodeId = form.dataset.referenceFactForm || "";
      if (!reference || (!nodeId.startsWith("Observation:") && !nodeId.startsWith("Entity:"))) return;
      const target = nodeId.startsWith("Observation:") ? { targetObservationId: nodeId.slice("Observation:".length) } : { subjectId: nodeId.slice("Entity:".length) };
      state.referenceFacts.push({ id: uid("reference-fact"), ...target, predicate: reference.axis === "taxonomy" ? "classifiedAs" : "livedDuring", value: reference.id, axis: reference.axis, sourceType: "curated", sourceNote: String(formData.get("sourceNote") || ""), status: "verified" });
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

  function quizUsesConfirmedData(/** @type {any} */ quiz) {
    const observationIds = quiz.requiredObservationIds || [];
    const relationIds = quiz.requiredRelationIds || [];
    const observationsReady = observationIds.every(
      (/** @type {string} */ id) => {
        const found = observationById(id);
        return (
          found?.observation.status === "confirmed" &&
          found.observation.included !== false
        );
      },
    );
    const relationsReady = relationIds.every((/** @type {string} */ id) =>
      state.relations.some(
        (/** @type {any} */ relation) =>
          relation.id === id && relation.status === "confirmed",
      ),
    );
    return (
      (observationIds.length > 0 || relationIds.length > 0) &&
      observationsReady &&
      relationsReady
    );
  }

  function deckQuizzes(/** @type {string} */ deck) {
    if (deck !== "observed" || !state.activeVisitId) return [];
    return describeQuizAvailability(toProject(), state.activeVisitId, registry, referenceData?.graph).questions;
  }

  function renderLearn() {
    $("#deckSummary").innerHTML =
      `<span><strong>${deckQuizzes("observed").length}</strong>Knowledge Graph問題</span>`;
    $$("#deckSwitch [data-deck]").forEach((button) =>
      button.classList.toggle("active", button.dataset.deck === state.deck),
    );
    renderQuiz();
    renderStories();
  }

  function renderLegacyQuiz() {
    const quizzes = deckQuizzes(state.deck);
    const total = quizzes.length;
    $("#quizScore").textContent = state.quizScore;
    $("#quizTotal").textContent = `/ ${total}`;
    const degree = total
      ? Math.round((Math.min(state.quizIndex, total) / total) * 360)
      : 0;
    $("#quizRing").style.background =
      `conic-gradient(var(--accent) ${degree}deg, rgba(255,255,255,.12) ${degree}deg)`;

    if (!total) {
      $("#quizStage").innerHTML =
        `<div class="locked-deck"><span>🔒</span><h2>追加学習の問題はまだありません</h2><p>知識マップで対象を選び、「詳しく学ぶ」を押すと問題が解放されます。</p><button class="primary-button" id="goKnowledgeButton">知識マップへ</button></div>`;
      $("#goKnowledgeButton").addEventListener("click", () =>
        switchView("knowledge"),
      );
      return;
    }

    if (state.quizCompleted || state.quizIndex >= total) {
      $("#quizStage").innerHTML =
        `<div class="quiz-finished"><div class="finish-mark">✓</div><h2>${state.quizScore} / ${total} 正解</h2><p>${state.deck === "observed" ? "写真の整理と関係をよく振り返れています。" : "後から学んだ知識が定着してきました。"}</p><button class="primary-button" id="finishRestartButton">もう一度挑戦</button></div>`;
      $("#finishRestartButton").addEventListener("click", resetQuiz);
      return;
    }

    const quiz = quizzes[state.quizIndex];
    const photo = photoById(quiz.photoId);
    $("#quizStage").innerHTML = `
      <article class="quiz-card">
        <div class="quiz-image"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title)}" style="${rotationStyle(photo.rotation)}" /></div>
        <div class="quiz-content"><span class="quiz-counter">${state.deck === "observed" ? "OBSERVED KNOWLEDGE" : "LEARNED KNOWLEDGE"} ${String(state.quizIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span><h2>${escapeHtml(quiz.question)}</h2>
          <div class="quiz-choice-list">${quiz.choices.map((/** @type {string} */ choice, /** @type {number} */ index) => `<button class="choice-button" data-quiz-choice="${index}"><strong>${String.fromCharCode(65 + index)}.</strong> ${escapeHtml(choice)}</button>`).join("")}</div>
          <div id="quizFeedback"></div>
          <div class="quiz-next-row"><small>${escapeHtml(photo.title)}</small><button class="primary-button" id="nextQuizButton" disabled>${state.quizIndex === total - 1 ? "結果を見る" : "次の問題 →"}</button></div>
        </div>
      </article>`;
    state.quizAnswered = false;
    $$("[data-quiz-choice]").forEach((button) =>
      button.addEventListener("click", () =>
        answerQuiz(Number(button.dataset.quizChoice), quizzes),
      ),
    );
    $("#nextQuizButton").addEventListener("click", () => nextQuiz(quizzes));
  }

  function answerQuiz(
    /** @type {number} */ selected,
    /** @type {any[]} */ quizzes,
  ) {
    if (state.quizAnswered) return;
    state.quizAnswered = true;
    const quiz = quizzes[state.quizIndex];
    if (selected === quiz.answer) state.quizScore += 1;
    $("#quizScore").textContent = state.quizScore;
    $$("[data-quiz-choice]").forEach((button, index) => {
      button.disabled = true;
      if (index === quiz.answer) button.classList.add("correct");
      else if (index === selected) button.classList.add("incorrect");
    });
    $("#quizFeedback").innerHTML =
      `<div class="quiz-feedback"><strong>${selected === quiz.answer ? "正解です。" : `正解は「${escapeHtml(quiz.choices[quiz.answer])}」です。`}</strong>${escapeHtml(quiz.explanation)}</div>`;
    $("#nextQuizButton").disabled = false;
  }

  function nextQuiz(/** @type {any[]} */ quizzes) {
    if (!state.quizAnswered) return;
    state.quizIndex += 1;
    if (state.quizIndex >= quizzes.length) {
      state.quizCompleted = true;
      state.quizResults.push(
        createQuizResult(
          {
            deck: state.deck,
            score: state.quizScore,
            total: quizzes.length,
            completedAt: new Date().toISOString(),
          },
          state.activeVisitId,
        ),
      );
      persist();
    }
    renderQuiz();
  }

  function renderQuiz() {
    const quizzes = deckQuizzes(state.deck);
    const total = quizzes.length;
    if (!state.deckAttemptId || state.quizAttemptVisitId !== state.activeVisitId) {
      state.deckAttemptId = uid("deck-attempt");
      state.quizAttemptVisitId = state.activeVisitId;
      state.quizIndex = 0;
      state.quizCompleted = false;
    }
    const storedResults = new Map(state.quizResults.filter((result) => result.visitId === state.activeVisitId && result.deckAttemptId === state.deckAttemptId && result.quizId).map((result) => [result.quizId, result]));
    state.quizScore = quizzes.filter((quiz) => storedResults.get(quiz.id)?.correct).length;
    $("#quizScore").textContent = state.quizScore;
    $("#quizTotal").textContent = `/ ${total}`;
    const degree = total ? Math.round((Math.min(state.quizIndex, total) / total) * 360) : 0;
    $("#quizRing").style.background = `conic-gradient(var(--accent) ${degree}deg, rgba(255,255,255,.12) ${degree}deg)`;
    if (!total) {
      const availability = state.activeVisitId
        ? describeQuizAvailability(toProject(), state.activeVisitId, registry, referenceData?.graph)
        : { reason: "まず訪問を選択または作成してください。" };
      $("#quizStage").innerHTML = `<div class="locked-deck"><span>∅</span><h2>表示できる問題がありません</h2><p>${escapeHtml(availability.reason || "このデッキには問題がありません。")} 確認済みの観察対象と参照知識を整理すると問題を生成できます。</p><button class="primary-button" id="goKnowledgeButton">知識マップへ</button></div>`;
      $("#goKnowledgeButton").addEventListener("click", () => switchView("knowledge"));
      return;
    }
    if (state.quizCompleted || state.quizIndex >= total) {
      $("#quizStage").innerHTML = `<div class="quiz-finished"><div class="finish-mark">✓</div><h2>${state.quizScore} / ${total} 正解</h2><p>Knowledge Graphから生成した問題を完了しました。</p><button class="primary-button" id="finishRestartButton">もう一度挑戦</button></div>`;
      $("#finishRestartButton").addEventListener("click", resetQuiz);
      return;
    }
    const quiz = quizzes[state.quizIndex];
    const photo = photoById(quiz.photoId);
    const stored = storedResults.get(quiz.id);
    const retrying = state.quizRetry === true;
    state.quizAnswered = Boolean(stored) && !retrying;
    const selectedReferenceId = retrying ? null : stored?.answer?.placements?.find((placement) => placement.cardId === quiz.observationId)?.referenceId || null;
     $("#quizStage").innerHTML = `<article class="quiz-card"><div class="quiz-content"><span class="quiz-counter">${quiz.questionType === "hierarchy" ? "CLASSIFICATION" : quiz.questionType === "timeline-map" ? "GEOLOGICAL TIME" : quiz.questionType === "matching" ? "RELATION" : "OBSERVATION"} ${String(state.quizIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</span><h2>${escapeHtml(quiz.prompt)}</h2><div class="quiz-placement-layout"><div class="quiz-photo-card" draggable="${state.quizAnswered ? "false" : "true"}" data-quiz-card="${escapeHtml(quiz.observationId)}"><img src="${escapeHtml(photo?.src || MISSING_PHOTO_SRC)}" alt="${escapeHtml(photo?.title || "写真")}" />${quiz.region ? `<i style="left:${quiz.region.x}%;top:${quiz.region.y}%;width:${quiz.region.w}%;height:${quiz.region.h}%"></i>` : ""}<strong>${escapeHtml(photo?.title || "写真")}</strong></div>${renderQuizPlacementBoard(quiz, selectedReferenceId, state.quizAnswered)}</div><div id="quizFeedback">${state.quizAnswered ? `<div class="quiz-feedback"><strong>${stored.correct ? "正解です。" : `正解は「${escapeHtml(quiz.options.find((option) => option.id === quiz.targetReferenceId)?.label || quiz.targetReferenceId)}」です。`}</strong>${escapeHtml(quiz.explanation)}</div>` : ""}</div><div class="quiz-next-row"><small>${escapeHtml(photo?.title || "写真")}</small>${state.quizAnswered ? `<button class="ghost-button" id="retryQuizButton">もう一度回答</button>` : ""}<button class="primary-button" id="nextQuizButton" ${state.quizAnswered ? "" : "disabled"}>${state.quizIndex === total - 1 ? "結果を見る" : "次の問題 →"}</button></div></div></article>`;
    $$('[data-quiz-drop]').forEach((button) => {
      button.addEventListener("click", () => answerGeneratedQuiz(quiz, button.dataset.quizDrop));
      button.addEventListener("dragover", (event) => event.preventDefault());
      button.addEventListener("drop", (event) => { event.preventDefault(); answerGeneratedQuiz(quiz, button.dataset.quizDrop); });
    });
    $("[data-quiz-card]")?.addEventListener("dragstart", (event) => event.dataTransfer?.setData("text/plain", quiz.observationId));
    $("#retryQuizButton")?.addEventListener("click", () => { state.quizRetry = true; renderQuiz(); });
    $("#nextQuizButton").addEventListener("click", () => nextGeneratedQuiz(quizzes));
  }

  function renderQuizPlacementBoard(/** @type {any} */ quiz, /** @type {string|null} */ selectedReferenceId, /** @type {boolean} */ answered) {
    const options = [...quiz.options];
    if (quiz.questionType === "hierarchy") {
      const depth = (option) => {
        let value = 0;
        let current = option;
        const seen = new Set();
        while (current?.parentIds?.length && !seen.has(current.id)) {
          seen.add(current.id);
          const parent = options.find((item) => current.parentIds.includes(item.id));
          if (!parent) break;
          value += 1;
          current = parent;
        }
        return value;
      };
      return `<div class="quiz-hierarchy-board" aria-label="分類樹">${options.map((option) => `<button class="quiz-placement quiz-tree-node ${selectedReferenceId === option.id ? (answered ? "correct" : "selected") : ""}" style="--tree-depth:${depth(option)}" data-quiz-drop="${escapeHtml(option.id)}" ${answered ? "disabled" : ""}>${escapeHtml(option.label)}${option.labelEn ? `<small>${escapeHtml(option.labelEn)}</small>` : ""}</button>`).join("")}</div>`;
    }
    if (quiz.questionType !== "timeline-map") {
      return `<div class="quiz-choice-board" aria-label="候補一覧">${options.map((option) => { const optionPhoto = option.photoId ? photoById(option.photoId) : null; return `<button class="quiz-placement quiz-choice-option ${selectedReferenceId === option.id ? (answered ? "correct" : "selected") : ""}" data-quiz-drop="${escapeHtml(option.id)}" ${answered ? "disabled" : ""}>${optionPhoto ? `<img src="${escapeHtml(optionPhoto.src || MISSING_PHOTO_SRC)}" alt="" style="${rotationStyle(optionPhoto.rotation)}" />` : ""}<span>${escapeHtml(option.label)}</span></button>`; }).join("")}</div>`;
    }
    const sorted = options.sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
    return `<div class="quiz-timeline-board" aria-label="地質時代の時間軸"><div class="quiz-time-axis"><span>古い</span><i></i><span>新しい</span></div><div class="quiz-time-slots">${sorted.map((option) => `<button class="quiz-placement quiz-time-slot ${selectedReferenceId === option.id ? (answered ? "correct" : "selected") : ""}" data-quiz-drop="${escapeHtml(option.id)}" ${answered ? "disabled" : ""}><strong>${escapeHtml(option.label)}</strong><small>${option.startMa == null ? "" : `${option.startMa} Ma`} ${option.endMa == null ? "" : `〜 ${option.endMa} Ma`}</small></button>`).join("")}</div></div>`;
  }

  function answerGeneratedQuiz(/** @type {any} */ quiz, /** @type {string} */ referenceId) {
    if (state.quizAnswered) return;
    const result = scoreQuizAnswer(quiz, { placements: [{ cardId: quiz.observationId, referenceId }] });
    const answeredAt = new Date().toISOString();
    const quizResult = { id: uid("quiz-result"), deckAttemptId: state.deckAttemptId, attemptId: uid("quiz-attempt"), visitId: state.activeVisitId, quizId: quiz.id, quizType: quiz.questionType, referenceFactId: quiz.referenceFactId, answer: result.answer, score: result.score, correct: result.correct, answeredAt, completedAt: answeredAt };
    state.quizResults.push(quizResult);
    const learning = recordQuizLearning({ events: state.learningEvents, states: state.userKnowledgeStates, result: quizResult, userId: state.userId });
    state.learningEvents = learning.events;
    state.userKnowledgeStates = learning.states;
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
    if (state.quizIndex >= quizzes.length) state.quizCompleted = true;
    renderQuiz();
  }

  void quizUsesConfirmedData;
  void renderLegacyQuiz;

  function resetQuiz() {
    state.deckAttemptId = uid("deck-attempt");
    state.quizAttemptVisitId = state.activeVisitId;
    state.quizIndex = 0;
    state.quizScore = 0;
    state.quizAnswered = false;
    state.quizCompleted = false;
    state.quizRetry = false;
    renderQuiz();
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
    const collectionProject = { ...toProject(), photos: state.photos };
    const collections = buildCollectionProgress(
      collectionProject,
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
    const step = TUTORIAL_STEPS[tutorialIndex];
    if (!step) return;
    $("#tutorialScreen").textContent = step.screen;
    $("#tutorialTitle").textContent = step.title;
    $("#tutorialDescription").textContent = step.description;
    $("#tutorialProgress").textContent = `${tutorialIndex + 1} / ${TUTORIAL_STEPS.length}`;
    $("#tutorialBackButton").disabled = tutorialIndex === 0;
    $("#tutorialNextButton").classList.toggle(
      "hidden",
      tutorialIndex === TUTORIAL_STEPS.length - 1,
    );
    $("#tutorialDoneButton").classList.toggle(
      "hidden",
      tutorialIndex !== TUTORIAL_STEPS.length - 1,
    );
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
      const id = event.target.closest("[data-endpoint-option]")?.dataset.endpointOption;
      if (id) openRelationPreview(id);
    });
    $("#relationTargetOptions")?.addEventListener("click", (event) => {
      const id = event.target.closest("[data-endpoint-option]")?.dataset.endpointOption;
      if (id) openRelationPreview(id);
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
    $("#relationTypeSelect")?.addEventListener("change", (event) => {
      if (state.relationDraft) state.relationDraft.type = event.target.value;
      renderRelationEditor();
    });
    $("#relationTypeChoices")?.addEventListener("change", () => {
      if (!state.relationDraft) return;
      const selected = [...document.querySelectorAll("[data-relation-type-choice]:checked")].map((input) => /** @type {any} */ (input)).map((input) => input.dataset.relationTypeChoice).filter(Boolean);
      state.relationDraft.types = selected;
      if (selected[0]) state.relationDraft.type = selected[0];
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
        renderLearn();
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
