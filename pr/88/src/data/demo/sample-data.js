/**
 * Demo visit data for the bundled 20 sample photos (Fukui dinosaur museum).
 *
 * This file holds ONLY demo content. Domain-specific classification vocabulary
 * lives in `domain/packs/*.json` and the domain-independent vocabulary lives in
 * `domain/core/vocabulary.json` — never add either of those here.
 *
 * Generated from the original prototype's `sample-data.js`; the records are
 * byte-for-byte the same values, only the module wrapper changed.
 */

/** @type {{version:number,records:string[],note:string}} */
export const DATA_MODEL = {
  "version": 2,
  "records": [
    "Visit",
    "Photo",
    "Observation",
    "ObservationRelation",
    "Entity",
    "LearningFact",
    "Collection",
    "Question"
  ],
  "note": "Runtimeでは表示効率のためObservationをPhoto内へ配置し、JSON出力時はphotoIdを持つ独立レコードへ正規化する。"
};

export const SAMPLE_VISIT = {
  "id": "visit-fukui",
  "title": "恐竜博物館の訪問",
  "place": "自然史・恐竜博物館",
  "domainHints": [
    "paleontology"
  ],
  "photoIds": [
    "p01",
    "p02",
    "p03",
    "p04",
    "p05",
    "p06",
    "p07",
    "p08",
    "p09",
    "p10",
    "p11",
    "p12",
    "p13",
    "p14",
    "p15",
    "p16",
    "p17",
    "p18",
    "p19",
    "p20"
  ]
};

/**
 * 同梱デモの Visit 一覧。seed / migration はこの配列を正として複数訪問を用意する。
 *
 * デモ訪問を追加するときは、ここへ Visit 定義（`id` / `title` / `place` /
 * `domainHints` / `photoIds`）を足し、その訪問の写真を `SAMPLE_PHOTOS` へ
 * `visitId` 付きで追加し、参照知識を `demo-knowledge.js` の
 * `DEMO_REFERENCE_FACTS` へ足したうえで `DEMO_KNOWLEDGE_VERSION` を上げる。
 * 各写真は自分の `visitId` を持つので、訪問の割り当てはデータ側で決まる。
 *
 * @type {typeof SAMPLE_VISIT[]}
 */
export const SAMPLE_VISITS = [SAMPLE_VISIT];

export const SAMPLE_PHOTOS = [
  {
    "id": "p01",
    "file": "43083_0.jpg",
    "order": 1,
    "title": "脊椎動物の系統展示",
    "status": "organized",
    "experienceMemo": "爬虫類がすごく繫栄している",
    "observations": [
      {
        "id": "o01a",
        "label": "爬虫類・鳥類・哺乳類の系統図",
        "observationType": "information",
        "region": {
          "x": 5,
          "y": 6,
          "w": 83,
          "h": 84
        },
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "phylogeny",
          "evolution"
        ],
        "confidence": 0.98,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p01"
      },
      {
        "id": "o01b",
        "label": "地質時代の時間軸",
        "observationType": "information",
        "region": {
          "x": 84,
          "y": 15,
          "w": 12,
          "h": 78
        },
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "geologic-time"
        ],
        "confidence": 0.96,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p01"
      },
      {
        "id": "o01c",
        "label": "生物群の分岐というテーマ",
        "observationType": "concept",
        "region": null,
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "evolution"
        ],
        "confidence": 0.87,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p01"
      },
      {
        "id": "observation-1786474991493-bklj8g",
        "label": "双弓類と単弓類の違い",
        "observationType": "information",
        "region": {
          "x": 4.96,
          "y": 67.46,
          "w": 33.8,
          "h": 23.25
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "phylogeny",
          "evolution"
        ],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p01"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p02",
    "file": "43084_0.jpg",
    "order": 2,
    "title": "人類の脳に関する展示",
    "status": "in-progress",
    "experienceMemo": "脳が３倍\nでよかった",
    "observations": [
      {
        "id": "o02a",
        "label": "「拡大した脳」の説明パネル",
        "observationType": "information",
        "region": {
          "x": 13.37,
          "y": 6.93,
          "w": 63.6,
          "h": 29.93
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "evolution"
        ],
        "confidence": 0.99,
        "status": "confirmed",
        "visibleText": [
          "拡大した脳"
        ],
        "entityId": null,
        "photoId": "p02"
      },
      {
        "id": "o02b",
        "label": "脳容量の比較グラフ",
        "observationType": "information",
        "region": {
          "x": 11.2,
          "y": 36.23,
          "w": 65.53,
          "h": 54.97
        },
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.98,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p02"
      },
      {
        "id": "o02c",
        "label": "人類の脳の変化というテーマ",
        "observationType": "concept",
        "region": null,
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "evolution"
        ],
        "confidence": 0.89,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p02"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p03",
    "file": "43085_0.jpg",
    "order": 3,
    "title": "人類進化展示の全景",
    "status": "in-progress",
    "experienceMemo": "人間だあー",
    "observations": [
      {
        "id": "o03a",
        "label": "複数の頭骨標本",
        "observationType": "physical",
        "region": {
          "x": 2.93,
          "y": 21.77,
          "w": 92.77,
          "h": 45.34
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "comparison",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.96,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p03"
      },
      {
        "id": "o03b",
        "label": "全身骨格",
        "observationType": "physical",
        "region": {
          "x": 31.33,
          "y": 55.41,
          "w": 28.77,
          "h": 44.59
        },
        "genericCategories": [
          "exhibit-object",
          "replica-model"
        ],
        "learningRoles": [
          "direct",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.97,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p03"
      },
      {
        "id": "o03c",
        "label": "脳容量パネル",
        "observationType": "information",
        "region": {
          "x": 8.9,
          "y": 75.56,
          "w": 21.58,
          "h": 24.44
        },
        "genericCategories": [
          "explanation-panel",
          "diagram-map"
        ],
        "learningRoles": [
          "explains",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.93,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p03"
      },
      {
        "id": "o03d",
        "label": "二足歩行パネル",
        "observationType": "information",
        "region": {
          "x": 58.4,
          "y": 69.22,
          "w": 18.29,
          "h": 30.78
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "evolution"
        ],
        "confidence": 0.9,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p03"
      },
      {
        "id": "o03e",
        "label": "人類進化の展示空間",
        "observationType": "space",
        "region": null,
        "genericCategories": [
          "place-landscape"
        ],
        "learningRoles": [
          "context",
          "memory"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "exhibit-space",
          "mammal-human"
        ],
        "confidence": 0.82,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p03"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p04",
    "file": "43086_0.jpg",
    "order": 4,
    "title": "初期人類の標本比較",
    "status": "organized",
    "experienceMemo": "教科書でおなじみ",
    "observations": [
      {
        "id": "o04a",
        "label": "サヘラントロプス・チャデンシスの頭骨標本",
        "observationType": "physical",
        "region": {
          "x": 64.86,
          "y": 31.52,
          "w": 34.01,
          "h": 42.42
        },
        "genericCategories": [
          "exhibit-object",
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "detail",
          "evidence",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.94,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p04"
      },
      {
        "id": "o04b",
        "label": "アルディビテクス・ラミダスの顎化石",
        "observationType": "physical",
        "region": {
          "x": 25.85,
          "y": 55.24,
          "w": 23.04,
          "h": 33.97
        },
        "genericCategories": [
          "exhibit-object",
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "detail",
          "evidence",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.91,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p04"
      },
      {
        "id": "o04c",
        "label": "標本名と産地のラベル",
        "observationType": "information",
        "region": null,
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "context",
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human"
        ],
        "confidence": 0.88,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p04"
      },
      {
        "id": "observation-1786479078639-wnd5o5",
        "label": "アウストラロピテクス・アナメンシスの顎化石",
        "observationType": "physical",
        "region": {
          "x": 14.51,
          "y": 0,
          "w": 22.8,
          "h": 33.96
        },
        "genericCategories": [
          "exhibit-object",
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p04"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p05",
    "file": "43087_0.jpg",
    "order": 5,
    "title": "人類と霊長類の展示",
    "status": "organized",
    "experienceMemo": "5の生き物はなんなん",
    "observations": [
      {
        "id": "o05a",
        "label": "「自然の中の人類」パネル",
        "observationType": "information",
        "region": {
          "x": 27.47,
          "y": 17.86,
          "w": 42.7,
          "h": 31.02
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "context",
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "evolution"
        ],
        "confidence": 0.96,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p05"
      },
      {
        "id": "o05b",
        "label": "霊長類の系統表示",
        "observationType": "information",
        "region": {
          "x": 3.81,
          "y": 50.47,
          "w": 40.01,
          "h": 49.53
        },
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "context",
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "phylogeny",
          "mammal-human"
        ],
        "confidence": 0.94,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p05"
      },
      {
        "id": "o05c",
        "label": "「霊長類の繁栄」パネル",
        "observationType": "information",
        "region": {
          "x": 45.17,
          "y": 50.04,
          "w": 27.32,
          "h": 24.24
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "context",
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "evolution"
        ],
        "confidence": 0.94,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p05"
      },
      {
        "id": "o05d",
        "label": "霊長類の骨格標本",
        "observationType": "physical",
        "region": {
          "x": 0,
          "y": 1,
          "w": 25,
          "h": 95
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human"
        ],
        "confidence": 0.84,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p05"
      },
      {
        "id": "observation-1786482817276-isgopr",
        "label": "何かの全身標本",
        "observationType": "physical",
        "region": {
          "x": 43.05,
          "y": 75.15,
          "w": 36.74,
          "h": 24.85
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human"
        ],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p05"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p06",
    "file": "43088_0.jpg",
    "order": 6,
    "title": "霊長類の系統図",
    "status": "organized",
    "observations": [
      {
        "id": "o06a",
        "label": "霊長類の系統図",
        "observationType": "information",
        "region": {
          "x": 4.39,
          "y": 29.11,
          "w": 78.48,
          "h": 61.47
        },
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "context",
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "phylogeny",
          "mammal-human"
        ],
        "confidence": 0.97,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p06"
      },
      {
        "id": "o06b",
        "label": "霊長類の骨格標本",
        "observationType": "physical",
        "region": {
          "x": 23.24,
          "y": 0.11,
          "w": 44.05,
          "h": 32.32
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human"
        ],
        "confidence": 0.85,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p06"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p07",
    "file": "43089_0.jpg",
    "order": 7,
    "title": "大型の水生哺乳類骨格",
    "status": "in-progress",
    "experienceMemo": "カッコイイけどクジラなんだよね",
    "observations": [
      {
        "id": "o07a",
        "label": "細長い全身骨格",
        "observationType": "physical",
        "region": {
          "x": 12.08,
          "y": 15.84,
          "w": 60.59,
          "h": 84.16
        },
        "genericCategories": [
          "exhibit-object",
          "replica-model"
        ],
        "learningRoles": [
          "direct",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human"
        ],
        "confidence": 0.96,
        "status": "confirmed",
        "visibleText": [],
        "entityId": "e-basilo",
        "photoId": "p07"
      },
      {
        "id": "o07b",
        "label": "海洋生物の展示空間と周囲の標本",
        "observationType": "space",
        "region": null,
        "genericCategories": [
          "place-landscape"
        ],
        "learningRoles": [
          "context",
          "memory",
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "exhibit-space"
        ],
        "confidence": 0.78,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p07"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p08",
    "file": "43090_0.jpg",
    "order": 8,
    "title": "大型の水生哺乳類の説明",
    "status": "in-progress",
    "experienceMemo": "クジラは意外と現代のほうが大きい",
    "observations": [
      {
        "id": "o08a",
        "label": "バシロサウルスの展示パネル",
        "observationType": "information",
        "region": {
          "x": 22.8,
          "y": 25.5,
          "w": 59.01,
          "h": 52.65
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "evidence",
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human"
        ],
        "confidence": 0.99,
        "status": "confirmed",
        "visibleText": [
          "バシロサウルス ケトイデス"
        ],
        "entityId": "e-basilo",
        "photoId": "p08"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p09",
    "file": "43091_0.jpg",
    "order": 9,
    "title": "新生代の大型哺乳類展示",
    "status": "in-progress",
    "experienceMemo": "並びがいいね",
    "observations": [
      {
        "id": "o09a",
        "label": "大きな角を持つ全身骨格",
        "observationType": "physical",
        "region": {
          "x": 0.12,
          "y": 0,
          "w": 99.88,
          "h": 90.51
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.9,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p09"
      },
      {
        "id": "o09b",
        "label": "別の全身骨格たち",
        "observationType": "physical",
        "region": {
          "x": 54.74,
          "y": 41.76,
          "w": 45.26,
          "h": 35.43
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.88,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p09"
      },
      {
        "id": "o09c",
        "label": "複数の大型哺乳類が並ぶ展示空間",
        "observationType": "space",
        "region": null,
        "genericCategories": [
          "place-landscape"
        ],
        "learningRoles": [
          "context",
          "memory"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "exhibit-space",
          "mammal-human"
        ],
        "confidence": 0.82,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p09"
      },
      {
        "id": "observation-1786483837543-b2rx9o",
        "label": "謎の頭骨",
        "observationType": "physical",
        "region": {
          "x": 43.28,
          "y": 67.6,
          "w": 25.85,
          "h": 27.79
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton"
        ],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p09"
      },
      {
        "id": "observation-1786483877498-1y3oqe",
        "label": "ギガンデウスオオツノジカの説明パネル",
        "observationType": "information",
        "region": {
          "x": 19.38,
          "y": 86.77,
          "w": 14.75,
          "h": 13.23
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "exhibit-space"
        ],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p09"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p10",
    "file": "43092_0.jpg",
    "order": 10,
    "title": "長鼻類の系統と頭骨比較",
    "status": "in-progress",
    "experienceMemo": "お勉強",
    "observations": [
      {
        "id": "o10a",
        "label": "長鼻類の系統図",
        "observationType": "information",
        "region": {
          "x": 2,
          "y": 10,
          "w": 70,
          "h": 83
        },
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "phylogeny",
          "mammal-human"
        ],
        "confidence": 0.94,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p10"
      },
      {
        "id": "o10b",
        "label": "頭骨形態の比較イラスト",
        "observationType": "information",
        "region": {
          "x": 70,
          "y": 2,
          "w": 28,
          "h": 93
        },
        "genericCategories": [
          "media-image",
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.91,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p10"
      },
      {
        "id": "observation-1786485939454-5t0668",
        "label": "長鼻族の歯と頭の進化",
        "observationType": "information",
        "region": {
          "x": 49.16,
          "y": 78.07,
          "w": 20.48,
          "h": 12.03
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p10"
      },
      {
        "id": "observation-1786485969270-seaud5",
        "label": "世界に広がるゾウたち",
        "observationType": "information",
        "region": {
          "x": 0,
          "y": 27.2,
          "w": 30.27,
          "h": 31.69
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p10"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p11",
    "file": "43093_0.jpg",
    "order": 11,
    "title": "大型哺乳類の頭骨と骨格",
    "status": "organized",
    "experienceMemo": "あご！",
    "observations": [
      {
        "id": "o11a",
        "label": "手前の大きな頭骨と牙",
        "observationType": "physical",
        "region": {
          "x": 21.12,
          "y": 15.69,
          "w": 52.32,
          "h": 53.97
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.93,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p11"
      },
      {
        "id": "observation-1786486164546-c1wv0t",
        "label": "デイノテリウム　ババリカムの説明パネル",
        "observationType": "information",
        "region": {
          "x": 50.94,
          "y": 56.96,
          "w": 21.16,
          "h": 11.54
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p11"
      },
      {
        "id": "observation-1786486286966-y2ninf",
        "label": "奥側の頭骨",
        "observationType": "physical",
        "region": {
          "x": 2.85,
          "y": 36.76,
          "w": 38.09,
          "h": 30.16
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p11"
      },
      {
        "id": "observation-1786486322662-frsf5g",
        "label": "ゴンフォテリウム　シェンシエンシスの説明パネル",
        "observationType": "information",
        "region": {
          "x": 10.54,
          "y": 55.67,
          "w": 18.47,
          "h": 10.97
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p11"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p12",
    "file": "43094_0.jpg",
    "order": 12,
    "title": "長鼻類の骨格展示",
    "status": "in-progress",
    "experienceMemo": "すごく食べづらそう",
    "observations": [
      {
        "id": "o12a",
        "label": "中央の全身骨格",
        "observationType": "physical",
        "region": {
          "x": 19.39,
          "y": 1.26,
          "w": 80.61,
          "h": 84.85
        },
        "genericCategories": [
          "exhibit-object",
          "replica-model"
        ],
        "learningRoles": [
          "direct",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human"
        ],
        "confidence": 0.92,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p12"
      },
      {
        "id": "o12b",
        "label": "左の頭骨標本",
        "observationType": "physical",
        "region": {
          "x": 0.35,
          "y": 53.36,
          "w": 17.7,
          "h": 35.06
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.88,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p12"
      },
      {
        "id": "o12c",
        "label": "手前の植物の解説台",
        "observationType": "information",
        "region": {
          "x": 14.01,
          "y": 76.88,
          "w": 78.68,
          "h": 22.22
        },
        "genericCategories": [
          "explanation-panel",
          "diagram-map"
        ],
        "learningRoles": [
          "explains",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human"
        ],
        "confidence": 0.81,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p12"
      },
      {
        "id": "observation-1786486760427-qzb7ux",
        "label": "ブラキディベムナン？の説明パネル",
        "observationType": "information",
        "region": {
          "x": 33.24,
          "y": 76.16,
          "w": 13.85,
          "h": 6.2
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p12"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p13",
    "file": "43095_0.jpg",
    "order": 13,
    "title": "角を持つ大型哺乳類",
    "status": "in-progress",
    "experienceMemo": "つの！",
    "observations": [
      {
        "id": "o13a",
        "label": "手前の角を持つ頭骨",
        "observationType": "physical",
        "region": {
          "x": 2,
          "y": 24,
          "w": 63,
          "h": 57
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.91,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p13"
      },
      {
        "id": "o13b",
        "label": "背景の全身骨格",
        "observationType": "physical",
        "region": {
          "x": 35.55,
          "y": 0.25,
          "w": 45.01,
          "h": 66.96
        },
        "genericCategories": [
          "exhibit-object",
          "replica-model"
        ],
        "learningRoles": [
          "direct",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human"
        ],
        "confidence": 0.86,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p13"
      },
      {
        "id": "o13c",
        "label": "アルシノイテリウムの展示ラベル",
        "observationType": "information",
        "region": {
          "x": 23.43,
          "y": 78.03,
          "w": 25.97,
          "h": 14.29
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human"
        ],
        "confidence": 0.82,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p13"
      },
      {
        "id": "observation-1786487119764-snol9h",
        "label": "オロテリウム？の展示ラベル",
        "observationType": "information",
        "region": {
          "x": 54.4,
          "y": 53.93,
          "w": 20.01,
          "h": 11.4
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p13"
      },
      {
        "id": "observation-1786487138402-rj9yws",
        "label": "頭骨",
        "observationType": "physical",
        "region": {
          "x": 77.1,
          "y": 50.18,
          "w": 22.9,
          "h": 13.85
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p13"
      },
      {
        "id": "observation-1786487154914-chts1k",
        "label": "ダイテリウム？の説明パネル",
        "observationType": "physical",
        "region": {
          "x": 82.49,
          "y": 60.86,
          "w": 16.74,
          "h": 9.24
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p13"
      },
      {
        "id": "observation-1786487200718-en3nos",
        "label": "頭骨",
        "observationType": "physical",
        "region": {
          "x": 82.87,
          "y": 67.5,
          "w": 17.13,
          "h": 8.8
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p13"
      },
      {
        "id": "observation-1786487246801-nho1mw",
        "label": "メソヒップス・パイルディの展示ラベル",
        "observationType": "information",
        "region": {
          "x": 80.95,
          "y": 82.94,
          "w": 19.05,
          "h": 17.06
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p13"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p14",
    "file": "43096_0.jpg",
    "order": 14,
    "title": "巨大な頭骨の比較展示",
    "status": "in-progress",
    "experienceMemo": "芋虫みたいな顏の前面",
    "observations": [
      {
        "id": "o14a",
        "label": "左側の巨大な頭骨と下顎",
        "observationType": "physical",
        "region": {
          "x": 0,
          "y": 0,
          "w": 61,
          "h": 72
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.93,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p14"
      },
      {
        "id": "o14b",
        "label": "右側の頭骨",
        "observationType": "physical",
        "region": {
          "x": 55,
          "y": 4,
          "w": 42,
          "h": 58
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.91,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p14"
      },
      {
        "id": "o14c",
        "label": "手前の海水温変化グラフ",
        "observationType": "information",
        "region": {
          "x": 0.48,
          "y": 74.91,
          "w": 71.15,
          "h": 25.09
        },
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "evolution"
        ],
        "confidence": 0.84,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p14"
      },
      {
        "id": "observation-1786488077847-p3ql7f",
        "label": "エンポロテリウムの展示ラベル",
        "observationType": "information",
        "region": {
          "x": 32.2,
          "y": 60.24,
          "w": 21.9,
          "h": 20.08
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p14"
      },
      {
        "id": "observation-1786488108415-lyoyrg",
        "label": "メガケロプスの展示ラベル",
        "observationType": "information",
        "region": {
          "x": 79.64,
          "y": 50.84,
          "w": 18.48,
          "h": 16.8
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p14"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p15",
    "file": "43097_0.jpg",
    "order": 15,
    "title": "シダ植物の系統と化石",
    "status": "in-progress",
    "experienceMemo": "シダ全盛期",
    "observations": [
      {
        "id": "o15a",
        "label": "維管束植物の系統図",
        "observationType": "information",
        "region": {
          "x": 18.74,
          "y": 23.19,
          "w": 45.83,
          "h": 76.81
        },
        "genericCategories": [
          "diagram-map"
        ],
        "learningRoles": [
          "comparison",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "phylogeny",
          "plant"
        ],
        "confidence": 0.96,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p15"
      },
      {
        "id": "o15b",
        "label": "複数の植物化石",
        "observationType": "physical",
        "region": {
          "x": 59,
          "y": 10,
          "w": 39,
          "h": 84
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "evidence",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "plant"
        ],
        "confidence": 0.93,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p15"
      },
      {
        "id": "o15c",
        "label": "森を彩ったシダ植物たちの説明文",
        "observationType": "information",
        "region": {
          "x": 19.38,
          "y": 9.52,
          "w": 20.19,
          "h": 16.66
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "plant"
        ],
        "confidence": 0.82,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p15"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p16",
    "file": "43098_0.jpg",
    "order": 16,
    "title": "昆虫の進化展示",
    "status": "in-progress",
    "experienceMemo": "虫はどこにでもいるのさ　場所も時間も超えて",
    "observations": [
      {
        "id": "o16b",
        "label": "昆虫化石の標本と系統分類",
        "observationType": "physical",
        "region": {
          "x": 0,
          "y": 35.55,
          "w": 99.29,
          "h": 35.32
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "insect"
        ],
        "confidence": 0.89,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p16"
      },
      {
        "id": "o16c",
        "label": "背景の森林模型",
        "observationType": "physical",
        "region": {
          "x": 18,
          "y": 0,
          "w": 63,
          "h": 32
        },
        "genericCategories": [
          "replica-model"
        ],
        "learningRoles": [
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "paleoenvironment",
          "plant"
        ],
        "confidence": 0.84,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p16"
      },
      {
        "id": "observation-1786489403675-rgfh62",
        "label": "昆虫類の進化の説明",
        "observationType": "information",
        "region": {
          "x": 20.99,
          "y": 30.14,
          "w": 26.39,
          "h": 7.98
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "direct",
          "explains"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [],
        "confidence": 1,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p16"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p17",
    "file": "43099_0.jpg",
    "order": 17,
    "title": "恐竜時代の森",
    "status": "in-progress",
    "experienceMemo": "裸子植物全盛期",
    "observations": [
      {
        "id": "o17a",
        "label": "中生代の森林復元模型",
        "observationType": "physical",
        "region": {
          "x": 0,
          "y": 0,
          "w": 64,
          "h": 90
        },
        "genericCategories": [
          "replica-model"
        ],
        "learningRoles": [
          "direct",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "paleoenvironment",
          "plant"
        ],
        "confidence": 0.96,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p17"
      },
      {
        "id": "o17b",
        "label": "「恐竜時代の森」の説明パネル",
        "observationType": "information",
        "region": {
          "x": 49,
          "y": 2,
          "w": 48,
          "h": 69
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "paleoenvironment",
          "plant"
        ],
        "confidence": 0.98,
        "status": "confirmed",
        "visibleText": [
          "恐竜時代の森"
        ],
        "entityId": null,
        "photoId": "p17"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p18",
    "file": "43100_0.jpg",
    "order": 18,
    "title": "空を飛ぶ爬虫類の骨格",
    "status": "in-progress",
    "experienceMemo": "骨で見ると軽そうだよね",
    "observations": [
      {
        "id": "o18a",
        "label": "上部の翼を広げた骨格",
        "observationType": "physical",
        "region": {
          "x": 1.54,
          "y": 7.69,
          "w": 78.2,
          "h": 57.25
        },
        "genericCategories": [
          "exhibit-object",
          "replica-model"
        ],
        "learningRoles": [
          "direct",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "pterosaur"
        ],
        "confidence": 0.97,
        "status": "confirmed",
        "visibleText": [],
        "entityId": "e-pterosaur",
        "photoId": "p18"
      },
      {
        "id": "o18b",
        "label": "下部の別の飛翔骨格",
        "observationType": "physical",
        "region": {
          "x": 13.4,
          "y": 71.21,
          "w": 51.39,
          "h": 28.79
        },
        "genericCategories": [
          "exhibit-object",
          "replica-model"
        ],
        "learningRoles": [
          "direct",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "pterosaur"
        ],
        "confidence": 0.92,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p18"
      },
      {
        "id": "o18c",
        "label": "右側に一部写る大型骨格",
        "observationType": "physical",
        "region": {
          "x": 47.37,
          "y": 35.75,
          "w": 51.28,
          "h": 43.58
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "dinosaur"
        ],
        "confidence": 0.78,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p18"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p19",
    "file": "43101_0.jpg",
    "order": 19,
    "title": "空の爬虫類の解説",
    "status": "organized",
    "experienceMemo": "自由に色付けしてそう",
    "observations": [
      {
        "id": "o19a",
        "label": "翼竜の復元イラスト",
        "observationType": "information",
        "region": {
          "x": 3.57,
          "y": 19.37,
          "w": 52.24,
          "h": 51.7
        },
        "genericCategories": [
          "media-image"
        ],
        "learningRoles": [
          "comparison",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "restoration",
          "pterosaur"
        ],
        "confidence": 0.98,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p19"
      },
      {
        "id": "o19b",
        "label": "「空の爬虫類」の説明パネル",
        "observationType": "information",
        "region": {
          "x": 53.46,
          "y": 18.94,
          "w": 29.59,
          "h": 55.26
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "context"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "pterosaur"
        ],
        "confidence": 0.99,
        "status": "confirmed",
        "visibleText": [
          "空の爬虫類"
        ],
        "entityId": "e-pterosaur",
        "photoId": "p19"
      }
    ],
    "visitId": "visit-fukui"
  },
  {
    "id": "p20",
    "file": "43102_0.jpg",
    "order": 20,
    "title": "初期哺乳類の化石展示",
    "status": "in-progress",
    "observations": [
      {
        "id": "o20a",
        "label": "上部の小型哺乳類骨格",
        "observationType": "physical",
        "region": {
          "x": 31,
          "y": 0,
          "w": 64,
          "h": 44
        },
        "genericCategories": [
          "exhibit-object",
          "replica-model"
        ],
        "learningRoles": [
          "direct",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "skeleton",
          "mammal-human"
        ],
        "confidence": 0.92,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null,
        "photoId": "p20"
      },
      {
        "id": "o20b",
        "label": "右下の化石板",
        "observationType": "physical",
        "region": {
          "x": 70,
          "y": 47,
          "w": 29,
          "h": 42
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "evidence",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human"
        ],
        "confidence": 0.9,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p20"
      },
      {
        "id": "o20c",
        "label": "下部の歯と顎の比較展示",
        "observationType": "physical",
        "region": {
          "x": 23,
          "y": 56,
          "w": 47,
          "h": 35
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "comparison",
          "detail"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "fossil",
          "mammal-human",
          "anatomy"
        ],
        "confidence": 0.89,
        "status": "suggested",
        "visibleText": [],
        "entityId": null,
        "photoId": "p20"
      },
      {
        "id": "o20d",
        "label": "真獣類と後獣類の説明",
        "observationType": "information",
        "region": {
          "x": 23,
          "y": 54,
          "w": 47,
          "h": 38
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "comparison"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "evolution"
        ],
        "confidence": 0.94,
        "status": "suggested",
        "visibleText": [
          "真獣類と後獣類"
        ],
        "entityId": null,
        "photoId": "p20"
      }
    ],
    "visitId": "visit-fukui"
  }
];

export const SAMPLE_RELATIONS = [
  {
    "id": "r01",
    "sourceId": "o03c",
    "targetId": "o03a",
    "type": "explains",
    "status": "suggested",
    "confidence": 0.92
  },
  {
    "id": "r02",
    "sourceId": "o03d",
    "targetId": "o03b",
    "type": "explains",
    "status": "suggested",
    "confidence": 0.9
  },
  {
    "id": "r03",
    "sourceId": "o02b",
    "targetId": "o03a",
    "type": "compares",
    "status": "confirmed",
    "confidence": 0.88
  },
  {
    "id": "r04",
    "sourceId": "o05d",
    "targetId": "o05a",
    "type": "part-of",
    "status": "confirmed",
    "confidence": 0.87
  },
  {
    "id": "r05",
    "sourceId": "o05b",
    "targetId": "o06a",
    "type": "different-angle",
    "status": "confirmed",
    "confidence": 0.95
  },
  {
    "id": "r06",
    "sourceId": "o08a",
    "targetId": "o07a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 0.99
  },
  {
    "id": "r07",
    "sourceId": "o08a",
    "targetId": "o07a",
    "type": "same-exhibit",
    "status": "confirmed",
    "confidence": 0.99
  },
  {
    "id": "r08",
    "sourceId": "o10a",
    "targetId": "observation-1786486286966-y2ninf",
    "type": "explains",
    "status": "confirmed",
    "confidence": 0.78
  },
  {
    "id": "r09",
    "sourceId": "o10a",
    "targetId": "o12a",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 0.82
  },
  {
    "id": "r10",
    "sourceId": "o10a",
    "targetId": "o13a",
    "type": "same-theme",
    "status": "rejected",
    "confidence": 0.79
  },
  {
    "id": "r11",
    "sourceId": "o10b",
    "targetId": "o14a",
    "type": "compares",
    "status": "rejected",
    "confidence": 0.8
  },
  {
    "id": "r12",
    "sourceId": "o15a",
    "targetId": "o15b",
    "type": "explains",
    "status": "confirmed",
    "confidence": 0.91
  },
  {
    "id": "r13",
    "sourceId": "o15a",
    "targetId": "o17a",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 0.83
  },
  {
    "id": "r14",
    "sourceId": "o16c",
    "targetId": "o17a",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 0.86
  },
  {
    "id": "r15",
    "sourceId": "o19b",
    "targetId": "o18a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 0.98
  },
  {
    "id": "r16",
    "sourceId": "o19b",
    "targetId": "o18a",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 0.99
  },
  {
    "id": "r17",
    "sourceId": "o20d",
    "targetId": "o20c",
    "type": "explains",
    "status": "suggested",
    "confidence": 0.94
  },
  {
    "id": "r18",
    "sourceId": "o20d",
    "targetId": "o20a",
    "type": "explains",
    "status": "suggested",
    "confidence": 0.88
  },
  {
    "id": "r19",
    "sourceId": "o08a",
    "targetId": "o07b",
    "type": "part-of",
    "directed": true,
    "status": "rejected",
    "confidence": 0.96
  },
  {
    "id": "relation-1786478439107-8dtguq",
    "sourceId": "observation-1786474991493-bklj8g",
    "targetId": "o01a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786478439108-73sc1b",
    "sourceId": "observation-1786474991493-bklj8g",
    "targetId": "o01a",
    "type": "part-of",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786478604650-kd1xk5",
    "sourceId": "o02a",
    "targetId": "o02b",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786478604650-n5m78i",
    "sourceId": "o02a",
    "targetId": "o02b",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786478880853-4hyyvy",
    "sourceId": "o03c",
    "targetId": "o02c",
    "type": "same-exhibit",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786479489427-708au3",
    "sourceId": "observation-1786479078639-wnd5o5",
    "targetId": "o04c",
    "type": "part-of",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786479489427-9agolv",
    "sourceId": "observation-1786479078639-wnd5o5",
    "targetId": "o04c",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786479520103-cguwza",
    "sourceId": "o04b",
    "targetId": "o04c",
    "type": "part-of",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786479520103-izaqgo",
    "sourceId": "o04b",
    "targetId": "o04c",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786479543280-j5y6gz",
    "sourceId": "o04a",
    "targetId": "o04c",
    "type": "part-of",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786479543280-cuv54d",
    "sourceId": "o04a",
    "targetId": "o04c",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786479580006-yrt1q0",
    "sourceId": "o04c",
    "targetId": "o03a",
    "type": "same-exhibit",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786483072603-e7ogld",
    "sourceId": "o05a",
    "targetId": "o05d",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786483156412-d84ylc",
    "sourceId": "o05c",
    "targetId": "o05b",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786483156412-r9rvfh",
    "sourceId": "o05c",
    "targetId": "o05b",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786483384602-cfr23g",
    "sourceId": "o05d",
    "targetId": "o06b",
    "type": "different-angle",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786484069571-59d4az",
    "sourceId": "observation-1786483877498-1y3oqe",
    "targetId": "o09a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786484069571-s2bvb4",
    "sourceId": "observation-1786483877498-1y3oqe",
    "targetId": "o09a",
    "type": "same-exhibit",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786486051207-v3d7jg",
    "sourceId": "observation-1786485969270-seaud5",
    "targetId": "o10a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786486075362-a9fxco",
    "sourceId": "observation-1786485939454-5t0668",
    "targetId": "o10b",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786486511343-j7q0cb",
    "sourceId": "observation-1786486286966-y2ninf",
    "targetId": "o10b",
    "type": "same-theme",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786486541759-9r27bo",
    "sourceId": "observation-1786486164546-c1wv0t",
    "targetId": "o11a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786486564778-47mzvx",
    "sourceId": "observation-1786486322662-frsf5g",
    "targetId": "observation-1786486286966-y2ninf",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786486862149-ysreg5",
    "sourceId": "o12b",
    "targetId": "o11a",
    "type": "different-angle",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786486889398-w1r89z",
    "sourceId": "observation-1786486760427-qzb7ux",
    "targetId": "o12a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786486946586-p210vi",
    "sourceId": "o10b",
    "targetId": "o12c",
    "type": "same-place",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786487852695-95ai8q",
    "sourceId": "o13c",
    "targetId": "o13a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786487891489-3hm4ep",
    "sourceId": "observation-1786487119764-snol9h",
    "targetId": "o13b",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786487925864-ibmirz",
    "sourceId": "observation-1786487154914-chts1k",
    "targetId": "observation-1786487138402-rj9yws",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786487943789-dh37ww",
    "sourceId": "observation-1786487246801-nho1mw",
    "targetId": "observation-1786487200718-en3nos",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786488185187-uui32c",
    "sourceId": "observation-1786488108415-lyoyrg",
    "targetId": "o14b",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786488203977-6vi44y",
    "sourceId": "observation-1786488077847-p3ql7f",
    "targetId": "o14a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786488385481-5s4ze3",
    "sourceId": "o15c",
    "targetId": "o15a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786489465155-cmddna",
    "sourceId": "observation-1786489403675-rgfh62",
    "targetId": "o16b",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786489897197-bp4aw1",
    "sourceId": "o17b",
    "targetId": "o17a",
    "type": "explains",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  },
  {
    "id": "relation-1786489915831-n1i568",
    "sourceId": "o17a",
    "targetId": "o16c",
    "type": "different-angle",
    "status": "confirmed",
    "confidence": 1,
    "origin": "user"
  }
];

export const SAMPLE_ENTITIES = [
  {
    "id": "e-basilo",
    "name": "バシロサウルス",
    "type": "生物名",
    "status": "optional"
  },
  {
    "id": "e-pterosaur",
    "name": "翼竜",
    "type": "生物群",
    "status": "optional"
  }
];

export const LEARNING_FACTS = [
  {
    "id": "f01",
    "targetId": "o07a",
    "label": "バシロサウルスは初期のクジラ類に含まれる",
    "sourceType": "panel",
    "sourceObservationId": "o08a",
    "status": "locked",
    "topic": "クジラの進化"
  },
  {
    "id": "f02",
    "targetId": "o07a",
    "label": "展示では始新世の生物として紹介されている",
    "sourceType": "panel",
    "sourceObservationId": "o08b",
    "status": "locked",
    "topic": "クジラの進化"
  },
  {
    "id": "f03",
    "targetId": "o18a",
    "label": "翼竜は恐竜とは別の系統の爬虫類である",
    "sourceType": "learning",
    "sourceObservationId": "o19b",
    "status": "locked",
    "topic": "空の生物"
  },
  {
    "id": "f04",
    "targetId": "o17a",
    "label": "中生代の森林は時代とともに主要な植物群が変化した",
    "sourceType": "panel",
    "sourceObservationId": "o17b",
    "status": "locked",
    "topic": "恐竜時代の環境"
  },
  {
    "id": "f05",
    "targetId": "o02b",
    "label": "人類進化では複数の系統で脳容量が異なる",
    "sourceType": "panel",
    "sourceObservationId": "o02a",
    "status": "locked",
    "topic": "人類の進化"
  },
  {
    "id": "f06",
    "targetId": "o10a",
    "label": "長鼻類には多様な頭骨と牙の形があった",
    "sourceType": "learning",
    "sourceObservationId": "o10b",
    "status": "locked",
    "topic": "大型哺乳類"
  },
  {
    "id": "f07",
    "targetId": "o15a",
    "label": "植物の系統も地質時代の中で分岐し多様化した",
    "sourceType": "learning",
    "sourceObservationId": "o15b",
    "status": "locked",
    "topic": "植物の進化"
  }
];

export const SAMPLE_COLLECTIONS = [
  {
    "id": "c-human",
    "title": "人類の進化",
    "icon": "◉",
    "photoIds": [
      "p02",
      "p03",
      "p04",
      "p05",
      "p06"
    ],
    "factIds": [
      "f05"
    ]
  },
  {
    "id": "c-whale",
    "title": "クジラの進化",
    "icon": "≈",
    "photoIds": [
      "p07",
      "p08"
    ],
    "factIds": [
      "f01",
      "f02"
    ]
  },
  {
    "id": "c-mammal",
    "title": "大型哺乳類",
    "icon": "✦",
    "photoIds": [
      "p09",
      "p10",
      "p11",
      "p12",
      "p13",
      "p14"
    ],
    "factIds": [
      "f06"
    ]
  },
  {
    "id": "c-plant",
    "title": "植物と環境",
    "icon": "⌁",
    "photoIds": [
      "p15",
      "p17"
    ],
    "factIds": [
      "f04",
      "f07"
    ]
  },
  {
    "id": "c-insect",
    "title": "昆虫の進化",
    "icon": "⌬",
    "photoIds": [
      "p16"
    ],
    "factIds": []
  },
  {
    "id": "c-pterosaur",
    "title": "空の爬虫類",
    "icon": "△",
    "photoIds": [
      "p18",
      "p19"
    ],
    "factIds": [
      "f03"
    ]
  },
  {
    "id": "c-early-mammal",
    "title": "初期哺乳類",
    "icon": "◌",
    "photoIds": [
      "p20"
    ],
    "factIds": []
  },
  {
    "id": "c-vertebrate",
    "title": "脊椎動物の系統",
    "icon": "⟲",
    "photoIds": [
      "p01"
    ],
    "factIds": []
  }
];

export const SAMPLE_STORIES = [
  {
    "id": "s1",
    "title": "写真から複数の対象を見つける",
    "subtitle": "観察の入口",
    "description": "写真を一つの知識に固定せず、実体・説明・図表・空間を分けて見直します。",
    "photoIds": [
      "p03",
      "p15",
      "p20"
    ],
    "steps": [
      "写真内の候補を複数確認",
      "汎用分類を付与",
      "分野別の浅い分類へ進む"
    ]
  },
  {
    "id": "s2",
    "title": "展示物と説明をつなぐ",
    "subtitle": "関係の整理",
    "description": "骨格と説明パネルを別々のObservationとして保存し、「同じ展示」「説明している」でつなぎます。",
    "photoIds": [
      "p07",
      "p08",
      "p18",
      "p19"
    ],
    "steps": [
      "別写真の対象を確認",
      "関係候補を承認",
      "知識マップでつながりを見る"
    ]
  },
  {
    "id": "s3",
    "title": "見た知識から詳しく学ぶ",
    "subtitle": "知識の拡張",
    "description": "入力時には要求しなかった時代・分類・背景を、学習カードと問題から段階的に追加します。",
    "photoIds": [
      "p02",
      "p07",
      "p17"
    ],
    "steps": [
      "自分が見た知識を確認",
      "詳しく学ぶを選択",
      "追加学習問題で復習"
    ]
  }
];

/** Every demo Observation, flattened out of its Photo. */
export const SAMPLE_OBSERVATIONS = SAMPLE_PHOTOS.flatMap(photo => photo.observations);
