import { normalizePhotoRotation, storedRegionToDisplayedRegion } from "../domain/photo-rotation.js";
import { escapeHtml } from "./html.js";
import { MISSING_PHOTO_SRC } from "./photo-assets.js";

function regionStyle(region) {
  if (!region) return "";
  return `left:${Number(region.x) || 0}%;top:${Number(region.y) || 0}%;width:${Number(region.w) || 0}%;height:${Number(region.h) || 0}%`;
}

/**
 * Render one full-photo media surface shared by quiz prompts and choices.
 * The region is an overlay; the source image is never cropped or rewritten.
 */
export function renderQuizPhotoMedia(photo, region, options = {}) {
  if (!photo) return "";
  const source = photo.src || photo.originalSrc || photo.thumbSrc || MISSING_PHOTO_SRC;
  const rotation = normalizePhotoRotation(photo.rotation);
  const width = Number(photo.width || photo.naturalWidth) || 4;
  const height = Number(photo.height || photo.naturalHeight) || 3;
  const className = options.className ? ` ${escapeHtml(options.className)}` : "";
  const label = options.label ? `<span class="quiz-photo-label">${escapeHtml(options.label)}</span>` : "";
  const transform = rotation ? `transform:rotate(${rotation}deg)` : "";
  const overlay = region ? `<i class="quiz-photo-region" data-quiz-region="${escapeHtml(JSON.stringify(region))}" style="${regionStyle(region)}" aria-hidden="true"></i>` : "";
  return `<span class="quiz-photo-content"><span class="quiz-photo-media${className}" data-quiz-photo-media><img src="${escapeHtml(source)}" alt=""${transform ? ` style="${transform}"` : ""} data-rotation="${rotation}" data-image-width="${width}" data-image-height="${height}" />${overlay}</span>${label}</span>`;
}

export function getQuizPhotoRegionStyle(region) {
  return regionStyle(region);
}

export function getContainedRegionRect(container, image, region) {
  if (!region || !container?.width || !container?.height || !image?.width || !image?.height) return null;
  const scale = Math.min(container.width / image.width, container.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  return {
    left: (container.width - width) / 2 + (Number(region.x) || 0) / 100 * width,
    top: (container.height - height) / 2 + (Number(region.y) || 0) / 100 * height,
    width: (Number(region.w) || 0) / 100 * width,
    height: (Number(region.h) || 0) / 100 * height,
  };
}

/**
 * Match a rotated, object-fit:contain image and its stored region to the
 * untransformed media box used by the absolute overlay.
 */
export function getQuizPhotoLayout(container, image, region, rotation) {
  if (!container?.width || !container?.height || !image?.width || !image?.height) return null;
  const normalizedRotation = normalizePhotoRotation(rotation);
  const imageSize = normalizedRotation % 180 === 0
    ? { width: image.width, height: image.height }
    : { width: image.height, height: image.width };
  const unrotatedScale = Math.min(container.width / image.width, container.height / image.height);
  const rotatedScale = Math.min(container.width / imageSize.width, container.height / imageSize.height);
  const displayedRegion = region
    ? storedRegionToDisplayedRegion({
        x: (Number(region.x) || 0) / 100,
        y: (Number(region.y) || 0) / 100,
        w: (Number(region.w) || 0) / 100,
        h: (Number(region.h) || 0) / 100,
      }, normalizedRotation)
    : null;
  const percentRegion = displayedRegion
    ? {
        x: displayedRegion.x * 100,
        y: displayedRegion.y * 100,
        w: displayedRegion.w * 100,
        h: displayedRegion.h * 100,
      }
    : null;
  return {
    imageScale: rotatedScale / unrotatedScale,
    regionRect: getContainedRegionRect(container, imageSize, percentRegion),
  };
}

export function syncQuizPhotoMedia(root = document) {
  root.querySelectorAll("[data-quiz-photo-media]").forEach((media) => {
    const mediaElement = /** @type {HTMLElement} */ (media);
    /** @type {HTMLImageElement|null} */
    const image = mediaElement.querySelector("img");
    /** @type {HTMLElement|null} */
    const region = mediaElement.querySelector("[data-quiz-region]");
    if (!image) return;
    const apply = () => {
      const rect = mediaElement.getBoundingClientRect();
      const rotation = Number(image.dataset.rotation) || 0;
      const sourceWidth = image.naturalWidth || Number(image.dataset.imageWidth);
      const sourceHeight = image.naturalHeight || Number(image.dataset.imageHeight);
      const storedRegion = region ? JSON.parse(region.dataset.quizRegion) : null;
      const layout = getQuizPhotoLayout(
        { width: rect.width, height: rect.height },
        { width: sourceWidth, height: sourceHeight },
        storedRegion,
        rotation,
      );
      if (!layout) return;
      image.style.transform = rotation ? `rotate(${rotation}deg) scale(${layout.imageScale})` : "";
      if (!region || !layout.regionRect) return;
      Object.assign(region.style, {
        left: `${layout.regionRect.left}px`,
        top: `${layout.regionRect.top}px`,
        width: `${layout.regionRect.width}px`,
        height: `${layout.regionRect.height}px`,
      });
    };
    if (image.complete) apply();
    image.addEventListener("load", apply, { once: true });
  });
}
