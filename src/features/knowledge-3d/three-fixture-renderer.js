import { VISUALIZATION_GRAPH_FIXTURE } from "./visualization-graph-fixture.js";
import { layoutVisualizationGraph } from "./layout-engine.js";
import {
  isWebGLAvailable,
  loadThreeModule,
  THREE_MODULE_URL,
  THREE_VERSION,
} from "./three-module.js";

const NODE_COLORS = Object.freeze({
  experience: 0x3a6ea5,
  entity: 0x8a6f2a,
  concept: 0x58784d,
  landmark: 0x8a4f7d,
  cluster: 0x6b7280,
});
const NODE_Y_SCALE = 2.6;
const LABEL_Y_OFFSET = 0.55;
const LABEL_SPRITE_HEIGHT = 0.8;
const SELECTED_NODE_SCALE = 1.28;
const MAGNITUDE_LABEL_THUMBNAIL_GAP = 0.14;
const MODE_TRANSITION_MS = 520;
/** Labels draw on top of nodes and edges instead of being clipped by them. */
const LABEL_RENDER_ORDER = 900;
const MAGNITUDE_THUMBNAIL_RENDER_ORDER = 520;
const MAGNITUDE_FALLBACK_RENDER_ORDER = 510;
const MAGNITUDE_THUMBNAIL_MIN_SIZE = 0.92;
const MAGNITUDE_THUMBNAIL_MAX_SIZE = 1.72;
const CAMERA_FOV_DEGREES = 52;
const CAMERA_HOME = Object.freeze({ x: 10, y: 8, z: 14 });
const CAMERA_TARGET = Object.freeze({ x: 0, y: 1, z: 0 });
const CAMERA_ZOOM_MIN = 0.35;
const CAMERA_ZOOM_MAX = 2.6;
const CAMERA_ZOOM_STEP = 1.12;
const MAGNITUDE_FRONT_CAMERA_DIRECTION = Object.freeze({ x: 0, y: 0, z: 1 });
const MAGNITUDE_FIT_MARGIN = 1.18;
const MAGNITUDE_FIT_EXTRA_DISTANCE = 0.65;
const MAGNITUDE_FIT_BOARD_X_PADDING = 1.9;
const MAGNITUDE_FIT_BOARD_Y_PADDING = 0.95;
const MAGNITUDE_FIT_BOARD_Z_PADDING = 0.85;
const MAGNITUDE_FIT_NODE_X_PADDING = 1.45;
const MAGNITUDE_FIT_NODE_Z_PADDING = 0.9;
const MAGNITUDE_NUMBER_LINE_THICKNESS = 0.07;
const MAGNITUDE_AXIS_TICK_THICKNESS = 0.055;
const MAGNITUDE_NODE_GUIDE_THICKNESS = 0.035;
const BOARD_LAYER_Y = Object.freeze([0, 1, 2]);

/**
 * @typedef {object} Knowledge3dController
 * @property {"mounted"|"fallback"} status
 * @property {string|null} reason
 * @property {() => void} dispose
 * @property {() => void} [resetCamera]
 * @property {(options:{graph?: any, mode?: "home"|"relation"|"size"|"magnitude", selectedNodeId?: string|null, autoRotate?: boolean, magnitudeAxisKind?: "quantity"|"time", instant?: boolean}) => void} [updateLayout]
 */

/**
 * Pick one Observation to visually represent a magnitude node.
 *
 * Selection is deterministic: use the lexicographically smallest non-empty
 * `node.observationIds` value. If the node has no direct Observation trace,
 * collect Observation ids from graph nodes that share any of its `entityIds`,
 * sort those ids, and use the smallest.
 *
 * @param {{nodes?: any[]}|null|undefined} graph
 * @param {{observationIds?: unknown[], entityIds?: unknown[]}|null|undefined} node
 * @returns {string|null}
 */
export function selectMagnitudeNodeRepresentativeObservationId(graph, node) {
  const direct = sortedUniqueStrings(node?.observationIds);
  if (direct.length) return direct[0];

  const entityIds = new Set(sortedUniqueStrings(node?.entityIds));
  if (!entityIds.size || !Array.isArray(graph?.nodes)) return null;

  const derived = [];
  for (const candidate of graph.nodes) {
    if (!Array.isArray(candidate?.entityIds)) continue;
    const sharesEntity = sortedUniqueStrings(candidate.entityIds).some((id) => entityIds.has(id));
    if (sharesEntity) derived.push(...sortedUniqueStrings(candidate.observationIds));
  }
  return sortedUniqueStrings(derived)[0] || null;
}

/**
 * Compute a magnitude-only fit-to-view camera frame without depending on
 * Three.js objects. The returned camera frame uses the renderer's established
 * front-facing viewing direction, and targets the selected board's layout
 * bounds so tick labels and the number line are readable head-on.
 *
 * @param {import('./layout-engine.js').VisualizationLayout} layout
 * @param {{width?: number, height?: number}} [viewport]
 * @returns {{position:{x:number,y:number,z:number}, target:{x:number,y:number,z:number}, bounds:{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}, corners:{x:number,y:number,z:number}[], verticalFovDegrees:number, horizontalFovDegrees:number, aspect:number}|null}
 */
export function computeMagnitudeFitCameraPlacement(layout, viewport = {}) {
  if (layout?.mode !== "magnitude") return null;
  const bounds = magnitudeLayoutSceneBounds(layout);
  if (!bounds) return null;
  const width = positiveFiniteNumber(viewport.width) || 640;
  const height = positiveFiniteNumber(viewport.height) || 420;
  const aspect = width / height;
  const verticalFovRadians = degreesToRadians(CAMERA_FOV_DEGREES);
  const horizontalFovRadians = 2 * Math.atan(Math.tan(verticalFovRadians / 2) * aspect);
  const target = boxCenter(bounds);
  const cameraDirection = MAGNITUDE_FRONT_CAMERA_DIRECTION;
  const viewDirection = scaleVector(cameraDirection, -1);
  const right = normalizeVector(crossVector(viewDirection, { x: 0, y: 1, z: 0 })) || { x: 1, y: 0, z: 0 };
  const up = normalizeVector(crossVector(right, viewDirection)) || { x: 0, y: 1, z: 0 };
  const corners = boxCorners(bounds);
  let halfWidth = 0;
  let halfHeight = 0;
  let halfDepth = 0;
  for (const corner of corners) {
    const relative = subtractVector(corner, target);
    halfWidth = Math.max(halfWidth, Math.abs(dotVector(relative, right)));
    halfHeight = Math.max(halfHeight, Math.abs(dotVector(relative, up)));
    halfDepth = Math.max(halfDepth, Math.abs(dotVector(relative, viewDirection)));
  }
  halfWidth = Math.max(halfWidth, 0.5);
  halfHeight = Math.max(halfHeight, 0.5);
  const distance = Math.max(
    halfHeight / Math.tan(verticalFovRadians / 2),
    halfWidth / Math.tan(horizontalFovRadians / 2),
  ) * MAGNITUDE_FIT_MARGIN + halfDepth + MAGNITUDE_FIT_EXTRA_DISTANCE;

  return {
    position: addVector(target, scaleVector(cameraDirection, distance)),
    target,
    bounds,
    corners,
    verticalFovDegrees: CAMERA_FOV_DEGREES,
    horizontalFovDegrees: radiansToDegrees(horizontalFovRadians),
    aspect,
  };
}

/**
 * Mount the fixture 3D renderer. The Three.js module is imported only after
 * this function is called and WebGL has been confirmed available.
 *
 * @param {HTMLElement} container
 * @param {{mode?: "home"|"relation"|"size"|"magnitude", loadThree?: () => Promise<any>, runtime?: any, webglAvailable?: boolean, requestAnimationFrame?: FrameRequestCallback, cancelAnimationFrame?: (id:number) => void, graph?: any, selectedNodeId?: string|null, onNodeSelect?: (nodeId:string) => void, autoRotate?: boolean, magnitudeAxisKind?: "quantity"|"time", loadObservationThumbnail?: (observationId:string) => Promise<Blob|null>}} [options]
 * @returns {Promise<Knowledge3dController>}
 */
export async function mountKnowledge3dFixture(container, options = {}) {
  return mountKnowledge3dGraph(container, {
    graph: options.graph || VISUALIZATION_GRAPH_FIXTURE,
    ...options,
  });
}

/**
 * Mount a display-only VisualizationGraphV1 with the same lazy Three.js
 * lifecycle as the fixture preview.
 *
 * @param {HTMLElement} container
 * @param {{mode?: "home"|"relation"|"size"|"magnitude", loadThree?: () => Promise<any>, runtime?: any, webglAvailable?: boolean, requestAnimationFrame?: FrameRequestCallback, cancelAnimationFrame?: (id:number) => void, graph?: any, selectedNodeId?: string|null, onNodeSelect?: (nodeId:string) => void, autoRotate?: boolean, magnitudeAxisKind?: "quantity"|"time", loadObservationThumbnail?: (observationId:string) => Promise<Blob|null>}} [options]
 * @returns {Promise<Knowledge3dController>}
 */
export async function mountKnowledge3dGraph(container, options = {}) {
  if (!container) throw new Error("container is required");
  const runtime = options.runtime || globalThis;
  const webglAvailable = options.webglAvailable ?? isWebGLAvailable(runtime);
  if (!webglAvailable) {
    return mountFallback(container, "webgl-unavailable");
  }

  let THREE;
  try {
    THREE = await (options.loadThree || loadThreeModule)();
  } catch {
    return mountFallback(container, "three-load-failed");
  }

  const graph = options.graph || VISUALIZATION_GRAPH_FIXTURE;
  const layout = layoutVisualizationGraph(graph, {
    mode: options.mode || "home",
    magnitudeAxisKind: options.magnitudeAxisKind,
  });
  return mountThreeScene(container, THREE, graph, layout, {
    runtime,
    requestAnimationFrame: options.requestAnimationFrame,
    cancelAnimationFrame: options.cancelAnimationFrame,
    selectedNodeId: options.selectedNodeId,
    onNodeSelect: options.onNodeSelect,
    autoRotate: options.autoRotate,
    loadObservationThumbnail: options.loadObservationThumbnail,
  });
}

/**
 * @param {HTMLElement} container
 * @param {string} reason
 * @returns {Knowledge3dController}
 */
function mountFallback(container, reason) {
  container.replaceChildren();
  const fallback = container.ownerDocument.createElement("div");
  fallback.className = "knowledge-3d-fallback";
  fallback.dataset.reason = reason;
  fallback.innerHTML = [
    "<strong>3D preview is unavailable.</strong>",
    `<small>Reason: ${reason}. The 2D knowledge map remains available.</small>`,
  ].join("");
  container.append(fallback);
  return {
    status: "fallback",
    reason,
    dispose() {
      fallback.remove();
    },
  };
}

/**
 * @param {HTMLElement} container
 * @param {any} THREE
 * @param {any} graph
 * @param {import('./layout-engine.js').VisualizationLayout} layout
 * @param {{runtime:any, requestAnimationFrame?: FrameRequestCallback, cancelAnimationFrame?: (id:number) => void, selectedNodeId?: string|null, onNodeSelect?: (nodeId:string) => void, autoRotate?: boolean, loadObservationThumbnail?: (observationId:string) => Promise<Blob|null>}} options
 * @returns {Knowledge3dController}
 */
function mountThreeScene(container, THREE, graph, layout, options) {
  container.replaceChildren();
  container.dataset.threeVersion = THREE_VERSION;
  container.dataset.threeModule = THREE_MODULE_URL.href;

  const runtime = options.runtime || globalThis;
  const hostWindow = runtime.window || runtime;
  const requestFrame = options.requestAnimationFrame || hostWindow.requestAnimationFrame?.bind(hostWindow);
  const cancelFrame = options.cancelAnimationFrame || hostWindow.cancelAnimationFrame?.bind(hostWindow);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio?.(Math.min(hostWindow.devicePixelRatio || 1, 2));
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf6f4ef);

  const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEGREES, 1, 0.1, 1000);
  let cameraZoom = 1;
  /** @type {{x:number,y:number,z:number}} */
  let cameraBasePosition = { ...CAMERA_HOME };
  /** @type {{x:number,y:number,z:number}} */
  let cameraTarget = { ...CAMERA_TARGET };
  /** Place the camera along the active frame-to-target ray. Smaller zoom = closer. */
  const applyCameraZoom = () => {
    camera.position.set(
      cameraTarget.x + (cameraBasePosition.x - cameraTarget.x) * cameraZoom,
      cameraTarget.y + (cameraBasePosition.y - cameraTarget.y) * cameraZoom,
      cameraTarget.z + (cameraBasePosition.z - cameraTarget.z) * cameraZoom,
    );
    camera.lookAt(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    camera.updateProjectionMatrix?.();
  };
  /** @param {{position:{x:number,y:number,z:number}, target:{x:number,y:number,z:number}}} frame */
  const setCameraFrame = (frame) => {
    cameraBasePosition = { ...frame.position };
    cameraTarget = { ...frame.target };
    cameraZoom = 1;
    applyCameraZoom();
  };
  const applyHomeCamera = () => {
    setCameraFrame({ position: CAMERA_HOME, target: CAMERA_TARGET });
  };
  /** @param {number} factor */
  const zoomBy = (factor) => {
    if (!Number.isFinite(factor) || factor <= 0) return;
    cameraZoom = clamp(cameraZoom * factor, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
    applyCameraZoom();
  };
  const root = new THREE.Group();
  const decorationRoot = new THREE.Group();
  root.add(decorationRoot);

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(6, 12, 8);
  scene.add(keyLight);
  scene.add(root);

  const thumbnailManager = createMagnitudeThumbnailManager(THREE, runtime, options.loadObservationThumbnail);
  let currentGraph = graph;
  let currentLayout = layout;
  let currentMode = layout.mode;
  let currentSelectedNodeId = options.selectedNodeId || null;
  let autoRotateRequested = options.autoRotate === true;
  const reducedMotion = prefersReducedMotion(hostWindow);
  let currentAutoRotate = shouldAutoRotate(autoRotateRequested, currentMode, reducedMotion);
  let activeTransition = null;
  /** @param {import('./layout-engine.js').VisualizationLayout} targetLayout */
  const fitMagnitudeCamera = (targetLayout) => {
    root.rotation.y = 0;
    const fit = computeMagnitudeFitCameraPlacement(targetLayout, {
      width: Math.max(1, container.clientWidth || 640),
      height: Math.max(1, container.clientHeight || 420),
    });
    if (fit) {
      setCameraFrame(fit);
    } else {
      applyHomeCamera();
    }
  };
  const resetCamera = () => {
    root.rotation.y = 0;
    if (currentMode === "magnitude") {
      fitMagnitudeCamera(currentLayout);
    } else {
      applyHomeCamera();
    }
  };
  applyHomeCamera();
  const nodeObjectById = new Map();
  const labelObjectById = new Map();
  const edgeObjectById = new Map();
  const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of layout.nodes) {
    const graphNode = graphNodeById.get(node.id);
    const mesh = createNodeObject(THREE, container.ownerDocument, graph, graphNode, node, {
      mode: currentMode,
      selected: node.id === currentSelectedNodeId,
      thumbnailManager,
    });
    root.add(mesh);
    nodeObjectById.set(node.id, mesh);
  }
  syncSelectedLabel(THREE, container.ownerDocument, root, {
    graphNodeById,
    layoutNodesById: layoutNodeById(layout),
    labelObjectById,
    selectedNodeId: currentSelectedNodeId,
    mode: currentMode,
  });
  for (const edge of layout.edges) {
    const source = layoutNodeById(layout).get(edge.sourceId);
    const target = layoutNodeById(layout).get(edge.targetId);
    if (!source || !target) continue;
    const line = createEdgeLine(THREE, edge, source, target);
    root.add(line);
    edgeObjectById.set(edge.id, line);
  }
  refreshLayoutDecorations(THREE, container.ownerDocument, decorationRoot, layout);

  const resize = () => {
    const width = Math.max(1, container.clientWidth || 640);
    const height = Math.max(1, container.clientHeight || 420);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    if (currentMode === "magnitude") fitMagnitudeCamera(currentLayout);
  };

  let dragging = false;
  let lastX = 0;
  let pointerStart = null;
  /** Active pointers, tracked so two fingers pinch instead of rotating. */
  const activePointers = new Map();
  let pinchDistance = 0;
  const pinchSpread = () => {
    const points = [...activePointers.values()];
    if (points.length < 2) return 0;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  };
  const onWheel = (/** @type {WheelEvent} */ event) => {
    event.preventDefault?.();
    zoomBy(event.deltaY > 0 ? CAMERA_ZOOM_STEP : 1 / CAMERA_ZOOM_STEP);
  };
  const pointerDown = (/** @type {PointerEvent} */ event) => {
    activePointers.set(event.pointerId ?? 0, { x: event.clientX, y: event.clientY });
    if (activePointers.size >= 2) {
      // A second finger cancels the in-flight drag so one gesture cannot both
      // rotate and pinch at the same time.
      dragging = false;
      pointerStart = null;
      pinchDistance = pinchSpread();
      return;
    }
    dragging = true;
    lastX = event.clientX;
    pointerStart = { x: event.clientX, y: event.clientY };
  };
  const pointerMove = (/** @type {PointerEvent} */ event) => {
    if (activePointers.has(event.pointerId ?? 0)) {
      activePointers.set(event.pointerId ?? 0, { x: event.clientX, y: event.clientY });
    }
    if (activePointers.size >= 2) {
      const next = pinchSpread();
      if (pinchDistance > 0 && next > 0) zoomBy(pinchDistance / next);
      pinchDistance = next;
      return;
    }
    if (!dragging) return;
    const dx = event.clientX - lastX;
    lastX = event.clientX;
    root.rotation.y += dx * 0.006;
  };
  const pointerUp = (/** @type {PointerEvent} */ event) => {
    if (
      dragging &&
      pointerStart &&
      Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) < 6
    ) {
      selectNodeAtPointer(THREE, renderer, camera, root, event, options.onNodeSelect);
    }
    activePointers.delete(event.pointerId ?? 0);
    if (activePointers.size < 2) pinchDistance = 0;
    dragging = false;
    pointerStart = null;
  };

  const updateLayout = (updateOptions = {}) => {
    if (disposed) return;
    const nextGraph = updateOptions.graph || currentGraph;
    const nextMode = updateOptions.mode || currentMode;
    const nextSelectedNodeId = updateOptions.selectedNodeId || null;
    if ("autoRotate" in updateOptions) autoRotateRequested = updateOptions.autoRotate === true;
    currentAutoRotate = shouldAutoRotate(autoRotateRequested, nextMode, reducedMotion);
    const nextLayout = layoutVisualizationGraph(nextGraph, {
      mode: nextMode,
      magnitudeAxisKind: updateOptions.magnitudeAxisKind,
    });
    reconcileSceneObjects(THREE, container.ownerDocument, root, {
      graph: nextGraph,
      layout: nextLayout,
      nodeObjectById,
      labelObjectById,
      edgeObjectById,
      selectedNodeId: nextSelectedNodeId,
      thumbnailManager,
    });
    const instant = updateOptions.instant === true;
    const animate = !instant && (nextMode !== currentMode || !sameLayoutPositions(currentLayout, nextLayout));
    const shouldFitMagnitude = nextMode === "magnitude" && (currentMode !== "magnitude" || animate);
    const shouldRestoreHomeCamera = currentMode === "magnitude" && nextMode !== "magnitude";
    if (animate) {
      activeTransition = buildLayoutTransition(currentLayout, nextLayout, {
        nodeObjectById,
        labelObjectById,
        startedAt: animationNow(hostWindow),
        duration: MODE_TRANSITION_MS,
      });
    } else if (instant || !activeTransition) {
      if (instant) activeTransition = null;
      applyLayoutPositions(nextLayout, { nodeObjectById, labelObjectById });
    }
    currentGraph = nextGraph;
    currentLayout = nextLayout;
    currentMode = nextMode;
    currentSelectedNodeId = nextSelectedNodeId;
    updateSelection(nodeObjectById, currentSelectedNodeId);
    updateEdgeGeometry(THREE, currentLayout, edgeObjectById, nodeObjectById);
    refreshLayoutDecorations(THREE, container.ownerDocument, decorationRoot, currentLayout);
    if (shouldFitMagnitude) {
      fitMagnitudeCamera(currentLayout);
    } else if (shouldRestoreHomeCamera) {
      applyHomeCamera();
    }
  };

  container.addEventListener("pointerdown", pointerDown);
  container.addEventListener("pointermove", pointerMove);
  container.addEventListener("pointerup", pointerUp);
  container.addEventListener("pointerleave", pointerUp);
  container.addEventListener("pointercancel", pointerUp);
  container.addEventListener("wheel", onWheel, { passive: false });
  hostWindow.addEventListener?.("resize", resize);

  let frameId = 0;
  let disposed = false;
  const render = () => {
    if (disposed) return;
    if (activeTransition) {
      activeTransition = applyLayoutTransition(activeTransition, animationNow(hostWindow));
      updateEdgeGeometry(THREE, currentLayout, edgeObjectById, nodeObjectById);
    }
    if (!dragging && currentAutoRotate) root.rotation.y += 0.0015;
    renderer.render(scene, camera);
    if (requestFrame) frameId = requestFrame(render);
  };

  resize();
  render();

  return {
    status: "mounted",
    reason: null,
    resetCamera,
    updateLayout,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (frameId && cancelFrame) cancelFrame(frameId);
      thumbnailManager.dispose();
      hostWindow.removeEventListener?.("resize", resize);
      container.removeEventListener("pointerdown", pointerDown);
      container.removeEventListener("pointermove", pointerMove);
      container.removeEventListener("pointerup", pointerUp);
      container.removeEventListener("pointerleave", pointerUp);
      container.removeEventListener("pointercancel", pointerUp);
      container.removeEventListener("wheel", onWheel);
      activePointers.clear();
      disposeObject(root);
      renderer.renderLists?.dispose?.();
      renderer.forceContextLoss?.();
      renderer.dispose?.();
      renderer.domElement?.remove?.();
      container.replaceChildren();
    },
  };
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} graph
 * @param {any} graphNode
 * @param {import('./layout-engine.js').LayoutNode} node
 * @param {{mode:"home"|"relation"|"size"|"magnitude", selected:boolean, thumbnailManager:ReturnType<typeof createMagnitudeThumbnailManager>}} options
 */
function createNodeObject(THREE, document, graph, graphNode, node, options) {
  if (options.mode === "magnitude") {
    return createMagnitudeNodeObject(THREE, document, graph, graphNode, node, options);
  }
  const mesh = createNodeMesh(THREE, graphNode, node, options.selected);
  mesh.userData = {
    ...mesh.userData,
    renderMode: "standard",
    renderKey: nodeRenderKey(graph, graphNode, node, options.mode),
  };
  return mesh;
}

/**
 * @param {any} THREE
 * @param {any} graphNode
 * @param {import('./layout-engine.js').LayoutNode} node
 * @param {boolean} selected
 */
function createNodeMesh(THREE, graphNode, node, selected) {
  const geometry = new THREE.SphereGeometry(node.radius, 20, 14);
  const material = new THREE.MeshStandardMaterial({
    color: NODE_COLORS[graphNode?.kind] || 0x555555,
    emissive: selected ? 0xe86f36 : 0x000000,
    emissiveIntensity: selected ? 0.38 : 0,
    roughness: 0.72,
    metalness: 0.08,
    transparent: node.mappingStatus === "unresolved",
    opacity: node.mappingStatus === "unresolved" ? 0.48 : 1,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(node.x, node.y * NODE_Y_SCALE, node.z);
  if (selected) mesh.scale?.set?.(SELECTED_NODE_SCALE, SELECTED_NODE_SCALE, SELECTED_NODE_SCALE);
  mesh.userData = { nodeId: node.id };
  return mesh;
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} graph
 * @param {any} graphNode
 * @param {import('./layout-engine.js').LayoutNode} node
 * @param {{selected:boolean, thumbnailManager:ReturnType<typeof createMagnitudeThumbnailManager>}} options
 */
function createMagnitudeNodeObject(THREE, document, graph, graphNode, node, options) {
  const group = new THREE.Group();
  const representativeObservationId = selectMagnitudeNodeRepresentativeObservationId(graph, graphNode);
  group.position.set(node.x, node.y * NODE_Y_SCALE, node.z);
  if (options.selected) group.scale?.set?.(SELECTED_NODE_SCALE, SELECTED_NODE_SCALE, SELECTED_NODE_SCALE);
  group.userData = {
    nodeId: node.id,
    renderMode: "magnitude-thumbnail",
    renderKey: nodeRenderKey(graph, graphNode, node, "magnitude"),
    thumbnailObservationId: representativeObservationId,
  };

  const fallback = createMagnitudeFallbackNode(THREE, document, graphNode, node);
  if (fallback) group.add(fallback);

  if (representativeObservationId) {
    options.thumbnailManager.request({
      nodeObject: group,
      layoutNode: node,
      observationId: representativeObservationId,
    });
  }
  return group;
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} graphNode
 * @param {import('./layout-engine.js').LayoutNode} node
 */
function createMagnitudeFallbackNode(THREE, document, graphNode, node) {
  const fallback = new THREE.Group();
  fallback.userData = { nodeId: node.id, magnitudeFallback: true };

  const markerGeometry = new THREE.SphereGeometry(Math.max(0.22, node.radius * 0.64), 16, 10);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: NODE_COLORS[graphNode?.kind] || 0x555555,
    roughness: 0.78,
    metalness: 0.04,
    transparent: true,
    opacity: node.mappingStatus === "unresolved" ? 0.48 : 0.86,
  });
  const marker = new THREE.Mesh(markerGeometry, markerMaterial);
  marker.userData = { nodeId: node.id, magnitudeFallbackMarker: true };
  fallback.add(marker);

  const label = createLabelSprite(THREE, document, graphNode?.label || node.id);
  if (label) {
    label.position.set(0, Math.max(0.55, node.radius + 0.24), 0);
    label.scale.set(2.8, 0.7, 1);
    label.renderOrder = MAGNITUDE_FALLBACK_RENDER_ORDER;
    label.userData = { nodeId: node.id, magnitudeFallbackLabel: true };
    fallback.add(label);
  }
  return fallback;
}

/** @param {import('./layout-engine.js').VisualizationLayout} layout */
function magnitudeLayoutSceneBounds(layout) {
  const points = [];
  const boards = Array.isArray(layout.metadata?.boards) ? layout.metadata.boards : [];
  for (const board of boards) {
    includeSceneBox(points, {
      x: board.xMin - MAGNITUDE_FIT_BOARD_X_PADDING,
      y: (board.yMin - MAGNITUDE_FIT_BOARD_Y_PADDING) * NODE_Y_SCALE,
      z: board.z - MAGNITUDE_FIT_BOARD_Z_PADDING,
    }, {
      x: board.xMax + MAGNITUDE_FIT_BOARD_X_PADDING,
      y: (board.yMax + MAGNITUDE_FIT_BOARD_Y_PADDING) * NODE_Y_SCALE,
      z: board.z + MAGNITUDE_FIT_BOARD_Z_PADDING,
    });
    const axisMinX = finiteNumber(board.axisMinX) ? board.axisMinX : board.xMin;
    const axisMaxX = finiteNumber(board.axisMaxX) ? board.axisMaxX : board.xMax;
    includeSceneBox(points, boardPoint(board, axisMinX, board.axisY - 0.2), boardPoint(board, axisMaxX, board.axisY + 0.25));
    for (const tick of board.ticks || []) {
      includeSceneBox(points, boardPoint(board, tick.x, board.axisY - 0.8), boardPoint(board, tick.x, board.axisY + 0.25));
    }
  }

  for (const node of layout.nodes || []) {
    const position = positionFromLayoutNode(node);
    const nodeHalfWidth = Math.max(node.radius, MAGNITUDE_FIT_NODE_X_PADDING);
    const nodeHalfHeight = Math.max(
      node.radius,
      labelYOffsetForMode("magnitude", node) + (LABEL_SPRITE_HEIGHT / 2),
    );
    includeSceneBox(points, {
      x: position.x - nodeHalfWidth,
      y: position.y - node.radius,
      z: position.z - MAGNITUDE_FIT_NODE_Z_PADDING,
    }, {
      x: position.x + nodeHalfWidth,
      y: position.y + nodeHalfHeight,
      z: position.z + MAGNITUDE_FIT_NODE_Z_PADDING,
    });
  }

  return boundsFromPoints(points);
}

/** @param {import('./layout-engine.js').VisualizationLayout} layout */
function layoutNodeById(layout) {
  return new Map(layout.nodes.map((node) => [node.id, node]));
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} root
 * @param {{graph:any, layout:import('./layout-engine.js').VisualizationLayout, nodeObjectById:Map<string, any>, labelObjectById:Map<string, any>, edgeObjectById:Map<string, any>, selectedNodeId:string|null, thumbnailManager:ReturnType<typeof createMagnitudeThumbnailManager>}} options
 */
function reconcileSceneObjects(THREE, document, root, options) {
  const graphNodeById = new Map(options.graph.nodes.map((node) => [node.id, node]));
  const layoutNodesById = layoutNodeById(options.layout);
  const layoutEdgeIds = new Set(options.layout.edges.map((edge) => edge.id));

  for (const [id, mesh] of [...options.nodeObjectById.entries()]) {
    const layoutNode = layoutNodesById.get(id);
    const graphNode = graphNodeById.get(id);
    if (
      layoutNode &&
      mesh.userData?.renderKey === nodeRenderKey(options.graph, graphNode, layoutNode, options.layout.mode)
    ) {
      continue;
    }
    root.remove?.(mesh);
    disposeObject(mesh);
    options.nodeObjectById.delete(id);
    const label = options.labelObjectById.get(id);
    if (label) {
      root.remove?.(label);
      disposeObject(label);
      options.labelObjectById.delete(id);
    }
  }

  for (const node of options.layout.nodes) {
    if (!options.nodeObjectById.has(node.id)) {
      const graphNode = graphNodeById.get(node.id);
      const mesh = createNodeObject(THREE, document, options.graph, graphNode, node, {
        mode: options.layout.mode,
        selected: node.id === options.selectedNodeId,
        thumbnailManager: options.thumbnailManager,
      });
      root.add(mesh);
      options.nodeObjectById.set(node.id, mesh);
    }
  }
  syncSelectedLabel(THREE, document, root, {
    graphNodeById,
    layoutNodesById,
    labelObjectById: options.labelObjectById,
    selectedNodeId: options.selectedNodeId,
    mode: options.layout.mode,
  });

  for (const [id, line] of [...options.edgeObjectById.entries()]) {
    if (layoutEdgeIds.has(id)) continue;
    root.remove?.(line);
    disposeObject(line);
    options.edgeObjectById.delete(id);
  }

  for (const edge of options.layout.edges) {
    if (options.edgeObjectById.has(edge.id)) continue;
    const source = layoutNodesById.get(edge.sourceId);
    const target = layoutNodesById.get(edge.targetId);
    if (!source || !target) continue;
    const line = createEdgeLine(THREE, edge, source, target);
    root.add(line);
    options.edgeObjectById.set(edge.id, line);
  }
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} root
 * @param {{graphNodeById:Map<string, any>, layoutNodesById:Map<string, import('./layout-engine.js').LayoutNode>, labelObjectById:Map<string, any>, selectedNodeId:string|null, mode:"home"|"relation"|"size"|"magnitude"}} options
 */
function syncSelectedLabel(THREE, document, root, options) {
  for (const [id, label] of [...options.labelObjectById.entries()]) {
    if (id === options.selectedNodeId && options.layoutNodesById.has(id)) continue;
    root.remove?.(label);
    disposeObject(label);
    options.labelObjectById.delete(id);
  }

  if (!options.selectedNodeId || options.labelObjectById.has(options.selectedNodeId)) return;
  const layoutNode = options.layoutNodesById.get(options.selectedNodeId);
  if (!layoutNode) return;
  const graphNode = options.graphNodeById.get(options.selectedNodeId);
  const label = createLabelSprite(THREE, document, graphNode?.label || options.selectedNodeId);
  if (!label) return;
  label.position.set(layoutNode.x, layoutNode.y * NODE_Y_SCALE + labelYOffsetForMode(options.mode, layoutNode), layoutNode.z);
  root.add(label);
  options.labelObjectById.set(options.selectedNodeId, label);
}

/**
 * @param {import('./layout-engine.js').VisualizationLayout} currentLayout
 * @param {import('./layout-engine.js').VisualizationLayout} nextLayout
 * @param {{nodeObjectById:Map<string, any>, labelObjectById:Map<string, any>, startedAt:number, duration:number}} options
 */
function buildLayoutTransition(currentLayout, nextLayout, options) {
  const currentById = layoutNodeById(currentLayout);
  const nodes = new Map();
  for (const node of nextLayout.nodes) {
    const mesh = options.nodeObjectById.get(node.id);
    if (!mesh) continue;
    const previous = currentById.get(node.id) || node;
    const from = readPosition(mesh, positionFromLayoutNode(previous));
    const to = positionFromLayoutNode(node);
    const label = options.labelObjectById.get(node.id);
    const labelFrom = label ? readPosition(label, labelPosition(previous, currentLayout.mode)) : null;
    const labelTo = label ? labelPosition(node, nextLayout.mode) : null;
    nodes.set(node.id, { mesh, label, from, to, labelFrom, labelTo });
  }
  return {
    startedAt: options.startedAt,
    duration: options.duration,
    nodes,
  };
}

/**
 * @param {{startedAt:number, duration:number, nodes:Map<string, any>}} transition
 * @param {number} now
 */
function applyLayoutTransition(transition, now) {
  const progress = Math.min(1, Math.max(0, (now - transition.startedAt) / transition.duration));
  const eased = easeInOutCubic(progress);
  for (const item of transition.nodes.values()) {
    setObjectPosition(item.mesh, lerpPosition(item.from, item.to, eased));
    if (item.label && item.labelFrom && item.labelTo) {
      setObjectPosition(item.label, lerpPosition(item.labelFrom, item.labelTo, eased));
    }
  }
  return progress >= 1 ? null : transition;
}

/** @param {import('./layout-engine.js').VisualizationLayout} layout @param {{nodeObjectById:Map<string, any>, labelObjectById:Map<string, any>}} options */
function applyLayoutPositions(layout, options) {
  for (const node of layout.nodes) {
    setObjectPosition(options.nodeObjectById.get(node.id), positionFromLayoutNode(node));
    setObjectPosition(options.labelObjectById.get(node.id), labelPosition(node, layout.mode));
  }
}

/** @param {import('./layout-engine.js').VisualizationLayout} left @param {import('./layout-engine.js').VisualizationLayout} right */
function sameLayoutPositions(left, right) {
  if (left.mode !== right.mode || left.nodes.length !== right.nodes.length) return false;
  const leftById = layoutNodeById(left);
  return right.nodes.every((node) => {
    const previous = leftById.get(node.id);
    return previous
      && previous.x === node.x
      && previous.y === node.y
      && previous.z === node.z;
  });
}

/** @param {Map<string, any>} nodeObjectById @param {string|null} selectedNodeId */
function updateSelection(nodeObjectById, selectedNodeId) {
  for (const [id, mesh] of nodeObjectById.entries()) {
    const selected = id === selectedNodeId;
    if (mesh.material) {
      mesh.material.emissive?.setHex?.(selected ? 0xe86f36 : 0x000000);
      if (typeof mesh.material.emissive === "number") mesh.material.emissive = selected ? 0xe86f36 : 0x000000;
      mesh.material.emissiveIntensity = selected ? 0.38 : 0;
    }
    mesh.scale?.set?.(
      selected ? SELECTED_NODE_SCALE : 1,
      selected ? SELECTED_NODE_SCALE : 1,
      selected ? SELECTED_NODE_SCALE : 1,
    );
  }
}

/**
 * @param {any} graph
 * @param {any} graphNode
 * @param {import('./layout-engine.js').LayoutNode} layoutNode
 * @param {"home"|"relation"|"size"|"magnitude"} mode
 */
function nodeRenderKey(graph, graphNode, layoutNode, mode) {
  if (mode !== "magnitude") return "standard";
  return [
    "magnitude-thumbnail",
    layoutNode.id,
    graphNode?.label || layoutNode.id,
    selectMagnitudeNodeRepresentativeObservationId(graph, graphNode) || "",
  ].join("|");
}

/**
 * @param {any} THREE
 * @param {import('./layout-engine.js').VisualizationLayout} layout
 * @param {Map<string, any>} edgeObjectById
 * @param {Map<string, any>} nodeObjectById
 */
function updateEdgeGeometry(THREE, layout, edgeObjectById, nodeObjectById) {
  for (const edge of layout.edges) {
    const line = edgeObjectById.get(edge.id);
    const source = nodeObjectById.get(edge.sourceId);
    const target = nodeObjectById.get(edge.targetId);
    if (!line || !source || !target) continue;
    const sourcePosition = readPosition(source, { x: 0, y: 0, z: 0 });
    const targetPosition = readPosition(target, { x: 0, y: 0, z: 0 });
    line.geometry?.setFromPoints?.([
      new THREE.Vector3(sourcePosition.x, sourcePosition.y, sourcePosition.z),
      new THREE.Vector3(targetPosition.x, targetPosition.y, targetPosition.z),
    ]);
  }
}

/** @param {import('./layout-engine.js').LayoutNode} node */
function positionFromLayoutNode(node) {
  return { x: node.x, y: node.y * NODE_Y_SCALE, z: node.z };
}

/**
 * @param {"home"|"relation"|"size"|"magnitude"} mode
 * @param {import('./layout-engine.js').LayoutNode} node
 */
function labelYOffsetForMode(mode, node) {
  if (mode !== "magnitude") return LABEL_Y_OFFSET;
  const thumbnailHeight = clamp(node.radius * 2.35, MAGNITUDE_THUMBNAIL_MIN_SIZE, MAGNITUDE_THUMBNAIL_MAX_SIZE)
    * SELECTED_NODE_SCALE;
  return (thumbnailHeight / 2) + (LABEL_SPRITE_HEIGHT / 2) + MAGNITUDE_LABEL_THUMBNAIL_GAP;
}

/**
 * @param {import('./layout-engine.js').LayoutNode} node
 * @param {"home"|"relation"|"size"|"magnitude"} mode
 */
function labelPosition(node, mode) {
  return { x: node.x, y: node.y * NODE_Y_SCALE + labelYOffsetForMode(mode, node), z: node.z };
}

/**
 * @param {{x:number,y:number,z:number}[]} points
 * @param {{x:number,y:number,z:number}} min
 * @param {{x:number,y:number,z:number}} max
 */
function includeSceneBox(points, min, max) {
  points.push(min, max);
}

/** @param {{x:number,y:number,z:number}[]} points */
function boundsFromPoints(points) {
  if (!points.length) return null;
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const point of points) {
    if (!finiteNumber(point.x) || !finiteNumber(point.y) || !finiteNumber(point.z)) continue;
    min.x = Math.min(min.x, point.x);
    min.y = Math.min(min.y, point.y);
    min.z = Math.min(min.z, point.z);
    max.x = Math.max(max.x, point.x);
    max.y = Math.max(max.y, point.y);
    max.z = Math.max(max.z, point.z);
  }
  if (!Number.isFinite(min.x + min.y + min.z + max.x + max.y + max.z)) return null;
  return { min, max };
}

/** @param {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} box */
function boxCenter(box) {
  return {
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    z: (box.min.z + box.max.z) / 2,
  };
}

/** @param {{min:{x:number,y:number,z:number}, max:{x:number,y:number,z:number}}} box */
function boxCorners(box) {
  return [
    { x: box.min.x, y: box.min.y, z: box.min.z },
    { x: box.min.x, y: box.min.y, z: box.max.z },
    { x: box.min.x, y: box.max.y, z: box.min.z },
    { x: box.min.x, y: box.max.y, z: box.max.z },
    { x: box.max.x, y: box.min.y, z: box.min.z },
    { x: box.max.x, y: box.min.y, z: box.max.z },
    { x: box.max.x, y: box.max.y, z: box.min.z },
    { x: box.max.x, y: box.max.y, z: box.max.z },
  ];
}

/** @param {{x:number,y:number,z:number}} left @param {{x:number,y:number,z:number}} right */
function addVector(left, right) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

/** @param {{x:number,y:number,z:number}} left @param {{x:number,y:number,z:number}} right */
function subtractVector(left, right) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

/** @param {{x:number,y:number,z:number}} vector @param {number} amount */
function scaleVector(vector, amount) {
  return { x: vector.x * amount, y: vector.y * amount, z: vector.z * amount };
}

/** @param {{x:number,y:number,z:number}} left @param {{x:number,y:number,z:number}} right */
function dotVector(left, right) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

/** @param {{x:number,y:number,z:number}} left @param {{x:number,y:number,z:number}} right */
function crossVector(left, right) {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

/** @param {{x:number,y:number,z:number}} vector */
function normalizeVector(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  return length > 0 ? scaleVector(vector, 1 / length) : null;
}

/** @param {number} value */
function degreesToRadians(value) {
  return value * Math.PI / 180;
}

/** @param {number} value */
function radiansToDegrees(value) {
  return value * 180 / Math.PI;
}

/** @param {any} object @param {{x:number, y:number, z:number}} fallback */
function readPosition(object, fallback) {
  return {
    x: finiteNumber(object?.position?.x) ? object.position.x : fallback.x,
    y: finiteNumber(object?.position?.y) ? object.position.y : fallback.y,
    z: finiteNumber(object?.position?.z) ? object.position.z : fallback.z,
  };
}

/** @param {any} object @param {{x:number, y:number, z:number}} position */
function setObjectPosition(object, position) {
  object?.position?.set?.(position.x, position.y, position.z);
}

/** @param {{x:number, y:number, z:number}} from @param {{x:number, y:number, z:number}} to @param {number} amount */
function lerpPosition(from, to, amount) {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount,
    z: from.z + (to.z - from.z) * amount,
  };
}

/** @param {number} value */
function easeInOutCubic(value) {
  return value < 0.5 ? 4 * value * value * value : 1 - ((-2 * value + 2) ** 3) / 2;
}

/** @param {any} hostWindow */
function animationNow(hostWindow) {
  return hostWindow.performance?.now?.() ?? Date.now();
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * @param {boolean} requested
 * @param {"home"|"relation"|"size"|"magnitude"} mode
 * @param {boolean} reducedMotion
 */
function shouldAutoRotate(requested, mode, reducedMotion) {
  return requested && mode !== "size" && mode !== "magnitude" && !reducedMotion;
}

/** @param {any} hostWindow */
function prefersReducedMotion(hostWindow) {
  try {
    return hostWindow.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  } catch {
    return false;
  }
}

/** @param {unknown} value */
function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

/** @param {unknown} value */
function positiveFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * @param {any} THREE
 * @param {any} renderer
 * @param {any} camera
 * @param {any} root
 * @param {PointerEvent} event
 * @param {((nodeId:string) => void)|undefined} onNodeSelect
 */
function selectNodeAtPointer(THREE, renderer, camera, root, event, onNodeSelect) {
  if (!onNodeSelect || !THREE.Raycaster || !THREE.Vector2 || !renderer.domElement?.getBoundingClientRect) return;
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(root.children, true);
  for (const hit of hits) {
    let object = hit.object;
    while (object) {
      if (object.userData?.nodeId) {
        onNodeSelect(object.userData.nodeId);
        return;
      }
      object = object.parent;
    }
  }
}

/**
 * @param {any} THREE
 * @param {import('./layout-engine.js').LayoutEdge} edge
 * @param {import('./layout-engine.js').LayoutNode} source
 * @param {import('./layout-engine.js').LayoutNode} target
 */
function createEdgeLine(THREE, edge, source, target) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(source.x, source.y * NODE_Y_SCALE, source.z),
    new THREE.Vector3(target.x, target.y * NODE_Y_SCALE, target.z),
  ]);
  // WebGL ignores LineBasicMaterial.linewidth on virtually every platform, so
  // contrast is the only lever available for making edges easier to read.
  const material = new THREE.LineBasicMaterial({
    color: edge.derived ? 0x6b7480 : 0x1b231d,
    transparent: true,
    opacity: Math.min(1, edge.opacity + 0.12),
  });
  const line = new THREE.Line(geometry, material);
  line.userData = { edgeId: edge.id, sourceId: edge.sourceId, targetId: edge.targetId };
  return line;
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} decorationRoot
 * @param {import('./layout-engine.js').VisualizationLayout} layout
 */
function refreshLayoutDecorations(THREE, document, decorationRoot, layout) {
  clearGroup(decorationRoot);
  const boards = Array.isArray(layout.metadata?.boards) ? layout.metadata.boards : [];
  for (const board of boards) {
    renderMagnitudeBoard(THREE, document, decorationRoot, layout, board);
  }
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} decorationRoot
 * @param {import('./layout-engine.js').VisualizationLayout} layout
 * @param {import('./layout-engine.js').LayoutBoard} board
 */
function renderMagnitudeBoard(THREE, document, decorationRoot, layout, board) {
  const color = board.axisKind === "quantity" ? 0x58784d : 0x8a4f7d;
  const lineColor = 0x2f3a32;
  const frameColor = 0xbdb7ac;
  const axisMinX = finiteNumber(board.axisMinX) ? board.axisMinX : board.xMin;
  const axisMaxX = finiteNumber(board.axisMaxX) ? board.axisMaxX : board.xMax;
  const boardId = board.id || "magnitude-board";

  decorationRoot.add(createDecorationLine(THREE, [
    boardPoint(board, board.xMin, board.yMin),
    boardPoint(board, board.xMax, board.yMin),
    boardPoint(board, board.xMax, board.yMax),
    boardPoint(board, board.xMin, board.yMax),
    boardPoint(board, board.xMin, board.yMin),
  ], frameColor, 0.7, { decorationKind: "board-frame", boardId }));

  for (const y of BOARD_LAYER_Y) {
    if (y <= board.yMin || y >= board.yMax) continue;
    decorationRoot.add(createDecorationLine(THREE, [
      boardPoint(board, board.xMin, y),
      boardPoint(board, board.xMax, y),
    ], frameColor, 0.24, { decorationKind: "board-layer", boardId }));
  }

  decorationRoot.add(createDecorationLine(THREE, [
    boardPoint(board, axisMinX, board.axisY),
    boardPoint(board, axisMaxX, board.axisY),
  ], color, 0.86, { decorationKind: "number-line", boardId }, {
    thickness: MAGNITUDE_NUMBER_LINE_THICKNESS,
  }));

  for (const tick of board.ticks || []) {
    const opacity = tick.major ? 0.76 : 0.48;
    decorationRoot.add(createDecorationLine(THREE, [
      boardPoint(board, tick.x, board.axisY - 0.16),
      boardPoint(board, tick.x, board.axisY + (tick.major ? 0.28 : 0.22)),
    ], lineColor, opacity, { decorationKind: "axis-tick", boardId }, {
      thickness: tick.major ? MAGNITUDE_AXIS_TICK_THICKNESS : MAGNITUDE_AXIS_TICK_THICKNESS * 0.78,
    }));
    if (tick.major) {
      decorationRoot.add(createDecorationLine(THREE, [
        boardPoint(board, tick.x, board.axisY),
        boardPoint(board, tick.x, board.yMax),
      ], lineColor, 0.13, { decorationKind: "axis-major-guide", boardId }));
    }
    addDecorationLabel(THREE, document, decorationRoot, tick.label, boardPoint(board, tick.x, board.axisY - 0.36));
  }

  for (const node of layout.nodes) {
    if (node.boardId !== board.id || node.zone !== "scaled") continue;
    decorationRoot.add(createDecorationLine(THREE, [
      boardPoint(board, node.x, board.axisY),
      boardPoint(board, node.x, node.y),
    ], color, 0.42, { decorationKind: "node-guide", boardId, nodeId: node.id }, {
      thickness: MAGNITUDE_NODE_GUIDE_THICKNESS,
    }));
  }

  if (finiteNumber(board.unsetAreaX)) {
    const unsetBoundaryX = board.unsetAreaX - 1.2;
    decorationRoot.add(createDecorationLine(THREE, [
      boardPoint(board, unsetBoundaryX, board.yMin),
      boardPoint(board, unsetBoundaryX, board.yMax),
    ], 0x8a6f2a, 0.45, { decorationKind: "unset-boundary", boardId }));
    if (board.unsetLabel) {
      addDecorationLabel(THREE, document, decorationRoot, board.unsetLabel, boardPoint(board, board.unsetAreaX + 0.9, board.yMax - 0.22));
    }
  }

  addDecorationLabel(THREE, document, decorationRoot, board.axisLabel, boardPoint(board, board.xMin + 0.25, board.yMax + 0.25));
  addDecorationLabel(THREE, document, decorationRoot, `${board.normalization} ${board.unitLabel}`, boardPoint(board, axisMaxX - 0.1, board.axisY + 0.38));
}

/**
 * @param {import('./layout-engine.js').LayoutBoard} board
 * @param {number} x
 * @param {number} y
 */
function boardPoint(board, x, y) {
  return { x, y: y * NODE_Y_SCALE, z: board.z };
}

/**
 * @param {any} THREE
 * @param {{x:number,y:number,z:number}[]} points
 * @param {number} color
 * @param {number} opacity
 * @param {Record<string, any>} [userData]
 * @param {{thickness?:number}} [options]
 */
function createDecorationLine(THREE, points, color, opacity, userData = {}, options = {}) {
  const thickness = positiveFiniteNumber(options.thickness) || 0;
  const bar = thickness > 0
    ? createDecorationBar(THREE, points, color, opacity, thickness, userData)
    : null;
  if (bar) return bar;
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x, point.y, point.z)));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    linewidth: thickness ? Math.max(1, Math.round(thickness * 24)) : 1,
  });
  const line = new THREE.Line(geometry, material);
  line.userData = thickness ? { ...userData, decorationThickness: thickness } : userData;
  return line;
}

/**
 * @param {any} THREE
 * @param {{x:number,y:number,z:number}[]} points
 * @param {number} color
 * @param {number} opacity
 * @param {number} thickness
 * @param {Record<string, any>} userData
 */
function createDecorationBar(THREE, points, color, opacity, thickness, userData) {
  if (
    points.length !== 2
    || !THREE.BoxGeometry
    || !THREE.Mesh
    || !(THREE.MeshBasicMaterial || THREE.MeshStandardMaterial)
  ) {
    return null;
  }
  const [start, end] = points;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const dz = end.z - start.z;
  const length = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(length) || length <= 0) return null;
  const geometry = new THREE.BoxGeometry(length, thickness, thickness);
  const Material = THREE.MeshBasicMaterial || THREE.MeshStandardMaterial;
  const material = new Material({ color, transparent: true, opacity });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    (start.z + end.z) / 2,
  );
  mesh.rotation.z = Math.atan2(dy, dx);
  mesh.userData = { ...userData, decorationThickness: thickness };
  return mesh;
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} root
 * @param {string} text
 * @param {{x:number,y:number,z:number}} position
 */
function addDecorationLabel(THREE, document, root, text, position) {
  const label = createLabelSprite(THREE, document, text);
  if (!label) return;
  label.position.set(position.x, position.y, position.z);
  root.add(label);
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {string} label
 */
function createLabelSprite(THREE, document, label) {
  if (!THREE.CanvasTexture || !THREE.SpriteMaterial || !THREE.Sprite) return null;
  const canvas = document.createElement("canvas");
  // Drawn at 2x the previous resolution so the label stays sharp instead of
  // being stretched into thin, blurry strokes.
  canvas.width = 512;
  canvas.height = 128;
  let context;
  try {
    context = canvas.getContext("2d");
  } catch {
    context = null;
  }
  if (!context) return null;
  context.fillStyle = "rgba(246,244,239,0.95)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  // Four filled bars rather than strokeRect, to keep the 2d context surface
  // this function depends on as small as possible.
  context.fillStyle = "rgba(47,58,50,0.55)";
  context.fillRect(0, 0, canvas.width, 4);
  context.fillRect(0, canvas.height - 4, canvas.width, 4);
  context.fillRect(0, 0, 4, canvas.height);
  context.fillRect(canvas.width - 4, 0, 4, canvas.height);
  context.fillStyle = "#1f241f";
  context.font = "700 44px sans-serif";
  context.textBaseline = "middle";
  context.fillText(label.slice(0, 24), 20, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    // Labels stay readable even when a node or edge sits in front of them.
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.renderOrder = LABEL_RENDER_ORDER;
  sprite.scale.set(3.2, LABEL_SPRITE_HEIGHT, 1);
  return sprite;
}

/**
 * @param {any} THREE
 * @param {any} runtime
 * @param {((observationId:string) => Promise<Blob|null>)|undefined} loadObservationThumbnail
 */
function createMagnitudeThumbnailManager(THREE, runtime, loadObservationThumbnail) {
  const objectUrls = new Set();
  const pendingTextures = new Set();
  const urlApi = objectUrlApi(runtime);
  let active = true;

  /** @param {string} objectUrl */
  const revokeObjectUrl = (objectUrl) => {
    if (!objectUrls.delete(objectUrl)) return;
    try {
      urlApi?.revokeObjectURL?.(objectUrl);
    } catch {
      // Best-effort cleanup; the texture itself is still disposed below.
    }
  };

  /**
   * @param {{nodeObject:any, layoutNode:import('./layout-engine.js').LayoutNode, observationId:string}} options
   */
  const request = (options) => {
    if (typeof loadObservationThumbnail !== "function" || !THREE.TextureLoader || !urlApi?.createObjectURL) return;
    const token = Symbol(options.observationId);
    options.nodeObject.userData.thumbnailRequestToken = token;

    Promise.resolve()
      .then(() => loadObservationThumbnail(options.observationId))
      .then((blob) => {
        if (!isMagnitudeThumbnailRequestLive(active, options.nodeObject, token) || !blob) return;
        const objectUrl = urlApi.createObjectURL(blob);
        objectUrls.add(objectUrl);
        let loader;
        let pendingTexture = null;
        try {
          loader = new THREE.TextureLoader();
          pendingTexture = loader.load(
            objectUrl,
            (texture) => {
              pendingTextures.delete(texture);
              revokeObjectUrl(objectUrl);
              if (!isMagnitudeThumbnailRequestLive(active, options.nodeObject, token)) {
                texture?.dispose?.();
                return;
              }
              applyMagnitudeThumbnailTexture(THREE, options.nodeObject, options.layoutNode, texture, options.observationId);
            },
            undefined,
            () => {
              if (pendingTexture) pendingTextures.delete(pendingTexture);
              pendingTexture?.dispose?.();
              revokeObjectUrl(objectUrl);
            },
          );
          if (pendingTexture) pendingTextures.add(pendingTexture);
        } catch {
          pendingTexture?.dispose?.();
          revokeObjectUrl(objectUrl);
        }
      })
      .catch(() => {});
  };

  return {
    request,
    dispose() {
      active = false;
      for (const objectUrl of [...objectUrls]) revokeObjectUrl(objectUrl);
      for (const texture of [...pendingTextures]) texture?.dispose?.();
      pendingTextures.clear();
    },
  };
}

/**
 * @param {boolean} managerActive
 * @param {any} nodeObject
 * @param {symbol} token
 */
function isMagnitudeThumbnailRequestLive(managerActive, nodeObject, token) {
  return managerActive
    && nodeObject?.userData?.disposed !== true
    && nodeObject?.userData?.thumbnailRequestToken === token;
}

/**
 * @param {any} THREE
 * @param {any} nodeObject
 * @param {import('./layout-engine.js').LayoutNode} layoutNode
 * @param {any} texture
 * @param {string} observationId
 */
function applyMagnitudeThumbnailTexture(THREE, nodeObject, layoutNode, texture, observationId) {
  if (!THREE.SpriteMaterial || !THREE.Sprite) {
    texture?.dispose?.();
    return;
  }
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  for (const child of [...(nodeObject.children || [])]) {
    if (!child.userData?.magnitudeFallback) continue;
    nodeObject.remove?.(child);
    disposeObject(child);
  }

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const baseSize = clamp(layoutNode.radius * 2.35, MAGNITUDE_THUMBNAIL_MIN_SIZE, MAGNITUDE_THUMBNAIL_MAX_SIZE);
  const aspect = thumbnailTextureAspect(texture);
  sprite.scale.set(baseSize * aspect, baseSize, 1);
  sprite.renderOrder = MAGNITUDE_THUMBNAIL_RENDER_ORDER;
  sprite.userData = {
    nodeId: layoutNode.id,
    magnitudeThumbnail: true,
    observationId,
  };
  nodeObject.add(sprite);
}

/** @param {any} texture */
function thumbnailTextureAspect(texture) {
  const width = finiteNumber(texture?.image?.naturalWidth)
    ? texture.image.naturalWidth
    : texture?.image?.width;
  const height = finiteNumber(texture?.image?.naturalHeight)
    ? texture.image.naturalHeight
    : texture?.image?.height;
  if (!finiteNumber(width) || !finiteNumber(height) || height <= 0) return 1;
  return clamp(width / height, 0.72, 1.5);
}

/** @param {any} runtime */
function objectUrlApi(runtime) {
  return runtime?.URL || runtime?.window?.URL || globalThis.URL;
}

/** @param {any} group */
function clearGroup(group) {
  for (const child of [...(group.children || [])]) {
    group.remove?.(child);
    disposeObject(child);
  }
  if (Array.isArray(group.children)) group.children.length = 0;
}

/** @param {any} object */
function disposeObject(object) {
  markObjectDisposed(object);
  object.traverse?.((child) => {
    markObjectDisposed(child);
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material].filter(Boolean);
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && typeof value === "object" && "dispose" in value) value.dispose();
      }
      material.dispose?.();
    }
  });
}

/** @param {any} object */
function markObjectDisposed(object) {
  if (!object) return;
  object.userData = {
    ...(object.userData || {}),
    disposed: true,
  };
}

/** @param {unknown[]|undefined} values */
function sortedUniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  const strings = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) strings.push(trimmed);
  }
  return [...new Set(strings)].sort(compareStrings);
}

/** @param {string} left @param {string} right */
function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}
