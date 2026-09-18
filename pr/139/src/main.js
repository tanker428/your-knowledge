/**
 * Application entry point.
 *
 * Wires the concrete implementations into the UI and starts it. This is the one
 * file that knows which repository and which analysis provider the build uses —
 * swapping either one is a change here and nowhere else.
 */

import { buildLookups, loadDomainRegistry } from "./domain/registry.js";
import { IndexedDbKnowledgeRepository } from "./repositories/indexed-db/indexed-db-knowledge-repository.js";
import { requestPersistentStorage } from "./repositories/storage-persistence.js";
import { DemoAnalysisProvider } from "./services/analysis/demo-analysis-provider.js";
import { registerServiceWorker } from "./features/pwa/service-worker-client.js";
import { initApp } from "./ui/app.js";
import { loadReferenceData } from "./domain/reference-registry.js";

/**
 * @param {string} message
 * @param {unknown} error
 */
function showFatalError(message, error) {
  console.error(error);
  const banner = document.getElementById("storageAlert");
  const text = document.getElementById("storageAlertText");
  if (banner && text) {
    text.textContent = message;
    banner.classList.add("show");
  }
}

async function boot() {
  /** @type {import('./domain/registry.js').DomainRegistry} */
  let registry;
  try {
    registry = await loadDomainRegistry();
  } catch (error) {
    showFatalError(
      "分野別分類の設定ファイルを読み込めませんでした。ページを再読み込みしてください。",
      error,
    );
    return;
  }

  let referenceData;
  try {
    referenceData = await loadReferenceData();
  } catch (error) {
    showFatalError(
      "分類・時代の参照データを読み込めませんでした。ページを再読み込みしてください。",
      error,
    );
    return;
  }

  const storageStatus = await requestPersistentStorage();

  // The handle is filled in once registration finishes; the update banner is
  // the only thing that needs it, and that cannot fire before then anyway.
  /** @type {{supported: boolean, applyUpdate: () => Promise<void>}} */
  const serviceWorker = { supported: false, applyUpdate: async () => {} };

  await initApp({
    repository: new IndexedDbKnowledgeRepository(),
    registry,
    lookups: buildLookups(registry),
    referenceData,
    analysisProvider: new DemoAnalysisProvider(),
    storageStatus,
    serviceWorker,
  });

  // Registered only after the app is up. A worker activating mid-boot can call
  // clients.claim() while the config fetches are still in flight and abort them.
  const registered = await registerServiceWorker({
    onUpdateAvailable: () =>
      document.getElementById("updateBanner")?.classList.add("show"),
  });
  serviceWorker.supported = registered.supported;
  serviceWorker.applyUpdate = registered.applyUpdate;
}

boot().catch((error) =>
  showFatalError("アプリを起動できませんでした。", error),
);
