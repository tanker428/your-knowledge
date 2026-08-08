import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import {
  displayedPointToStoredPoint,
  normalizePhotoRotation,
  rotatePhoto,
  storedRegionToDisplayedRegion,
  unrotateImagePoint,
} from "../src/domain/photo-rotation.js";
import { buildExportDocument } from "../src/features/project/project-json.js";
import { migrateProjectDocument } from "../src/features/project/migrate.js";

describe("photo rotation", () => {
  it("anchors Observation numbers to the displayed upper-left corner after rotation", async () => {
    const source = await readFile("src/ui/app.js", "utf8");
    expect(source).toContain("observation-number-anchor-${normalizePhotoRotation(photo.rotation)}");
    const styles = await readFile("styles.css", "utf8");
    expect(styles).toContain("observation-number-anchor-90");
    expect(styles).toContain("transform:rotate(-90deg)");
    expect(styles).toContain("transform:rotate(-180deg)");
    expect(styles).toContain("transform:rotate(-270deg)");
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

  it("maps points and regions consistently for every quarter-turn", () => {
    const stored = { x: 0.2, y: 0.3, w: 0.4, h: 0.25 };
    for (const rotation of [0, 90, 180, 270]) {
      const displayed = storedRegionToDisplayedRegion(stored, rotation);
      const center = displayedPointToStoredPoint(
        { x: displayed.x + displayed.w / 2, y: displayed.y + displayed.h / 2 },
        rotation,
      );
      expect(center.x).toBeCloseTo(stored.x + stored.w / 2);
      expect(center.y).toBeCloseTo(stored.y + stored.h / 2);
    }
  });

  it("keeps rotated region edges inside the displayed image", () => {
    const region = { x: 0.05, y: 0.1, w: 0.8, h: 0.7 };
    for (const rotation of [0, 90, 180, 270]) {
      const displayed = storedRegionToDisplayedRegion(region, rotation);
      expect(displayed.x).toBeGreaterThanOrEqual(0);
      expect(displayed.y).toBeGreaterThanOrEqual(0);
      expect(displayed.x + displayed.w).toBeLessThanOrEqual(1);
      expect(displayed.y + displayed.h).toBeLessThanOrEqual(1);
    }
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
