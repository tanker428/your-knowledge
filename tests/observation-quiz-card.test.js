import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { observationCropGeometry, renderObservationQuizCard } from "../src/ui/observation-quiz-card.js";

const card = { cardId: "o1", observationId: "o1", label: "Skull", region: { x: 10, y: 20, w: 30, h: 40 } };
const photo = { src: "/photo.jpg", originalWidth: 1200, originalHeight: 800, rotation: 0 };

describe("reusable Observation quiz card", () => {
  it("converts the region to a source-pixel crop", () => {
    expect(observationCropGeometry(photo, card.region)).toEqual({
      sourceWidth: 1200,
      sourceHeight: 800,
      x: 120,
      y: 160,
      width: 360,
      height: 320,
    });
  });

  it("renders the full quiz photo with the Observation rectangle overlay", () => {
    const dom = new JSDOM(renderObservationQuizCard(card, photo, { draggable: true, selected: true, placementLabel: "Old" }));
    const root = dom.window.document.querySelector(".observation-quiz-card");
    const media = root.querySelector(".quiz-photo-media");
    const image = media.querySelector("img");
    const region = media.querySelector(".quiz-photo-region");
    expect(root.dataset.observationCard).toBe("o1");
    expect(root.getAttribute("draggable")).toBe("true");
    expect(root.getAttribute("aria-pressed")).toBe("true");
    expect(root.classList.contains("placed")).toBe(true);
    expect(root.querySelector("svg")).toBeNull();
    expect(image.getAttribute("src")).toBe("/photo.jpg");
    expect(region.style.left).toBe("10%");
    expect(region.style.top).toBe("20%");
    expect(region.style.width).toBe("30%");
    expect(region.style.height).toBe("40%");
    expect(root.querySelector("strong").textContent).toBe("Skull");
    expect(root.querySelector("small").textContent).toContain("Old");
  });

  it("keeps rotation on the full-photo media and uses the missing-photo fallback", () => {
    const dom = new JSDOM(renderObservationQuizCard({ ...card, region: null }, { rotation: 90 }, { result: "incorrect" }));
    const root = dom.window.document.querySelector(".observation-quiz-card");
    expect(root.classList.contains("incorrect")).toBe(true);
    expect(root.querySelector(".quiz-photo-media").style.transform).toBe("rotate(90deg) scale(.75)");
    expect(root.querySelector(".quiz-photo-media img").getAttribute("src")).toMatch(/^data:image\//);
    expect(root.querySelector(".quiz-photo-region")).toBeNull();
  });

  it("marks unplaced cards redundantly and renders a non-interactive rotated slot thumbnail", () => {
    const unplaced = new JSDOM(renderObservationQuizCard(card, photo, { placed: false, placementLabel: "Unplaced" }));
    const root = unplaced.window.document.querySelector(".observation-quiz-card");
    expect(root.classList.contains("unplaced")).toBe(true);
    expect(root.querySelector(".observation-card-placement-status")).not.toBeNull();

    const thumbnail = new JSDOM(renderObservationQuizCard(card, { ...photo, rotation: 270 }, { variant: "thumbnail" }));
    expect(thumbnail.window.document.querySelector("button")).toBeNull();
    expect(thumbnail.window.document.querySelector(".observation-quiz-card-thumbnail svg").style.transform).toBe("rotate(270deg) scale(.75)");
    expect(thumbnail.window.document.querySelector("image").getAttribute("href")).toBe("/photo.jpg");
  });
});
