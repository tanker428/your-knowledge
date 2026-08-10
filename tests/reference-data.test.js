import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
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
  getVerifiedQuizEligibleReferenceGraph,
  getVerifiedQuizEligibleReferenceNodes,
  getVisibleReferenceRoots,
  loadReferenceData,
  referenceNodeDisplayLabel,
} from "../src/domain/reference-registry.js";
import { validateReferenceData } from "../src/domain/reference-validation.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const referenceRoot = path.join(root, "domain/reference/paleontology");


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
    expect(loaded.taxonomy.nodes.length).toBeGreaterThan(0);
    expect(loaded.graph.nodes).toHaveLength(loaded.geologicalTime.nodes.length + loaded.taxonomy.nodes.length);
  });

  it("passes actual Ajv JSON Schema validation", async () => {
    const loaded = await data();
    const ajv = new Ajv2020({ strict: false });
    const timeSchema = JSON.parse(await readFile(`${referenceRoot}/schemas/geological-time.schema.json`, "utf8"));
    const taxonomySchema = JSON.parse(await readFile(`${referenceRoot}/schemas/taxonomy.schema.json`, "utf8"));
    expect(ajv.compile(timeSchema)(loaded.geologicalTime)).toBe(true);
    expect(ajv.compile(taxonomySchema)(loaded.taxonomy)).toBe(true);
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
    expect(getVisibleReferenceRoots(graph, "geological-time").map((node) => node.id)).toEqual([
      "geo:group:precambrian",
      "geo:era:paleozoic",
      "geo:era:mesozoic",
      "geo:era:cenozoic",
    ]);
    expect(getVisibleReferenceRoots(graph, "taxonomy").map((node) => node.id)).toEqual(["taxon:tetrapoda"]);
  });

  it("preserves OCCURS_DURING and only maps IS_A to SUBCLASS_OF", async () => {
    const loaded = await data();
    const graph = loaded.graph;
    expect(graph.edges.filter((edge) => edge.type === "SUBCLASS_OF")).toHaveLength(
      loaded.taxonomy.relations.filter((relation) => relation.type === "IS_A").length,
    );
    expect(graph.edges.filter((edge) => edge.type === "OCCURS_DURING")).toHaveLength(
      loaded.taxonomy.relations.filter((relation) => relation.type === "OCCURS_DURING").length,
    );
    expect(graph.edges.some((edge) => edge.type === "IS_A")).toBe(false);
  });

  it("does not convert an unknown relation type", async () => {
    const loaded = await data();
    const taxonomy = structuredClone(loaded.taxonomy);
    taxonomy.relations.push({
      id: "rel:unknown:test",
      type: "CUSTOM_REFERENCE",
      sourceId: taxonomy.nodes[0].id,
      targetId: taxonomy.nodes[1].id,
    });
    const graph = buildReferenceGraph({ manifest: loaded.manifest, geologicalTime: loaded.geologicalTime, taxonomy });
    expect(graph.edges.find((edge) => edge.id === "rel:unknown:test")?.type).toBe("CUSTOM_REFERENCE");
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
    expect(getReferenceParents(graph, "taxon:mammalia").map((node) => node.id)).toEqual(["taxon:mammals-other"]);
    expect(getReferenceParents(graph, "taxon:eutheria").map((node) => node.id)).toEqual(["taxon:theria"]);
    expect(getReferenceChildren(graph, "taxon:eutheria").map((node) => node.id)).toEqual([
      "taxon:primates",
      "taxon:cetacea",
      "taxon:proboscidea",
    ]);
    expect(getReferenceAncestors(graph, "taxon:cetacea").map((node) => node.id)).toEqual(expect.arrayContaining([
      "taxon:eutheria",
      "taxon:theria",
      "taxon:mammalia",
      "taxon:amniota",
      "taxon:tetrapoda",
    ]));
  });

  it("separates taxonomy and geological-time axes", async () => {
    const graph = (await data()).graph;
    expect(getReferenceGraphByAxis(graph, "taxonomy").nodes.every((node) => node.axis === "taxonomy")).toBe(true);
    expect(getReferenceGraphByAxis(graph, "geological-time").nodes.every((node) => node.axis === "geological-time")).toBe(true);
  });

  it("keeps semantic taxonomy IDs and updates every reference", async () => {
    const loaded = await data();
    expect(loaded.taxonomy.nodes.every((node) => !node.id.startsWith("taxon:drawio:"))).toBe(true);
    expect(loaded.taxonomy.nodes.every((node) => !node.id.startsWith("taxon:label:"))).toBe(true);
    expect(loaded.taxonomy.nodes.every((node) => node.scientificName)).toBe(true);
    expect(getReferenceNodeById(loaded.graph, "taxon:tetrapoda")?.label).toBe("四足類（四肢動物）");
    expect(getReferenceNodeById(loaded.graph, "taxon:theropoda")?.scientificName).toBe("Theropoda");
    expect(getReferenceNodeById(loaded.graph, "taxon:spinosaurus")?.scientificName).toBe("Spinosaurus");
    expect(getReferenceNodeById(loaded.graph, "taxon:tyrannosaurus")?.scientificName).toBe("Tyrannosaurus");
    const curatedMammalNodes = loaded.taxonomy.nodes.filter((node) => node.sourceRef?.name === "NCBI Taxonomy");
    expect(curatedMammalNodes.map((node) => node.id).sort()).toEqual([
      "taxon:cetacea",
      "taxon:eutheria",
      "taxon:mammalia",
      "taxon:metatheria",
      "taxon:primates",
      "taxon:proboscidea",
      "taxon:theria",
    ]);
    expect(curatedMammalNodes.every((node) => node.sourceRef.url.startsWith("https://www.ncbi.nlm.nih.gov/Taxonomy/"))).toBe(true);
    expect(loaded.taxonomy.nodes.filter((node) => !curatedMammalNodes.includes(node)).every((node) => node.sourceRef?.drawioCellId)).toBe(true);
    const graphIds = new Set(loaded.graph.nodes.map((node) => node.id));
    expect(loaded.graph.edges.every((edge) => graphIds.has(edge.sourceId) && graphIds.has(edge.targetId))).toBe(true);
  });

  it("retains quizEligible and selects only verified eligible nodes", async () => {
    const loaded = await data();
    const graph = structuredClone(loaded.graph);
    graph.nodes[0].quizEligible = false;
    const selected = getVerifiedQuizEligibleReferenceGraph(graph);
    expect(selected.nodes.every((node) => node.status === "verified" && node.quizEligible)).toBe(true);
    expect(getVerifiedQuizEligibleReferenceNodes(graph)).toHaveLength(selected.nodes.length);
    expect(graph.nodes.some((node) => node.quizEligible === false)).toBe(true);
  });

  it("extracts verified nodes and preserves deterministic output", async () => {
    const loaded = await data();
    const graph = structuredClone(loaded.graph);
    graph.nodes[0].status = "draft";
    const verified = getVerifiedReferenceGraph(graph);
    expect(verified.nodes).not.toContainEqual(graph.nodes[0]);
    expect(JSON.stringify(buildReferenceGraph(loaded))).toBe(JSON.stringify(buildReferenceGraph(loaded)));
  });

  it("qualifies only duplicate labels inside the same reference axis", async () => {
    const loaded = await data();
    const expected = {
      "geo:epoch:triassic:early": "三畳紀前期",
      "geo:epoch:triassic:middle": "三畳紀中期",
      "geo:epoch:triassic:late": "三畳紀後期",
      "geo:epoch:jurassic:early": "ジュラ紀前期",
      "geo:epoch:jurassic:middle": "ジュラ紀中期",
      "geo:epoch:jurassic:late": "ジュラ紀後期",
      "geo:epoch:cretaceous:early": "白亜紀前期",
      "geo:epoch:cretaceous:late": "白亜紀後期",
    };
    for (const [id, label] of Object.entries(expected)) {
      expect(referenceNodeDisplayLabel(loaded.graph, getReferenceNodeById(loaded.graph, id))).toBe(label);
    }
    expect(referenceNodeDisplayLabel(loaded.graph, getReferenceNodeById(loaded.graph, "geo:epoch:eocene"))).toBe("始新世");
    expect(referenceNodeDisplayLabel(loaded.graph, getReferenceNodeById(loaded.graph, "geo:epoch:paleocene"))).toBe("暁新世");
  });

  it("keeps taxonomy labels unique and displays them byte-for-byte unchanged", async () => {
    const loaded = await data();
    const taxonomyNodes = loaded.graph.nodes.filter((node) => node.axis === "taxonomy");
    expect(new Set(taxonomyNodes.map((node) => node.label)).size).toBe(taxonomyNodes.length);
    expect(taxonomyNodes.map((node) => referenceNodeDisplayLabel(loaded.graph, node))).toEqual(
      taxonomyNodes.map((node) => node.label),
    );
  });

  it("uses multi-level PART_OF qualification and safely falls back when ancestry is exhausted", () => {
    const node = (id, label, axis = "geological-time") => ({ id, label, axis });
    const graph = /** @type {any} */ ({
      nodes: [
        node("a", "前期"), node("b", "前期"), node("a-parent", "区分"), node("b-parent", "区分"),
        node("a-root", "時代A"), node("b-root", "時代B"), node("taxonomy-same", "前期", "taxonomy"),
      ],
      edges: [
        { type: "PART_OF", sourceId: "a", targetId: "a-parent" },
        { type: "PART_OF", sourceId: "b", targetId: "b-parent" },
        { type: "PART_OF", sourceId: "a-parent", targetId: "a-root" },
        { type: "PART_OF", sourceId: "b-parent", targetId: "b-root" },
      ],
      metadata: {},
    });
    expect(referenceNodeDisplayLabel(graph, graph.nodes[0])).toBe("時代A区分前期");
    expect(referenceNodeDisplayLabel(graph, graph.nodes[6])).toBe("前期");

    graph.nodes[5].label = "時代A";
    expect(referenceNodeDisplayLabel(graph, graph.nodes[0])).toBe("前期");
    expect(referenceNodeDisplayLabel(graph, graph.nodes[1])).toBe("前期");
  });
});
