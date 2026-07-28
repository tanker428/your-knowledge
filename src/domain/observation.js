/** Minimum width and height for a selectable observation region. */
export const MIN_REGION_PERCENT = 3;

/**
 * Clamp a region to the displayed image coordinate space.
 * A null region means the whole photo.
 *
 * @param {{x:number,y:number,w:number,h:number}|null|undefined} region
 * @param {number} [minimum]
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function normalizeRegion(region, minimum = MIN_REGION_PERCENT) {
  if (!region) return null;
  const startX = clamp(Number(region.x), 0, 100);
  const startY = clamp(Number(region.y), 0, 100);
  const endX = clamp(startX + Math.max(0, Number(region.w)), 0, 100);
  const endY = clamp(startY + Math.max(0, Number(region.h)), 0, 100);
  const normalized = {
    x: round(startX),
    y: round(startY),
    w: round(endX - startX),
    h: round(endY - startY),
  };
  return normalized.w < minimum || normalized.h < minimum ? null : normalized;
}

/**
 * Create a normalized region from two points in percentage coordinates.
 * The input points may be outside the image; the result is clamped.
 *
 * @param {{x:number,y:number}} start
 * @param {{x:number,y:number}} end
 * @param {number} [minimum]
 * @returns {{x:number,y:number,w:number,h:number}|null}
 */
export function regionFromPoints(
  start,
  end,
  minimum = MIN_REGION_PERCENT,
) {
  const left = Math.min(start.x, end.x);
  const top = Math.min(start.y, end.y);
  const right = Math.max(start.x, end.x);
  const bottom = Math.max(start.y, end.y);
  return normalizeRegion(
    { x: left, y: top, w: right - left, h: bottom - top },
    minimum,
  );
}

/**
 * Build a manual Observation with the contract's initial values.
 *
 * @param {object} input
 * @param {string} input.id
 * @param {string} input.photoId
 * @param {string} input.label
 * @param {string} input.observationType
 * @param {{x:number,y:number,w:number,h:number}|null} [input.region]
 * @param {string} [input.domainPackId]
 * @returns {any}
 */
export function createObservation(input) {
  return {
    id: input.id,
    photoId: input.photoId,
    label: input.label.trim(),
    observationType: input.observationType,
    region: normalizeRegion(input.region),
    genericCategories: ["unknown"],
    learningRoles: ["direct"],
    domainPacks: [input.domainPackId || "other"],
    domainCategories: [],
    confidence: 1,
    status: "confirmed",
    visibleText: [],
    included: true,
    origin: "user",
    entityId: null,
  };
}

/**
 * Update only editable Observation fields. Classification state is preserved.
 *
 * @param {any} observation
 * @param {{label?:string,observationType?:string,region?:{x:number,y:number,w:number,h:number}|null}} patch
 * @returns {any}
 */
export function updateObservation(observation, patch) {
  return {
    ...observation,
    ...(patch.label !== undefined ? { label: patch.label.trim() } : {}),
    ...(patch.observationType !== undefined
      ? { observationType: patch.observationType }
      : {}),
    ...(patch.region !== undefined
      ? { region: normalizeRegion(patch.region) }
      : {}),
  };
}

/**
 * Remove one Observation from a Photo without mutating the input.
 *
 * @param {{observations:any[]}} photo
 * @param {string} observationId
 * @returns {{photo:any,removed:boolean}}
 */
export function removeObservation(photo, observationId) {
  const observations = photo.observations.filter(
    (observation) => observation.id !== observationId,
  );
  return {
    photo: { ...photo, observations },
    removed: observations.length !== photo.observations.length,
  };
}

function clamp(value, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function round(value) {
  return Math.round(value * 100) / 100;
}
