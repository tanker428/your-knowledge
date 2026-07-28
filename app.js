(() => {
  'use strict';

  const STORAGE_KEY = 'your-knowledge-v2';
  const SHARED_PHOTO_DB = 'your-knowledge-shared-photos';
  const SHARED_PHOTO_STORE = 'incoming';
  const MAX_UPLOAD_BATCH = 120;
  const AI_ANALYZE_ENDPOINT = '';
  const STATUS_LABELS = { unorganized: '未整理', 'in-progress': '整理中', organized: '整理済み' };
  const OBSERVATION_TYPE_LABELS = { physical: '実体', information: '情報表現', space: '場所・空間', concept: '概念', feature: '部分・特徴' };
  const FACT_SOURCE_LABELS = { panel: '説明パネルから', learning: '追加学習から', external: '外部資料から', user: '自分のメモ' };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clone = value => JSON.parse(JSON.stringify(value));
  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const categoryMap = new Map(window.GENERIC_CATEGORIES.map(item => [item.id, item]));
  const domainMap = new Map(window.DOMAIN_PACKS.map(item => [item.id, item]));
  const relationTypeMap = new Map(window.RELATION_TYPES.map(item => [item.id, item]));
  const domainCategoryMaps = Object.fromEntries(Object.entries(window.DOMAIN_CATEGORIES).map(([domain, list]) => [domain, new Map(list.map(item => [item.id, item]))]));
  const entityMap = new Map(window.SAMPLE_ENTITIES.map(item => [item.id, item]));

  function loadInitialState() {
    const photos = clone(window.SAMPLE_PHOTOS).map(photo => ({
      ...photo,
      visitId: window.SAMPLE_VISIT.id,
      src: (window.EMBEDDED_ASSETS && window.EMBEDDED_ASSETS[photo.file]) || `assets/${photo.file}`,
      source: 'sample',
      observations: photo.observations.map(observation => ({ photoId: photo.id, included: true, ...observation }))
    }));
    const relations = clone(window.SAMPLE_RELATIONS);
    const facts = clone(window.LEARNING_FACTS);

    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved?.photos) {
        saved.photos.forEach(savedPhoto => {
          const target = photos.find(photo => photo.id === savedPhoto.id);
          if (!target) return;
          target.status = savedPhoto.status || target.status;
          if (Array.isArray(savedPhoto.observations)) {
            target.observations = savedPhoto.observations.map(observation => ({ photoId: target.id, ...observation }));
          }
        });
      }
      if (Array.isArray(saved?.relations)) {
        relations.splice(0, relations.length, ...saved.relations);
      }
      if (Array.isArray(saved?.facts)) {
        saved.facts.forEach(savedFact => {
          const target = facts.find(fact => fact.id === savedFact.id);
          if (target) target.status = savedFact.status;
        });
      }
    } catch (error) {
      console.warn('保存データを読み込めませんでした。', error);
    }

    return {
      photos,
      relations,
      facts,
      photoFilter: 'all',
      selectedFiles: [],
      modalPhotoId: null,
      organizePhotoId: 'p03',
      organizeStep: 1,
      activeObservationId: 'o03a',
      knowledgeMode: 'observed',
      knowledgeObservationId: 'o07a',
      knowledgeSearch: '',
      deck: 'observed',
      quizIndex: 0,
      quizScore: 0,
      quizAnswered: false,
      quizCompleted: false
    };
  }

  const state = loadInitialState();

  function persist() {
    const payload = {
      photos: state.photos.filter(photo => photo.source === 'sample').map(photo => ({ id: photo.id, status: photo.status, observations: photo.observations })),
      relations: state.relations,
      facts: state.facts.map(fact => ({ id: fact.id, status: fact.status }))
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('ブラウザへ保存できませんでした。', error);
    }
  }

  function allObservations({ includedOnly = false } = {}) {
    return state.photos.flatMap(photo => photo.observations
      .filter(observation => !includedOnly || observation.included !== false)
      .map(observation => ({ ...observation, photoId: photo.id })));
  }

  function photoById(id) { return state.photos.find(photo => photo.id === id); }
  function observationById(id) {
    for (const photo of state.photos) {
      const observation = photo.observations.find(item => item.id === id);
      if (observation) return { observation, photo };
    }
    return null;
  }
  function factById(id) { return state.facts.find(fact => fact.id === id); }
  function genericLabel(id) { return categoryMap.get(id)?.label || id; }
  function domainLabel(id) { return domainMap.get(id)?.label || id; }
  function domainCategoryLabel(domainId, categoryId) {
    return domainCategoryMaps[domainId]?.get(categoryId)?.label || categoryId;
  }
  function relationLabel(type) { return relationTypeMap.get(type)?.label || type; }
  function factUnlocked(fact) { return fact?.status === 'learned'; }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  function switchView(viewName) {
    $$('.view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
    $$('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === viewName));
    if (viewName === 'photos') renderPhotos();
    if (viewName === 'organize') renderOrganize();
    if (viewName === 'knowledge') renderKnowledge();
    if (viewName === 'learn') renderLearn();
    if (viewName === 'collection') renderCollections();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function countConfirmedObservations() {
    return allObservations({ includedOnly: true }).filter(item => item.status === 'confirmed').length;
  }

  function renderOverview() {
    const observations = allObservations({ includedOnly: true });
    const learned = state.facts.filter(factUnlocked).length;
    $('#statPhotos').textContent = state.photos.length;
    $('#statObservations').textContent = observations.length;
    $('#statConfirmed').textContent = countConfirmedObservations();
    $('#statLearned').textContent = learned;
    $('#heroObservationCount').textContent = `${observations.length}の観察対象`;

    $('#visitTemplateGrid').innerHTML = window.VISIT_TEMPLATES.map(template => `
      <article class="visit-template-card">
        <span class="visit-template-icon">${escapeHtml(template.icon)}</span>
        <div><h3>${escapeHtml(template.title)}</h3><p>${escapeHtml(template.description)}</p></div>
        <span class="template-state">${template.id === 'paleontology' ? 'サンプルあり' : '同じ基盤で対応'}</span>
      </article>`).join('');
  }

  function renderPhotos() {
    const filtered = state.photos.filter(photo => {
      if (state.photoFilter === 'all') return true;
      if (state.photoFilter === 'multi') return photo.observations.filter(item => item.included !== false).length > 1;
      return photo.status === state.photoFilter;
    });

    $('#photoGrid').innerHTML = filtered.length ? filtered.map(photo => {
      const observations = photo.observations.filter(item => item.included !== false);
      const categoryIds = [...new Set(observations.flatMap(item => item.genericCategories))].slice(0, 3);
      return `
        <article class="photo-card">
          <button class="photo-card-button" data-photo-id="${escapeHtml(photo.id)}">
            <div class="photo-thumb">
              <img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title)}" loading="lazy" ${photo.rotation ? `style="transform:rotate(${photo.rotation}deg) scale(.82)"` : ''} />
              <span class="photo-order">${String(photo.order || 0).padStart(2, '0')}</span>
              <span class="photo-status status-${escapeHtml(photo.status)}">${escapeHtml(STATUS_LABELS[photo.status] || '未整理')}</span>
            </div>
            <div class="photo-card-body">
              <div class="photo-card-meta"><span>${observations.length} 対象</span><span>${observations.filter(item => item.status === 'confirmed').length} 確認済み</span></div>
              <h3>${escapeHtml(photo.title)}</h3>
              <div class="mini-tag-list">${categoryIds.map(id => `<span>${escapeHtml(genericLabel(id))}</span>`).join('') || '<span>対象未登録</span>'}</div>
            </div>
          </button>
        </article>`;
    }).join('') : '<div class="empty-state"><strong>該当する写真はありません</strong><p>別の絞り込みを選択してください。</p></div>';

    $$('[data-photo-id]').forEach(button => button.addEventListener('click', () => openPhotoModal(button.dataset.photoId)));
  }

  function renderOverlay(root, photo, options = {}) {
    const { interactive = false, modal = false } = options;
    const observations = photo.observations.filter(item => item.included !== false);
    root.innerHTML = observations.map((observation, index) => {
      if (!observation.region) return `
        <button class="whole-observation-chip ${observation.id === state.activeObservationId ? 'active' : ''}" style="top:${8 + index * 34}px" data-overlay-observation="${escapeHtml(observation.id)}" ${interactive ? '' : 'tabindex="-1"'}>
          ${index + 1}. ${escapeHtml(observation.label)}
        </button>`;
      const { x, y, w, h } = observation.region;
      return `
        <button class="observation-box ${observation.id === state.activeObservationId ? 'active' : ''}" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%" data-overlay-observation="${escapeHtml(observation.id)}" aria-label="${escapeHtml(observation.label)}" ${interactive ? '' : 'tabindex="-1"'}>
          <span>${index + 1}</span>
        </button>`;
    }).join('');

    if (interactive) {
      $$('[data-overlay-observation]', root).forEach(button => button.addEventListener('click', () => {
        state.activeObservationId = button.dataset.overlayObservation;
        renderOrganize();
      }));
    }
    if (modal) root.classList.add('modal-overlay-active');
  }

  function openPhotoModal(photoId) {
    const photo = photoById(photoId);
    if (!photo) return;
    state.modalPhotoId = photoId;
    $('#modalImage').src = photo.src;
    $('#modalImage').alt = photo.title;
    $('#modalImage').style.transform = photo.rotation ? `rotate(${photo.rotation}deg) scale(.82)` : '';
    $('#modalStatus').textContent = STATUS_LABELS[photo.status] || '未整理';
    const observations = photo.observations.filter(item => item.included !== false);
    $('#modalCount').textContent = `${observations.length}の観察対象`;
    $('#modalTitle').textContent = photo.title;
    renderOverlay($('#modalOverlay'), photo, { modal: true });
    $('#modalObservations').innerHTML = observations.map((observation, index) => `
      <article><span class="observation-number">${index + 1}</span><div><strong>${escapeHtml(observation.label)}</strong><small>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || '')}</small><div class="mini-tag-list">${observation.genericCategories.map(id => `<span>${escapeHtml(genericLabel(id))}</span>`).join('')}</div></div></article>`).join('');
    openModal('photoModal');
  }

  function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  function setOrganizePhoto(photoId) {
    const photo = photoById(photoId);
    if (!photo) return;
    state.organizePhotoId = photoId;
    state.organizeStep = 1;
    state.activeObservationId = photo.observations.find(item => item.included !== false)?.id || null;
    renderOrganize();
  }

  function renderOrganizeStrip() {
    $('#organizePhotoStrip').innerHTML = state.photos.map(photo => `
      <button class="strip-photo ${photo.id === state.organizePhotoId ? 'active' : ''}" data-organize-photo="${escapeHtml(photo.id)}" title="${escapeHtml(photo.title)}">
        <img src="${escapeHtml(photo.src)}" alt="" /><span>${photo.order}</span><i class="status-dot status-${escapeHtml(photo.status)}"></i>
      </button>`).join('');
    $$('[data-organize-photo]').forEach(button => button.addEventListener('click', () => setOrganizePhoto(button.dataset.organizePhoto)));
  }

  function currentOrganizePhoto() { return photoById(state.organizePhotoId); }
  function currentObservation() {
    const photo = currentOrganizePhoto();
    return photo?.observations.find(item => item.id === state.activeObservationId) || photo?.observations.find(item => item.included !== false) || null;
  }

  function renderObservationTabs(photo) {
    const included = photo.observations.filter(item => item.included !== false);
    return `<div class="observation-tabs">${included.map((observation, index) => `
      <button class="${observation.id === state.activeObservationId ? 'active' : ''}" data-select-observation="${escapeHtml(observation.id)}"><span>${index + 1}</span>${escapeHtml(observation.label)}</button>`).join('')}</div>`;
  }

  function renderStepOne(photo) {
    return `
      <div class="assistant-message"><span class="assistant-avatar">D</span><div><strong>この写真から複数の対象を見つけました。</strong><p>一つだけを中心に決める必要はありません。保存したい対象をすべて残し、不要な候補だけ外してください。</p></div></div>
      <div class="candidate-list">${photo.observations.map((observation, index) => `
        <button class="candidate-card ${observation.included !== false ? 'selected' : ''} ${observation.id === state.activeObservationId ? 'focused' : ''}" data-toggle-observation="${escapeHtml(observation.id)}">
          <span class="candidate-check">${observation.included !== false ? '✓' : '+'}</span>
          <span class="observation-number">${index + 1}</span>
          <span><strong>${escapeHtml(observation.label)}</strong><small>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || '')}・AI候補 ${Math.round((observation.confidence || 0) * 100)}%</small></span>
        </button>`).join('')}</div>
      <div class="quick-action-row"><button class="ghost-button dark" data-bulk-action="include-all">すべて残す</button><button class="text-button" id="stepAddObservation">＋ 見落とした対象を追加</button></div>`;
  }

  function chipButton(id, label, selected, type) {
    return `<button class="label-chip ${selected ? 'selected' : ''}" data-chip-type="${escapeHtml(type)}" data-chip-id="${escapeHtml(id)}">${selected ? '✓ ' : ''}${escapeHtml(label)}</button>`;
  }

  function renderStepTwo(photo, observation) {
    if (!observation) return '<div class="empty-state"><strong>対象がありません</strong><p>ステップ1で対象を追加してください。</p></div>';
    return `
      <div class="assistant-message"><span class="assistant-avatar">D</span><div><strong>まず、場所を問わず使える汎用分類を確認します。</strong><p>「何が写っているか」と「学習上どんな役割か」は複数選択できます。</p></div></div>
      ${renderObservationTabs(photo)}
      <div class="classification-block"><h3>${escapeHtml(observation.label)}</h3><small>対象の形式</small><div class="chip-grid">${window.GENERIC_CATEGORIES.map(item => chipButton(item.id, `${item.icon} ${item.label}`, observation.genericCategories.includes(item.id), 'generic')).join('')}</div></div>
      <div class="classification-block"><small>学習上の役割</small><div class="chip-grid roles">${window.LEARNING_ROLES.map(item => chipButton(item.id, item.label, observation.learningRoles.includes(item.id), 'role')).join('')}</div></div>
      <div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-generic">全対象の汎用分類を一括確認</button><span>曖昧な対象だけ個別に直せます</span></div>`;
  }

  function renderStepThree(photo, observation) {
    if (!observation) return '<div class="empty-state"><strong>対象がありません</strong></div>';
    const activeDomains = observation.domainPacks.length ? observation.domainPacks : ['other'];
    const categoryButtons = activeDomains.flatMap(domainId => (window.DOMAIN_CATEGORIES[domainId] || []).map(item => ({ ...item, domainId })));
    return `
      <div class="assistant-message"><span class="assistant-avatar">D</span><div><strong>次に、訪問分野に合わせた浅い分類を確認します。</strong><p>恐竜博物館なら「骨格標本・翼竜」、故宮なら「工芸・陶磁器」のような段階です。年代や細かな特徴はまだ質問しません。</p></div></div>
      ${renderObservationTabs(photo)}
      <div class="classification-block"><h3>${escapeHtml(observation.label)}</h3><small>分野パック</small><div class="chip-grid domains">${window.DOMAIN_PACKS.map(item => chipButton(item.id, `${item.icon} ${item.label}`, observation.domainPacks.includes(item.id), 'domain')).join('')}</div></div>
      <div class="classification-block"><small>分野別の浅い分類</small><div class="chip-grid">${categoryButtons.map(item => `<button class="label-chip ${observation.domainCategories.includes(item.id) ? 'selected' : ''}" data-chip-type="domain-category" data-chip-domain="${escapeHtml(item.domainId)}" data-chip-id="${escapeHtml(item.id)}">${observation.domainCategories.includes(item.id) ? '✓ ' : ''}${escapeHtml(item.label)}</button>`).join('') || '<p class="muted-copy">分野パックを選択してください。</p>'}</div></div>
      <div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-domain">全対象の分野分類を一括確認</button><span>具体名は明確な場合だけ任意で追加します</span></div>`;
  }

  function relevantRelations(photo) {
    const ids = new Set(photo.observations.map(item => item.id));
    return state.relations.filter(relation => ids.has(relation.sourceId) || ids.has(relation.targetId));
  }

  function relationCard(relation) {
    const source = observationById(relation.sourceId);
    const target = observationById(relation.targetId);
    if (!source || !target) return '';
    return `
      <article class="relation-candidate ${relation.status === 'confirmed' ? 'confirmed' : relation.status === 'rejected' ? 'rejected' : ''}">
        <div class="relation-objects"><span>${escapeHtml(source.observation.label)}</span><b>${escapeHtml(relationLabel(relation.type))}</b><span>${escapeHtml(target.observation.label)}</span></div>
        <small>${escapeHtml(source.photo.title)} → ${escapeHtml(target.photo.title)}・候補 ${Math.round((relation.confidence || 0) * 100)}%</small>
        <div><button data-relation-action="confirm" data-relation-id="${escapeHtml(relation.id)}">✓ 採用</button><button data-relation-action="reject" data-relation-id="${escapeHtml(relation.id)}">× 外す</button></div>
      </article>`;
  }

  function renderStepFour(photo) {
    const relations = relevantRelations(photo);
    return `
      <div class="assistant-message"><span class="assistant-avatar">D</span><div><strong>最後に、対象同士の関係だけを確認します。</strong><p>同じ展示、説明している、部分と全体、同じテーマなどを複数設定できます。</p></div></div>
      <div class="relation-list">${relations.length ? relations.map(relationCard).join('') : '<div class="empty-state"><strong>関係候補はまだありません</strong><p>この写真は対象の分類だけで保存できます。</p></div>'}</div>
      ${relations.length ? '<div class="quick-action-row"><button class="primary-button inline" data-bulk-action="confirm-relations">候補を一括承認</button><span>誤った候補だけ外してください</span></div>' : ''}`;
  }

  function renderOrganize() {
    const photo = currentOrganizePhoto();
    if (!photo) return;
    renderOrganizeStrip();
    $('#organizePhotoTitle').textContent = photo.title;
    $('#organizeImage').src = photo.src;
    $('#organizeImage').style.transform = photo.rotation ? `rotate(${photo.rotation}deg) scale(.82)` : '';
    renderOverlay($('#observationOverlay'), photo, { interactive: true });

    $$('#organizeStepper [data-step]').forEach(button => button.classList.toggle('active', Number(button.dataset.step) === state.organizeStep));
    const observation = currentObservation();
    const html = state.organizeStep === 1 ? renderStepOne(photo)
      : state.organizeStep === 2 ? renderStepTwo(photo, observation)
      : state.organizeStep === 3 ? renderStepThree(photo, observation)
      : renderStepFour(photo);
    $('#organizeChat').innerHTML = html;
    $('#previousStepButton').disabled = state.organizeStep === 1;
    $('#nextStepButton').textContent = state.organizeStep === 4 ? '整理を完了する ✓' : '次へ →';
    bindOrganizeControls();
    renderObservationPreview(photo);
  }

  function renderObservationPreview(photo) {
    const observations = photo.observations.filter(item => item.included !== false);
    $('#observationPreviewList').innerHTML = observations.length ? observations.map((observation, index) => {
      const domainId = observation.domainPacks[0];
      return `<button class="preview-observation ${observation.id === state.activeObservationId ? 'active' : ''}" data-preview-observation="${escapeHtml(observation.id)}">
        <span class="observation-number">${index + 1}</span><span><strong>${escapeHtml(observation.label)}</strong><small>${observation.genericCategories.map(genericLabel).join('・') || '汎用分類なし'}</small><em>${domainId ? `${domainLabel(domainId)} / ${observation.domainCategories.map(id => domainCategoryLabel(domainId, id)).join('・')}` : '分野未設定'}</em></span><i>${observation.status === 'confirmed' ? '✓' : '候補'}</i>
      </button>`;
    }).join('') : '<div class="empty-state"><strong>対象がありません</strong></div>';
    $('#organizeSummary').innerHTML = `<strong>${observations.length}</strong><span>この写真から保存する観察対象</span><small>写真1枚 ＝ 知識1件ではありません</small>`;
    $$('[data-preview-observation]').forEach(button => button.addEventListener('click', () => { state.activeObservationId = button.dataset.previewObservation; renderOrganize(); }));
  }

  function bindOrganizeControls() {
    $$('[data-toggle-observation]').forEach(button => button.addEventListener('click', () => {
      const found = observationById(button.dataset.toggleObservation);
      if (!found) return;
      found.observation.included = found.observation.included === false;
      if (found.observation.included && !state.activeObservationId) state.activeObservationId = found.observation.id;
      if (!found.observation.included && state.activeObservationId === found.observation.id) {
        state.activeObservationId = found.photo.observations.find(item => item.included !== false)?.id || null;
      }
      found.photo.status = 'in-progress';
      persist();
      renderOrganize();
    }));

    $$('[data-select-observation]').forEach(button => button.addEventListener('click', () => { state.activeObservationId = button.dataset.selectObservation; renderOrganize(); }));

    $$('[data-chip-type]').forEach(button => button.addEventListener('click', () => {
      const observation = currentObservation();
      if (!observation) return;
      const id = button.dataset.chipId;
      const type = button.dataset.chipType;
      const field = type === 'generic' ? 'genericCategories' : type === 'role' ? 'learningRoles' : type === 'domain' ? 'domainPacks' : 'domainCategories';
      const list = observation[field];
      const index = list.indexOf(id);
      if (index >= 0) list.splice(index, 1); else list.push(id);
      if (type === 'domain' && index >= 0) {
        const allowed = new Set((window.DOMAIN_CATEGORIES[id] || []).map(item => item.id));
        observation.domainCategories = observation.domainCategories.filter(categoryId => !allowed.has(categoryId));
      }
      currentOrganizePhoto().status = 'in-progress';
      persist();
      renderOrganize();
    }));

    $$('[data-bulk-action]').forEach(button => button.addEventListener('click', () => {
      const photo = currentOrganizePhoto();
      const action = button.dataset.bulkAction;
      if (action === 'include-all') photo.observations.forEach(item => { item.included = true; });
      if (action === 'confirm-generic') photo.observations.filter(item => item.included !== false).forEach(item => { item.genericConfirmed = true; });
      if (action === 'confirm-domain') photo.observations.filter(item => item.included !== false).forEach(item => { item.domainConfirmed = true; });
      if (action === 'confirm-relations') relevantRelations(photo).forEach(relation => { relation.status = 'confirmed'; });
      photo.status = 'in-progress';
      persist();
      renderOrganize();
      showToast('候補を一括確認しました');
    }));

    $$('[data-relation-action]').forEach(button => button.addEventListener('click', () => {
      const relation = state.relations.find(item => item.id === button.dataset.relationId);
      if (!relation) return;
      relation.status = button.dataset.relationAction === 'confirm' ? 'confirmed' : 'rejected';
      persist();
      renderOrganize();
    }));

    const addInline = $('#stepAddObservation');
    if (addInline) addInline.addEventListener('click', () => openModal('addObservationModal'));
  }

  function completeOrganizePhoto() {
    const photo = currentOrganizePhoto();
    const included = photo.observations.filter(item => item.included !== false);
    included.forEach(observation => {
      if (observation.genericCategories.length && observation.domainCategories.length) observation.status = 'confirmed';
    });
    photo.status = included.length && included.every(item => item.status === 'confirmed') ? 'organized' : 'in-progress';
    persist();
    renderAll();
    state.knowledgeObservationId = included[0]?.id || state.knowledgeObservationId;
    showToast(photo.status === 'organized' ? '写真の整理が完了しました' : '途中状態として保存しました');
    switchView('knowledge');
  }

  function saveManualObservation() {
    const label = $('#newObservationLabel').value.trim();
    if (!label) { showToast('短い名前を入力してください'); return; }
    const photo = currentOrganizePhoto();
    const observation = {
      id: uid('observation'), photoId: photo.id, label,
      observationType: $('#newObservationType').value,
      region: null,
      genericCategories: ['unknown'], learningRoles: ['direct'],
      domainPacks: [photo.domainHint || window.SAMPLE_VISIT.domainHints[0] || 'other'], domainCategories: [],
      confidence: 1, status: 'confirmed', visibleText: [], included: true, source: 'user', entityId: null
    };
    photo.observations.push(observation);
    photo.status = 'in-progress';
    state.activeObservationId = observation.id;
    $('#newObservationLabel').value = '';
    closeModal('addObservationModal');
    persist();
    renderOrganize();
    showToast('観察対象を追加しました');
  }

  function renderKnowledge() {
    $$('#knowledgeModeControl [data-knowledge-mode]').forEach(button => button.classList.toggle('active', button.dataset.knowledgeMode === state.knowledgeMode));
    const query = state.knowledgeSearch.trim().toLowerCase();
    let observations = allObservations({ includedOnly: true });
    if (state.knowledgeMode === 'learned') {
      const learnedTargets = new Set(state.facts.filter(factUnlocked).map(fact => fact.targetId));
      observations = observations.filter(item => learnedTargets.has(item.id));
    }
    if (query) observations = observations.filter(item => `${item.label} ${item.genericCategories.map(genericLabel).join(' ')} ${item.domainCategories.join(' ')}`.toLowerCase().includes(query));
    observations.sort((a, b) => (a.status === 'confirmed' ? -1 : 1) - (b.status === 'confirmed' ? -1 : 1));

    if (!observations.some(item => item.id === state.knowledgeObservationId)) state.knowledgeObservationId = observations[0]?.id || null;
    $('#knowledgeObservationList').innerHTML = observations.length ? observations.map(item => {
      const photo = photoById(item.photoId);
      return `<button class="knowledge-list-item ${item.id === state.knowledgeObservationId ? 'active' : ''}" data-knowledge-observation="${escapeHtml(item.id)}">
        <img src="${escapeHtml(photo.src)}" alt="" /><span><strong>${escapeHtml(item.label)}</strong><small>${escapeHtml(photo.title)}</small></span><i>${item.status === 'confirmed' ? '✓' : '?'}</i>
      </button>`;
    }).join('') : '<div class="empty-state"><strong>表示する知識がありません</strong><p>写真整理、または「詳しく学ぶ」を進めてください。</p></div>';

    $$('[data-knowledge-observation]').forEach(button => button.addEventListener('click', () => { state.knowledgeObservationId = button.dataset.knowledgeObservation; renderKnowledge(); }));
    renderKnowledgeFocus();
  }

  function renderKnowledgeFocus() {
    const found = observationById(state.knowledgeObservationId);
    if (!found) {
      $('#knowledgeFocus').innerHTML = '<div class="empty-state large"><strong>観察対象を選択してください</strong></div>';
      return;
    }
    const { observation, photo } = found;
    const relations = state.relations.filter(relation => relation.status === 'confirmed' && (relation.sourceId === observation.id || relation.targetId === observation.id));
    const facts = state.facts.filter(fact => fact.targetId === observation.id);
    const unlocked = facts.filter(factUnlocked);
    const locked = facts.filter(fact => !factUnlocked(fact));
    const entity = observation.entityId ? entityMap.get(observation.entityId) : null;
    const domainId = observation.domainPacks[0] || 'other';
    const learnedMode = state.knowledgeMode === 'learned';
    $('#knowledgeFocus').classList.toggle('knowledge-mode-learned', learnedMode);

    $('#knowledgeFocus').innerHTML = `
      <div class="knowledge-map-header"><div><span class="source-badge">${learnedMode ? '📚 後から学んだ知識' : '📷 自分の写真から'}</span><h2>${escapeHtml(observation.label)}</h2><p>${learnedMode ? '確認済みの観察対象に、あとから追加したLearningFactです。' : `${escapeHtml(photo.title)}の中で確認した観察対象です。`}</p></div><button class="ghost-button dark" data-open-photo="${escapeHtml(photo.id)}">元写真を見る</button></div>
      <div class="focus-map">
        <article class="map-source-card"><small>PHOTO</small><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title)}" /><strong>${escapeHtml(photo.title)}</strong></article>
        <div class="map-connector">→</div>
        <article class="map-center-card"><span>${escapeHtml(OBSERVATION_TYPE_LABELS[observation.observationType] || '観察対象')}</span><h3>${escapeHtml(observation.label)}</h3>${entity ? `<p class="optional-entity">任意の具体名：${escapeHtml(entity.name)}</p>` : '<p class="optional-entity">具体名がなくても保存可能</p>'}</article>
        <div class="map-connector">→</div>
        <div class="map-label-groups">
          <article><small>汎用分類</small><div class="mini-tag-list">${observation.genericCategories.map(id => `<span>${escapeHtml(genericLabel(id))}</span>`).join('')}</div></article>
          <article><small>分野別の浅い分類</small><div class="mini-tag-list accent">${observation.domainCategories.map(id => `<span>${escapeHtml(domainCategoryLabel(domainId, id))}</span>`).join('') || '<span>未設定</span>'}</div></article>
        </div>
      </div>
      <div class="knowledge-detail-grid">
        <section class="detail-panel"><div class="detail-heading"><span>RELATIONS</span><h3>確認した関係</h3></div>${relations.length ? relations.map(relation => {
          const otherId = relation.sourceId === observation.id ? relation.targetId : relation.sourceId;
          const other = observationById(otherId);
          return `<button class="relation-link" data-focus-related="${escapeHtml(otherId)}"><span>${escapeHtml(relationLabel(relation.type))}</span><strong>${escapeHtml(other?.observation.label || '')}</strong><small>${escapeHtml(other?.photo.title || '')}</small></button>`;
        }).join('') : '<p class="muted-copy">確認済みの関係はまだありません。</p>'}</section>
        <section class="detail-panel learning-panel"><div class="detail-heading"><span>LEARNING FACTS</span><h3>後から学ぶ知識</h3></div>
          ${unlocked.map(fact => `<article class="learned-fact"><span>📚</span><div><strong>${escapeHtml(fact.label)}</strong><small>${escapeHtml(FACT_SOURCE_LABELS[fact.sourceType] || '')}</small></div></article>`).join('')}
          ${locked.length ? `<div class="locked-facts"><span>＋${locked.length}</span><p>入力時には要求しなかった細かな知識があります。</p><button class="primary-button" id="learnMoreButton">詳しく学ぶ</button></div>` : (!facts.length ? '<p class="muted-copy">この対象には追加学習カードがまだありません。</p>' : '')}
        </section>
      </div>`;

    $$('[data-open-photo]').forEach(button => button.addEventListener('click', () => openPhotoModal(button.dataset.openPhoto)));
    $$('[data-focus-related]').forEach(button => button.addEventListener('click', () => { state.knowledgeObservationId = button.dataset.focusRelated; renderKnowledge(); }));
    const learnButton = $('#learnMoreButton');
    if (learnButton) learnButton.addEventListener('click', () => {
      facts.forEach(fact => { fact.status = 'learned'; });
      persist();
      renderAll();
      renderKnowledge();
      showToast(`${facts.length}件の知識を学習カードへ追加しました`);
    });
  }

  function quizUsesConfirmedData(quiz) {
    const observationIds = quiz.requiredObservationIds || [];
    const relationIds = quiz.requiredRelationIds || [];
    const observationsReady = observationIds.every(id => {
      const found = observationById(id);
      return found?.observation.status === 'confirmed' && found.observation.included !== false;
    });
    const relationsReady = relationIds.every(id => state.relations.some(relation => relation.id === id && relation.status === 'confirmed'));
    return (observationIds.length > 0 || relationIds.length > 0) && observationsReady && relationsReady;
  }

  function currentDeckQuizzes() {
    if (state.deck === 'observed') return window.SAMPLE_QUIZZES.filter(quiz => quiz.level === 'observed' && quizUsesConfirmedData(quiz));
    return window.SAMPLE_QUIZZES.filter(quiz => quiz.level === 'learned' && factUnlocked(factById(quiz.requiredFactId)));
  }

  function renderLearn() {
    const observedCount = currentDeckQuizzesFor('observed').length;
    const learnedAvailable = currentDeckQuizzesFor('learned').length;
    $('#deckSummary').innerHTML = `<span><strong>${observedCount}</strong>見た知識の問題</span><span><strong>${learnedAvailable}</strong>追加学習の問題</span>`;
    $$('#deckSwitch [data-deck]').forEach(button => button.classList.toggle('active', button.dataset.deck === state.deck));
    renderQuiz();
    renderStories();
  }

  function currentDeckQuizzesFor(deck) {
    if (deck === 'observed') return window.SAMPLE_QUIZZES.filter(quiz => quiz.level === 'observed' && quizUsesConfirmedData(quiz));
    return window.SAMPLE_QUIZZES.filter(quiz => quiz.level === 'learned' && factUnlocked(factById(quiz.requiredFactId)));
  }

  function renderQuiz() {
    const quizzes = currentDeckQuizzes();
    const total = quizzes.length;
    $('#quizScore').textContent = state.quizScore;
    $('#quizTotal').textContent = `/ ${total}`;
    const degree = total ? Math.round((Math.min(state.quizIndex, total) / total) * 360) : 0;
    $('#quizRing').style.background = `conic-gradient(var(--accent) ${degree}deg, rgba(255,255,255,.12) ${degree}deg)`;

    if (!total) {
      $('#quizStage').innerHTML = `<div class="locked-deck"><span>🔒</span><h2>追加学習の問題はまだありません</h2><p>知識マップで対象を選び、「詳しく学ぶ」を押すと問題が解放されます。</p><button class="primary-button" id="goKnowledgeButton">知識マップへ</button></div>`;
      $('#goKnowledgeButton').addEventListener('click', () => switchView('knowledge'));
      return;
    }

    if (state.quizCompleted || state.quizIndex >= total) {
      $('#quizStage').innerHTML = `<div class="quiz-finished"><div class="finish-mark">✓</div><h2>${state.quizScore} / ${total} 正解</h2><p>${state.deck === 'observed' ? '写真の整理と関係をよく振り返れています。' : '後から学んだ知識が定着してきました。'}</p><button class="primary-button" id="finishRestartButton">もう一度挑戦</button></div>`;
      $('#finishRestartButton').addEventListener('click', resetQuiz);
      return;
    }

    const quiz = quizzes[state.quizIndex];
    const photo = photoById(quiz.photoId);
    $('#quizStage').innerHTML = `
      <article class="quiz-card">
        <div class="quiz-image"><img src="${escapeHtml(photo.src)}" alt="${escapeHtml(photo.title)}" /></div>
        <div class="quiz-content"><span class="quiz-counter">${state.deck === 'observed' ? 'OBSERVED KNOWLEDGE' : 'LEARNED KNOWLEDGE'} ${String(state.quizIndex + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}</span><h2>${escapeHtml(quiz.question)}</h2>
          <div class="quiz-choice-list">${quiz.choices.map((choice, index) => `<button class="choice-button" data-quiz-choice="${index}"><strong>${String.fromCharCode(65 + index)}.</strong> ${escapeHtml(choice)}</button>`).join('')}</div>
          <div id="quizFeedback"></div>
          <div class="quiz-next-row"><small>${escapeHtml(photo.title)}</small><button class="primary-button" id="nextQuizButton" disabled>${state.quizIndex === total - 1 ? '結果を見る' : '次の問題 →'}</button></div>
        </div>
      </article>`;
    state.quizAnswered = false;
    $$('[data-quiz-choice]').forEach(button => button.addEventListener('click', () => answerQuiz(Number(button.dataset.quizChoice), quizzes)));
    $('#nextQuizButton').addEventListener('click', () => nextQuiz(quizzes));
  }

  function answerQuiz(selected, quizzes) {
    if (state.quizAnswered) return;
    state.quizAnswered = true;
    const quiz = quizzes[state.quizIndex];
    if (selected === quiz.answer) state.quizScore += 1;
    $('#quizScore').textContent = state.quizScore;
    $$('[data-quiz-choice]').forEach((button, index) => {
      button.disabled = true;
      if (index === quiz.answer) button.classList.add('correct');
      else if (index === selected) button.classList.add('incorrect');
    });
    $('#quizFeedback').innerHTML = `<div class="quiz-feedback"><strong>${selected === quiz.answer ? '正解です。' : `正解は「${escapeHtml(quiz.choices[quiz.answer])}」です。`}</strong>${escapeHtml(quiz.explanation)}</div>`;
    $('#nextQuizButton').disabled = false;
  }

  function nextQuiz(quizzes) {
    if (!state.quizAnswered) return;
    state.quizIndex += 1;
    if (state.quizIndex >= quizzes.length) state.quizCompleted = true;
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
    $('#storyGrid').innerHTML = window.SAMPLE_STORIES.map((story, index) => {
      const photos = story.photoIds.map(photoById).filter(Boolean);
      return `<article class="story-card compact-story"><div class="story-gallery">${photos.slice(0, 3).map(photo => `<img src="${escapeHtml(photo.src)}" alt="" />`).join('')}<span class="story-number">0${index + 1}</span></div><div class="story-copy"><small>${escapeHtml(story.subtitle)}</small><h3>${escapeHtml(story.title)}</h3><p>${escapeHtml(story.description)}</p><div class="story-steps">${story.steps.map((step, i) => `<div class="story-step"><span>${i + 1}</span>${escapeHtml(step)}</div>`).join('')}</div></div></article>`;
    }).join('');
  }

  function collectionProgress(collection) {
    const photos = collection.photoIds.map(photoById).filter(Boolean);
    const observationIds = new Set(photos.flatMap(photo => photo.observations.filter(item => item.included !== false).map(item => item.id)));
    const observations = photos.flatMap(photo => photo.observations.filter(item => item.included !== false));
    const relations = state.relations.filter(relation => observationIds.has(relation.sourceId) || observationIds.has(relation.targetId));
    const facts = collection.factIds.map(factById).filter(Boolean);
    const stages = [
      { label: '発見', complete: photos.length > 0 },
      { label: '整理', complete: photos.length > 0 && photos.every(photo => photo.status === 'organized') },
      { label: '分類', complete: observations.length > 0 && observations.every(item => item.genericCategories.length && item.domainCategories.length) },
      { label: '関係付け', complete: relations.some(relation => relation.status === 'confirmed') },
      { label: '学習', complete: facts.length ? facts.every(factUnlocked) : false, optional: !facts.length }
    ];
    const denominator = stages.filter(stage => !stage.optional).length;
    const completed = stages.filter(stage => stage.complete && !stage.optional).length;
    return { stages, percent: denominator ? Math.round(completed / denominator * 100) : 0, photos };
  }

  function renderCollections() {
    $('#collectionGrid').innerHTML = window.SAMPLE_COLLECTIONS.map(collection => {
      const progress = collectionProgress(collection);
      return `<article class="collection-card"><div class="collection-cover">${progress.photos.slice(0, 3).map(photo => `<img src="${escapeHtml(photo.src)}" alt="" />`).join('')}<span>${escapeHtml(collection.icon)}</span></div><div class="collection-body"><div class="collection-title-row"><div><small>COLLECTION</small><h3>${escapeHtml(collection.title)}</h3></div><strong>${progress.percent}%</strong></div><div class="collection-progress"><span style="width:${progress.percent}%"></span></div><div class="stage-row">${progress.stages.map(stage => `<span class="${stage.complete ? 'complete' : ''} ${stage.optional ? 'optional' : ''}"><i>${stage.complete ? '✓' : stage.optional ? '—' : '○'}</i>${escapeHtml(stage.label)}</span>`).join('')}</div></div></article>`;
    }).join('');

    $('#domainPackGrid').innerHTML = window.DOMAIN_PACKS.filter(item => item.id !== 'other').map(pack => {
      const categories = (window.DOMAIN_CATEGORIES[pack.id] || []).slice(0, 6);
      return `<article class="domain-pack-card"><span class="domain-pack-icon">${escapeHtml(pack.icon)}</span><h3>${escapeHtml(pack.label)}</h3><p>${escapeHtml(pack.description)}</p><div class="mini-tag-list">${categories.map(item => `<span>${escapeHtml(item.label)}</span>`).join('')}</div></article>`;
    }).join('');
  }

  function populateUploadOptions() {
    $('#visitTypeSelect').innerHTML = window.VISIT_TEMPLATES.map(template => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.title)}</option>`).join('');
  }

  function updateUploadPreview() {
    $('#uploadPreview').innerHTML = state.selectedFiles.map((item, index) => `<figure><img src="${escapeHtml(item.url)}" alt="${escapeHtml(item.file.name)}" /><button type="button" data-remove-upload="${index}" aria-label="削除">×</button></figure>`).join('');
    const disabled = !state.selectedFiles.length;
    $('#addWithoutAnalysisButton').disabled = disabled;
    $('#analyzeUploadButton').disabled = disabled || !AI_ANALYZE_ENDPOINT;
    $$('[data-remove-upload]').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.removeUpload);
      URL.revokeObjectURL(state.selectedFiles[index].url);
      state.selectedFiles.splice(index, 1);
      updateUploadPreview();
    }));
  }

  function addFiles(files) {
    const incoming = [...files];
    const existing = new Set(state.selectedFiles.map(item => `${item.file.name}:${item.file.size}:${item.file.lastModified}`));
    const images = incoming
      .filter(file => file.type.startsWith('image/') && !existing.has(`${file.name}:${file.size}:${file.lastModified}`))
      .slice(0, Math.max(0, MAX_UPLOAD_BATCH - state.selectedFiles.length));
    images.forEach(file => state.selectedFiles.push({ file, url: URL.createObjectURL(file) }));
    updateUploadPreview();
    if (images.length !== incoming.length) showToast(`重複を除く画像を一度に${MAX_UPLOAD_BATCH}枚まで追加できます`);
  }

  function openSharedPhotoDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(SHARED_PHOTO_DB, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(SHARED_PHOTO_STORE)) {
          request.result.createObjectStore(SHARED_PHOTO_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function idbRequest(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function consumeSharedPhotos() {
    if (!('indexedDB' in window)) return;
    try {
      const db = await openSharedPhotoDb();
      const transaction = db.transaction(SHARED_PHOTO_STORE, 'readwrite');
      const store = transaction.objectStore(SHARED_PHOTO_STORE);
      const records = await idbRequest(store.getAll());
      if (!records.length) {
        db.close();
        return;
      }
      await idbRequest(store.clear());
      db.close();
      const files = records.map(record => new File(
        [record.blob],
        record.name || `shared-${record.id}.jpg`,
        { type: record.type || record.blob?.type || 'image/jpeg', lastModified: record.lastModified || Date.now() }
      ));
      addFiles(files);
      openModal('uploadModal');
      showToast(`${files.length}枚をギャラリーから受け取りました`);
      const url = new URL(location.href);
      url.searchParams.delete('shared');
      history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
    } catch {
      showToast('共有写真を読み込めませんでした。通常の写真追加をお試しください');
    }
  }

  function setupPwa() {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {});
    const installButton = $('#installPwaButton');
    let installPrompt = null;
    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      installPrompt = event;
      installButton?.classList.remove('hidden');
    });
    installButton?.addEventListener('click', async () => {
      if (!installPrompt) {
        showToast('Chromeのメニューから「ホーム画面に追加」を選んでください');
        return;
      }
      await installPrompt.prompt();
      installPrompt = null;
      installButton.classList.add('hidden');
    });
    window.addEventListener('appinstalled', () => {
      installButton?.classList.add('hidden');
      showToast('Your Knowledgeをホーム画面へ追加しました');
    });
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function addUploadsWithoutAnalysis() {
    const items = state.selectedFiles.splice(0);
    if (!items.length) return;
    const domain = $('#visitTypeSelect').value || 'other';
    const added = [];
    for (const [index, item] of items.entries()) {
      const src = await fileToDataUrl(item.file);
      added.push({
        id: uid('photo'), visitId: window.SAMPLE_VISIT.id, file: item.file.name, order: state.photos.length + index + 1,
        title: item.file.name.replace(/\.[^.]+$/, ''), status: 'unorganized', source: 'upload', src, domainHint: domain,
        observations: []
      });
      URL.revokeObjectURL(item.url);
    }
    state.photos.push(...added);
    closeModal('uploadModal');
    updateUploadPreview();
    renderAll();
    setOrganizePhoto(added[0].id);
    switchView('organize');
    showToast(`${added.length}枚を未整理の写真として追加しました`);
  }

  async function resizeImageToDataUrl(file, maxSize = 1400, quality = .82) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL('image/jpeg', quality);
  }

  async function analyzeUploads() {
    if (!AI_ANALYZE_ENDPOINT) {
      showToast('AI解析には安全なバックエンド接続が必要です');
      return;
    }
    const items = state.selectedFiles.splice(0);
    if (!items.length) return;
    const domainHint = $('#visitTypeSelect').value || 'other';
    const added = [];
    let usedFallback = false;
    for (const [index, item] of items.entries()) {
      try {
        const image = await resizeImageToDataUrl(item.file);
        const response = await fetch(AI_ANALYZE_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image, filename: item.file.name, domainHint }) });
        if (!response.ok) throw new Error(await response.text());
        const result = await response.json();
        const observations = Array.isArray(result.observations)
          ? result.observations.filter(item => item && typeof item.label === 'string' && item.label.trim())
          : [];
        if (!observations.length) throw new Error('Observation候補が返されませんでした');
        const photoId = uid('photo');
        added.push({
          id: photoId, visitId: window.SAMPLE_VISIT.id, file: item.file.name, order: state.photos.length + index + 1,
          title: result.suggestedTitle || item.file.name.replace(/\.[^.]+$/, ''), status: 'in-progress', source: 'upload', src: image, domainHint,
          rotation: result.rotation || 0,
          observations: observations.map((observation, observationIndex) => ({
            id: uid(`observation-${observationIndex}`),
            photoId,
            label: observation.label.trim(),
            observationType: observation.observationType || 'concept',
            region: observation.region || null,
            genericCategories: Array.isArray(observation.genericCategories) ? observation.genericCategories : ['unknown'],
            learningRoles: Array.isArray(observation.learningRoles) ? observation.learningRoles : ['direct'],
            domainPacks: Array.isArray(observation.domainPacks) ? observation.domainPacks : [domainHint],
            domainCategories: Array.isArray(observation.domainCategories) ? observation.domainCategories : [],
            entityId: observation.entityId || null,
            confidence: Number.isFinite(observation.confidence) ? observation.confidence : 0,
            visibleText: Array.isArray(observation.visibleText) ? observation.visibleText : [],
            included: true,
            status: 'suggested'
          }))
        });
      } catch (error) {
        console.warn(error);
        usedFallback = true;
        const src = await fileToDataUrl(item.file);
        added.push({ id: uid('photo'), visitId: window.SAMPLE_VISIT.id, file: item.file.name, order: state.photos.length + index + 1, title: item.file.name.replace(/\.[^.]+$/, ''), status: 'unorganized', source: 'upload', src, domainHint, observations: [] });
      }
      URL.revokeObjectURL(item.url);
    }
    state.photos.push(...added);
    closeModal('uploadModal');
    updateUploadPreview();
    renderAll();
    setOrganizePhoto(added[0].id);
    switchView('organize');
    showToast(usedFallback ? 'API未接続の写真は未整理として追加しました' : '複数の観察対象候補を生成しました');
  }

  function exportJson() {
    const observations = allObservations().map(observation => ({
      id: observation.id,
      photoId: observation.photoId,
      label: observation.label,
      observationType: observation.observationType,
      region: observation.region || null,
      genericCategories: observation.genericCategories || [],
      learningRoles: observation.learningRoles || [],
      domainPacks: observation.domainPacks || [],
      domainCategories: observation.domainCategories || [],
      entityId: observation.entityId || null,
      confidence: observation.confidence ?? null,
      status: observation.included === false ? 'rejected' : observation.status
    }));
    const payload = {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      visit: window.SAMPLE_VISIT,
      photos: state.photos.map(photo => ({ id: photo.id, visitId: window.SAMPLE_VISIT.id, file: photo.file, order: photo.order, title: photo.title, status: photo.status, source: photo.source })),
      observations,
      observationRelations: state.relations,
      entities: window.SAMPLE_ENTITIES,
      learningFacts: state.facts,
      collections: window.SAMPLE_COLLECTIONS,
      questions: window.SAMPLE_QUIZZES
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `your-knowledge-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    showToast('知識データを書き出しました');
  }

  function renderAll() {
    renderOverview();
    renderPhotos();
    renderCollections();
    if ($('#view-knowledge').classList.contains('active')) renderKnowledge();
    if ($('#view-learn').classList.contains('active')) renderLearn();
  }

  function bindGlobalEvents() {
    $$('[data-view]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    $$('[data-jump]').forEach(button => button.addEventListener('click', event => { event.preventDefault(); switchView(button.dataset.jump); }));
    $('#startOrganizeButton').addEventListener('click', () => switchView('organize'));
    $('#viewMapButton').addEventListener('click', () => switchView('knowledge'));
    ['openUploadButton', 'photosUploadButton'].forEach(id => document.getElementById(id).addEventListener('click', () => openModal('uploadModal')));
    $$('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
    $$('.modal-backdrop').forEach(modal => modal.addEventListener('click', event => { if (event.target === modal) closeModal(modal.id); }));
    document.addEventListener('keydown', event => { if (event.key === 'Escape') $$('.modal-backdrop.open').forEach(modal => closeModal(modal.id)); });

    $$('[data-photo-filter]').forEach(button => button.addEventListener('click', () => {
      state.photoFilter = button.dataset.photoFilter;
      $$('[data-photo-filter]').forEach(item => item.classList.toggle('active', item === button));
      renderPhotos();
    }));

    $('#organizeFromModalButton').addEventListener('click', () => {
      const photoId = state.modalPhotoId;
      closeModal('photoModal');
      setOrganizePhoto(photoId);
      switchView('organize');
    });
    $('#addObservationButton').addEventListener('click', () => openModal('addObservationModal'));
    $('#saveObservationButton').addEventListener('click', saveManualObservation);
    $('#previousStepButton').addEventListener('click', () => { if (state.organizeStep > 1) { state.organizeStep -= 1; renderOrganize(); } });
    $('#nextStepButton').addEventListener('click', () => { if (state.organizeStep < 4) { state.organizeStep += 1; renderOrganize(); } else completeOrganizePhoto(); });
    $$('#organizeStepper [data-step]').forEach(button => button.addEventListener('click', () => { state.organizeStep = Number(button.dataset.step); renderOrganize(); }));

    $$('#knowledgeModeControl [data-knowledge-mode]').forEach(button => button.addEventListener('click', () => { state.knowledgeMode = button.dataset.knowledgeMode; renderKnowledge(); }));
    $('#knowledgeSearch').addEventListener('input', event => { state.knowledgeSearch = event.target.value; renderKnowledge(); });

    $$('#deckSwitch [data-deck]').forEach(button => button.addEventListener('click', () => {
      state.deck = button.dataset.deck;
      resetQuiz();
      renderLearn();
    }));
    $('#resetQuizButton').addEventListener('click', resetQuiz);

    $('#exportButton').addEventListener('click', exportJson);
    populateUploadOptions();
    const fileInput = $('#fileInput');
    fileInput.addEventListener('change', event => addFiles(event.target.files));
    const dropZone = $('#dropZone');
    ['dragenter', 'dragover'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.add('dragover'); }));
    ['dragleave', 'drop'].forEach(type => dropZone.addEventListener(type, event => { event.preventDefault(); dropZone.classList.remove('dragover'); }));
    dropZone.addEventListener('drop', event => addFiles(event.dataTransfer.files));
    $('#addWithoutAnalysisButton').addEventListener('click', addUploadsWithoutAnalysis);
    $('#analyzeUploadButton').addEventListener('click', analyzeUploads);
  }

  bindGlobalEvents();
  setupPwa();
  renderAll();
  renderOrganize();
  renderKnowledge();
  renderLearn();
  consumeSharedPhotos();
})();
