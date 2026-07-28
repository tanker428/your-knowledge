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
  SAMPLE_QUIZZES,
  SAMPLE_RELATIONS,
  SAMPLE_STORIES,
  SAMPLE_VISIT,
} from "../data/demo/sample-data.js";

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
 */
export async function initApp(deps) {
  const {
    repository,
    registry,
    lookups,
    analysisProvider,
    storageStatus,
    serviceWorker,
  } = deps;
  const { genericLabel, relationLabel, packLabel, packCategoryLabel } = lookups;

  /** Object URLs handed out for imported photos; revoked when replaced. */
  const objectUrls = new Map();

  const entityMap = new Map(SAMPLE_ENTITIES.map((item) => [item.id, item]));

  // ---------------------------------------------------------------- state ---

  const state = {
    /** @type {any[]} */
    photos: [],
    /** @type {any[]} */
    relations: [],
    /** @type {any[]} */
    facts: [],
    /** @type {any[]} */
    quizResults: [],
    photoFilter: "all",
    /** @type {File[]} */
    selectedFiles: [],
    /** @type {string|null} */
    modalPhotoId: null,
    organizePhotoId: "p03",
    organizeStep: 1,
    /** @type {string|null} */
    activeObservationId: "o03a",
    knowledgeMode: "observed",
    /** @type {string|null} */
    knowledgeObservationId: "o07a",
    knowledgeSearch: "",
    deck: "observed",
    quizIndex: 0,
    quizScore: 0,
    quizAnswered: false,
    quizCompleted: false,
    importing: false,
    /** @type {AbortController|null} */
    importAbort: null,
  };

  /**
   * The demo visit, always present. Saved state is layered on top of it rather
   * than replacing it, so the 20 sample photos survive any storage mishap.
   * @returns {any[]}
   */
  function demoPhotos() {
    return clone(SAMPLE_PHOTOS).map((/** @type {any} */ photo) => ({
      ...photo,
      visitId: SAMPLE_VISIT.id,
      src: `assets/${photo.file}`,
      thumbSrc: `assets/${photo.file}`,
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

  /**
   * @param {import('../repositories/knowledge-repository.js').Project|null} saved
   */
  async function applyProject(saved) {
    const photos = demoPhotos();
    const relations = clone(SAMPLE_RELATIONS);
    const facts = clone(LEARNING_FACTS);

    if (saved) {
      for (const savedPhoto of saved.photos || []) {
        const target = photos.find((photo) => photo.id === savedPhoto.id);
        if (target) {
          target.status = savedPhoto.status || target.status;
          if (Array.isArray(savedPhoto.observations)) {
            target.observations = savedPhoto.observations.map(
              (/** @type {any} */ observation) => ({
                photoId: target.id,
                ...observation,
              }),
            );
          }
        } else if (savedPhoto.source === "upload") {
          photos.push({
            ...savedPhoto,
            observations: savedPhoto.observations || [],
          });
        }
      }
      if (Array.isArray(saved.relations) && saved.relations.length) {
        relations.splice(0, relations.length, ...saved.relations);
      }
      for (const savedFact of saved.facts || []) {
        const target = facts.find(
          (/** @type {any} */ fact) => fact.id === savedFact.id,
        );
        if (target) target.status = savedFact.status;
      }
      state.quizResults = saved.quizResults || [];
    }

    state.photos = photos;
    state.relations = relations;
    state.facts = facts;
    await attachImportedPhotoUrls();
    normaliseSelection();
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

  /** Keep the "currently selected" ids pointing at something that still exists. */
  function normaliseSelection() {
    if (!photoById(state.organizePhotoId))
      state.organizePhotoId = state.photos[0]?.id || null;
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
      updatedAt: Date.now(),
      photos: state.photos.map((photo) => ({
        id: photo.id,
        visitId: photo.visitId,
        file: photo.file,
        order: photo.order,
        title: photo.title,
        status: photo.status,
        source: photo.source,
        domainHint: photo.domainHint,
        rotation: photo.rotation,
        observations: photo.observations,
      })),
      relations: state.relations,
      facts: state.facts.map((/** @type {any} */ fact) => ({
        id: fact.id,
        status: fact.status,
      })),
      quizResults: state.quizResults,
    };
  }

  /** Coalesce the many small edits the organise screen produces into one write. */
  function persist() {
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

  function allObservations({ includedOnly = false } = {}) {
    return state.photos.flatMap((photo) =>
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

  const factById = (/** @type {string} */ id) =>
    state.facts.find((/** @type {any} */ f) => f.id === id);
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
    const learned = state.facts.filter(factUnlocked).length;
    $("#statPhotos").textContent = state.photos.length;
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
    const filtered = state.photos.filter((photo) => {
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
              <img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="${escapeHtml(photo.title)}" loading="lazy" ${photo.rotation ? `style="transform:rotate(${photo.rotation}deg) scale(.82)"` : ""} />
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
          <span>${index + 1}</span>
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

  function openPhotoModal(/** @type {string} */ photoId) {
    const photo = photoById(photoId);
    if (!photo) return;
    state.modalPhotoId = photoId;
    $("#modalImage").src = photo.src;
    $("#modalImage").alt = photo.title;
    $("#modalImage").style.transform = photo.rotation
      ? `rotate(${photo.rotation}deg) scale(.82)`
      : "";
    $("#modalStatus").textContent = STATUS_LABELS[photo.status] || "未整理";
    const observations = photo.observations.filter(
      (/** @type {any} */ item) => item.included !== false,
    );
    $("#modalCount").textContent = `${observations.length}の観察対象`;
    $("#modalTitle").textContent = photo.title;
    renderOverlay($("#modalOverlay"), photo, { modal: true });
    $("#modalObservations").innerHTML = observations
      .map(
        (/** @type {any} */ observation, /** @type {number} */ index) => `
      <article><span class="observation-number">${index + 1}</span><div><strong>${escapeHtml(observation.label)}</strong><small>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || "")}</small><div class="mini-tag-list">${observation.genericCategories.map((/** @type {string} */ id) => `<span>${escapeHtml(genericLabel(id))}</span>`).join("")}</div></div></article>`,
      )
      .join("");
    openModal("photoModal");
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
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }

  function setOrganizePhoto(/** @type {string} */ photoId) {
    const photo = photoById(photoId);
    if (!photo) return;
    state.organizePhotoId = photoId;
    state.organizeStep = 1;
    state.activeObservationId =
      photo.observations.find(
        (/** @type {any} */ item) => item.included !== false,
      )?.id || null;
    renderOrganize();
  }

  function renderOrganizeStrip() {
    $("#organizePhotoStrip").innerHTML = state.photos
      .map(
        (photo) => `
      <button class="strip-photo ${photo.id === state.organizePhotoId ? "active" : ""}" data-organize-photo="${escapeHtml(photo.id)}" title="${escapeHtml(photo.title)}">
        <img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" /><span>${photo.order}</span><i class="status-dot status-${escapeHtml(photo.status)}"></i>
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
        <button class="candidate-card ${observation.included !== false ? "selected" : ""} ${observation.id === state.activeObservationId ? "focused" : ""}" data-toggle-observation="${escapeHtml(observation.id)}">
          <span class="candidate-check">${observation.included !== false ? "✓" : "+"}</span>
          <span class="observation-number">${index + 1}</span>
          <span><strong>${escapeHtml(observation.label)}</strong><small>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || "")}・${observation.origin === "user" ? "自分で追加" : `AI候補 ${Math.round((observation.confidence || 0) * 100)}%`}</small></span>
        </button>`,
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
    return state.relations.filter(
      (/** @type {any} */ relation) =>
        ids.has(relation.sourceId) || ids.has(relation.targetId),
    );
  }

  function relationCard(/** @type {any} */ relation) {
    const source = observationById(relation.sourceId);
    const target = observationById(relation.targetId);
    if (!source || !target) return "";
    return `
      <article class="relation-candidate ${relation.status === "confirmed" ? "confirmed" : relation.status === "rejected" ? "rejected" : ""}">
        <div class="relation-objects"><span>${escapeHtml(source.observation.label)}</span><b>${escapeHtml(relationLabel(relation.type))}</b><span>${escapeHtml(target.observation.label)}</span></div>
        <small>${escapeHtml(source.photo.title)} → ${escapeHtml(target.photo.title)}・候補 ${Math.round((relation.confidence || 0) * 100)}%</small>
        <div><button data-relation-action="confirm" data-relation-id="${escapeHtml(relation.id)}">✓ 採用</button><button data-relation-action="reject" data-relation-id="${escapeHtml(relation.id)}">× 外す</button></div>
      </article>`;
  }

  function renderStepFour(/** @type {any} */ photo) {
    const relations = relevantRelations(photo);
    return `
      <div class="assistant-message"><span class="assistant-avatar">Y</span><div><strong>最後に、対象同士の関係だけを確認します。</strong><p>同じ展示、説明している、部分と全体、同じテーマなどを複数設定できます。</p></div></div>
      <div class="relation-list">${relations.length ? relations.map(relationCard).join("") : '<div class="empty-state"><strong>関係候補はまだありません</strong><p>この写真は対象の分類だけで保存できます。</p></div>'}</div>
      ${relations.length ? '<div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-relations">候補を一括承認</button><span>誤った候補だけ外してください</span></div>' : ""}`;
  }

  function renderOrganize() {
    const photo = currentOrganizePhoto();
    if (!photo) return;
    renderOrganizeStrip();
    $("#organizePhotoTitle").textContent = photo.title;
    $("#organizeImage").src = photo.src;
    $("#organizeImage").style.transform = photo.rotation
      ? `rotate(${photo.rotation}deg) scale(.82)`
      : "";
    renderOverlay($("#observationOverlay"), photo, { interactive: true });

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
          relevantRelations(photo).forEach((/** @type {any} */ relation) => {
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
      openModal("addObservationModal"),
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

  function saveManualObservation() {
    const label = $("#newObservationLabel").value.trim();
    if (!label) {
      showToast("短い名前を入力してください");
      return;
    }
    const photo = currentOrganizePhoto();
    const observation = {
      id: uid("observation"),
      photoId: photo.id,
      label,
      observationType: $("#newObservationType").value,
      region: null,
      genericCategories: ["unknown"],
      learningRoles: ["direct"],
      domainPacks: [photo.domainHint || SAMPLE_VISIT.domainHints[0] || "other"],
      domainCategories: [],
      confidence: 1,
      status: "confirmed",
      visibleText: [],
      included: true,
      origin: "user",
      entityId: null,
    };
    photo.observations.push(observation);
    photo.status = "in-progress";
    state.activeObservationId = observation.id;
    $("#newObservationLabel").value = "";
    closeModal("addObservationModal");
    persist();
    renderOrganize();
    showToast("観察対象を追加しました");
  }

  function renderKnowledge() {
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
        <img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" /><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(photo.title)}</small></span><i>${item.status === "confirmed" ? "✓" : "?"}</i>
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
    renderKnowledgeFocus();
  }

  function renderKnowledgeFocus() {
    const found = observationById(state.knowledgeObservationId);
    if (!found) {
      $("#knowledgeFocus").innerHTML =
        '<div class="empty-state large"><strong>観察対象を選択してください</strong></div>';
      return;
    }
    const { observation, photo } = found;
    const relations = state.relations.filter(
      (/** @type {any} */ relation) =>
        relation.status === "confirmed" &&
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
      <div class="knowledge-map-header"><div><span class="source-badge">${sourceBadge}</span><h2>${escapeHtml(observation.label)}</h2><p>${learnedMode ? "確認済みの観察対象に、あとから追加したLearningFactです。" : `${escapeHtml(photo.title)}の中で確認した観察対象です。`}</p></div><button class="ghost-button dark" data-open-photo="${escapeHtml(photo.id)}">元写真を見る</button></div>
      <div class="focus-map">
        <article class="map-source-card"><small>PHOTO</small><img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="${escapeHtml(photo.title)}" /><strong>${escapeHtml(photo.title)}</strong></article>
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
                  return `<button class="relation-link" data-focus-related="${escapeHtml(otherId)}"><span>${escapeHtml(relationLabel(relation.type))}</span><strong>${escapeHtml(other?.observation.label || "")}</strong><small>${escapeHtml(other?.photo.title || "")}</small></button>`;
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
    if (deck === "observed")
      return SAMPLE_QUIZZES.filter(
        (/** @type {any} */ quiz) =>
          quiz.level === "observed" && quizUsesConfirmedData(quiz),
      );
    return SAMPLE_QUIZZES.filter(
      (/** @type {any} */ quiz) =>
        quiz.level === "learned" && factUnlocked(factById(quiz.requiredFactId)),
    );
  }

  function renderLearn() {
    $("#deckSummary").innerHTML =
      `<span><strong>${deckQuizzes("observed").length}</strong>見た知識の問題</span><span><strong>${deckQuizzes("learned").length}</strong>追加学習の問題</span>`;
    $$("#deckSwitch [data-deck]").forEach((button) =>
      button.classList.toggle("active", button.dataset.deck === state.deck),
    );
    renderQuiz();
    renderStories();
  }

  function renderQuiz() {
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
        <div class="quiz-image"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title)}" /></div>
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
      state.quizResults.push({
        deck: state.deck,
        score: state.quizScore,
        total: quizzes.length,
        completedAt: new Date().toISOString(),
      });
      persist();
    }
    renderQuiz();
  }

  function resetQuiz() {
    state.quizIndex = 0;
    state.quizScore = 0;
    state.quizAnswered = false;
    state.quizCompleted = false;
    renderQuiz();
  }

  function renderStories() {
    $("#storyGrid").innerHTML = SAMPLE_STORIES.map(
      (/** @type {any} */ story, /** @type {number} */ index) => {
        const photos = story.photoIds.map(photoById).filter(Boolean);
        return `<article class="story-card compact-story"><div class="story-gallery">${photos
          .slice(0, 3)
          .map(
            (/** @type {any} */ photo) =>
              `<img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" />`,
          )
          .join(
            "",
          )}<span class="story-number">0${index + 1}</span></div><div class="story-copy"><small>${escapeHtml(story.subtitle)}</small><h3>${escapeHtml(story.title)}</h3><p>${escapeHtml(story.description)}</p><div class="story-steps">${story.steps.map((/** @type {string} */ step, /** @type {number} */ i) => `<div class="story-step"><span>${i + 1}</span>${escapeHtml(step)}</div>`).join("")}</div></div></article>`;
      },
    ).join("");
  }

  function collectionProgress(/** @type {any} */ collection) {
    const photos = collection.photoIds.map(photoById).filter(Boolean);
    const observationIds = new Set(
      photos.flatMap((/** @type {any} */ photo) =>
        photo.observations
          .filter((/** @type {any} */ item) => item.included !== false)
          .map((/** @type {any} */ item) => item.id),
      ),
    );
    const observations = photos.flatMap((/** @type {any} */ photo) =>
      photo.observations.filter(
        (/** @type {any} */ item) => item.included !== false,
      ),
    );
    const relations = state.relations.filter(
      (/** @type {any} */ relation) =>
        observationIds.has(relation.sourceId) ||
        observationIds.has(relation.targetId),
    );
    const facts = collection.factIds.map(factById).filter(Boolean);
    const stages = [
      { label: "発見", complete: photos.length > 0, optional: false },
      {
        label: "整理",
        complete:
          photos.length > 0 &&
          photos.every((/** @type {any} */ p) => p.status === "organized"),
        optional: false,
      },
      {
        label: "分類",
        complete:
          observations.length > 0 &&
          observations.every(
            (/** @type {any} */ item) =>
              item.genericCategories.length && item.domainCategories.length,
          ),
        optional: false,
      },
      {
        label: "関係付け",
        complete: relations.some(
          (/** @type {any} */ relation) => relation.status === "confirmed",
        ),
        optional: false,
      },
      {
        label: "学習",
        complete: facts.length ? facts.every(factUnlocked) : false,
        optional: !facts.length,
      },
    ];
    const denominator = stages.filter((stage) => !stage.optional).length;
    const completed = stages.filter(
      (stage) => stage.complete && !stage.optional,
    ).length;
    return {
      stages,
      percent: denominator ? Math.round((completed / denominator) * 100) : 0,
      photos,
    };
  }

  function renderCollections() {
    $("#collectionGrid").innerHTML = SAMPLE_COLLECTIONS.map(
      (/** @type {any} */ collection) => {
        const progress = collectionProgress(collection);
        return `<article class="collection-card"><div class="collection-cover">${progress.photos
          .slice(0, 3)
          .map(
            (/** @type {any} */ photo) =>
              `<img src="${escapeHtml(photo.thumbSrc || photo.src)}" alt="" />`,
          )
          .join(
            "",
          )}<span>${escapeHtml(collection.icon)}</span></div><div class="collection-body"><div class="collection-title-row"><div><small>COLLECTION</small><h3>${escapeHtml(collection.title)}</h3></div><strong>${progress.percent}%</strong></div><div class="collection-progress"><span style="width:${progress.percent}%"></span></div><div class="stage-row">${progress.stages.map((stage) => `<span class="${stage.complete ? "complete" : ""} ${stage.optional ? "optional" : ""}"><i>${stage.complete ? "✓" : stage.optional ? "—" : "○"}</i>${escapeHtml(stage.label)}</span>`).join("")}</div></div></article>`;
      },
    ).join("");

    $("#domainPackGrid").innerHTML = registry.packs
      .filter((item) => item.id !== "other")
      .map((pack) => {
        const categories = packCategories(pack.id).slice(0, 6);
        return `<article class="domain-pack-card"><span class="domain-pack-icon">${escapeHtml(pack.icon)}</span><h3>${escapeHtml(pack.label)}</h3><p>${escapeHtml(pack.description)}</p><div class="mini-tag-list">${categories.map((item) => `<span>${escapeHtml(item.label)}</span>`).join("")}</div></article>`;
      })
      .join("");
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
          `<figure><img src="${escapeHtml(URL.createObjectURL(file))}" alt="${escapeHtml(file.name)}" /><button type="button" data-remove-upload="${index}" aria-label="削除">×</button></figure>`,
      )
      .join("");
    const disabled = !state.selectedFiles.length || state.importing;
    $("#addWithoutAnalysisButton").disabled = disabled;
    $("#analyzeUploadButton").disabled =
      disabled || !analysisProvider.isConnected();
    $$("[data-remove-upload]").forEach((button) =>
      button.addEventListener("click", () => {
        state.selectedFiles.splice(Number(button.dataset.removeUpload), 1);
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
    const files = state.selectedFiles.splice(0);
    if (!files.length) return;

    state.importing = true;
    state.importAbort = new AbortController();
    $("#cancelImportButton")?.classList.remove("hidden");
    updateUploadPreview();

    const outcome = await importPhotos(files, {
      repository,
      visitId: SAMPLE_VISIT.id,
      domainHint: $("#visitTypeSelect").value || "other",
      startOrder: state.photos.length + 1,
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
      entities: SAMPLE_ENTITIES,
      learningFacts: state.facts,
      collections: SAMPLE_COLLECTIONS,
      quizResults: state.quizResults,
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
    renderOverview();
    renderPhotos();
    renderCollections();
    if ($("#view-knowledge").classList.contains("active")) renderKnowledge();
    if ($("#view-learn").classList.contains("active")) renderLearn();
  }

  function bindGlobalEvents() {
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
    ["openUploadButton", "photosUploadButton"].forEach((id) =>
      document
        .getElementById(id)
        ?.addEventListener("click", () => openModal("uploadModal")),
    );
    $$("[data-close-modal]").forEach((button) =>
      button.addEventListener("click", () =>
        closeModal(button.dataset.closeModal),
      ),
    );
    $$(".modal-backdrop").forEach((modal) =>
      modal.addEventListener("click", (/** @type {Event} */ event) => {
        if (event.target === modal) closeModal(modal.id);
      }),
    );
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape")
        $$(".modal-backdrop.open").forEach((modal) => closeModal(modal.id));
    });

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
    $("#addObservationButton").addEventListener("click", () =>
      openModal("addObservationModal"),
    );
    $("#saveObservationButton").addEventListener(
      "click",
      saveManualObservation,
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

  await applyProject(saved);

  bindGlobalEvents();
  setupInstallPrompt();
  renderAll();
  renderOrganize();
  renderKnowledge();
  renderLearn();
  void renderStorageNote();
  void consumeSharedPhotos();
}
