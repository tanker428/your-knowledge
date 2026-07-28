/**
 * Loads the classification vocabulary at runtime.
 *
 * Two levels, and the split matters:
 *  - `domain/core/vocabulary.json` — generic categories, learning roles, relation
 *    types. Shared by every field, referenced freely by shared UI.
 *  - `domain/packs/<id>.json` — field-specific shallow classification. Shared UI
 *    must never name one of these ids; it only ever renders whatever the packs
 *    happen to contain. Adding 故宮 or 屋久島 support means adding a JSON file.
 *
 * URLs are resolved against this module's own location, so the app works
 * unchanged at `/`, at `/your-knowledge/`, or at any other sub-path.
 */

/**
 * @typedef {{id: string, label: string, icon?: string, description?: string}} Term
 * @typedef {object} DomainPack
 * @property {string} id
 * @property {string} label
 * @property {string} icon
 * @property {string} description
 * @property {{title: string, description: string, icon: string}|null} visitTemplate
 * @property {Term[]} categories
 *
 * @typedef {object} DomainRegistry
 * @property {Term[]} genericCategories
 * @property {Term[]} learningRoles
 * @property {Term[]} relationTypes
 * @property {DomainPack[]} packs
 * @property {Record<string, Term[]>} categoriesByPack
 * @property {Array<Term & {title: string, description: string}>} visitTemplates
 */

const CORE_URL = new URL("../../domain/core/vocabulary.json", import.meta.url);
const PACK_INDEX_URL = new URL(
  "../../domain/packs/index.json",
  import.meta.url,
);

/**
 * @param {URL|string} url
 * @returns {Promise<any>}
 */
async function loadJson(url) {
  const response = await fetch(url.toString(), { cache: "no-cache" });
  if (!response.ok)
    throw new Error(`${url} を読み込めませんでした (${response.status})`);
  return await response.json();
}

/**
 * @returns {Promise<DomainRegistry>}
 */
export async function loadDomainRegistry() {
  const [core, index] = await Promise.all([
    loadJson(CORE_URL),
    loadJson(PACK_INDEX_URL),
  ]);

  const packs = await Promise.all(
    (index.packs || []).map(
      /** @param {{file: string}} entry */
      (entry) => loadJson(new URL(entry.file, PACK_INDEX_URL)),
    ),
  );

  /** @type {Record<string, Term[]>} */
  const categoriesByPack = {};
  /** @type {Array<Term & {title: string, description: string}>} */
  const visitTemplates = [];

  for (const pack of packs) {
    categoriesByPack[pack.id] = pack.categories || [];
    if (pack.visitTemplate) {
      visitTemplates.push({
        id: pack.id,
        label: pack.label,
        icon: pack.visitTemplate.icon,
        title: pack.visitTemplate.title,
        description: pack.visitTemplate.description,
      });
    }
  }

  return {
    genericCategories: core.genericCategories || [],
    learningRoles: core.learningRoles || [],
    relationTypes: core.relationTypes || [],
    packs,
    categoriesByPack,
    visitTemplates,
  };
}

/**
 * Build the id → term lookups the UI renders labels from.
 * @param {DomainRegistry} registry
 */
export function buildLookups(registry) {
  const genericMap = new Map(
    registry.genericCategories.map((item) => [item.id, item]),
  );
  const relationMap = new Map(
    registry.relationTypes.map((item) => [item.id, item]),
  );
  const packMap = new Map(registry.packs.map((item) => [item.id, item]));
  /** @type {Record<string, Map<string, Term>>} */
  const packCategoryMaps = {};
  for (const [packId, categories] of Object.entries(
    registry.categoriesByPack,
  )) {
    packCategoryMaps[packId] = new Map(
      categories.map((item) => [item.id, item]),
    );
  }

  return {
    genericLabel: (/** @type {string} */ id) => genericMap.get(id)?.label || id,
    relationLabel: (/** @type {string} */ id) =>
      relationMap.get(id)?.label || id,
    packLabel: (/** @type {string} */ id) => packMap.get(id)?.label || id,
    packCategoryLabel: (
      /** @type {string} */ packId,
      /** @type {string} */ categoryId,
    ) => packCategoryMaps[packId]?.get(categoryId)?.label || categoryId,
  };
}
