import { describe, expect, it } from "vitest";
import { formatGeologicalAgeJa } from "../src/features/knowledge-graph/timeline-placement.js";

describe("formatGeologicalAgeJa", () => {
  it("reads geological ages as Japanese years instead of Ma", () => {
    expect(formatGeologicalAgeJa(251.9)).toBe("2億5190万年前");
    expect(formatGeologicalAgeJa(145)).toBe("1億4500万年前");
    expect(formatGeologicalAgeJa(100.5)).toBe("1億50万年前");
    expect(formatGeologicalAgeJa(66)).toBe("6600万年前");
    expect(formatGeologicalAgeJa(2.58)).toBe("258万年前");
    expect(formatGeologicalAgeJa(4567)).toBe("45億6700万年前");
  });

  it("keeps recent ages readable and treats 0 Ma as the present", () => {
    // Whole-man rounding would collapse 11,700 years into "1万年前".
    expect(formatGeologicalAgeJa(0.0117)).toBe("1.2万年前");
    expect(formatGeologicalAgeJa(0.0042)).toBe("4200年前");
    expect(formatGeologicalAgeJa(0)).toBe("現在");
    expect(formatGeologicalAgeJa(null)).toBe("現在");
    expect(formatGeologicalAgeJa(undefined)).toBe("現在");
    expect(formatGeologicalAgeJa(Number.NaN)).toBe("現在");
  });

  it("carries a rounded remainder into the 億 place", () => {
    expect(formatGeologicalAgeJa(100)).toBe("1億年前");
    expect(formatGeologicalAgeJa(199.99999)).toBe("2億年前");
  });
});
