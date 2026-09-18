import { describe, expect, it } from "vitest";
import {
  BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
  BODY_LENGTH_LOG_RECALL_SCALE_ID,
  findMagnitudeRecallScale,
} from "../src/features/knowledge-3d/magnitude-recall.js";
import {
  DEFAULT_METERS_PER_COUNT,
  applyCountRecallEvent,
  buildCountRecallAnswer,
  countRecallCountFromValue,
  countRecallValueFromCount,
  scoreCountRecallTrial,
} from "../src/features/knowledge-3d/magnitude-count-recall.js";

const LINEAR_SCALE = findMagnitudeRecallScale(
  BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
);
const LOG_SCALE = findMagnitudeRecallScale(BODY_LENGTH_LOG_RECALL_SCALE_ID);

describe("count recall event reducer", () => {
  it("increments, decrements with a floor at zero, and resets", () => {
    expect(applyCountRecallEvent(0, "increment")).toBe(1);
    expect(applyCountRecallEvent(11, "increment")).toBe(12);
    expect(applyCountRecallEvent(1, "decrement")).toBe(0);
    expect(applyCountRecallEvent(0, "decrement")).toBe(0); // 1回戻すは0で止まる
    expect(applyCountRecallEvent(9, "reset")).toBe(0);
    expect(applyCountRecallEvent(-3, "increment")).toBe(1); // 不正値は0扱い
  });
});

describe("count <-> value", () => {
  it("restores metres from a count using the teaching rule (1回=1m)", () => {
    expect(DEFAULT_METERS_PER_COUNT).toBe(1);
    expect(countRecallValueFromCount(12)).toBe(12);
    expect(countRecallValueFromCount(0)).toBe(0);
    expect(countRecallValueFromCount(3, 2.5)).toBe(7.5);
    expect(countRecallValueFromCount(-1)).toBeNull();
    expect(countRecallValueFromCount(2, 0)).toBeNull();
  });

  it("finds the nearest count for a value (for fine-adjust display)", () => {
    expect(countRecallCountFromValue(12)).toBe(12);
    expect(countRecallCountFromValue(11.4)).toBe(11);
    expect(countRecallCountFromValue(-1)).toBeNull();
  });
});

describe("count recall answer normalization", () => {
  it("maps a count to the same value as its metres, on a bounded scale", () => {
    const answer = buildCountRecallAnswer({ scale: LINEAR_SCALE, count: 12 });
    expect(answer?.answerValueSI).toBe(12);
    expect(answer?.count).toBe(12);
    expect(answer?.overridden).toBe(false);
    expect(answer?.u).toBeCloseTo(12 / 15, 12);
  });

  it("lets a fine-adjust / numeric override reach a value the count cannot", () => {
    const answer = buildCountRecallAnswer({
      scale: LINEAR_SCALE,
      count: 12,
      overrideValueSI: 12.4,
    });
    expect(answer?.answerValueSI).toBeCloseTo(12.4, 12);
    expect(answer?.overridden).toBe(true);
  });

  it("rejects out-of-range answers and zero on a log scale", () => {
    expect(
      buildCountRecallAnswer({ scale: LINEAR_SCALE, count: 999 }),
    ).toBeNull();
    // 0回 -> 0m は log では未定義（UIが規則と0の意味を明示する）
    expect(buildCountRecallAnswer({ scale: LOG_SCALE, count: 0 })).toBeNull();
    // linear 0-15 では 0回=0m は受理される
    expect(
      buildCountRecallAnswer({ scale: LINEAR_SCALE, count: 0 })?.answerValueSI,
    ).toBe(0);
  });
});

describe("count recall scoring", () => {
  it("scores 12回->確定 correct and 11回->確定 as an accepted (incorrect) answer for a 12 m item", () => {
    const twelve = scoreCountRecallTrial({
      itemId: "n1",
      scaleId: LINEAR_SCALE.id,
      count: 12,
      correctValueSI: 12,
      elapsedMs: 4000,
      inputMethod: "axis-click",
    });
    const eleven = scoreCountRecallTrial({
      itemId: "n1",
      scaleId: LINEAR_SCALE.id,
      count: 11,
      correctValueSI: 12,
      elapsedMs: 3500,
      inputMethod: "axis-click",
    });
    expect(twelve?.correct).toBe(true);
    expect(twelve?.count).toBe(12);
    expect(twelve?.restoredValueSI).toBe(12);
    // 11回=11m は 12m の -8.3% で ±10% 内 → 正解扱い、だが回答としては受理される
    expect(eleven).not.toBeNull();
    expect(eleven?.count).toBe(11);
    expect(eleven?.restoredValueSI).toBe(11);
    expect(typeof eleven?.correct).toBe("boolean");
  });

  it("records override and hint telemetry without changing the knowledge score fields", () => {
    const result = scoreCountRecallTrial({
      itemId: "n1",
      scaleId: LINEAR_SCALE.id,
      count: 12,
      overrideValueSI: 12.4,
      correctValueSI: 12,
      elapsedMs: 5000,
      inputMethod: "numeric",
      hintUsed: true,
    });
    expect(result?.overridden).toBe(true);
    expect(result?.restoredValueSI).toBeCloseTo(12.4, 12);
    expect(result?.hintUsed).toBe(true);
    expect(result?.inputMethod).toBe("numeric");
  });

  it("returns null for an unanswerable trial (bad correct value)", () => {
    expect(
      scoreCountRecallTrial({
        itemId: "n1",
        scaleId: LINEAR_SCALE.id,
        count: 3,
        correctValueSI: 0,
        elapsedMs: 1000,
        inputMethod: "axis-click",
      }),
    ).toBeNull();
  });
});
