/**
 * Image downscaling used by the import pipeline.
 *
 * A modern phone photo is 4000px wide and several megabytes. Keeping those in
 * memory (or in IndexedDB) is what makes a photo app freeze on Android, so every
 * imported file is reduced twice before it is ever stored:
 *   display   — big enough for the organise screen
 *   thumbnail — small enough that a 100-photo grid stays cheap
 * The original file is never kept.
 */

export const DISPLAY_MAX_EDGE = 1600;
export const THUMBNAIL_MAX_EDGE = 320;
export const DISPLAY_QUALITY = 0.82;
export const THUMBNAIL_QUALITY = 0.7;

/**
 * Pure size arithmetic, kept separate so it can be unit tested without a canvas.
 *
 * @param {number} width
 * @param {number} height
 * @param {number} maxEdge
 * @returns {{width: number, height: number, scale: number}}
 */
export function fitWithin(width, height, maxEdge) {
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  };
}

/**
 * @param {ImageBitmap} bitmap
 * @param {number} maxEdge
 * @param {number} quality
 * @returns {Promise<Blob>}
 */
export async function bitmapToBlob(bitmap, maxEdge, quality) {
  const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);

  if (typeof OffscreenCanvas === "function") {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("2Dコンテキストを取得できませんでした");
    context.drawImage(bitmap, 0, 0, width, height);
    return await canvas.convertToBlob({ type: "image/jpeg", quality });
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2Dコンテキストを取得できませんでした");
  context.drawImage(bitmap, 0, 0, width, height);
  return await new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("画像を変換できませんでした")),
      "image/jpeg",
      quality,
    );
  });
}

/**
 * Produce both sizes from one decode.
 *
 * @param {File|Blob} file
 * @returns {Promise<import('../../repositories/knowledge-repository.js').PhotoBinary>}
 */
export async function processImageFile(file) {
  const bitmap = await createImageBitmap(file);
  try {
    const display = await bitmapToBlob(
      bitmap,
      DISPLAY_MAX_EDGE,
      DISPLAY_QUALITY,
    );
    const thumbnail = await bitmapToBlob(
      bitmap,
      THUMBNAIL_MAX_EDGE,
      THUMBNAIL_QUALITY,
    );
    const size = fitWithin(bitmap.width, bitmap.height, DISPLAY_MAX_EDGE);
    return {
      display,
      thumbnail,
      width: size.width,
      height: size.height,
      // 縮小前の寸法。元ファイルは保存しないので、ここだけが記録になる。
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      type: "image/jpeg",
      bytes: display.size + thumbnail.size,
    };
  } finally {
    bitmap.close();
  }
}
