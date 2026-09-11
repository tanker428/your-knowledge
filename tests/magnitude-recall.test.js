import { describe, expect, it } from "vitest";
import { VISUALIZATION_GRAPH_FIXTURE } from "../src/features/knowledge-3d/visualization-graph-fixture.js";
import {
  BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
  BODY_LENGTH_LOG_RECALL_SCALE_ID,
  BODY_LENGTH_RECALL_SCALES,
  buildMagnitudeRecallFixture,
  buildMagnitudeRecallItems,
  canCommitMagnitudeRecallAnswer,
  commitMagnitudeRecallAnswer,
  denormalizeScaleUnitPosition,
  enterMagnitudeRecallAnswerMode,
  findMagnitudeRecallScale,
  magnitudeRecallPlacement,
  normalizeRecallAnswerForScale,
  normalizeRecallAnswerValueSI,
  normalizeScaleBoundedValue,
  scoreMagnitudeRecallAnswer,
  startMagnitudeRecallTrial,
  startNextMagnitudeRecallTrial,
  updateMagnitudeRecallDraftAnswer,
} from "../src/features/knowledge-3d/magnitude-recall.js";

const LOG_SCALE = findMagnitudeRecallScale(BODY_LENGTH_LOG_RECALL_SCALE_ID);
const LINEAR_SCALE = findMagnitudeRecallScale(BODY_LENGTH_LINEAR_RECALL_SCALE_ID);

describe("body_length magnitude recall core", () => {
  it("normalizes and denormalizes bounded log and linear scales without renderer coordinates", () => {
    expect(LOG_SCALE).not.toBeNull();
    expect(LINEAR_SCALE).not.toBeNull();

    expect(normalizeScaleBoundedValue(0.1, LOG_SCALE)).toBe(0);
    const oneMeter = normalizeScaleBoundedValue(1, LOG_SCALE);
    const tenMeters = normalizeScaleBoundedValue(10, LOG_SCALE);
    const hundredMeters = normalizeScaleBoundedValue(100, LOG_SCALE);

    expect(oneMeter).toBeCloseTo(1 / 3, 12);
    expect(tenMeters).toBeCloseTo(2 / 3, 12);
    expect(hundredMeters).toBe(1);
    expect(tenMeters - oneMeter).toBeCloseTo(hundredMeters - tenMeters, 12);

    for (const value of [0.1, 1, 10, 100]) {
      const u = normalizeScaleBoundedValue(value, LOG_SCALE);
      expect(denormalizeScaleUnitPosition(u, LOG_SCALE)).toBeCloseTo(value, 12);
    }

    expect(normalizeScaleBoundedValue(0, LINEAR_SCALE)).toBe(0);
    expect(normalizeScaleBoundedValue(5, LINEAR_SCALE)).toBeCloseTo(1 / 3, 12);
    expect(normalizeScaleBoundedValue(15, LINEAR_SCALE)).toBe(1);
    expect(denormalizeScaleUnitPosition(1 / 3, LINEAR_SCALE)).toBeCloseTo(5, 12);
  });

  it("guards invalid log values and uncommittable answer inputs", () => {
    expect(normalizeScaleBoundedValue(0, LOG_SCALE)).toBeNull();
    expect(normalizeScaleBoundedValue(-1, LOG_SCALE)).toBeNull();
    expect(normalizeScaleBoundedValue(101, LOG_SCALE)).toBeNull();
    expect(normalizeScaleBoundedValue(Number.NaN, LOG_SCALE)).toBeNull();
    expect(denormalizeScaleUnitPosition(Number.POSITIVE_INFINITY, LOG_SCALE)).toBeNull();

    expect(normalizeRecallAnswerValueSI("", "m")).toBeNull();
    expect(normalizeRecallAnswerValueSI("nope", "m")).toBeNull();
    expect(normalizeRecallAnswerValueSI(Number.POSITIVE_INFINITY, "m")).toBeNull();
    expect(normalizeRecallAnswerValueSI(-1, "m")).toBeNull();
    expect(normalizeRecallAnswerForScale({ scale: LOG_SCALE, answerValueSI: 1_000 })).toBeNull();
  });

  it("normalizes 0.5 m and 50 cm to the same SI answer", () => {
    expect(normalizeRecallAnswerValueSI(0.5, "m")).toBe(0.5);
    expect(normalizeRecallAnswerValueSI(50, "cm")).toBe(0.5);
    expect(normalizeRecallAnswerForScale({
      scale: LOG_SCALE,
      answerValue: 50,
      unit: "cm",
    })).toMatchObject({
      answerValueSI: 0.5,
    });
  });

  it("scores TrialResult with the provisional +/-10% curriculum rule", () => {
    // 教材上の仮ルール: 正解値の +/-10% 以内を正解とする。
    expect(scoreMagnitudeRecallAnswer({
      itemId: "concept:demo",
      scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
      answerValueSI: 9,
      correctValueSI: 10,
      elapsedMs: 1200,
      inputMethod: "drag",
    })).toMatchObject({
      itemId: "concept:demo",
      scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
      answerValueSI: 9,
      correctValueSI: 10,
      correct: true,
      error: 0.1,
      elapsedMs: 1200,
      inputMethod: "drag",
    });
    expect(scoreMagnitudeRecallAnswer({
      itemId: "concept:demo",
      scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
      answerValueSI: 11,
      correctValueSI: 10,
      elapsedMs: 1200,
      inputMethod: "axis-click",
    })?.correct).toBe(true);
    expect(scoreMagnitudeRecallAnswer({
      itemId: "concept:demo",
      scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
      answerValueSI: 11.01,
      correctValueSI: 10,
      elapsedMs: 1200,
      inputMethod: "keyboard",
    })?.correct).toBe(false);
    expect(scoreMagnitudeRecallAnswer({
      itemId: "concept:demo",
      scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
      answerValueSI: 10,
      correctValueSI: 0,
      elapsedMs: 1200,
      inputMethod: "numeric",
    })).toBeNull();
  });

  it("keeps study to answer to feedback transitions pure and fixed after commit", () => {
    const started = startMagnitudeRecallTrial({
      itemId: "concept:taxon:fukuiraptor",
      scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
      startedAtMs: 1_000,
    });
    expect(started).toMatchObject({
      phase: "study",
      answerValueSI: null,
      answerU: null,
      result: null,
    });
    expect(canCommitMagnitudeRecallAnswer(started)).toBe(false);
    expect(commitMagnitudeRecallAnswer(started, { correctValueSI: 4.2, nowMs: 1_100 })).toBe(started);

    const answering = enterMagnitudeRecallAnswerMode(started);
    expect(answering).toMatchObject({ phase: "answer" });
    expect(canCommitMagnitudeRecallAnswer(answering)).toBe(false);

    const drafted = updateMagnitudeRecallDraftAnswer(answering, {
      scale: LOG_SCALE,
      answerU: 0.5,
      inputMethod: "axis-click",
    });
    expect(drafted).toMatchObject({
      phase: "answer",
      answerValueSI: 3.1622776601683795,
      answerU: 0.5,
      inputMethod: "axis-click",
    });
    expect(magnitudeRecallPlacement(drafted)).toEqual({
      itemId: "concept:taxon:fukuiraptor",
      scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
      u: 0.5,
    });
    expect(canCommitMagnitudeRecallAnswer(drafted)).toBe(true);

    const feedback = commitMagnitudeRecallAnswer(drafted, {
      correctValueSI: 4.2,
      nowMs: 2_000,
    });
    expect(feedback).toMatchObject({
      phase: "feedback",
      answeredAtMs: 2_000,
      result: {
        itemId: "concept:taxon:fukuiraptor",
        scaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
        elapsedMs: 1_000,
        inputMethod: "axis-click",
      },
    });
    expect(updateMagnitudeRecallDraftAnswer(feedback, {
      scale: LOG_SCALE,
      answerU: 0.8,
      inputMethod: "drag",
    })).toBe(feedback);

    const next = startNextMagnitudeRecallTrial(feedback, {
      itemId: "entity:e-fossil",
      scaleId: BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
      startedAtMs: 3_000,
    });
    expect(next).toMatchObject({
      phase: "study",
      itemId: "entity:e-fossil",
      scaleId: BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
      answerValueSI: null,
      answerU: null,
      result: null,
    });
  });

  it("builds a reusable normalization fixture while excluding unset body_length", () => {
    const items = buildMagnitudeRecallItems(VISUALIZATION_GRAPH_FIXTURE);
    const itemIds = items.map((item) => item.itemId);

    expect(itemIds).toContain("concept:taxon:fukuiraptor");
    expect(itemIds).toContain("entity:e-fossil");
    expect(itemIds).not.toContain("concept:unresolved:o-unresolved");

    expect(items.find((item) => item.itemId === "concept:taxon:fukuiraptor")).toMatchObject({
      correctValueSI: 4.2,
      rangeSI: null,
      estimated: true,
      source: "rf-body-length-known",
      unitSI: "m",
    });
    expect(items.find((item) => item.itemId === "entity:e-fossil")).toMatchObject({
      correctValueSI: Math.sqrt(4 * 5.5),
      rangeSI: { minSI: 4, maxSI: 5.5 },
      estimated: true,
      source: "rf-body-length-range",
    });

    const fixture = buildMagnitudeRecallFixture(VISUALIZATION_GRAPH_FIXTURE);
    expect(fixture).toMatchObject({
      schemaVersion: "1.0.0",
      quantityKind: "body_length",
      unitSI: "m",
      scales: BODY_LENGTH_RECALL_SCALES.map((scale) => ({
        id: scale.id,
        normalization: scale.normalization,
        minValueSI: scale.minValueSI,
        maxValueSI: scale.maxValueSI,
        tickValuesSI: [...scale.tickValuesSI],
      })),
    });
    expect(fixture.items.every((item) => !Object.hasOwn(item, "x") && !Object.hasOwn(item, "y"))).toBe(true);
    expect(JSON.stringify(fixture)).not.toMatch(/pixel|three|dom/i);
  });
});
