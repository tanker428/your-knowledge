import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import {
  calculateMagnifierGeometry,
  clampMagnifierZoom,
  mountMagnifier,
} from "../src/ui/organize-magnifier.js";

const baseRect = { left: 100, top: 50, width: 400, height: 200 };
const containerRect = { left: 80, top: 20, width: 500, height: 300 };

function expectLensCentered(geometry, point, container = containerRect) {
  expect(geometry.left + geometry.size / 2).toBeCloseTo(point.x - container.left);
  expect(geometry.top + geometry.size / 2).toBeCloseTo(point.y - container.top);
}

function rotatedImagePixel(geometry, imagePoint, rotation) {
  const vectorX = (imagePoint.x - 0.5) * geometry.imageWidth;
  const vectorY = (imagePoint.y - 0.5) * geometry.imageHeight;
  const rotatedVector = rotation === 90
    ? { x: -vectorY, y: vectorX }
    : rotation === 180
      ? { x: -vectorX, y: -vectorY }
      : rotation === 270
        ? { x: vectorY, y: -vectorX }
        : { x: vectorX, y: vectorY };
  return {
    x: geometry.imageLeft + geometry.imageWidth / 2 + rotatedVector.x,
    y: geometry.imageTop + geometry.imageHeight / 2 + rotatedVector.y,
  };
}

/** @param {any} window @param {string} type @param {MouseEventInit & {pointerId?:number,pointerType?:string}} [options] */
function pointerEvent(window, type, options = {}) {
  const { pointerId = 1, pointerType = "mouse", ...init } = options;
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  return event;
}

describe("shared circular magnifier geometry", () => {
  it("keeps zoom within the documented range and step", () => {
    expect(clampMagnifierZoom(0)).toBe(2);
    expect(clampMagnifierZoom(3.24)).toBe(3);
    expect(clampMagnifierZoom(99)).toBe(6);
  });

  it("centers the lens on the cursor at the image right edge", () => {
    const point = { x: baseRect.left + baseRect.width, y: 140 };
    const geometry = calculateMagnifierGeometry(
      baseRect,
      containerRect,
      point,
      0,
      2,
    );

    expect(geometry.left).toBe(320);
    expectLensCentered(geometry, point);
    expect(geometry.sampleX).toBe(500);
  });

  it("centers the lens on the cursor at the image bottom edge", () => {
    const point = { x: 250, y: baseRect.top + baseRect.height };
    const geometry = calculateMagnifierGeometry(
      baseRect,
      containerRect,
      point,
      0,
      2,
    );

    expect(geometry.top).toBe(130);
    expectLensCentered(geometry, point);
    expect(geometry.sampleY).toBe(250);
  });

  it.each([
    ["top-left", { x: 100, y: 50 }],
    ["top-right", { x: 500, y: 50 }],
    ["bottom-left", { x: 100, y: 250 }],
    ["bottom-right", { x: 500, y: 250 }],
  ])("keeps the cursor centered and the sample in bounds at the %s corner", (_name, point) => {
    const geometry = calculateMagnifierGeometry(
      baseRect,
      containerRect,
      point,
      0,
      2,
    );

    expectLensCentered(geometry, point);
    expect(geometry.sampleX).toBeGreaterThanOrEqual(baseRect.left);
    expect(geometry.sampleX).toBeLessThanOrEqual(baseRect.left + baseRect.width);
    expect(geometry.sampleY).toBeGreaterThanOrEqual(baseRect.top);
    expect(geometry.sampleY).toBeLessThanOrEqual(baseRect.top + baseRect.height);
  });

  it.each([
    ["top-left", { x: 60, y: 10 }, { x: 100, y: 50 }],
    ["top-right", { x: 540, y: 10 }, { x: 500, y: 50 }],
    ["bottom-left", { x: 60, y: 290 }, { x: 100, y: 250 }],
    ["bottom-right", { x: 540, y: 290 }, { x: 500, y: 250 }],
  ])("continues following the cursor outside the %s while sampling its corner", (_name, point, sample) => {
    const geometry = calculateMagnifierGeometry(
      baseRect,
      containerRect,
      point,
      0,
      2,
    );

    expectLensCentered(geometry, point);
    expect({ x: geometry.sampleX, y: geometry.sampleY }).toEqual(sample);
  });

  it.each([
    [0, { x: 1, y: 0.25 }],
    [90, { x: 0.25, y: 0 }],
    [180, { x: 0, y: 0.75 }],
    [270, { x: 0.75, y: 1 }],
  ])("places the sampled pixel at the lens center at %d degrees", (rotation, imagePoint) => {
    const nonSquareBaseRect = { left: 100, top: 50, width: 360, height: 180 };
    const closeContainerRect = { left: 80, top: 20, width: 400, height: 240 };
    const point = { x: 460, y: 95 };
    const geometry = calculateMagnifierGeometry(
      nonSquareBaseRect,
      closeContainerRect,
      point,
      rotation,
      2.5,
    );
    const displayedPixel = rotatedImagePixel(geometry, imagePoint, rotation);

    expectLensCentered(geometry, point, closeContainerRect);
    expect(displayedPixel.x).toBeCloseTo(geometry.size / 2);
    expect(displayedPixel.y).toBeCloseTo(geometry.size / 2);
  });

  it("uses the image rect for sizing and mapping when its container has padding", () => {
    const paddedContainer = { left: 80, top: 20, width: 440, height: 260 };
    const point = { x: 500, y: 250 };
    const geometry = calculateMagnifierGeometry(
      baseRect,
      paddedContainer,
      point,
      0,
      3,
    );

    expect(geometry.size).toBe(200);
    expect(geometry.imageWidth).toBe(1200);
    expect(geometry.imageHeight).toBe(600);
    expect(geometry.left).toBe(320);
    expect(geometry.top).toBe(130);
    expectLensCentered(geometry, point, paddedContainer);
  });

  it("keeps controls reachable while the lens overhangs on a 412px viewport", () => {
    const mobileContainer = { left: 12, top: 20, width: 388, height: 260 };
    const mobileBase = { left: 12, top: 41, width: 388, height: 218 };
    const point = { x: 400, y: 259 };
    const geometry = calculateMagnifierGeometry(
      mobileBase,
      mobileContainer,
      point,
      0,
      2,
    );

    expect(geometry.size).toBe(200);
    expectLensCentered(geometry, point, mobileContainer);
    expect(geometry.controlsLeft).toBeGreaterThanOrEqual(0);
    expect(geometry.controlsLeft + 76).toBeLessThanOrEqual(mobileContainer.width);
    expect(geometry.controlsTop).toBeGreaterThanOrEqual(0);
    expect(geometry.controlsTop + 34).toBeLessThanOrEqual(mobileContainer.height);
  });

  it("uses a readable 120px lens and keeps controls inside a 105px host", () => {
    const smallContainer = { left: 20, top: 100, width: 105, height: 105 };
    const point = { x: 125, y: 205 };
    const geometry = calculateMagnifierGeometry(
      smallContainer,
      smallContainer,
      point,
      0,
      2,
    );

    expect(geometry).toMatchObject({
      size: 120,
      left: 45,
      top: 45,
      controlsLeft: 29,
      controlsTop: 3,
    });
    expectLensCentered(geometry, point, smallContainer);
    expect(geometry.controlsLeft + 76).toBe(105);
    expect(geometry.controlsTop + 34).toBeLessThanOrEqual(105);
  });

  it("maps fractional exact right and bottom edges to the image's final row and column", () => {
    const fractionalBase = {
      left: 10.25,
      top: 20.5,
      width: 94.5,
      height: 54.25,
    };
    const point = {
      x: fractionalBase.left + fractionalBase.width,
      y: fractionalBase.top + fractionalBase.height,
    };
    const geometry = calculateMagnifierGeometry(
      fractionalBase,
      fractionalBase,
      point,
      0,
      2,
    );

    expect(geometry.sampleX).toBe(104.75);
    expect(geometry.sampleY).toBe(74.75);
    expect(geometry.imageLeft + geometry.imageWidth).toBeCloseTo(geometry.size / 2);
    expect(geometry.imageTop + geometry.imageHeight).toBeCloseTo(geometry.size / 2);
    expectLensCentered(geometry, point, fractionalBase);
  });
});

describe("shared circular magnifier mounting", () => {
  it("uses the same geometry with the original source and hides on right-button release", () => {
    const dom = new JSDOM('<div id="host"><img id="base" src="/thumbnail.jpg"></div>');
    const document = dom.window.document;
    const host = document.querySelector("#host");
    const image = document.querySelector("#base");
    const imageRect = { left: 100, top: 50, width: 400, height: 200 };
    const hostRect = { left: 80, top: 20, width: 440, height: 260 };
    host.getBoundingClientRect = vi.fn(() => hostRect);
    image.getBoundingClientRect = vi.fn(() => imageRect);
    host.setPointerCapture = vi.fn();

    mountMagnifier(host, image, {
      rotation: 90,
      source: "/original.jpg",
      windowTarget: dom.window,
    });
    expect(host.querySelectorAll(".shared-magnifier")).toHaveLength(1);
    expect(mountMagnifier(host, image, { windowTarget: dom.window })).toBeNull();

    const down = pointerEvent(dom.window, "pointerdown", {
      button: 2,
      clientX: 500,
      clientY: 250,
      pointerId: 7,
    });
    image.dispatchEvent(down);
    const lens = host.querySelector(".shared-magnifier");
    const lensImage = lens.querySelector("img");
    const controls = host.querySelector(".shared-magnifier-controls");
    expect(down.defaultPrevented).toBe(true);
    expect(lens.style.left).toBe("320px");
    expect(lens.style.top).toBe("130px");
    expect(lensImage.getAttribute("src")).toBe("/original.jpg");
    expect(lensImage.style.transform).toBe("rotate(90deg)");
    expect(lens.classList.contains("hidden")).toBe(false);
    expect(controls.classList.contains("hidden")).toBe(false);

    host.dispatchEvent(new dom.window.WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: -1,
    }));
    expect(lens.querySelector("strong").textContent).toBe("2.5×");

    host.dispatchEvent(pointerEvent(dom.window, "pointerup", {
      button: 2,
      clientX: 500,
      clientY: 250,
      pointerId: 7,
    }));
    expect(lens.classList.contains("hidden")).toBe(true);
    expect(controls.classList.contains("hidden")).toBe(true);
  });

  it("activates at inclusive fractional right and bottom image bounds", () => {
    const dom = new JSDOM('<div id="fractional-host"><img id="fractional-base"></div>');
    const document = dom.window.document;
    const host = document.querySelector("#fractional-host");
    const image = document.querySelector("#fractional-base");
    const imageRect = { left: 10.25, top: 20.5, width: 94.5, height: 54.25 };
    host.getBoundingClientRect = vi.fn(() => imageRect);
    image.getBoundingClientRect = vi.fn(() => imageRect);
    host.setPointerCapture = vi.fn();
    mountMagnifier(host, image, { windowTarget: dom.window });

    const down = pointerEvent(dom.window, "pointerdown", {
      button: 2,
      clientX: 104.75,
      clientY: 74.75,
      pointerId: 9,
    });
    image.dispatchEvent(down);

    expect(down.defaultPrevented).toBe(true);
    expect(host.querySelector(".shared-magnifier").classList.contains("hidden")).toBe(false);
  });
});
