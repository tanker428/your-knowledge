import { normalizeScaleBoundedValue } from "./magnitude-recall.js";
import { LENGTH_UNIT_SI } from "./measurements.js";

export const MAGNITUDE_SIZE_REPRODUCTION_SCHEMA_VERSION = "1.0.0";

// Draw units per metre for the proportional size bar. Chosen so that a 12 m
// dinosaur and a ~1.7 m human both fit a comfortable board without clipping.
export const DEFAULT_SIZE_REPRODUCTION_DRAW_UNITS_PER_METER = 0.24;

/**
 * Built-in reference objects ("基準物") drawn at the same proportional scale as
 * the answer bar so learners judge size by comparison, not by absolute pixels.
 * Values are teaching approximations, deliberately labelled as such.
 */
export const SIZE_REPRODUCTION_REFERENCE_OBJECTS = Object.freeze([
  Object.freeze({ id: "human-adult", label: "おとなの人（目安）", valueSI: 1.7, unitSI: LENGTH_UNIT_SI }),
  Object.freeze({ id: "door", label: "ドア（目安）", valueSI: 2, unitSI: LENGTH_UNIT_SI }),
  Object.freeze({ id: "car", label: "自動車（目安）", valueSI: 4.5, unitSI: LENGTH_UNIT_SI }),
]);

export const DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT = SIZE_REPRODUCTION_REFERENCE_OBJECTS[0];

/**
 * @typedef {object} SizeReproductionReferenceObject
 * @property {string} id
 * @property {string} label
 * @property {number} valueSI
 * @property {string} unitSI
 */

/**
 * @typedef {object} SizeReproductionGeometry
 * @property {number} drawUnitsPerMeter
 * @property {number} answerValueSI
 * @property {number} answerLengthDrawUnits
 * @property {number} referenceValueSI
 * @property {number} referenceLengthDrawUnits
 * @property {number} ratio            answer length / reference length (== value ratio)
 * @property {SizeReproductionReferenceObject} referenceObject
 */

/**
 * Proportional (linear) draw length for a real length in metres. The length is
 * always proportional to metres — the log/linear *scale* only affects where a
 * value sits on the number line, never the physical size shown here.
 *
 * @param {number} valueSI
 * @param {number} [drawUnitsPerMeter]
 * @returns {number|null}
 */
export function sizeReproductionLengthDrawUnits(
  valueSI,
  drawUnitsPerMeter = DEFAULT_SIZE_REPRODUCTION_DRAW_UNITS_PER_METER,
) {
  const meters = finiteNumberOrNull(valueSI);
  const unitsPerMeter = finiteNumberOrNull(drawUnitsPerMeter);
  if (meters === null || unitsPerMeter === null || meters < 0 || unitsPerMeter <= 0) return null;
  return meters * unitsPerMeter;
}

/**
 * Inverse of {@link sizeReproductionLengthDrawUnits}: turn a dragged bar length
 * back into a real length in metres so the answer is scored on valueSI, not on
 * an opaque scale factor.
 *
 * @param {number} drawLengthUnits
 * @param {number} [drawUnitsPerMeter]
 * @returns {number|null}
 */
export function sizeReproductionValueFromDrawLength(
  drawLengthUnits,
  drawUnitsPerMeter = DEFAULT_SIZE_REPRODUCTION_DRAW_UNITS_PER_METER,
) {
  const length = finiteNumberOrNull(drawLengthUnits);
  const unitsPerMeter = finiteNumberOrNull(drawUnitsPerMeter);
  if (length === null || unitsPerMeter === null || length < 0 || unitsPerMeter <= 0) return null;
  return length / unitsPerMeter;
}

/**
 * @param {Partial<SizeReproductionReferenceObject>|null|undefined} object
 * @returns {SizeReproductionReferenceObject}
 */
export function resolveSizeReproductionReferenceObject(object) {
  const valueSI = finiteNumberOrNull(object?.valueSI);
  if (!object || valueSI === null || valueSI <= 0) {
    return DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT;
  }
  return {
    id: cleanString(object.id) || DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT.id,
    label: cleanString(object.label) || DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT.label,
    valueSI,
    unitSI: cleanString(object.unitSI) || LENGTH_UNIT_SI,
  };
}

/**
 * Compute renderer-independent proportional geometry for the answer bar and the
 * reference object, sharing one draw scale so their lengths compare directly.
 *
 * @param {{
 *   answerValueSI: number,
 *   referenceObject?: Partial<SizeReproductionReferenceObject>|null,
 *   drawUnitsPerMeter?: number,
 * }} input
 * @returns {SizeReproductionGeometry|null}
 */
export function computeSizeReproductionGeometry(input) {
  const drawUnitsPerMeter = finiteNumberOrNull(input?.drawUnitsPerMeter)
    ?? DEFAULT_SIZE_REPRODUCTION_DRAW_UNITS_PER_METER;
  const answerValueSI = finiteNumberOrNull(input?.answerValueSI);
  if (answerValueSI === null || answerValueSI < 0 || drawUnitsPerMeter <= 0) return null;

  const referenceObject = resolveSizeReproductionReferenceObject(input?.referenceObject);
  const answerLengthDrawUnits = sizeReproductionLengthDrawUnits(answerValueSI, drawUnitsPerMeter);
  const referenceLengthDrawUnits = sizeReproductionLengthDrawUnits(referenceObject.valueSI, drawUnitsPerMeter);
  if (answerLengthDrawUnits === null || referenceLengthDrawUnits === null || referenceLengthDrawUnits <= 0) {
    return null;
  }

  return {
    drawUnitsPerMeter,
    answerValueSI,
    answerLengthDrawUnits,
    referenceValueSI: referenceObject.valueSI,
    referenceLengthDrawUnits,
    ratio: answerLengthDrawUnits / referenceLengthDrawUnits,
    referenceObject,
  };
}

/**
 * Normalize a size-reproduction interaction into the {answerValueSI, u} shape the
 * shared magnitude-recall state machine consumes. Accepts a dragged bar length,
 * a direct SI value (numeric input), or a scale unit position (⑤ / number line).
 *
 * @param {{
 *   scale: import('./magnitude-recall.js').MagnitudeRecallScale,
 *   drawLengthUnits?: unknown,
 *   valueSI?: unknown,
 *   answerU?: unknown,
 *   drawUnitsPerMeter?: number,
 * }} input
 * @returns {{answerValueSI:number, u:number}|null}
 */
export function buildSizeReproductionAnswer(input) {
  const scale = input?.scale;
  const drawUnitsPerMeter = finiteNumberOrNull(input?.drawUnitsPerMeter)
    ?? DEFAULT_SIZE_REPRODUCTION_DRAW_UNITS_PER_METER;

  /** @type {number|null} */
  let answerValueSI;
  if (input?.drawLengthUnits !== undefined && input.drawLengthUnits !== null) {
    answerValueSI = sizeReproductionValueFromDrawLength(Number(input.drawLengthUnits), drawUnitsPerMeter);
  } else if (input?.valueSI !== undefined && input.valueSI !== null) {
    answerValueSI = finiteNumberOrNull(input.valueSI);
  } else {
    answerValueSI = null;
  }

  if (answerValueSI === null || answerValueSI < 0) return null;
  const u = normalizeScaleBoundedValue(answerValueSI, scale);
  if (u === null) return null;
  return { answerValueSI, u };
}

/** @param {unknown} value @returns {number|null} */
function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** @param {unknown} value @returns {string|null} */
function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
