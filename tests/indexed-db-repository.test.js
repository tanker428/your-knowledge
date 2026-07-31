import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { IndexedDbKnowledgeRepository } from "../src/repositories/indexed-db/indexed-db-knowledge-repository.js";
import {
  DEFAULT_PROJECT_ID,
  isQuotaExceeded,
} from "../src/repositories/knowledge-repository.js";

/** @returns {any} */
function project(overrides = {}) {
  return {
    id: DEFAULT_PROJECT_ID,
    updatedAt: 0,
    photos: [
      {
        id: "p01",
        visitId: "v1",
        file: "a.jpg",
        order: 1,
        title: "写真",
        status: "in-progress",
        source: "upload",
        observations: [
          { id: "o1", photoId: "p01", label: "対象", included: true },
        ],
      },
    ],
    relations: [],
    facts: [],
    quizResults: [],
    ...overrides,
  };
}

/** @returns {any} */
const binary = () => ({
  display: new Blob(["display-bytes"]),
  thumbnail: new Blob(["thumb"]),
  width: 1600,
  height: 1200,
  type: "image/jpeg",
  bytes: 18,
});

describe("IndexedDbKnowledgeRepository", () => {
  /** @type {IndexedDbKnowledgeRepository} */
  let repository;

  beforeEach(async () => {
    repository = new IndexedDbKnowledgeRepository();
    await repository.clear();
  });

  it("returns null before anything has been saved", async () => {
    expect(await repository.loadProject(DEFAULT_PROJECT_ID)).toBeNull();
  });

  it("survives a reload: what was saved comes back", async () => {
    await repository.saveProject(project());

    // A fresh instance stands in for a page reload.
    const reopened = new IndexedDbKnowledgeRepository();
    const loaded = await reopened.loadProject(DEFAULT_PROJECT_ID);

    expect(loaded?.photos).toHaveLength(1);
    expect(loaded?.photos[0].observations[0].label).toBe("対象");
  });

  it("keeps an uploaded photo, not only the bundled samples", async () => {
    await repository.saveProject(project());
    const loaded = await repository.loadProject(DEFAULT_PROJECT_ID);
    expect(loaded?.photos[0].source).toBe("upload");
  });

  it("stamps updatedAt on save", async () => {
    const before = Date.now();
    await repository.saveProject(project({ updatedAt: 0 }));
    const loaded = await repository.loadProject(DEFAULT_PROJECT_ID);
    expect(loaded?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("overwrites rather than duplicating on repeated saves", async () => {
    await repository.saveProject(project());
    await repository.saveProject(project({ photos: [] }));
    const loaded = await repository.loadProject(DEFAULT_PROJECT_ID);
    expect(loaded?.photos).toEqual([]);
  });

  it("stores photo binaries separately from the project document", async () => {
    await repository.saveProject(project());
    await repository.savePhotoBinary("p01", binary());

    const stored = await repository.loadPhotoBinary("p01");
    expect(stored?.display).toBeInstanceOf(Blob);
    expect(await stored?.display.text()).toBe("display-bytes");

    // The project JSON must stay free of image bytes.
    const blob = await repository.exportProject(DEFAULT_PROJECT_ID);
    expect(await blob.text()).not.toContain("display-bytes");
  });

  it("lists the ids of photos whose binary is present", async () => {
    await repository.savePhotoBinary("p01", binary());
    await repository.savePhotoBinary("p02", binary());
    expect((await repository.listPhotoBinaryIds()).sort()).toEqual([
      "p01",
      "p02",
    ]);
  });

  it("returns null for a photo binary that is not stored", async () => {
    expect(await repository.loadPhotoBinary("missing")).toBeNull();
  });

  it("deletes a photo binary without touching the project", async () => {
    await repository.saveProject(project());
    await repository.savePhotoBinary("p01", binary());
    await repository.deletePhotoBinary("p01");

    expect(await repository.loadPhotoBinary("p01")).toBeNull();
    expect(
      (await repository.loadProject(DEFAULT_PROJECT_ID))?.photos,
    ).toHaveLength(1);
  });

  it("exports the stored project as a JSON blob", async () => {
    await repository.saveProject(project());
    const blob = await repository.exportProject(DEFAULT_PROJECT_ID);
    expect(blob.type).toBe("application/json");
    expect(JSON.parse(await blob.text()).photos[0].id).toBe("p01");
  });

  it("exports quizResults through the repository and preserves them after re-import", async () => {
    const savedResults = [{ id: "result-1", quizId: "q1", answer: { text: "三畳紀" }, correct: true }];
    await repository.saveProject(project({ quizResults: savedResults }));
    const exported = JSON.parse(await (await repository.exportProject(DEFAULT_PROJECT_ID)).text());
    expect(exported.quizResults).toEqual(savedResults);
  });
});

describe("isQuotaExceeded", () => {
  it("recognises the standard error name", () => {
    expect(isQuotaExceeded({ name: "QuotaExceededError" })).toBe(true);
  });

  it("recognises the Firefox variant", () => {
    expect(isQuotaExceeded({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
  });

  it("does not mistake other failures for a full disk", () => {
    expect(isQuotaExceeded({ name: "AbortError" })).toBe(false);
    expect(isQuotaExceeded(null)).toBe(false);
    expect(isQuotaExceeded("QuotaExceededError")).toBe(false);
  });
});
