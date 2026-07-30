import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildReferenceGraph,
  getReferenceAncestors,
  getReferenceChildren,
  getReferenceDescendants,
  getReferenceGraphByAxis,
  getReferenceNodeById,
  getReferenceParents,
  getVerifiedReferenceGraph,
  getVisibleReferenceRoots,
  loadReferenceData,
} from "../src/domain/reference-registry.js";
import { validateReferenceData } from "../src/domain/reference-validation.js";


/** @param {URL} url */
const readJson = async (url) =>
  JSON.parse(await readFile(fileURLToPath(url), "utf8"));

async function data() {
  return loadReferenceData(readJson);
}

describe("paleontology reference data", () => {
  it("loads both JSON documents and validates their schemas", async () => {
    const loaded = await data();
    expect(loaded.geologicalTime.nodes.length).toBe(32);
    expect(loaded.taxonomy.nodes.length).toBe(147);
    expect(loaded.graph.nodes.length).toBe(179);
  });

  it("resolves the relative module URL without a site-root assumption", async () => {
    const urls = [];
    await loadReferenceData(async (url) => {
      urls.push(url.toString());
      return readJson(url);
    });
    expect(urls.every((url) => url.startsWith("file:"))).toBe(true);
    expect(urls.some((url) => url.endsWith("/domain/reference/paleontology/manifest.json"))).toBe(true);
  });

  it("detects duplicate IDs", async () => {
    const loaded = await data();
    const geologicalTime = structuredClone(loaded.geologicalTime);
    geologicalTime.nodes.push(structuredClone(geologicalTime.nodes[0]));
    const result = validateReferenceData({
      manifest: loaded.manifest,
      geologicalTime,
      taxonomy: loaded.taxonomy,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((error) => error.includes("IDが重複"))).toBe(true);
  });

  it("detects missing parents and invalid periods", async () => {
    const loaded = await data();
    const geologicalTime = structuredClone(loaded.geologicalTime);
    geologicalTime.nodes.find((node) => node.id === "geo:period:cambrian").parentId = "geo:missing";
    geologicalTime.nodes.find((node) => node.id === "geo:period:ordovician").startMa = 600;
    const result = validateReferenceData({ manifest: loaded.manifest, geologicalTime, taxonomy: loaded.taxonomy });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("親IDが存在しません"))).toBe(true);
      expect(result.errors.some((error) => error.includes("子の期間が親の期間外"))).toBe(true);
    }
  });

  it("detects taxonomy cycles and missing cross-document time references", async () => {
    const loaded = await data();
    const taxonomy = structuredClone(loaded.taxonomy);
    taxonomy.nodes[0].parentId = taxonomy.nodes[1].id;
    taxonomy.nodes[1].parentId = taxonomy.nodes[0].id;
    taxonomy.relations.push({
      id: "rel:occurs:missing",
      type: "OCCURS_DURING",
      sourceId: taxonomy.nodes[0].id,
      targetId: "geo:missing",
    });
    const result = validateReferenceData({ manifest: loaded.manifest, geologicalTime: loaded.geologicalTime, taxonomy });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((error) => error.includes("分類の階層に循環"))).toBe(true);
      expect(result.errors.some((error) => error.includes("OCCURS_DURING"))).toBe(true);
    }
  });

  it("keeps Phanerozoic in storage but omits it from visible roots", async () => {
    const loaded = await data();
    const graph = loaded.graph;
    expect(getReferenceNodeById(graph, "geo:eon:phanerozoic")).not.toBeNull();
    expect(getVisibleReferenceRoots(graph).map((node) => node.id)).toEqual([
      "geo:era:paleozoic",
      "geo:era:mesozoic",
      "geo:era:cenozoic",
    ]);
  });

  it("provides parent, child, ancestor, and descendant selectors", async () => {
    const graph = (await data()).graph;
    expect(getReferenceChildren(graph, "geo:era:paleozoic").map((node) => node.id)).toEqual([
      "geo:period:cambrian",
      "geo:period:ordovician",
      "geo:period:silurian",
      "geo:period:devonian",
      "geo:period:carboniferous",
      "geo:period:permian",
    ]);
    expect(getReferenceParents(graph, "geo:period:triassic").map((node) => node.id)).toEqual(["geo:era:mesozoic"]);
    expect(getReferenceAncestors(graph, "geo:period:triassic").map((node) => node.id)).toContain("geo:eon:phanerozoic");
    expect(getReferenceDescendants(graph, "geo:era:mesozoic").map((node) => node.id)).toContain("geo:period:triassic");
  });

  it("separates taxonomy and geological-time axes", async () => {
    const graph = (await data()).graph;
    expect(getReferenceGraphByAxis(graph, "taxonomy").nodes.every((node) => node.axis === "taxonomy")).toBe(true);
    expect(getReferenceGraphByAxis(graph, "geological-time").nodes.every((node) => node.axis === "geological-time")).toBe(true);
  });

  it("extracts verified nodes and preserves deterministic output", async () => {
    const loaded = await data();
    const graph = structuredClone(loaded.graph);
    graph.nodes[0].status = "draft";
    const verified = getVerifiedReferenceGraph(graph);
    expect(verified.nodes).not.toContainEqual(graph.nodes[0]);
    expect(JSON.stringify(buildReferenceGraph(loaded))).toBe(JSON.stringify(buildReferenceGraph(loaded)));
  });
});
