import { describe, expect, it } from "vitest";
import {
  defaultMagnitudeNormalization,
  FUTURE_SPACE_MAGNITUDE_AXIS_KIND,
  magnitudeValueFromMeasurement,
  normalizeMagnitudeValue,
  resolveMagnitudeRepresentativeValue,
  SECONDS_PER_MILLION_YEARS,
  TIME_UNIT_SI,
  timeMagnitudeFromDuration,
  timeMagnitudeFromMaInterval,
} from "../src/features/knowledge-3d/magnitude.js";

const BODY_LENGTH_LOG_AXIS = Object.freeze({
  axisKind: "quantity",
  normalization: "log",
  quantityKind: "body_length",
  unitSI: "m",
  referenceValueSI: 1,
});

describe("ATOM magnitude display model", () => {
  it("normalizes quantity measurements on the same log scale used by Size layout", () => {
    const magnitude = magnitudeValueFromMeasurement({
      quantityKind: "body_length",
      valueSI: 4.2,
      minSI: null,
      maxSI: null,
      unitSI: "m",
      estimated: true,
      confidence: 0.8,
      source: "test",
    });

    const result = normalizeMagnitudeValue(magnitude, BODY_LENGTH_LOG_AXIS);

    expect(result).toMatchObject({
      axisKind: "quantity",
      normalization: "log",
      quantityKind: "body_length",
      representativeValueSI: 4.2,
      representativeSource: "value",
      rangeSI: null,
      unitSI: "m",
    });
    expect(result?.normalizedScalar).toBeCloseTo(Math.log10(4.2), 6);
  });

  it("uses a geometric mean for ranged quantity magnitudes", () => {
    const magnitude = magnitudeValueFromMeasurement({
      quantityKind: "body_length",
      valueSI: null,
      minSI: 4,
      maxSI: 5.5,
      unitSI: "m",
      estimated: true,
      confidence: null,
      source: null,
    });

    const result = normalizeMagnitudeValue(magnitude, BODY_LENGTH_LOG_AXIS);

    expect(result).toMatchObject({
      representativeValueSI: Math.sqrt(4 * 5.5),
      representativeSource: "range",
      rangeSI: { minSI: 4, maxSI: 5.5 },
    });
    expect(result?.normalizedScalar).toBeCloseTo(Math.log10(Math.sqrt(4 * 5.5)), 6);
  });

  it("represents geological time intervals as time-duration magnitudes", () => {
    const magnitude = timeMagnitudeFromMaInterval({
      startMa: 145,
      endMa: 100.5,
      source: { referenceId: "geo:early-cretaceous" },
    });

    const result = normalizeMagnitudeValue(magnitude, {
      axisKind: "time",
      normalization: "log",
      unitSI: TIME_UNIT_SI,
      referenceValueSI: SECONDS_PER_MILLION_YEARS,
    });

    expect(magnitude?.source).toMatchObject({
      referenceId: "geo:early-cretaceous",
      startMa: 145,
      endMa: 100.5,
      sourceUnit: "Ma",
    });
    expect(result).toMatchObject({
      axisKind: "time",
      normalization: "log",
      representativeSource: "value",
      unitSI: TIME_UNIT_SI,
      quantityKind: null,
    });
    expect(result?.representativeValueSI).toBeCloseTo(44.5 * SECONDS_PER_MILLION_YEARS, 1);
    expect(result?.normalizedScalar).toBeCloseTo(Math.log10(44.5), 6);
  });

  it("uses the same representative range rule for time-duration ranges", () => {
    const magnitude = timeMagnitudeFromDuration({
      minDurationSI: 10,
      maxDurationSI: 1_000,
      estimated: true,
    });

    const result = normalizeMagnitudeValue(magnitude, {
      axisKind: "time",
      normalization: "log",
      unitSI: TIME_UNIT_SI,
      referenceValueSI: 1,
    });

    expect(result).toMatchObject({
      representativeValueSI: 100,
      representativeSource: "range",
      rangeSI: { minSI: 10, maxSI: 1_000 },
    });
    expect(result?.normalizedScalar).toBe(2);
  });

  it("supports linear normalization when a bounded comparison needs it", () => {
    const result = normalizeMagnitudeValue(
      timeMagnitudeFromDuration({ durationSI: 40 }),
      {
        axisKind: "time",
        normalization: "linear",
        unitSI: TIME_UNIT_SI,
        referenceValueSI: 10,
        originSI: 20,
      },
    );

    expect(result?.normalizedScalar).toBe(2);
  });

  it("rejects incompatible or non-positive log magnitudes instead of inventing positions", () => {
    expect(normalizeMagnitudeValue(
      magnitudeValueFromMeasurement({
        quantityKind: "body_mass",
        valueSI: 1200,
        minSI: null,
        maxSI: null,
        unitSI: "kg",
        estimated: true,
        confidence: null,
        source: null,
      }),
      BODY_LENGTH_LOG_AXIS,
    )).toBeNull();

    expect(normalizeMagnitudeValue(
      {
        axisKind: "quantity",
        quantityKind: "body_length",
        valueSI: 0,
        minSI: null,
        maxSI: null,
        unitSI: "m",
      },
      BODY_LENGTH_LOG_AXIS,
    )).toBeNull();
  });

  it("documents space as a future slot without implementing it", () => {
    expect(defaultMagnitudeNormalization("quantity")).toBe("log");
    expect(defaultMagnitudeNormalization("time")).toBe("log");
    expect(defaultMagnitudeNormalization(FUTURE_SPACE_MAGNITUDE_AXIS_KIND)).toBeNull();
    expect(normalizeMagnitudeValue(
      /** @type {any} */ ({
        axisKind: FUTURE_SPACE_MAGNITUDE_AXIS_KIND,
        valueSI: 1,
        minSI: null,
        maxSI: null,
        unitSI: "m",
      }),
      /** @type {any} */ ({
        axisKind: FUTURE_SPACE_MAGNITUDE_AXIS_KIND,
        normalization: "linear",
        unitSI: "m",
      }),
    )).toBeNull();
  });

  it("keeps representative-value selection independent from rendering", () => {
    expect(resolveMagnitudeRepresentativeValue({
      axisKind: "time",
      valueSI: null,
      minSI: 2,
      maxSI: 8,
      unitSI: TIME_UNIT_SI,
    })).toEqual({
      representativeValueSI: 4,
      representativeSource: "range",
      rangeSI: { minSI: 2, maxSI: 8 },
    });
  });
});
