import { buildVisitKnowledgeGraph } from "../../domain/knowledge-graph.js";
import {
  compareGeologicalTimeNodes,
  getReferenceAncestors,
  getReferenceNodeById,
  getReferenceParents,
  getReferenceChildren,
  referenceNodeDisplayLabel,
} from "../../domain/reference-registry.js";
import { scoreTimelineBounds } from "./timeline-placement.js";

const MIN_COMPARABLE_OBSERVATIONS = 4;
const MAX_HARD_QUESTION_CARDS = 8;
export const MAX_PER_TYPE = Object.freeze({ hierarchy: 5, "timeline-map": 5, matching: 3 });
const MAX_QUESTIONS = Object.values(MAX_PER_TYPE).reduce((total, count) => total + count, 0);
export const QUIZ_DIFFICULTIES = Object.freeze({
  easy: Object.freeze({ id: "easy", label: "簡単", minCards: 1, description: "1件ずつ配置" }),
  normal: Object.freeze({ id: "normal", label: "普通", minCards: 2, description: "2〜3件をまとめて配置" }),
  hard: Object.freeze({ id: "hard", label: "難しい", minCards: 4, description: "4件以上をまとめて配置" }),
});
export const QUIZ_QUESTION_TYPES = Object.freeze([
  Object.freeze({ id: "hierarchy", label: "分類" }),
  Object.freeze({ id: "timeline-map", label: "時系列" }),
  Object.freeze({ id: "matching", label: "Relation" }),
]);
const QUESTION_TYPE_ORDER = Object.freeze(QUIZ_QUESTION_TYPES.map((type) => type.id));
const STRUCTURE_AXES = Object.freeze(["taxonomy", "geological-time"]);
const AXIS_LABEL_BY_ID = Object.freeze({ taxonomy: "分類", "geological-time": "地質時代" });
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
  explains: (source) => `「${source.label}」の説明で説明されている対象はどれですか？`,
  "part-of": (source) => `「${source.label}」が含まれる全体はどれですか？`,
});

export function buildPlacementQuizPrompt(label, predicate) {
  const template = PLACEMENT_PROMPT_BY_PREDICATE[String(predicate || "").toLowerCase()];
  const observationLabel = `「${label}」`;
  return template ? template(observationLabel) : `${observationLabel}に対応する位置を配置してください。`;
}

/** Preserve the existing signature while allowing a fifth, optional settings object. */
export function generateVisitQuizzes(project, visitId, registries = {}, referenceGraph, options = {}) {
  const graph = buildVisitKnowledgeGraph(project, visitId, registries);
  return generateQuizzesFromKnowledgeGraphs([graph], referenceGraph, options);
}

/** Generate one deck from all Visit projections without persisting a combined graph. */
export function generateAllVisitQuizzes(project, registries = {}, referenceGraph, options = {}) {
  const graphs = [...(project?.visits || [])]
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .map((visit) => buildVisitKnowledgeGraph(project, visit.id, registries));
  return generateQuizzesFromKnowledgeGraphs(graphs, referenceGraph, options);
}

export function generateQuizzesFromKnowledgeGraph(graph, referenceGraph, options = {}) {
  return generateQuizzesFromKnowledgeGraphs(graph ? [graph] : [], referenceGraph, options);
}

export function generateQuizzesFromKnowledgeGraphs(graphs, referenceGraph, options = {}) {
  const difficulty = normalizeDifficulty(options.difficulty);
  const placementCards = collectPlacementCards(graphs, referenceGraph);
  const questions = buildStructureQuestions(placementCards, referenceGraph, difficulty);
  for (const graph of graphs) questions.push(...buildMatchingQuestions(graph));
  return selectQuizQuestions(questions, { questionTypes: options.questionTypes });
}

function normalizeDifficulty(value) {
  return Object.hasOwn(QUIZ_DIFFICULTIES, value) ? value : "easy";
}

function collectPlacementCards(graphs, referenceGraph) {
  if (!referenceGraph) return [];
  const cards = [];
  for (const graph of graphs) {
    const observations = new Map(graph.nodes
      .filter((node) => node.type === "Observation" && node.status === "confirmed" && node.included !== false)
      .map((node) => [node.id, node]));
    const factEdges = graph.edges.filter((edge) => edge.type === "HAS_REFERENCE_FACT");
    const entityObservationIds = new Map();
    const observationEntityIds = new Map();
    for (const edge of graph.edges.filter((item) => item.type === "REFERS_TO" && observations.has(item.sourceId))) {
      const list = entityObservationIds.get(edge.targetId) || [];
      list.push(edge.sourceId);
      entityObservationIds.set(edge.targetId, list);
      const entityIds = observationEntityIds.get(edge.sourceId) || [];
      entityIds.push(edge.targetId);
      observationEntityIds.set(edge.sourceId, entityIds);
    }
    for (const fact of graph.nodes.filter((node) => node.type === "ReferenceFact" && node.status === "verified")) {
      const subjectEdge = factEdges.find((edge) => edge.targetId === fact.id);
      if (!subjectEdge) continue;
      const candidateObservationIds = subjectEdge.sourceId.startsWith("Observation:")
        ? [subjectEdge.sourceId]
        : entityObservationIds.get(subjectEdge.sourceId) || [];
      const values = Array.isArray(fact.value) ? fact.value : [fact.value];
      for (const value of values) {
        const target = typeof value === "string" ? getReferenceNodeById(referenceGraph, value) : null;
        if (!target || target.status !== "verified" || target.quizEligible === false) continue;
        const predicate = String(fact.predicate || "").toLowerCase();
        if (!PREDICATE_BY_AXIS[target.axis]?.has(predicate)) continue;
        const placement = buildPlacementBoardData(referenceGraph, target, target.axis);
        if (placement.options.length < 2) continue;
        for (const observationNodeId of [...candidateObservationIds].sort()) {
          const observation = observations.get(observationNodeId);
          if (!observation) continue;
          const relationIds = graph.edges
            .filter((edge) => edge.type === "RELATES_TO" && edge.status === "confirmed"
              && (edge.sourceId === observationNodeId || edge.targetId === observationNodeId))
            .map((edge) => edge.relationId)
            .filter(Boolean)
            .sort();
          cards.push({
            cardId: observation.observationId,
            observationId: observation.observationId,
            label: observation.label,
            photoId: observation.photoId,
            region: observation.region || null,
            visitId: observation.visitId || graph.visitId,
            referenceFactId: fact.referenceFactId,
            targetReferenceId: target.id,
            predicate: fact.predicate,
            axis: target.axis,
            targetRank: target.rank ?? null,
            relationIds,
            entityIds: [...new Set(observationEntityIds.get(observationNodeId) || [])].sort(),
            directReferenceFact: subjectEdge.sourceId.startsWith("Observation:"),
          });
        }
      }
    }
  }
  return selectMostDetailedCards(cards, referenceGraph);
}

/** One Observation has one answer per axis: the deepest registered stable ID wins. */
export function selectMostDetailedCards(cards, referenceGraph) {
  const selected = new Map();
  for (const card of cards) {
    const key = `${card.visitId}\u0000${card.observationId}\u0000${card.axis}`;
    const current = selected.get(key);
    if (!current || compareCardDetail(card, current, referenceGraph) < 0) selected.set(key, card);
  }
  return [...selected.values()].sort(compareCards);
}

function compareCardDetail(a, b, referenceGraph) {
  if (a.targetReferenceId !== b.targetReferenceId) {
    const aAncestors = new Set(getReferenceAncestors(referenceGraph, a.targetReferenceId).map((node) => node.id));
    const bAncestors = new Set(getReferenceAncestors(referenceGraph, b.targetReferenceId).map((node) => node.id));
    if (aAncestors.has(b.targetReferenceId)) return -1;
    if (bAncestors.has(a.targetReferenceId)) return 1;
    if (aAncestors.size !== bAncestors.size) return bAncestors.size - aAncestors.size;
  }
  if (a.directReferenceFact !== b.directReferenceFact) return a.directReferenceFact ? -1 : 1;
  return String(a.targetReferenceId).localeCompare(String(b.targetReferenceId))
    || String(a.referenceFactId).localeCompare(String(b.referenceFactId));
}

function compareCards(a, b) {
  return String(a.axis).localeCompare(String(b.axis))
    || String(a.targetRank || "").localeCompare(String(b.targetRank || ""))
    || String(a.visitId).localeCompare(String(b.visitId))
    || String(a.observationId).localeCompare(String(b.observationId))
    || String(a.referenceFactId).localeCompare(String(b.referenceFactId));
}

function entityAnswerKey(card) {
  const entityIds = [...(card.entityIds || [])].sort();
  return entityIds.length
    ? `${entityIds.join("\u0001")}\u0000${card.targetReferenceId}`
    : `Observation:${card.visitId}\u0000${card.observationId}\u0000${card.targetReferenceId}`;
}

/** Prefer one stable Observation per entity/answer pair, then use extras only to keep the deck full. */
export function prioritizeEntityAnswerCards(cards, minimumPoolSize = 0) {
  const sorted = [...cards].sort(compareCards);
  const representatives = [];
  const extras = [];
  const seen = new Set();
  for (const card of sorted) {
    const key = entityAnswerKey(card);
    if (seen.has(key)) extras.push(card);
    else {
      seen.add(key);
      representatives.push(card);
    }
  }
  const required = Math.min(sorted.length, Math.max(0, minimumPoolSize));
  return representatives.length >= required
    ? representatives
    : [...representatives, ...extras.slice(0, required - representatives.length)];
}

function comparableGroupKey(card, referenceGraph) {
  if (card.axis === "geological-time") return `${card.axis}:${card.targetRank || "unknown"}`;
  const root = getTaxonomyPath(referenceGraph, getReferenceNodeById(referenceGraph, card.targetReferenceId))[0];
  return `${card.axis}:${root?.id || card.targetReferenceId}`;
}

function groupComparableCards(cards, referenceGraph) {
  const groups = new Map();
  for (const card of cards) {
    const key = comparableGroupKey(card, referenceGraph);
    const group = groups.get(key) || [];
    group.push(card);
    groups.set(key, group);
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, cards: group.sort(compareCards) }))
    .filter(({ cards: group }) => new Set(group.map((card) => card.targetReferenceId)).size >= 2)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function partitionCards(cards, difficulty) {
  if (difficulty === "easy") return cards.map((card) => [card]);
  const size = difficulty === "hard"
    ? Math.min(MAX_HARD_QUESTION_CARDS, Math.max(QUIZ_DIFFICULTIES.hard.minCards, cards.length - 1))
    : Math.min(3, Math.max(QUIZ_DIFFICULTIES.normal.minCards, cards.length - 2));
  if (cards.length === size) return [cards];
  return cards.map((_, start) => Array.from({ length: size }, (__, offset) => cards[(start + offset) % cards.length]));
}

function buildStructureQuestionPrompt(cards, axis) {
  if (cards.length === 1) return buildPlacementQuizPrompt(cards[0].label, cards[0].predicate);
  const label = `${cards.length}件の対象`;
  const prompts = cards.map((card) => {
    const template = PLACEMENT_PROMPT_BY_PREDICATE[String(card.predicate || "").toLowerCase()];
    return template ? template(label) : null;
  });
  if (prompts.every((prompt) => prompt === prompts[0])) return prompts[0];
  return `${label}を正しい${axis === "taxonomy" ? "分類" : "時代"}へ配置してください。`;
}

function buildStructureQuestions(cards, referenceGraph, difficulty) {
  const questions = [];
  for (const comparable of groupComparableCards(cards, referenceGraph)) {
    const minimumCards = MIN_COMPARABLE_OBSERVATIONS;
    if (comparable.cards.length < minimumCards) continue;
    const type = TYPE_BY_AXIS[comparable.cards[0].axis];
    const prioritizedCards = prioritizeEntityAnswerCards(comparable.cards, MAX_PER_TYPE[type]);
    for (const questionCards of partitionCards(prioritizedCards, difficulty)) {
      if (questionCards.length > 1 && new Set(questionCards.map((card) => card.targetReferenceId)).size < 2) continue;
      const targets = questionCards.map((card) => getReferenceNodeById(referenceGraph, card.targetReferenceId)).filter(Boolean);
      const axis = questionCards[0].axis;
      const placement = buildPlacementBoardDataForTargets(referenceGraph, targets, axis);
      const prompt = buildStructureQuestionPrompt(questionCards, axis);
      questions.push({
        id: `quiz:${TYPE_BY_AXIS[axis]}:${difficulty}:${questionCards.map((card) => `${card.visitId}:${card.referenceFactId}:${card.observationId}:${card.targetReferenceId}`).join("|")}`,
        questionType: TYPE_BY_AXIS[axis],
        axis,
        difficulty,
        prompt,
        cards: questionCards.map((card) => ({ ...card })),
        relationIds: [...new Set(questionCards.flatMap((card) => card.relationIds))].sort(),
        options: placement.options.map((node) => ({
          id: node.id,
          label: referenceNodeDisplayLabel(referenceGraph, node),
          labelEn: node.labelEn || node.scientificName || null,
          axis: node.axis,
          order: node.order ?? null,
          rank: node.rank ?? null,
          parentIds: node.parentIds || [],
          startMa: node.startMa ?? null,
          endMa: node.endMa ?? null,
          placementEligible: node.quizEligible !== false,
        })),
        placementPathIds: placement.pathIds,
        placementSiblingIds: placement.siblingIds,
        explanation: "確認済みの参照知識と分類・時代データに基づく配置です。",
      });
    }
  }
  return questions;
}

function buildMatchingQuestions(graph) {
  const questions = [];
  const observations = new Map(graph.nodes
    .filter((node) => node.type === "Observation" && node.status === "confirmed" && node.included !== false)
    .map((node) => [node.id, node]));
  const visit = graph.nodes.find((node) => node.type === "Visit");
  if (visit?.source !== "demo") return questions;
  for (const relation of graph.edges.filter((edge) => edge.type === "RELATES_TO" && edge.status === "confirmed" && RELATION_QUIZ_TEMPLATES[edge.relationType])) {
    const source = observations.get(relation.sourceId);
    const target = observations.get(relation.targetId);
    if (!source || !target || source.photoId === target.photoId) continue;
    questions.push({
      id: `quiz:matching:${relation.relationId}`,
      questionType: "matching",
      visitId: graph.visitId,
      prompt: RELATION_QUIZ_TEMPLATES[relation.relationType](source),
      observationId: source.observationId,
      label: source.label,
      photoId: source.photoId,
      region: source.region || null,
      referenceFactId: null,
      targetReferenceId: target.observationId,
      relationIds: [relation.relationId],
      relationType: relation.relationType,
      options: [...observations.values()].sort((a, b) => a.id.localeCompare(b.id)).map((node) => ({
        id: node.observationId,
        label: node.label,
        photoId: node.photoId,
        region: node.region || null,
      })),
      explanation: "デモVisitに保存された確認済みRelationに基づく問題です。",
    });
  }
  return questions;
}

function normalizeQuestionTypes(value) {
  if (value == null) return [...QUESTION_TYPE_ORDER];
  const requested = new Set(Array.from(value));
  return QUESTION_TYPE_ORDER.filter((type) => requested.has(type));
}

export function selectQuizQuestions(questions, options = {}) {
  const sorted = [...questions].sort((a, b) => a.id.localeCompare(b.id));
  const selected = normalizeQuestionTypes(options.questionTypes).flatMap((type) =>
    selectQuestionsForType(sorted.filter((question) => question.questionType === type), type, MAX_PER_TYPE[type]),
  );
  return selected.sort((a, b) => a.id.localeCompare(b.id)).slice(0, MAX_QUESTIONS);
}

function selectQuestionsForType(questions, type, limit) {
  if (type !== "matching") return questions.slice(0, limit);
  const selected = [];
  for (const relationType of [...new Set(questions.map((question) => question.relationType).filter(Boolean))].sort()) {
    const question = questions.find((candidate) => candidate.relationType === relationType);
    if (question) selected.push(question);
    if (selected.length === limit) return selected;
  }
  const ids = new Set(selected.map((question) => question.id));
  return [...selected, ...questions.filter((question) => !ids.has(question.id))].slice(0, limit);
}

function isEligiblePlacementNode(node, axis) {
  return isVisiblePlacementNode(node, axis) && node.quizEligible !== false;
}

function isVisiblePlacementNode(node, axis) {
  return node.axis === axis && node.status === "verified" && node.internalOnly !== true && node.visible !== false;
}

function getTaxonomyPath(referenceGraph, target) {
  const path = [];
  const seen = new Set();
  let current = target;
  while (current && !seen.has(current.id)) {
    path.unshift(current);
    seen.add(current.id);
    current = getReferenceParents(referenceGraph, current.id).find((node) => isVisiblePlacementNode(node, "taxonomy")) || null;
  }
  return path;
}

/** Build the actual board: a focused taxonomy branch or a focused same-rank time band. */
export function buildPlacementBoardData(referenceGraph, target, axis) {
  return buildPlacementBoardDataForTargets(referenceGraph, [target], axis);
}

/** Union the surrounding structures needed by every card on a shared board. */
export function buildPlacementBoardDataForTargets(referenceGraph, targets, axis) {
  if (axis === "geological-time") {
    const ranks = new Set(targets.map((target) => target.rank));
    const sameRank = referenceGraph.nodes
      .filter((node) => isEligiblePlacementNode(node, axis) && ranks.has(node.rank))
      .sort(compareGeologicalTimeNodes);
    const targetIds = new Set(targets.map((target) => target.id));
    const targetIndexes = sameRank
      .map((node, index) => targetIds.has(node.id) ? index : -1)
      .filter((index) => index >= 0);
    const first = Math.max(0, Math.min(...targetIndexes) - 1);
    const last = Math.min(sameRank.length - 1, Math.max(...targetIndexes) + 1);
    const options = targetIndexes.length ? sameRank.slice(first, last + 1) : [];
    return { options, pathIds: [], siblingIds: options.filter((node) => !targetIds.has(node.id)).map((node) => node.id) };
  }

  const candidates = new Map();
  const pathIds = new Set();
  const siblingIds = new Set();
  for (const target of targets) {
    const path = getTaxonomyPath(referenceGraph, target).slice(-3);
    for (const node of path) {
      candidates.set(node.id, node);
      pathIds.add(node.id);
    }
    for (let index = 0; index < path.length - 1; index += 1) {
      for (const node of getReferenceChildren(referenceGraph, path[index].id)) {
        if (!isVisiblePlacementNode(node, axis)) continue;
        candidates.set(node.id, node);
        if (node.id !== path[index + 1].id) siblingIds.add(node.id);
      }
    }
  }
  const depths = new Map([...candidates.values()].map((node) => [node.id, getReferenceAncestors(referenceGraph, node.id).length]));
  const options = [...candidates.values()].sort((a, b) => (depths.get(a.id) || 0) - (depths.get(b.id) || 0)
    || (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER)
    || a.id.localeCompare(b.id));
  return { options, pathIds: [...pathIds], siblingIds: [...siblingIds].sort() };
}

/** Return the uniform card view used by both one-card and multi-card questions. */
export function getQuizCards(question) {
  if (Array.isArray(question?.cards)) return question.cards;
  if (!question?.observationId) return [];
  return [{
    cardId: question.observationId,
    observationId: question.observationId,
    label: question.label || "",
    photoId: question.photoId,
    region: question.region || null,
    visitId: question.visitId || null,
    referenceFactId: question.referenceFactId || null,
    targetReferenceId: question.targetReferenceId,
    relationIds: question.relationIds || [],
  }];
}

export function scoreQuizAnswer(question, answer) {
  const placements = Array.isArray(answer?.placements) ? answer.placements : [];
  const items = getQuizCards(question).map((card) => {
    const placement = placements.find((item) => item.cardId === card.cardId);
    const selectedReferenceId = placement?.referenceId ?? null;
    const selectedOption = question.options?.find((option) => option.id === selectedReferenceId);
    const targetOption = question.options?.find((option) => option.id === card.targetReferenceId);
    const stableIdCorrect = selectedReferenceId === card.targetReferenceId;
    const timeline = question.questionType === "timeline-map" ? scoreTimelineBounds(placement, selectedOption, targetOption) : null;
    const correct = stableIdCorrect && (!timeline || timeline.timelineBoundsCorrect);
    const itemScore = correct ? 1 : stableIdCorrect && timeline?.partial ? 0.5 : 0;
    return {
      cardId: card.cardId,
      observationId: card.observationId,
      visitId: card.visitId,
      referenceFactId: card.referenceFactId,
      selectedReferenceId,
      targetReferenceId: card.targetReferenceId,
      score: itemScore,
      correct,
      stableIdCorrect,
      ...(timeline || {}),
      partial: stableIdCorrect && timeline?.partial === true,
    };
  });
  const correctCount = items.filter((item) => item.correct).length;
  const score = items.length ? items.reduce((total, item) => total + item.score, 0) / items.length : 0;
  return { score, correct: items.length > 0 && correctCount === items.length, correctCount, totalCount: items.length, items, answer: { placements } };
}

/** Expand one visible multi-card attempt into schema-compatible per-fact results. */
export function buildQuizResultEntries(question, scored) {
  const items = scored.items.length ? scored.items : [{
    visitId: question.visitId || null,
    referenceFactId: question.referenceFactId || null,
    score: scored.score,
    correct: scored.correct,
  }];
  return items.map((item) => ({
    visitId: item.visitId || question.visitId || null,
    referenceFactId: item.referenceFactId || null,
    answer: scored.answer,
    score: item.score,
    correct: item.correct,
  }));
}

function buildScopeGraphs(project, visitId, registries, scope) {
  if (scope === "all") {
    return [...(project?.visits || [])]
      .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      .map((visit) => buildVisitKnowledgeGraph(project, visit.id, registries));
  }
  return visitId ? [buildVisitKnowledgeGraph(project, visitId, registries)] : [];
}

export function getQuizDifficultyAvailability(project, visitId, registries = {}, referenceGraph, options = {}) {
  const graphs = buildScopeGraphs(project, visitId, registries, options.scope);
  const placementCards = collectPlacementCards(graphs, referenceGraph);
  const groups = groupComparableCards(placementCards, referenceGraph);
  const matchingQuestions = graphs.flatMap((graph) => buildMatchingQuestions(graph));
  const comparableCount = groups.reduce((maximum, group) => Math.max(maximum, group.cards.length), 0);
  const comparableCountsByAxis = Object.fromEntries(STRUCTURE_AXES.map((axis) => [
    axis,
    groups
      .filter((group) => group.cards[0]?.axis === axis)
      .reduce((maximum, group) => Math.max(maximum, group.cards.length), 0),
  ]));
  const byDifficulty = Object.values(QUIZ_DIFFICULTIES).map((difficulty) => {
    const structureCandidates = buildStructureQuestions(placementCards, referenceGraph, difficulty.id);
    const structureQuestions = selectQuizQuestions(structureCandidates);
    const questions = selectQuizQuestions([...structureCandidates, ...matchingQuestions], { questionTypes: options.questionTypes });
    const axes = Object.fromEntries(STRUCTURE_AXES.map((axis) => {
      const minimumCount = MIN_COMPARABLE_OBSERVATIONS;
      const axisQuestions = structureQuestions.filter((question) => question.axis === axis);
      const axisComparableCount = comparableCountsByAxis[axis];
      const available = axisQuestions.length > 0;
      const reason = available
        ? null
        : axisComparableCount < minimumCount
          ? `${AXIS_LABEL_BY_ID[axis]}クイズは比較可能な対象が不足しているため出題されません（必要${minimumCount}件以上、現在${axisComparableCount}件）。`
          : `${AXIS_LABEL_BY_ID[axis]}クイズは正解が2箇所以上に分散した比較可能な対象がないため出題されません。`;
      return [axis, {
        axis,
        label: AXIS_LABEL_BY_ID[axis],
        comparableCount: axisComparableCount,
        minimumCount,
        questionCount: axisQuestions.length,
        available,
        reason,
      }];
    }));
    const allQuestions = selectQuizQuestions([...structureCandidates, ...matchingQuestions]);
    const questionTypes = QUIZ_QUESTION_TYPES.map((type) => {
      const questionCount = allQuestions.filter((question) => question.questionType === type.id).length;
      const axis = type.id === "hierarchy" ? axes.taxonomy : type.id === "timeline-map" ? axes["geological-time"] : null;
      return {
        ...type,
        questionCount,
        available: questionCount > 0,
        reason: questionCount > 0
          ? null
          : axis?.reason || "確認済みのRelationと写真の組み合わせがないため出題されません。",
      };
    });
    return { ...difficulty, available: questions.length > 0, axes, questionTypes };
  });
  return {
    comparableCount,
    comparableCountsByAxis,
    difficulties: byDifficulty,
    questionTypes: byDifficulty.find((difficulty) => difficulty.id === normalizeDifficulty(options.difficulty))?.questionTypes || [],
  };
}

export function describeQuizAvailability(project, visitId, registries = {}, referenceGraph, options = {}) {
  const graphs = buildScopeGraphs(project, visitId, registries, options.scope);
  const questions = generateQuizzesFromKnowledgeGraphs(graphs, referenceGraph, options);
  const difficulty = getQuizDifficultyAvailability(project, visitId, registries, referenceGraph, options);
  const selectedDifficulty = difficulty.difficulties.find((item) => item.id === normalizeDifficulty(options.difficulty));
  const axisAvailability = selectedDifficulty?.axes || {};
  const axisReasons = STRUCTURE_AXES.map((axis) => axisAvailability[axis]?.reason).filter(Boolean);
  const questionTypes = selectedDifficulty?.questionTypes || [];
  if (questions.length) return { questions, reason: null, ...difficulty, questionTypes, axisAvailability, axisReasons };
  const confirmed = graphs.flatMap((graph) => graph.nodes).filter((node) => node.type === "Observation" && node.status === "confirmed");
  if (!confirmed.length) return { questions, reason: "confirmed Observationがないため問題を作成できません。", ...difficulty, questionTypes, axisAvailability, axisReasons };
  const facts = graphs.flatMap((graph) => graph.nodes).filter((node) => node.type === "ReferenceFact" && node.status === "verified");
  if (!facts.length) return { questions, reason: "確認済みの知識がないため問題を作成できません。", ...difficulty, questionTypes, axisAvailability, axisReasons };
  const selectedTypes = normalizeQuestionTypes(options.questionTypes);
  const selectedTypeReasons = questionTypes.filter((type) => selectedTypes.includes(type.id) && !type.available).map((type) => type.reason);
  if (selectedTypeReasons.length) return { questions, reason: selectedTypeReasons.join(" "), ...difficulty, questionTypes, axisAvailability, axisReasons };
  return { questions, reason: "対応する確認済みの知識または参照データがないため問題を作成できません。", ...difficulty, questionTypes, axisAvailability, axisReasons };
}

export { MAX_QUESTIONS, MIN_COMPARABLE_OBSERVATIONS };
