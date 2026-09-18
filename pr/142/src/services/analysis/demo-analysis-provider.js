import { notConnected } from './analysis-provider.js';

const MESSAGE = 'AI解析はまだ接続されていません。対象は手動で追加できます。';

/**
 * The only provider in the GitHub Pages build.
 *
 * It never invents Observations for a photo the user just added. The 20 bundled
 * sample photos ship with prepared results in `src/data/demo/sample-data.js`;
 * anything the user imports stays "未整理" until they organise it themselves.
 * Labelling an unanalysed photo "AI解析済み" would be a lie, so we don't.
 *
 * Satisfies the `AnalysisProvider` shape declared in `analysis-provider.js`;
 * conformance is checked where an instance is passed into `initApp`.
 */
export class DemoAnalysisProvider {
  constructor() {
    this.name = 'demo';
  }

  /**
   * @returns {boolean}
   */
  isConnected() {
    return false;
  }

  /**
   * @returns {Promise<import('./analysis-provider.js').AnalysisResult>}
   */
  async analyze() {
    return notConnected(MESSAGE);
  }
}

export const DEMO_ANALYSIS_MESSAGE = MESSAGE;
