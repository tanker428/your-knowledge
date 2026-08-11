import { QUIZ_QUESTION_TYPES } from "../features/knowledge-graph/quiz-generation.js";
import { escapeHtml } from "./html.js";

const TYPE_ORDER = Object.freeze(QUIZ_QUESTION_TYPES.map((type) => type.id));

function orderedSelection(selectedTypes) {
  const selected = new Set(selectedTypes || []);
  return TYPE_ORDER.filter((type) => selected.has(type));
}

export function quizAttemptContextKey({ visitId, scope, difficulty, questionTypes }) {
  return `${visitId || "none"}:${scope}:${difficulty}:${orderedSelection(questionTypes).join(",")}`;
}

/** Remove unavailable selections and always keep one available type selected. */
export function reconcileQuizQuestionTypes(selectedTypes, availability) {
  const available = new Set((availability || []).filter((type) => type.available).map((type) => type.id));
  const selected = orderedSelection(selectedTypes).filter((type) => available.has(type));
  if (!available.size) return orderedSelection(selectedTypes);
  if (selected.length) return selected;
  return TYPE_ORDER.filter((type) => available.has(type)).slice(0, 1);
}

/** Apply one checkbox change while rejecting attempts to turn off the last available type. */
export function updateQuizQuestionTypeSelection(selectedTypes, typeId, checked, availability) {
  const available = new Set((availability || []).filter((type) => type.available).map((type) => type.id));
  const selected = new Set(reconcileQuizQuestionTypes(selectedTypes, availability));
  if (!available.has(typeId)) return { selectedTypes: orderedSelection(selected), prevented: true };
  if (checked) selected.add(typeId);
  else if (selected.size === 1 && selected.has(typeId)) return { selectedTypes: orderedSelection(selected), prevented: true };
  else selected.delete(typeId);
  return { selectedTypes: orderedSelection(selected), prevented: false };
}

export function renderQuizQuestionTypeControls(availability, selectedTypes) {
  const selected = new Set(reconcileQuizQuestionTypes(selectedTypes, availability));
  const selectedAvailableCount = selected.size;
  const choices = (availability || []).map((type) => {
    const checked = selected.has(type.id);
    const required = type.available && checked && selectedAvailableCount === 1;
    const disabled = !type.available || required;
    const detail = type.available
      ? required ? `${type.questionCount}問・最後の1種類` : `${type.questionCount}問`
      : `問題なし：${type.reason || "対象がありません。"}`;
    return `<label class="quiz-type-option${type.available ? "" : " unavailable"}" title="${escapeHtml(detail)}"><input type="checkbox" data-quiz-question-type="${escapeHtml(type.id)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} ${required ? "aria-describedby=\"quizTypeSelectionHint\"" : ""}><span>${escapeHtml(type.label)}</span><small>${escapeHtml(detail)}</small></label>`;
  }).join("");
  return `<fieldset class="quiz-type-controls"><legend>問題の種類（複数選択）</legend><div class="quiz-type-options">${choices}</div><small id="quizTypeSelectionHint" aria-live="polite">少なくとも1種類を選択してください。最後の1種類はオフにできません。</small></fieldset>`;
}
