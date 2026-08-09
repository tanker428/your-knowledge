function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeRotation(rotation) {
  const value = Number(rotation) || 0;
  return [0, 90, 180, 270].includes(value) ? value : 0;
}

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
  const source = photo.src || photo.originalSrc || photo.thumbSrc || "";
  const rotation = normalizeRotation(photo.rotation);
  const width = Number(photo.width || photo.naturalWidth) || 4;
  const height = Number(photo.height || photo.naturalHeight) || 3;
  const frameWidth = rotation % 180 === 0 ? width : height;
  const frameHeight = rotation % 180 === 0 ? height : width;
  const className = options.className ? ` ${escapeHtml(options.className)}` : "";
  const label = options.label ? `<span class="quiz-photo-label">${escapeHtml(options.label)}</span>` : "";
  const overlay = region ? `<i class="quiz-photo-region" data-quiz-region="${escapeHtml(JSON.stringify(region))}" style="${regionStyle(region)}" aria-hidden="true"></i>` : "";
  return `<span class="quiz-photo-content"><span class="quiz-photo-media${className}" data-quiz-photo-media><img src="${escapeHtml(source)}" alt="" style="transform:rotate(${rotation}deg) scale(.82)" data-rotation="${rotation}" data-image-width="${frameWidth}" data-image-height="${frameHeight}" />${overlay}</span>${label}</span>`;
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

export function syncQuizPhotoMedia(root = document) {
  root.querySelectorAll("[data-quiz-photo-media]").forEach((media) => {
    const mediaElement = /** @type {HTMLElement} */ (media);
    /** @type {HTMLImageElement|null} */
    const image = mediaElement.querySelector("img");
    /** @type {HTMLElement|null} */
    const region = mediaElement.querySelector("[data-quiz-region]");
    if (!image || !region) return;
    const apply = () => {
      const rect = mediaElement.getBoundingClientRect();
      const rotation = Number(image.dataset.rotation) || 0;
      const sourceWidth = image.naturalWidth || Number(image.dataset.imageWidth);
      const sourceHeight = image.naturalHeight || Number(image.dataset.imageHeight);
      const imageSize = rotation % 180 === 0 ? { width: sourceWidth, height: sourceHeight } : { width: sourceHeight, height: sourceWidth };
      const contained = getContainedRegionRect({ width: rect.width, height: rect.height }, imageSize, JSON.parse(region.dataset.quizRegion));
      if (!contained) return;
      Object.assign(region.style, { left: `${contained.left}px`, top: `${contained.top}px`, width: `${contained.width}px`, height: `${contained.height}px` });
    };
    if (image.complete) apply();
    image.addEventListener("load", apply, { once: true });
  });
}
