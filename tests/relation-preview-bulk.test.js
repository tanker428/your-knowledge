import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Relation candidate preview and bulk registration", () => {
  it("requires explicit selection after opening a candidate preview", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    const html = await readFile("index.html", "utf8");
    expect(source).toContain("openRelationPreview(id)");
    expect(source).toContain("chooseRelationPreview");
    expect(html).toContain("choosePreviewRelationButton");
  });

  it("keeps multi-registration as individual existing Relation records", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain("data-relation-type-choice");
    expect(source).toContain("candidates.forEach");
    expect(source).toContain("createRelation({ ...candidate, id: uid(\"relation\") })");
    expect(source).not.toContain("types: candidates");
  });
});
