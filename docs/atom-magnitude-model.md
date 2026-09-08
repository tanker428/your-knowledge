# ATOM Magnitude Display Model

## Scope

Phase A-1 defines a display model only. It does not add UI, saved coordinates,
persistent Concepts, Project JSON fields, KnowledgeGraph fields, or JSON I/O
changes. Layout remains a pure projection step between `VisualizationGraphV1`
and the renderer.

## ATOM Basis

Walsh (2003), "A Theory of Magnitude", argues that time, space, and quantity
share a common cortical magnitude metric. This project uses that idea for 3D
display projection: quantity and time can both be reduced to a nonnegative
representative magnitude, then normalized to a unitless scalar for positioning.

## Axis Descriptor

The JSDoc model lives in `src/features/knowledge-3d/magnitude.js`.

`MagnitudeAxis` describes one display axis:

- `axisKind`: `"quantity"` or `"time"`.
- `normalization`: `"log"` or `"linear"`.
- `unitSI`: the required SI unit for the value.
- `referenceValueSI`: the denominator for log normalization or the step size
  for linear normalization. It defaults to `1`.
- `originSI`: the linear origin. It defaults to `0`.
- `quantityKind`: required for `"quantity"` axes so unrelated quantities such
  as length and mass are not mixed.

`space` is intentionally not accepted in Phase A-1. The JSDoc union documents
the extension point, and `FUTURE_SPACE_MAGNITUDE_AXIS_KIND` records the reserved
slot. Future work can add `"space"` to the union only after defining spatial
units and a representative-value resolver.

## Normalization

Quantity and time both default to log normalization because museum/reference
knowledge often spans orders of magnitude. A layout can opt into linear
normalization for bounded local comparisons.

Log normalization:

```text
normalizedScalar = log10(representativeValueSI / referenceValueSI)
```

The existing Size layout keeps its current behavior by using:

```text
axisKind = "quantity"
quantityKind = "body_length"
unitSI = "m"
normalization = "log"
referenceValueSI = 1
```

Linear normalization:

```text
normalizedScalar = (representativeValueSI - originSI) / referenceValueSI
```

Log axes reject zero or negative representative values instead of inventing a
position.

## Representative Value

`MagnitudeValue` is display-only and uses the same representative-value rule for
quantity and time:

- Single values use `valueSI`.
- Ranges use the positive geometric mean: `sqrt(minSI * maxSI)`.
- Invalid, missing, non-finite, negative, or incompatible-unit values return
  `null` so the caller can place them in an unset area.

Quantity values are derived from `VisualizationMeasurement` through
`magnitudeValueFromMeasurement()`. Existing `body_length` values remain SI
meters and keep the same geometric mean behavior for ranges.

Time values are represented as durations in SI seconds. `timeMagnitudeFromDuration()`
accepts an explicit duration or duration range. `timeMagnitudeFromMaInterval()`
converts geological `startMa` / `endMa` bounds into an interval-width duration;
it does not position chronology or replace the existing timeline board. A
geological interval from `145 Ma` to `100.5 Ma` therefore becomes a `44.5 Ma`
duration magnitude before normalization.

## No Regression Guarantee

This model is projection-only:

- Project JSON is unchanged.
- Saved `KnowledgeGraph` is unchanged.
- `VisualizationGraphV1` remains an intermediate display graph.
- Layout coordinates remain derived and are not persisted.
- The Layout Engine keeps pure functions with no Three.js dependency.
- Existing 2D knowledge map, quiz generation, and JSON import/export paths do
  not consume or save magnitude-axis state.
