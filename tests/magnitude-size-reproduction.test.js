import { describe, expect, it } from "vitest";
import {
  BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
  BODY_LENGTH_LOG_RECALL_SCALE_ID,
  findMagnitudeRecallScale,
} from "../src/features/knowledge-3d/magnitude-recall.js";
import {
  DEFAULT_SIZE_REPRODUCTION_DRAW_UNITS_PER_METER,
  DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT,
  buildSizeReproductionAnswer,
  computeSizeReproductionGeometry,
  resolveSizeReproductionReferenceObject,
  sizeReproductionLengthDrawUnits,
  sizeReproductionValueFromDrawLength,
} from "../src/features/knowledge-3d/magnitude-size-reproduction.js";

const LOG_SCALE = findMagnitudeRecallScale(BODY_LENGTH_LOG_RECALL_SCALE_ID);
const LINEAR_SCALE = findMagnitudeRecallScale(
  BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
);
const DUPM = DEFAULT_SIZE_REPRODUCTION_DRAW_UNITS_PER_METER;

describe("magnitude size reproduction geometry", () => {
  it("keeps draw length linear in metres regardless of the scale used for scoring", () => {
    expect(sizeReproductionLengthDrawUnits(2, DUPM)).toBeCloseTo(2 * DUPM, 12);
    expect(sizeReproductionLengthDrawUnits(4, DUPM)).toBeCloseTo(4 * DUPM, 12);
    expect(sizeReproductionLengthDrawUnits(12, DUPM)).toBeCloseTo(
      12 * DUPM,
      12,
    );
    // 2:4:12 metres -> 1:2:6 draw lengths.
    const two = sizeReproductionLengthDrawUnits(2, DUPM);
    const four = sizeReproductionLengthDrawUnits(4, DUPM);
    const twelve = sizeReproductionLengthDrawUnits(12, DUPM);
    expect(four / two).toBeCloseTo(2, 12);
    expect(twelve / two).toBeCloseTo(6, 12);
  });

  it("round-trips a dragged bar length back to metres", () => {
    const length = sizeReproductionLengthDrawUnits(7.5, DUPM);
    expect(sizeReproductionValueFromDrawLength(length, DUPM)).toBeCloseTo(
      7.5,
      12,
    );
  });

  it("rejects invalid values", () => {
    expect(sizeReproductionLengthDrawUnits(-1, DUPM)).toBeNull();
    expect(sizeReproductionLengthDrawUnits(2, 0)).toBeNull();
    expect(sizeReproductionLengthDrawUnits(Number.NaN, DUPM)).toBeNull();
    expect(sizeReproductionValueFromDrawLength(-1, DUPM)).toBeNull();
    expect(sizeReproductionValueFromDrawLength(1, 0)).toBeNull();
  });

  it("computes proportional geometry against a reference object", () => {
    const geom = computeSizeReproductionGeometry({
      answerValueSI: 12,
      referenceObject: {
        id: "human-adult",
        label: "人",
        valueSI: 1.7,
        unitSI: "m",
      },
      drawUnitsPerMeter: DUPM,
    });
    expect(geom).not.toBeNull();
    expect(geom?.answerLengthDrawUnits).toBeCloseTo(12 * DUPM, 12);
    expect(geom?.referenceLengthDrawUnits).toBeCloseTo(1.7 * DUPM, 12);
    // Draw-length ratio equals the real value ratio.
    expect(geom?.ratio).toBeCloseTo(12 / 1.7, 12);
  });

  it("falls back to the default reference object when the supplied one is invalid", () => {
    expect(resolveSizeReproductionReferenceObject(null)).toEqual(
      DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT,
    );
    expect(resolveSizeReproductionReferenceObject({ valueSI: 0 })).toEqual(
      DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT,
    );
    const geom = computeSizeReproductionGeometry({
      answerValueSI: 3,
      referenceObject: { valueSI: -2 },
    });
    expect(geom?.referenceValueSI).toBe(
      DEFAULT_SIZE_REPRODUCTION_REFERENCE_OBJECT.valueSI,
    );
  });
});

describe("magnitude size reproduction answer normalization", () => {
  it("maps a dragged bar length and a numeric value to the same scored answer", () => {
    const fromDrag = buildSizeReproductionAnswer({
      scale: LINEAR_SCALE,
      drawLengthUnits: sizeReproductionLengthDrawUnits(12, DUPM),
      drawUnitsPerMeter: DUPM,
    });
    const fromNumeric = buildSizeReproductionAnswer({
      scale: LINEAR_SCALE,
      valueSI: 12,
    });
    expect(fromDrag).not.toBeNull();
    expect(fromDrag?.answerValueSI).toBeCloseTo(12, 12);
    expect(fromDrag?.answerValueSI).toBeCloseTo(
      fromNumeric?.answerValueSI ?? Number.NaN,
      12,
    );
    expect(fromDrag?.u).toBeCloseTo(fromNumeric?.u ?? Number.NaN, 12);
  });

  it("returns the scale unit position so ⑤ feeds proportional display back", () => {
    // 12 m on the 0-15 m linear scale sits at u = 12/15.
    const answer = buildSizeReproductionAnswer({
      scale: LINEAR_SCALE,
      valueSI: 12,
    });
    expect(answer?.u).toBeCloseTo(12 / 15, 12);
  });

  it("converts scale u back to SI without treating log position as a length", () => {
    const linear = buildSizeReproductionAnswer({ scale: LINEAR_SCALE, answerU: 0.8 });
    const log = buildSizeReproductionAnswer({ scale: LOG_SCALE, answerU: 2 / 3 });
    expect(linear?.answerValueSI).toBeCloseTo(12, 12);
    expect(log?.answerValueSI).toBeCloseTo(10, 12);
    expect(computeSizeReproductionGeometry({ answerValueSI: log.answerValueSI })?.answerLengthDrawUnits).toBeCloseTo(2.4, 12);
    for (const answerU of [-0.1, 1.1, NaN, Infinity, "", null]) {
      expect(buildSizeReproductionAnswer({ scale: LOG_SCALE, answerU })).toBeNull();
    }
  });

  it("rejects out-of-range and negative answers", () => {
    expect(
      buildSizeReproductionAnswer({ scale: LINEAR_SCALE, valueSI: -1 }),
    ).toBeNull();
    expect(
      buildSizeReproductionAnswer({ scale: LINEAR_SCALE, valueSI: 999 }),
    ).toBeNull();
    expect(
      buildSizeReproductionAnswer({ scale: LOG_SCALE, valueSI: 0 }),
    ).toBeNull();
    expect(buildSizeReproductionAnswer({ scale: LINEAR_SCALE })).toBeNull();
  });
});
