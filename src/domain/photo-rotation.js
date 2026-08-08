/** The only rotation values persisted by the photo model. */
export const PHOTO_ROTATIONS = Object.freeze([0, 90, 180, 270]);

/**
 * Normalise legacy, missing, or invalid values without changing the photo
 * record shape. Missing values intentionally mean the original orientation.
 * @param {unknown} value
 * @returns {0|90|180|270}
 */
export function normalizePhotoRotation(value) {
  const numeric = Number(value);
  return PHOTO_ROTATIONS.includes(numeric) ? /** @type {any} */ (numeric) : 0;
}

/**
 * Rotate clockwise in 90 degree steps.
 * @param {unknown} current
 * @param {number} [steps]
 * @returns {0|90|180|270}
 */
export function rotatePhoto(current, steps = 1) {
  const base = normalizePhotoRotation(current);
  const offset = Number.isFinite(Number(steps)) ? Math.trunc(Number(steps)) : 1;
  return /** @type {any} */ (PHOTO_ROTATIONS[(PHOTO_ROTATIONS.indexOf(base) + offset % 4 + 4) % 4]);
}

/**
 * Convert a point from the rotated display back to the stored image space.
 * CSS rotate() uses clockwise-positive screen coordinates.
 * @param {{x:number,y:number}} point normalized to 0..1
 * @param {unknown} rotation
 * @returns {{x:number,y:number}}
 */
export function unrotateImagePoint(point, rotation) {
  const x = Math.min(1, Math.max(0, Number(point?.x) || 0));
  const y = Math.min(1, Math.max(0, Number(point?.y) || 0));
  switch (normalizePhotoRotation(rotation)) {
    case 90: return { x: y, y: 1 - x };
    case 180: return { x: 1 - x, y: 1 - y };
    case 270: return { x: 1 - y, y: x };
    default: return { x, y };
  }
}

/**
 * Convert a point from the displayed, rotated image into stored coordinates.
 * The returned point is always clamped to the original image bounds.
 * @param {{x:number,y:number}} point
 * @param {unknown} rotation
 * @returns {{x:number,y:number}}
 */
export function displayedPointToStoredPoint(point, rotation) {
  return unrotateImagePoint(point, rotation);
}

/**
 * Convert a stored normalized region into its displayed rotated rectangle.
 * This is useful for non-CSS renderers and keeps labels and hit areas aligned
 * with the same geometry as the image.
 * @param {{x:number,y:number,w:number,h:number}|null|undefined} region
 * @param {unknown} rotation
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function storedRegionToDisplayedRegion(region, rotation) {
  if (!region) return null;
  const x = Math.min(1, Math.max(0, Number(region.x) || 0));
  const y = Math.min(1, Math.max(0, Number(region.y) || 0));
  const w = Math.min(1 - x, Math.max(0, Number(region.w) || 0));
  const h = Math.min(1 - y, Math.max(0, Number(region.h) || 0));
  switch (normalizePhotoRotation(rotation)) {
    case 90: return { x: 1 - y - h, y: x, w: h, h: w };
    case 180: return { x: 1 - x - w, y: 1 - y - h, w, h };
    case 270: return { x: y, y: 1 - x - w, w: h, h: w };
    default: return { x, y, w, h };
  }
}
