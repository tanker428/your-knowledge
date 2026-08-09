/**
 * Curated demo knowledge layered onto the bundled observations.
 * These records use the same ReferenceFact contract as user data; they are
 * not a second quiz-only graph.
 */
export const DEMO_KNOWLEDGE_VERSION = "2026-08-07.1";

export const DEMO_REFERENCE_FACTS = Object.freeze([
  {
    id: "demo-rf-o07a-eocene",
    subjectId: "o07a",
    targetObservationId: "o07a",
    predicate: "livedDuring",
    valueType: "reference",
    value: "geo:epoch:eocene",
    axis: "geological-time",
    sourceType: "curated",
    sourceNote: "既存デモの大型水生哺乳類展示と説明パネルに基づく初期データ",
    status: "verified",
  },
  {
    id: "demo-rf-o08a-eocene",
    subjectId: "o08a",
    targetObservationId: "o08a",
    predicate: "livedDuring",
    valueType: "reference",
    value: "geo:epoch:eocene",
    axis: "geological-time",
    sourceType: "curated",
    sourceNote: "既存デモのバシロサウルス解説パネルに基づく初期データ",
    status: "verified",
  },
  {
    id: "demo-rf-o08b-eocene",
    subjectId: "o08b",
    targetObservationId: "o08b",
    predicate: "livedDuring",
    valueType: "reference",
    value: "geo:epoch:eocene",
    axis: "geological-time",
    sourceType: "curated",
    sourceNote: "既存デモの分類・時代・産地の記載に基づく初期データ",
    status: "verified",
  },
  {
    id: "demo-rf-o17a-mesozoic",
    subjectId: "o17a",
    targetObservationId: "o17a",
    predicate: "occursDuring",
    valueType: "reference",
    value: "geo:era:mesozoic",
    axis: "geological-time",
    sourceType: "curated",
    sourceNote: "既存デモの「中生代の森林復元模型」という名称に基づく初期データ",
    status: "verified",
  },
  {
    id: "demo-rf-o17b-mesozoic",
    subjectId: "o17b",
    targetObservationId: "o17b",
    predicate: "occursDuring",
    valueType: "reference",
    value: "geo:era:mesozoic",
    axis: "geological-time",
    sourceType: "curated",
    sourceNote: "既存デモの「恐竜時代の森」の説明パネルに基づく初期データ",
    status: "verified",
  },
  {
    id: "demo-rf-o17c-mesozoic",
    subjectId: "o17c",
    targetObservationId: "o17c",
    predicate: "occursDuring",
    valueType: "reference",
    value: "geo:era:mesozoic",
    axis: "geological-time",
    sourceType: "curated",
    sourceNote: "既存デモの地質時代の縦軸に基づく初期データ",
    status: "verified",
  },
]);

