export const MAGNIFIER_MIN_ZOOM = 2;
export const MAGNIFIER_MAX_ZOOM = 6;
export const MAGNIFIER_ZOOM_STEP = 0.5;

export function clampMagnifierZoom(value) {
  return Math.min(
    MAGNIFIER_MAX_ZOOM,
    Math.max(MAGNIFIER_MIN_ZOOM, Math.round(value / MAGNIFIER_ZOOM_STEP) * MAGNIFIER_ZOOM_STEP),
  );
}

export function magnifierPoint(containerRect, clientPoint) {
  const x = Math.min(containerRect.right, Math.max(containerRect.left, clientPoint.x));
  const y = Math.min(containerRect.bottom, Math.max(containerRect.top, clientPoint.y));
  return { x, y, u: (x - containerRect.left) / containerRect.width, v: (y - containerRect.top) / containerRect.height };
}

export function magnifierImagePosition(containerRect, point, lensSize, zoom, lensPosition = {
  left: point.x - containerRect.left - lensSize / 2,
  top: point.y - containerRect.top - lensSize / 2,
}) {
  const centerX = point.x - containerRect.left - lensPosition.left;
  const centerY = point.y - containerRect.top - lensPosition.top;
  return {
    left: lensSize / 2 - centerX * zoom,
    top: lensSize / 2 - centerY * zoom,
    width: containerRect.width * zoom,
    height: containerRect.height * zoom,
  };
}

function magnifierMarkup(showControls) {
  return `<div class="shared-magnifier hidden" aria-hidden="true"><img alt="" draggable="false" /><strong>2.0×</strong>${showControls ? '<span class="shared-magnifier-controls"><button type="button" data-magnifier-zoom="out" aria-label="虫眼鏡を縮小">−</button><button type="button" data-magnifier-zoom="in" aria-label="虫眼鏡を拡大">＋</button></span>' : ""}</div>`;
}

export function mountMagnifier(container, image, { showControls = true } = {}) {
  if (!container || !image || container.dataset.sharedMagnifierBound === "true") return;
  container.dataset.sharedMagnifierBound = "true";
  container.classList.add("magnifier-host");
  container.insertAdjacentHTML("beforeend", magnifierMarkup(showControls));
  const lens = container.querySelector(".shared-magnifier");
  const lensImage = lens?.querySelector("img");
  const level = lens?.querySelector("strong");
  let active = false;
  let pointerId = null;
  let point = null;
  let zoom = MAGNIFIER_MIN_ZOOM;
  let timer = null;
  let longPressStart = null;
  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    longPressStart = null;
  };
  const setZoom = (direction) => {
    zoom = clampMagnifierZoom(zoom + direction * MAGNIFIER_ZOOM_STEP);
    if (point) render();
  };
  const hide = () => {
    stopTimer();
    active = false;
    pointerId = null;
    point = null;
    lens?.classList.add("hidden");
    container.classList.remove("magnifier-active");
    container.style.removeProperty("touch-action");
  };
  const render = () => {
    if (!active || !point || !lens || !lensImage) return;
    const rect = container.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const next = magnifierPoint(rect, point);
    const size = Math.max(140, Math.min(200, rect.width - 8, rect.height - 8));
    const lensLeft = Math.min(Math.max(0, next.x - rect.left - size / 2), Math.max(0, rect.width - size));
    const lensTop = Math.min(Math.max(0, next.y - rect.top - size / 2), Math.max(0, rect.height - size));
    const position = magnifierImagePosition(rect, next, size, zoom, { left: lensLeft, top: lensTop });
    lens.style.width = `${size}px`;
    lens.style.height = `${size}px`;
    lens.style.left = `${lensLeft}px`;
    lens.style.top = `${lensTop}px`;
    lensImage.src = image.currentSrc || image.src;
    lensImage.style.left = `${position.left}px`;
    lensImage.style.top = `${position.top}px`;
    lensImage.style.width = `${position.width}px`;
    lensImage.style.height = `${position.height}px`;
    level.textContent = `${zoom.toFixed(1)}×`;
    lens.classList.remove("hidden");
  };
  const insideImage = (event) => {
    const rect = image.getBoundingClientRect();
    return event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
  };
  container.addEventListener("contextmenu", (event) => {
    if (insideImage(event)) event.preventDefault();
  });
  container.addEventListener("wheel", (event) => {
    if (!active) return;
    event.preventDefault();
    setZoom(event.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  container.addEventListener("pointerdown", (event) => {
    if (!insideImage(event) || event.target.closest("[data-magnifier-zoom]")) return;
    if (event.pointerType === "mouse") {
      if (event.button !== 2) return;
      active = true;
      pointerId = event.pointerId;
      point = { x: event.clientX, y: event.clientY };
      container.setPointerCapture?.(event.pointerId);
      container.style.touchAction = "none";
      event.preventDefault();
      render();
      return;
    }
    stopTimer();
    longPressStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
    timer = setTimeout(() => {
      if (!longPressStart || longPressStart.pointerId !== event.pointerId) return;
      active = true;
      pointerId = event.pointerId;
      point = { x: event.clientX, y: event.clientY };
      container.style.touchAction = "none";
      event.preventDefault();
      render();
    }, 350);
  });
  container.addEventListener("pointermove", (event) => {
    if (active && event.pointerId === pointerId) {
      point = { x: event.clientX, y: event.clientY };
      event.preventDefault();
      render();
      return;
    }
    if (longPressStart && Math.hypot(event.clientX - longPressStart.x, event.clientY - longPressStart.y) > 10) stopTimer();
  });
  container.addEventListener("pointerup", (event) => {
    if (active && event.pointerId === pointerId) hide();
    else if (longPressStart?.pointerId === event.pointerId) stopTimer();
  });
  container.addEventListener("pointercancel", hide);
  container.addEventListener("pointerleave", (event) => { if (event.pointerType === "mouse") hide(); });
  window.addEventListener("blur", hide);
  lens?.querySelector('[data-magnifier-zoom="in"]')?.addEventListener("click", () => setZoom(1));
  lens?.querySelector('[data-magnifier-zoom="out"]')?.addEventListener("click", () => setZoom(-1));
}
