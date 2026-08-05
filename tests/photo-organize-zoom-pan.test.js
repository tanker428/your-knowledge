import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Photo organize zoom and pan UI", () => {
  it("provides the lens, region, and observation controls", async () => {
    const html = await readFile("index.html", "utf8");
    expect(html).toContain('id="regionModeButton"');
    expect(html).toContain('id="magnifierButton"');
    expect(html).toContain('id="imageMagnifierLens"');
    expect(html).toContain('id="imageMagnifierInButton"');
    expect(html).toContain('id="imageMagnifierOutButton"');
    expect(html).toContain('id="organizeImageStage"');
  });

  it("binds right-button, wheel, and long-press lens interactions without serializing viewport state", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain("event.deltaY");
    expect(source).toContain("pointerdown");
    expect(source).toContain("event.button !== 2");
    expect(source).toContain("organizeLensLongPressTimer");
    expect(source).toContain("pointercancel");
    expect(source).toContain("pointerleave");
    expect(source).toContain("window.addEventListener(\"blur\"");
    expect(source).toContain("event.preventDefault();");
  });

  it("uses the highest available image surface and a clipped circular lens", async () => {
    const [html, source] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("src/ui/app.js", "utf8"),
    ]);
    expect(html).toContain("image-rendering:auto");
    expect(html).toContain("border-radius:50%");
    expect(html).toContain("pointer-events:none");
    expect(source).toContain('lensImage.src = $("#organizeImage")?.src');
    expect(source).toContain("organizeLensZoom");
    expect(source).not.toContain("stage.style.transform =");
  });

  it("keeps region persistence on the existing Observation update path", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain("updateObservation(observation");
    expect(source).toContain("region,");
    expect(source).toContain("persist();");
  });
});
