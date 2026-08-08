import { describe, expect, it } from "vitest";
import { suggestClassificationIds } from "../src/domain/classification-suggestions.js";

const registry = {
  genericCategories: [
    { id: "panel", label: "説明パネル", description: "説明文" },
    { id: "exhibit", label: "展示物", description: "標本" },
  ],
  categoriesByPack: { paleo: [{ id: "paleo:spinosaur", label: "スピノサウルス" }] },
};

describe("classification suggestions", () => {
  it("uses local context and returns deterministic recommendations", () => {
    const input = { observation: { label: "スピノサウルス", domainPacks: ["paleo"] }, photo: { title: "説明パネル" }, visit: { title: "古生物" }, registry };
    expect(suggestClassificationIds(input)).toEqual(suggestClassificationIds(input));
    expect(suggestClassificationIds(input).generic[0].id).toBe("panel");
    expect(suggestClassificationIds(input).domain[0].id).toBe("paleo:spinosaur");
  });

  it("does not force a selection when no rule matches", () => {
    const result = suggestClassificationIds({ observation: { label: "不明", domainPacks: ["paleo"] }, photo: {}, visit: {}, registry });
    expect(result.generic).toEqual([]);
    expect(result.domain).toEqual([]);
  });
});
