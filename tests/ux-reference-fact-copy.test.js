import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("ReferenceFact user-facing copy", () => {
  it("uses plain-language copy while keeping the existing save contract", async () => {
    const source = await readFile(new URL("../src/ui/app.js", import.meta.url), "utf8");

    expect(source).toContain("この対象の正しい分類・時代を登録");
    expect(source).toContain("クイズや知識マップで正解として使う、確認済みの情報を登録します。");
    expect(source).toContain("情報の根拠（任意）");
    expect(source).toContain("確認した資料や展示説明");
    expect(source).toContain("確認済みの知識を追加");
    expect(source).toContain("state.referenceFacts.push");
    expect(source).toContain('status: "verified"');

    expect(source).not.toContain("参照知識を設定</strong>");
    expect(source).not.toContain("verified ReferenceFactを追加");
    expect(source).not.toContain("verified ReferenceGraphが読み込まれていません");
    expect(source).not.toContain("ReferenceFactを削除");
    expect(source).not.toContain("VERIFIED REFERENCE");
  });

  it("uses plain-language copy in the main tab descriptions", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

    expect(html).toContain("写真から対象を選び、分類・関係・確認済みの知識を段階的に確認します。");
    expect(html).toContain("この訪問で確認した対象と参照知識から、分類・時代の配置問題を生成します。");
    expect(html).not.toContain("verified ReferenceFact");
  });
});
