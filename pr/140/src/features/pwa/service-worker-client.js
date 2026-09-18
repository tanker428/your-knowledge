/**
 * Service worker registration and update handling.
 *
 * The prototype called `skipWaiting()` on install, which swaps the app out from
 * under someone who is halfway through organising a photo. Here the new worker
 * waits, we tell the user, and the swap only happens when they choose it.
 */

// This module sits at src/features/pwa/, so the worker at the repository root
// is three levels up. Getting this wrong silently disables offline support.
const SW_URL = new URL("../../../sw.js", import.meta.url);

export function isDevelopmentEnvironment() {
  if (typeof location === "undefined") return false;
  return (
    location.hostname === "localhost" ||
    location.hostname === "127.0.0.1" ||
    location.hostname === "::1" ||
    location.port === "8000" ||
    location.port === "4173"
  );
}

export function isPagesPullRequestPreview() {
  if (typeof location === "undefined") return false;
  return /\/pr\/\d+(?:\/|$)/.test(location.pathname);
}

async function disableDevelopmentWorker() {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL.toString());
  if (registration) await registration.unregister();
  const names = await caches.keys();
  await Promise.all(names.filter((name) => name.startsWith("your-knowledge-")).map((name) => caches.delete(name)));
}

/**
 * @typedef {object} ServiceWorkerHandle
 * @property {boolean} supported
 * @property {() => Promise<void>} applyUpdate
 */

/**
 * @param {object} handlers
 * @param {() => void} [handlers.onUpdateAvailable]
 * @returns {Promise<ServiceWorkerHandle>}
 */
export async function registerServiceWorker(handlers = {}) {
  /** @type {ServiceWorkerHandle} */
  const handle = { supported: false, applyUpdate: async () => {} };
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator))
    return handle;
  // PR previews live below the production worker scope. Do not register or
  // mutate caches there; the preview must always use its own network assets.
  if (isPagesPullRequestPreview()) return handle;
  if (isDevelopmentEnvironment()) {
    await disableDevelopmentWorker().catch(() => {});
    return handle;
  }
  handle.supported = true;

  /** @type {ServiceWorkerRegistration|null} */
  let registration = null;
  try {
    // scope './' keeps the worker confined to /<repo>/ on a project site.
    registration = await navigator.serviceWorker.register(SW_URL.toString(), {
      scope: new URL("./", SW_URL).toString(),
    });
  } catch (error) {
    console.warn("Service Workerを登録できませんでした。", error);
    return handle;
  }

  // Explicitly ask the browser to check on every production page load. This
  // detects a changed worker even when the current document came from cache.
  await registration.update().catch(() => {});

  const announce = () => handlers.onUpdateAvailable?.();

  // A worker already sitting in "waiting" means an update arrived earlier.
  if (registration.waiting && navigator.serviceWorker.controller) announce();

  registration.addEventListener("updatefound", () => {
    const installing = registration?.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      // "installed" + an existing controller == a genuine update, not first run.
      if (
        installing.state === "installed" &&
        navigator.serviceWorker.controller
      )
        announce();
    });
  });

  // `controllerchange` fires for two very different reasons: the first-ever
  // activation calling clients.claim(), and a user-requested update taking
  // over. Reloading on the first one throws away whatever the page was doing —
  // so only reload when the user actually asked for the update.
  let updateRequested = false;
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!updateRequested || reloading) return;
    reloading = true;
    window.location.reload();
  });

  handle.applyUpdate = async () => {
    updateRequested = true;
    let waiting = registration?.waiting;
    if (!waiting) {
      await registration?.update().catch(() => {});
      waiting = registration?.waiting;
    }
    if (!waiting) {
      window.location.reload();
      return;
    }
    waiting.postMessage({ type: "SKIP_WAITING" });
  };

  return handle;
}
