import { normalizePhotoRotation } from "../domain/photo-rotation.js";
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
  const className = options.className ? ` ${escapeHtml(options.className)}` : "";
  const label = options.label ? `<span class="quiz-photo-label">${escapeHtml(options.label)}</span>` : "";
  const scale = rotation % 180 === 0 ? "" : " scale(.75)";
  const transform = rotation ? ` style="transform:rotate(${rotation}deg)${scale}"` : "";
  const overlay = region ? `<i class="quiz-photo-region" style="${regionStyle(region)}" aria-hidden="true"></i>` : "";
  return `<span class="quiz-photo-content"><span class="quiz-photo-media${className}"${transform}><img src="${escapeHtml(source)}" alt="" />${overlay}</span>${label}</span>`;
}
