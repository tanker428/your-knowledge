import { describe, expect, it } from "vitest";
import { renderQuizPhotoMedia } from "../src/ui/quiz-photo.js";
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

  it("uses the rotated aspect ratio for quarter turns", () => {
    const html = renderQuizPhotoMedia(photo, null);
    expect(html).toContain("transform:rotate(90deg) scale(.82)");
  });

  it("uses the shared missing-photo fallback when no image source exists", () => {
    expect(renderQuizPhotoMedia({ rotation: 0 }, null)).toContain(MISSING_PHOTO_SRC);
  });
});
