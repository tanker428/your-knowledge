# アーキテクチャ

## 全体方針

**ビルドツールを使わない静的サイト。** バンドラもトランスパイラも無く、ブラウザが
`<script type="module">` でそのまま読む。この選択の理由は一つで、**すべてのパスが相対
パスであれば GitHub Pages のサブパス配信が自動的に解決される**ため。

```
https://tanker428.github.io/your-knowledge/
                            ^^^^^^^^^^^^^^ ここが増えても何も壊れない
```

`npm run build` は「変換」ではなく「検証してから `dist/` へ集める」処理である
（→ [GITHUB_PAGES.md](GITHUB_PAGES.md)）。

## レイヤ

```
index.html
   └─ src/main.js                    唯一の合成点（DI）
        ├─ domain/registry.js        分類語彙の読み込み
        ├─ repositories/…            保存
        ├─ services/analysis/…       解析（今回はデモ実装のみ）
        ├─ features/…                機能単位のロジック
        └─ ui/app.js                 描画とイベント
```

UI は具体的な保存先も解析バックエンドも知らない。`main.js` が実装を注入する。

```js
await initApp({
  repository: new IndexedDbKnowledgeRepository(),
  analysisProvider: new DemoAnalysisProvider(),
  registry, lookups, storageStatus, serviceWorker
});
```

## 差し替え点

### 0. Reference Data — 参照構造

`domain/reference/paleontology/`には、Draw.ioでレビューした分類・地質時代をstable ID付き
JSONへ変換したデータを置く。Draw.ioはレビュー資料であり、アプリ実行時の正本はJSONである。
`src/domain/reference-registry.js`が`import.meta.url`基準でmanifestとJSONを読み込み、
`ReferenceGraph`へ正規化する。ReferenceGraphは分類・時代の参照構造で、Entityと参照知識を
結ぶReferenceFactとは別レイヤーである。

参照データは`sourceType`と`status`を持ち、verifiedノードだけを利用対象にできる。顕生代は
内部ノードとして保持するが、通常の表示ルートからは除外し、古生代・中生代・新生代を表示する。

### 0.1 ReferenceGraphのselector

loaderは保存用KG全体やUIを変更せず、次の純粋なselectorを提供する。

- ノードIDによる取得、親・子・祖先・子孫の取得
- verifiedノードだけのグラフ
- 表示可能なルート
- taxonomy軸とgeological-time軸の切り替え

入力JSONは破壊的に変更せず、同じ入力から決定的に同じグラフを生成する。

### 1. KnowledgeRepository — 保存先

`src/repositories/knowledge-repository.js` が形だけを宣言し、
`src/repositories/indexed-db/` が今回の実装を持つ。

```
KnowledgeRepository
 ├─ IndexedDbKnowledgeRepository   ← 現在の唯一の実装
 └─ ApiKnowledgeRepository         ← 将来（Neo4j / サーバ）
```

将来 Neo4j へ移す場合の作業は次の2点だけで、UI には一切触らない。

1. `ApiKnowledgeRepository` を書く（`loadProject` / `saveProject` / `exportProject` ほか）
2. `src/main.js` の1行を差し替える

> **ブラウザから Neo4j へ直接つなぐコードを追加してはならない。** bolt の接続情報は
> 資格情報であり、ブラウザに置いた時点で公開される。必ずサーバを挟む。
> `npm run build` は `bolt://` / `neo4j://` の記述を検出してビルドを失敗させる。

### 2. AnalysisProvider — AI解析

`src/services/analysis/analysis-provider.js` が形を、
`demo-analysis-provider.js` が今回の実装を持つ。

```
AnalysisProvider
 ├─ DemoAnalysisProvider   ← 現在の唯一の実装。常に「未接続」を返す
 └─ ApiAnalysisProvider    ← 将来
```

`DemoAnalysisProvider.analyze()` は必ず `{status:'not-connected', observations: []}`
を返す。**解析していない写真を「AI解析済み」と表示しないため**で、これは仕様上の要求。
同梱20枚の候補データは `src/data/demo/sample-data.js` にあらかじめ入っている解析結果で、
ユーザーが追加した写真には適用されない。

将来 API を足すときの構成は次の通り。APIキーはサーバだけが持つ。

```
ブラウザ ──POST(画像)──▶ 自分のサーバ ──APIキー──▶ AIサービス
                          ここだけがキーを知っている
```

## Photo と Observation

```
Visit
 └─ Photo                     写真そのもの。知識ではない
     └─ Observation[]         写真の中で観察した対象。1枚から複数
          ├─ genericCategories[]   汎用分類（全分野共通）
          ├─ domainPacks[] / domainCategories[]  分野別分類
          ├─ entityId              具体名。不明なら null のまま保存できる
          └─ origin                'ai'（候補）か 'user'（自分で追加）か
ObservationRelation            Observation 同士の関係。Photo からは独立
LearningFact                   あとから学ぶ知識。入力時には要求しない
```

詳細は [DATA_MODEL.md](DATA_MODEL.md)。

## 分野別分類の分離

恐竜固有の語彙を共通コードへ書かないため、分類語彙は JSON に外出しされている。

```
domain/core/vocabulary.json   汎用分類・学習役割・関係種別（全分野共通）
domain/packs/index.json       パック一覧
domain/packs/paleontology.json  自然史・古生物
domain/packs/cultural.json      美術・文化財
domain/packs/nature.json        自然・生態
domain/packs/history.json       歴史・考古
domain/packs/other.json         その他
```

`src/domain/registry.js` が起動時に fetch し、UI はその中身をそのまま描画する。
**共有UIに `paleontology` などのIDを直接書いてはならない。** 故宮や屋久島に対応する
作業は、JSONを1枚足して `index.json` に追記するだけで完了する。

`tests/domain-packs.test.js` が、汎用語彙に分野固有の語が混ざっていないこと、および
サンプルデータが存在しないIDを参照していないことを検証している。

## 保存の分割

```
IndexedDB "your-knowledge"
 ├─ projects        1レコード。写真メタ・Observation・関係・学習状態・クイズ結果
 └─ photoBinaries   写真1枚につき1レコード。display Blob と thumbnail Blob
```

分けている理由は、ラベルを1つ触るたびに数MBの画像を書き直さないため、および
JSON書き出しが画像に触れずに済むため。

## 起動順序

```
1. domain/ の設定JSONを読む
2. 永続ストレージを要求する（navigator.storage.persist）
3. IndexedDB からプロジェクトを読み、サンプルの上に重ねる
4. UI を描画する
5. Service Worker を登録する   ← 最後
```

5 が最後である理由：Service Worker が起動途中で `clients.claim()` を呼ぶと、読み込み中
の設定JSONの fetch が中断される（実際に発生し、修正した）。
