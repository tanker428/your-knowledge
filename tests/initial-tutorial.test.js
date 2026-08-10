import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  TUTORIAL_STORAGE_KEY,
  TUTORIAL_STEPS,
  isTutorialSeen,
  markTutorialSeen,
  nextTutorialIndex,
  previousTutorialIndex,
  renderTutorialStep,
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

  it("renders tutorial copy and navigation states into the real dialog DOM", async () => {
    const [html, styles] = await Promise.all([
      readFile(new URL("../index.html", import.meta.url), "utf8"),
      readFile(new URL("../styles.css", import.meta.url), "utf8"),
    ]);
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const style = document.createElement("style");
    style.textContent = styles;
    document.head.append(style);
    const modal = document.querySelector("#tutorialModal");
    expect(modal?.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.querySelector("#openTutorialButton")?.textContent).toContain("使い方");
    expect(document.querySelector("#tutorialSkipButton")?.textContent).toBe("スキップ");
    expect(dom.window.getComputedStyle(document.querySelector(".tutorial-navigation")).display).toBe("flex");

    expect(renderTutorialStep(document, 0)).toBe(true);
    expect(document.querySelector("#tutorialScreen")?.textContent).toBe("概要");
    expect(document.querySelector("#tutorialProgress")?.textContent).toBe("1 / 6");
    expect(document.querySelector("#tutorialBackButton")?.disabled).toBe(true);
    expect(document.querySelector("#tutorialNextButton")?.classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#tutorialDoneButton")?.classList.contains("hidden")).toBe(true);

    expect(renderTutorialStep(document, 5)).toBe(true);
    expect(document.querySelector("#tutorialScreen")?.textContent).toBe("コレクション");
    expect(document.querySelector("#tutorialNextButton")?.classList.contains("hidden")).toBe(true);
    expect(document.querySelector("#tutorialDoneButton")?.classList.contains("hidden")).toBe(false);
  });
});
