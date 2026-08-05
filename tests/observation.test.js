import { describe, expect, it } from "vitest";
import {
  createObservation,
  displayedImageRect,
  normalizeRegion,
  observationReferences,
  regionFromPoints,
  removeObservation,
  resetRegionDraft,
  restoreRegionAfterCancel,
  updateObservation,
} from "../src/domain/observation.js";
import {
  clientPointToImagePercent,
  createImageViewport,
  getTransformedImageRect,
  panImageViewport,
  resetImageViewport,
  zoomImageViewport,
} from "../src/domain/image-viewport.js";

describe("Observation region", () => {
  it("ズーム・パン状態は表示専用で、元画像の座標へ変換できる", () => {
    const base = { left: 0, top: 0, width: 400, height: 300 };
    const viewport = panImageViewport(
      zoomImageViewport(createImageViewport("p1"), base, 2),
      30,
      -20,
    );
    const rect = getTransformedImageRect(base, viewport);
    expect(rect.width).toBe(800);
    expect(rect.height).toBe(600);
    expect(clientPointToImagePercent({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, base, viewport)).toEqual({ x: 50, y: 50 });
    expect(viewport).not.toHaveProperty("region");
  });

  it("全体表示はfit倍率・移動量・一時状態を完全に初期化する", () => {
    const reset = resetImageViewport("p1", 0.75);
    expect(reset).toEqual({ photoId: "p1", fitScale: 0.75, scale: 0.75, x: 0, y: 0 });
  });

  it("fit倍率が1未満でも拡大率を相対的に計算する", () => {
    const base = { left: 0, top: 0, width: 400, height: 300 };
    const fit = resetImageViewport("p1", 0.5);
    const zoomed = zoomImageViewport(fit, base, 1);
    expect(zoomed.scale).toBe(1);
    expect(getTransformedImageRect(base, zoomed)).toMatchObject({ width: 800, height: 600 });
  });

  it("ズームのアンカー位置を保ったまま既存regionの座標系を変えない", () => {
    const base = { left: 10, top: 20, width: 400, height: 300 };
    const point = { x: 210, y: 170 };
    const first = clientPointToImagePercent(point, base, createImageViewport("p1"));
    const zoomed = zoomImageViewport(createImageViewport("p1"), base, 3, point);
    const second = clientPointToImagePercent(point, base, zoomed);
    expect(second.x).toBeCloseTo(first.x);
    expect(second.y).toBeCloseTo(first.y);
    expect({ x: 12, y: 18, w: 35, h: 28 }).toEqual({ x: 12, y: 18, w: 35, h: 28 });
  });

  it("座標を0〜100へクランプする", () => {
    expect(normalizeRegion({ x: -10, y: 20, w: 130, h: 90 })).toEqual({
      x: 0,
      y: 20,
      w: 100,
      h: 80,
    });
  });

  it("写真外からのドラッグでも元の幅を保ってクランプする", () => {
    expect(normalizeRegion({ x: -20, y: -10, w: 50, h: 40 })).toEqual({
      x: 0,
      y: 0,
      w: 30,
      h: 30,
    });
  });

  it("点から矩形を作り、上下左右の順序を正規化する", () => {
    expect(regionFromPoints({ x: 80, y: 70 }, { x: 20, y: 10 })).toEqual({
      x: 20,
      y: 10,
      w: 60,
      h: 60,
    });
  });

  it("幅または高さが3%未満なら拒否する", () => {
    expect(regionFromPoints({ x: 10, y: 10 }, { x: 12, y: 30 })).toBeNull();
    expect(regionFromPoints({ x: 10, y: 10 }, { x: 30, y: 12 })).toBeNull();
  });

  it("nullは写真全体を表す", () => {
    expect(normalizeRegion(null)).toBeNull();
  });

  it("containの上下余白を除いた横長画像領域を返す", () => {
    expect(displayedImageRect({ left: 0, top: 0, width: 400, height: 400 }, 1600, 900)).toMatchObject({
      left: 0,
      top: 87.5,
      width: 400,
      height: 225,
    });
  });

  it("containの左右余白を除いた縦長画像領域を返す", () => {
    expect(displayedImageRect({ left: 0, top: 0, width: 400, height: 400 }, 900, 1600)).toMatchObject({
      left: 87.5,
      top: 0,
      width: 225,
      height: 400,
    });
  });

  it("表示領域のサイズ変更後も横長画像の枠基準を再計算できる", () => {
    const resized = displayedImageRect({ left: 0, top: 0, width: 800, height: 400 }, 1600, 900);
    expect(resized).toMatchObject({ left: 44.44444444444446, top: 0, width: 711.1111111111111, height: 400 });
  });

  it("縦横回転相当のサイズ変更後も縦長画像の枠基準を再計算できる", () => {
    const rotated = displayedImageRect({ left: 0, top: 0, width: 400, height: 800 }, 900, 1600);
    expect(rotated.left).toBeCloseTo(17.1875);
    expect(rotated.top).toBe(75);
    expect(rotated.width).toBe(365.625);
    expect(rotated.height).toBe(650);
  });

  it("描画キャンセルで下書きをリセットする", () => {
    expect(resetRegionDraft()).toEqual({ drawing: false, pointerId: null, start: null, region: null });
  });

  it("既存regionの描き直しをキャンセルすると元のregionを復元する", () => {
    const original = { x: 11, y: 19, w: 32, h: 41 };
    const canceled = restoreRegionAfterCancel(original);
    expect(canceled).toEqual(original);
    expect(canceled).not.toBe(original);
    const observation = createObservation({
      id: "o-existing",
      photoId: "p-user",
      label: "展示物",
      observationType: "physical",
      region: original,
    });
    expect(updateObservation(observation, { region: canceled }).region).toEqual(original);
  });

  it("新規region指定のキャンセルはregion未設定へ戻す", () => {
    expect(restoreRegionAfterCancel(null)).toBeNull();
  });
});

describe("Observation CRUD", () => {
  const input = {
    id: "o-user",
    photoId: "p-user",
    label: "  説明パネル  ",
    observationType: "information",
    region: { x: 5, y: 10, w: 40, h: 30 },
    domainPackId: "history",
  };

  it("手動作成時の初期値を契約どおりにする", () => {
    expect(createObservation(input)).toMatchObject({
      id: "o-user",
      photoId: "p-user",
      label: "説明パネル",
      region: { x: 5, y: 10, w: 40, h: 30 },
      status: "confirmed",
      included: true,
      origin: "user",
      entityId: null,
    });
  });

  it("同じPhotoに複数Observationを保持できる", () => {
    const first = createObservation({ ...input, id: "o-1" });
    const second = createObservation({
      ...input,
      id: "o-2",
      label: "展示物",
      region: null,
    });
    expect([first, second]).toHaveLength(2);
    expect(second.region).toBeNull();
  });

  it("名前・種別・領域を編集できる", () => {
    const updated = updateObservation(createObservation(input), {
      label: "恐竜の説明",
      observationType: "concept",
      region: { x: -5, y: 10, w: 110, h: 20 },
    });
    expect(updated).toMatchObject({
      label: "恐竜の説明",
      observationType: "concept",
      region: { x: 0, y: 10, w: 100, h: 20 },
      origin: "user",
    });
  });

  it("新規region描画後も入力したlabelを保持して保存できる", () => {
    const draft = { label: "展示物", observationType: "physical", regionMode: "region" };
    const saved = createObservation({
      ...input,
      label: draft.label,
      observationType: draft.observationType,
      region: { x: 12, y: 18, w: 35, h: 28 },
    });
    expect(saved).toMatchObject({ label: "展示物", region: { x: 12, y: 18, w: 35, h: 28 } });
  });

  it("既存Observationの描き直しで新しいregionを保存する", () => {
    const original = createObservation({ ...input, region: { x: 5, y: 5, w: 20, h: 20 } });
    const redrawn = updateObservation(original, { region: { x: 55, y: 25, w: 30, h: 40 } });
    expect(redrawn).toMatchObject({ id: original.id, label: original.label, region: { x: 55, y: 25, w: 30, h: 40 } });
  });

  it("JSON保存と再読み込み後もregionを保持する", () => {
    const saved = createObservation({ ...input, region: { x: 14, y: 22, w: 31, h: 44 } });
    expect(JSON.parse(JSON.stringify(saved)).region).toEqual(saved.region);
  });

  it("物理削除し、他のObservationは残す", () => {
    const photo = {
      id: "p-user",
      observations: [
        createObservation({ ...input, id: "o-1" }),
        createObservation({ ...input, id: "o-2" }),
      ],
    };
    const result = removeObservation(photo, "o-1");
    expect(result.removed).toBe(true);
    expect(result.photo.observations.map((item) => item.id)).toEqual(["o-2"]);
    expect(photo.observations).toHaveLength(2);
  });

  it("参照RelationとLearningFactだけを削除対象として収集する", () => {
    const project = {
      relations: [
        { id: "r1", sourceId: "o-1", targetId: "o-2" },
        { id: "r2", sourceId: "o-other", targetId: "o-3" },
      ],
      facts: [
        { id: "f1", targetId: "o-1" },
        { id: "f2", targetId: "o-other" },
      ],
    };
    expect(observationReferences(project, "o-1")).toEqual({
      relations: [project.relations[0]],
      facts: [project.facts[0]],
    });
  });
});
