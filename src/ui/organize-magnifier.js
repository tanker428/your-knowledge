import { unrotateImagePoint } from "../domain/photo-rotation.js";

export function calculateMagnifierGeometry(baseRect, containerRect, point, rotation, zoom, preferredSize = 200) {
  const size = Math.max(120, Math.min(preferredSize, containerRect.width - 8, containerRect.height - 8));
  const x = Math.min(baseRect.left + baseRect.width, Math.max(baseRect.left, point.x));
  const y = Math.min(baseRect.top + baseRect.height, Math.max(baseRect.top, point.y));
  const left = Math.min(Math.max(0, x - containerRect.left - size / 2), Math.max(0, containerRect.width - size));
  const top = Math.min(Math.max(0, y - containerRect.top - size / 2), Math.max(0, containerRect.height - size));
  const visualPoint = { x: (x - baseRect.left) / baseRect.width, y: (y - baseRect.top) / baseRect.height };
  const imagePoint = unrotateImagePoint(visualPoint, rotation);
  const quarterTurn = rotation === 90 || rotation === 270;
  const unrotatedWidth = quarterTurn ? baseRect.height : baseRect.width;
  const unrotatedHeight = quarterTurn ? baseRect.width : baseRect.height;
  const vectorX = (imagePoint.x - 0.5) * unrotatedWidth * zoom;
  const vectorY = (imagePoint.y - 0.5) * unrotatedHeight * zoom;
  const rotatedVector = rotation === 90
    ? { x: -vectorY, y: vectorX }
    : rotation === 180
      ? { x: -vectorX, y: -vectorY }
      : rotation === 270
        ? { x: vectorY, y: -vectorX }
        : { x: vectorX, y: vectorY };
  return {
    size, left, top,
    imageWidth: unrotatedWidth * zoom,
    imageHeight: unrotatedHeight * zoom,
    imageLeft: left + size / 2 - rotatedVector.x - unrotatedWidth * zoom / 2,
    imageTop: top + size / 2 - rotatedVector.y - unrotatedHeight * zoom / 2,
    controlsLeft: Math.min(Math.max(0, left + size - 76), Math.max(0, containerRect.width - 76)),
    controlsTop: top + size + 8 <= containerRect.height ? top + size + 8 : Math.max(0, top - 42),
  };
}

export function applyMagnifierGeometry({ lens, image, controls, level, source, geometry, rotation, zoom }) {
  lens.style.width = `${geometry.size}px`;
  lens.style.height = `${geometry.size}px`;
  lens.style.left = `${geometry.left}px`;
  lens.style.top = `${geometry.top}px`;
  image.src = source || image.src;
  image.style.width = `${geometry.imageWidth}px`;
  image.style.height = `${geometry.imageHeight}px`;
  image.style.transformOrigin = "50% 50%";
  image.style.transform = `rotate(${rotation}deg)`;
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
  const start = (event) => {
    activePointerId = event.pointerId;
    activate({ x: event.clientX, y: event.clientY }, event.pointerId);
    container.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };
  const stop = () => {
    clearPending();
    activePointerId = null;
    deactivate();
  };
  const onContextMenu = (event) => {
    const target = event.target;
    if (isInsideImage(event) || target?.closest?.("#observationOverlay, #regionDrawLayer")) event.preventDefault();
  };
  const onWheel = (event) => {
    if (activePointerId === null) return;
    event.preventDefault();
    changeZoom(event.deltaY < 0 ? 1 : -1);
  };
  const onPointerDown = (event) => {
    const target = event.target;
    if (target?.closest?.("#imageMagnifierControls") || isBlocked() || !isInsideImage(event)) return;
    if (event.pointerType === "mouse") {
      if (event.button === 2) start(event);
      return;
    }
    clearPending();
    longPressStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    longPressTimer = setTimeout(() => {
      if (longPressStart?.pointerId === event.pointerId) start(event);
    }, longPressDelay);
  };
  const onPointerMove = (event) => {
    if (event.pointerId === activePointerId) {
      move({ x: event.clientX, y: event.clientY });
      event.preventDefault();
      return;
    }
    if (longPressStart?.pointerId === event.pointerId
      && Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y) > 10) clearPending();
  };
  const onPointerEnd = (event) => {
    if (event.pointerId === activePointerId || event.pointerType === "mouse") {
      event.preventDefault();
      stop();
    } else if (longPressStart?.pointerId === event.pointerId) clearPending();
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
