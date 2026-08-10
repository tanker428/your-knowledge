import { normalizeTimelineBounds } from "../features/knowledge-graph/timeline-placement.js";

export function timelinePeriodSpan(options) {
  const bounds = (options || []).map(normalizeTimelineBounds).filter((value) => value.kind !== "unknown");
  if (!bounds.length) return 1;
  const oldest = Math.max(...bounds.map((value) => value.startMa));
  const newest = Math.min(...bounds.map((value) => value.endMa));
  return Math.max(oldest - newest, 1);
}

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

export function timelineNodeGeometry(option, options) {
  const normalized = normalizeTimelineBounds(option);
  const left = Math.max(0, Math.min(100, timelinePosition(option, options)));
  const width = normalized.kind === "period"
    ? Math.max(0, Math.min(100 - left, timelinePeriodWidth(option, options)))
    : 0;
  return { kind: normalized.kind === "period" ? "period" : "point", left, width };
}
