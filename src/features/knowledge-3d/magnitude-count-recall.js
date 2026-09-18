import { normalizeScaleBoundedValue, scoreMagnitudeRecallAnswer } from "./magnitude-recall.js";

export const MAGNITUDE_COUNT_RECALL_SCHEMA_VERSION = "1.0.0";

// Teaching rule: how many metres one discrete operation (click / key press)
// contributes. Shown to the learner; not a property of the ATOM model.
export const DEFAULT_METERS_PER_COUNT = 1;

/**
 * @typedef {"increment"|"decrement"|"reset"} CountRecallEvent
 */

/**
 * A count-recall answer records both the discrete operation count and the SI
 * value restored from it, plus whether a fine-adjust / numeric override was
 * used to reach a value the discretization alone could not hit.
 *
 * @typedef {import('./magnitude.js').TrialResult & {
 *   count: number,
 *   metersPerCount: number,
 *   restoredValueSI: number,
 *   overridden: boolean,
 *   hintUsed: boolean,
 * }} CountTrialResult
 */

/**
 * Reduce one meaningful interaction event to the next count. Counts are
 * non-negative integers; decrement below zero clamps at zero ("1回戻す"),
 * reset returns to zero.
 *
 * @param {number} count
 * @param {CountRecallEvent} event
 * @returns {number}
 */
export function applyCountRecallEvent(count, event) {
  const current = normalizeCount(count);
  if (event === "increment") return current + 1;
  if (event === "decrement") return Math.max(0, current - 1);
  if (event === "reset") return 0;
  return current;
}

/**
 * Restore the real length in metres from a discrete operation count.
 *
 * @param {number} count
 * @param {number} [metersPerCount]
 * @returns {number|null}
 */
export function countRecallValueFromCount(count, metersPerCount = DEFAULT_METERS_PER_COUNT) {
  const safeCount = countOrNull(count);
  const perCount = finiteNumberOrNull(metersPerCount);
  if (safeCount === null || perCount === null || perCount <= 0) return null;
  return safeCount * perCount;
}

/**
 * The count nearest to a target length — used to seed / display the count that
 * corresponds to a value entered by fine-adjust or numeric override.
 *
 * @param {number} valueSI
 * @param {number} [metersPerCount]
 * @returns {number|null}
 */
export function countRecallCountFromValue(valueSI, metersPerCount = DEFAULT_METERS_PER_COUNT) {
  const meters = finiteNumberOrNull(valueSI);
  const perCount = finiteNumberOrNull(metersPerCount);
  if (meters === null || perCount === null || perCount <= 0 || meters < 0) return null;
  return Math.round(meters / perCount);
}

/**
 * Normalize a count-recall answer into the {answerValueSI, u, count, overridden}
 * shape. A fine-adjust / numeric override wins over the count so a value the
 * discretization cannot reach is still answerable.
 *
 * @param {{
 *   scale: import('./magnitude-recall.js').MagnitudeRecallScale,
 *   count?: unknown,
 *   metersPerCount?: number,
 *   overrideValueSI?: unknown,
 * }} input
 * @returns {{answerValueSI:number, u:number, count:number, overridden:boolean}|null}
 */
export function buildCountRecallAnswer(input) {
  const scale = input?.scale;
  const metersPerCount = finiteNumberOrNull(input?.metersPerCount) ?? DEFAULT_METERS_PER_COUNT;
  const count = countOrNull(input?.count) ?? 0;

  const override = finiteNumberOrNull(input?.overrideValueSI);
  const overridden = override !== null && override >= 0;
  const answerValueSI = overridden ? override : countRecallValueFromCount(count, metersPerCount);
  if (answerValueSI === null || answerValueSI < 0) return null;

  const u = normalizeScaleBoundedValue(answerValueSI, scale);
  if (u === null) return null;
  return { answerValueSI, u, count, overridden };
}

/**
 * Score a count-recall trial. Correctness / error / elapsed / inputMethod come
 * from the shared recall scorer; the count, restored value, override and hint
 * signals are recorded alongside so operation telemetry stays with the trial
 * without being mistaken for the knowledge score.
 *
 * @param {{
 *   itemId: string,
 *   scaleId: string,
 *   count: unknown,
 *   metersPerCount?: number,
 *   overrideValueSI?: unknown,
 *   correctValueSI: unknown,
 *   elapsedMs: unknown,
 *   inputMethod: unknown,
 *   hintUsed?: unknown,
 * }} input
 * @returns {CountTrialResult|null}
 */
export function scoreCountRecallTrial(input) {
  const metersPerCount = finiteNumberOrNull(input?.metersPerCount) ?? DEFAULT_METERS_PER_COUNT;
  const count = countOrNull(input?.count) ?? 0;
  const override = finiteNumberOrNull(input?.overrideValueSI);
  const overridden = override !== null && override >= 0;
  const restoredValueSI = overridden ? override : countRecallValueFromCount(count, metersPerCount);
  if (restoredValueSI === null) return null;

  const base = scoreMagnitudeRecallAnswer({
    itemId: input?.itemId,
    scaleId: input?.scaleId,
    answerValueSI: restoredValueSI,
    correctValueSI: input?.correctValueSI,
    elapsedMs: input?.elapsedMs,
    inputMethod: input?.inputMethod,
  });
  if (!base) return null;

  return {
    ...base,
    count,
    metersPerCount,
    restoredValueSI: base.answerValueSI,
    overridden,
    hintUsed: input?.hintUsed === true,
  };
}

/** @param {unknown} value @returns {number} */
function normalizeCount(value) {
  const number = finiteNumberOrNull(value);
  if (number === null || number < 0) return 0;
  return Math.floor(number);
}

/** @param {unknown} value @returns {number|null} */
function countOrNull(value) {
  const number = finiteNumberOrNull(value);
  if (number === null || number < 0) return null;
  return Math.floor(number);
}

/** @param {unknown} value @returns {number|null} */
function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
