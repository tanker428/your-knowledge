const STATUS_VALUES = new Set(["draft", "verified", "deprecated"]);
const TIME_EDGE_TYPES = new Set(["PART_OF", "PRECEDES"]);
const TAXONOMY_EDGE_TYPES = new Set(["IS_A"]);

/**
 * A deliberately small JSON Schema validator for the local reference-data
 * schemas. It covers the schema keywords used by the checked-in schemas and
 * keeps the browser free of a general-purpose validation dependency.
 *
 * @param {unknown} value
 * @param {any} schema
 * @param {string} path
 * @param {string[]} errors
 */
export function validateJsonSchema(value, schema, path = "$", errors = []) {
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path} は ${JSON.stringify(schema.const)} である必要があります`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path} は許可された値ではありません`);
    return errors;
  }

  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (schema.type && !types.some((type) => matchesType(value, type))) {
    errors.push(`${path} の型が不正です`);
    return errors;
  }
  if (schema.minLength !== undefined && typeof value === "string" && value.length < schema.minLength) {
    errors.push(`${path} は空にできません`);
  }
  if (schema.required && isObject(value)) {
    for (const key of schema.required) {
      if (!(key in value)) errors.push(`${path}.${key} が必要です`);
    }
  }
  if (schema.properties && isObject(value)) {
    for (const [key, childSchema] of Object.entries(schema.properties)) {
      if (key in value)
        validateJsonSchema(value[key], childSchema, `${path}.${key}`, errors);
    }
  }
  if (schema.items && Array.isArray(value)) {
    value.forEach((item, index) =>
      validateJsonSchema(item, schema.items, `${path}[${index}]`, errors),
    );
  }
  return errors;
}

/**
 * Validate both input documents and their cross-document references.
 * @param {{manifest: any, geologicalTime: any, taxonomy: any, schemas?: {geologicalTime?: any, taxonomy?: any}}} input
 * @returns {{ok: true, errors: []}|{ok: false, errors: string[]}}
 */
export function validateReferenceData(input) {
  const errors = [];
  const { manifest, geologicalTime, taxonomy, schemas = {} } = input;
  if (schemas.geologicalTime)
    validateJsonSchema(geologicalTime, schemas.geologicalTime, "geologicalTime", errors);
  if (schemas.taxonomy)
    validateJsonSchema(taxonomy, schemas.taxonomy, "taxonomy", errors);

  validateDocumentShape(geologicalTime, "geologicalTime", errors);
  validateDocumentShape(taxonomy, "taxonomy", errors);
  validateManifest(manifest, errors);

  const timeIds = validateNodes(geologicalTime, "geologicalTime", errors);
  const taxonomyIds = validateNodes(taxonomy, "taxonomy", errors);
  const allIds = new Set();
  for (const id of [...timeIds, ...taxonomyIds]) {
    if (allIds.has(id)) errors.push(`IDが重複しています: ${id}`);
    allIds.add(id);
  }

  validateRelations(geologicalTime, timeIds, TIME_EDGE_TYPES, errors);
  validateRelations(
    taxonomy,
    new Set([...taxonomyIds, ...timeIds]),
    new Set([...TAXONOMY_EDGE_TYPES, "OCCURS_DURING"]),
    errors,
  );
  validateTimeHierarchy(geologicalTime, timeIds, errors);
  validateTaxonomyHierarchy(taxonomy, taxonomyIds, errors);
  validateCrossReferences(taxonomy, timeIds, errors);
  for (const rootId of manifest.displayRootIds || []) {
    if (!allIds.has(rootId)) errors.push(`表示ルートが存在しません: ${rootId}`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, errors: [] };
}

/** @param {any} document @param {string} name @param {string[]} errors */
function validateDocumentShape(document, name, errors) {
  if (!isObject(document)) {
    errors.push(`${name} はオブジェクトである必要があります`);
    return;
  }
  if (!Array.isArray(document.nodes)) errors.push(`${name}.nodes が配列ではありません`);
  if (!Array.isArray(document.relations)) errors.push(`${name}.relations が配列ではありません`);
  if (!isObject(document.meta)) errors.push(`${name}.meta が必要です`);
}

/** @param {any} manifest @param {string[]} errors */
function validateManifest(manifest, errors) {
  if (!isObject(manifest) || !Array.isArray(manifest.displayRootIds))
    errors.push("manifest.displayRootIds が必要です");
  if (manifest?.status && !STATUS_VALUES.has(manifest.status))
    errors.push(`manifest.status が不正です: ${manifest.status}`);
}

/** @param {any} document @param {string} name @param {string[]} errors */
function validateNodes(document, name, errors) {
  const ids = new Set();
  if (!Array.isArray(document?.nodes)) return ids;
  for (const [index, node] of document.nodes.entries()) {
    const path = `${name}.nodes[${index}]`;
    if (!isObject(node) || typeof node.id !== "string" || !node.id) {
      errors.push(`${path}.id が必要です`);
      continue;
    }
    if (ids.has(node.id)) errors.push(`IDが重複しています: ${node.id}`);
    ids.add(node.id);
    if (typeof node.label !== "string" || !node.label)
      errors.push(`${path}.label が必要です`);
    if (!STATUS_VALUES.has(node.status))
      errors.push(`${path}.status が不正です`);
    if (node.axis !== "taxonomy" && node.axis !== "classification" && node.axis !== "geological-time")
      errors.push(`${path}.axis が不正です`);
    if (node.startMa != null && node.endMa != null && node.startMa < node.endMa)
      errors.push(`${node.id} の startMa が endMa より小さいです`);
  }
  return ids;
}

/** @param {any} document @param {Set<string>} nodeIds @param {Set<string>} allowedTypes @param {string[]} errors */
function validateRelations(document, nodeIds, allowedTypes, errors) {
  const relationIds = new Set();
  for (const [index, relation] of (document?.relations || []).entries()) {
    if (!isObject(relation)) {
      errors.push(`relations[${index}] が不正です`);
      continue;
    }
    if (relationIds.has(relation.id)) errors.push(`Relation IDが重複しています: ${relation.id}`);
    relationIds.add(relation.id);
    if (!allowedTypes.has(relation.type)) errors.push(`Relation typeが不正です: ${relation.type}`);
    if (!nodeIds.has(relation.sourceId)) errors.push(`RelationのsourceIdが存在しません: ${relation.sourceId}`);
    if (!nodeIds.has(relation.targetId)) errors.push(`RelationのtargetIdが存在しません: ${relation.targetId}`);
  }
}

/** @param {any} document @param {Set<string>} ids @param {string[]} errors */
function validateTimeHierarchy(document, ids, errors) {
  const nodes = new Map((document?.nodes || []).map((node) => [node.id, node]));
  const siblingOrders = new Map();
  for (const node of document?.nodes || []) {
    if (node.parentId && !ids.has(node.parentId)) errors.push(`時代の親IDが存在しません: ${node.parentId}`);
    if (node.parentId && node.order != null) {
      const key = `${node.parentId}:${node.order}`;
      if (siblingOrders.has(key)) errors.push(`同じ親でorderが重複しています: ${key}`);
      siblingOrders.set(key, node.id);
    }
    const parent = nodes.get(node.parentId);
    if (parent && hasPeriod(node) && hasPeriod(parent)) {
      if (node.startMa > parent.startMa || node.endMa < parent.endMa)
        errors.push(`子の期間が親の期間外です: ${node.id}`);
    }
  }
  assertAcyclic(document?.nodes || [], errors, "時代の階層");
}

/** @param {any} document @param {Set<string>} ids @param {string[]} errors */
function validateTaxonomyHierarchy(document, ids, errors) {
  const siblingOrders = new Map();
  for (const node of document?.nodes || []) {
    const parents = node.parentIds || (node.parentId ? [node.parentId] : []);
    for (const parentId of parents) {
      if (parentId === node.id) errors.push(`分類が自己参照しています: ${node.id}`);
      if (!ids.has(parentId)) errors.push(`分類の親IDが存在しません: ${parentId}`);
      if (node.order != null) {
        const key = `${parentId}:${node.order}`;
        if (siblingOrders.has(key)) errors.push(`分類の同じ親でorderが重複しています: ${key}`);
        siblingOrders.set(key, node.id);
      }
    }
  }
  assertAcyclic(document?.nodes || [], errors, "分類の階層");
}

/** @param {any} taxonomy @param {Set<string>} timeIds @param {string[]} errors */
function validateCrossReferences(taxonomy, timeIds, errors) {
  for (const relation of taxonomy?.relations || []) {
    if (relation.type === "OCCURS_DURING" && !timeIds.has(relation.targetId))
      errors.push(`OCCURS_DURINGの時代IDが存在しません: ${relation.targetId}`);
  }
}

/** @param {any[]} nodes @param {string[]} errors @param {string} label */
function assertAcyclic(nodes, errors, label) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) {
      errors.push(`${label}に循環があります: ${id}`);
      return;
    }
    if (visited.has(id) || !byId.has(id)) return;
    visiting.add(id);
    const node = byId.get(id);
    const parents = node.parentIds || (node.parentId ? [node.parentId] : []);
    parents.forEach(visit);
    visiting.delete(id);
    visited.add(id);
  };
  nodes.forEach((node) => visit(node.id));
}

/** @param {any} node */
function hasPeriod(node) {
  return Number.isFinite(node.startMa) && Number.isFinite(node.endMa);
}

/** @param {unknown} value @returns {value is Record<string, any>} */
function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @param {string} type */
function matchesType(value, type) {
  if (type === "object") return isObject(value);
  if (type === "array") return Array.isArray(value);
  if (type === "string") return typeof value === "string";
  if (type === "number") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  if (type === "null") return value === null;
  return true;
}
