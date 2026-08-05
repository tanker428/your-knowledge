export const MIN_IMAGE_ZOOM = 1;
export const MAX_IMAGE_ZOOM = 4;

export function clampImageZoom(value, minimum = MIN_IMAGE_ZOOM, maximum = MAX_IMAGE_ZOOM) {
  return Math.min(maximum, Math.max(minimum, Number(value) || minimum));
}

export function createImageViewport(photoId = null) {
  return { photoId, fitScale: 1, scale: 1, x: 0, y: 0 };
}

export function resetImageViewport(photoId = null, fitScale = 1) {
  return { photoId, fitScale, scale: fitScale, x: 0, y: 0 };
}

export function getTransformedImageRect(baseRect, viewport) {
  const fitScale = Number(viewport?.fitScale) || 1;
  const scale = clampImageZoom(viewport?.scale, fitScale, fitScale * MAX_IMAGE_ZOOM) / fitScale;
  return {
    left: baseRect.left + (baseRect.width * (1 - scale)) / 2 + (viewport?.x || 0),
    top: baseRect.top + (baseRect.height * (1 - scale)) / 2 + (viewport?.y || 0),
    width: baseRect.width * scale,
    height: baseRect.height * scale,
  };
}

export function panImageViewport(viewport, deltaX, deltaY) {
  return { ...viewport, x: (viewport.x || 0) + deltaX, y: (viewport.y || 0) + deltaY };
}

export function zoomImageViewport(viewport, baseRect, nextScale, anchor = null) {
  const currentRect = getTransformedImageRect(baseRect, viewport);
  const fitScale = Number(viewport?.fitScale) || 1;
  const scale = clampImageZoom(nextScale, fitScale, fitScale * MAX_IMAGE_ZOOM);
  const point = anchor || {
    x: baseRect.left + baseRect.width / 2,
    y: baseRect.top + baseRect.height / 2,
  };
  const relativeX = currentRect.width ? (point.x - currentRect.left) / currentRect.width : 0.5;
  const relativeY = currentRect.height ? (point.y - currentRect.top) / currentRect.height : 0.5;
  const multiplier = scale / fitScale;
  const centeredLeft = baseRect.left + (baseRect.width * (1 - multiplier)) / 2;
  const centeredTop = baseRect.top + (baseRect.height * (1 - multiplier)) / 2;
  return {
    ...viewport,
    scale,
    x: point.x - centeredLeft - relativeX * baseRect.width * multiplier,
    y: point.y - centeredTop - relativeY * baseRect.height * multiplier,
  };
}

export function clientPointToImagePercent(point, baseRect, viewport) {
  const rect = getTransformedImageRect(baseRect, viewport);
  if (!rect.width || !rect.height) return null;
  return {
    x: Math.min(100, Math.max(0, ((point.x - rect.left) / rect.width) * 100)),
    y: Math.min(100, Math.max(0, ((point.y - rect.top) / rect.height) * 100)),
  };
}
