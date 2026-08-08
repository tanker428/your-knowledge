function hasPeriod(option) {
  return Number.isFinite(option?.startMa) && Number.isFinite(option?.endMa);
}

export function timelinePeriodSpan(options) {
  const durations = (options || [])
    .filter(hasPeriod)
    .map((option) => Math.abs(option.startMa - option.endMa));
  return durations.length ? Math.max(...durations, 1) : 1;
}

export function timelinePeriodWidth(option, options) {
  if (!hasPeriod(option)) return 8;
  const duration = Math.abs(option.startMa - option.endMa);
  return duration ? Math.max(12, Math.round((duration / timelinePeriodSpan(options)) * 100)) : 8;
}
