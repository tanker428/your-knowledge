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

  it("prefers relationType for RELATES_TO", () => {
    expect(knowledgeEdgeLabel("RELATES_TO", "展示で関連")).toBe("展示で関連");
  });

  it("falls back when RELATES_TO has no relationType", () => {
    expect(knowledgeEdgeLabel("RELATES_TO")).toBe("関連する");
    expect(knowledgeEdgeLabel("UNKNOWN", "補足関係")).toBe("補足関係");
  });

  it("converts ReferenceFact predicates and labels QuestionSeed", () => {
    expect(knowledgeNodeLabel("QuestionSeed")).toBe("問題の材料");
    expect(knowledgePredicateLabel("classifiedAs")).toBe("分類");
    expect(knowledgePredicateLabel("livedDuring")).toBe("生息した時代");
    expect(knowledgeNodeText({ type: "ReferenceFact", predicate: "classifiedAs" })).toBe("分類");
    expect(knowledgeNodeText({ type: "ReferenceFact", predicate: "unknownPredicate" })).toBe("unknownPredicate");
  });
