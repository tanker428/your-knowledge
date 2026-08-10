export const TUTORIAL_STORAGE_KEY = "your-knowledge:tutorial:v1";

export const TUTORIAL_STEPS = [
  {
    screen: "概要",
    title: "まずは訪問を選びます",
    description: "デモを見るか、自分の訪問を作ります。写真から見たものを整理し、知識マップと問題へ進みます。",
  },
  {
    screen: "写真",
    title: "写真を登録します",
    description: "訪問に写真を追加し、撮影したときの感想も写真に残せます。",
  },
  {
    screen: "写真を整理",
    title: "この対象は、どのようなものですか？",
    description: "写真に写っている対象の種類と、学ぶうえでの役割を選びます。複数選択できます。",
  },
  {
    screen: "知識マップ",
    title: "見たもののつながりを確認します",
    description: "写真内の対象、分類、関係、確認済みの知識を見渡し、元写真や対象の詳しい情報へ戻れます。",
  },
  {
    screen: "学ぶ",
    title: "知識グラフから問題に挑戦します",
    description: "確認済みの対象と知識から分類や時代の問題に挑戦し、回答結果を学習に反映します。",
  },
  {
    screen: "コレクション",
    title: "学習の進みを振り返ります",
    description: "写真の発見、整理、分類、関係付け、学習の進みを訪問ごとに確認します。",
  },
];

export function nextTutorialIndex(index) {
  return Math.min(index + 1, TUTORIAL_STEPS.length - 1);
}

export function previousTutorialIndex(index) {
  return Math.max(index - 1, 0);
}

export function isTutorialSeen(storage) {
  try {
    return storage?.getItem(TUTORIAL_STORAGE_KEY) === "seen";
  } catch {
    return false;
  }
}

export function markTutorialSeen(storage) {
  try {
    storage?.setItem(TUTORIAL_STORAGE_KEY, "seen");
  } catch {
    // Private browsing or disabled storage must not block the app.
  }
}
