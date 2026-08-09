const NODE_LABELS = {
  User: "利用者",
  Visit: "訪問",
  Photo: "写真",
  Observation: "観察対象",
  Entity: "対象・展示物",
  ReferenceFact: "確認済みの知識",
  ReferenceNode: "分類・時代",
  GenericCategory: "対象の種類",
  DomainCategory: "テーマ別の分類",
  LearningRole: "学ぶうえでの役割",
  ClassificationAssertion: "分類情報",
  QuestionSeed: "問題の材料",
};

const PREDICATE_LABELS = {
  classifiedas: "分類",
  livedduring: "生息した時代",
  occursduring: "起きた時代",
};

const EDGE_LABELS = {
  PART_OF: "含まれる時代",
  SUBCLASS_OF: "分類上の下位",
  REFERS_TO: "参照する",
  REFERS_TO_REFERENCE: "根拠となる",
  HAS_CLASSIFICATION: "分類情報",
  CLASSIFIES_AS: "分類される",
  HAS_ROLE: "役割を持つ",
  RELATES_TO: (relationType) => relationType || "関連する",
};

export function knowledgeNodeLabel(type) {
  return NODE_LABELS[type] || type;
}

export function knowledgePredicateLabel(predicate) {
  const raw = String(predicate || "");
  const key = raw.replace(/[\s_-]/g, "").toLowerCase();
  return PREDICATE_LABELS[key] || raw || "確認済みの知識";
}

export function knowledgeNodeText(node) {
  if (!node) return "";
  return node.label || node.title || (node.predicate ? knowledgePredicateLabel(node.predicate) : "") || node.referenceId || node.type || "";
}

export function knowledgeEdgeLabel(type, relationType) {
  const label = EDGE_LABELS[type];
  return (typeof label === "function" ? label(relationType) : label) || relationType || "関連する";
}
