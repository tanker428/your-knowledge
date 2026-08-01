import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isDevelopmentEnvironment, registerServiceWorker } from "../src/features/pwa/service-worker-client.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

afterEach(() => vi.unstubAllGlobals());

function serviceWorkerMock(registration = {}) {
  return {
    register: vi.fn(async () => ({
      waiting: null,
      installing: null,
      addEventListener: vi.fn(),
      update: vi.fn(async () => {}),
      ...registration,
    })),
    addEventListener: vi.fn(),
    getRegistration: vi.fn(async () => null),
    controller: null,
  };
}

describe("service worker update policy", () => {
  it("recognises the local development server", () => {
    vi.stubGlobal("location", { hostname: "localhost", port: "8000" });
    expect(isDevelopmentEnvironment()).toBe(true);
    vi.stubGlobal("location", { hostname: "tanker428.github.io", port: "" });
    expect(isDevelopmentEnvironment()).toBe(false);
  });

  it("does not register or touch IndexedDB in development", async () => {
    const serviceWorker = serviceWorkerMock();
    const unregister = vi.fn(async () => true);
    serviceWorker.getRegistration = vi.fn(async () => ({ unregister }));
    vi.stubGlobal("location", { hostname: "localhost", port: "8000" });
    vi.stubGlobal("navigator", { serviceWorker });
    vi.stubGlobal("caches", { keys: vi.fn(async () => []), delete: vi.fn() });
    const handle = await registerServiceWorker();
    expect(handle.supported).toBe(false);
    expect(serviceWorker.register).not.toHaveBeenCalled();
    expect(unregister).toHaveBeenCalled();
  });

  it("checks for an update on production registration", async () => {
    const update = vi.fn(async () => {});
    const serviceWorker = serviceWorkerMock({ update });
    vi.stubGlobal("location", { hostname: "tanker428.github.io", port: "" });
    vi.stubGlobal("navigator", { serviceWorker });
    const handle = await registerServiceWorker();
    expect(handle.supported).toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("announces a waiting worker and applies SKIP_WAITING only on request", async () => {
    const postMessage = vi.fn();
    const onUpdateAvailable = vi.fn();
    const waiting = { postMessage };
    const serviceWorker = serviceWorkerMock({ waiting });
    serviceWorker.controller = {};
    vi.stubGlobal("location", { hostname: "tanker428.github.io", port: "" });
    vi.stubGlobal("navigator", { serviceWorker });
    vi.stubGlobal("window", { location: { reload: vi.fn() } });
    const handle = await registerServiceWorker({ onUpdateAvailable });
    expect(onUpdateAvailable).toHaveBeenCalledTimes(1);
    expect(postMessage).not.toHaveBeenCalled();
    await handle.applyUpdate();
    expect(postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("reloads once after controllerchange and does not reload before approval", async () => {
    const postMessage = vi.fn();
    const waiting = { postMessage };
    const serviceWorker = serviceWorkerMock({ waiting });
    let controllerChange;
    serviceWorker.addEventListener = vi.fn((type, callback) => {
      if (type === "controllerchange") controllerChange = callback;
    });
    vi.stubGlobal("location", { hostname: "tanker428.github.io", port: "" });
    vi.stubGlobal("navigator", { serviceWorker });
    const reload = vi.fn();
    vi.stubGlobal("window", { location: { reload } });
    const handle = await registerServiceWorker();
    expect(reload).not.toHaveBeenCalled();
    await handle.applyUpdate();
    controllerChange();
    controllerChange();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("keeps old assets together and deletes only stale caches on activation", () => {
    const source = fs.readFileSync(path.join(root, "sw.js"), "utf8");
    expect(source).toContain("const SHELL_CACHE");
    expect(source).toContain("caches.open(SHELL_CACHE)");
    expect(source).toContain("!keep.has(name)");
    expect(source).not.toContain("serveNavigation");
    expect(source).not.toContain("indexedDB.deleteDatabase");
  });

  it("generates the production precache list from shipped assets", () => {
    const build = fs.readFileSync(path.join(root, "scripts", "build.mjs"), "utf8");
    expect(build).toContain("stampServiceWorker");
    expect(build).toContain("\\.(?:js|css|json)$");
    expect(build).toContain("GeneratedServiceWorkerShell");
  });
});
