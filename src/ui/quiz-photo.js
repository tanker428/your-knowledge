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
  const overlay = region ? `<i class="quiz-photo-region" style="${regionStyle(region)}" aria-hidden="true"></i>` : "";
  return `<span class="quiz-photo-content"><span class="quiz-photo-media${className}" data-quiz-photo-media><span class="quiz-photo-image-frame" style="aspect-ratio:${frameWidth}/${frameHeight}"><img src="${escapeHtml(source)}" alt="" style="transform:rotate(${rotation}deg)" />${overlay}</span></span>${label}</span>`;
}

export function getQuizPhotoRegionStyle(region) {
  return regionStyle(region);
}
