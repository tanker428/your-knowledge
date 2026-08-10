/* Your Knowledge service worker.
 *
 * Two jobs, kept strictly separate:
 *   1. cache the app shell so the app opens offline
 *   2. receive photos from Android's share sheet
 *
 * What is deliberately NOT cached: the user's own photos. Those live in
 * IndexedDB, which the browser already persists; copying megabytes of personal
 * images into the HTTP cache as well would compete for the very quota the
 * photos need. Nothing here ever talks to a third-party origin.
 */

// Replaced with a content-derived value by scripts/build.mjs. The fallback is
// useful for the local source tree and is never used by the production build.
const VERSION = "build-bb2807e3a334c4ba";
const SHELL_CACHE = `your-knowledge-shell-${VERSION}`;
const SAMPLE_CACHE = `your-knowledge-samples-${VERSION}`;
const SHARED_PHOTO_DB = "your-knowledge-shared-photos";
const SHARED_PHOTO_STORE = "incoming";

/** Everything needed to render the app with no network. Paths are scope-relative. */
const SHELL_ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.svg",
  "./pwa-icon-192.png",
  "./pwa-icon-512.png",
  "./domain/core/vocabulary.json",
  "./domain/packs/cultural.json",
  "./domain/packs/history.json",
  "./domain/packs/index.json",
  "./domain/packs/nature.json",
  "./domain/packs/other.json",
  "./domain/packs/paleontology.json",
  "./domain/reference/paleontology/geological-time.json",
  "./domain/reference/paleontology/manifest.json",
  "./domain/reference/paleontology/schemas/geological-time.schema.json",
  "./domain/reference/paleontology/schemas/taxonomy.schema.json",
  "./domain/reference/paleontology/taxonomy.json",
  "./src/data/demo/demo-knowledge.js",
  "./src/data/demo/sample-data.js",
  "./src/domain/image-viewport.js",
  "./src/domain/knowledge-graph.js",
  "./src/domain/learned-reference-facts.js",
  "./src/domain/learning-state.js",
  "./src/domain/observation.js",
  "./src/domain/photo-rotation.js",
  "./src/domain/reference-registry.js",
  "./src/domain/reference-validation.js",
  "./src/domain/registry.js",
  "./src/domain/relation.js",
  "./src/domain/visit.js",
  "./src/features/collections/collection-progress.js",
  "./src/features/knowledge-graph/quiz-generation.js",
  "./src/features/knowledge-graph/selectors.js",
  "./src/features/photos/image-processing.js",
  "./src/features/photos/photo-import.js",
  "./src/features/photos/shared-inbox.js",
  "./src/features/project/migrate.js",
  "./src/features/project/project-json.js",
  "./src/features/project/share-file.js",
  "./src/features/pwa/service-worker-client.js",
  "./src/main.js",
  "./src/repositories/indexed-db/idb.js",
  "./src/repositories/indexed-db/indexed-db-knowledge-repository.js",
  "./src/repositories/knowledge-graph-service.js",
  "./src/repositories/knowledge-repository.js",
  "./src/repositories/storage-persistence.js",
  "./src/services/analysis/analysis-provider.js",
  "./src/services/analysis/demo-analysis-provider.js",
  "./src/ui/app.js",
  "./src/ui/html.js",
  "./src/ui/knowledge-display.js",
  "./src/ui/knowledge-labels.js",
  "./src/ui/magnifier.js",
  "./src/ui/photo-assets.js",
  "./src/ui/quiz-photo.js",
  "./src/ui/tutorial.js",
  "./styles.css",
  "./sw.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is all-or-nothing; add individually so one 404 cannot break install.
      await Promise.all(
        SHELL_ASSETS.map(async (asset) => {
          try {
            await cache.add(new Request(asset, { cache: "reload" }));
          } catch (error) {
            console.warn("[sw] skipped", asset, error);
          }
        }),
      );
      // No skipWaiting() here on purpose: the page decides when to switch.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, SAMPLE_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names
          .filter(
            (name) => name.startsWith("your-knowledge-") && !keep.has(name),
          )
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  // Sent by service-worker-client.js when the user picks "今すぐ更新".
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

// ------------------------------------------------------------- share target ---

function openSharedPhotoDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARED_PHOTO_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARED_PHOTO_STORE)) {
        request.result.createObjectStore(SHARED_PHOTO_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function storeSharedPhotos(files) {
  const db = await openSharedPhotoDb();
  try {
    const transaction = db.transaction(SHARED_PHOTO_STORE, "readwrite");
    const store = transaction.objectStore(SHARED_PHOTO_STORE);
    files.slice(0, 120).forEach((file, index) => {
      store.put({
        id: `${Date.now()}-${index}-${crypto.randomUUID()}`,
        name: file.name || `shared-${index + 1}.jpg`,
        type: file.type || "image/jpeg",
        lastModified: file.lastModified || Date.now(),
        blob: file,
      });
    });
    await transactionDone(transaction);
  } finally {
    db.close();
  }
}

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("photos")
      .filter(
        (value) => value instanceof File && value.type.startsWith("image/"),
      );
    await storeSharedPhotos(files);
    return Response.redirect(
      new URL(
        `index.html?shared=${files.length}`,
        self.registration.scope,
      ).toString(),
      303,
    );
  } catch (error) {
    console.warn("[sw] share target failed", error);
    return Response.redirect(
      new URL("index.html?shared=error", self.registration.scope).toString(),
      303,
    );
  }
}

// ------------------------------------------------------------------- fetch ---

/** Cache-first keeps the active worker's HTML and modules on one version. */
async function serveShell(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    // Offline and not cached: for a navigation, fall back to the app shell.
    if (request.mode === "navigate") {
      const shell = await caches.match(
        new URL("./index.html", self.registration.scope).toString(),
      );
      if (shell) return shell;
    }
    throw error;
  }
}

/**
 * The 20 bundled demo photos are cached lazily rather than on install, so a
 * first visit does not pay 3MB before the app is usable. Once a photo has been
 * viewed it stays available offline.
 */
async function serveSample(request) {
  const cache = await caches.open(SAMPLE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

function isPullRequestPreviewRequest(url) {
  if (url.origin !== self.location.origin) return false;
  const scopePath = new URL(self.registration.scope).pathname.replace(/\/+$/, "");
  const previewPattern = new RegExp(
    `^${scopePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pr/\\d+(?:/|$)`,
  );
  return previewPattern.test(url.pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // A production worker can control the preview path because its scope is
  // /your-knowledge/. Never let that worker read or mutate production caches
  // for a PR preview, including offline navigation fallback.
  if (isPullRequestPreviewRequest(url)) {
    event.respondWith(fetch(request));
    return;
  }

  if (request.method === "POST" && url.pathname.endsWith("/share-target")) {
    event.respondWith(handleShareTarget(request));
    return;
  }

  // Only ever serve our own origin, and never interfere with non-GET traffic.
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  const scopePath = new URL(self.registration.scope).pathname;
  if (url.pathname.startsWith(`${scopePath}assets/`)) {
    event.respondWith(serveSample(request));
    return;
  }

  event.respondWith(serveShell(request));
});
