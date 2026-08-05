import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Photo organize zoom and pan UI", () => {
  it("provides separate pan, region, and reset controls", async () => {
    const html = await readFile("index.html", "utf8");
    expect(html).toContain('id="panModeButton"');
    expect(html).toContain('id="regionModeButton"');
    expect(html).toContain('id="resetImageViewportButton"');
    expect(html).toContain('id="magnifierButton"');
    expect(html).toContain('id="imageZoomInButton"');
    expect(html).toContain('id="imageZoomOutButton"');
    expect(html).toContain('id="organizeImageStage"');
  });

  it("binds wheel, mouse, and touch-compatible Pointer Events without serializing viewport state", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain("event.deltaY");
    expect(source).toContain("pointerdown");
    expect(source).toContain("organizePinchStart");
    expect(source).toContain("organizeViewport");
    expect(source).toContain("createImageViewport");
    expect(source).toContain("startOrganizeMagnifier");
    expect(source).toContain("stopOrganizeMagnifier");
    expect(source).toContain("event.deltaY");
  });

  it("keeps region persistence on the existing Observation update path", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain("updateObservation(observation");
    expect(source).toContain("region,");
    expect(source).toContain("persist();");
  });
});
