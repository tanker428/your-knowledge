import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("user-facing classification copy", () => {
  it("uses the agreed labels without changing stored field names", async () => {
    const [html, source] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("src/ui/app.js", "utf8"),
    ]);
    expect(html).toContain("テーマに沿った分類");
    expect(html).toContain("説明・図表");
    expect(source).toContain("この対象は、どのようなものですか？");
    expect(source).toContain("この対象を、今回のテーマに沿って分類します");
    expect(source).toContain("data-chip-info");
    expect(source).toContain("genericCategories");
    expect(source).toContain("domainCategories");
    expect(source).not.toContain("分野別の浅い分類");
  });
});
