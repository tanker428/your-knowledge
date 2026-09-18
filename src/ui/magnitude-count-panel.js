import { normalizeScaleBoundedValue } from "../features/knowledge-3d/magnitude-recall.js";
import { countRecallValueFromCount } from "../features/knowledge-3d/magnitude-count-recall.js";
import { escapeHtml } from "./html.js";
import { formatMeters } from "./magnitude-recall-panel.js";

/**
 * @typedef {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallItem} RecallItem
 * @typedef {import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallScale} RecallScale
 * @typedef {Omit<import('../features/knowledge-3d/magnitude-recall.js').MagnitudeRecallState, 'result'> & {
 *   result: import('../features/knowledge-3d/magnitude-count-recall.js').CountTrialResult|null
 * }} CountSession
 * @typedef {{scales: readonly RecallScale[], scale: RecallScale|null, item: RecallItem|null,
 *   session: CountSession|null, count: number, metersPerCount: number, numericValue: string,
 *   canCommit: boolean, paused: boolean, ended: boolean, hintUsed: boolean, resultCount: number}} CountPanelView
 */

/** @param {CountPanelView} view */
export function renderMagnitudeCountPanel(view) {
  const { item, scale, session } = view;
  if (!item || !scale || !session) {
    return '<section class="magnitude-recall-panel magnitude-count-panel"><p>回数で回答できる体長の問題がありません。</p></section>';
  }
  const phase = session.phase;
  const disabled = view.paused || view.ended;
  return `<section class="magnitude-recall-panel magnitude-count-panel" data-magnitude-count-phase="${phase}">
    <div class="magnitude-recall-header"><span>体長を回数で回答</span><strong>${view.ended ? "終了" : view.paused ? "一時停止中" : { study: "問題", answer: "回答", feedback: "結果" }[phase]}</strong><small>${view.resultCount} trials</small></div>
    ${view.ended ? '<p>回数学習を終了しました。確定済みの結果は保存されています。</p><button type="button" class="primary-button" data-magnitude-count-restart>もう一度始める</button>' : `
      <div class="magnitude-recall-scale-row" aria-label="回数回答のスケール">${view.scales.map((entry) => `<button type="button" data-magnitude-count-scale="${escapeHtml(entry.id)}" class="${entry.id === scale.id ? "active" : ""}" ${phase !== "study" || disabled || normalizeScaleBoundedValue(item.correctValueSI, entry) === null ? "disabled" : ""}>${escapeHtml(entry.label)}</button>`).join("")}</div>
      <div class="magnitude-count-question"><strong>${escapeHtml(item.label)}の体長を操作で示してください（この教材では1回＝${escapeHtml(formatMeters(view.metersPerCount))}）</strong>
        <p>回数 × ${escapeHtml(formatMeters(view.metersPerCount))} が回答の長さです。0回は0 mを表します。初期状態・リセット直後は未回答です。操作後に「確定」で回答します。</p>
        ${scale.normalization === "log" ? '<p>共有スケールは対数目盛：基準 0.1 m、目盛ごとに ×10（0.1 → 1 → 10 → 100 m）。操作は1回ずつ同じ長さを加えます。0回（0 m）はこのスケールでは回答できません。</p>' : '<p>共有スケールは線形目盛です。0 mを回答する場合は数値で0を入力できます。</p>'}
      </div>
      ${phase === "study" ? '<button type="button" class="primary-button" data-magnitude-count-start>回答を始める</button>' : ""}
      ${phase === "answer" ? renderAnswer(view) : ""}
      ${phase === "feedback" && session.result ? renderFeedback(item, scale, session.result) : ""}
      <div class="magnitude-count-actions">
        ${phase === "answer" ? `<button type="button" class="text-button" data-magnitude-count-pause>${view.paused ? "再開" : "一時停止"}</button>` : ""}
        <button type="button" class="text-button" data-magnitude-count-end>終了</button>
      </div>`}
  </section>`;
}

/** @param {CountPanelView} view */
function renderAnswer(view) {
  const disabled = view.paused ? "disabled" : "";
  const restored = countRecallValueFromCount(view.count, view.metersPerCount) ?? 0;
  return `<button type="button" class="magnitude-count-area" data-magnitude-count-increment ${disabled}>ここをクリック・タップで1回追加<br><small>この領域にフォーカスして Space / Enter でも1回追加</small></button>
    <p class="magnitude-count-readout" data-magnitude-count-readout aria-live="polite">${escapeHtml(countReadout(view))}</p>
    <div class="magnitude-count-gauge" role="meter" aria-label="回数から復元した長さ（線形）" aria-valuemin="0" aria-valuemax="${view.scale.maxValueSI}" aria-valuenow="${Math.min(restored, view.scale.maxValueSI)}" aria-valuetext="${escapeHtml(formatMeters(restored))}" data-magnitude-count-gauge><span style="width:${Math.min(100, restored / view.scale.maxValueSI * 100)}%"></span></div>
    <small>線の長さはメートルに比例（0–${escapeHtml(formatMeters(view.scale.maxValueSI))}）。上限を超えた値は数値で表示します。</small>
    <div class="magnitude-recall-controls">
      <button type="button" class="text-button" data-magnitude-count-undo ${disabled}>取り消し（1回戻す）</button>
      <button type="button" class="text-button" data-magnitude-count-reset ${disabled}>リセット</button>
      <label>数値で微調整 (m)<input type="number" min="${view.scale.minValueSI}" max="${view.scale.maxValueSI}" step="any" inputmode="decimal" data-magnitude-count-numeric-input value="${escapeHtml(view.numericValue)}" ${disabled}></label>
      <button type="button" class="primary-button" data-magnitude-count-submit ${!view.canCommit || view.paused ? "disabled" : ""}>確定</button>
      <button type="button" class="text-button" data-magnitude-count-hint ${disabled}>操作ヒント</button>
    </div>
    <p data-magnitude-count-status role="status">${escapeHtml(countStatus(view))}</p>
    <p data-magnitude-count-hint-text ${view.hintUsed ? "" : "hidden"}>1回ずつ長さを加え、行き過ぎたら「取り消し」で1回戻せます。端数は数値で微調整してください。微調整後も操作回数は記録されます。</p>`;
}

/** @param {CountPanelView} view */
function countReadout(view) {
  const restored = countRecallValueFromCount(view.count, view.metersPerCount) ?? 0;
  return `回数：${view.count}（${formatMeters(restored)}）${view.numericValue ? ` ／ 微調整：${view.session.answerValueSI === null ? "範囲内の数値を入力" : formatMeters(view.session.answerValueSI)}` : ""}`;
}

/** @param {CountPanelView} view */
function countStatus(view) {
  return view.paused ? "一時停止中です。再開すると続けられます。" : view.canCommit ? "「確定」で回答します。" : `未回答、またはスケール範囲外です（${formatMeters(view.scale.minValueSI)}–${formatMeters(view.scale.maxValueSI)}）。`;
}

/** Update drafts without replacing focused controls or their listeners.
 * @param {HTMLElement} host @param {CountPanelView} view
 */
export function syncMagnitudeCountPanel(host, view) {
  if (view.session?.phase !== "answer" || view.ended) return;
  const restored = countRecallValueFromCount(view.count, view.metersPerCount) ?? 0;
  const readout = host.querySelector("[data-magnitude-count-readout]");
  if (readout) readout.textContent = countReadout(view);
  const gauge = host.querySelector("[data-magnitude-count-gauge]");
  gauge?.setAttribute("aria-valuenow", String(Math.min(restored, view.scale.maxValueSI)));
  gauge?.setAttribute("aria-valuetext", formatMeters(restored));
  const line = /** @type {HTMLElement|null} */ (gauge?.querySelector("span"));
  if (line) line.style.width = `${Math.min(100, restored / view.scale.maxValueSI * 100)}%`;
  const input = /** @type {HTMLInputElement|null} */ (host.querySelector("[data-magnitude-count-numeric-input]"));
  if (input && input.value !== view.numericValue) input.value = view.numericValue;
  const submit = /** @type {HTMLButtonElement|null} */ (host.querySelector("[data-magnitude-count-submit]"));
  if (submit) submit.disabled = !view.canCommit || view.paused;
  const status = host.querySelector("[data-magnitude-count-status]");
  if (status) status.textContent = countStatus(view);
  const hint = /** @type {HTMLElement|null} */ (host.querySelector("[data-magnitude-count-hint-text]"));
  if (hint) hint.hidden = !view.hintUsed;
}

/** @param {RecallItem} item @param {RecallScale} scale @param {import('../features/knowledge-3d/magnitude-count-recall.js').CountTrialResult} result */
function renderFeedback(item, scale, result) {
  const position = (value) => (normalizeScaleBoundedValue(Math.max(scale.minValueSI, Math.min(scale.maxValueSI, value)), scale) ?? 0) * 100;
  const range = item.rangeSI;
  return `<div class="magnitude-recall-feedback ${result.correct ? "correct" : "incorrect"}">
    <strong>${result.correct ? "正解" : "もう少し"}（許容誤差 ±10%）</strong>
    <div class="magnitude-count-comparison" aria-label="回答は実線、正解は破線、推定範囲は点線">
      <div class="magnitude-count-comparison-track">
        <span class="magnitude-count-answer-marker" style="left:${position(result.restoredValueSI)}%"></span>
        <span class="magnitude-count-correct-marker" style="left:${position(result.correctValueSI)}%"></span>
        ${range ? `<span class="magnitude-count-range" style="left:${position(range.minSI)}%;width:${position(range.maxSI) - position(range.minSI)}%"></span>` : ""}
      </div>
      <div class="magnitude-count-legend"><span>━ 回答</span><span>┄ 正解</span><span>┈ 推定範囲</span></div>
      <small>${escapeHtml(scale.label)}（範囲外の推定端点は表示端まで）</small>
    </div>
    <dl><div><dt>復元した回答</dt><dd>${escapeHtml(formatMeters(result.restoredValueSI))}</dd></div><div><dt>正解値</dt><dd>${escapeHtml(formatMeters(result.correctValueSI))}</dd></div><div><dt>誤差</dt><dd>${Math.round(result.error * 1000) / 10}%</dd></div><div><dt>操作回数</dt><dd>${result.count}回</dd></div></dl>
    <div class="magnitude-recall-meta"><span>推定範囲 ${range ? `${escapeHtml(formatMeters(range.minSI))}–${escapeHtml(formatMeters(range.maxSI))}` : "なし"}</span><span>単位 ${escapeHtml(item.unitSI)}</span><span>出典 ${escapeHtml(item.source || "未設定")}</span><span>${item.estimated ? "推定値" : "確定値"}</span><span>微調整 ${result.overridden ? "あり" : "なし"}</span><span>ヒント ${result.hintUsed ? "あり" : "なし"}</span></div>
    <p>操作回数は回答の記録です。知識スコアや学習進捗の加点には使いません。</p>
    <textarea readonly aria-label="CountTrialResult JSON">${escapeHtml(JSON.stringify(result, null, 2))}</textarea>
    <div class="magnitude-count-actions"><button type="button" class="text-button" data-magnitude-count-download>結果をJSONで保存</button><button type="button" class="primary-button" data-magnitude-count-next>次の問題</button></div>
  </div>`;
}
