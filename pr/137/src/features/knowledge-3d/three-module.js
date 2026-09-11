export const THREE_VERSION = "0.185.1";
export const THREE_MODULE_URL = new URL(
  "../../vendor/three/0.185.1/three.module.js",
  import.meta.url,
);

/** @returns {Promise<any>} */
export function loadThreeModule() {
  return import(THREE_MODULE_URL.href);
}

/**
 * @param {{document?: Document, WebGLRenderingContext?: unknown, WebGL2RenderingContext?: unknown}} [runtime]
 */
export function isWebGLAvailable(runtime = globalThis) {
  const doc = runtime.document;
  if (!doc) return false;
  if (!runtime.WebGLRenderingContext && !runtime.WebGL2RenderingContext) return false;
  try {
    const canvas = doc.createElement("canvas");
    return Boolean(
      canvas.getContext("webgl2")
        || canvas.getContext("webgl")
        || canvas.getContext("experimental-webgl"),
    );
  } catch {
    return false;
  }
}
