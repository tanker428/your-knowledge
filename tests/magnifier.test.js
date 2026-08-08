import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { clampMagnifierZoom, magnifierImagePosition, magnifierPoint } from "../src/ui/magnifier.js";

describe("shared circular magnifier", () => {
  const rect = { left: 10, top: 20, right: 410, bottom: 320, width: 400, height: 300 };

  it("keeps zoom within the documented range and step", () => {
    expect(clampMagnifierZoom(0)).toBe(2);
    expect(clampMagnifierZoom(3.24)).toBe(3);
    expect(clampMagnifierZoom(99)).toBe(6);
  });

  it("keeps the pressed point at the lens center", () => {
    const point = magnifierPoint(rect, { x: 210, y: 170 });
    const position = magnifierImagePosition(rect, point, 200, 3);
    expect(position.left + (point.x - rect.left - 100) * 3).toBeCloseTo(100);
    expect(position.top + (point.y - rect.top - 50) * 3).toBeCloseTo(100);
  });

  it("clamps edge points without moving their source coordinate", () => {
    const point = magnifierPoint(rect, { x: -100, y: 999 });
    expect(point.x).toBe(rect.left);
    expect(point.y).toBe(rect.bottom);
    expect(point.u).toBe(0);
    expect(point.v).toBe(1);
  });

  it("uses the shared controller for quiz and Relation photos without persisting lens state", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain('mountMagnifier(quizPhotoCard, quizPhotoCard?.querySelector("img"));');
    expect(source).toContain('mountMagnifier(card.querySelector(".endpoint-image"), card.querySelector("img"), { showControls: false })');
    expect(source).not.toContain("state.magnifier");
    expect(source).not.toContain("state.lens");
  });

  it("keeps the lens non-interactive except for its explicit mobile zoom controls", async () => {
    const source = await readFile("src/ui/magnifier.js", "utf8");
    expect(source).toContain('event.button !== 2');
    expect(source).toContain("pointercancel");
    expect(source).toContain("window.addEventListener(\"blur\", hide)");
    expect(await readFile("styles.css", "utf8")).toContain(".shared-magnifier");
    expect(await readFile("styles.css", "utf8")).toContain("pointer-events:none");
  });
});
