import { describe, expect, it, vi } from "vitest";
import {
  importPhotos,
  selectImageFiles,
} from "../src/features/photos/photo-import.js";
import { fitWithin } from "../src/features/photos/image-processing.js";
import { StorageWriteError } from "../src/repositories/knowledge-repository.js";

/**
 * @param {string} name
 * @param {string} [type]
 * @param {number} [lastModified]
 */
function file(name, type = "image/jpeg", lastModified = 1) {
  return new File([new Uint8Array([1, 2, 3])], name, { type, lastModified });
}

/** A repository stand-in that records what was written. */
function fakeRepository(overrides = {}) {
  /** @type {string[]} */
  const saved = [];
  return {
    saved,
    savePhotoBinary: async (/** @type {string} */ id) => {
      saved.push(id);
    },
    ...overrides,
  };
}

/** @type {any} */
const fakeBinary = {
  display: new Blob(["display"]),
  thumbnail: new Blob(["thumb"]),
  width: 1600,
  height: 900,
  type: "image/jpeg",
  bytes: 12,
};

const processImage = async () => fakeBinary;

/** @param {any} extra */
function options(repository, extra = {}) {
  let counter = 0;
  return {
    repository,
    visitId: "visit-1",
    domainHint: "paleontology",
    startOrder: 1,
    createId: () => `photo-${++counter}`,
    processImage,
    ...extra,
  };
}

describe("fitWithin", () => {
  it("shrinks the long edge to the limit and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({
      width: 1600,
      height: 1200,
      scale: 0.4,
    });
  });

  it("handles portrait photos", () => {
    expect(fitWithin(3000, 4000, 320)).toEqual({
      width: 240,
      height: 320,
      scale: 0.08,
    });
  });

  it("never upscales a small image", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({
      width: 800,
      height: 600,
      scale: 1,
    });
  });

  it("never rounds an edge down to zero", () => {
    expect(fitWithin(10000, 3, 320).height).toBe(1);
  });
});

describe("selectImageFiles", () => {
  it("keeps only images", () => {
    const { accepted, rejected } = selectImageFiles(
      [
        file("a.jpg"),
        file("notes.pdf", "application/pdf"),
        file("b.png", "image/png"),
      ],
      [],
      100,
    );
    expect(accepted.map((f) => f.name)).toEqual(["a.jpg", "b.png"]);
    expect(rejected).toBe(1);
  });

  it("drops files already queued", () => {
    const existing = file("a.jpg");
    const { accepted, rejected } = selectImageFiles(
      [file("a.jpg"), file("c.jpg")],
      [existing],
      100,
    );
    expect(accepted.map((f) => f.name)).toEqual(["c.jpg"]);
    expect(rejected).toBe(1);
  });

  it("drops duplicates inside one selection", () => {
    const { accepted } = selectImageFiles(
      [file("a.jpg"), file("a.jpg")],
      [],
      100,
    );
    expect(accepted).toHaveLength(1);
  });

  it("respects the batch limit, counting what is already queued", () => {
    const { accepted, rejected } = selectImageFiles(
      [file("a.jpg"), file("b.jpg"), file("c.jpg")],
      [file("z.jpg")],
      2,
    );
    expect(accepted).toHaveLength(1);
    expect(rejected).toBe(2);
  });
});

describe("importPhotos", () => {
  it("stores every photo and returns one record each", async () => {
    const repository = fakeRepository();
    const outcome = await importPhotos(
      [file("a.jpg"), file("b.jpg")],
      options(repository),
    );

    expect(outcome.added).toHaveLength(2);
    expect(outcome.failures).toEqual([]);
    expect(outcome.aborted).toBe(false);
    expect(repository.saved).toEqual(["photo-1", "photo-2"]);
  });

  it('imports photos as 未整理 with no observations — never as "AI解析済み"', async () => {
    const outcome = await importPhotos(
      [file("a.jpg")],
      options(fakeRepository()),
    );
    expect(outcome.added[0].status).toBe("unorganized");
    expect(outcome.added[0].observations).toEqual([]);
  });

  it("numbers photos from the given start order", async () => {
    const outcome = await importPhotos(
      [file("a.jpg"), file("b.jpg")],
      options(fakeRepository(), { startOrder: 21 }),
    );
    expect(outcome.added.map((p) => p.order)).toEqual([21, 22]);
  });

  it("carries the registration preview rotation into each Photo record", async () => {
    const outcome = await importPhotos(
      [file("a.jpg"), file("b.jpg")],
      options(fakeRepository(), { getRotation: (_file, index) => index === 0 ? 270 : 90 }),
    );
    expect(outcome.added.map((photo) => photo.rotation)).toEqual([270, 90]);
  });

  it("derives a title from the filename", async () => {
    const outcome = await importPhotos(
      [file("IMG_0042.jpg")],
      options(fakeRepository()),
    );
    expect(outcome.added[0].title).toBe("IMG_0042");
  });

  it("persists each photo before reporting it, so an interruption keeps them", async () => {
    /** @type {string[]} */
    const order = [];
    const repository = fakeRepository({
      savePhotoBinary: async (/** @type {string} */ id) =>
        order.push(`save:${id}`),
    });
    await importPhotos(
      [file("a.jpg")],
      options(repository, {
        onPhotoSaved: (/** @type {any} */ record) =>
          void order.push(`notify:${record.id}`),
      }),
    );
    expect(order).toEqual(["save:photo-1", "notify:photo-1"]);
  });

  it("reports progress for every file", async () => {
    const onProgress = vi.fn();
    await importPhotos(
      [file("a.jpg"), file("b.jpg")],
      options(fakeRepository(), { onProgress }),
    );
    const totals = onProgress.mock.calls.map((call) => call[0].total);
    expect(totals.every((total) => total === 2)).toBe(true);
    expect(onProgress.mock.calls.at(-1)?.[0].done).toBe(2);
  });

  it("stops when aborted but keeps what was already stored", async () => {
    const repository = fakeRepository();
    const controller = new AbortController();
    const outcome = await importPhotos(
      [file("a.jpg"), file("b.jpg"), file("c.jpg")],
      options(repository, {
        signal: controller.signal,
        onPhotoSaved: () => {
          if (repository.saved.length === 1) controller.abort();
        },
      }),
    );

    expect(outcome.aborted).toBe(true);
    expect(outcome.added).toHaveLength(1);
    expect(repository.saved).toEqual(["photo-1"]);
  });

  it("keeps going when one file fails to decode", async () => {
    let call = 0;
    const outcome = await importPhotos(
      [file("good1.jpg"), file("broken.jpg"), file("good2.jpg")],
      options(fakeRepository(), {
        processImage: async () => {
          call += 1;
          if (call === 2) throw new Error("decode failed");
          return fakeBinary;
        },
      }),
    );

    expect(outcome.added).toHaveLength(2);
    expect(outcome.failures).toEqual([
      { name: "broken.jpg", reason: "decode failed" },
    ]);
  });

  it("stops immediately when storage is full instead of failing on every file", async () => {
    const repository = fakeRepository({
      savePhotoBinary: async () => {
        throw new StorageWriteError("容量が足りません", {
          quotaExceeded: true,
        });
      },
    });
    const outcome = await importPhotos(
      [file("a.jpg"), file("b.jpg"), file("c.jpg")],
      options(repository),
    );

    expect(outcome.storageError).not.toBeNull();
    expect(outcome.storageError?.quotaExceeded).toBe(true);
    expect(outcome.added).toEqual([]);
    expect(outcome.failures).toEqual([]);
  });

  it("does nothing for an empty selection", async () => {
    const outcome = await importPhotos([], options(fakeRepository()));
    expect(outcome).toMatchObject({
      added: [],
      failures: [],
      aborted: false,
      storageError: null,
    });
  });
});
