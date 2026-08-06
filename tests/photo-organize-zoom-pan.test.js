import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Photo organize zoom and pan UI", () => {
  it("provides the lens, region, and observation controls", async () => {
    const [html, source] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("src/ui/app.js", "utf8"),
    ]);
    expect(html).toContain('id="imageMagnifierLens"');
    expect(html).toContain('id="imageMagnifierInButton"');
    expect(html).toContain('id="imageMagnifierOutButton"');
    expect(html).toContain('id="organizeImageStage"');
    expect(source).toContain("id=\"stepAddObservation\"");
    expect(html).toContain('id="newObservationRegion"');
    expect(html).toContain("写真全体");
    expect(html).toContain("写真内の範囲");
    expect(html).not.toContain('id="regionModeButton"');
    expect(html).not.toContain('id="addObservationButton"');
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
    expect(source).toContain("state.regionDrawing || organizeInteractionMode === \"region\"");
    expect(source).toContain("#observationOverlay, #regionDrawLayer");
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

  it("allows the same lens interaction over image and Observation rectangles", async () => {
    const [html, source] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("src/ui/app.js", "utf8"),
    ]);
    expect(html).toContain(".annotated-photo #observationOverlay { z-index: 3; }");
    expect(html).toContain("z-index:8");
    expect(html).toContain("pointer-events:none");
    expect(source).toContain("target?.closest(\"#imageMagnifierControls\")");
    expect(source).toContain("event.button !== 2");
    expect(source).toContain("organizeLensPointerId");
    expect(source).toContain("hideOrganizeLens");
  });

  it("keeps region persistence on the existing Observation update path", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain("updateObservation(observation");
    expect(source).toContain("region,");
    expect(source).toContain("persist();");
  });

  it("uses one clear route for adding observations and preserves direct magnifier operation", async () => {
    const [html, source] = await Promise.all([
      readFile("index.html", "utf8"),
      readFile("src/ui/app.js", "utf8"),
    ]);
    expect(html).not.toContain("虫眼鏡の使い方");
    expect(source).not.toContain("magnifierButton");
    expect(source).not.toContain("regionModeButton");
    expect(source).not.toContain("addObservationButton");
    expect(source).toContain("stepAddObservation");
    expect(html).toContain("PCは写真上で右ボタンを押している間");
    expect(source).toContain("event.button !== 2");
  });
});
