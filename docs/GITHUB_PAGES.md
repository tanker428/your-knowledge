# GitHub Pages への公開

## 公開URL

プロジェクトサイトとして公開するため、ルートは `/` ではない。

```
https://tanker428.github.io/your-knowledge/
                            ^^^^^^^^^^^^^^^
```

## サブパスへの対応方法

**ベースパスの設定値をどこにも持っていない。** リポジトリ名を変えても、
ユーザーサイトへ移しても、独自ドメインを当てても、何も直さずに動く。

やっていることは3つだけ。

### 1. HTML からの参照はすべて相対パス

```html
<link rel="manifest" href="./manifest.webmanifest" />
<link rel="stylesheet" href="styles.css" />
<script type="module" src="src/main.js"></script>
<img src="assets/43085_0.jpg" />
```

`/assets/...` のようなルート絶対パスは1つも無い。これを書くと
`https://tanker428.github.io/assets/...`（ユーザーサイト直下）を見に行って404になる。

### 2. JS からの参照は `import.meta.url` 基準

```js
// src/domain/registry.js（src/domain/ にある）
const CORE_URL = new URL('../../domain/core/vocabulary.json', import.meta.url);
```

モジュール自身の位置からの相対で解決するので、配信先がどこでも正しい。

> `../` の数を間違えると実行時に404になるだけでビルドは通ってしまう。実際に
> Service Worker の登録パスでこれをやったため、`npm run build` が全ての
> `new URL(..., import.meta.url)` を解決できるか検査するようにした。

### 3. manifest と Service Worker のスコープも相対

```json
{ "id": "./", "start_url": "./index.html", "scope": "./",
  "share_target": { "action": "./share-target" } }
```

```js
navigator.serviceWorker.register(SW_URL, { scope: new URL('./', SW_URL) });
```

結果、スコープは `https://tanker428.github.io/your-knowledge/` になる。

## 再読み込みで404にならない理由

このアプリは**単一のHTMLに6画面が入っている**。画面切り替えは `.view.active` の
クラス付け替えで、URLは変わらない。したがって

- どの画面で再読み込みしても、要求されるURLは常に `/your-knowledge/` の1つだけ
- サーバ側のルーティング設定（404.html のフォールバック等）が不要
- HashRouter も不要

将来ディープリンクを足す場合は、`#/photos` のようなハッシュ方式にすること。
History API のパス方式は GitHub Pages では404になる。

## ビルドと配信物

`npm run build` は変換をしない。**検証してから `dist/` へ集める。**

検証内容（1つでも失敗するとビルドが落ちる）：

| 検査 | 防いでいる事故 |
|------|--------------|
| Service Worker の `SHELL_ASSETS` が全て存在するか | キャッシュ対象の消滅 |
| サンプル写真20枚が全て存在するか | 画像切れ |
| `domain/packs/index.json` と各パックのIDが一致するか | 分類の欠落 |
| `new URL(..., import.meta.url)` が全て解決できるか | 実行時404 |
| ルート絶対パスが無いか | **サブパス配信での404** |
| APIキー・bolt接続情報の混入が無いか | 資格情報の公開 |
| 外部URLへの参照が無いか | 意図しない外部通信 |

`dist/` に入るもの:

```
.nojekyll  index.html  styles.css  sw.js  manifest.webmanifest
favicon.svg  pwa-icon-192.png  pwa-icon-512.png
assets/  domain/  src/
```

入らないもの: `node_modules/` `tests/` `scripts/` `docs/` `.github/`
`package*.json` 各種設定ファイル `.local-media/`

## 公開手順

> **以下はユーザーの明示的な許可を得てから実行すること。**
> 現状、コードは `feat/github-pages-port` ブランチにあり、push もマージもしていない。

1. GitHub でリポジトリ `your-knowledge` を作る（Public）
2. リモートを設定して push する

   ```bash
   git remote add origin https://github.com/tanker428/your-knowledge.git
   git push -u origin main
   git push -u origin feat/github-pages-port
   ```

3. `feat/github-pages-port` → `main` の Pull Request を作る
   （CI が lint / typecheck / test / build を実行する）
4. マージする
5. リポジトリの **Settings → Pages → Build and deployment → Source** を
   **GitHub Actions** にする
6. `Deploy to GitHub Pages` ワークフローが走り、`dist/` が配信される
7. `https://tanker428.github.io/your-knowledge/` を開く

## リポジトリ名を変えた場合

何も直さなくてよい。URLだけが変わる。

```
https://tanker428.github.io/<新しい名前>/
```

`manifest.webmanifest` の `scope` も Service Worker のスコープも相対指定なので追従する。
ただし PWA としてインストール済みの端末では、スコープが変わるため入れ直しになる。

## ローカルでの確認

```bash
npm run dev
# → http://localhost:8000/your-knowledge/
```

`npm run dev` は**わざとサブパスで配信する**。`/` で確認すると、このポートで
避けたかった種類のバグが表に出ない。

```bash
npm run dev -- --base=/ --port=3000    # ルート配信で確認したいとき
npm run dev -- --dist                  # dist/ の中身を確認したいとき
```

`file://` で index.html を直接開くと、ES モジュールと Service Worker と
`fetch` がいずれも動かない。必ず HTTP サーバ経由で開くこと。
