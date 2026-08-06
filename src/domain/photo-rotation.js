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
