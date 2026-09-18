import { normalizePhotoRotation, unrotateImagePoint } from "../domain/photo-rotation.js";

export const MAGNIFIER_MIN_ZOOM = 2;
const MAGNIFIER_MAX_ZOOM = 6;
export const MAGNIFIER_ZOOM_STEP = 0.5;
const MAGNIFIER_MIN_SIZE = 120;
const MAGNIFIER_PREFERRED_SIZE = 200;
const MAGNIFIER_CONTROLS_WIDTH = 76;
const MAGNIFIER_CONTROLS_HEIGHT = 34;
const MAGNIFIER_CONTROLS_GAP = 8;
const PINCH_STEP_PIXELS = 24;
const mountedMagnifierHosts = new WeakSet();

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function clampMagnifierZoom(value) {
  return Math.min(
    MAGNIFIER_MAX_ZOOM,
    Math.max(
      MAGNIFIER_MIN_ZOOM,
      Math.round(value / MAGNIFIER_ZOOM_STEP) * MAGNIFIER_ZOOM_STEP,
    ),
  );
}

export function calculateMagnifierGeometry(
  baseRect,
  containerRect,
  point,
  rotation,
  zoom,
  preferredSize = MAGNIFIER_PREFERRED_SIZE,
) {
  const normalizedRotation = normalizePhotoRotation(rotation);

  // baseRect is the rendered image and is the sole reference for lens size and
  // source-image mapping. containerRect only converts the client-space cursor
  // into the lens host's positioning coordinates.
  const size = Math.max(
    MAGNIFIER_MIN_SIZE,
    Math.min(preferredSize, baseRect.width, baseRect.height),
  );
  const sampleX = clamp(point.x, baseRect.left, baseRect.left + baseRect.width);
  const sampleY = clamp(point.y, baseRect.top, baseRect.top + baseRect.height);

  // Draw around the raw cursor, even when the circle overhangs the host. Only
  // the sampled image point above is clamped to the photo.
  const left = point.x - containerRect.left - size / 2;
  const top = point.y - containerRect.top - size / 2;
  const visualPoint = {
    x: (sampleX - baseRect.left) / baseRect.width,
    y: (sampleY - baseRect.top) / baseRect.height,
  };
  const imagePoint = unrotateImagePoint(visualPoint, normalizedRotation);
  const quarterTurn = normalizedRotation === 90 || normalizedRotation === 270;
  const unrotatedWidth = quarterTurn ? baseRect.height : baseRect.width;
  const unrotatedHeight = quarterTurn ? baseRect.width : baseRect.height;
  const imageWidth = unrotatedWidth * zoom;
  const imageHeight = unrotatedHeight * zoom;
  const vectorX = (imagePoint.x - 0.5) * imageWidth;
  const vectorY = (imagePoint.y - 0.5) * imageHeight;
  const rotatedVector = normalizedRotation === 90
    ? { x: -vectorY, y: vectorX }
    : normalizedRotation === 180
      ? { x: -vectorX, y: -vectorY }
      : normalizedRotation === 270
        ? { x: vectorY, y: -vectorX }
        : { x: vectorX, y: vectorY };
  const maximumControlsLeft = Math.max(0, containerRect.width - MAGNIFIER_CONTROLS_WIDTH);
  const maximumControlsTop = Math.max(0, containerRect.height - MAGNIFIER_CONTROLS_HEIGHT);
  const belowControlsTop = top + size + MAGNIFIER_CONTROLS_GAP;
  const aboveControlsTop = top - MAGNIFIER_CONTROLS_GAP - MAGNIFIER_CONTROLS_HEIGHT;
  return {
    size,
    left,
    top,
    sampleX,
    sampleY,
    imageWidth,
    imageHeight,
    // The duplicated image is positioned inside the lens, so these offsets
    // are lens-local. Adding the host-relative lens offset here causes drift.
    imageLeft: size / 2 - rotatedVector.x - imageWidth / 2,
    imageTop: size / 2 - rotatedVector.y - imageHeight / 2,
    controlsLeft: clamp(
      left + (size - MAGNIFIER_CONTROLS_WIDTH) / 2,
      0,
      maximumControlsLeft,
    ),
    controlsTop: clamp(
      belowControlsTop + MAGNIFIER_CONTROLS_HEIGHT <= containerRect.height
        ? belowControlsTop
        : aboveControlsTop,
      0,
      maximumControlsTop,
    ),
  };
}

export function applyMagnifierGeometry({
  lens,
  image,
  controls,
  level,
  source,
  geometry,
  rotation,
  zoom,
}) {
  lens.style.width = `${geometry.size}px`;
  lens.style.height = `${geometry.size}px`;
  lens.style.left = `${geometry.left}px`;
  lens.style.top = `${geometry.top}px`;
  image.src = source || image.src;
  image.style.width = `${geometry.imageWidth}px`;
  image.style.height = `${geometry.imageHeight}px`;
  image.style.transformOrigin = "50% 50%";
  image.style.transform = `rotate(${normalizePhotoRotation(rotation)}deg)`;
  image.style.left = `${geometry.imageLeft}px`;
  image.style.top = `${geometry.imageTop}px`;
  level.textContent = `${zoom.toFixed(1)}×`;
  if (controls) {
    controls.style.left = `${geometry.controlsLeft}px`;
    controls.style.top = `${geometry.controlsTop}px`;
  }
  lens.classList.remove("hidden");
  controls?.classList.remove("hidden");
}

export function bindMagnifierInteractions({
  container,
  windowTarget,
  zoomInButton,
  zoomOutButton,
  getBaseRect,
  isBlocked,
  activate,
  move,
  deactivate,
  changeZoom,
  longPressDelay = 350,
}) {
  let activePointerId = null;
  let longPressStart = null;
  let longPressTimer = null;
  let pinchDistance = null;
  const touchPoints = new Map();

  const clearPending = () => {
    if (longPressTimer !== null) clearTimeout(longPressTimer);
    longPressTimer = null;
    longPressStart = null;
  };
  const isInsideImage = (event) => {
    const rect = getBaseRect();
    return rect
      && event.clientX >= rect.left && event.clientX <= rect.left + rect.width
      && event.clientY >= rect.top && event.clientY <= rect.top + rect.height;
  };
  const currentPinchDistance = () => {
    if (touchPoints.size < 2) return null;
    const [first, second] = [...touchPoints.values()];
    return Math.hypot(second.x - first.x, second.y - first.y);
  };
  const start = (event) => {
    activePointerId = event.pointerId;
    touchPoints.clear();
    if (event.pointerType === "touch") {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    activate({ x: event.clientX, y: event.clientY }, event.pointerId);
    container.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const stop = () => {
    clearPending();
    activePointerId = null;
    pinchDistance = null;
    touchPoints.clear();
    deactivate();
  };
  const onContextMenu = (event) => {
    const target = event.target;
    if (isInsideImage(event) || target?.closest?.("#observationOverlay, #regionDrawLayer")) {
      event.preventDefault();
    }
  };
  const onWheel = (event) => {
    if (activePointerId === null) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1 : -1);
  };
  const onPointerDown = (event) => {
    const target = event.target;
    if (target?.closest?.("#imageMagnifierControls, [data-magnifier-zoom]") || isBlocked()) {
      return;
    }
    if (event.pointerType === "touch" && activePointerId !== null) {
      if (!isInsideImage(event)) return;
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
      pinchDistance = currentPinchDistance();
      container.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      return;
    }
    if (!isInsideImage(event)) return;
    if (event.pointerType === "mouse") {
      if (event.button === 2) start(event);
      return;
    }
    clearPending();
    longPressStart = {
      x: event.clientX,
      y: event.clientY,
      pointerId: event.pointerId,
    };
    longPressTimer = setTimeout(() => {
      if (longPressStart?.pointerId === event.pointerId) start(event);
    }, longPressDelay);
  };
  const onPointerMove = (event) => {
    if (touchPoints.has(event.pointerId)) {
      touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    if (activePointerId !== null && touchPoints.size >= 2) {
      const nextDistance = currentPinchDistance();
      if (nextDistance !== null && pinchDistance !== null) {
        const distanceChange = nextDistance - pinchDistance;
        const steps = Math.floor(Math.abs(distanceChange) / PINCH_STEP_PIXELS);
        for (let index = 0; index < steps; index += 1) {
          changeZoom(distanceChange > 0 ? 1 : -1);
        }
        if (steps > 0) pinchDistance = nextDistance;
      }
      event.preventDefault();
      return;
    }
    if (event.pointerId === activePointerId) {
      move({ x: event.clientX, y: event.clientY });
      event.preventDefault();
      return;
    }
    if (
      longPressStart?.pointerId === event.pointerId
      && Math.hypot(
        event.clientX - longPressStart.x,
        event.clientY - longPressStart.y,
      ) > 10
    ) {
      clearPending();
    }
  };
  const onPointerEnd = (event) => {
    if (event.pointerType === "touch") {
      touchPoints.delete(event.pointerId);
      pinchDistance = currentPinchDistance();
    }
    if (event.pointerId === activePointerId) {
      event.preventDefault();
      stop();
    } else if (longPressStart?.pointerId === event.pointerId) {
      clearPending();
    }
  };
  const onPointerLeave = (event) => {
    if (event.pointerType === "mouse") stop();
  };
  const onBlur = () => stop();
  const onZoomIn = () => changeZoom(1);
  const onZoomOut = () => changeZoom(-1);

  container.addEventListener("contextmenu", onContextMenu);
  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("pointerdown", onPointerDown);
  container.addEventListener("pointermove", onPointerMove);
  container.addEventListener("pointerup", onPointerEnd);
  container.addEventListener("pointercancel", onPointerEnd);
  container.addEventListener("pointerleave", onPointerLeave);
  windowTarget.addEventListener("blur", onBlur);
  zoomInButton?.addEventListener("click", onZoomIn);
  zoomOutButton?.addEventListener("click", onZoomOut);

  return {
    reset: stop,
    destroy() {
      stop();
      container.removeEventListener("contextmenu", onContextMenu);
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("pointermove", onPointerMove);
      container.removeEventListener("pointerup", onPointerEnd);
      container.removeEventListener("pointercancel", onPointerEnd);
      container.removeEventListener("pointerleave", onPointerLeave);
      windowTarget.removeEventListener("blur", onBlur);
      zoomInButton?.removeEventListener("click", onZoomIn);
      zoomOutButton?.removeEventListener("click", onZoomOut);
    },
  };
}

function magnifierMarkup(showControls) {
  const controls = showControls
    ? '<span class="shared-magnifier-controls hidden" aria-label="虫眼鏡の倍率"><button type="button" data-magnifier-zoom="out" aria-label="虫眼鏡を縮小">−</button><button type="button" data-magnifier-zoom="in" aria-label="虫眼鏡を拡大">＋</button></span>'
    : "";
  return `<div class="shared-magnifier hidden" aria-hidden="true"><img alt="" draggable="false" /><strong>2.0×</strong></div>${controls}`;
}

export function mountMagnifier(
  container,
  image,
  {
    showControls = true,
    rotation = 0,
    source = "",
    preferredSize = MAGNIFIER_PREFERRED_SIZE,
    windowTarget = window,
  } = {},
) {
  if (!container || !image || mountedMagnifierHosts.has(container)) return null;
  mountedMagnifierHosts.add(container);
  container.classList.add("magnifier-host");
  container.insertAdjacentHTML("beforeend", magnifierMarkup(showControls));
  const lens = container.querySelector(".shared-magnifier");
  const lensImage = lens?.querySelector("img");
  const level = lens?.querySelector("strong");
  const controls = container.querySelector(".shared-magnifier-controls");
  const zoomInButton = controls?.querySelector('[data-magnifier-zoom="in"]');
  const zoomOutButton = controls?.querySelector('[data-magnifier-zoom="out"]');
  if (!lens || !lensImage || !level) return null;

  let point = null;
  let zoom = MAGNIFIER_MIN_ZOOM;
  const normalizedRotation = normalizePhotoRotation(rotation);
  const hide = () => {
    point = null;
    lens.classList.add("hidden");
    controls?.classList.add("hidden");
    container.style.removeProperty("touch-action");
  };
  const render = () => {
    if (!point) return;
    const baseRect = image.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (!baseRect.width || !baseRect.height || !containerRect.width || !containerRect.height) {
      return;
    }
    const geometry = calculateMagnifierGeometry(
      baseRect,
      containerRect,
      point,
      normalizedRotation,
      zoom,
      preferredSize,
    );
    applyMagnifierGeometry({
      lens,
      image: lensImage,
      controls,
      level,
      source: source || image.currentSrc || image.src,
      geometry,
      rotation: normalizedRotation,
      zoom,
    });
  };
  const changeZoom = (direction) => {
    zoom = clampMagnifierZoom(zoom + direction * MAGNIFIER_ZOOM_STEP);
    render();
  };
  return bindMagnifierInteractions({
    container,
    windowTarget,
    zoomInButton,
    zoomOutButton,
    getBaseRect: () => image.getBoundingClientRect(),
    isBlocked: () => false,
    activate: (nextPoint) => {
      point = nextPoint;
      container.style.touchAction = "none";
      render();
    },
    move: (nextPoint) => {
      point = nextPoint;
      render();
    },
    deactivate: hide,
    changeZoom,
  });
}
