import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  BODY_LENGTH_LINEAR_RECALL_SCALE_ID,
  BODY_LENGTH_LOG_RECALL_SCALE_ID,
  findMagnitudeRecallScale,
} from "../src/features/knowledge-3d/magnitude-recall.js";
import {
  BUNDLED_SILHOUETTE_ASSETS,
  BUNDLED_SILHOUETTE_BINDINGS,
  HUMAN_BODY_LENGTH_REFERENCE,
  HUMAN_BODY_LENGTH_REFERENCE_ITEM_ID,
  HUMAN_BODY_LENGTH_REFERENCE_VALUE_SI,
  findBundledSilhouetteAsset,
  findBundledSilhouetteBinding,
} from "../src/features/knowledge-3d/magnitude-silhouette-assets.js";
import {
  buildSilhouettePresentationSpec,
  computeSilhouetteDimensions,
  silhouetteCalibrationSpanFraction,
} from "../src/features/knowledge-3d/magnitude-silhouette.js";

const LOG_SCALE = findMagnitudeRecallScale(BODY_LENGTH_LOG_RECALL_SCALE_ID);
const LINEAR_SCALE = findMagnitudeRecallScale(BODY_LENGTH_LINEAR_RECALL_SCALE_ID);

const TEST_ASSET = Object.freeze({
  assetId: "silhouette:test:v1",
  assetVersion: "1.0.0",
  mimeType: "image/svg+xml",
  view: "side",
  viewBoxWidth: 100,
  viewBoxHeight: 25,
  calibration: Object.freeze({
    bodyLengthStartX: 0.25,
    bodyLengthEndX: 0.75,
    baselineY: 0.8,
    anchorX: 0.5,
    anchorY: 0.8,
  }),
  href: null,
  sourceLabel: "test",
  licenseLabel: "test",
  schematic: true,
});

describe("magnitude silhouette presentation model", () => {
  it("computes calibrated body-length spans in linear meters", () => {
    const spans = [2, 4, 12].map((valueSI) =>
      computeSilhouetteDimensions(TEST_ASSET, valueSI, 0.5)?.calibrationSpanDrawUnits);

    expect(spans[0]).toBeCloseTo(1, 12);
    expect(spans[1] / spans[0]).toBeCloseTo(2, 12);
    expect(spans[2] / spans[0]).toBeCloseTo(6, 12);
    expect(computeSilhouetteDimensions(TEST_ASSET, 4, 0.5)).toMatchObject({
      bodyLengthDrawUnits: 2,
      calibrationSpanDrawUnits: 2,
      imageWidthDrawUnits: 4,
      imageHeightDrawUnits: 1,
      calibrationSpanFraction: 0.5,
    });
  });

  it("keeps log-axis position separate from linear silhouette length", () => {
    if (!LOG_SCALE) throw new Error("missing log scale");
    const specs = [0.1, 1, 10, 100].map((valueSI) =>
      buildSilhouettePresentationSpec({
        itemId: `item:${valueSI}`,
        label: String(valueSI),
        asset: TEST_ASSET,
        role: "reference",
        valueSI,
        scale: LOG_SCALE,
        drawUnitsPerMeter: 1,
      }));
    if (specs.some((spec) => !spec)) throw new Error("missing silhouette spec");

    expect(specs[0]?.axisU).toBeCloseTo(0, 12);
    expect(specs[1]?.axisU).toBeCloseTo(1 / 3, 12);
    expect(specs[2]?.axisU).toBeCloseTo(2 / 3, 12);
    expect(specs[3]?.axisU).toBeCloseTo(1, 12);
    expect((specs[2]?.axisU || 0) - (specs[1]?.axisU || 0))
      .toBeCloseTo((specs[3]?.axisU || 0) - (specs[2]?.axisU || 0), 12);

    const firstLength = specs[0]?.dimensions.bodyLengthDrawUnits || 1;
    expect((specs[1]?.dimensions.bodyLengthDrawUnits || 0) / firstLength).toBeCloseTo(10, 12);
    expect((specs[2]?.dimensions.bodyLengthDrawUnits || 0) / firstLength).toBeCloseTo(100, 12);
    expect((specs[3]?.dimensions.bodyLengthDrawUnits || 0) / firstLength).toBeCloseTo(1000, 12);
  });

  it("handles zero on linear scales without treating it as a missing answer", () => {
    if (!LINEAR_SCALE) throw new Error("missing linear scale");
    const zero = buildSilhouettePresentationSpec({
      itemId: "item:zero",
      asset: TEST_ASSET,
      role: "answer",
      valueSI: 0,
      scale: LINEAR_SCALE,
      drawUnitsPerMeter: 1,
    });

    expect(zero).toMatchObject({
      valueSI: 0,
      axisU: 0,
      dimensions: {
        bodyLengthDrawUnits: 0,
        imageWidthDrawUnits: 0,
        imageHeightDrawUnits: 0,
      },
    });
    expect(buildSilhouettePresentationSpec({
      itemId: "item:bad-log-zero",
      asset: TEST_ASSET,
      role: "answer",
      valueSI: 0,
      scale: LOG_SCALE,
    })).toBeNull();
  });

  it("rejects invalid calibration instead of manufacturing display dimensions", () => {
    const invalid = {
      ...TEST_ASSET,
      calibration: {
        ...TEST_ASSET.calibration,
        bodyLengthStartX: 0.5,
        bodyLengthEndX: 0.5,
      },
    };

    expect(silhouetteCalibrationSpanFraction(invalid)).toBeNull();
    expect(computeSilhouetteDimensions(invalid, 4, 1)).toBeNull();
  });

  it("registers bundled static SVG assets and bindings, including the human reference", () => {
    const assetIds = new Set(BUNDLED_SILHOUETTE_ASSETS.map((asset) => asset.assetId));
    const bindingTargets = new Set(BUNDLED_SILHOUETTE_BINDINGS.map((binding) => binding.targetId));

    expect(assetIds).toEqual(new Set([
      "silhouette:fukuiraptor-side:v1",
      "silhouette:tyrannosaurus-side:v1",
      "silhouette:triceratops-side:v1",
      "silhouette:generic-theropod-side:v1",
      "silhouette:human-side:v1",
    ]));
    expect(bindingTargets).toEqual(new Set([
      "taxon:fukuiraptor",
      "taxon:tyrannosaurus",
      "taxon:triceratops",
      "taxon:theropoda",
      HUMAN_BODY_LENGTH_REFERENCE_ITEM_ID,
    ]));
    expect(HUMAN_BODY_LENGTH_REFERENCE.valueSI).toBe(HUMAN_BODY_LENGTH_REFERENCE_VALUE_SI);
    expect(findBundledSilhouetteBinding({
      itemId: "concept:taxon:fukuiraptor",
      referenceIds: ["taxon:fukuiraptor"],
    })).toMatchObject({
      assetId: "silhouette:fukuiraptor-side:v1",
    });
    expect(findBundledSilhouetteAsset("silhouette:human-side:v1")).toBeTruthy();
  });

  it("keeps bundled SVGs static and local", () => {
    for (const asset of BUNDLED_SILHOUETTE_ASSETS) {
      if (!asset.href) throw new Error(`missing href for ${asset.assetId}`);
      const text = fs.readFileSync(fileURLToPath(asset.href), "utf8");

      expect(text).toMatch(/<svg\b/i);
      expect(text).not.toMatch(/<script\b/i);
      expect(text).not.toMatch(/\b(?:href|src)=["']https?:/i);
      expect(text).not.toMatch(/\b(?:href|src)=["']\//i);
    }
  });
});
