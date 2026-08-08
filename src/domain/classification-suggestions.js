const normalize = (value) => String(value || "").toLocaleLowerCase();

function tokens(values) {
  return values.flatMap((value) => normalize(value).split(/[\s、。・/()（）]+/).filter(Boolean));
}

export function suggestClassificationIds({ observation, photo, visit, registry }) {
  const context = tokens([
    observation?.label,
    photo?.title,
    photo?.experienceMemo,
    visit?.title,
    visit?.placeName,
    ...(visit?.domainPackIds || []),
    ...(observation?.domainPacks || []),
    ...((photo?.observations || []).map((item) => item.label)),
  ]);
  const generic = (registry?.genericCategories || [])
    .map((item) => ({ item, score: tokens([item.label, item.description]).filter((token) => context.includes(token)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .map(({ item }) => ({ id: item.id, label: item.label, reason: "名称や写真の情報から推定" }));
  const categories = (registry?.categoriesByPack?.[observation?.domainPacks?.[0] || "other"] || [])
    .map((item) => ({ item, score: tokens([item.label, item.labelEn, item.description]).filter((token) => context.includes(token)).length }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.item.id.localeCompare(b.item.id))
    .map(({ item }) => ({ id: item.id, label: item.label, reason: "名称やテーマから推定" }));
  return { generic, domain: categories };
}
