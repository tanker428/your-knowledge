# ADR 0001: Three.jsを直接利用する

## Status

Accepted

## Context

your-knowledgeはReact、router、bundler、runtime dependencyを使わない静的ES Moduleアプリである。GitHub Pagesの `/your-knowledge/` サブパスとPR previewで壊れないよう、相対パスを前提にしている。

3D知識空間MVPでは、既存2D知識マップと保存データを維持したまま、`VisualizationGraphV1` からWeb 3Dを描画する必要がある。

## Decision

Implementation note: the MVP fixture renderer pins `three@0.185.1` under `src/vendor/three/0.185.1/`.

React Three Fiberは採用せず、Three.jsを直接利用する。

- Three.jsは固定バージョンのvendored ESMとして配置する
- ライセンスファイルを保持する
- 3D画面を開く時だけ遅延読み込みする
- 初期Service Worker shell precacheには入れない
- オフライン方針はcache-on-first-useとする
- 初回3D表示時に取得し、取得後に再利用できるようにする
- 初回オフライン時は2D fallbackを表示する
- root absolute pathを使わず、GitHub PagesサブパスとPR previewを維持する
- WebGL不可時は2D fallbackを表示する

## Consequences

### Positive

- 現在のno React / no bundler構成と衝突しない
- 既存buildの「検証してdistへ集める」方針を維持できる
- 3Dだけを遅延読み込みできる
- Renderer lifecycleをアプリ側で明示的に管理できる

### Negative

- Three.jsは初の大きなruntime assetになる
- shell precacheへ入れないため、初回3D表示時はネットワークが必要
- dispose漏れ、animation loop漏れ、event listener漏れをテストで確認する必要がある

## Required renderer cleanup

- Renderer
- Geometry
- Material
- Texture
- AnimationFrame
- pointer / resize などのイベントリスナ

## Rejected alternatives

### React Three Fiber

React、JSX、bundler前提が強く、現在の構成と合わないため不採用。

### WebXR / Unity

MVPの範囲を超えるため不採用。
