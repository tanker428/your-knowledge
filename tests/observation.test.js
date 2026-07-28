import { describe, expect, it } from "vitest";
import {
  createObservation,
  normalizeRegion,
  regionFromPoints,
  removeObservation,
  updateObservation,
} from "../src/domain/observation.js";

describe("Observation region", () => {
  it("座標を0〜100へクランプする", () => {
    expect(normalizeRegion({ x: -10, y: 20, w: 130, h: 90 })).toEqual({
      x: 0,
      y: 20,
      w: 100,
      h: 80,
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
});
