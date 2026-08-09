import { describe, expect, it } from "vitest";
import {
  getContainedRegionRect,
  getQuizPhotoLayout,
  renderQuizPhotoMedia,
} from "../src/ui/quiz-photo.js";
import { MISSING_PHOTO_SRC } from "../src/ui/photo-assets.js";

const photo = {
  id: "p1",
  src: "/photos/original.jpg",
  thumbSrc: "/photos/thumb.jpg",
  width: 1600,
  height: 900,
  rotation: 90,
};

describe("quiz photo renderer", () => {
  it("uses the original source and overlays the normalized region", () => {
    const html = renderQuizPhotoMedia(photo, { x: 10, y: 20, w: 30, h: 40 }, { label: "対象", className: "quiz-choice-media" });
    expect(html).toContain("/photos/original.jpg");
    expect(html).not.toContain("/photos/thumb.jpg");
    expect(html).toContain("left:10%;top:20%;width:30%;height:40%");
    expect(html).toContain("transform:rotate(90deg)");
    expect(html).toContain("対象");
  });

  it("renders the full photo without a region overlay when region is absent", () => {
    const html = renderQuizPhotoMedia({ ...photo, rotation: 0 }, null, { label: "全体" });
    expect(html).toContain("/photos/original.jpg");
    expect(html).not.toContain("quiz-photo-region");
    expect(html).not.toContain("transform:");
  });

  it("leaves the quarter-turn contain scale to media synchronization", () => {
    const html = renderQuizPhotoMedia(photo, null);
    expect(html).toContain("transform:rotate(90deg)");
    expect(html).not.toContain("scale(.82)");
    expect(html).toContain('data-image-width="1600" data-image-height="900"');
  });

  it("uses the shared missing-photo fallback when no image source exists", () => {
    expect(renderQuizPhotoMedia({ rotation: 0 }, null)).toContain(MISSING_PHOTO_SRC);
  });
});

describe("quiz photo contain geometry", () => {
  const container = { width: 400, height: 300 };
  const region = { x: 10, y: 20, w: 30, h: 40 };

  it("places portrait and landscape regions inside their actual contained image", () => {
    const portrait = getContainedRegionRect(container, { width: 1108, height: 1477 }, region);
    expect(portrait).not.toBeNull();
    expect(portrait.left).toBeCloseTo(109.979689, 6);
    expect(portrait.top).toBeCloseTo(60, 6);
    expect(portrait.width).toBeCloseTo(67.515234, 6);
    expect(portrait.height).toBeCloseTo(120, 6);

    const landscape = getContainedRegionRect(container, { width: 1477, height: 1108 }, region);
    expect(landscape).not.toBeNull();
    expect(landscape.left).toBeCloseTo(40.036101, 6);
    expect(landscape.top).toBeCloseTo(60, 6);
    expect(landscape.width).toBeCloseTo(119.972924, 6);
    expect(landscape.height).toBeCloseTo(120, 6);
  });

  it.each([
    ["portrait", { width: 1108, height: 1477 }, 0, 1, { left: 109.979689, top: 60, width: 67.515234, height: 120 }],
    ["portrait", { width: 1108, height: 1477 }, 90, 1.333032, { left: 160.009025, top: 30, width: 159.963899, height: 90 }],
    ["portrait", { width: 1108, height: 1477 }, 180, 1, { left: 222.505078, top: 120, width: 67.515234, height: 120 }],
    ["portrait", { width: 1108, height: 1477 }, 270, 1.333032, { left: 80.027076, top: 180, width: 159.963899, height: 90 }],
    ["landscape", { width: 1477, height: 1108 }, 0, 1, { left: 40.036101, top: 60, width: 119.972924, height: 120 }],
    ["landscape", { width: 1477, height: 1108 }, 90, 0.750169, { left: 177.494922, top: 30, width: 90.020311, height: 90 }],
    ["landscape", { width: 1477, height: 1108 }, 180, 1, { left: 239.990975, top: 120, width: 119.972924, height: 120 }],
    ["landscape", { width: 1477, height: 1108 }, 270, 0.750169, { left: 132.484766, top: 180, width: 90.020311, height: 90 }],
  ])("aligns a %s image at %d degrees", (_orientation, image, rotation, imageScale, expected) => {
    const layout = getQuizPhotoLayout(container, image, region, rotation);
    expect(layout).not.toBeNull();
    expect(layout.imageScale).toBeCloseTo(imageScale, 6);
    expect(layout.regionRect.left).toBeCloseTo(expected.left, 6);
    expect(layout.regionRect.top).toBeCloseTo(expected.top, 6);
    expect(layout.regionRect.width).toBeCloseTo(expected.width, 6);
    expect(layout.regionRect.height).toBeCloseTo(expected.height, 6);
  });
});
