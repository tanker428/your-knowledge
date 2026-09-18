import {
  computeSizeReproductionGeometry,
  DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT,
  sizeReproductionLengthDrawUnits,
} from "../features/knowledge-3d/magnitude-size-reproduction.js";
import { escapeHtml } from "./html.js";
import { formatMeters } from "./magnitude-recall-panel.js";

/**
 * @typedef {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallState} Session
 * @typedef {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallScale} Scale
 * @typedef {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallItem} Item
 * @typedef {object} SizePanelView
 * @property {readonly Scale[]} scales
 * @property {Scale|null} scale
 * @property {Item[]} items
 * @property {Item|null} item
 * @property {Session|null} session
 * @property {boolean} canCommit
 * @property {string} numericValue
 * @property {number} resultCount
 */

/** @param {SizePanelView} view */
export function renderMagnitudeSizePanel(view) {
  if (!view.items.length || !view.scale || !view.item || !view.session) {
    return `<section class="magnitude-recall-panel magnitude-size-panel"><div class="magnitude-recall-empty"><strong>体長のサイズ再現</strong><span>body_length の出題対象がありません</span></div></section>`;
  }
  const { scale, item, session } = view;
  const phase = session.phase;
  const reference = DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT;
  // Only feedback may use the correct value or range to choose display bounds.
  const displayMax = phase === "feedback"
    ? Math.max(scale.maxValueSI, item.correctValueSI, item.rangeSI?.maxSI || 0)
    : scale.maxValueSI;
  const maxDraw = sizeReproductionLengthDrawUnits(displayMax);
  const answer = session.answerValueSI;
  const geometry = answer === null ? null : computeSizeReproductionGeometry({ answerValueSI: answer });
  const answerLength = geometry?.answerLengthDrawUnits ?? 0;
  const answerPercent = answerLength / maxDraw * 100;
  const answerLabel = answer === null ? "未入力" : formatMeters(answer);
  const endpoint = phase === "answer" ? `<button type="button" class="magnitude-size-endpoint" data-magnitude-size-endpoint role="slider" aria-label="体長の右端" aria-valuemin="${scale.minValueSI}" aria-valuemax="${scale.maxValueSI}" ${answer === null ? "" : `aria-valuenow="${answer}"`} aria-valuetext="${escapeHtml(answerLabel)}" style="left:${answerPercent}%"></button>` : "";
  return `<section class="magnitude-recall-panel magnitude-size-panel" data-magnitude-size-phase="${phase}">
    <div class="magnitude-recall-header"><span>体長のサイズ再現</span><strong>${phase}</strong><small>${view.resultCount} trials</small></div>
    <div class="magnitude-recall-scale-row">${view.scales.map((entry) => `<button type="button" data-magnitude-size-scale="${escapeHtml(entry.id)}" class="${entry.id === scale.id ? "active" : ""}" ${phase === "study" ? "" : "disabled"}>${escapeHtml(entry.label)}</button>`).join("")}</div>
    <div class="magnitude-recall-axis-label"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(scale.id)}</span></div>
    <p class="magnitude-size-help">基準物と比べて体長を再現してください。線の長さはメートルに比例します。</p>
    <div class="magnitude-size-board">
      <div class="magnitude-size-row"><span>基準物：${escapeHtml(reference.label)} ${formatMeters(reference.valueSI)}（二重線）</span>${renderLine("reference", 0, sizeReproductionLengthDrawUnits(reference.valueSI), maxDraw)}</div>
      ${phase === "study" ? "" : `<div class="magnitude-size-row"><span data-magnitude-size-readout aria-live="polite">あなたの回答：${escapeHtml(answerLabel)}（実線）</span><div class="magnitude-size-track" data-magnitude-size-track data-max-draw="${maxDraw}"><span class="magnitude-size-line answer" data-magnitude-size-answer-line data-draw-length="${answerLength}" style="--size-left:0%;--size-width:${answerPercent}%" ${answer === null ? "hidden" : ""}></span>${endpoint}</div></div>
      <small data-magnitude-size-ratio>${ratioLabel(geometry?.ratio)}</small>`}
      ${phase === "feedback" ? `<div class="magnitude-size-row"><span>正解：${formatMeters(item.correctValueSI)}（破線）</span>${renderLine("correct", 0, sizeReproductionLengthDrawUnits(item.correctValueSI), maxDraw)}</div>
      ${item.rangeSI ? `<div class="magnitude-size-row"><span>推定範囲：${formatMeters(item.rangeSI.minSI)} - ${formatMeters(item.rangeSI.maxSI)}（点線）</span>${renderLine("range", sizeReproductionLengthDrawUnits(item.rangeSI.minSI), sizeReproductionLengthDrawUnits(item.rangeSI.maxSI), maxDraw)}</div>` : ""}` : ""}
    </div>
    ${phase === "study" ? `<button type="button" class="primary-button" data-magnitude-size-start>サイズを再現する</button>` : ""}
    ${phase === "answer" ? `<p class="magnitude-size-help">右端をドラッグ、スライダー、または数値で調整。← / → は 0.1 m、Shift と併用すると 1 m。</p>
      <div class="magnitude-recall-controls magnitude-size-controls">
        <label>体長スライダー (m)<input type="range" min="${scale.minValueSI}" max="${scale.maxValueSI}" step="any" value="${answer ?? scale.minValueSI}" aria-valuetext="${escapeHtml(answerLabel)}" data-magnitude-size-slider /></label>
        <label>体長 (m)<input type="number" min="${scale.minValueSI}" max="${scale.maxValueSI}" step="any" inputmode="decimal" value="${escapeHtml(view.numericValue)}" data-magnitude-size-numeric-input aria-describedby="magnitudeSizeInputHint" /></label>
        <button type="button" class="primary-button" data-magnitude-size-submit ${view.canCommit ? "" : "disabled"}>回答する</button>
      </div><small id="magnitudeSizeInputHint">${formatMeters(scale.minValueSI)} - ${formatMeters(scale.maxValueSI)} の範囲で入力してください。</small>` : ""}
    ${phase === "feedback" && session.result ? renderFeedback(item, session.result) : ""}
  </section>`;
}

/** @param {string} kind @param {number} start @param {number} end @param {number} max */
function renderLine(kind, start, end, max) {
  return `<div class="magnitude-size-track"><span class="magnitude-size-line ${kind}" data-magnitude-size-${kind}-line data-draw-start="${start}" data-draw-end="${end}" data-draw-length="${end - start}" style="--size-left:${start / max * 100}%;--size-width:${(end - start) / max * 100}%"></span></div>`;
}

/** @param {Item} item @param {import('../features/knowledge-3d/magnitude.js').TrialResult} result */
function renderFeedback(item, result) {
  return `<div class="magnitude-recall-feedback ${result.correct ? "correct" : "incorrect"}">
    <strong>${result.correct ? "正解（許容範囲内）" : "もう少し"}</strong>
    <dl><div><dt>回答値</dt><dd>${formatMeters(result.answerValueSI)}</dd></div><div><dt>正解値</dt><dd>${formatMeters(result.correctValueSI)}</dd></div><div><dt>誤差</dt><dd>${Math.round(result.error * 1000) / 10}%</dd></div><div><dt>回答時間</dt><dd>${result.elapsedMs} ms</dd></div></dl>
    <div class="magnitude-recall-meta"><span>単位 ${escapeHtml(item.unitSI)}</span><span>出典 ${escapeHtml(item.source || "未設定")}</span><span>${item.estimated ? "推定値" : "確定値"}</span>${item.rangeSI ? "" : "<span>推定範囲 なし</span>"}</div>
    <small>正解値の ±10% または推定範囲内を許容します。誤差は正解値に対する割合です。</small>
    <textarea readonly aria-label="サイズ再現 TrialResult JSON">${escapeHtml(JSON.stringify(result, null, 2))}</textarea>
    <div class="magnitude-recall-feedback-actions"><button type="button" class="text-button" data-magnitude-size-download>結果をJSONで保存</button><button type="button" class="primary-button" data-magnitude-size-next>次の問題</button></div>
  </div>`;
}

/** @param {number|undefined} ratio */
function ratioLabel(ratio) {
  return ratio === undefined ? "基準物との比：未入力" : `基準物の ${Number(ratio.toPrecision(4))} 倍`;
}

/** Update in place so dragging, typing and keyboard focus survive each draft. @param {HTMLElement} root @param {SizePanelView} view */
export function syncMagnitudeSizeAnswerUi(root, view) {
  const value = view.session?.answerValueSI ?? null;
  const label = value === null ? "未入力" : formatMeters(value);
  const geometry = value === null ? null : computeSizeReproductionGeometry({ answerValueSI: value });
  const track = root.querySelector('[data-magnitude-size-track]');
  const percent = (geometry?.answerLengthDrawUnits ?? 0) / Number(track?.getAttribute("data-max-draw")) * 100;
  const line = root.querySelector('[data-magnitude-size-answer-line]');
  if (line instanceof root.ownerDocument.defaultView.HTMLElement) {
    line.hidden = value === null;
    line.style.setProperty("--size-width", `${percent}%`);
    line.dataset.drawLength = String(geometry?.answerLengthDrawUnits ?? 0);
  }
  const endpoint = root.querySelector('[data-magnitude-size-endpoint]');
  if (endpoint instanceof root.ownerDocument.defaultView.HTMLElement) {
    endpoint.style.left = `${percent}%`;
    if (value === null) endpoint.removeAttribute("aria-valuenow");
    else endpoint.setAttribute("aria-valuenow", String(value));
    endpoint.setAttribute("aria-valuetext", label);
  }
  const readout = root.querySelector('[data-magnitude-size-readout]');
  if (readout) readout.textContent = `あなたの回答：${label}（実線）`;
  const ratio = root.querySelector('[data-magnitude-size-ratio]');
  if (ratio) ratio.textContent = ratioLabel(geometry?.ratio);
  const slider = root.querySelector('input[data-magnitude-size-slider]');
  if (slider instanceof root.ownerDocument.defaultView.HTMLInputElement) {
    slider.value = String(value ?? view.scale.minValueSI);
    slider.setAttribute("aria-valuetext", label);
  }
  const numeric = root.querySelector('input[data-magnitude-size-numeric-input]');
  if (numeric instanceof root.ownerDocument.defaultView.HTMLInputElement) {
    if (numeric.value !== view.numericValue) numeric.value = view.numericValue;
    numeric.setAttribute("aria-invalid", String(value === null && (numeric.validity.badInput || Boolean(view.numericValue))));
  }
  root.querySelector('[data-magnitude-size-submit]')?.toggleAttribute("disabled", !view.canCommit);
}

/**
 * DOM interactions only; app.js owns the independent session and shared scoring.
 * @param {HTMLElement} root
 * @param {{
 * getView: () => SizePanelView,
 * onAnswer: (input: {valueSI?:number, drawLengthUnits?:number}, method: "drag"|"numeric"|"keyboard", numericValue?:string) => void,
 * onStart: () => void, onScale: (id:string) => void, onSubmit: () => void,
 * onNext: () => void, onDownload: () => void,
 * }} actions
 * @returns {() => void}
 */
export function bindMagnitudeSizePanel(root, actions) {
  const win = root.ownerDocument.defaultView;
  const controller = new win.AbortController();
  const options = { signal: controller.signal };
  let pointerId = null;
  let suppressSubmitUntil = 0;
  const endpoint = root.querySelector('[data-magnitude-size-endpoint]');
  const track = root.querySelector('[data-magnitude-size-track]');
  const isAnswering = () => root.isConnected && actions.getView().session?.phase === "answer";
  const submit = () => {
    if (pointerId === null && Date.now() >= suppressSubmitUntil) actions.onSubmit();
  };
  const update = (input, method, numericValue = undefined) => {
    if (!isAnswering()) return;
    actions.onAnswer(input, method, numericValue);
    syncMagnitudeSizeAnswerUi(root, actions.getView());
  };
  const pointerAnswer = (event) => {
    if (!track || !isAnswering()) return;
    const rect = track.getBoundingClientRect();
    if (!rect.width || !Number.isFinite(event.clientX)) return;
    const view = actions.getView();
    const length = Math.max(sizeReproductionLengthDrawUnits(view.scale.minValueSI),
      Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)) * Number(track.getAttribute("data-max-draw")));
    update({ drawLengthUnits: length }, "drag");
  };
  root.addEventListener("click", (event) => {
    const target = event.target instanceof win.Element ? event.target : null;
    if (target?.closest('[data-magnitude-size-endpoint]')) { event.preventDefault(); return; }
    if (target?.closest('[data-magnitude-size-start]')) actions.onStart();
    const scale = target?.closest('[data-magnitude-size-scale]');
    if (scale) actions.onScale(scale.getAttribute("data-magnitude-size-scale"));
    if (target?.closest('[data-magnitude-size-submit]')) submit();
    if (target?.closest('[data-magnitude-size-next]')) actions.onNext();
    if (target?.closest('[data-magnitude-size-download]')) actions.onDownload();
  }, options);
  const onInput = (event) => {
    const input = event.target;
    if (!(input instanceof win.HTMLInputElement)) return;
    if (input.matches('[data-magnitude-size-slider]')) update({ valueSI: input.valueAsNumber }, "drag");
    if (input.matches('[data-magnitude-size-numeric-input]')) update({ valueSI: input.valueAsNumber }, "numeric", input.value);
  };
  root.addEventListener("input", onInput, options);
  root.addEventListener("change", onInput, options);
  root.addEventListener("keydown", (event) => {
    if (!isAnswering() || !(event.target instanceof win.Element)) return;
    if (!event.target.matches('[data-magnitude-size-endpoint], [data-magnitude-size-slider], [data-magnitude-size-numeric-input]')) return;
    if (event.key === "Enter") { event.preventDefault(); submit(); return; }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    // Preserve numeric caret movement, but record its up/down size edits as keyboard.
    if (event.target.matches('[data-magnitude-size-numeric-input]') && !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const view = actions.getView();
    const { minValueSI, maxValueSI } = view.scale;
    const current = view.session.answerValueSI ?? minValueSI;
    const delta = (event.shiftKey ? 1 : 0.1) * (["ArrowLeft", "ArrowDown"].includes(event.key) ? -1 : 1);
    const valueSI = event.key === "Home" ? minValueSI : event.key === "End" ? maxValueSI
      : Math.max(minValueSI, Math.min(maxValueSI, Number((current + delta).toPrecision(12))));
    update({ valueSI }, "keyboard");
  }, options);
  endpoint?.addEventListener("pointerdown", (/** @type {PointerEvent} */ event) => {
    if (!isAnswering() || event.button !== 0 || pointerId !== null) return;
    event.preventDefault();
    pointerId = event.pointerId;
    if (endpoint instanceof win.HTMLElement) endpoint.focus();
    endpoint.setPointerCapture?.(pointerId);
    pointerAnswer(event);
  }, options);
  win.addEventListener("pointermove", (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    event.preventDefault();
    pointerAnswer(event);
  }, options);
  const finishPointer = (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    if (event.type === "pointerup") pointerAnswer(event);
    const previousId = pointerId;
    pointerId = null;
    suppressSubmitUntil = Date.now() + 350;
    if (endpoint?.hasPointerCapture?.(previousId)) endpoint.releasePointerCapture(previousId);
  };
  win.addEventListener("pointerup", finishPointer, options);
  win.addEventListener("pointercancel", finishPointer, options);
  endpoint?.addEventListener("lostpointercapture", finishPointer, options);
  return () => {
    controller.abort();
    if (pointerId !== null && endpoint?.hasPointerCapture?.(pointerId)) endpoint.releasePointerCapture(pointerId);
    pointerId = null;
  };
}
