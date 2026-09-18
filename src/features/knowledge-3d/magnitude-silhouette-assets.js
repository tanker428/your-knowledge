import { BODY_LENGTH_QUANTITY_KIND } from "./measurements.js";

export const HUMAN_BODY_LENGTH_REFERENCE_ITEM_ID = "reference:human-body-length";
export const HUMAN_BODY_LENGTH_REFERENCE_VALUE_SI = 1.7;

/** @type {readonly import('./magnitude-silhouette.js').SilhouetteAsset[]} */
export const BUNDLED_SILHOUETTE_ASSETS = Object.freeze([
  Object.freeze({
    assetId: "silhouette:fukuiraptor-side:v1",
    assetVersion: "1.0.0",
    mimeType: "image/svg+xml",
    view: "side",
    viewBoxWidth: 1200,
    viewBoxHeight: 420,
    calibration: Object.freeze({
      bodyLengthStartX: 90 / 1200,
      bodyLengthEndX: 1110 / 1200,
      baselineY: 320 / 420,
      anchorX: 600 / 1200,
      anchorY: 320 / 420,
    }),
    href: new URL("./silhouettes/fukuiraptor-side.svg", import.meta.url).href,
    sourceLabel: "Project-generated schematic side silhouette",
    licenseLabel: "CC0-style project fixture",
    schematic: true,
  }),
  Object.freeze({
    assetId: "silhouette:tyrannosaurus-side:v1",
    assetVersion: "1.0.0",
    mimeType: "image/svg+xml",
    view: "side",
    viewBoxWidth: 1400,
    viewBoxHeight: 520,
    calibration: Object.freeze({
      bodyLengthStartX: 105 / 1400,
      bodyLengthEndX: 1295 / 1400,
      baselineY: 408 / 520,
      anchorX: 700 / 1400,
      anchorY: 408 / 520,
    }),
    href: new URL("./silhouettes/tyrannosaurus-side.svg", import.meta.url).href,
    sourceLabel: "Project-generated schematic side silhouette",
    licenseLabel: "CC0-style project fixture",
    schematic: true,
  }),
  Object.freeze({
    assetId: "silhouette:triceratops-side:v1",
    assetVersion: "1.0.0",
    mimeType: "image/svg+xml",
    view: "side",
    viewBoxWidth: 1200,
    viewBoxHeight: 480,
    calibration: Object.freeze({
      bodyLengthStartX: 90 / 1200,
      bodyLengthEndX: 1110 / 1200,
      baselineY: 372 / 480,
      anchorX: 600 / 1200,
      anchorY: 372 / 480,
    }),
    href: new URL("./silhouettes/triceratops-side.svg", import.meta.url).href,
    sourceLabel: "Project-generated schematic side silhouette",
    licenseLabel: "CC0-style project fixture",
    schematic: true,
  }),
  Object.freeze({
    assetId: "silhouette:generic-theropod-side:v1",
    assetVersion: "1.0.0",
    mimeType: "image/svg+xml",
    view: "side",
    viewBoxWidth: 1000,
    viewBoxHeight: 380,
    calibration: Object.freeze({
      bodyLengthStartX: 75 / 1000,
      bodyLengthEndX: 925 / 1000,
      baselineY: 292 / 380,
      anchorX: 500 / 1000,
      anchorY: 292 / 380,
    }),
    href: new URL("./silhouettes/generic-theropod-side.svg", import.meta.url).href,
    sourceLabel: "Project-generated schematic side silhouette",
    licenseLabel: "CC0-style project fixture",
    schematic: true,
  }),
  Object.freeze({
    assetId: "silhouette:human-side:v1",
    assetVersion: "1.0.0",
    mimeType: "image/svg+xml",
    view: "side",
    viewBoxWidth: 500,
    viewBoxHeight: 220,
    calibration: Object.freeze({
      bodyLengthStartX: 37.5 / 500,
      bodyLengthEndX: 462.5 / 500,
      baselineY: 156 / 220,
      anchorX: 250 / 500,
      anchorY: 156 / 220,
    }),
    href: new URL("./silhouettes/human-side.svg", import.meta.url).href,
    sourceLabel: "Project-generated schematic human reference",
    licenseLabel: "CC0-style project fixture",
    schematic: true,
  }),
]);

/** @type {readonly import('./magnitude-silhouette.js').SilhouetteBinding[]} */
export const BUNDLED_SILHOUETTE_BINDINGS = Object.freeze([
  Object.freeze({
    bindingId: "binding:taxon:fukuiraptor:silhouette:v1",
    targetId: "taxon:fukuiraptor",
    assetId: "silhouette:fukuiraptor-side:v1",
    measurementKind: BODY_LENGTH_QUANTITY_KIND,
  }),
  Object.freeze({
    bindingId: "binding:taxon:tyrannosaurus:silhouette:v1",
    targetId: "taxon:tyrannosaurus",
    assetId: "silhouette:tyrannosaurus-side:v1",
    measurementKind: BODY_LENGTH_QUANTITY_KIND,
  }),
  Object.freeze({
    bindingId: "binding:taxon:triceratops:silhouette:v1",
    targetId: "taxon:triceratops",
    assetId: "silhouette:triceratops-side:v1",
    measurementKind: BODY_LENGTH_QUANTITY_KIND,
  }),
  Object.freeze({
    bindingId: "binding:taxon:theropoda:silhouette:v1",
    targetId: "taxon:theropoda",
    assetId: "silhouette:generic-theropod-side:v1",
    measurementKind: BODY_LENGTH_QUANTITY_KIND,
  }),
  Object.freeze({
    bindingId: "binding:human-body-length:silhouette:v1",
    targetId: HUMAN_BODY_LENGTH_REFERENCE_ITEM_ID,
    assetId: "silhouette:human-side:v1",
    measurementKind: BODY_LENGTH_QUANTITY_KIND,
  }),
]);

export const HUMAN_BODY_LENGTH_REFERENCE = Object.freeze({
  itemId: HUMAN_BODY_LENGTH_REFERENCE_ITEM_ID,
  label: "Human reference",
  valueSI: HUMAN_BODY_LENGTH_REFERENCE_VALUE_SI,
  unitSI: "m",
  referenceIds: [HUMAN_BODY_LENGTH_REFERENCE_ITEM_ID],
});

/**
 * @param {string} assetId
 * @param {readonly import('./magnitude-silhouette.js').SilhouetteAsset[]} [assets]
 * @returns {import('./magnitude-silhouette.js').SilhouetteAsset|null}
 */
export function findBundledSilhouetteAsset(assetId, assets = BUNDLED_SILHOUETTE_ASSETS) {
  return assets.find((asset) => asset.assetId === assetId) || null;
}

/**
 * @param {{itemId?: string, referenceIds?: readonly string[]}|null|undefined} item
 * @param {readonly import('./magnitude-silhouette.js').SilhouetteBinding[]} [bindings]
 * @returns {import('./magnitude-silhouette.js').SilhouetteBinding|null}
 */
export function findBundledSilhouetteBinding(item, bindings = BUNDLED_SILHOUETTE_BINDINGS) {
  const ids = new Set([item?.itemId, ...(Array.isArray(item?.referenceIds) ? item.referenceIds : [])].filter(Boolean));
  return bindings.find((binding) => ids.has(binding.targetId)) || null;
}
