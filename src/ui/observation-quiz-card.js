import { normalizePhotoRotation } from "../domain/photo-rotation.js";
import { escapeHtml } from "./html.js";
import { MISSING_PHOTO_SRC } from "./photo-assets.js";

function finitePositive(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : fallback;
}

function boundedPercent(value, fallback) {
  return Math.min(100, Math.max(0, Number.isFinite(Number(value)) ? Number(value) : fallback));
}

/** Convert a percentage Observation region into a source-pixel SVG viewBox. */
export function observationCropGeometry(photo, region) {
  const width = finitePositive(photo?.originalWidth || photo?.width, 100);
  const height = finitePositive(photo?.originalHeight || photo?.height, 100);
  if (!region) return { sourceWidth: width, sourceHeight: height, x: 0, y: 0, width, height };
  const xPercent = boundedPercent(region.x, 0);
  const yPercent = boundedPercent(region.y, 0);
  const widthPercent = Math.min(100 - xPercent, Math.max(0.1, boundedPercent(region.w, 100)));
  const heightPercent = Math.min(100 - yPercent, Math.max(0.1, boundedPercent(region.h, 100)));
  return {
    sourceWidth: width,
    sourceHeight: height,
    x: width * xPercent / 100,
    y: height * yPercent / 100,
    width: width * widthPercent / 100,
    height: height * heightPercent / 100,
  };
}

/**
 * Render a reusable Observation card as a real region crop plus its name.
 * Classification and timeline boards can reuse this unchanged and only own
 * their board/drop behavior.
 */
export function renderObservationQuizCard(card, photo, options = {}) {
  const crop = observationCropGeometry(photo, card?.region);
  const source = photo?.src || photo?.originalSrc || photo?.thumbSrc || MISSING_PHOTO_SRC;
  const rotation = normalizePhotoRotation(photo?.rotation);
  const scale = rotation % 180 === 0 ? "" : " scale(.75)";
  const transform = rotation ? ` style="transform:rotate(${rotation}deg)${scale}"` : "";
  const resultClass = options.result === "correct" ? " correct" : options.result === "incorrect" ? " incorrect" : "";
  const selectedClass = options.selected ? " selected" : "";
  const draggable = options.draggable === true ? "true" : "false";
  const placement = options.placementLabel ? `<small>${escapeHtml(options.placementLabel)}</small>` : "";
  return `<button type="button" class="observation-quiz-card${selectedClass}${resultClass}" data-observation-card="${escapeHtml(card.cardId || card.observationId)}" draggable="${draggable}" aria-label="${escapeHtml(`${card.label || "観察対象"}のカード${options.placementLabel ? `。現在の配置は${options.placementLabel}` : ""}`)}" aria-pressed="${options.selected ? "true" : "false"}" aria-grabbed="${options.selected ? "true" : "false"}" ${options.disabled ? "disabled" : ""}><span class="observation-card-crop"><svg viewBox="${crop.x} ${crop.y} ${crop.width} ${crop.height}" role="img" aria-label="${escapeHtml(card.label || "観察対象")}"${transform}><image href="${escapeHtml(source)}" x="0" y="0" width="${crop.sourceWidth}" height="${crop.sourceHeight}" preserveAspectRatio="none"></image></svg></span><strong>${escapeHtml(card.label || "観察対象")}</strong>${placement}</button>`;
}
