# Your Knowledge

観光地や博物館で撮った写真から、複数のObservationを整理し、自分が触れた知識を可視化して、問題とコレクションへ育てる静的Webアプリです。

## 現在の構成

- GitHub Pagesで配信できるHTML / CSS / JavaScriptのみの構成
- サーバー、外部データベース、クラウド保存は未使用
- 写真整理結果はブラウザのローカルストレージへ保存
- Androidの共有先として利用するためのPWA設定を同梱
- OpenAI APIキーなどの秘密情報は含まれていません
- AI解析は未接続です。追加写真は「未整理」で保存し、Observationを手動追加できます

## GitHub Pagesへの公開

1. GitHubで `your-knowledge` リポジトリを作成します。
2. このフォルダの内容をリポジトリ直下へ配置します。
3. `main` ブランチへpushします。
4. GitHubの `Settings → Pages` でSourceを `GitHub Actions` に設定します。
5. 同梱のワークフローがサイトを配信します。

プロジェクトサイトのサブパスでも動作するよう、画像、マニフェスト、Service Workerは相対パスで参照しています。

## データモデル

- Visit
- Photo
- Observation
- ObservationRelation
- Entity
- LearningFact
- Collection
- Question

PhotoとObservationは別データです。一枚の写真に複数Observationを保持できます。

## AI連携を追加するとき

ブラウザへAPIキーを記述しないでください。別途用意したサーバーまたはサーバーレス関数がAPIキーを保持し、認証・利用制限・画像サイズ制限を行ったうえでObservation候補を返す構成にしてください。接続先は `app.js` の `AI_ANALYZE_ENDPOINT` へ設定します。

## ローカル確認

Service Workerを確認する場合は、ファイルを直接開かずローカルHTTPサーバーを利用してください。

```bash
python -m http.server 8000
```

その後、ブラウザで `http://localhost:8000/` を開きます。
