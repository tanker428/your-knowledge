# 3D知識空間設計

## 目的

既存の保存データ、2D知識マップ、Visit単位KnowledgeGraph、クイズ、IndexedDB、JSON入出力を壊さずに、3D知識空間を段階的に追加する。

3D表示は保存用KnowledgeGraphを置き換えない。保存データと参照データから表示用の `VisualizationGraphV1` を導出し、Layout Engineで座標を作り、Three.js rendererへ渡す。

```text
現在の保存データ
+ ReferenceGraph
+ ReferenceFact
        ↓
Visualization Adapter
        ↓
VisualizationGraphV1
        ↓
Layout Engine
        ↓
Web 3D
```

## 非目標

- 既存2D知識マップの削除
- Visit単位KnowledgeGraph Builderの置き換え
- 3D座標、クラスタ、カメラ状態の永続保存
- 初期MVPでの永続Conceptノード導入
- Unity / WebXR / 外部DB強制移行
- AIによるRelation生成
- 構造化された感情入力

## 段階

### Phase 0: 設計と検証前提

- `DATA_MODEL.md`、`ARCHITECTURE.md`、Three.js ADRを更新する
- `ReferenceFact.valueType: "reference"` のJSON検証をReferenceGraph参照へ対応する

### Phase 1: 保存形式を変えない3D基盤

- `VisualizationGraphV1` をJSDocで定義する
- fixtureを用意する
- Concept Resolverはprojection-onlyとして実装する
- ConceptはProject JSONへ保存しない

### Phase 2: fixtureで3D表示

- Home / Relation layoutとSize layoutを純粋関数として実装する
- Three.js rendererを遅延読み込みで追加する
- WebGL fallback、dispose、GitHub Pagesサブパス、PR previewを確認する

### Phase 3: 既存データ接続

- allVisits / activeVisitを切り替える3D専用Adapterを追加する
- unresolved / 未設定エリアを表示する
- 既存2D、クイズ、JSON入出力の回帰を確認する

### Phase 4: 永続Conceptの再評価

projection-only Conceptで実データを確認してから、永続Conceptノードとlazy migrationを別Issueで設計・実装する。

## ReferenceNodeの写像

```text
taxonomy ReferenceNode
→ canonical Concept

geological-time ReferenceNode
→ time landmark / time interval

その他のReferenceNode
→ axisごとに明示的に決定
```

地質時代をtaxonomy Conceptと同じ種類へ入れない。

## projection-only Concept

短期MVPではConceptを `VisualizationGraphV1` 内の表示用ノードとして扱う。

```text
1. taxonomy ReferenceNode
   → canonical Concept

2. DomainCategory
   → domain-fallback cluster / concept-placeholder

3. EntityまたはObservationから生成する一時Concept
   → provisional Concept

4. 参照IDが存在しない、または解決不能
   → unresolved
```

同一Observation / axisでcanonical Conceptが立つ場合、DomainCategory fallbackは出さない。DomainCategory fallbackのIDは `domain:<packId>:<categoryId>` とする。

`provisional` はEntityやObservationから決定的に生成できる暫定ノード、`unresolved` は参照IDが存在しない、または解決できない状態を表す。

## projection edge

MVPではtyped derived edgeを使う。ReferenceFact predicateが明示される場合だけ次へ変換する。

```text
represents    → REPRESENTS
depicts       → DEPICTS
specimenOf    → SPECIMEN_OF
instanceOf    → INSTANCE_OF
classifiedAs  → CLASSIFIED_AS
```

genericCategoryやobservationType由来の関係は `derived: true`、`verificationStatus: "suggested"` を付ける。明示根拠がない `INSTANCE_OF` は生成しない。

## VisualizationGraphV1

JSDocで定義し、TypeScriptへは移行しない。

```text
VisualizationNode.kind:
experience | entity | concept | landmark | cluster

VisualizationNode.semanticLayer:
experience | referent | conceptual

VisualizationNode.mappingStatus:
canonical | domain-fallback | provisional | unresolved
```

元データへ戻れるよう、少なくとも次を保持する。

```text
sourceNodeIds
observationIds
entityIds
visitIds
domainIds
referenceIds
```

`VisualizationGraphV1` は表示・レイアウトのための中間形式であり、Project JSONやVisit単位KnowledgeGraphを置き換えない。

## Layout Engine

Layout EngineはThree.jsに依存しない純粋関数にする。

Y軸の意味は全モードで固定する。

```text
experience = 0
referent = 1
conceptual = 2
```

乱数を使う場合はnode ID由来のseedを使う。confirmed / verified関係を通常表示の対象とし、suggested / derived関係は見た目を分けられる属性を残す。

## Size mode

初期対応は `body_length` の1種類に限定する。長さ、重量、面積を同じ軸へ混在させない。

一般的なtaxonの体長はObservationへ重複保存せず、ReferenceNode / canonical Conceptへ対応させる。

```text
subjectReferenceId: "taxon:..."
```

値はSIへ正規化し、固定対数尺度を使う。

```text
axisValue = log10(valueSI / 1m)
x = axisValue * scale
```

範囲値は正の値だけを対象に幾何平均を代表点として使う。

```text
representativeValue = sqrt(minSI * maxSI)
```

値がない、0以下、単位変換不能、異なる `quantityKind` の場合は未設定エリアへ置く。

## Three.js renderer

Three.jsは固定バージョンのvendored ESMとして導入し、ライセンスを保持する。初期shell precacheへ入れず、3D画面を開く時だけ遅延読み込みする。

オフライン方針はcache-on-first-useとする。初回3D表示時に取得し、取得後に再利用できるようにする。初回オフライン時は2D fallbackを表示する。

Renderer、Geometry、Material、Texture、AnimationFrame、イベントリスナは3D画面終了時に破棄する。

