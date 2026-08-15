import { describe, expect, it } from "vitest";
import {
  BODY_LENGTH_QUANTITY_KIND,
  measurementFromQuantityReferenceFact,
  normalizeBodyLengthQuantity,
  resolveMeasurementForLogScale,
} from "../src/features/knowledge-3d/measurements.js";

describe("knowledge 3D measurements", () => {
  it("normalizes body_length values to SI meters", () => {
    expect(normalizeBodyLengthQuantity({
      quantityKind: BODY_LENGTH_QUANTITY_KIND,
      value: 420,
      min: 400,
      max: 550,
      unit: "cm",
      estimated: true,
    })).toEqual({
      quantityKind: BODY_LENGTH_QUANTITY_KIND,
      valueSI: 4.2,
      minSI: 4,
      maxSI: 5.5,
      unitSI: "m",
      estimated: true,
    });
  });

  it("converts quantity ReferenceFacts into Visualization measurements", () => {
    expect(measurementFromQuantityReferenceFact({
      id: "rf-body-length",
      valueType: "quantity",
      value: {
        quantityKind: "body_length",
        minSI: 15,
        maxSI: 18,
        unitSI: "m",
        estimated: true,
      },
      confidence: 0.7,
      sourceType: "curated",
      sourceNote: "fixture source",
    })).toEqual({
      quantityKind: "body_length",
      valueSI: null,
      minSI: 15,
      maxSI: 18,
      unitSI: "m",
      estimated: true,
      confidence: 0.7,
      source: "fixture source",
    });
  });

  it("uses a geometric mean for positive ranges and rejects invalid size values", () => {
    expect(resolveMeasurementForLogScale({
      quantityKind: "body_length",
      valueSI: null,
      minSI: 4,
      maxSI: 5.5,
      unitSI: "m",
      estimated: true,
      confidence: null,
      source: null,
    })).toEqual({
      representativeValue: Math.sqrt(4 * 5.5),
      rangeSI: { minSI: 4, maxSI: 5.5 },
    });
    expect(resolveMeasurementForLogScale({
      quantityKind: "body_length",
      valueSI: 0,
      minSI: null,
      maxSI: null,
      unitSI: "m",
      estimated: true,
      confidence: null,
      source: null,
    })).toBeNull();
    expect(resolveMeasurementForLogScale({
      quantityKind: "body_length",
      valueSI: 4,
      minSI: null,
      maxSI: null,
      unitSI: "cm",
      estimated: true,
      confidence: null,
      source: null,
    })).toBeNull();
  });

  it("keeps incompatible declared SI units visible for unset placement", () => {
    const measurement = {
      ...normalizeBodyLengthQuantity({
        quantityKind: BODY_LENGTH_QUANTITY_KIND,
        valueSI: 4,
        unitSI: "cm",
      }),
      confidence: null,
      source: null,
    };

    expect(measurement.unitSI).toBe("cm");
    expect(resolveMeasurementForLogScale(measurement)).toBeNull();
  });
});
