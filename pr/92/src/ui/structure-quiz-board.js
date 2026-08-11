import { compareGeologicalTimeNodes } from "../domain/reference-registry.js";
import { getQuizCards } from "../features/knowledge-graph/quiz-generation.js";
import { timelineNodeGeometry } from "./timeline-quiz.js";
import { escapeHtml } from "./html.js";
import { renderObservationQuizCard } from "./observation-quiz-card.js";

export function quizPlacementMarkers(quiz, optionId, placements, scored) {
  return getQuizCards(quiz).flatMap((card) => {
    const selectedId = placements.find((placement) => placement.cardId === card.cardId)?.referenceId;
    const item = scored?.items.find((result) => result.cardId === card.cardId);
    if (!scored && selectedId === optionId) return [{ card, label: card.label, className: "selected", suffix: "配置" }];
    if (item?.correct && item.targetReferenceId === optionId) return [{ card, label: card.label, className: "correct", suffix: "正解" }];
    const markers = [];
    if (item && !item.correct && item.selectedReferenceId === optionId) markers.push({ card, label: card.label, className: "incorrect", suffix: item.partial ? "自分（部分正解）" : "自分" });
    if (item && !item.correct && item.targetReferenceId === optionId) markers.push({ card, label: card.label, className: "correct", suffix: "正解" });
    return markers;
  });
}

export function renderQuizPlacementMarkers(markers, options = {}) {
  return markers.length
    ? `<span class="quiz-placement-markers" aria-live="polite">${markers.map((marker) => {
      const thumbnail = options.photoById && marker.card
        ? renderObservationQuizCard(marker.card, options.photoById(marker.card.photoId), { variant: "thumbnail" })
        : "";
      return `<i class="quiz-placement-marker ${marker.className}">${thumbnail}<span>${escapeHtml(marker.label)}：${marker.suffix}</span></i>`;
    }).join("")}</span>`
    : "";
}

function resultClass(markers) {
  if (markers.some((item) => item.className === "incorrect")) return "incorrect";
  if (markers.some((item) => item.className === "correct")) return "correct";
  return markers.length ? "selected" : "";
}

export function hierarchyOptionDepths(options) {
  const depths = new Map();
  const byId = new Map(options.map((option) => [option.id, option]));
  const depth = (option) => {
    if (depths.has(option.id)) return depths.get(option.id);
    const seen = new Set([option.id]);
    let current = option;
    let value = 0;
    while (current?.parentIds?.length) {
      const parent = current.parentIds.map((id) => byId.get(id)).find(Boolean);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      value += 1;
      current = parent;
    }
    depths.set(option.id, value);
    return value;
  };
  options.forEach(depth);
  return depths;
}

export function renderHierarchyQuizBoard(quiz, placements, scored, answered, media = {}) {
  const options = [...quiz.options];
  const depths = hierarchyOptionDepths(options);
  const byId = new Map(options.map((option) => [option.id, option]));
  const children = new Map(options.map((option) => [option.id, []]));
  const roots = [];
  for (const option of options) {
    const parentId = [...(option.parentIds || [])].sort().find((id) => byId.has(id));
    if (parentId) children.get(parentId).push(option);
    else roots.push(option);
  }
  const rendered = new Set();
  const renderNode = (option, path = new Set()) => {
    if (path.has(option.id)) return "";
    rendered.add(option.id);
    const nextPath = new Set(path).add(option.id);
    const markers = quizPlacementMarkers(quiz, option.id, placements, scored);
    const stateClass = resultClass(markers);
    const depth = depths.get(option.id) || 0;
    const slotLabel = `${option.label}のObservation配置欄`;
    const placement = option.placementEligible === false
      ? `<span class="quiz-tree-unavailable" aria-label="${escapeHtml(`${option.label}は分類のつながりを示すために表示しています。このクイズの正解候補ではないため、カードは置けません。`)}"><strong>分類を理解するための表示です</strong><small>正解候補ではないため、カードは置けません。</small></span>`
      : `<button type="button" class="quiz-placement quiz-tree-drop ${stateClass}" data-quiz-drop="${escapeHtml(option.id)}" aria-label="${escapeHtml(slotLabel)}" aria-pressed="${markers.length ? "true" : "false"}" ${answered ? "disabled" : ""}><span class="quiz-empty-slot-label">Observationをここに配置</span>${renderQuizPlacementMarkers(markers, media)}</button>`;
    const childNodes = (children.get(option.id) || []).map((child) => renderNode(child, nextPath)).join("");
    return `<li class="quiz-tree-item depth-${depth % 4}" role="treeitem" aria-level="${depth + 1}" style="--tree-depth:${depth}"><div class="quiz-tree-row"><div class="quiz-reference-node"><strong>${escapeHtml(option.label)}</strong>${option.labelEn ? `<small>${escapeHtml(option.labelEn)}</small>` : ""}</div>${placement}</div>${childNodes ? `<ul class="quiz-tree-children" role="group">${childNodes}</ul>` : ""}</li>`;
  };
  let nodes = roots.map((option) => renderNode(option)).join("");
  for (const option of options) {
    if (!rendered.has(option.id)) nodes += renderNode(option);
  }
  return `<ul class="quiz-hierarchy-board" role="tree" aria-label="分類構造。矢印キーで配置欄を移動し、Enterで選択中のカードを配置できます">${nodes}</ul>`;
}

export function orderedTimelineOptions(quiz) {
  return [...(quiz.options || [])].sort(compareGeologicalTimeNodes);
}

function formatAge(value) {
  return Number.isFinite(value) ? `${value} Ma` : "年代不明";
}

export function placementForTimelineReference(quiz, cardId, referenceId) {
  const option = quiz.options.find((candidate) => candidate.id === referenceId);
  if (!option) return null;
  return { cardId, referenceId, startMa: option.startMa ?? null, endMa: option.endMa ?? null };
}

/** Move a placed card one registered position toward older (-1) or newer (+1). */
export function shiftTimelinePlacement(quiz, answer, cardId, direction) {
  const options = orderedTimelineOptions(quiz);
  const placements = [...(answer?.placements || [])];
  const placementIndex = placements.findIndex((placement) => placement.cardId === cardId);
  if (placementIndex < 0 || !Math.sign(direction)) return { placements };
  const optionIndex = options.findIndex((option) => option.id === placements[placementIndex].referenceId);
  const nextIndex = Math.max(0, Math.min(options.length - 1, optionIndex + Math.sign(direction)));
  const next = placementForTimelineReference(quiz, cardId, options[nextIndex]?.id);
  if (optionIndex < 0 || !next) return { placements };
  placements[placementIndex] = next;
  return { placements };
}

function renderTimelineOrderControls(quiz, placements, answered) {
  if (!placements.length || answered) return "";
  const cards = new Map(getQuizCards(quiz).map((card) => [card.cardId, card]));
  const options = orderedTimelineOptions(quiz);
  const rows = placements
    .map((placement) => ({ placement, card: cards.get(placement.cardId), index: options.findIndex((option) => option.id === placement.referenceId) }))
    .filter((item) => item.card && item.index >= 0)
    .sort((a, b) => a.index - b.index || a.card.cardId.localeCompare(b.card.cardId))
    .map(({ placement, card, index }) => `<li><strong>${escapeHtml(card.label)}</strong><span>${escapeHtml(options[index].label)}</span><button type="button" data-quiz-shift="-1" data-quiz-shift-card="${escapeHtml(placement.cardId)}" aria-label="${escapeHtml(`${card.label}を古い位置へ移動`)}" ${index === 0 ? "disabled" : ""}>← 古く</button><button type="button" data-quiz-shift="1" data-quiz-shift-card="${escapeHtml(placement.cardId)}" aria-label="${escapeHtml(`${card.label}を新しい位置へ移動`)}" ${index === options.length - 1 ? "disabled" : ""}>新しく →</button></li>`)
    .join("");
  return rows ? `<div class="quiz-timeline-order"><strong>古い順・新しい順に並べ替え</strong><ol>${rows}</ol></div>` : "";
}

export function renderTimelineQuizBoard(quiz, placements, scored, answered, media = {}) {
  const options = orderedTimelineOptions(quiz);
  const slots = options.map((option, index) => {
    const markers = quizPlacementMarkers(quiz, option.id, placements, scored);
    const stateClass = resultClass(markers);
    const geometry = timelineNodeGeometry(option, options);
    const ages = geometry.kind === "period"
      ? `${formatAge(Math.max(option.startMa, option.endMa))} 〜 ${formatAge(Math.min(option.startMa, option.endMa))}`
      : formatAge(Number.isFinite(option.startMa) ? option.startMa : option.endMa);
    return `<li class="quiz-time-slot ${geometry.kind}" style="--time-left:${geometry.left}%;--time-width:${geometry.width}%;--time-row:${index}"><span class="quiz-time-reference"><i aria-hidden="true"></i><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(ages)}</small></span><button type="button" class="quiz-placement quiz-time-drop ${stateClass}" data-quiz-drop="${escapeHtml(option.id)}" aria-label="${escapeHtml(`${option.label}（${ages}）の配置欄`)}" aria-pressed="${markers.length ? "true" : "false"}" ${answered ? "disabled" : ""}><span class="quiz-empty-slot-label">ここに配置</span>${renderQuizPlacementMarkers(markers, media)}</button></li>`;
  }).join("");
  return `<div class="quiz-timeline-board" aria-label="時系列の時間軸。古い年代から新しい年代の順。矢印キーで移動し、Enterで配置できます"><div class="quiz-time-axis" aria-hidden="true"><span>古い</span><i></i><span>新しい</span></div><ol class="quiz-time-slots" style="--time-rows:${options.length}">${slots}</ol>${renderTimelineOrderControls(quiz, placements, answered)}</div>`;
}
