export const BODY_LENGTH_QUANTITY_KIND = "body_length";
export const LENGTH_UNIT_SI = "m";

const LENGTH_UNIT_TO_METERS = Object.freeze({
  m: 1,
  meter: 1,
  meters: 1,
  metre: 1,
  metres: 1,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  centimetre: 0.01,
  centimetres: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  millimeters: 0.001,
  millimetre: 0.001,
  millimetres: 0.001,
});

/**
 * @typedef {import('./visualization-graph.js').VisualizationMeasurement} VisualizationMeasurement
 */

/**
 * @typedef {object} QuantityValue
 * @property {string} quantityKind
 * @property {number|null} valueSI
 * @property {number|null} minSI
 * @property {number|null} maxSI
 * @property {string|null} unitSI
 * @property {boolean} estimated
 */

/**
 * Normalize a body-length payload into SI meters. The saved ReferenceFact value
 * should already use valueSI/minSI/maxSI, but raw value/min/max + unit keeps the
 * helper useful for import or fixture generation without expanding the schema.
 *
 * @param {Record<string, any>} value
 * @returns {QuantityValue|null}
 */
export function normalizeBodyLengthQuantity(value) {
  if (!isPlainObject(value)) return null;
  const rawUnit = cleanString(value.unit);
  const multiplier = rawUnit ? lengthUnitMultiplier(rawUnit) : null;
  const canConvertRaw = multiplier !== null;

  const valueSI = finiteNumberOrNull(value.valueSI) ?? (canConvertRaw ? scaledFiniteNumberOrNull(value.value, multiplier) : null);
  const minSI = finiteNumberOrNull(value.minSI) ?? (canConvertRaw ? scaledFiniteNumberOrNull(value.min, multiplier) : null);
  const maxSI = finiteNumberOrNull(value.maxSI) ?? (canConvertRaw ? scaledFiniteNumberOrNull(value.max, multiplier) : null);

  return {
    quantityKind: BODY_LENGTH_QUANTITY_KIND,
    valueSI,
    minSI,
    maxSI,
    unitSI: rawUnit ? (canConvertRaw ? LENGTH_UNIT_SI : null) : normalizedDeclaredLengthUnit(value.unitSI),
    estimated: value.estimated === true,
  };
}

/**
 * Normalize a saved ReferenceFact.value payload for VisualizationGraphV1.
 *
 * @param {unknown} value
 * @returns {QuantityValue|null}
 */
export function normalizeQuantityValue(value) {
  if (!isPlainObject(value)) return null;
  const quantityKind = cleanString(value.quantityKind);
  if (!quantityKind) return null;
  if (quantityKind === BODY_LENGTH_QUANTITY_KIND) return normalizeBodyLengthQuantity(value);

  return {
    quantityKind,
    valueSI: finiteNumberOrNull(value.valueSI),
    minSI: finiteNumberOrNull(value.minSI),
    maxSI: finiteNumberOrNull(value.maxSI),
    unitSI: cleanString(value.unitSI),
    estimated: value.estimated === true,
  };
}

/**
 * Convert a ReferenceFact quantity into the VisualizationGraphV1 measurement
 * shape. Non-quantity facts and malformed payloads are ignored.
 *
 * @param {Record<string, any>} fact
 * @returns {VisualizationMeasurement|null}
 */
export function measurementFromQuantityReferenceFact(fact) {
  if (fact?.valueType !== "quantity") return null;
  const quantity = normalizeQuantityValue(fact.value);
  if (!quantity) return null;
  return {
    ...quantity,
    confidence: confidenceOrNull(fact.confidence),
    source: firstCleanString(fact.sourceNote, fact.sourceType, fact.id),
  };
}

/**
 * Resolve a measurement to the scalar used by the Size layout. Range values use
 * the geometric mean only when both bounds are positive.
 *
 * @param {VisualizationMeasurement} measurement
 * @param {string} [unitSI]
 * @returns {{representativeValue:number, rangeSI:{minSI:number, maxSI:number}|null}|null}
 */
export function resolveMeasurementForLogScale(measurement, unitSI = LENGTH_UNIT_SI) {
  if (!measurement || measurement.unitSI !== unitSI) return null;
  if (isPositiveFiniteNumber(measurement.valueSI)) {
    return { representativeValue: measurement.valueSI, rangeSI: null };
  }
  if (
    isPositiveFiniteNumber(measurement.minSI) &&
    isPositiveFiniteNumber(measurement.maxSI) &&
    measurement.minSI <= measurement.maxSI
  ) {
    return {
      representativeValue: Math.sqrt(measurement.minSI * measurement.maxSI),
      rangeSI: {
        minSI: measurement.minSI,
        maxSI: measurement.maxSI,
      },
    };
  }
  return null;
}

/** @param {string} unit */
function lengthUnitMultiplier(unit) {
  const key = unit.trim().toLowerCase();
  return Object.hasOwn(LENGTH_UNIT_TO_METERS, key) ? LENGTH_UNIT_TO_METERS[key] : null;
}

/** @param {unknown} unit */
function normalizedDeclaredLengthUnit(unit) {
  const cleaned = cleanString(unit);
  if (!cleaned) return LENGTH_UNIT_SI;
  return lengthUnitMultiplier(cleaned) === 1 ? LENGTH_UNIT_SI : cleaned;
}

/** @param {unknown} value @param {number|null} multiplier */
function scaledFiniteNumberOrNull(value, multiplier) {
  if (multiplier === null) return null;
  const number = finiteNumberOrNull(value);
  return number === null ? null : number * multiplier;
}

/** @param {unknown} value @returns {number|null} */
function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** @param {unknown} value @returns {number|null} */
function confidenceOrNull(value) {
  const number = finiteNumberOrNull(value);
  return number !== null && number >= 0 && number <= 1 ? number : null;
}

/** @param {unknown} value */
function isPositiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {string|null} */
function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** @param {unknown[]} values @returns {string|null} */
function firstCleanString(...values) {
  for (const value of values) {
    const cleaned = cleanString(value);
    if (cleaned) return cleaned;
  }
  return null;
}
