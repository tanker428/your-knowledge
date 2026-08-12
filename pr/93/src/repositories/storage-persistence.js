/**
 * Persistent-storage negotiation.
 *
 * On Android Chrome an installed PWA can usually get `persist()` granted without
 * a prompt. Without it the browser may evict IndexedDB under storage pressure,
 * so we ask once and report the answer honestly rather than assuming success.
 */

/**
 * @typedef {object} StorageStatus
 * @property {boolean} supported
 * @property {boolean} persisted
 * @property {number|null} usageBytes
 * @property {number|null} quotaBytes
 */

/**
 * Ask the browser to keep our data. Safe to call repeatedly.
 * @returns {Promise<StorageStatus>}
 */
export async function requestPersistentStorage() {
  /** @type {StorageStatus} */
  const status = {
    supported: false,
    persisted: false,
    usageBytes: null,
    quotaBytes: null,
  };
  if (typeof navigator === "undefined" || !navigator.storage) return status;
  status.supported = typeof navigator.storage.persist === "function";

  try {
    if (typeof navigator.storage.persisted === "function") {
      status.persisted = await navigator.storage.persisted();
    }
    if (!status.persisted && status.supported) {
      status.persisted = await navigator.storage.persist();
    }
  } catch {
    // Treat a refusal as "not persisted" — never as a hard failure.
  }

  return { ...status, ...(await readEstimate()) };
}

/**
 * @returns {Promise<{usageBytes: number|null, quotaBytes: number|null}>}
 */
export async function readEstimate() {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) {
    return { usageBytes: null, quotaBytes: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usageBytes: estimate.usage ?? null,
      quotaBytes: estimate.quota ?? null,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null };
  }
}

/**
 * @param {number|null} bytes
 * @returns {string}
 */
export function formatBytes(bytes) {
  if (bytes === null || !Number.isFinite(bytes)) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)}${units[unit]}`;
}

/**
 * True when the remaining quota looks too small to keep importing photos.
 * @param {StorageStatus|{usageBytes:number|null,quotaBytes:number|null}} status
 * @param {number} [needBytes]
 * @returns {boolean}
 */
export function isRunningOutOfSpace(status, needBytes = 20 * 1024 * 1024) {
  if (status.usageBytes === null || status.quotaBytes === null) return false;
  return status.quotaBytes - status.usageBytes < needBytes;
}
