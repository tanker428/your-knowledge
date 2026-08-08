import { describe, expect, it } from "vitest";
import { timelinePeriodSpan, timelinePeriodWidth } from "../src/ui/timeline-quiz.js";

describe("timeline quiz period sizing", () => {
  const options = [
    { id: "long", startMa: 200, endMa: 100 },
    { id: "short", startMa: 50, endMa: 25 },
    { id: "point", startMa: null, endMa: null },
  ];

  it("uses the longest period as the 100% baseline", () => {
    expect(timelinePeriodSpan(options)).toBe(100);
    expect(timelinePeriodWidth(options[0], options)).toBe(100);
  });

  it("gives a period-less point node the minimum width", () => {
    expect(timelinePeriodWidth(options[2], options)).toBe(8);
  });

  it("does not throw when startMa and endMa are null", () => {
    expect(() => timelinePeriodWidth({ startMa: null, endMa: null }, [{ startMa: null, endMa: null }])).not.toThrow();
  });
});
