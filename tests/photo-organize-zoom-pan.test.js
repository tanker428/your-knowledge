import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { updateObservation } from "../src/domain/observation.js";
import {
  applyMagnifierGeometry,
  bindMagnifierInteractions,
  calculateMagnifierGeometry,
} from "../src/ui/organize-magnifier.js";
import { bindObservationAddButton, renderObservationCandidateStep } from "../src/ui/organize-view.js";

/** @param {any} window @param {string} type @param {MouseEventInit & {pointerId?:number,pointerType?:string}} [options] */
function pointerEvent(window, type, options = {}) {
  const { pointerId = 1, pointerType = "mouse", ...init } = options;
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, ...init });
  Object.defineProperties(event, {
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  return event;
}

afterEach(() => vi.useRealTimers());

describe("Photo organize zoom and pan UI", () => {
  it("exposes accessible lens, region, and rotation controls with effective clipping styles", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const lens = document.querySelector("#imageMagnifierLens");
    const lensImage = document.querySelector("#imageMagnifierLensImage");
    const overlay = document.querySelector("#observationOverlay");
    expect(document.querySelector("#organizeImageStage")?.contains(overlay)).toBe(true);
    expect(document.querySelector("#imageMagnifierInButton")?.getAttribute("aria-label")).toBe("虫眼鏡を拡大");
    expect(document.querySelector("#imageMagnifierOutButton")?.getAttribute("aria-label")).toBe("虫眼鏡を縮小");
    expect(document.querySelectorAll('#newObservationRegion input[type="radio"]')).toHaveLength(2);
    expect(document.querySelector("#rotateOrganizePhotoButton")).not.toBeNull();
    expect(document.querySelector("#rotateModalPhotoButton")).not.toBeNull();
    expect(dom.window.getComputedStyle(lens).borderRadius).toBe("50%");
    expect(dom.window.getComputedStyle(lens).pointerEvents).toBe("none");
    expect(dom.window.getComputedStyle(lens).zIndex).toBe("8");
    expect(dom.window.getComputedStyle(lensImage).imageRendering).toBe("auto");
    expect(dom.window.getComputedStyle(overlay).zIndex).toBe("3");
  });

  it("leaves every lens ancestor unclipped except the viewport-sized relation scroller", async () => {
    const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
    const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
    const dom = new JSDOM(html);
    const document = dom.window.document;
    const inlineCss = [...document.querySelectorAll("style")]
      .map((element) => element.textContent)
      .join("\n");
    const style = document.createElement("style");
    style.textContent = `${css}\n${inlineCss}`;
    document.head.append(style);
    const clippingAncestors = (host) => {
      const ancestors = [];
      for (let node = host; node && node !== document.documentElement; node = node.parentElement) {
        const computed = dom.window.getComputedStyle(node);
        const overflow = `${computed.overflow} ${computed.overflowX} ${computed.overflowY}`;
        if (/\b(?:auto|hidden|scroll|clip)\b/.test(overflow)) {
          ancestors.push(node.id || node.className);
        }
      }
      return ancestors;
    };

    const organizeHost = document.querySelector("#annotatedPhoto");
    organizeHost.classList.add("magnifier-host");
    expect(clippingAncestors(organizeHost)).toEqual([]);

    const quizStage = document.querySelector("#quizStage");
    quizStage.innerHTML = `<article class="quiz-card"><div class="quiz-content">
      <div class="quiz-placement-layout">
        <div class="quiz-photo-card magnifier-host"></div>
        <div class="quiz-choice-board"><button class="quiz-choice-option magnifier-host"></button></div>
      </div></div></article>`;
    expect(clippingAncestors(quizStage.querySelector(".quiz-photo-card"))).toEqual([]);
    expect(clippingAncestors(quizStage.querySelector(".quiz-choice-option"))).toEqual([]);

    const relationModal = document.querySelector("#relationEditorModal");
    const relationCard = relationModal.querySelector(".relation-editor-card");
    document.querySelector("#relationSourceCard").innerHTML = `<button class="endpoint-card">
      <span class="endpoint-card-inner"><span class="endpoint-image magnifier-host"></span></span>
    </button>`;
    document.querySelector("#relationSourceOptions").innerHTML = `<button class="endpoint-option">
      <span class="endpoint-image magnifier-host"></span>
    </button>`;
    expect(clippingAncestors(document.querySelector("#relationSourceCard .endpoint-image")))
      .toEqual(["relationEditorModal"]);
    expect(clippingAncestors(document.querySelector("#relationSourceOptions .endpoint-image")))
      .toEqual(["relationEditorModal"]);
    expect(dom.window.getComputedStyle(relationModal).position).toBe("fixed");
    expect(dom.window.getComputedStyle(relationModal).overflow).toBe("auto");
    expect(dom.window.getComputedStyle(relationModal).alignItems).toBe("flex-start");
    expect(dom.window.getComputedStyle(relationCard).maxHeight).toBe("none");
    expect(dom.window.getComputedStyle(relationCard).overflow).toBe("visible");
    expect(dom.window.getComputedStyle(relationCard).marginBlock).toBe("auto");
  });

  it("binds right-button, wheel, overlay, cancel, blur, and long-press interactions", () => {
    vi.useFakeTimers();
    const dom = new JSDOM(`
      <div id="annotatedPhoto"><div id="observationOverlay"></div><div id="regionDrawLayer"></div>
        <div id="imageMagnifierControls"><button id="in"></button><button id="out"></button></div>
      </div>`);
    const document = dom.window.document;
    const container = document.querySelector("#annotatedPhoto");
    const overlay = document.querySelector("#observationOverlay");
    container.setPointerCapture = vi.fn();
    let blocked = false;
    const activated = vi.fn();
    const moved = vi.fn();
    const deactivated = vi.fn();
    const zoomed = vi.fn();
    const binding = bindMagnifierInteractions({
      container,
      windowTarget: dom.window,
      zoomInButton: document.querySelector("#in"),
      zoomOutButton: document.querySelector("#out"),
      getBaseRect: () => ({ left: 10, top: 20, width: 200, height: 100 }),
      isBlocked: () => blocked,
      activate: activated,
      move: moved,
      deactivate: deactivated,
      changeZoom: zoomed,
      longPressDelay: 350,
    });

    overlay.dispatchEvent(pointerEvent(dom.window, "pointerdown", { button: 0, clientX: 50, clientY: 50 }));
    expect(activated).not.toHaveBeenCalled();
    const primaryUp = pointerEvent(dom.window, "pointerup", { button: 0, clientX: 50, clientY: 50 });
    overlay.dispatchEvent(primaryUp);
    expect(primaryUp.defaultPrevented).toBe(false);
    expect(deactivated).not.toHaveBeenCalled();
    const rightDown = pointerEvent(dom.window, "pointerdown", { button: 2, clientX: 50, clientY: 50, pointerId: 7 });
    overlay.dispatchEvent(rightDown);
    expect(rightDown.defaultPrevented).toBe(true);
    expect(activated).toHaveBeenLastCalledWith({ x: 50, y: 50 }, 7);
    expect(container.setPointerCapture).toHaveBeenCalledWith(7);

    container.dispatchEvent(new dom.window.WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: -1 }));
    expect(zoomed).toHaveBeenCalledWith(1);
    overlay.dispatchEvent(pointerEvent(dom.window, "pointermove", { clientX: 60, clientY: 55, pointerId: 7 }));
    expect(moved).toHaveBeenCalledWith({ x: 60, y: 55 });
    overlay.dispatchEvent(pointerEvent(dom.window, "pointercancel", { pointerId: 7 }));
    expect(deactivated).toHaveBeenCalled();

    blocked = true;
    overlay.dispatchEvent(pointerEvent(dom.window, "pointerdown", { button: 2, clientX: 50, clientY: 50, pointerId: 8 }));
    expect(activated).toHaveBeenCalledTimes(1);
    blocked = false;
    overlay.dispatchEvent(pointerEvent(dom.window, "pointerdown", { pointerType: "touch", clientX: 70, clientY: 60, pointerId: 9 }));
    vi.advanceTimersByTime(350);
    expect(activated).toHaveBeenLastCalledWith({ x: 70, y: 60 }, 9);
    zoomed.mockClear();
    overlay.dispatchEvent(pointerEvent(dom.window, "pointerdown", { pointerType: "touch", clientX: 100, clientY: 60, pointerId: 10 }));
    overlay.dispatchEvent(pointerEvent(dom.window, "pointermove", { pointerType: "touch", clientX: 140, clientY: 60, pointerId: 10 }));
    expect(zoomed).toHaveBeenCalledWith(1);
    dom.window.dispatchEvent(new dom.window.Event("blur"));
    expect(deactivated).toHaveBeenCalledTimes(2);

    const contextMenu = new dom.window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 500, clientY: 500 });
    overlay.dispatchEvent(contextMenu);
    expect(contextMenu.defaultPrevented).toBe(true);
    binding.destroy();
  });

  it("calculates and applies an overhanging rotated lens from the highest-resolution image source", () => {
    const dom = new JSDOM(`
      <div id="lens" class="hidden"><img id="lensImage"><strong id="level"></strong></div>
      <div id="controls" class="hidden"></div>`);
    const document = dom.window.document;
    const geometry = calculateMagnifierGeometry(
      { left: 100, top: 50, width: 400, height: 200 },
      { left: 80, top: 20, width: 500, height: 300 },
      { x: 600, y: 400 },
      90,
      2,
    );
    expect(geometry).toMatchObject({
      size: 200,
      left: 420,
      top: 280,
      sampleX: 500,
      sampleY: 250,
      imageWidth: 400,
      imageHeight: 800,
      imageLeft: -500,
      imageTop: -500,
    });
    applyMagnifierGeometry({
      lens: document.querySelector("#lens"),
      image: document.querySelector("#lensImage"),
      controls: document.querySelector("#controls"),
      level: document.querySelector("#level"),
      source: "https://example.test/full-resolution.jpg",
      geometry,
      rotation: 90,
      zoom: 2,
    });
    expect(document.querySelector("#lensImage")?.getAttribute("src")).toBe("https://example.test/full-resolution.jpg");
    expect(document.querySelector("#lensImage")?.style.transform).toBe("rotate(90deg)");
    expect(document.querySelector("#lens")?.style.left).toBe("420px");
    expect(document.querySelector("#lens")?.classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#controls")?.classList.contains("hidden")).toBe(false);
    expect(document.querySelector("#level")?.textContent).toBe("2.0×");
  });

  it("renders one add route and invokes its editor callback", () => {
    const markup = renderObservationCandidateStep({
      source: "upload",
      observations: [{ id: "observation-1", label: "<骨格>", observationType: "physical", origin: "user", included: true }],
    }, { observationTypeLabels: { physical: "実体" }, activeObservationId: "observation-1" });
    const dom = new JSDOM(`<main>${markup}</main>`);
    const document = dom.window.document;
    const onAdd = vi.fn();
    expect(document.querySelectorAll("#stepAddObservation")).toHaveLength(1);
    expect(document.querySelector(".candidate-card")?.classList.contains("focused")).toBe(true);
    expect(document.querySelector(".candidate-card strong")?.textContent).toBe("<骨格>");
    expect(bindObservationAddButton(document, onAdd)).toBe(true);
    document.querySelector("#stepAddObservation")?.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    expect(onAdd).toHaveBeenCalledOnce();
  });

  it("persists a normalized region through the Observation update behavior without mutating input", () => {
    const observation = { id: "observation-1", label: "骨格", region: null, status: "confirmed" };
    const updated = updateObservation(observation, { region: { x: 10, y: 20, w: 30, h: 40 } });
    expect(updated.region).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    expect(observation.region).toBeNull();
  });
});
