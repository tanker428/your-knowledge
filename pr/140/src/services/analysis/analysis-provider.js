/**
 * The seam a real AI backend will plug into.
 *
 * Nothing in this build calls a model. `DemoAnalysisProvider` is the only
 * implementation shipped, and it reports honestly that analysis is not
 * connected. A future `ApiAnalysisProvider` would POST to a server that holds
 * the API key — the key never reaches the browser (see docs/ARCHITECTURE.md).
 *
 * @typedef {object} AnalysisResult
 * @property {'ok'|'not-connected'} status
 * @property {string} [message]        Shown to the user when status is not 'ok'.
 * @property {string} [suggestedTitle]
 * @property {object[]} observations   Candidate Observations; always [] when not connected.
 *
 * @typedef {object} AnalysisProvider
 * @property {string} name
 * @property {() => boolean} isConnected
 * @property {(input: {blob: Blob, filename: string, domainHint: string}) => Promise<AnalysisResult>} analyze
 */

/**
 * Shared shape for "we did not analyse this photo".
 * @param {string} message
 * @returns {AnalysisResult}
 */
export function notConnected(message) {
  return { status: "not-connected", message, observations: [] };
}
