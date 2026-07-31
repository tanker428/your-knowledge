import { buildVisitKnowledgeGraph } from "../../domain/knowledge-graph.js";
import { getReferenceNodeById, getReferenceParents, getReferenceChildren } from "../../domain/reference-registry.js";

const MAX_QUESTIONS = 10;
const TYPE_BY_AXIS = { taxonomy: "hierarchy", "geological-time": "timeline-map" };
const PREDICATE_BY_AXIS = { taxonomy: new Set(["classifiedas", "classified_as", "classified-as"]), "geological-time": new Set(["livedduring", "occursduring", "occurreduring", "occurs-during"]) };

export function generateVisitQuizzes(project, visitId, registries = {}, referenceGraph) {
  const graph = buildVisitKnowledgeGraph(project, visitId, registries);
  return generateQuizzesFromKnowledgeGraph(graph, referenceGraph);
}

export function generateQuizzesFromKnowledgeGraph(graph, referenceGraph) {
  if (!graph || !referenceGraph) return [];
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
      const options = buildPlacementOptions(referenceGraph, target, axis);
      if (options.length < 2) continue;
      const observationNodeId = `Observation:${observation.observationId}`;
      const relationIds = [...confirmedRelationIds].filter((id) => graph.edges.some((edge) => edge.relationId === id && (edge.sourceId === observationNodeId || edge.targetId === observationNodeId))).sort();
      questions.push({
        id: `quiz:${TYPE_BY_AXIS[axis]}:${fact.referenceFactId}:${observation.observationId}:${target.id}`,
        questionType: TYPE_BY_AXIS[axis],
        axis,
        prompt: axis === "taxonomy" ? `${observation.label}を正しい分類へ配置してください。` : `${observation.label}が生きた時代を配置してください。`,
        observationId: observation.observationId,
        photoId: observation.photoId,
        region: observation.region || null,
        referenceFactId: fact.referenceFactId,
        targetReferenceId: target.id,
        relationIds,
        options: options.map((node) => ({ id: node.id, label: node.label, labelEn: node.labelEn || node.scientificName || null, axis: node.axis, order: node.order ?? null, parentIds: node.parentIds || [], startMa: node.startMa ?? null, endMa: node.endMa ?? null })),
        explanation: `${fact.predicate}のverified ReferenceFactと参照データに基づく配置です。`,
      });
    }
  }
  return questions.sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_QUESTIONS);
}

function buildPlacementOptions(referenceGraph, target, axis) {
  const candidates = new Map([[target.id, target]]);
  for (const node of [...getReferenceParents(referenceGraph, target.id), ...getReferenceChildren(referenceGraph, target.id)]) {
    if (node.axis === axis && node.status === "verified" && node.quizEligible !== false && node.internalOnly !== true && node.visible !== false) candidates.set(node.id, node);
  }
  if (candidates.size < 4) {
    for (const node of referenceGraph.nodes.filter((item) => item.axis === axis && item.status === "verified" && item.quizEligible !== false && item.internalOnly !== true && item.visible !== false).sort((a, b) => a.id.localeCompare(b.id))) {
      candidates.set(node.id, node);
      if (candidates.size >= 4) break;
    }
  }
  return [...candidates.values()].sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)).slice(0, 4);
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
  if (!graph.nodes.some((node) => node.type === "ReferenceFact" && node.status === "verified")) return { questions, reason: "verified ReferenceFactがないため問題を作成できません。" };
  return { questions, reason: "対応するverified ReferenceFactまたは参照データがないため問題を作成できません。" };
}

export { MAX_QUESTIONS };
