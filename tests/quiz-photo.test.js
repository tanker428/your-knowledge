import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderQuizPhotoMedia } from "../src/ui/quiz-photo.js";
import { MISSING_PHOTO_SRC } from "../src/ui/photo-assets.js";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const photo = {
  id: "p1",
  src: "/photos/original.jpg",
  thumbSrc: "/photos/thumb.jpg",
  rotation: 90,
};

function renderDom(rendered, containerClass = "") {
  const dom = new JSDOM(`<style>${styles}</style><main class="${containerClass}">${rendered}</main>`);
  return { dom, root: dom.window.document.querySelector("main") };
}

describe("quiz photo renderer", () => {
  it("builds one image-sized wrapper for the image and raw percentage overlay", () => {
    const rendered = renderQuizPhotoMedia(photo, { x: 10, y: 20, w: 30, h: 40 }, { label: "対象", className: "quiz-choice-media" });
    const { dom, root } = renderDom(rendered, "quiz-choice-option");
    const media = root.querySelector(".quiz-photo-media");
    const image = media.querySelector(":scope > img");
    const region = media.querySelector(":scope > .quiz-photo-region");

    expect(media.classList.contains("quiz-choice-media")).toBe(true);
    expect([...media.children]).toEqual([image, region]);
    expect(image.getAttribute("src")).toBe("/photos/original.jpg");
    expect(image.getAttribute("src")).not.toBe("/photos/thumb.jpg");
    expect(image.style.transform).toBe("");
    expect(media.style.transform).toBe("rotate(90deg) scale(.75)");
    expect(region.style.left).toBe("10%");
    expect(region.style.top).toBe("20%");
    expect(region.style.width).toBe("30%");
    expect(region.style.height).toBe("40%");
    expect(root.querySelector(".quiz-photo-label").textContent).toBe("対象");

    const mediaStyle = dom.window.getComputedStyle(media);
    const imageStyle = dom.window.getComputedStyle(image);
    expect(mediaStyle.position).toBe("relative");
    expect(mediaStyle.display).toBe("block");
    expect(mediaStyle.width).toBe("100%");
    expect(mediaStyle.aspectRatio).toBe("auto");
    expect(mediaStyle.overflow).not.toBe("hidden");
    expect(imageStyle.display).toBe("block");
    expect(imageStyle.width).toBe("100%");
    expect(imageStyle.height).toBe("auto");
    expect(imageStyle.objectFit).toBe("fill");
  });

  it.each([
    [0, ""],
    [90, "rotate(90deg) scale(.75)"],
    [180, "rotate(180deg)"],
    [270, "rotate(270deg) scale(.75)"],
  ])("rotates the shared image-and-overlay wrapper at %d degrees", (rotation, expectedTransform) => {
    const { root } = renderDom(renderQuizPhotoMedia({ ...photo, rotation }, { x: 1, y: 2, w: 3, h: 4 }));
    const media = root.querySelector(".quiz-photo-media");
    const image = media.querySelector("img");
    const region = media.querySelector(".quiz-photo-region");

    expect(media.style.transform).toBe(expectedTransform);
    expect(image.style.transform).toBe("");
    expect(region.parentElement).toBe(media);
    expect(region.style.cssText).toContain("left: 1%");
    expect(region.style.cssText).not.toContain("px");
  });

  it.each([
    ["landscape", 1477, 1108],
    ["portrait", 1108, 1477],
  ])("keeps a quarter-turned %s sample inside its unrotated layout box", (_orientation, width, height) => {
    const { root } = renderDom(renderQuizPhotoMedia(photo, null));
    const transform = root.querySelector(".quiz-photo-media").style.transform;
    const scale = Number(/scale\(([^)]+)\)/.exec(transform)?.[1]);
    const layoutWidth = 1;
    const layoutHeight = height / width;
    const rotatedWidth = layoutHeight * scale;
    const rotatedHeight = layoutWidth * scale;

    expect(rotatedWidth).toBeLessThanOrEqual(layoutWidth);
    expect(rotatedHeight).toBeLessThanOrEqual(layoutHeight);
  });

  it("keeps the same intrinsic image structure when a region is absent", () => {
    const rendered = renderQuizPhotoMedia({ ...photo, rotation: 0 }, null, { label: "全体" });
    const { dom, root } = renderDom(rendered, "quiz-photo-card");
    const media = root.querySelector(".quiz-photo-media");
    const image = media.querySelector(":scope > img");

    expect(media.querySelector(".quiz-photo-region")).toBeNull();
    expect(media.style.transform).toBe("");
    expect(root.querySelector(".quiz-photo-label").textContent).toBe("全体");
    for (const element of [media, ...media.querySelectorAll("*")]) {
      expect([...element.attributes].filter(({ name }) => name.startsWith("data-"))).toEqual([]);
    }
    expect(dom.window.getComputedStyle(media).aspectRatio).toBe("auto");
    expect(dom.window.getComputedStyle(image).height).toBe("auto");
    expect(dom.window.getComputedStyle(image).objectFit).toBe("fill");
  });

  it("uses the shared missing-photo fallback when no image source exists", () => {
    const { root } = renderDom(renderQuizPhotoMedia({ rotation: 0 }, null));
    expect(root.querySelector("img").getAttribute("src")).toBe(MISSING_PHOTO_SRC);
  });
});
