import { normalizeScaleBoundedValue } from "./magnitude-recall.js";
import { LENGTH_UNIT_SI } from "./measurements.js";

export const MAGNITUDE_SILHOUETTE_SCHEMA_VERSION = "1.0.0";
export const DEFAULT_SILHOUETTE_DRAW_UNITS_PER_METER = 0.24;

/**
 * @typedef {"reference"|"answer"|"correct"} SilhouettePresentationRole
 */

/**
 * Normalized fractions are relative to the asset viewBox width/height.
 * `bodyLengthStartX` to `bodyLengthEndX` is the in-image interval that
 * corresponds to the real body length.
 *
 * @typedef {object} SilhouetteCalibration
 * @property {number} bodyLengthStartX
 * @property {number} bodyLengthEndX
 * @property {number} baselineY
 * @property {number} anchorX
 * @property {number} anchorY
 */

/**
 * @typedef {object} SilhouetteAsset
 * @property {string} assetId
 * @property {string} assetVersion
 * @property {"image/svg+xml"} mimeType
 * @property {"side"} view
 * @property {number} viewBoxWidth
 * @property {number} viewBoxHeight
 * @property {SilhouetteCalibration} calibration
 * @property {string|null} href
 * @property {string} sourceLabel
 * @property {string} licenseLabel
 * @property {boolean} schematic
 */

/**
 * @typedef {object} SilhouetteBinding
 * @property {string} bindingId
 * @property {string} targetId
 * @property {string} assetId
 * @property {"body_length"} measurementKind
 */

/**
 * @typedef {object} SilhouetteDimensions
 * @property {number} bodyLengthDrawUnits
 * @property {number} calibrationSpanDrawUnits
 * @property {number} imageWidthDrawUnits
 * @property {number} imageHeightDrawUnits
 * @property {number} aspectRatio
 * @property {number} calibrationSpanFraction
 */

/**
 * @typedef {object} SilhouettePresentationSpec
 * @property {string} schemaVersion
 * @property {string} itemId
 * @property {string} label
 * @property {string} assetId
 * @property {string} assetVersion
 * @property {string|null} href
 * @property {SilhouettePresentationRole} role
 * @property {number} valueSI
 * @property {typeof LENGTH_UNIT_SI} unitSI
 * @property {number} axisU
 * @property {number} lane
 * @property {number} drawUnitsPerMeter
 * @property {SilhouetteDimensions} dimensions
 * @property {SilhouetteCalibration} calibration
 * @property {boolean} schematic
 * @property {string[]} warnings
 */

/**
 * @param {SilhouetteAsset|null|undefined} asset
 * @returns {number|null}
 */
export function silhouetteCalibrationSpanFraction(asset) {
  const start = finiteNumberOrNull(asset?.calibration?.bodyLengthStartX);
  const end = finiteNumberOrNull(asset?.calibration?.bodyLengthEndX);
  if (start === null || end === null) return null;
  if (start < 0 || start > 1 || end < 0 || end > 1 || start === end) return null;
  return Math.abs(end - start);
}

/**
 * @param {SilhouetteAsset|null|undefined} asset
 * @returns {number|null}
 */
export function silhouetteImageAspectRatio(asset) {
  const width = finiteNumberOrNull(asset?.viewBoxWidth);
  const height = finiteNumberOrNull(asset?.viewBoxHeight);
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  return height / width;
}

/**
 * Compute renderer-independent draw dimensions. Body length is linear in
 * meters even when the caller later places the spec on a log axis.
 *
 * @param {SilhouetteAsset} asset
 * @param {number} valueSI
 * @param {number} [drawUnitsPerMeter]
 * @returns {SilhouetteDimensions|null}
 */
export function computeSilhouetteDimensions(
  asset,
  valueSI,
  drawUnitsPerMeter = DEFAULT_SILHOUETTE_DRAW_UNITS_PER_METER,
) {
  const lengthMeters = finiteNumberOrNull(valueSI);
  const unitsPerMeter = finiteNumberOrNull(drawUnitsPerMeter);
  const calibrationSpanFraction = silhouetteCalibrationSpanFraction(asset);
  const aspectRatio = silhouetteImageAspectRatio(asset);
  if (
    lengthMeters === null
    || unitsPerMeter === null
    || calibrationSpanFraction === null
    || aspectRatio === null
    || lengthMeters < 0
    || unitsPerMeter <= 0
  ) {
    return null;
  }

  const bodyLengthDrawUnits = lengthMeters * unitsPerMeter;
  const imageWidthDrawUnits = bodyLengthDrawUnits / calibrationSpanFraction;
  return {
    bodyLengthDrawUnits,
    calibrationSpanDrawUnits: bodyLengthDrawUnits,
    imageWidthDrawUnits,
    imageHeightDrawUnits: imageWidthDrawUnits * aspectRatio,
    aspectRatio,
    calibrationSpanFraction,
  };
}

/**
 * @param {{
 *   itemId: string,
 *   label?: string,
 *   asset: SilhouetteAsset,
 *   role: SilhouettePresentationRole,
 *   valueSI: number,
 *   scale?: import('./magnitude-recall.js').MagnitudeRecallScale|null,
 *   axisU?: number|null,
 *   lane?: number,
 *   drawUnitsPerMeter?: number,
 *   warnings?: string[],
 * }} input
 * @returns {SilhouettePresentationSpec|null}
 */
export function buildSilhouettePresentationSpec(input) {
  const itemId = cleanString(input?.itemId);
  const role = normalizePresentationRole(input?.role);
  const valueSI = finiteNumberOrNull(input?.valueSI);
  if (!itemId || !role || valueSI === null || valueSI < 0) return null;
  const dimensions = computeSilhouetteDimensions(
    input.asset,
    valueSI,
    input.drawUnitsPerMeter ?? DEFAULT_SILHOUETTE_DRAW_UNITS_PER_METER,
  );
  if (!dimensions) return null;
  const drawUnitsPerMeter = finiteNumberOrNull(input.drawUnitsPerMeter)
    ?? DEFAULT_SILHOUETTE_DRAW_UNITS_PER_METER;
  const axisU = finiteNumberOrNull(input.axisU) ?? (input.scale
    ? normalizeScaleBoundedValue(valueSI, input.scale)
    : null);
  if (axisU === null || axisU < 0 || axisU > 1) return null;
  const lane = finiteNumberOrNull(input.lane) ?? 0;
  return {
    schemaVersion: MAGNITUDE_SILHOUETTE_SCHEMA_VERSION,
    itemId,
    label: cleanString(input.label) || itemId,
    assetId: input.asset.assetId,
    assetVersion: input.asset.assetVersion,
    href: input.asset.href,
    role,
    valueSI,
    unitSI: LENGTH_UNIT_SI,
    axisU,
    lane: Math.trunc(lane),
    drawUnitsPerMeter,
    dimensions,
    calibration: { ...input.asset.calibration },
    schematic: input.asset.schematic,
    warnings: Array.isArray(input.warnings) ? input.warnings.filter((item) => typeof item === "string") : [],
  };
}

/**
 * @param {unknown} value
 * @returns {SilhouettePresentationRole|null}
 */
function normalizePresentationRole(value) {
  return value === "reference" || value === "answer" || value === "correct" ? value : null;
}

/** @param {unknown} value @returns {number|null} */
function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** @param {unknown} value @returns {string|null} */
function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
