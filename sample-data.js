/* Your Knowledge sample model: Photo ≠ Observation ≠ Entity ≠ LearningFact */

window.YOUR_KNOWLEDGE_DATA_MODEL = {
  version: 2,
  records: [
    "Visit",
    "Photo",
    "Observation",
    "ObservationRelation",
    "Entity",
    "LearningFact",
    "Collection",
    "Question"
  ],
  note: "Runtimeでは表示効率のためObservationをPhoto内へ配置し、JSON出力時はphotoIdを持つ独立レコードへ正規化する。"
};

window.GENERIC_CATEGORIES = [
  {
    "id": "exhibit-object",
    "label": "展示物・現物",
    "icon": "◆",
    "description": "標本、作品、文化財、道具など"
  },
  {
    "id": "replica-model",
    "label": "模型・複製・復元",
    "icon": "⬡",
    "description": "レプリカ、復元骨格、ジオラマなど"
  },
  {
    "id": "explanation-panel",
    "label": "説明パネル・ラベル",
    "icon": "▤",
    "description": "名称ラベル、解説文、案内板など"
  },
  {
    "id": "diagram-map",
    "label": "図表・地図",
    "icon": "⌘",
    "description": "系統図、時間軸、グラフ、地図など"
  },
  {
    "id": "place-landscape",
    "label": "場所・景観",
    "icon": "▧",
    "description": "展示空間、建築、森林、遺跡など"
  },
  {
    "id": "living-natural",
    "label": "生物・自然物",
    "icon": "✦",
    "description": "樹木、動物、岩石、地形など"
  },
  {
    "id": "person-activity",
    "label": "人物・活動",
    "icon": "◉",
    "description": "人物、作業、祭り、体験など"
  },
  {
    "id": "media-image",
    "label": "映像・画像",
    "icon": "▣",
    "description": "スクリーン、古写真、復元画など"
  },
  {
    "id": "unknown",
    "label": "未判定",
    "icon": "?",
    "description": "まだ分類していない対象"
  }
];

window.LEARNING_ROLES = [
  {
    "id": "direct",
    "label": "見た対象"
  },
  {
    "id": "explains",
    "label": "説明するもの"
  },
  {
    "id": "comparison",
    "label": "比較するもの"
  },
  {
    "id": "context",
    "label": "背景・文脈"
  },
  {
    "id": "detail",
    "label": "部分・細部"
  },
  {
    "id": "route",
    "label": "場所・経路"
  },
  {
    "id": "memory",
    "label": "体験・思い出"
  },
  {
    "id": "evidence",
    "label": "証拠・資料"
  }
];

window.DOMAIN_PACKS = [
  {
    "id": "paleontology",
    "label": "自然史・古生物",
    "icon": "🦴",
    "description": "恐竜、進化、化石、地質時代"
  },
  {
    "id": "cultural",
    "label": "美術・文化財",
    "icon": "🏺",
    "description": "故宮、工芸、書画、文化財"
  },
  {
    "id": "nature",
    "label": "自然・生態",
    "icon": "🌲",
    "description": "屋久島、森林、生物、保全"
  },
  {
    "id": "history",
    "label": "歴史・考古",
    "icon": "📜",
    "description": "歴史資料、人物、出来事、地域"
  },
  {
    "id": "other",
    "label": "その他",
    "icon": "＋",
    "description": "分野をあとで決める"
  }
];

window.DOMAIN_CATEGORIES = {
  "paleontology": [
    {
      "id": "skeleton",
      "label": "骨格標本"
    },
    {
      "id": "fossil",
      "label": "化石・標本"
    },
    {
      "id": "restoration",
      "label": "生体復元・模型"
    },
    {
      "id": "trace",
      "label": "足跡・痕跡"
    },
    {
      "id": "rock-strata",
      "label": "岩石・地層"
    },
    {
      "id": "phylogeny",
      "label": "系統図"
    },
    {
      "id": "geologic-time",
      "label": "地質年代・時間軸"
    },
    {
      "id": "paleoenvironment",
      "label": "古環境"
    },
    {
      "id": "dinosaur",
      "label": "恐竜"
    },
    {
      "id": "saurischia",
      "label": "竜盤類"
    },
    {
      "id": "ornithischia",
      "label": "鳥盤類"
    },
    {
      "id": "pterosaur",
      "label": "翼竜"
    },
    {
      "id": "marine-reptile",
      "label": "海生爬虫類"
    },
    {
      "id": "mammal-human",
      "label": "哺乳類・人類"
    },
    {
      "id": "plant",
      "label": "植物"
    },
    {
      "id": "insect",
      "label": "昆虫"
    },
    {
      "id": "evolution",
      "label": "進化・系統"
    },
    {
      "id": "anatomy",
      "label": "身体構造"
    },
    {
      "id": "exhibit-space",
      "label": "展示空間"
    }
  ],
  "cultural": [
    {
      "id": "painting",
      "label": "絵画"
    },
    {
      "id": "calligraphy",
      "label": "書"
    },
    {
      "id": "document",
      "label": "文書"
    },
    {
      "id": "ceramic",
      "label": "陶磁器"
    },
    {
      "id": "bronze",
      "label": "青銅器"
    },
    {
      "id": "jade",
      "label": "玉器"
    },
    {
      "id": "lacquer",
      "label": "漆器"
    },
    {
      "id": "wood",
      "label": "木工"
    },
    {
      "id": "metal",
      "label": "金工"
    },
    {
      "id": "textile",
      "label": "織物"
    },
    {
      "id": "furniture",
      "label": "家具"
    },
    {
      "id": "religious",
      "label": "宗教用品"
    },
    {
      "id": "daily-life",
      "label": "生活用品"
    },
    {
      "id": "material",
      "label": "素材"
    },
    {
      "id": "technique",
      "label": "製作技法"
    },
    {
      "id": "motif",
      "label": "文様"
    },
    {
      "id": "dynasty",
      "label": "王朝・時代"
    },
    {
      "id": "ritual",
      "label": "儀礼・生活"
    }
  ],
  "nature": [
    {
      "id": "tree",
      "label": "樹木"
    },
    {
      "id": "plant",
      "label": "草本・植物"
    },
    {
      "id": "moss-fern",
      "label": "コケ・シダ"
    },
    {
      "id": "animal",
      "label": "動物"
    },
    {
      "id": "rock",
      "label": "岩石"
    },
    {
      "id": "water",
      "label": "水・河川"
    },
    {
      "id": "terrain",
      "label": "地形"
    },
    {
      "id": "forest",
      "label": "森林"
    },
    {
      "id": "trail",
      "label": "登山道"
    },
    {
      "id": "viewpoint",
      "label": "展望地点"
    },
    {
      "id": "guide-board",
      "label": "案内板"
    },
    {
      "id": "species",
      "label": "生物種"
    },
    {
      "id": "individual",
      "label": "個体"
    },
    {
      "id": "ecology",
      "label": "森林生態"
    },
    {
      "id": "structure",
      "label": "樹木の構造"
    },
    {
      "id": "climate",
      "label": "気候"
    },
    {
      "id": "conservation",
      "label": "自然保護"
    },
    {
      "id": "human-nature",
      "label": "人と自然"
    }
  ],
  "history": [
    {
      "id": "old-document",
      "label": "古文書"
    },
    {
      "id": "map",
      "label": "地図"
    },
    {
      "id": "photo-record",
      "label": "写真・記録"
    },
    {
      "id": "picture",
      "label": "絵図"
    },
    {
      "id": "newspaper",
      "label": "新聞"
    },
    {
      "id": "daily-tool",
      "label": "生活道具"
    },
    {
      "id": "weapon",
      "label": "武具"
    },
    {
      "id": "agriculture",
      "label": "農具"
    },
    {
      "id": "clothing",
      "label": "衣服"
    },
    {
      "id": "currency",
      "label": "貨幣"
    },
    {
      "id": "pottery",
      "label": "土器・陶器"
    },
    {
      "id": "archaeology",
      "label": "考古資料"
    },
    {
      "id": "timeline",
      "label": "年表"
    },
    {
      "id": "diorama",
      "label": "ジオラマ"
    },
    {
      "id": "era",
      "label": "時代"
    },
    {
      "id": "event",
      "label": "出来事"
    },
    {
      "id": "person",
      "label": "人物"
    },
    {
      "id": "region",
      "label": "地域"
    },
    {
      "id": "life",
      "label": "生活"
    },
    {
      "id": "industry",
      "label": "産業"
    },
    {
      "id": "politics",
      "label": "政治"
    },
    {
      "id": "war",
      "label": "戦争"
    },
    {
      "id": "culture",
      "label": "文化"
    }
  ],
  "other": [
    {
      "id": "unclassified",
      "label": "未分類"
    }
  ]
};

window.VISIT_TEMPLATES = [
  {
    "id": "paleontology",
    "title": "恐竜・自然史博物館",
    "description": "展示物、骨格、説明パネル、系統図を整理",
    "icon": "🦕"
  },
  {
    "id": "cultural",
    "title": "美術館・文化財施設",
    "description": "作品、素材、技法、説明ラベルを整理",
    "icon": "🏺"
  },
  {
    "id": "nature",
    "title": "自然・観光地",
    "description": "樹木、地形、案内板、体験を整理",
    "icon": "🌲"
  },
  {
    "id": "history",
    "title": "歴史・資料館",
    "description": "文書、道具、人物、出来事を整理",
    "icon": "🏛"
  }
];

window.RELATION_TYPES = [
  {
    "id": "explains",
    "label": "説明している"
  },
  {
    "id": "part-of",
    "label": "部分と全体"
  },
  {
    "id": "same-object",
    "label": "同じ物理対象"
  },
  {
    "id": "same-exhibit",
    "label": "同じ展示"
  },
  {
    "id": "same-place",
    "label": "同じ場所"
  },
  {
    "id": "same-theme",
    "label": "同じテーマ"
  },
  {
    "id": "different-angle",
    "label": "別角度"
  },
  {
    "id": "compares",
    "label": "比較している"
  },
  {
    "id": "nearby-time",
    "label": "撮影順が近い"
  }
];

window.SAMPLE_VISIT = {
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

window.SAMPLE_PHOTOS = [
  {
    "id": "p01",
    "file": "43083_0.jpg",
    "order": 1,
    "title": "脊椎動物の系統展示",
    "status": "organized",
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
        "entityId": null
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
        "entityId": null
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p02",
    "file": "43084_0.jpg",
    "order": 2,
    "title": "人類の脳に関する展示",
    "status": "organized",
    "observations": [
      {
        "id": "o02a",
        "label": "「拡大した脳」の説明パネル",
        "observationType": "information",
        "region": {
          "x": 9,
          "y": 3,
          "w": 76,
          "h": 43
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
        "entityId": null
      },
      {
        "id": "o02b",
        "label": "脳容量の比較グラフ",
        "observationType": "information",
        "region": {
          "x": 12,
          "y": 42,
          "w": 75,
          "h": 51
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
        "entityId": null
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p03",
    "file": "43085_0.jpg",
    "order": 3,
    "title": "人類進化展示の全景",
    "status": "in-progress",
    "observations": [
      {
        "id": "o03a",
        "label": "複数の頭骨標本",
        "observationType": "physical",
        "region": {
          "x": 2,
          "y": 12,
          "w": 92,
          "h": 47
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o03b",
        "label": "中央の全身骨格",
        "observationType": "physical",
        "region": {
          "x": 31,
          "y": 35,
          "w": 34,
          "h": 62
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o03c",
        "label": "左下の脳容量パネル",
        "observationType": "information",
        "region": {
          "x": 1,
          "y": 62,
          "w": 29,
          "h": 35
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o03d",
        "label": "右下の二足歩行パネル",
        "observationType": "information",
        "region": {
          "x": 61,
          "y": 61,
          "w": 25,
          "h": 36
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p04",
    "file": "43086_0.jpg",
    "order": 4,
    "title": "初期人類の標本比較",
    "status": "in-progress",
    "observations": [
      {
        "id": "o04a",
        "label": "右側の頭骨標本",
        "observationType": "physical",
        "region": {
          "x": 61,
          "y": 18,
          "w": 34,
          "h": 43
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail",
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
        "confidence": 0.94,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o04b",
        "label": "中央下の顎化石",
        "observationType": "physical",
        "region": {
          "x": 31,
          "y": 49,
          "w": 31,
          "h": 27
        },
        "genericCategories": [
          "exhibit-object"
        ],
        "learningRoles": [
          "direct",
          "detail",
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
        "confidence": 0.91,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o04c",
        "label": "標本名と産地のラベル",
        "observationType": "information",
        "region": {
          "x": 12,
          "y": 23,
          "w": 79,
          "h": 66
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
        "confidence": 0.88,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p05",
    "file": "43087_0.jpg",
    "order": 5,
    "title": "人類と霊長類の展示",
    "status": "in-progress",
    "observations": [
      {
        "id": "o05a",
        "label": "「自然の中の人類」パネル",
        "observationType": "information",
        "region": {
          "x": 37,
          "y": 6,
          "w": 55,
          "h": 39
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
        "confidence": 0.96,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o05b",
        "label": "霊長類の系統表示",
        "observationType": "information",
        "region": {
          "x": 3,
          "y": 40,
          "w": 70,
          "h": 54
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
        "entityId": null
      },
      {
        "id": "o05c",
        "label": "「霊長類の繁栄」パネル",
        "observationType": "information",
        "region": {
          "x": 58,
          "y": 42,
          "w": 34,
          "h": 35
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
        "confidence": 0.94,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p06",
    "file": "43088_0.jpg",
    "order": 6,
    "title": "霊長類の系統図",
    "status": "in-progress",
    "observations": [
      {
        "id": "o06a",
        "label": "霊長類の系統図",
        "observationType": "information",
        "region": {
          "x": 4,
          "y": 22,
          "w": 82,
          "h": 75
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
        "confidence": 0.97,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o06b",
        "label": "霊長類の骨格標本",
        "observationType": "physical",
        "region": {
          "x": 4,
          "y": 0,
          "w": 80,
          "h": 32
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p07",
    "file": "43089_0.jpg",
    "order": 7,
    "title": "大型の水生哺乳類骨格",
    "status": "organized",
    "observations": [
      {
        "id": "o07a",
        "label": "細長い全身骨格",
        "observationType": "physical",
        "region": {
          "x": 6,
          "y": 5,
          "w": 67,
          "h": 92
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
        "entityId": "e-basilo"
      },
      {
        "id": "o07b",
        "label": "展示空間と周囲の標本",
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
          "exhibit-space"
        ],
        "confidence": 0.78,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p08",
    "file": "43090_0.jpg",
    "order": 8,
    "title": "大型の水生哺乳類の説明",
    "status": "organized",
    "observations": [
      {
        "id": "o08a",
        "label": "名称と解説が書かれた展示パネル",
        "observationType": "information",
        "region": {
          "x": 21,
          "y": 15,
          "w": 62,
          "h": 57
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "evidence"
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
        "entityId": "e-basilo"
      },
      {
        "id": "o08b",
        "label": "分類・時代・産地の記載",
        "observationType": "information",
        "region": {
          "x": 25,
          "y": 25,
          "w": 51,
          "h": 20
        },
        "genericCategories": [
          "explanation-panel"
        ],
        "learningRoles": [
          "explains",
          "evidence"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "mammal-human",
          "geologic-time"
        ],
        "confidence": 0.96,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p09",
    "file": "43091_0.jpg",
    "order": 9,
    "title": "新生代の大型哺乳類展示",
    "status": "in-progress",
    "observations": [
      {
        "id": "o09a",
        "label": "大きな角を持つ全身骨格",
        "observationType": "physical",
        "region": {
          "x": 0,
          "y": 13,
          "w": 66,
          "h": 82
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
        "confidence": 0.9,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o09b",
        "label": "長い牙を持つ頭骨",
        "observationType": "physical",
        "region": {
          "x": 55,
          "y": 0,
          "w": 45,
          "h": 66
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
        "confidence": 0.88,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p10",
    "file": "43092_0.jpg",
    "order": 10,
    "title": "長鼻類の系統と頭骨比較",
    "status": "in-progress",
    "rotation": 180,
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
        "entityId": null
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
        "entityId": null
      },
      {
        "id": "o10c",
        "label": "上下逆に撮影された写真",
        "observationType": "feature",
        "region": null,
        "genericCategories": [
          "unknown"
        ],
        "learningRoles": [
          "memory"
        ],
        "domainPacks": [
          "paleontology"
        ],
        "domainCategories": [
          "exhibit-space"
        ],
        "confidence": 0.99,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p11",
    "file": "43093_0.jpg",
    "order": 11,
    "title": "大型哺乳類の頭骨と骨格",
    "status": "in-progress",
    "observations": [
      {
        "id": "o11a",
        "label": "手前の大きな頭骨と牙",
        "observationType": "physical",
        "region": {
          "x": 10,
          "y": 20,
          "w": 61,
          "h": 65
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
        "entityId": null
      },
      {
        "id": "o11b",
        "label": "背景の全身骨格",
        "observationType": "physical",
        "region": {
          "x": 4,
          "y": 0,
          "w": 88,
          "h": 95
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
        "confidence": 0.84,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o11c",
        "label": "展示ラベル",
        "observationType": "information",
        "region": {
          "x": 6,
          "y": 73,
          "w": 68,
          "h": 21
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
        "confidence": 0.78,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p12",
    "file": "43094_0.jpg",
    "order": 12,
    "title": "長鼻類の骨格展示",
    "status": "in-progress",
    "observations": [
      {
        "id": "o12a",
        "label": "中央の全身骨格",
        "observationType": "physical",
        "region": {
          "x": 18,
          "y": 0,
          "w": 66,
          "h": 90
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o12b",
        "label": "左の頭骨標本",
        "observationType": "physical",
        "region": {
          "x": 0,
          "y": 35,
          "w": 45,
          "h": 50
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o12c",
        "label": "手前の解説台",
        "observationType": "information",
        "region": {
          "x": 12,
          "y": 72,
          "w": 78,
          "h": 27
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p13",
    "file": "43095_0.jpg",
    "order": 13,
    "title": "角を持つ大型哺乳類",
    "status": "in-progress",
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
        "entityId": null
      },
      {
        "id": "o13b",
        "label": "背景の全身骨格",
        "observationType": "physical",
        "region": {
          "x": 29,
          "y": 0,
          "w": 55,
          "h": 89
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
        "entityId": null
      },
      {
        "id": "o13c",
        "label": "複数の展示ラベル",
        "observationType": "information",
        "region": {
          "x": 4,
          "y": 66,
          "w": 89,
          "h": 31
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p14",
    "file": "43096_0.jpg",
    "order": 14,
    "title": "巨大な頭骨の比較展示",
    "status": "in-progress",
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
        "entityId": null
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
        "entityId": null
      },
      {
        "id": "o14c",
        "label": "手前の体サイズ変化グラフ",
        "observationType": "information",
        "region": {
          "x": 12,
          "y": 68,
          "w": 72,
          "h": 29
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p15",
    "file": "43097_0.jpg",
    "order": 15,
    "title": "シダ植物の系統と化石",
    "status": "in-progress",
    "observations": [
      {
        "id": "o15a",
        "label": "シダ植物の系統図",
        "observationType": "information",
        "region": {
          "x": 0,
          "y": 8,
          "w": 62,
          "h": 87
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
        "entityId": null
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
        "entityId": null
      },
      {
        "id": "o15c",
        "label": "説明文",
        "observationType": "information",
        "region": {
          "x": 0,
          "y": 0,
          "w": 47,
          "h": 27
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p16",
    "file": "43098_0.jpg",
    "order": 16,
    "title": "昆虫の進化展示",
    "status": "in-progress",
    "observations": [
      {
        "id": "o16a",
        "label": "昆虫の進化時間軸",
        "observationType": "information",
        "region": {
          "x": 0,
          "y": 27,
          "w": 96,
          "h": 69
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
          "insect",
          "geologic-time"
        ],
        "confidence": 0.94,
        "status": "suggested",
        "visibleText": [],
        "entityId": null
      },
      {
        "id": "o16b",
        "label": "昆虫化石の標本",
        "observationType": "physical",
        "region": {
          "x": 9,
          "y": 34,
          "w": 83,
          "h": 50
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
        "entityId": null
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p17",
    "file": "43099_0.jpg",
    "order": 17,
    "title": "恐竜時代の森",
    "status": "organized",
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
        "entityId": null
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
        "entityId": null
      },
      {
        "id": "o17c",
        "label": "地質時代の縦軸",
        "observationType": "information",
        "region": {
          "x": 48,
          "y": 0,
          "w": 8,
          "h": 65
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
        "confidence": 0.88,
        "status": "confirmed",
        "visibleText": [],
        "entityId": null
      }
    ]
  },
  {
    "id": "p18",
    "file": "43100_0.jpg",
    "order": 18,
    "title": "空を飛ぶ爬虫類の骨格",
    "status": "organized",
    "observations": [
      {
        "id": "o18a",
        "label": "上部の翼を広げた骨格",
        "observationType": "physical",
        "region": {
          "x": 18,
          "y": 3,
          "w": 68,
          "h": 52
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
        "entityId": "e-pterosaur"
      },
      {
        "id": "o18b",
        "label": "下部の別の飛翔骨格",
        "observationType": "physical",
        "region": {
          "x": 20,
          "y": 50,
          "w": 58,
          "h": 38
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
        "entityId": null
      },
      {
        "id": "o18c",
        "label": "右側に一部写る大型骨格",
        "observationType": "physical",
        "region": {
          "x": 65,
          "y": 23,
          "w": 35,
          "h": 77
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
        "entityId": null
      }
    ]
  },
  {
    "id": "p19",
    "file": "43101_0.jpg",
    "order": 19,
    "title": "空の爬虫類の解説",
    "status": "organized",
    "observations": [
      {
        "id": "o19a",
        "label": "翼竜の復元イラスト",
        "observationType": "information",
        "region": {
          "x": 0,
          "y": 5,
          "w": 64,
          "h": 83
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
        "entityId": null
      },
      {
        "id": "o19b",
        "label": "「空の爬虫類」の説明パネル",
        "observationType": "information",
        "region": {
          "x": 63,
          "y": 8,
          "w": 34,
          "h": 78
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
        "entityId": "e-pterosaur"
      }
    ]
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
        "status": "suggested",
        "visibleText": [],
        "entityId": null
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
        "entityId": null
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
        "entityId": null
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
        "entityId": null
      }
    ]
  }
];

window.SAMPLE_RELATIONS = [
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
    "sourceId": "o05a",
    "targetId": "o05b",
    "type": "explains",
    "status": "suggested",
    "confidence": 0.87
  },
  {
    "id": "r05",
    "sourceId": "o05b",
    "targetId": "o06a",
    "type": "same-theme",
    "status": "suggested",
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
    "targetId": "o11a",
    "type": "explains",
    "status": "suggested",
    "confidence": 0.78
  },
  {
    "id": "r09",
    "sourceId": "o10a",
    "targetId": "o12a",
    "type": "same-theme",
    "status": "suggested",
    "confidence": 0.82
  },
  {
    "id": "r10",
    "sourceId": "o10a",
    "targetId": "o13a",
    "type": "same-theme",
    "status": "suggested",
    "confidence": 0.79
  },
  {
    "id": "r11",
    "sourceId": "o10b",
    "targetId": "o14a",
    "type": "compares",
    "status": "suggested",
    "confidence": 0.8
  },
  {
    "id": "r12",
    "sourceId": "o15a",
    "targetId": "o15b",
    "type": "explains",
    "status": "suggested",
    "confidence": 0.91
  },
  {
    "id": "r13",
    "sourceId": "o15a",
    "targetId": "o17a",
    "type": "same-theme",
    "status": "suggested",
    "confidence": 0.83
  },
  {
    "id": "r14",
    "sourceId": "o16c",
    "targetId": "o17a",
    "type": "same-theme",
    "status": "suggested",
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
  }
];

window.SAMPLE_ENTITIES = [
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

window.LEARNING_FACTS = [
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

window.SAMPLE_COLLECTIONS = [
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

window.SAMPLE_QUIZZES = [
  {
    "id": "q1",
    "level": "observed",
    "photoId": "p03",
    "requiredObservationIds": ["o03a", "o03b", "o03c", "o03d", "o03e"],
    "question": "この写真の整理方法として最も適切なのは？",
    "choices": [
      "中央の骨格だけを1対象として保存する",
      "写真全体を1つの恐竜として保存する",
      "頭骨・骨格・説明パネル・展示空間を複数対象として保存する",
      "説明文をすべて手入力する"
    ],
    "answer": 2,
    "explanation": "一枚の写真に複数の実体・情報表現・空間が含まれるため、複数のObservationとして扱います。"
  },
  {
    "id": "q2",
    "level": "observed",
    "photoId": "p02",
    "requiredObservationIds": ["o02a", "o02b"],
    "question": "「拡大した脳」の写真に付ける汎用分類の組合せは？",
    "choices": [
      "展示物だけ",
      "説明パネル＋図表・地図",
      "場所・景観だけ",
      "人物・活動"
    ],
    "answer": 1,
    "explanation": "説明文と脳容量グラフが同じ写真に含まれるため、複数の汎用分類を使えます。"
  },
  {
    "id": "q3",
    "level": "observed",
    "photoId": "p08",
    "requiredObservationIds": ["o07a", "o08a"],
    "requiredRelationIds": ["r06", "r07"],
    "question": "この説明パネルと骨格写真の関係として最も適切なのは？",
    "choices": [
      "無関係",
      "同じ展示で、パネルが骨格を説明している",
      "同じ物理対象を別角度から撮った",
      "同じ時刻に撮っただけ"
    ],
    "answer": 1,
    "explanation": "写真間には「同じ展示」と「説明している」という複数の関係を付けられます。"
  },
  {
    "id": "q4",
    "level": "observed",
    "photoId": "p15",
    "requiredObservationIds": ["o15a", "o15b", "o15c"],
    "question": "この写真から抽出できる観察対象は？",
    "choices": [
      "系統図だけ",
      "化石だけ",
      "系統図・植物化石・説明文",
      "植物の種名だけ"
    ],
    "answer": 2,
    "explanation": "図表、現物標本、説明パネルを別の観察対象として整理できます。"
  },
  {
    "id": "q5",
    "level": "observed",
    "photoId": "p18",
    "requiredObservationIds": ["o18a"],
    "question": "この写真の浅い分野分類として適切なのは？",
    "choices": [
      "翼竜",
      "陶磁器",
      "縄文杉",
      "古文書"
    ],
    "answer": 0,
    "explanation": "入力時は「翼竜」「骨格標本」程度の浅い分類で止め、細かな事実は後から学びます。"
  },
  {
    "id": "q6",
    "level": "learned",
    "photoId": "p07",
    "requiredFactId": "f01",
    "question": "追加学習後：バシロサウルスは何の仲間として整理されますか？",
    "choices": [
      "恐竜",
      "初期のクジラ類",
      "翼竜",
      "長鼻類"
    ],
    "answer": 1,
    "explanation": "この事実は写真入力時に必須とせず、説明パネルを基に学習段階で追加します。"
  },
  {
    "id": "q7",
    "level": "learned",
    "photoId": "p18",
    "requiredFactId": "f03",
    "question": "追加学習後：翼竜と恐竜の関係として正しいものは？",
    "choices": [
      "翼竜は鳥盤類の恐竜",
      "翼竜は恐竜とは別系統の爬虫類",
      "翼竜は哺乳類",
      "すべて同じ分類"
    ],
    "answer": 1,
    "explanation": "詳細知識は「詳しく学ぶ」で追加した後に復習問題へ使います。"
  },
  {
    "id": "q8",
    "level": "learned",
    "photoId": "p17",
    "requiredFactId": "f04",
    "question": "追加学習後：恐竜時代の森の理解として適切なのは？",
    "choices": [
      "植物相は全時代で同じ",
      "時代とともに主要な植物群が変化した",
      "植物は存在しなかった",
      "被子植物だけだった"
    ],
    "answer": 1,
    "explanation": "展示模型と説明パネルをつなぎ、後から環境の変化を学びます。"
  }
];

window.SAMPLE_STORIES = [
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

window.SAMPLE_PHOTOS.forEach(photo => {
  photo.visitId = window.SAMPLE_VISIT.id;
  photo.observations.forEach(observation => {
    observation.photoId = photo.id;
  });
});

window.SAMPLE_OBSERVATIONS = window.SAMPLE_PHOTOS.flatMap(photo => photo.observations);
window.SAMPLE_OBSERVATION_RELATIONS = window.SAMPLE_RELATIONS;
