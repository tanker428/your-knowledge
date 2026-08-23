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
 * Format an age in Ma as Japanese "〜年前". `251.9` reads 2億5190万年前 rather
 * than "251.9 Ma", which is unreadable for anyone outside geology. Kept free of
 * `toLocaleString` so the output is identical on every runtime.
 * @param {number|null|undefined} ma
 */
export function formatGeologicalAgeJa(ma) {
  const value = Number(ma);
  if (!Number.isFinite(value) || value === 0) return "現在";
  const years = Math.abs(value) * 1_000_000;
  if (years >= 100_000_000) {
    let oku = Math.floor(years / 100_000_000);
    let man = Math.round((years - oku * 100_000_000) / 10_000);
    if (man >= 10_000) {
      oku += 1;
      man = 0;
    }
    return man ? `${oku}億${man}万年前` : `${oku}億年前`;
  }
  if (years >= 10_000) {
    // Below 100万年 a whole-man rounding would collapse 1.17万 into 1万.
    const man = years < 1_000_000
      ? Math.round((years / 10_000) * 10) / 10
      : Math.round(years / 10_000);
    return `${man}万年前`;
  }
  return `${Math.round(years)}年前`;
}

/** Return the displayed timeline span in Ma. */
export function timelinePeriodSpan(options) {
  const bounds = (options || []).map(normalizeTimelineBounds).filter((value) => value.kind !== "unknown");
  if (!bounds.length) return 1;
  const oldest = Math.max(...bounds.map((value) => value.startMa));
  const newest = Math.min(...bounds.map((value) => value.endMa));
  return Math.max(oldest - newest, 1);
}

/** Return a period width as a percentage of the displayed timeline. */
export function timelinePeriodWidth(option, options) {
  const value = normalizeTimelineBounds(option);
  if (value.kind !== "period") return 0;
  return ((value.startMa - value.endMa) / timelinePeriodSpan(options)) * 100;
}

/** Position an age on an old-to-new, left-to-right axis. */
export function timelinePosition(option, options) {
  const values = (options || []).map(normalizeTimelineBounds);
  const known = values.filter((value) => value.kind !== "unknown");
  const value = normalizeTimelineBounds(option);
  if (!known.length || value.kind === "unknown") {
    const index = Math.max(0, (options || []).indexOf(option));
    return options?.length > 1 ? (index / (options.length - 1)) * 100 : 50;
  }
  const oldest = Math.max(...known.map((item) => item.startMa));
  return ((oldest - value.startMa) / timelinePeriodSpan(options)) * 100;
}

/** Return normalized left/width geometry shared by the 2D and 3D timelines. */
export function timelineNodeGeometry(option, options) {
  const normalized = normalizeTimelineBounds(option);
  const left = Math.max(0, Math.min(100, timelinePosition(option, options)));
  const width = normalized.kind === "period"
    ? Math.max(0, Math.min(100 - left, timelinePeriodWidth(option, options)))
    : 0;
  return { kind: normalized.kind === "period" ? "period" : "point", left, width };
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
