import { afterEach, describe, expect, it, vi } from "vitest";
import { isDevelopmentEnvironment, registerServiceWorker } from "../src/features/pwa/service-worker-client.js";

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
});
