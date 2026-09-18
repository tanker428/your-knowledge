function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderKnowledgeDisplayAttributes(node) {
  const labels = [
    ...(node?.displayAttributes?.classificationLabels || []),
    ...(node?.displayAttributes?.learningRoleLabels || []),
  ]
    .filter((label) => String(label || "").trim());
  if (!labels.length) return "";
  return `<span class="kg-node-attributes">${labels.map((label) => `<span class="label-chip selected">${escapeHtml(label)}</span>`).join("")}</span>`;
}
