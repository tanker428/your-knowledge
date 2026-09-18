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

## Silhouette Comparison Contract

Magnitude silhouette comparison is renderer-independent. The shared fixture
from `buildMagnitudeRecallFixture()` now includes:

- `silhouettes.assets`: static bundled SVG asset metadata, viewBox size, and
  normalized calibration interval.
- `silhouettes.bindings`: target/reference id to asset id links for
  `body_length`.
- `silhouettes.humanReference`: a `1.7 m` comparison reference that uses the
  same rules as any other target.
- `silhouettes.displayRule`: the math a renderer must reproduce.

The SVG is not the measurement authority. Body length still comes from the
existing `VisualizationMeasurement` / teaching item. A renderer derives display
position and dimensions for the current view only, and must not write those
derived coordinates or image sizes back to Reference, Observation, or Project
JSON data.

Asset calibration uses normalized fractions:

```text
calibrationSpanFraction = abs(bodyLengthEndX - bodyLengthStartX)
bodyLengthDrawUnits = valueSI * drawUnitsPerMeter
imageWidthDrawUnits = bodyLengthDrawUnits / calibrationSpanFraction
imageHeightDrawUnits = imageWidthDrawUnits * (viewBoxHeight / viewBoxWidth)
```

The same image keeps a uniform X/Y scale, preserving the silhouette outline.
Missing or failed SVG loads fall back to a calibrated length bar and label; the
renderer must not pretend an ordinary photo thumbnail is a real-scale
silhouette.

## Recall State Transitions

Recall uses one answer value:

```text
input pointer/numeric/keyboard -> updateMagnitudeRecallDraftAnswer()
answerValueSI -> answerU + numeric readout + board position + silhouette length
```

While answering, the target's registered `body_length` measurement is removed
from the display graph. If the learner has not answered yet, the target has no
real-scale silhouette. Once `answerValueSI` exists, the target silhouette uses
role `"answer"` and that value only. Comparison targets and the human reference
continue to use registered/reference values.

On confirm, the existing `scoreMagnitudeRecallAnswer()` remains the only
scoring path. Feedback keeps the saved answer silhouette and adds a role
`"correct"` silhouette for the representative curriculum value. Both use the
same draw-units-per-meter scale and preserve their axis positions, so the
learner compares both position and length directly.

Invalid input is explicit: log scales reject `0` and negative values, out-of
range typed values show a range message instead of being silently clamped, and
linear `0` remains a valid length-zero answer distinct from unanswered `null`.

## Log Position, Linear Length

Axis position and silhouette size encode different things. For the default
`body_length:log-0.1-100m` scale, `0.1`, `1`, `10`, and `100 m` are equally
spaced on the number line:

```text
u = log(v / 0.1) / log(100 / 0.1)
```

The silhouette length is not log-transformed:

```text
displayed body length = valueSI * drawUnitsPerMeter
```

So a `10 m` target is ten times the silhouette length of a `1 m` target even
though their axis positions are one tick interval apart. This keeps the number
line readable for orders of magnitude while preserving real-size comparison in
the silhouettes.

## No Regression Guarantee

This model is projection-only:

- Project JSON is unchanged.
- Saved `KnowledgeGraph` is unchanged.
- `VisualizationGraphV1` remains an intermediate display graph.
- Layout coordinates remain derived and are not persisted.
- The Layout Engine keeps pure functions with no Three.js dependency.
- Existing 2D knowledge map, quiz generation, and JSON import/export paths do
  not consume or save magnitude-axis state.
