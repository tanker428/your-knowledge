export const MAGNITUDE_AXIS_KINDS = Object.freeze(["time", "quantity"]);
export const MAGNITUDE_NORMALIZATIONS = Object.freeze(["log", "linear"]);
export const TIME_UNIT_SI = "s";
export const SECONDS_PER_MILLION_YEARS = 31_556_952_000_000;
export const DEFAULT_MAGNITUDE_REFERENCE_VALUE_SI = 1;
/** Documented ATOM extension slot. It is not accepted by Phase A-1 helpers. */
export const FUTURE_SPACE_MAGNITUDE_AXIS_KIND = "space";

/**
 * ATOM magnitude axis kinds implemented by the display model in Phase A-1.
 *
 * Extension point: Walsh's ATOM also includes space. "space" is deliberately
 * not part of this runtime union yet; future work should add it here only after
 * defining spatial units and a representative-value resolver.
 *
 * @typedef {"time"|"quantity"} MagnitudeAxisKind
 */

/**
 * @typedef {"log"|"linear"} MagnitudeNormalization
 */

/**
 * Display-only descriptor for a shared ATOM magnitude axis.
 *
 * `normalization` is explicit so layouts can choose `log` for wide dynamic
 * ranges or `linear` for bounded local comparisons. Log normalization returns
 * `log10(representativeValueSI / referenceValueSI)`. Linear normalization
 * returns `(representativeValueSI - originSI) / referenceValueSI`.
 *
 * @typedef {object} MagnitudeAxis
 * @property {MagnitudeAxisKind} axisKind
 * @property {MagnitudeNormalization} normalization
 * @property {string} unitSI
 * @property {number} [referenceValueSI]
 * @property {number} [originSI]
 * @property {string|null} [quantityKind] Required when axisKind is "quantity".
 */

/**
 * Display-only magnitude value. It is derived from project/reference data and
 * must never be persisted as coordinates or permanent Concepts.
 *
 * Representative value selection:
 * - `valueSI` is used as the representative value when present.
 * - `minSI` and `maxSI` use the same positive geometric mean as Size layout:
 *   `sqrt(minSI * maxSI)`.
 * - Time values are durations in seconds. Geological age intervals are first
 *   converted to a duration magnitude, then normalized by the same path.
 *
 * @typedef {object} MagnitudeValue
 * @property {MagnitudeAxisKind} axisKind
 * @property {number|null} valueSI
 * @property {number|null} minSI
 * @property {number|null} maxSI
 * @property {string|null} unitSI
 * @property {string|null} [quantityKind]
 * @property {boolean} [estimated]
 * @property {Record<string, any>} [source]
 */

/**
 * @typedef {object} MagnitudeRepresentative
 * @property {number} representativeValueSI
 * @property {{minSI:number, maxSI:number}|null} rangeSI
 * @property {"value"|"range"} representativeSource
 */

/**
 * @typedef {MagnitudeRepresentative & {
 *   axisKind: MagnitudeAxisKind,
 *   normalization: MagnitudeNormalization,
 *   normalizedScalar: number,
 *   unitSI: string,
 *   quantityKind: string|null
 * }} NormalizedMagnitude
 */

/**
 * Convert a VisualizationGraphV1 quantity measurement into the common
 * display-only magnitude value shape.
 *
 * @param {import('./visualization-graph.js').VisualizationMeasurement} measurement
 * @returns {MagnitudeValue|null}
 */
export function magnitudeValueFromMeasurement(measurement) {
  if (!isPlainObject(measurement)) return null;
  return {
    axisKind: "quantity",
    quantityKind: cleanString(measurement.quantityKind),
    valueSI: finiteNumberOrNull(measurement.valueSI),
    minSI: finiteNumberOrNull(measurement.minSI),
    maxSI: finiteNumberOrNull(measurement.maxSI),
    unitSI: cleanString(measurement.unitSI),
    estimated: measurement.estimated === true,
    source: {
      source: cleanString(measurement.source),
    },
  };
}

/**
 * Represent an explicit time duration or duration range as an ATOM magnitude.
 * The unit is SI seconds. Ranged durations use `minSI`/`maxSI` and are reduced
 * to a positive geometric mean during normalization.
 *
 * @param {{durationSI?:number|null, valueSI?:number|null, minDurationSI?:number|null, maxDurationSI?:number|null, minSI?:number|null, maxSI?:number|null, estimated?:boolean, source?:Record<string, any>}} value
 * @returns {MagnitudeValue|null}
 */
export function timeMagnitudeFromDuration(value) {
  if (!isPlainObject(value)) return null;
  const magnitude = {
    axisKind: /** @type {const} */ ("time"),
    valueSI: finiteNumberOrNull(value.durationSI) ?? finiteNumberOrNull(value.valueSI),
    minSI: finiteNumberOrNull(value.minDurationSI) ?? finiteNumberOrNull(value.minSI),
    maxSI: finiteNumberOrNull(value.maxDurationSI) ?? finiteNumberOrNull(value.maxSI),
    unitSI: TIME_UNIT_SI,
    estimated: value.estimated === true,
  };
  if (isPlainObject(value.source)) {
    return { ...magnitude, source: value.source };
  }
  return magnitude;
}

/**
 * Convert geological age bounds into a duration magnitude. `startMa` and
 * `endMa` are ages before present in millions of years; this helper uses the
 * interval width only, not the chronological timeline position.
 *
 * @param {{startMa?:number|null, endMa?:number|null, estimated?:boolean, source?:Record<string, any>}} interval
 * @returns {MagnitudeValue|null}
 */
export function timeMagnitudeFromMaInterval(interval) {
  if (!isPlainObject(interval)) return null;
  const startMa = finiteNumberOrNull(interval.startMa);
  const endMa = finiteNumberOrNull(interval.endMa);
  if (startMa === null || endMa === null) return null;
  const durationMa = Math.abs(startMa - endMa);
  const source = {
    ...(isPlainObject(interval.source) ? interval.source : {}),
    startMa,
    endMa,
    sourceUnit: "Ma",
  };
  return timeMagnitudeFromDuration({
    durationSI: durationMa * SECONDS_PER_MILLION_YEARS,
    estimated: interval.estimated,
    source,
  });
}

/**
 * Choose the default normalization for an ATOM magnitude axis. Quantity and
 * time both default to log because display comparisons span orders of
 * magnitude; callers may still pass an explicit linear axis descriptor.
 *
 * @param {unknown} axisKind
 * @returns {MagnitudeNormalization|null}
 */
export function defaultMagnitudeNormalization(axisKind) {
  return axisKind === "time" || axisKind === "quantity" ? "log" : null;
}

/**
 * Resolve and normalize a magnitude value to the unitless scalar used for
 * display positioning. This function is pure and has no renderer dependency.
 *
 * @param {MagnitudeValue|null} value
 * @param {MagnitudeAxis} axis
 * @returns {NormalizedMagnitude|null}
 */
export function normalizeMagnitudeValue(value, axis) {
  const axisKind = cleanString(axis?.axisKind);
  if (!isSupportedMagnitudeAxisKind(axisKind)) return null;
  if (!isPlainObject(value) || value.axisKind !== axisKind) return null;

  const unitSI = cleanString(axis.unitSI);
  if (!unitSI || value.unitSI !== unitSI) return null;

  const quantityKind = axisKind === "quantity" ? cleanString(axis.quantityKind) : null;
  if (axisKind === "quantity" && (!quantityKind || value.quantityKind !== quantityKind)) return null;

  const representative = resolveMagnitudeRepresentativeValue(value);
  if (!representative) return null;

  const normalization = cleanString(axis.normalization) || defaultMagnitudeNormalization(axisKind);
  if (!isSupportedMagnitudeNormalization(normalization)) return null;

  const normalizedScalar = normalizeRepresentativeValue(
    representative.representativeValueSI,
    { ...axis, axisKind, normalization },
  );
  if (normalizedScalar === null) return null;

  return {
    ...representative,
    axisKind,
    normalization,
    normalizedScalar,
    unitSI,
    quantityKind,
  };
}

/**
 * Resolve a display magnitude's representative value before axis normalization.
 *
 * @param {MagnitudeValue|null} value
 * @returns {MagnitudeRepresentative|null}
 */
export function resolveMagnitudeRepresentativeValue(value) {
  if (!isPlainObject(value)) return null;
  const valueSI = finiteNumberOrNull(value.valueSI);
  if (valueSI !== null && valueSI >= 0) {
    return {
      representativeValueSI: valueSI,
      rangeSI: null,
      representativeSource: "value",
    };
  }

  const minSI = finiteNumberOrNull(value.minSI);
  const maxSI = finiteNumberOrNull(value.maxSI);
  if (isPositiveFiniteNumber(minSI) && isPositiveFiniteNumber(maxSI) && minSI <= maxSI) {
    return {
      representativeValueSI: Math.sqrt(minSI * maxSI),
      rangeSI: { minSI, maxSI },
      representativeSource: "range",
    };
  }
  return null;
}

/**
 * Apply an axis descriptor to an already selected representative value.
 *
 * @param {number} representativeValueSI
 * @param {MagnitudeAxis} axis
 * @returns {number|null}
 */
export function normalizeRepresentativeValue(representativeValueSI, axis) {
  const normalization = cleanString(axis?.normalization) || defaultMagnitudeNormalization(axis?.axisKind);
  const referenceValueSI = finiteNumberOrNull(axis?.referenceValueSI) ?? DEFAULT_MAGNITUDE_REFERENCE_VALUE_SI;
  const originSI = finiteNumberOrNull(axis?.originSI) ?? 0;

  if (!Number.isFinite(representativeValueSI) || representativeValueSI < 0) return null;
  if (normalization === "log") {
    if (representativeValueSI <= 0 || referenceValueSI <= 0) return null;
    return Math.log10(representativeValueSI / referenceValueSI);
  }
  if (normalization === "linear") {
    if (referenceValueSI <= 0) return null;
    return (representativeValueSI - originSI) / referenceValueSI;
  }
  return null;
}

/**
 * @param {unknown} axisKind
 * @returns {axisKind is MagnitudeAxisKind}
 */
export function isSupportedMagnitudeAxisKind(axisKind) {
  return axisKind === "time" || axisKind === "quantity";
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {number|null} */
function finiteNumberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** @param {unknown} value */
function isPositiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/** @param {unknown} value @returns {string|null} */
function cleanString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * @param {unknown} normalization
 * @returns {normalization is MagnitudeNormalization}
 */
function isSupportedMagnitudeNormalization(normalization) {
  return normalization === "log" || normalization === "linear";
}
