import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { buildVerifiedReferenceFact, renderReferenceFactEditor } from "../src/ui/reference-fact-editor.js";

const referenceGraph = {
  nodes: [
    { id: "taxon:root", label: "四足類", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1 },
    { id: "taxon:child", label: "獣脚類", axis: "taxonomy", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 2 },
    { id: "geo:period", label: "ジュラ紀", axis: "geological-time", status: "verified", quizEligible: true, visible: true, internalOnly: false, order: 1 },
  ],
  edges: [{ id: "child", type: "SUBCLASS_OF", sourceId: "taxon:child", targetId: "taxon:root" }],
  metadata: { displayRootIdsByAxis: {} },
};

describe("ReferenceFact user-facing copy", () => {
  it("renders the existing plain-language editor and submits the persisted fact contract", () => {
    const rendered = renderReferenceFactEditor({ id: "Observation:o1" }, referenceGraph);
    const dom = new JSDOM(rendered);
    const form = dom.window.document.querySelector("form");
    expect(form.dataset.referenceFactForm).toBe("Observation:o1");
    expect(form.textContent).toContain("この対象の正しい分類・時代を登録");
    expect(form.textContent).toContain("最も詳細な項目を正解に使います");
    expect(form.querySelector('option[value="taxon:child"]').textContent).toBe("分類：獣脚類");

    expect(buildVerifiedReferenceFact({
      id: "fact-1",
      nodeId: "Observation:o1",
      referenceId: "taxon:child",
      sourceNote: "展示図録",
      referenceGraph,
    })).toEqual({
      id: "fact-1",
      targetObservationId: "o1",
      predicate: "classifiedAs",
      value: "taxon:child",
      axis: "taxonomy",
      sourceType: "curated",
      sourceNote: "展示図録",
      status: "verified",
    });
  });

  it("uses plain-language copy in the main tab descriptions", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

    expect(html).toContain("写真から対象を選び、分類・関係・確認済みの知識を段階的に確認します。");
    expect(html).toContain("この訪問で確認した対象と参照知識から、分類・時代の配置問題を生成します。");
    expect(html).not.toContain("verified ReferenceFact");
  });
});
