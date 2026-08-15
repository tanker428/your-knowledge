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
  const rawLeft = Number(region.x);
  const rawTop = Number(region.y);
  const rawRight = rawLeft + Math.max(0, Number(region.w));
  const rawBottom = rawTop + Math.max(0, Number(region.h));
  const startX = clamp(rawLeft, 0, 100);
  const startY = clamp(rawTop, 0, 100);
  const endX = clamp(rawRight, 0, 100);
  const endY = clamp(rawBottom, 0, 100);
  const normalized = {
    x: round(startX),
    y: round(startY),
    w: round(endX - startX),
    h: round(endY - startY),
  };
  return normalized.w < minimum || normalized.h < minimum ? null : normalized;
}

/**
 * Return the actual image content rectangle inside an object-fit: contain box.
 * Coordinates are in the same viewport space as the container rectangle.
 */
export function displayedImageRect(container, naturalWidth, naturalHeight, maxHeight = 650) {
  const width = Number(container?.width) || 0;
  const height = Number(container?.height) || 0;
  const imageWidth = Number(naturalWidth) || 0;
  const imageHeight = Number(naturalHeight) || 0;
  if (!width || !height || !imageWidth || !imageHeight) return { ...container };
  const scale = Math.min(width / imageWidth, Math.min(height, maxHeight) / imageHeight);
  const contentWidth = imageWidth * scale;
  const contentHeight = imageHeight * scale;
  return {
    left: Number(container.left) + (width - contentWidth) / 2,
    top: Number(container.top) + (height - contentHeight) / 2,
    width: contentWidth,
    height: contentHeight,
  };
}

export function resetRegionDraft() {
  return { drawing: false, pointerId: null, start: null, region: null };
}

export function restoreRegionAfterCancel(region) {
  return region ? { ...region } : null;
}

export function observationReferences(project, observationId) {
  return {
    relations: (project.relations || []).filter(
      (relation) => relation.sourceId === observationId || relation.targetId === observationId,
    ),
    facts: (project.facts || []).filter(
      (fact) =>
        fact.targetId === observationId ||
        fact.targetObservationId === observationId ||
        fact.sourceObservationId === observationId,
    ),
  };
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
