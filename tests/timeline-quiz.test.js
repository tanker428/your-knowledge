import { describe, expect, it } from "vitest";
import { timelineNodeGeometry, timelinePeriodSpan, timelinePeriodWidth, timelinePosition } from "../src/ui/timeline-quiz.js";

describe("timeline quiz period sizing", () => {
  const options = [
    { id: "long", startMa: 200, endMa: 100 },
    { id: "short", startMa: 50, endMa: 25 },
    { id: "point", startMa: 75, endMa: null },
  ];

  it("uses the complete visible age range as the proportional baseline", () => {
    expect(timelinePeriodSpan(options)).toBe(175);
    expect(timelinePeriodWidth(options[0], options)).toBeCloseTo(57.143, 3);
    expect(timelinePeriodWidth(options[1], options)).toBeCloseTo(14.286, 3);
  });

  it("places periods and points by normalized real age", () => {
    expect(timelinePosition(options[0], options)).toBe(0);
    expect(timelinePosition(options[1], options)).toBeCloseTo(85.714, 3);
    expect(timelinePosition(options[2], options)).toBeCloseTo(71.429, 3);
    expect(timelineNodeGeometry(options[0], options)).toMatchObject({ kind: "period", left: 0 });
    expect(timelineNodeGeometry(options[2], options)).toEqual({ kind: "point", left: expect.any(Number), width: 0 });
  });

  it("does not throw when startMa and endMa are null", () => {
    expect(() => timelinePeriodWidth({ startMa: null, endMa: null }, [{ startMa: null, endMa: null }])).not.toThrow();
  });
});
