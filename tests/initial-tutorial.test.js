import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_STEPS,
  isTutorialSeen,
  markTutorialSeen,
  nextTutorialIndex,
  previousTutorialIndex,
} from "../src/ui/tutorial.js";

describe("initial tutorial", () => {
  it("defines all six user-facing screen roles and navigation boundaries", () => {
    expect(TUTORIAL_STEPS).toHaveLength(6);
    expect(TUTORIAL_STEPS.map((step) => step.screen)).toEqual([
      "概要",
      "写真",
      "写真を整理",
      "知識マップ",
      "学ぶ",
      "コレクション",
    ]);
    expect(nextTutorialIndex(0)).toBe(1);
    expect(nextTutorialIndex(TUTORIAL_STEPS.length - 1)).toBe(5);
    expect(previousTutorialIndex(0)).toBe(0);
    expect(previousTutorialIndex(5)).toBe(4);
  });

  it("stores tutorial completion separately from project data", () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) || null,
      setItem: (key, value) => values.set(key, value),
    };
    expect(isTutorialSeen(storage)).toBe(false);
    markTutorialSeen(storage);
    expect(values.get(TUTORIAL_STORAGE_KEY)).toBe("seen");
    expect(isTutorialSeen(storage)).toBe(true);
  });

  it("keeps tutorial controls, copy, and mobile layout in the UI", async () => {
    const [html, css, app] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("styles.css", "utf8"),
      readFile("src/ui/app.js", "utf8"),
    ]);
    expect(html).toContain('id="tutorialModal"');
    expect(html).toContain("スキップ");
    expect(html).toContain("戻る");
    expect(html).toContain("次へ");
    expect(html).toContain("完了");
    expect(html).toContain('id="openTutorialButton"');
    expect(app).toContain("maybeShowTutorial");
    expect(app).toContain("#tutorialSkipButton");
    expect(app).toContain("markTutorialSeen");
    expect(css).toContain(".tutorial-card");
    expect(css).toContain("@media(max-width:520px){.tutorial-card");
  });
});
