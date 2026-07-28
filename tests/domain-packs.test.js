import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLookups } from "../src/domain/registry.js";
import {
  SAMPLE_OBSERVATIONS,
  SAMPLE_PHOTOS,
} from "../src/data/demo/sample-data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (/** @type {string} */ p) =>
  JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

const core = readJson("domain/core/vocabulary.json");
const index = readJson("domain/packs/index.json");
const packs = index.packs.map((/** @type {any} */ entry) =>
  readJson(`domain/packs/${entry.file}`),
);

/** @type {import('../src/domain/registry.js').DomainRegistry} */
const registry = {
  genericCategories: core.genericCategories,
  learningRoles: core.learningRoles,
  relationTypes: core.relationTypes,
  packs,
  categoriesByPack: Object.fromEntries(
    packs.map((/** @type {any} */ pack) => [pack.id, pack.categories]),
  ),
  visitTemplates: [],
};

describe("domain configuration files", () => {
  it("lists every pack file in index.json and every file exists", () => {
    expect(index.packs.length).toBeGreaterThan(0);
    for (const entry of index.packs) {
      expect(fs.existsSync(path.join(root, "domain/packs", entry.file))).toBe(
        true,
      );
    }
  });

  it("covers the four fields the product promises, plus a fallback", () => {
    const ids = packs.map((/** @type {any} */ pack) => pack.id).sort();
    expect(ids).toEqual([
      "cultural",
      "history",
      "nature",
      "other",
      "paleontology",
    ]);
  });

  it("keeps each pack id consistent between the file and the index", () => {
    for (const [i, entry] of index.packs.entries()) {
      expect(packs[i].id).toBe(entry.id);
    }
  });

  it("uses unique category ids within each pack", () => {
    for (const pack of packs) {
      const ids = pack.categories.map((/** @type {any} */ c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("gives every term a label", () => {
    for (const pack of packs) {
      for (const category of pack.categories) {
        expect(typeof category.label).toBe("string");
        expect(category.label.length).toBeGreaterThan(0);
      }
    }
  });

  it("declares directed state for every relation type", () => {
    expect(core.relationTypes).toHaveLength(9);
    expect(core.relationTypes.filter((term) => term.directed).map((term) => term.id)).toEqual([
      "explains",
      "part-of",
    ]);
    expect(core.relationTypes.filter((term) => !term.directed)).toHaveLength(7);
  });

  it("keeps the generic vocabulary free of any field-specific term", () => {
    // The whole point of the split: nothing dinosaur-shaped may live in core.
    const coreIds = [
      ...core.genericCategories,
      ...core.learningRoles,
      ...core.relationTypes,
    ].map((/** @type {any} */ term) => term.id);
    const packIds = new Set(
      packs.flatMap((/** @type {any} */ pack) =>
        pack.categories.map((/** @type {any} */ c) => c.id),
      ),
    );
    for (const id of coreIds) expect(packIds.has(id)).toBe(false);
  });

  it("offers the generic categories the spec lists", () => {
    const ids = core.genericCategories.map((/** @type {any} */ c) => c.id);
    for (const required of [
      "exhibit-object",
      "replica-model",
      "explanation-panel",
      "diagram-map",
      "place-landscape",
      "living-natural",
      "person-activity",
      "media-image",
      "unknown",
    ]) {
      expect(ids).toContain(required);
    }
  });
});

describe("demo data against the domain configuration", () => {
  it("references only pack ids that exist", () => {
    const known = new Set(packs.map((/** @type {any} */ pack) => pack.id));
    for (const observation of SAMPLE_OBSERVATIONS) {
      for (const packId of observation.domainPacks || [])
        expect(known.has(packId)).toBe(true);
    }
  });

  it("references only generic categories that exist", () => {
    const known = new Set(
      core.genericCategories.map((/** @type {any} */ c) => c.id),
    );
    for (const observation of SAMPLE_OBSERVATIONS) {
      for (const id of observation.genericCategories || [])
        expect(known.has(id)).toBe(true);
    }
  });

  it("references only domain categories declared by the pack it names", () => {
    for (const observation of SAMPLE_OBSERVATIONS) {
      const allowed = new Set(
        (observation.domainPacks || []).flatMap(
          (/** @type {string} */ packId) =>
            registry.categoriesByPack[packId]?.map((c) => c.id) ?? [],
        ),
      );
      for (const id of observation.domainCategories || [])
        expect(allowed.has(id)).toBe(true);
    }
  });

  it("keeps Photo and Observation as separate records", () => {
    // A photo holds many observations; an observation is never a photo.
    expect(SAMPLE_PHOTOS.length).toBe(20);
    expect(SAMPLE_OBSERVATIONS.length).toBeGreaterThan(SAMPLE_PHOTOS.length);
    expect(SAMPLE_PHOTOS.some((photo) => photo.observations.length > 1)).toBe(
      true,
    );
  });
});

describe("buildLookups", () => {
  const lookups = buildLookups(registry);

  it("resolves labels across core and packs", () => {
    expect(lookups.genericLabel("explanation-panel")).toBe(
      "説明パネル・ラベル",
    );
    expect(lookups.packLabel("paleontology")).toBe("自然史・古生物");
    expect(lookups.packCategoryLabel("paleontology", "skeleton")).toBe(
      "骨格標本",
    );
    expect(lookups.relationLabel("explains")).toBe("説明している");
  });

  it('falls back to the raw id rather than rendering "undefined"', () => {
    expect(lookups.genericLabel("nope")).toBe("nope");
    expect(lookups.packCategoryLabel("nope", "also-nope")).toBe("also-nope");
  });

  it("keeps identical category ids in different packs apart", () => {
    // Both paleontology and nature declare "plant".
    expect(lookups.packCategoryLabel("paleontology", "plant")).toBe("植物");
    expect(lookups.packCategoryLabel("nature", "plant")).toBe("草本・植物");
  });
});
