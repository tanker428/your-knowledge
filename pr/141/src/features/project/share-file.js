/**
 * Getting a file off an Android phone.
 *
 * `<a download>` works on desktop but is awkward on Android, where the useful
 * destinations (Drive, Files, mail) are behind the share sheet. So we try
 * `navigator.share` first and fall back to a plain download everywhere else.
 */

/**
 * @param {Blob} blob
 * @param {string} filename
 * @returns {File}
 */
function toFile(blob, filename) {
  return new File([blob], filename, { type: blob.type || "application/json" });
}

/**
 * @param {Blob} blob
 * @param {string} filename
 * @returns {'shared'|'downloaded'}
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return "downloaded";
}

/**
 * @param {Blob} blob
 * @param {string} filename
 * @param {string} title
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export async function shareOrDownload(blob, filename, title) {
  const file = toFile(blob, filename);

  if (
    typeof navigator !== "undefined" &&
    navigator.canShare?.({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title });
      return "shared";
    } catch (error) {
      // The user closing the share sheet is not an error worth falling back for.
      if (/** @type {{name?: string}} */ (error)?.name === "AbortError")
        return "cancelled";
    }
  }

  return downloadBlob(blob, filename);
}
