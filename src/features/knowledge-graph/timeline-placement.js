function finiteAge(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Normalize arbitrary timeline data to an old-to-new pair measured in Ma. */
export function normalizeTimelineBounds(value) {
  const rawStart = finiteAge(value?.startMa);
  const rawEnd = finiteAge(value?.endMa);
  if (rawStart === null && rawEnd === null) return { kind: "unknown", startMa: null, endMa: null };
  if (rawStart === null || rawEnd === null || rawStart === rawEnd) {
    const point = rawStart ?? rawEnd;
    return { kind: "point", startMa: point, endMa: point };
  }
  return {
    kind: "period",
    startMa: Math.max(rawStart, rawEnd),
    endMa: Math.min(rawStart, rawEnd),
  };
}

/**
 * Score normalized time boundaries independently. A period with exactly one
 * correct boundary is partial, but never an exact/correct answer.
 */
export function scoreTimelineBounds(placement, selectedOption, targetOption) {
  const hasAnswerBounds = placement && (Object.hasOwn(placement, "startMa") || Object.hasOwn(placement, "endMa"));
  const selected = normalizeTimelineBounds(hasAnswerBounds ? placement : selectedOption);
  const target = normalizeTimelineBounds(targetOption);
  const startCorrect = selected.startMa === target.startMa;
  const endCorrect = selected.endMa === target.endMa;
  const correct = target.kind === "period"
    ? selected.kind === "period" && startCorrect && endCorrect
    : selected.kind === target.kind && startCorrect;
  const partial = target.kind === "period"
    && selected.kind === "period"
    && startCorrect !== endCorrect;
  return {
    timelineKind: target.kind,
    selectedStartMa: selected.startMa,
    selectedEndMa: selected.endMa,
    targetStartMa: target.startMa,
    targetEndMa: target.endMa,
    startCorrect,
    endCorrect,
    partial,
    timelineBoundsCorrect: correct,
  };
}
