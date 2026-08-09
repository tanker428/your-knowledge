import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadServiceWorker() {
  let fetchHandler;
  const cacheMatch = vi.fn();
  const cacheOpen = vi.fn(async () => ({ put: vi.fn(async () => {}) }));
  const cacheKeys = vi.fn(async () => []);
  const networkFetch = vi.fn(async (request) => new Response(`network:${request.url}`));
  const self = {
    location: { origin: "https://tanker428.github.io" },
    registration: { scope: "https://tanker428.github.io/your-knowledge/" },
    addEventListener: vi.fn((type, callback) => {
      if (type === "fetch") fetchHandler = callback;
    }),
    clients: { claim: vi.fn(async () => {}) },
  };
  const context = {
    Response,
    Request,
    URL,
    console,
    crypto,
    fetch: networkFetch,
    caches: { match: cacheMatch, open: cacheOpen, keys: cacheKeys },
    self,
    indexedDB: {},
    File,
  };

  vm.runInNewContext(fs.readFileSync(path.join(root, "sw.js"), "utf8"), context);

  return {
    networkFetch,
    dispatch(request) {
      let responsePromise;
      fetchHandler({
        request,
        respondWith(response) {
          responsePromise = response;
        },
      });
      return { responsePromise, cacheMatch, cacheOpen, cacheKeys, networkFetch };
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("service worker PR preview bypass", () => {
  it.each([
    "/your-knowledge/pr/81/",
    "/your-knowledge/pr/81/index.html",
    "/your-knowledge/pr/81/src/main.js",
    "/your-knowledge/pr/81/styles.css",
  ])("passes %s to the network without cache access", async (pathname) => {
    const worker = loadServiceWorker();
    const result = worker.dispatch(new Request(`https://tanker428.github.io${pathname}`));

    await expect(result.responsePromise).resolves.toBeInstanceOf(Response);
    expect(await result.responsePromise.then((response) => response.text())).toContain("network:");
    expect(result.networkFetch).toHaveBeenCalledTimes(1);
    expect(result.cacheMatch).not.toHaveBeenCalled();
    expect(result.cacheOpen).not.toHaveBeenCalled();
  });

  it("does not bypass similar non-preview paths", async () => {
    const worker = loadServiceWorker();
    const result = worker.dispatch(new Request("https://tanker428.github.io/your-knowledge/private/index.html"));

    await expect(result.responsePromise).resolves.toBeInstanceOf(Response);
    expect(result.cacheMatch).toHaveBeenCalledTimes(1);
    expect(result.networkFetch).toHaveBeenCalledTimes(1);
  });

  it("does not bypass another origin", async () => {
    const worker = loadServiceWorker();
    const result = worker.dispatch(new Request("https://example.com/your-knowledge/pr/81/"));

    expect(result.responsePromise).toBeUndefined();
    expect(result.cacheMatch).not.toHaveBeenCalled();
    expect(result.networkFetch).not.toHaveBeenCalled();
  });

  it("does not fall back to a production cache when preview networking fails", async () => {
    const worker = loadServiceWorker();
    const error = new Error("offline");
    worker.networkFetch.mockRejectedValueOnce(error);
    const result = worker.dispatch(new Request("https://tanker428.github.io/your-knowledge/pr/81/"));

    await expect(result.responsePromise).rejects.toBe(error);
    expect(result.cacheMatch).not.toHaveBeenCalled();
    expect(result.cacheOpen).not.toHaveBeenCalled();
  });
});
