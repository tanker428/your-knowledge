import { describe, expect, it } from "vitest";
import { knowledgeEdgeLabel, knowledgeNodeLabel, knowledgeNodeText, knowledgePredicateLabel } from "../src/ui/knowledge-labels.js";

describe("knowledge graph display labels", () => {
  it("maps known node and edge types to their Japanese labels", () => {
    expect(knowledgeNodeLabel("Observation")).toBe("観察対象");
    expect(knowledgeEdgeLabel("PART_OF")).toBe("含まれる時代");
  });

  it("falls back for unknown node and edge types", () => {
    expect(knowledgeNodeLabel("FutureNode")).toBe("FutureNode");
    expect(knowledgeEdgeLabel("FutureEdge")).toBe("関連する");
  });

  it("converts RELATES_TO relation IDs using vocabulary labels", () => {
    expect(knowledgeEdgeLabel("RELATES_TO", "explains", [{ id: "explains", label: "説明している" }])).toBe("説明している");
    expect(knowledgeEdgeLabel("RELATES_TO", "same-exhibit", [{ id: "same-exhibit", label: "同じ展示" }])).toBe("同じ展示");
  });

  it("falls back when RELATES_TO has no relationType", () => {
    expect(knowledgeEdgeLabel("RELATES_TO")).toBe("関連する");
    expect(knowledgeEdgeLabel("RELATES_TO", "unknown-type", [])).toBe("関連する");
    expect(knowledgeEdgeLabel("UNKNOWN", "補足関係")).toBe("補足関係");
  });

  it("converts ReferenceFact predicates and labels QuestionSeed", () => {
    expect(knowledgeNodeLabel("QuestionSeed")).toBe("問題の材料");
    expect(knowledgePredicateLabel("classifiedAs")).toBe("分類");
    expect(knowledgePredicateLabel("livedDuring")).toBe("生息した時代");
    expect(knowledgeNodeText({ type: "ReferenceFact", predicate: "classifiedAs" })).toBe("分類");
    expect(knowledgeNodeText({ type: "ReferenceFact", predicate: "unknownPredicate" })).toBe("unknownPredicate");
    expect(knowledgeNodeText({ type: "Entity" })).toBe("対象・展示物");
    expect(knowledgeNodeText({ type: "ClassificationAssertion" })).toBe("分類情報");
    expect(knowledgeNodeText({ type: "QuestionSeed" })).toBe("問題の材料");
  });

  it("uses Entity names when no explicit label is present", () => {
    expect(knowledgeNodeText({ type: "Entity", name: "バシロサウルス" })).toBe("バシロサウルス");
    expect(knowledgeNodeText({ type: "Entity", name: "翼竜" })).toBe("翼竜");
  });

  it("prefers an explicit label over an Entity name", () => {
    expect(knowledgeNodeText({ type: "Entity", label: "展示ラベル", name: "バシロサウルス" })).toBe("展示ラベル");
  });

  it("keeps display text unchanged for node types without names", () => {
    expect(knowledgeNodeText({ type: "Visit", title: "博物館への訪問" })).toBe("博物館への訪問");
    expect(knowledgeNodeText({ type: "Photo", title: "化石の写真" })).toBe("化石の写真");
    expect(knowledgeNodeText({ type: "Observation", label: "頭骨" })).toBe("頭骨");
    expect(knowledgeNodeText({ type: "ReferenceFact", predicate: "classifiedAs" })).toBe("分類");
    expect(knowledgeNodeText({ type: "ReferenceNode", label: "鯨偶蹄目" })).toBe("鯨偶蹄目");
  });

  it("keeps the predicate fallback when no label, name, or title is present", () => {
    expect(knowledgeNodeText({ type: "ReferenceFact", predicate: "livedDuring" })).toBe("生息した時代");
  });

  it("keeps the referenceId fallback when earlier display fields are absent", () => {
    expect(knowledgeNodeText({ type: "ReferenceNode", referenceId: "taxon:cetacea" })).toBe("taxon:cetacea");
  });

  it("keeps the localized type fallback when no display fields are present", () => {
    expect(knowledgeNodeText({ type: "Entity" })).toBe("対象・展示物");
    expect(knowledgeNodeText({ type: "QuestionSeed" })).toBe("問題の材料");
  });
});
