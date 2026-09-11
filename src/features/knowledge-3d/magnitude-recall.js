import {
  magnitudeValueFromMeasurement,
  resolveMagnitudeRepresentativeValue,
} from "./magnitude.js";
import {
  BODY_LENGTH_QUANTITY_KIND,
  LENGTH_UNIT_SI,
  normalizeBodyLengthQuantity,
} from "./measurements.js";

export const MAGNITUDE_RECALL_SCHEMA_VERSION = "1.0.0";
export const BODY_LENGTH_LOG_RECALL_SCALE_ID = "body_length:log-0.1-100m";
export const BODY_LENGTH_LINEAR_RECALL_SCALE_ID = "body_length:linear-0-15m";

// 教材上の仮ルール: body_length 想起は正解値の +/-10% 以内を正解にする。
export const MAGNITUDE_RECALL_TRIAL_CORRECT_RATIO = 0.1;

const EPSILON = 1e-12;
const BODY_LENGTH_RECALL_SCALES_INTERNAL = [
  Object.freeze({
    id: BODY_LENGTH_LOG_RECALL_SCALE_ID,
    label: "body_length log 0.1-100 m",
    quantityKind: BODY_LENGTH_QUANTITY_KIND,
    unitSI: LENGTH_UNIT_SI,
    normalization: "log",
    minValueSI: 0.1,
    maxValueSI: 100,
    tickValuesSI: Object.freeze([0.1, 1, 10, 100]),
  }),
  Object.freeze({
    id: BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
    label: "body_length linear 0-15 m",
    quantityKind: BODY_LENGTH_QUANTITY_KIND,
    unitSI: LENGTH_UNIT_SI,
    normalization: "linear",
    minValueSI: 0,
    maxValueSI: 15,
    tickValuesSI: Object.freeze([0, 5, 10, 15]),
  }),
];

export const BODY_LENGTH_RECALL_SCALES = Object.freeze(BODY_LENGTH_RECALL_SCALES_INTERNAL);

export const BODY_LENGTH_RECALL_FIXTURE = Object.freeze({
  schemaVersion: MAGNITUDE_RECALL_SCHEMA_VERSION,
  quantityKind: BODY_LENGTH_QUANTITY_KIND,
  unitSI: LENGTH_UNIT_SI,
  preferredScaleId: BODY_LENGTH_LOG_RECALL_SCALE_ID,
  scales: Object.freeze(BODY_LENGTH_RECALL_SCALES_INTERNAL.map(serializeScale)),
});

/**
 * @typedef {"study"|"answer"|"feedback"} MagnitudeRecallPhase
 */

/**
 * @typedef {"log"|"linear"} MagnitudeRecallNormalization
 */

/**
 * @typedef {import('./magnitude.js').MagnitudeRecallInputMethod} MagnitudeRecallInputMethod
 */

/**
 * @typedef {import('./magnitude.js').TrialResult} TrialResult
 */

/**
 * @typedef {object} MagnitudeRecallScale
 * @property {string} id
 * @property {string} label
 * @property {string} quantityKind
 * @property {string} unitSI
 * @property {MagnitudeRecallNormalization} normalization
 * @property {number} minValueSI
 * @property {number} maxValueSI
 * @property {readonly number[]} tickValuesSI
 */

/**
 * @typedef {object} MagnitudeRecallItem
 * @property {string} itemId
 * @property {string} label
 * @property {string} quantityKind
 * @property {string} unitSI
 * @property {number} correctValueSI
 * @property {{minSI:number, maxSI:number}|null} rangeSI
 * @property {"value"|"range"} representativeSource
 * @property {boolean} estimated
 * @property {string|null} source
 * @property {string[]} observationIds
 * @property {string[]} entityIds
 * @property {string[]} referenceIds
 */

/**
 * @typedef {object} MagnitudeRecallState
 * @property {MagnitudeRecallPhase} phase
 * @property {string} itemId
 * @property {string} scaleId
 * @property {number|null} answerValueSI
 * @property {number|null} answerU
 * @property {MagnitudeRecallInputMethod|null} inputMethod
 * @property {number} startedAtMs
 * @property {number|null} answeredAtMs
 * @property {TrialResult|null} result
 */

/**
 * Normalize a value onto an endpoint-bounded [0,1] scale.
 *
 * This deliberately differs from magnitude.js' display log10(rep/ref)
 * normalization, which remains an unbounded ATOM display scalar.
 *
 * @param {number} valueSI
 * @param {MagnitudeRecallScale} scale
 * @returns {number|null}
 */
export function normalizeScaleBoundedValue(valueSI, scale) {
  const bounds = validScaleBounds(scale);
  if (!bounds || !Number.isFinite(valueSI)) return null;
  const { minValueSI, maxValueSI } = bounds;
  if (valueSI < minValueSI - EPSILON || valueSI > maxValueSI + EPSILON) return null;

  if (scale.normalization === "linear") {
    return clampUnit((valueSI - minValueSI) / (maxValueSI - minValueSI));
  }
  if (scale.normalization === "log") {
    if (minValueSI <= 0 || valueSI <= 0) return null;
    return clampUnit(Math.log(valueSI / minValueSI) / Math.log(maxValueSI / minValueSI));
  }
  return null;
}

/**
 * Convert a [0,1] answer position back to an SI value on the selected scale.
 *
 * @param {number} u
 * @param {MagnitudeRecallScale} scale
 * @returns {number|null}
 */
export function denormalizeScaleUnitPosition(u, scale) {
  const bounds = validScaleBounds(scale);
  if (!bounds || !Number.isFinite(u) || u < -EPSILON || u > 1 + EPSILON) return null;
  const unit = clampUnit(u);
  const { minValueSI, maxValueSI } = bounds;

  if (scale.normalization === "linear") {
    return minValueSI + unit * (maxValueSI - minValueSI);
  }
  if (scale.normalization === "log") {
    if (minValueSI <= 0) return null;
    return minValueSI * ((maxValueSI / minValueSI) ** unit);
  }
  return null;
}

/**
 * Normalize a free-form length answer into SI meters. Blank, NaN, Infinity,
 * negative values, and unsupported units are not accepted as committed answers.
 *
 * @param {unknown} value
 * @param {string} [unit]
 * @returns {number|null}
 */
export function normalizeRecallAnswerValueSI(value, unit = LENGTH_UNIT_SI) {
  const number = numericInputOrNull(value);
  if (number === null || number < 0) return null;
  const quantity = normalizeBodyLengthQuantity({
    quantityKind: BODY_LENGTH_QUANTITY_KIND,
    value: number,
    unit,
  });
  return Number.isFinite(quantity?.valueSI) ? quantity.valueSI : null;
}

/**
 * Normalize an answer against the selected scale, returning only
 * renderer-independent placement data and the SI value needed for scoring.
 *
 * @param {{scale: MagnitudeRecallScale, answerValue?: unknown, answerValueSI?: unknown, answerU?: unknown, unit?: string}} input
 * @returns {{answerValueSI:number, u:number}|null}
 */
export function normalizeRecallAnswerForScale(input) {
  const scale = input?.scale;
  /** @type {number|null} */
  let answerValueSI;
  if (input?.answerU !== undefined && input.answerU !== null) {
    answerValueSI = denormalizeScaleUnitPosition(Number(input.answerU), scale);
  } else if (input?.answerValueSI !== undefined) {
    answerValueSI = numericInputOrNull(input.answerValueSI);
  } else {
    answerValueSI = normalizeRecallAnswerValueSI(input?.answerValue, input?.unit || LENGTH_UNIT_SI);
  }
  if (answerValueSI === null || answerValueSI < 0) return null;
  const u = normalizeScaleBoundedValue(answerValueSI, scale);
  if (u === null) return null;
  return { answerValueSI, u };
}

/**
 * Build renderer-agnostic body_length recall items from VisualizationGraphV1.
 * Nodes without a resolvable body_length representative value are excluded.
 *
 * @param {{nodes?: any[]}} graph
 * @param {{quantityKind?: string, unitSI?: string}} [options]
 * @returns {MagnitudeRecallItem[]}
 */
export function buildMagnitudeRecallItems(graph, options = {}) {
  const quantityKind = options.quantityKind || BODY_LENGTH_QUANTITY_KIND;
  const unitSI = options.unitSI || LENGTH_UNIT_SI;
  return (Array.isArray(graph?.nodes) ? graph.nodes : [])
    .flatMap((node) => recallItemFromNode(node, quantityKind, unitSI))
    .sort((left, right) => left.itemId.localeCompare(right.itemId));
}

/**
 * Build the data fixture future renderers can consume without learning about
 * Web pixels, Three.js coordinates, or DOM state.
 *
 * @param {{nodes?: any[]}} graph
 * @param {{quantityKind?: string, unitSI?: string, scales?: readonly MagnitudeRecallScale[]}} [options]
 * @returns {{schemaVersion:string, quantityKind:string, unitSI:string, scales:ReturnType<typeof serializeScale>[], items:MagnitudeRecallItem[]}}
 */
export function buildMagnitudeRecallFixture(graph, options = {}) {
  const quantityKind = options.quantityKind || BODY_LENGTH_QUANTITY_KIND;
  const unitSI = options.unitSI || LENGTH_UNIT_SI;
  const scales = options.scales || BODY_LENGTH_RECALL_SCALES;
  return {
    schemaVersion: MAGNITUDE_RECALL_SCHEMA_VERSION,
    quantityKind,
    unitSI,
    scales: scales.map(serializeScale),
    items: buildMagnitudeRecallItems(graph, { quantityKind, unitSI }),
  };
}

/**
 * Score one answer and return the saved TrialResult shape.
 *
 * 教材上の仮ルールとして、正解値からの相対誤差が +/-10% 以内なら正解。
 *
 * @param {{itemId: string, scaleId: string, answerValueSI: unknown, correctValueSI: unknown, elapsedMs: unknown, inputMethod: unknown}} input
 * @returns {TrialResult|null}
 */
export function scoreMagnitudeRecallAnswer(input) {
  const itemId = cleanString(input?.itemId);
  const scaleId = cleanString(input?.scaleId);
  const inputMethod = normalizeInputMethod(input?.inputMethod);
  const answerValueSI = numericInputOrNull(input?.answerValueSI);
  const correctValueSI = numericInputOrNull(input?.correctValueSI);
  const elapsedMs = numericInputOrNull(input?.elapsedMs) ?? 0;
  if (!itemId || !scaleId || !inputMethod || answerValueSI === null || correctValueSI === null) return null;
  if (answerValueSI < 0 || correctValueSI <= 0) return null;

  const error = Math.abs(answerValueSI - correctValueSI) / correctValueSI;
  return {
    itemId,
    scaleId,
    answerValueSI,
    correctValueSI,
    correct: error <= MAGNITUDE_RECALL_TRIAL_CORRECT_RATIO + EPSILON,
    error,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
    inputMethod,
  };
}

/**
 * @param {{itemId: string, scaleId: string, startedAtMs?: unknown}} input
 * @returns {MagnitudeRecallState|null}
 */
export function startMagnitudeRecallTrial(input) {
  const itemId = cleanString(input?.itemId);
  const scaleId = cleanString(input?.scaleId);
  if (!itemId || !scaleId) return null;
  return {
    phase: "study",
    itemId,
    scaleId,
    answerValueSI: null,
    answerU: null,
    inputMethod: null,
    startedAtMs: numericInputOrNull(input?.startedAtMs) ?? 0,
    answeredAtMs: null,
    result: null,
  };
}

/**
 * @param {MagnitudeRecallState|null} state
 * @returns {MagnitudeRecallState|null}
 */
export function enterMagnitudeRecallAnswerMode(state) {
  if (!state || state.phase !== "study" || state.result) return state;
  return { ...state, phase: "answer" };
}

/**
 * @param {MagnitudeRecallState|null} state
 * @param {{scale: MagnitudeRecallScale, answerValue?: unknown, answerValueSI?: unknown, answerU?: unknown, unit?: string, inputMethod: unknown}} input
 * @returns {MagnitudeRecallState|null}
 */
export function updateMagnitudeRecallDraftAnswer(state, input) {
  if (!state || state.phase !== "answer" || state.result) return state;
  const inputMethod = normalizeInputMethod(input?.inputMethod);
  const normalized = normalizeRecallAnswerForScale(input);
  if (!inputMethod || !normalized) {
    return {
      ...state,
      answerValueSI: null,
      answerU: null,
      inputMethod: null,
    };
  }
  return {
    ...state,
    answerValueSI: normalized.answerValueSI,
    answerU: normalized.u,
    inputMethod,
  };
}

/**
 * @param {MagnitudeRecallState|null} state
 * @returns {boolean}
 */
export function canCommitMagnitudeRecallAnswer(state) {
  return Boolean(
    state
    && state.phase === "answer"
    && !state.result
    && Number.isFinite(state.answerValueSI)
    && Number.isFinite(state.answerU)
    && state.inputMethod,
  );
}

/**
 * @param {MagnitudeRecallState|null} state
 * @param {{correctValueSI: unknown, nowMs?: unknown}} input
 * @returns {MagnitudeRecallState|null}
 */
export function commitMagnitudeRecallAnswer(state, input) {
  if (!canCommitMagnitudeRecallAnswer(state)) return state;
  const nowMs = numericInputOrNull(input?.nowMs) ?? state.startedAtMs;
  const result = scoreMagnitudeRecallAnswer({
    itemId: state.itemId,
    scaleId: state.scaleId,
    answerValueSI: state.answerValueSI,
    correctValueSI: input?.correctValueSI,
    elapsedMs: nowMs - state.startedAtMs,
    inputMethod: state.inputMethod,
  });
  if (!result) return state;
  return {
    ...state,
    phase: "feedback",
    answeredAtMs: nowMs,
    result,
  };
}

/**
 * @param {MagnitudeRecallState|null} state
 * @param {{itemId: string, scaleId: string, startedAtMs?: unknown}} input
 * @returns {MagnitudeRecallState|null}
 */
export function startNextMagnitudeRecallTrial(state, input) {
  if (!state || state.phase !== "feedback") return state;
  return startMagnitudeRecallTrial(input);
}

/**
 * @param {MagnitudeRecallState|null} state
 * @returns {{itemId:string, scaleId:string, u:number}|null}
 */
export function magnitudeRecallPlacement(state) {
  if (!state || !Number.isFinite(state.answerU)) return null;
  return {
    itemId: state.itemId,
    scaleId: state.scaleId,
    u: state.answerU,
  };
}

/**
 * @param {string} scaleId
 * @param {readonly MagnitudeRecallScale[]} [scales]
 * @returns {MagnitudeRecallScale|null}
 */
export function findMagnitudeRecallScale(scaleId, scales = BODY_LENGTH_RECALL_SCALES) {
  return scales.find((scale) => scale.id === scaleId) || null;
}

/**
 * @param {any} node
 * @param {string} quantityKind
 * @param {string} unitSI
 * @returns {MagnitudeRecallItem[]}
 */
function recallItemFromNode(node, quantityKind, unitSI) {
  const measurements = Array.isArray(node?.measurements) ? node.measurements : [];
  const measurement = measurements.find((item) => item?.quantityKind === quantityKind && item?.unitSI === unitSI);
  if (!measurement) return [];

  const magnitude = magnitudeValueFromMeasurement(measurement);
  const representative = resolveMagnitudeRepresentativeValue(magnitude);
  if (!representative || representative.representativeValueSI <= 0) return [];

  return [{
    itemId: String(node.id),
    label: String(node.label || node.id),
    quantityKind,
    unitSI,
    correctValueSI: representative.representativeValueSI,
    rangeSI: representative.rangeSI,
    representativeSource: representative.representativeSource,
    estimated: measurement.estimated === true,
    source: cleanString(measurement.source),
    observationIds: stringArray(node.observationIds),
    entityIds: stringArray(node.entityIds),
    referenceIds: stringArray(node.referenceIds),
  }];
}

/**
 * @param {MagnitudeRecallScale} scale
 */
function serializeScale(scale) {
  return {
    id: scale.id,
    label: scale.label,
    quantityKind: scale.quantityKind,
    unitSI: scale.unitSI,
    normalization: scale.normalization,
    minValueSI: scale.minValueSI,
    maxValueSI: scale.maxValueSI,
    tickValuesSI: [...scale.tickValuesSI],
  };
}

/**
 * @param {MagnitudeRecallScale} scale
 * @returns {{minValueSI:number, maxValueSI:number}|null}
 */
function validScaleBounds(scale) {
  const minValueSI = numericInputOrNull(scale?.minValueSI);
  const maxValueSI = numericInputOrNull(scale?.maxValueSI);
  if (minValueSI === null || maxValueSI === null || maxValueSI <= minValueSI) return null;
  if (scale.normalization === "log" && minValueSI <= 0) return null;
  if (scale.normalization !== "log" && scale.normalization !== "linear") return null;
  return { minValueSI, maxValueSI };
}

/** @param {number} value */
function clampUnit(value) {
  if (value < 0 && value >= -EPSILON) return 0;
  if (value > 1 && value <= 1 + EPSILON) return 1;
  return value;
}

/** @param {unknown} value @returns {number|null} */
function numericInputOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

/** @param {unknown} value @returns {MagnitudeRecallInputMethod|null} */
function normalizeInputMethod(value) {
  return value === "drag" || value === "axis-click" || value === "keyboard" || value === "numeric"
    ? value
    : null;
}

/** @param {unknown} value @returns {string|null} */
function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** @param {unknown} value @returns {string[]} */
function stringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
