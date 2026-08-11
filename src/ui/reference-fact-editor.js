import { getReferenceNodeById, referenceNodeDisplayLabel } from "../domain/reference-registry.js";
import { escapeHtml } from "./html.js";

export function verifiedReferenceOptions(referenceGraph) {
  return (referenceGraph?.nodes || [])
    .filter((item) => item.status === "verified" && item.quizEligible !== false && item.internalOnly !== true && item.visible !== false)
    .sort((a, b) => a.axis.localeCompare(b.axis)
      || (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
      || a.id.localeCompare(b.id));
}

/** Build the existing persisted ReferenceFact shape from a submitted editor. */
export function buildVerifiedReferenceFact({ id, nodeId, referenceId, sourceNote = "", referenceGraph }) {
  if (!referenceGraph) return null;
  const reference = getReferenceNodeById(referenceGraph, referenceId);
  if (!id || !reference || (!nodeId.startsWith("Observation:") && !nodeId.startsWith("Entity:"))) return null;
  const target = nodeId.startsWith("Observation:")
    ? { targetObservationId: nodeId.slice("Observation:".length) }
    : { subjectId: nodeId.slice("Entity:".length) };
  return {
    id,
    ...target,
    predicate: reference.axis === "taxonomy" ? "classifiedAs" : "livedDuring",
    value: reference.id,
    axis: reference.axis,
    sourceType: "curated",
    sourceNote: String(sourceNote || ""),
    status: "verified",
  };
}

/** Shared editor used from the existing Knowledge Graph detail surface. */
export function renderReferenceFactEditor(node, referenceGraph) {
  const references = verifiedReferenceOptions(referenceGraph);
  if (!references.length) return '<div class="kg-reference-editor"><strong>確認済みの知識を設定できません</strong><p>確認済みの分類・時代が読み込まれていません。</p></div>';
  return `<form class="kg-reference-editor" data-reference-fact-form="${escapeHtml(node.id)}"><strong>この対象の正しい分類・時代を登録</strong><p>クイズや知識マップで正解として使う、確認済みの情報を登録します。複数登録した場合は、最も詳細な項目を正解に使います。</p><label>分類・時代<select name="referenceId" required>${references.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.axis === "taxonomy" ? "分類" : "時代")}：${escapeHtml(referenceNodeDisplayLabel(referenceGraph, item))}</option>`).join("")}</select></label><label>情報の根拠（任意）<input name="sourceNote" placeholder="確認した資料や展示説明" /></label><button class="primary-button small" type="submit">確認済みの知識を追加</button></form>`;
}
