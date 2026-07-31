import { describe, expect, it } from "vitest";
import {
  learningEventFromQuizResult,
  mergeQuizResultsIntoLearningEvents,
  rebuildUserKnowledgeStates,
  recordQuizLearning,
} from "../src/domain/learning-state.js";

function result(overrides = {}) {
  return {
    id: "result-1",
    visitId: "visit-1",
    referenceFactId: "fact-1",
    quizId: "quiz-1",
    attemptId: "attempt-1",
    deckAttemptId: "deck-1",
    score: 1,
    correct: true,
    answeredAt: "2026-07-31T10:00:00.000Z",
    ...overrides,
  };
}

describe("LearningEvent and UserKnowledgeState", () => {
  it("records a correct answer as masteryValue 1 with nullable assessment fields", () => {
    const saved = recordQuizLearning({ events: [], states: [], result: result() });
    expect(saved.event).toMatchObject({
      userId: "user-local",
      visitId: "visit-1",
      referenceFactId: "fact-1",
      questionId: "quiz-1",
      attemptId: "attempt-1",
      deckAttemptId: "deck-1",
      result: 1,
    });
    expect(saved.states[0]).toMatchObject({
      userId: "user-local",
      visitId: "visit-1",
      referenceFactId: "fact-1",
      masteryValue: 1,
      attemptCount: 1,
      correctCount: 1,
      lastResult: 1,
      confidence: null,
      selfAssessment: null,
      misconceptionType: null,
      understandingDepth: null,
    });
  });

  it("appends retries and makes the latest incorrect result masteryValue 0", () => {
    const first = recordQuizLearning({ events: [], states: [], result: result() });
    const second = recordQuizLearning({
      events: first.events,
      states: first.states,
      result: result({ id: "result-2", attemptId: "attempt-2", deckAttemptId: "deck-2", score: 0, correct: false, answeredAt: "2026-07-31T10:01:00.000Z" }),
    });
    expect(second.events).toHaveLength(2);
    expect(second.states[0]).toMatchObject({ attemptCount: 2, correctCount: 1, masteryValue: 0, lastResult: 0 });
  });

  it("separates visits and prevents the same result from creating a second event", () => {
    const first = recordQuizLearning({ events: [], states: [], result: result() });
    const duplicate = recordQuizLearning({ events: first.events, states: first.states, result: result() });
    const otherVisit = recordQuizLearning({ events: first.events, states: first.states, result: result({ id: "result-3", visitId: "visit-2", answeredAt: "2026-07-31T10:02:00.000Z" }) });
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.events).toHaveLength(1);
    expect(otherVisit.states).toHaveLength(2);
    expect(otherVisit.states.map((state) => state.visitId)).toEqual(["visit-1", "visit-2"]);
  });

  it("restores event history and deterministically rebuilds the summary after JSON reload", () => {
    const events = [
      learningEventFromQuizResult(result({ id: "result-1", score: 0, correct: false })),
      learningEventFromQuizResult(result({ id: "result-2", attemptId: "attempt-2", deckAttemptId: "deck-2", score: 1, correct: true, answeredAt: "2026-07-31T10:01:00.000Z" })),
    ];
    const reloadedEvents = JSON.parse(JSON.stringify(events));
    const states = rebuildUserKnowledgeStates(reloadedEvents);
    expect(reloadedEvents).toHaveLength(2);
    expect(states[0]).toMatchObject({ attemptCount: 2, correctCount: 1, masteryValue: 1, lastAnsweredAt: "2026-07-31T10:01:00.000Z" });
  });

  it("backfills old quiz results once without duplicating events", () => {
    const quizResult = result({ id: "old-result" });
    const events = mergeQuizResultsIntoLearningEvents([], [quizResult]);
    const again = mergeQuizResultsIntoLearningEvents(events, [quizResult]);
    expect(events).toHaveLength(1);
    expect(again).toHaveLength(1);
    expect(events[0].sourceResultId).toBe("old-result");
  });
});
