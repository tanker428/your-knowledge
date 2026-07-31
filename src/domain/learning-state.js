/**
 * Quiz answer history and the current per-user/reference state.
 *
 * LearningEvent is append-only. UserKnowledgeState is a deterministic summary
 * of those events and is deliberately scoped by user, visit, and fact.
 */

export const LOCAL_USER_ID = "user-local";

function stateKey(userId, visitId, referenceFactId) {
  return `${userId}\u0000${visitId}\u0000${referenceFactId}`;
}

function eventResult(event) {
  return event.result === 1 || event.correct === true || event.score === 1 ? 1 : 0;
}

/** @param {any} result @param {string} userId */
export function learningEventFromQuizResult(result, userId = LOCAL_USER_ID) {
  const occurredAt = result.answeredAt || result.completedAt || new Date().toISOString();
  return {
    id: `learning-event:${result.id}`,
    sourceResultId: result.id,
    userId,
    visitId: result.visitId,
    referenceFactId: result.referenceFactId,
    questionId: result.quizId,
    type: "quiz_answered",
    result: eventResult(result),
    correct: eventResult(result) === 1,
    score: result.score ?? eventResult(result),
    attemptId: result.attemptId ?? null,
    deckAttemptId: result.deckAttemptId ?? null,
    occurredAt,
  };
}

/** Backfill answer history created before LearningEvent was introduced. */
export function mergeQuizResultsIntoLearningEvents(events = [], results = [], userId = LOCAL_USER_ID) {
  const next = [...events];
  const known = new Set(next.map((event) => event.sourceResultId || event.id));
  for (const result of results) {
    if (!result?.id || !result.referenceFactId || !result.quizId || known.has(result.id)) continue;
    const event = learningEventFromQuizResult(result, userId);
    next.push(event);
    known.add(result.id);
  }
  return next;
}

/** Rebuild from the complete event set; persisted summaries are never an input. */
export function rebuildUserKnowledgeStates(events = []) {
  const states = new Map();
  const ordered = [...events].sort((a, b) => {
    const byTime = String(a.occurredAt || "").localeCompare(String(b.occurredAt || ""));
    return byTime || String(a.id || "").localeCompare(String(b.id || ""));
  });
  for (const event of ordered) {
    const key = stateKey(event.userId, event.visitId, event.referenceFactId);
    const previous = states.get(key) || {
      userId: event.userId,
      visitId: event.visitId,
      referenceFactId: event.referenceFactId,
      masteryValue: 0,
      attemptCount: 0,
      correctCount: 0,
      lastResult: null,
      lastAnsweredAt: null,
      confidence: null,
      selfAssessment: null,
      misconceptionType: null,
      understandingDepth: null,
      updatedAt: null,
    };
    const result = eventResult(event);
    states.set(key, {
      ...previous,
      masteryValue: result,
      attemptCount: previous.attemptCount + 1,
      correctCount: previous.correctCount + result,
      lastResult: result,
      lastAnsweredAt: event.occurredAt,
      confidence: null,
      selfAssessment: null,
      misconceptionType: null,
      understandingDepth: null,
      updatedAt: event.occurredAt,
    });
  }
  return [...states.values()].sort((a, b) => stateKey(a.userId, a.visitId, a.referenceFactId).localeCompare(stateKey(b.userId, b.visitId, b.referenceFactId)));
}

/** Append one quiz result exactly once and rebuild the affected summary. */
export function recordQuizLearning({ events = [], states = [], result, userId = LOCAL_USER_ID }) {
  const event = learningEventFromQuizResult(result, userId);
  if (events.some((item) => item.sourceResultId === result.id || item.id === event.id)) {
    return { events: [...events], states: [...states], event: null, duplicate: true };
  }
  const nextEvents = [...events, event];
  return { events: nextEvents, states: rebuildUserKnowledgeStates(nextEvents), event, duplicate: false };
}

/** Remove learning records belonging to a deleted visit. */
export function removeVisitLearningRecords(events = [], states = [], visitId) {
  return {
    events: events.filter((event) => event.visitId !== visitId),
    states: states.filter((state) => state.visitId !== visitId),
  };
}
