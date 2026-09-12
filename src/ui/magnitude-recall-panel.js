import { normalizeScaleBoundedValue } from "../features/knowledge-3d/magnitude-recall.js";
import { escapeHtml } from "./html.js";

/**
 * @typedef {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallScale} MagnitudeRecallScale
 * @typedef {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallItem} MagnitudeRecallItem
 * @typedef {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallState} MagnitudeRecallState
 */

/**
 * @param {{
 *   scales: readonly MagnitudeRecallScale[],
 *   scale: MagnitudeRecallScale|null,
 *   items: MagnitudeRecallItem[],
 *   item: MagnitudeRecallItem|null,
 *   session: MagnitudeRecallState|null,
 *   canCommit: boolean,
 *   numericValue: string,
 *   numericNeedsConfirm: boolean,
 *   inputMessage?: string,
 *   targetThumbnailSrc?: string|null,
 *   resultCount: number,
 * }} view
 * @returns {string}
 */
export function renderMagnitudeRecallPanel(view) {
  if (!view.items.length || !view.scale || !view.item || !view.session) {
    return `<section class="magnitude-recall-panel"><div class="magnitude-recall-empty"><strong>body_length の出題対象がありません</strong><span>未設定の体長は出題から除外されています。</span></div></section>`;
  }

  const phase = view.session.phase;
  const answerU = Number.isFinite(view.session.answerU) ? view.session.answerU : null;
  const correctU = phase === "feedback" ? normalizeScaleBoundedValue(view.item.correctValueSI, view.scale) : null;
  const canSubmit = view.canCommit && !view.numericNeedsConfirm;
  const answered = view.session.result;

  return `<section class="magnitude-recall-panel" data-magnitude-recall-phase="${escapeHtml(phase)}">
    <div class="magnitude-recall-header">
      <span>body_length recall</span>
      <strong>${escapeHtml(phaseLabel(phase))}</strong>
      <small>${view.resultCount} trials</small>
    </div>
    <div class="magnitude-recall-scale-row">
      ${view.scales.map((scale) => `<button type="button" class="${scale.id === view.scale?.id ? "active" : ""}" data-magnitude-recall-scale="${escapeHtml(scale.id)}" ${phase === "study" ? "" : "disabled"}>${escapeHtml(scaleLabel(scale))}</button>`).join("")}
    </div>
    <div class="magnitude-recall-axis-label"><span>${escapeHtml(view.scale.id)}</span><strong>${escapeHtml(formatMeters(view.scale.minValueSI))} - ${escapeHtml(formatMeters(view.scale.maxValueSI))}</strong></div>
    ${phase === "study" ? renderStudy(view.item, view.targetThumbnailSrc) : renderAnswerAxis(view.item, view.scale, view.session, answerU, correctU, view.targetThumbnailSrc)}
    ${phase === "answer" ? renderAnswerControls(view, canSubmit) : ""}
    ${phase === "feedback" && answered ? renderFeedback(view.item, view.scale, view.session, answered, answerU, correctU) : ""}
  </section>`;
}

/** @param {MagnitudeRecallItem} item @param {string|null|undefined} targetThumbnailSrc */
function renderStudy(item, targetThumbnailSrc) {
  return `<div class="magnitude-recall-study">
    <div class="magnitude-recall-tray" aria-label="未配置トレイ">
      ${renderTargetCard(item, {
        action: "start",
        phase: "study",
        draggable: false,
        disabled: false,
        thumbnailSrc: targetThumbnailSrc,
      })}
    </div>
  </div>`;
}

/**
 * @param {MagnitudeRecallItem} item
 * @param {MagnitudeRecallScale} scale
 * @param {MagnitudeRecallState} session
 * @param {number|null} answerU
 * @param {number|null} correctU
 * @param {string|null|undefined} targetThumbnailSrc
 */
function renderAnswerAxis(item, scale, session, answerU, correctU, targetThumbnailSrc) {
  const answerLabel = session.answerValueSI == null ? "未入力" : formatMeters(session.answerValueSI);
  const disabled = session.phase === "feedback" ? "true" : "false";
  const pointerU = answerU ?? 0.5;
  const ticks = scale.tickValuesSI.map((value) => {
    const u = normalizeScaleBoundedValue(value, scale);
    if (u === null) return "";
    return `<span class="magnitude-recall-tick ${value === scale.minValueSI || value === scale.maxValueSI ? "major" : ""}" style="--recall-left:${u * 100}%"><i></i><small>${escapeHtml(formatMeters(value))}</small></span>`;
  }).join("");
  return `<div class="magnitude-recall-answer-layout">
    <div class="magnitude-recall-tray">
      ${renderTargetCard(item, {
        action: "answer",
        phase: session.phase,
        draggable: session.phase === "answer",
        disabled: session.phase === "feedback",
        thumbnailSrc: targetThumbnailSrc,
      })}
    </div>
    <div class="magnitude-recall-axis-wrap">
      <div class="magnitude-recall-axis" data-magnitude-recall-axis role="slider" tabindex="0" aria-disabled="${disabled}" aria-valuemin="0" aria-valuemax="1" aria-valuenow="${answerU ?? 0}" aria-valuetext="${escapeHtml(answerLabel)}">
        <div class="magnitude-recall-rail"></div>
        ${ticks}
        <button type="button" class="magnitude-recall-pointer answer ${answerU === null ? "unset" : ""}" data-magnitude-recall-pointer style="--recall-left:${pointerU * 100}%" aria-label="あなたの回答：${escapeHtml(answerLabel)}" ${session.phase === "feedback" ? "disabled" : ""}><i></i><small>あなたの回答</small></button>
        ${correctU === null ? "" : `<span class="magnitude-recall-marker correct" style="--recall-left:${correctU * 100}%"><i></i><small>正解</small></span>`}
      </div>
      <div class="magnitude-recall-answer-readout"><span>あなたの回答</span><strong>${escapeHtml(answerLabel)}</strong></div>
    </div>
  </div>`;
}

/**
 * @param {MagnitudeRecallItem} item
 * @param {{action:"start"|"answer", phase:MagnitudeRecallState["phase"], draggable:boolean, disabled:boolean, thumbnailSrc?:string|null}} options
 */
function renderTargetCard(item, options) {
  const thumbnail = options.thumbnailSrc
    ? `<i class="magnitude-recall-card-thumb" aria-hidden="true"><img src="${escapeHtml(options.thumbnailSrc)}" alt="" /></i>`
    : "";
  const dataAttribute = options.action === "start" ? "data-magnitude-recall-start" : "data-magnitude-recall-card";
  const className = `magnitude-recall-card${thumbnail ? " with-thumbnail" : ""}`;
  const label = options.action === "start" ? "未配置トレイ" : "target";
  return `<button type="button" class="${className}" ${dataAttribute} data-magnitude-recall-target-phase="${escapeHtml(options.phase)}" draggable="${options.draggable ? "true" : "false"}" ${options.disabled ? "disabled" : ""}>
    ${thumbnail}<span>${escapeHtml(label)}</span><strong>${escapeHtml(item.label)}</strong>
  </button>`;
}

/**
 * @param {Parameters<typeof renderMagnitudeRecallPanel>[0]} view
 * @param {boolean} canSubmit
 */
function renderAnswerControls(view, canSubmit) {
  return `<div class="magnitude-recall-controls">
    <label>m <input type="number" min="0" step="0.01" inputmode="decimal" data-magnitude-recall-numeric-input value="${escapeHtml(view.numericValue)}" /></label>
    <button type="button" class="primary-button ${canSubmit ? "" : "disabled"}" data-magnitude-recall-submit ${canSubmit ? "" : "disabled"}>回答する</button>
    <small class="magnitude-recall-input-message">${escapeHtml(view.inputMessage || "")}</small>
  </div>`;
}

/**
 * @param {MagnitudeRecallItem} item
 * @param {MagnitudeRecallScale} scale
 * @param {MagnitudeRecallState} session
 * @param {import('../features/knowledge-3d/magnitude.js').TrialResult} result
 * @param {number|null} answerU
 * @param {number|null} correctU
 */
function renderFeedback(item, scale, session, result, answerU, correctU) {
  const diff = result.answerValueSI - result.correctValueSI;
  const range = item.rangeSI
    ? `<span>推定範囲 ${escapeHtml(formatMeters(item.rangeSI.minSI))} - ${escapeHtml(formatMeters(item.rangeSI.maxSI))}</span>`
    : `<span>推定範囲 なし</span>`;
  const source = item.source ? `<span>出典 ${escapeHtml(item.source)}</span>` : "<span>出典 未設定</span>";
  const rangeBand = item.rangeSI ? renderRangeBand(item, scale) : "";
  return `<div class="magnitude-recall-feedback ${result.correct ? "correct" : "incorrect"}">
    ${rangeBand}
    <strong>${result.correct ? "正解" : "もう少し"}</strong>
    <dl>
      <div><dt>回答値</dt><dd>${escapeHtml(formatMeters(result.answerValueSI))}</dd></div>
      <div><dt>正解値</dt><dd>${escapeHtml(formatMeters(result.correctValueSI))}</dd></div>
      <div><dt>差</dt><dd>${escapeHtml(formatMeters(Math.abs(diff)))}</dd></div>
      <div><dt>誤差</dt><dd>${Math.round(result.error * 1000) / 10}%</dd></div>
    </dl>
    <div class="magnitude-recall-meta">${range}<span>単位 ${escapeHtml(item.unitSI)}</span>${source}<span>${item.estimated ? "推定値" : "確定値"}</span></div>
    <textarea readonly aria-label="TrialResult JSON">${escapeHtml(JSON.stringify(result, null, 2))}</textarea>
    <button type="button" class="primary-button" data-magnitude-recall-next>次の問題</button>
    <small>u=${answerU == null ? "-" : formatUnit(answerU)} / correct=${correctU == null ? "-" : formatUnit(correctU)} / ${escapeHtml(session.scaleId)}</small>
  </div>`;
}

/**
 * @param {MagnitudeRecallItem} item
 * @param {MagnitudeRecallScale} scale
 */
function renderRangeBand(item, scale) {
  if (!item.rangeSI) return "";
  const left = normalizeScaleBoundedValue(item.rangeSI.minSI, scale);
  const right = normalizeScaleBoundedValue(item.rangeSI.maxSI, scale);
  if (left === null || right === null) return "";
  return `<span class="magnitude-recall-range-band" style="--recall-left:${left * 100}%;--recall-width:${Math.max(0, right - left) * 100}%"></span>`;
}

/** @param {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallPhase} phase */
function phaseLabel(phase) {
  if (phase === "answer") return "answer";
  if (phase === "feedback") return "feedback";
  return "study";
}

/** @param {MagnitudeRecallScale} scale */
function scaleLabel(scale) {
  return scale.normalization === "log" ? "log 0.1-100m" : "linear 0-15m";
}

/** @param {number} value */
export function formatMeters(value) {
  if (!Number.isFinite(value)) return "-";
  return `${Number(value.toPrecision(4)).toLocaleString("ja-JP")} m`;
}

/** @param {number} value */
function formatUnit(value) {
  return Number(value.toPrecision(4)).toLocaleString("ja-JP");
}
