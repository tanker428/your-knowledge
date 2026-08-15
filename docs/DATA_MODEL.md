# データモデル

## 中心にある区別

写真と知識対象を同一視しない。この区別がアプリ全体の前提になっている。

```
1枚の写真  ≠  1件の知識
```

博物館で撮った1枚には、展示物・説明パネル・系統図・展示空間が同時に写っている。
それぞれを別の **Observation** として保存する。

```
Photo (43085_0.jpg)
 ├─ Observation「複数の頭骨標本」      展示物・現物 / 骨格標本
 ├─ Observation「中央の全身骨格」      展示物・現物 / 骨格標本
 ├─ Observation「右側の説明パネル」    説明パネル・ラベル
 ├─ Observation「脳容量のグラフ」      図表・地図
 └─ Observation「展示室全体」          場所・景観
```

## レコード

| レコード | 役割 |
|---------|------|
| `Visit` | 訪問（恐竜博物館、故宮、屋久島…） |
| `Photo` | 撮った写真。知識ではなく入口 |
| `Observation` | 写真の中で観察した対象 |
| `ObservationRelation` | Observation 同士の関係 |
| `Entity` | 具体的な実体（ティラノサウルス等）。**任意** |
| `LearningFact` | 旧方針の知識レコード。現行MVPの保存用KGには含めない |
| `Collection` | 発見→整理→分類→関係付け→学習 の進み |
| `Question` | 問題 |

## Photo

```js
{
  id: 'p01',
  visitId: 'visit-fukui',
  file: '43083_0.jpg',
  order: 1,
  title: '脊椎動物の系統展示',
  status: 'unorganized' | 'in-progress' | 'organized',
  source: 'sample' | 'upload',
  domainHint: 'paleontology',
  observations: [ /* 0件以上 */ ],
  photoMissing: false   // JSON だけ読み込んで写真本体が無いとき true
}
```

写真の追加時に年代・大きさ・産地・詳細分類を要求しない。要求するのは写真だけ。

## Observation

```js
{
  id: 'o01a',
  photoId: 'p01',
  label: '爬虫類・鳥類・哺乳類の系統図',
  observationType: 'physical' | 'information' | 'space' | 'concept' | 'feature',
  region: { x: 5, y: 6, w: 83, h: 84 } | null,   // 写真内の位置（%）
  genericCategories: ['diagram-map'],            // 汎用分類（全分野共通）
  learningRoles: ['comparison', 'context'],
  domainPacks: ['paleontology'],                 // 分野
  domainCategories: ['phylogeny', 'evolution'],  // 分野別の浅い分類
  entityId: null,          // ← 具体名が不明なら null のまま保存できる
  confidence: 0.94,
  status: 'suggested' | 'confirmed' | 'rejected',
  included: true,
  origin: 'ai' | 'user'    // AIの候補か、自分で追加したか
}
```

### 守っているルール

| ルール | 実装 |
|-------|------|
| 1枚のPhotoは複数のObservationを持てる | `Photo.observations[]` |
| PhotoとObservationを同一視しない | 別レコード。JSON出力時も別配列 |
| Observationと具体的なEntityを同一視しない | `entityId` は任意の参照 |
| 具体名が不明でも保存できる | `entityId: null` のまま `status: 'confirmed'` になれる |
| 写真入力時に詳細を要求しない | 追加時は `observations: []` の未整理 |
| AI推定とユーザー確認を区別する | `status` と `origin` と `confidence` |

## 分類の2段階

```
① 汎用分類 ── 全分野共通。domain/core/vocabulary.json
     展示物・現物 / 模型・複製・復元 / 説明パネル・ラベル / 図表・地図 /
     場所・景観 / 生物・自然物 / 人物・活動 / 映像・画像 / 未判定
                    ↓
② 分野別分類 ── 分野ごと。domain/packs/<pack>.json
     自然史・古生物 → 骨格標本 / 化石・標本 / 系統図 / 翼竜 …
     美術・文化財   → 絵画 / 書 / 陶磁器 / 青銅器 / 玉器 …
     自然・生態     → 樹木 / コケ・シダ / 森林 / 登山道 …
     歴史・考古     → 古文書 / 地図 / 武具 / 年表 …
```

②は①のあとに適用する。年代・寸法のような細かい知識は、現行MVPでは
`ReferenceFact`として確認済み参照知識へ分離する。

## LearningFact（旧方針）

```js
{
  id: 'f1',
  targetId: 'o07a',        // どのObservationの知識か
  label: '…',
  sourceType: 'panel' | 'learning' | 'external' | 'user',
  status: 'locked' | 'learned'
}
```

この形式は旧方針であり、現行MVPでは新規の保存用KGノードとして扱わない。既存データを
ReferenceFactや学習済み状態へ自動変換もしない。

## 保存先

## Reference DataとReferenceGraph

分類・時代の参照構造は、`domain/reference/paleontology/`に保存する。Draw.ioは人間による
分類階層・時系列のレビュー資料であり、保存用KGや実行時データの正本ではない。レビュー後に
stable ID付きJSONへ変換し、`manifest.json`でDraw.io版とJSON版の対応を記録する。

```text
ReferenceGraph
 ├─ ReferenceNode（taxonomy / geological-time）
 └─ ReferenceEdge（SUBCLASS_OF / PART_OF / PRECEDES、および入力固有Relation）
```

`ReferenceGraph`は分類・時代そのものの参照構造である。一方、`ReferenceFact`はEntityと
分類・時代などを結ぶ、クイズの正解根拠となる確認済み知識であり、両者は同じデータとして
重複保存しない。`IS_A`だけを`SUBCLASS_OF`へ正規化し、`OCCURS_DURING`などの他のRelationは
意味を変えずに保持する。参照ノードは`sourceType`、`status`、`quizEligible`を持ち、verifiedかつ
quizEligible=trueだけを問題候補へ取得できる。
顕生代は親ノードとして保存するが、通常の表示ルートには出さない。

## 保存用KnowledgeGraph

保存用KGは既存Projectから`activeVisit`単位で決定的に生成する。現在のMVPのルートは次の
構造で、旧`LearningFact`・`KnowledgeFact`・`LearningGap`は含めない。

```text
KnowledgeGraph
 ├─ User ─HAS_VISIT→ Visit ─HAS_PHOTO→ Photo ─HAS_OBSERVATION→ Observation
 ├─ Observation ─HAS_CLASSIFICATION→ ClassificationAssertion ─CLASSIFIES_AS→ Category
 ├─ Observation ─HAS_ROLE→ LearningRole
 ├─ Observation ─RELATES_TO→ Observation
 ├─ Observation ─REFERS_TO→ Entity
 ├─ Entity/Observation ─HAS_REFERENCE_FACT→ ReferenceFact
 └─ QuestionSeed ─REFERENCES/TARGETS→ graph nodes
```

`KnowledgeGraph`は`schemaVersion`、`visitId`、`nodes`、`edges`、`metadata`を持つ。Relationは
方向、種別、status、origin、confidenceをedgeへ保持し、分類AssertionのIDとQuestionSeedの
IDは入力IDから生成する。activeVisit外のPhoto・Observation・Relationは除外し、同一Entityは
一度だけノード化する。`project.facts`をReferenceFactへ自動変換せず、ReferenceGraph全体も
Visitごとに複製しない。グラフはJSON.stringify/parse可能で、表示用の座標やUI状態を保存しない。

ReferenceGraph（分類・時代の参照構造）とReferenceFact（EntityやObservationに接続する確認済み
知識）は別の層である。ReferenceGraphのstable IDを必要な参照接続から利用し、参照構造そのものを
保存用KGへ重複保存しない。

## 3D表示用ConceptとVisualizationGraph

3D表示は保存用KnowledgeGraphを置き換えない。保存データ、ReferenceGraph、ReferenceFactから
表示用の`VisualizationGraphV1`を導出し、Layout Engineで座標を作る。3D座標、クラスタ、
カメラ状態は保存用KGへ固定保存しない。

短期MVPではConceptはprojection-onlyであり、Project JSONへ保存しない。最終的な永続Concept
ノードは後続で設計する。

```text
taxonomy ReferenceNode      → canonical Concept
geological-time ReferenceNode → time landmark / time interval
DomainCategory              → domain-fallback cluster / concept-placeholder
Entity / Observation         → provisional Concept
解決不能な参照              → unresolved
```

`observationType: "concept"`はObservationの種別であり、3D表示用Concept層とは別物として扱う。
EntityをそのままConceptとして扱わず、ラベル一致だけでConceptを統合しない。

同一Observation / axisでcanonical Conceptが立つ場合、DomainCategory fallbackは出さない。

ReferenceFactの明示predicateがある場合だけ、projection edgeを次のように型付けする。

```text
represents    → REPRESENTS
depicts       → DEPICTS
specimenOf    → SPECIMEN_OF
instanceOf    → INSTANCE_OF
classifiedAs  → CLASSIFIED_AS
```

genericCategoryやobservationTypeから導出する場合は`derived: true`、
`verificationStatus: "suggested"`を付ける。明示根拠がない`INSTANCE_OF`は生成しない。

Size modeの初期数量は`body_length`だけを扱う。一般的なtaxonの体長はObservationへ重複保存せず、
ReferenceFactで`subjectReferenceId: "taxon:..."`を使う。長さ、重量、面積は同じ軸へ混在させない。

| データ | 保存先 |
|-------|-------|
| Photo メタ・Observation・関係・学習状態・クイズ結果 | IndexedDB `projects` |
| 写真の Blob と サムネイル | IndexedDB `photoBinaries` |
| サンプル20枚の画像 | `assets/*.jpg`（リポジトリ同梱） |
| 分類語彙 | `domain/**/*.json`（リポジトリ同梱） |

**ユーザーの写真は端末から出ない。** 外部送信も、リポジトリへの保存も、
ビルド成果物への同梱もしない。

## JSON 入出力

```json
{
  "format": "your-knowledge-project",
  "schemaVersion": "2.0.0",
  "exportedAt": "2026-07-28T03:00:00.000Z",
  "project": { "id": "default", "activeVisitId": "visit-001", "visits": [ … ], "photoStorage": "indexeddb" },
  "photos": [ { "id": "p01", "title": "…", "status": "organized", … } ],
  "observations": [ { "id": "o01a", "photoId": "p01", … } ],
  "relations": [ … ],
  "entities": [ … ],
  "referenceFacts": [ … ],
  "quizResults": [ … ],
  "learningEvents": [ … ],
  "userKnowledgeStates": [ … ],
  "referenceDataVersion": "paleontology-1"
}
```

v2では`ReferenceFact`、`LearningEvent`、`UserKnowledgeState`を保存する。コレクション進捗、
表示用Knowledge Graph、画面座標・選択状態・展開状態は保存せず、Projectから導出する。
旧`LearningFact`相当のデータは`legacyFacts`へ隔離して保持し、ReferenceFactや学習済み状態へ
自動変換しない。

- **写真のバイナリは入れない。** Base64にすると数百MBの読めないファイルになる。
  JSONが持つのは写真のIDとメタデータだけで、実体はIndexedDBに残る。
- 読み込み時に写真が見つからない場合、そのPhotoは `photoMissing: true` として
  「写真未接続」で表示する。壊れた画像は出さない。
- `schemaVersion` のメジャーが未対応なら、無理に読まずに理由を表示して中止する。
- 読み込みは**すべて検証してから**適用する。壊れたJSONで既存データが消えることはない。
- 読み込み前に現在のデータを自動で書き出し、控えを残す。
