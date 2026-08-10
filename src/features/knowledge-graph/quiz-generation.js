import { buildVisitKnowledgeGraph } from "../../domain/knowledge-graph.js";
import {
  compareGeologicalTimeNodes,
  getReferenceNodeById,
  getReferenceParents,
  getReferenceChildren,
  referenceNodeDisplayLabel,
} from "../../domain/reference-registry.js";

const MAX_QUESTIONS = 10;
export const MAX_PER_TYPE = Object.freeze({ hierarchy: 3, "timeline-map": 3, matching: 2, "observation-choice": 2 });
const QUESTION_TYPE_ORDER = Object.freeze(["hierarchy", "timeline-map", "matching", "observation-choice"]);
const TYPE_BY_AXIS = { taxonomy: "hierarchy", "geological-time": "timeline-map" };
const PREDICATE_BY_AXIS = { taxonomy: new Set(["classifiedas", "classified_as", "classified-as"]), "geological-time": new Set(["livedduring", "occursduring", "occurreduring", "occurs-during"]) };
const PLACEMENT_PROMPT_BY_PREDICATE = Object.freeze({
  classifiedas: (label) => `${label}を正しい分類へ配置してください。`,
  classified_as: (label) => `${label}を正しい分類へ配置してください。`,
  "classified-as": (label) => `${label}を正しい分類へ配置してください。`,
  livedduring: (label) => `${label}が生きた時代を配置してください。`,
  occursduring: (label) => `${label}が示す時代を配置してください。`,
  occurreduring: (label) => `${label}が示す時代を配置してください。`,
  "occurs-during": (label) => `${label}が示す時代を配置してください。`,
});
export const RELATION_QUIZ_TEMPLATES = Object.freeze({
  explains: (source) => `${source.label}の説明で説明されている対象はどれですか？`,
  "part-of": (source) => `${source.label}が含まれる全体はどれですか？`,
});

export function buildObservationChoiceOptions(observations, targetObservationId) {
  const sorted = [...observations].sort((a, b) => a.id.localeCompare(b.id));
  const target = sorted.find((node) => node.observationId === targetObservationId);
  if (!target) return [];
  return [target, ...sorted.filter((node) => node.observationId !== targetObservationId).slice(0, 3)].map((node) => ({
    id: node.observationId, label: node.label, photoId: node.photoId, region: node.region || null,
  }));
}

export function buildPlacementQuizPrompt(label, predicate) {
  const template = PLACEMENT_PROMPT_BY_PREDICATE[String(predicate || "").toLowerCase()];
  return template ? template(label) : `${label}に対応する位置を配置してください。`;
}

export function generateVisitQuizzes(project, visitId, registries = {}, referenceGraph) {
  const graph = buildVisitKnowledgeGraph(project, visitId, registries);
  return generateQuizzesFromKnowledgeGraph(graph, referenceGraph);
}

export function generateQuizzesFromKnowledgeGraph(graph, referenceGraph) {
  if (!graph) return [];
  const observations = new Map(graph.nodes.filter((node) => node.type === "Observation" && node.status === "confirmed" && node.included !== false).map((node) => [node.id, node]));
  const confirmedRelationIds = new Set(graph.edges.filter((edge) => edge.type === "RELATES_TO" && edge.status === "confirmed" && observations.has(edge.sourceId) && observations.has(edge.targetId)).map((edge) => edge.relationId));
  const factEdges = graph.edges.filter((edge) => edge.type === "HAS_REFERENCE_FACT");
  const entityObservationIds = new Map();
  for (const edge of graph.edges.filter((item) => item.type === "REFERS_TO" && observations.has(item.sourceId))) {
    const list = entityObservationIds.get(edge.targetId) || [];
    list.push(edge.sourceId);
    entityObservationIds.set(edge.targetId, list);
  }
  const questions = [];
  for (const fact of graph.nodes.filter((node) => node.type === "ReferenceFact" && node.status === "verified")) {
    if (!referenceGraph) break;
    const values = Array.isArray(fact.value) ? fact.value : [fact.value];
    for (const value of values) {
      const target = typeof value === "string" ? getReferenceNodeById(referenceGraph, value) : null;
      if (!target || target.status !== "verified" || target.quizEligible === false) continue;
      const axis = target.axis;
      const predicate = String(fact.predicate || "").toLowerCase();
      if (!PREDICATE_BY_AXIS[axis]?.has(predicate)) continue;
      const subjectEdge = factEdges.find((edge) => edge.targetId === fact.id);
      if (!subjectEdge) continue;
      const candidateObservationIds = subjectEdge.sourceId.startsWith("Observation:") ? [subjectEdge.sourceId] : entityObservationIds.get(subjectEdge.sourceId) || [];
      const observation = candidateObservationIds.map((id) => observations.get(id)).find(Boolean);
      if (!observation) continue;
      const placement = buildPlacementBoardData(referenceGraph, target, axis);
      if (placement.options.length < 2) continue;
      const observationNodeId = `Observation:${observation.observationId}`;
      const relationIds = [...confirmedRelationIds].filter((id) => graph.edges.some((edge) => edge.relationId === id && (edge.sourceId === observationNodeId || edge.targetId === observationNodeId))).sort();
      questions.push({
        id: `quiz:${TYPE_BY_AXIS[axis]}:${fact.referenceFactId}:${observation.observationId}:${target.id}`,
        questionType: TYPE_BY_AXIS[axis],
        axis,
        prompt: buildPlacementQuizPrompt(observation.label, fact.predicate),
        observationId: observation.observationId,
        photoId: observation.photoId,
        region: observation.region || null,
        referenceFactId: fact.referenceFactId,
        targetReferenceId: target.id,
        relationIds,
        options: placement.options.map((node) => ({ id: node.id, label: referenceNodeDisplayLabel(referenceGraph, node), labelEn: node.labelEn || node.scientificName || null, axis: node.axis, order: node.order ?? null, rank: node.rank ?? null, parentIds: node.parentIds || [], startMa: node.startMa ?? null, endMa: node.endMa ?? null })),
        placementPathIds: placement.pathIds,
        placementSiblingIds: placement.siblingIds,
        explanation: "確認済みの参照知識と分類・時代データに基づく配置です。",
      });
    }
  }
  const visit = graph.nodes.find((node) => node.type === "Visit");
  if (visit?.source === "demo") {
    for (const observation of [...observations.values()].slice(0, 2)) {
      questions.push({
        id: `quiz:observation:${observation.observationId}`,
        questionType: "observation-choice",
        prompt: "この対象はなんですか？",
        observationId: observation.observationId,
        photoId: observation.photoId,
        region: observation.region || null,
        referenceFactId: null,
        targetReferenceId: observation.observationId,
        relationIds: [],
        options: buildObservationChoiceOptions(observations.values(), observation.observationId),
        explanation: "写真とObservationの対応を確認する問題です。",
      });
    }
    for (const relation of graph.edges.filter((edge) => edge.type === "RELATES_TO" && edge.status === "confirmed" && RELATION_QUIZ_TEMPLATES[edge.relationType])) {
      const source = observations.get(relation.sourceId);
      const target = observations.get(relation.targetId);
      if (!source || !target) continue;
      if (source.photoId === target.photoId) continue;
      questions.push({
        id: `quiz:matching:${relation.relationId}`,
        questionType: "matching",
        prompt: RELATION_QUIZ_TEMPLATES[relation.relationType](source),
        observationId: source.observationId,
        photoId: source.photoId,
        region: source.region || null,
        referenceFactId: null,
        targetReferenceId: target.observationId,
        relationIds: [relation.relationId],
        options: [...observations.values()].sort((a, b) => a.id.localeCompare(b.id)).map((node) => ({
          id: node.observationId,
          label: node.label,
          photoId: node.photoId,
          region: node.region || null,
        })),
        explanation: "デモVisitに保存された確認済みRelationに基づく問題です。",
      });
    }
  }
  return selectQuizQuestions(questions);
}

export function selectQuizQuestions(questions) {
  const sorted = [...questions].sort((a, b) => a.id.localeCompare(b.id));
  const selected = QUESTION_TYPE_ORDER.flatMap((type) =>
    sorted.filter((question) => question.questionType === type).slice(0, MAX_PER_TYPE[type]),
  );
  const selectedIds = new Set(selected.map((question) => question.id));
  const remaining = sorted.filter((question) => !selectedIds.has(question.id));
  return [...selected, ...remaining.slice(0, Math.max(0, MAX_QUESTIONS - selected.length))]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, MAX_QUESTIONS);
}

function isEligiblePlacementNode(node, axis) {
  return node.axis === axis && node.status === "verified" && node.quizEligible !== false && node.internalOnly !== true && node.visible !== false;
}

function getTaxonomyPath(referenceGraph, target) {
  const path = [];
  const seen = new Set();
  let current = target;
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = getReferenceParents(referenceGraph, current.id).find((node) => isEligiblePlacementNode(node, "taxonomy")) || null;
  }
  return path;
}

/** Build the actual board: taxonomy path plus siblings, or a full same-rank time band. */
export function buildPlacementBoardData(referenceGraph, target, axis) {
  if (axis === "geological-time") {
    const options = referenceGraph.nodes
      .filter((node) => isEligiblePlacementNode(node, axis) && node.rank === target.rank)
      .sort(compareGeologicalTimeNodes);
    return { options, pathIds: [], siblingIds: options.filter((node) => node.id !== target.id).map((node) => node.id) };
  }

  const path = getTaxonomyPath(referenceGraph, target);
  const candidates = new Map(path.map((node) => [node.id, node]));
  const siblingIds = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    for (const node of getReferenceChildren(referenceGraph, path[index].id)) {
      if (!isEligiblePlacementNode(node, axis)) continue;
      candidates.set(node.id, node);
      if (node.id !== path[index + 1].id) siblingIds.push(node.id);
    }
  }
  const pathIds = path.map((node) => node.id);
  const pathIndex = new Map(pathIds.map((id, index) => [id, index]));
  const options = [...candidates.values()].sort((a, b) => (pathIndex.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pathIndex.get(b.id) ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id));
  return { options, pathIds, siblingIds: [...new Set(siblingIds)].sort() };
}

export function scoreQuizAnswer(question, answer) {
  const placements = Array.isArray(answer?.placements) ? answer.placements : [];
  const target = placements.find((placement) => placement.cardId === question.observationId);
  const score = target?.referenceId === question.targetReferenceId ? 1 : 0;
  return { score, correct: score === 1, answer: { placements }, targetReferenceId: question.targetReferenceId };
}

export function describeQuizAvailability(project, visitId, registries = {}, referenceGraph) {
  const questions = generateVisitQuizzes(project, visitId, registries, referenceGraph);
  if (questions.length) return { questions, reason: null };
  const graph = visitId ? buildVisitKnowledgeGraph(project, visitId, registries) : null;
  if (!graph || !graph.nodes.some((node) => node.type === "Observation" && node.status === "confirmed")) return { questions, reason: "confirmed Observationがないため問題を作成できません。" };
  if (!graph.nodes.some((node) => node.type === "ReferenceFact" && node.status === "verified")) return { questions, reason: "確認済みの知識がないため問題を作成できません。" };
  return { questions, reason: "対応する確認済みの知識または参照データがないため問題を作成できません。" };
}

export { MAX_QUESTIONS };
