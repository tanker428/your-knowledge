# Your Knowledge

自分が撮った体験写真から、写っている複数の対象を整理し、触れた知識を可視化して、
問題とコレクションへ育てる Web アプリ。

対象は恐竜博物館に限らない。故宮博物院、屋久島、歴史資料館など、分野を足せば同じ手順で使える。

```
写真を撮る → 複数の観察対象に分ける → 汎用分類 → 分野別分類 → 対象同士の関係
                                                      ↓
                                    知識マップ ← あとから詳しく学ぶ
                                                      ↓
                                              問題 / コレクション
```

**1枚の写真＝1件の知識ではない。** 博物館の写真1枚には、展示物・説明パネル・系統図・
展示空間が同時に写っている。それぞれを別の観察対象（Observation）として保存する。

## 使う

```bash
npm ci
npm run dev      # http://localhost:8000/your-knowledge/
```

`file://` で直接開くと動かない（ESモジュール・Service Worker・fetch がいずれも
HTTP を必要とするため）。必ず上のサーバ経由で開くこと。

## 開発

```bash
npm run lint        # eslint
npm run typecheck   # tsc --checkJs（JSDocで型を書いている。TypeScriptファイルは無い）
npm run test        # vitest
npm run build       # 検証して dist/ を作る
npm run check       # 上を全部
```

ビルドツールは使っていない。ブラウザが `src/` のESモジュールをそのまま読む。
`npm run build` は変換ではなく**検証してから配信物を集める**処理で、
サブパス配信で壊れるパスや、混入した資格情報を検出するとビルドが落ちる。

## 構成

```
index.html            6画面すべてを含む単一HTML
styles.css
sw.js                 アプリシェルのキャッシュ + Android共有先の受け口
manifest.webmanifest
assets/               サンプル写真20枚（恐竜博物館）
domain/
  core/vocabulary.json    汎用分類・学習役割・関係種別（全分野共通）
  packs/*.json            分野別分類（古生物 / 文化財 / 自然 / 歴史）
  reference/paleontology/ curatedな分類・地質時代JSONとReferenceGraph用Schema
src/
  main.js                 実装の合成点。ここだけが具体クラスを知っている
  ui/app.js               描画とイベント
  domain/registry.js      分類語彙の読み込み
  domain/reference-registry.js  参照JSONの読み込み・正規化・selector
  repositories/           保存（IndexedDB）
  services/analysis/      解析（今回はデモ実装のみ）
  features/               写真取り込み / JSON入出力 / PWA
  data/demo/              サンプル20枚のデータ
tests/
docs/
```

## この版でやらないこと

意図的に実装していない。

- クラウド同期・ログイン・ユーザーアカウント
- 本番のAI解析（APIキーは**一切使わない**）
- Neo4j への接続
- 写真の一般公開・ユーザー間共有
- iPhone / Safari 固有の対応

## データの置き場所

**ユーザーの写真は端末から出ない。** 外部へ送らず、リポジトリにも入れず、
ビルド成果物にも含めない。

| データ | 置き場所 |
|-------|---------|
| 写真の Blob・サムネイル | ブラウザの IndexedDB |
| 観察対象・分類・関係・学習状態・クイズ結果 | ブラウザの IndexedDB |
| サンプル写真20枚 | `assets/`（リポジトリ同梱） |

PWA としてインストールすると `navigator.storage.persist()` により永続保存を要求する。
保存に失敗した場合は黙って捨てず、画面に理由を表示する。

JSON で書き出し・読み込みができる。写真のバイナリはJSONに入れない（数百MBになるため）。
読み込みは検証してから適用するので、壊れたファイルで既存データが消えることはない。

### Reference Data

`domain/reference/paleontology/`は、Draw.ioでレビューした分類・時系列をstable ID付きJSONへ
変換した参照データである。Draw.ioはレビュー資料、JSONはアプリ実行時の正本とし、
`manifest.json`に両者のバージョン対応を記録する。`ReferenceGraph`は分類・時代そのものの
参照構造であり、Entityと確認済み知識を結ぶ`ReferenceFact`とは別の概念である。

参照ノードは`sourceType`と`status`を持ち、クイズなどの利用対象は原則`status: "verified"`
だけとする。顕生代は親ノードとして保存するが、通常の表示ルートには出さず、古生代・
中生代・新生代から表示できる。

## AI 解析について

**このリポジトリに APIキーは一切含まれていない。** ブラウザに置いた鍵は公開されたのと
同じなので、将来も含めてクライアントには渡さない。

現在の `DemoAnalysisProvider` は常に「AI解析はまだ接続されていません」を返す。
同梱20枚には解析済みの候補データが入っているが、**ユーザーが追加した写真を
「AI解析済み」と表示することはない**。追加した写真は未整理のまま保存され、
観察対象は手動で追加する。

将来つなぐ場合の構成:

```
ブラウザ ──画像──▶ 自分のサーバ ──APIキー──▶ AIサービス
                     ここだけが鍵を持つ
```

差し込み位置は `src/services/analysis/`（→ [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)）。

## 公開

GitHub Pages のプロジェクトサイトとして配信する。

```
https://tanker428.github.io/your-knowledge/
```

ベースパスの設定値はどこにも持っていない。すべて相対パスなので、リポジトリ名を
変えても何も直さずに動く。手順は [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md)。

## ドキュメント

| | |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 層構造と差し替え点（保存先 / 解析） |
| [docs/DATA_MODEL.md](docs/DATA_MODEL.md) | Photo / Observation / Entity / LearningFact |
| [docs/GITHUB_PAGES.md](docs/GITHUB_PAGES.md) | サブパス対応と公開手順 |
| [docs/ANDROID_TEST.md](docs/ANDROID_TEST.md) | Android 実機の確認項目 |
