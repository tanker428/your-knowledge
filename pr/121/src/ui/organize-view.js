import { normalizePhotoRotation } from "../domain/photo-rotation.js";
import { escapeHtml } from "./html.js";

export function observationNumberAnchorClass(rotation) {
  return `observation-number-anchor-${normalizePhotoRotation(rotation)}`;
}

export function renderObservationCandidateStep(photo, { analysisConnected = false, observationTypeLabels = {}, activeObservationId = null } = {}) {
  const analysed = photo.source === "sample";
  const intro = analysed
    ? "<strong>この写真から複数の対象を見つけました。</strong><p>一つだけを中心に決める必要はありません。保存したい対象をすべて残し、不要な候補だけ外してください。</p>"
    : `<strong>この写真はまだ解析していません。</strong><p>${escapeHtml(analysisConnected ? "" : "AI解析は接続されていません。")}写真に写っている対象を手動で追加してください。一枚から複数追加できます。</p>`;
  return `
    <div class="assistant-message"><span class="assistant-avatar">Y</span><div>${intro}</div></div>
    <div class="candidate-list">${photo.observations
      .map(
        (observation, index) => `
      <article class="candidate-card ${observation.included !== false ? "selected" : ""} ${observation.id === activeObservationId ? "focused" : ""}">
        <button class="candidate-main" data-toggle-observation="${escapeHtml(observation.id)}">
          <span class="candidate-check">${observation.included !== false ? "✓" : "+"}</span>
          <span class="observation-number">${index + 1}</span>
          <span><strong>${escapeHtml(observation.label)}</strong><small>${escapeHtml(observationTypeLabels[observation.observationType] || "")}・${observation.origin === "user" ? "自分で追加" : `AI候補 ${Math.round((observation.confidence || 0) * 100)}%`}</small></span>
        </button>
        <span class="candidate-actions"><button type="button" data-edit-observation="${escapeHtml(observation.id)}" aria-label="${escapeHtml(observation.label)}を編集">編集</button><button type="button" data-delete-observation="${escapeHtml(observation.id)}" aria-label="${escapeHtml(observation.label)}を削除">削除</button></span>
      </article>`,
      )
      .join("")}</div>
    ${photo.observations.length ? "" : '<div class="empty-state"><strong>対象がまだありません</strong><p>下のボタンから、写真に写っているものを追加してください。</p></div>'}
    <div class="quick-action-row"><button class="ghost-button dark" data-bulk-action="include-all">すべて残す</button><button class="text-button" id="stepAddObservation">＋ 対象を追加</button></div>`;
}

export function bindObservationAddButton(root, onAdd) {
  const button = root?.querySelector("#stepAddObservation");
  if (!button) return false;
  button.addEventListener("click", onAdd);
  return true;
}
