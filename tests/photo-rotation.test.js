import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import {
  normalizePhotoRotation,
  rotatePhoto,
  unrotateImagePoint,
} from "../src/domain/photo-rotation.js";
import { buildExportDocument } from "../src/features/project/project-json.js";
import { migrateProjectDocument } from "../src/features/project/migrate.js";
import { observationNumberAnchorClass } from "../src/ui/organize-view.js";

describe("photo rotation", () => {
  it("anchors Observation numbers to the displayed upper-left corner after rotation", async () => {
    const styles = await readFile(new URL("../styles.css", import.meta.url), "utf8");
    const markup = [90, 180, 270].map((rotation) => `<span class="${observationNumberAnchorClass(rotation)}">1</span>`).join("");
    const dom = new JSDOM(`<style>${styles}</style><div class="observation-box">${markup}</div>`);
    for (const rotation of [90, 180, 270]) {
      const anchor = dom.window.document.querySelector(`.${observationNumberAnchorClass(rotation)}`);
      expect(dom.window.getComputedStyle(anchor).transform).toBe(`rotate(-${rotation}deg)`);
    }
    expect(observationNumberAnchorClass(undefined)).toBe("observation-number-anchor-0");
  });

  it("normalizes missing and unsupported values to the compatible default", () => {
    expect(normalizePhotoRotation(undefined)).toBe(0);
    expect(normalizePhotoRotation(45)).toBe(0);
    expect(normalizePhotoRotation(90)).toBe(90);
    expect(normalizePhotoRotation("270")).toBe(270);
  });

  it("cycles clockwise in four stable steps", () => {
    expect(rotatePhoto(0)).toBe(90);
    expect(rotatePhoto(270)).toBe(0);
    expect(rotatePhoto(0, -1)).toBe(270);
  });

  it("maps displayed coordinates back to the stored image without changing region data", () => {
    expect(unrotateImagePoint({ x: 0.25, y: 0.75 }, 90)).toEqual({ x: 0.75, y: 0.75 });
    expect(unrotateImagePoint({ x: 0.25, y: 0.75 }, 180)).toEqual({ x: 0.75, y: 0.25 });
    expect(unrotateImagePoint({ x: 0.25, y: 0.75 }, 270)).toEqual({ x: 0.25, y: 0.25 });
  });

  it("keeps rotation and Observation region through JSON migration", () => {
    const project = /** @type {any} */ ({
      id: "p", updatedAt: 1,
      activeVisitId: "v",
      visits: [{ id: "v", title: "訪問" }],
      photos: [{
        id: "photo-1", visitId: "v", file: "a.jpg", order: 1, title: "写真",
        status: "in-progress", source: "upload", rotation: 90,
        observations: [{ id: "observation-1", photoId: "photo-1", label: "対象", region: { x: 10, y: 20, w: 30, h: 40 } }],
      }],
      relations: [], facts: [],
    });
    const exported = /** @type {any} */ (buildExportDocument({ project }));
    expect(exported.photos[0].rotation).toBe(90);
    expect(exported.observations[0].region).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    const migrated = /** @type {any} */ (migrateProjectDocument(project, { demoPhotos: [], demoRelations: [], demoFacts: [] }));
    expect(migrated.ok).toBe(true);
    const restored = /** @type {any} */ (migrated.project);
    expect(restored.photos[0].rotation).toBe(90);
    expect(restored.photos[0].observations[0].region).toEqual({ x: 10, y: 20, w: 30, h: 40 });
  });

});
