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
const MODE_TRANSITION_MS = 520;
/** Labels draw on top of nodes and edges instead of being clipped by them. */
const LABEL_RENDER_ORDER = 900;
const CAMERA_HOME = Object.freeze({ x: 10, y: 8, z: 14 });
const CAMERA_TARGET = Object.freeze({ x: 0, y: 1, z: 0 });
const CAMERA_ZOOM_MIN = 0.35;
const CAMERA_ZOOM_MAX = 2.6;
const CAMERA_ZOOM_STEP = 1.12;

/**
 * @typedef {object} Knowledge3dController
 * @property {"mounted"|"fallback"} status
 * @property {string|null} reason
 * @property {() => void} dispose
 * @property {() => void} [resetCamera]
 * @property {(options:{graph?: any, mode?: "home"|"relation"|"size"|"time"|"classification", selectedNodeId?: string|null, autoRotate?: boolean}) => void} [updateLayout]
 */

/**
 * Mount the fixture 3D renderer. The Three.js module is imported only after
 * this function is called and WebGL has been confirmed available.
 *
 * @param {HTMLElement} container
 * @param {{mode?: "home"|"relation"|"size"|"time"|"classification", loadThree?: () => Promise<any>, runtime?: any, webglAvailable?: boolean, requestAnimationFrame?: FrameRequestCallback, cancelAnimationFrame?: (id:number) => void, graph?: any, selectedNodeId?: string|null, onNodeSelect?: (nodeId:string) => void, autoRotate?: boolean}} [options]
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
 * @param {{mode?: "home"|"relation"|"size"|"time"|"classification", loadThree?: () => Promise<any>, runtime?: any, webglAvailable?: boolean, requestAnimationFrame?: FrameRequestCallback, cancelAnimationFrame?: (id:number) => void, graph?: any, selectedNodeId?: string|null, onNodeSelect?: (nodeId:string) => void, autoRotate?: boolean}} [options]
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
  const layout = layoutVisualizationGraph(graph, { mode: options.mode || "home" });
  return mountThreeScene(container, THREE, graph, layout, {
    runtime,
    requestAnimationFrame: options.requestAnimationFrame,
    cancelAnimationFrame: options.cancelAnimationFrame,
    selectedNodeId: options.selectedNodeId,
    onNodeSelect: options.onNodeSelect,
    autoRotate: options.autoRotate,
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
 * @param {{runtime:any, requestAnimationFrame?: FrameRequestCallback, cancelAnimationFrame?: (id:number) => void, selectedNodeId?: string|null, onNodeSelect?: (nodeId:string) => void, autoRotate?: boolean}} options
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

  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 1000);
  let cameraZoom = 1;
  /** Place the camera along the home-to-target ray. Smaller zoom = closer. */
  const applyCameraZoom = () => {
    camera.position.set(
      CAMERA_TARGET.x + (CAMERA_HOME.x - CAMERA_TARGET.x) * cameraZoom,
      CAMERA_TARGET.y + (CAMERA_HOME.y - CAMERA_TARGET.y) * cameraZoom,
      CAMERA_TARGET.z + (CAMERA_HOME.z - CAMERA_TARGET.z) * cameraZoom,
    );
    camera.lookAt(CAMERA_TARGET.x, CAMERA_TARGET.y, CAMERA_TARGET.z);
    camera.updateProjectionMatrix?.();
  };
  /** @param {number} factor */
  const zoomBy = (factor) => {
    if (!Number.isFinite(factor) || factor <= 0) return;
    cameraZoom = clamp(cameraZoom * factor, CAMERA_ZOOM_MIN, CAMERA_ZOOM_MAX);
    applyCameraZoom();
  };
  applyCameraZoom();
  const root = new THREE.Group();
  const decorationRoot = new THREE.Group();
  root.add(decorationRoot);
  const resetCamera = () => {
    root.rotation.y = 0;
    cameraZoom = 1;
    applyCameraZoom();
  };

  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
  keyLight.position.set(6, 12, 8);
  scene.add(keyLight);
  scene.add(root);

  let currentGraph = graph;
  let currentLayout = layout;
  let currentMode = layout.mode;
  let currentSelectedNodeId = options.selectedNodeId || null;
  let autoRotateRequested = options.autoRotate === true;
  const reducedMotion = prefersReducedMotion(hostWindow);
  let currentAutoRotate = shouldAutoRotate(autoRotateRequested, currentMode, reducedMotion);
  let activeTransition = null;
  const nodeObjectById = new Map();
  const labelObjectById = new Map();
  const edgeObjectById = new Map();
  const graphNodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const node of layout.nodes) {
    const graphNode = graphNodeById.get(node.id);
    const mesh = createNodeMesh(THREE, graphNode, node, node.id === currentSelectedNodeId);
    root.add(mesh);
    nodeObjectById.set(node.id, mesh);
  }
  syncSelectedLabel(THREE, container.ownerDocument, root, {
    graphNodeById,
    layoutNodesById: layoutNodeById(layout),
    labelObjectById,
    selectedNodeId: currentSelectedNodeId,
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
    const nextLayout = layoutVisualizationGraph(nextGraph, { mode: nextMode });
    reconcileSceneObjects(THREE, container.ownerDocument, root, {
      graph: nextGraph,
      layout: nextLayout,
      nodeObjectById,
      labelObjectById,
      edgeObjectById,
      selectedNodeId: nextSelectedNodeId,
    });
    const animate = nextMode !== currentMode || !sameLayoutPositions(currentLayout, nextLayout);
    if (animate) {
      activeTransition = buildLayoutTransition(currentLayout, nextLayout, {
        nodeObjectById,
        labelObjectById,
        startedAt: animationNow(hostWindow),
        duration: MODE_TRANSITION_MS,
      });
    } else if (!activeTransition) {
      applyLayoutPositions(nextLayout, { nodeObjectById, labelObjectById });
    }
    currentGraph = nextGraph;
    currentLayout = nextLayout;
    currentMode = nextMode;
    currentSelectedNodeId = nextSelectedNodeId;
    updateSelection(nodeObjectById, currentSelectedNodeId);
    updateEdgeGeometry(THREE, currentLayout, edgeObjectById, nodeObjectById);
    refreshLayoutDecorations(THREE, container.ownerDocument, decorationRoot, currentLayout);
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
  if (selected) mesh.scale?.set?.(1.28, 1.28, 1.28);
  mesh.userData = { nodeId: node.id };
  return mesh;
}

/** @param {import('./layout-engine.js').VisualizationLayout} layout */
function layoutNodeById(layout) {
  return new Map(layout.nodes.map((node) => [node.id, node]));
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} root
 * @param {{graph:any, layout:import('./layout-engine.js').VisualizationLayout, nodeObjectById:Map<string, any>, labelObjectById:Map<string, any>, edgeObjectById:Map<string, any>, selectedNodeId:string|null}} options
 */
function reconcileSceneObjects(THREE, document, root, options) {
  const graphNodeById = new Map(options.graph.nodes.map((node) => [node.id, node]));
  const layoutNodesById = layoutNodeById(options.layout);
  const layoutEdgeIds = new Set(options.layout.edges.map((edge) => edge.id));

  for (const [id, mesh] of [...options.nodeObjectById.entries()]) {
    if (layoutNodesById.has(id)) continue;
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
      const mesh = createNodeMesh(THREE, graphNode, node, node.id === options.selectedNodeId);
      root.add(mesh);
      options.nodeObjectById.set(node.id, mesh);
    }
  }
  syncSelectedLabel(THREE, document, root, {
    graphNodeById,
    layoutNodesById,
    labelObjectById: options.labelObjectById,
    selectedNodeId: options.selectedNodeId,
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
 * @param {{graphNodeById:Map<string, any>, layoutNodesById:Map<string, import('./layout-engine.js').LayoutNode>, labelObjectById:Map<string, any>, selectedNodeId:string|null}} options
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
  label.position.set(layoutNode.x, layoutNode.y * NODE_Y_SCALE + LABEL_Y_OFFSET, layoutNode.z);
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
    const labelFrom = label ? readPosition(label, labelPosition(previous)) : null;
    const labelTo = label ? labelPosition(node) : null;
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
    setObjectPosition(options.labelObjectById.get(node.id), labelPosition(node));
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
    mesh.scale?.set?.(selected ? 1.28 : 1, selected ? 1.28 : 1, selected ? 1.28 : 1);
  }
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

/** @param {import('./layout-engine.js').LayoutNode} node */
function labelPosition(node) {
  return { x: node.x, y: node.y * NODE_Y_SCALE + LABEL_Y_OFFSET, z: node.z };
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
 * @param {"home"|"relation"|"size"|"time"|"classification"} mode
 * @param {boolean} reducedMotion
 */
function shouldAutoRotate(requested, mode, reducedMotion) {
  return requested && !["size", "time", "classification"].includes(mode) && !reducedMotion;
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
  if (layout.mode === "size") refreshSizeDecorations(THREE, document, decorationRoot, layout);
  if (layout.mode === "time") refreshTimeDecorations(THREE, document, decorationRoot, layout);
  if (layout.mode === "classification") refreshClassificationDecorations(THREE, document, decorationRoot, layout);
}

/**
 * @param {any} THREE
 * @param {Document} document
 * @param {any} decorationRoot
 * @param {import('./layout-engine.js').VisualizationLayout} layout
 */
function refreshSizeDecorations(THREE, document, decorationRoot, layout) {
  const scaledXs = layout.nodes.filter((node) => node.zone === "scaled").map((node) => node.x);
  const minX = Math.min(-6, ...scaledXs);
  const maxX = Math.max(8, ...scaledXs);
  const axisY = -0.35;
  const axisZ = -6.75;
  const unsetBoundaryX = layout.metadata.unsetAreaX - 1.2;

  decorationRoot.add(createDecorationLine(THREE, [
    { x: minX, y: axisY, z: axisZ },
    { x: maxX, y: axisY, z: axisZ },
  ], 0x58784d, 0.55));
  decorationRoot.add(createDecorationLine(THREE, [
    { x: unsetBoundaryX, y: -0.8, z: -7.4 },
    { x: unsetBoundaryX, y: 6.2, z: 7.4 },
  ], 0x8a6f2a, 0.42));

  addDecorationLabel(THREE, document, decorationRoot, layout.metadata.quantityKind || "quantity", {
    x: minX,
    y: axisY + 0.6,
    z: axisZ,
  });
  addDecorationLabel(THREE, document, decorationRoot, "unset: no body_length", {
    x: layout.metadata.unsetAreaX + 1.7,
    y: 5.9,
    z: -6.9,
  });
  for (const value of [0.1, 1, 10]) {
    const x = Math.log10(value) * 6;
    if (x < minX || x > maxX) continue;
    decorationRoot.add(createDecorationLine(THREE, [
      { x, y: axisY - 0.25, z: axisZ },
      { x, y: axisY + 0.25, z: axisZ },
    ], 0x2f3a32, 0.5));
    addDecorationLabel(THREE, document, decorationRoot, `${value} m`, {
      x,
      y: axisY - 0.65,
      z: axisZ,
    });
  }
}

/**
 * Render geological intervals as non-selectable guide lines. Their horizontal
 * extent is the same normalized geometry used by the 2D timeline quiz.
 * @param {any} THREE
 * @param {Document} document
 * @param {any} decorationRoot
 * @param {import('./layout-engine.js').VisualizationLayout} layout
 */
function refreshTimeDecorations(THREE, document, decorationRoot, layout) {
  const minX = layout.metadata.axisMinX ?? -8;
  const maxX = layout.metadata.axisMaxX ?? 8;
  const unsetBoundaryX = layout.metadata.unsetAreaX - 1.2;
  const axisY = -0.35;
  const axisZ = Math.min(-6.8, ...(layout.metadata.timeGuides || []).map((guide) => guide.z - 1.4));
  decorationRoot.add(createDecorationLine(THREE, [
    { x: minX, y: axisY, z: axisZ },
    { x: maxX, y: axisY, z: axisZ },
  ], 0x8a4f7d, 0.62));
  decorationRoot.add(createDecorationLine(THREE, [
    { x: unsetBoundaryX, y: -0.8, z: axisZ - 0.6 },
    { x: unsetBoundaryX, y: 6.2, z: Math.max(7.4, -axisZ) },
  ], 0x8a6f2a, 0.42));
  addDecorationLabel(THREE, document, decorationRoot, "古い", { x: minX, y: axisY + 0.6, z: axisZ });
  addDecorationLabel(THREE, document, decorationRoot, "新しい", { x: maxX, y: axisY + 0.6, z: axisZ });
  addDecorationLabel(THREE, document, decorationRoot, "unset: no geological time", {
    x: layout.metadata.unsetAreaX + 1.9,
    y: 5.9,
    z: axisZ,
  });
  for (const guide of layout.metadata.timeGuides || []) {
    const startX = guide.startX;
    const endX = guide.kind === "period" ? guide.endX : guide.startX;
    decorationRoot.add(createDecorationLine(THREE, [
      { x: startX, y: 0.15, z: guide.z },
      { x: endX, y: 0.15, z: guide.z },
    ], 0x8a4f7d, 0.48));
    for (const x of new Set([startX, endX])) {
      decorationRoot.add(createDecorationLine(THREE, [
        { x, y: -0.1, z: guide.z },
        { x, y: 0.4, z: guide.z },
      ], 0x5f3657, 0.58));
    }
    addDecorationLabel(THREE, document, decorationRoot, timeGuideLabel(guide), {
      x: guide.centerX,
      y: 0.85,
      z: guide.z,
    });
  }
}

/** @param {{label:string,startMa:number,endMa:number,kind:string}} guide */
function timeGuideLabel(guide) {
  const formatAge = (value) => `${Number(value).toLocaleString("ja-JP", { maximumFractionDigits: 3 })} Ma`;
  return guide.kind === "period"
    ? `${guide.label} ${formatAge(guide.startMa)}–${formatAge(guide.endMa)}`
    : `${guide.label} ${formatAge(guide.startMa)}`;
}

/**
 * Draw the complete root-to-leaf structure supplied by the resolver. Ancestor
 * guides are intentionally decoration-only and therefore cannot be selected.
 * @param {any} THREE
 * @param {Document} document
 * @param {any} decorationRoot
 * @param {import('./layout-engine.js').VisualizationLayout} layout
 */
function refreshClassificationDecorations(THREE, document, decorationRoot, layout) {
  const guides = layout.metadata.classificationGuides || [];
  const byId = new Map(guides.map((guide) => [guide.id, guide]));
  const branchY = 2 * NODE_Y_SCALE;
  const unsetBoundaryX = layout.metadata.unsetAreaX - 1.2;
  decorationRoot.add(createDecorationLine(THREE, [
    { x: unsetBoundaryX, y: -0.8, z: -7.4 },
    { x: unsetBoundaryX, y: 6.2, z: 7.4 },
  ], 0x8a6f2a, 0.42));
  addDecorationLabel(THREE, document, decorationRoot, "unset: no taxonomy", {
    x: layout.metadata.unsetAreaX + 1.7,
    y: 5.9,
    z: -6.9,
  });
  for (const guide of guides) {
    const parent = byId.get(guide.parentId);
    if (parent) {
      decorationRoot.add(createDecorationLine(THREE, [
        { x: parent.x, y: branchY, z: parent.z },
        { x: guide.x, y: branchY, z: guide.z },
      ], 0x58784d, guide.referenced ? 0.62 : 0.38));
    }
    addDecorationLabel(THREE, document, decorationRoot, guide.label, {
      x: guide.x,
      y: branchY + 0.72,
      z: guide.z,
    });
  }
}

/**
 * @param {any} THREE
 * @param {{x:number,y:number,z:number}[]} points
 * @param {number} color
 * @param {number} opacity
 */
function createDecorationLine(THREE, points, color, opacity) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((point) => new THREE.Vector3(point.x, point.y, point.z)));
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
  return new THREE.Line(geometry, material);
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
  sprite.scale.set(3.2, 0.8, 1);
  return sprite;
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
  object.traverse?.((child) => {
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
