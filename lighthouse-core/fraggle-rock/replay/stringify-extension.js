/**
 * @license Copyright 2020 The Lighthouse Authors. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const {isNavigationStep} = require('./replay-helpers.js');
const {PuppeteerStringifyExtension} = require('@puppeteer/replay');

class LighthouseStringifyExtension extends PuppeteerStringifyExtension {
  isTimespanRunning = false;

  /**
   * @param {Parameters<PuppeteerStringifyExtension['beforeAllSteps']>} args
   */
  async beforeAllSteps(...args) {
    const [out, flow] = args;
    out.appendLine(`const fs = require('fs');`);
    out.appendLine(`const lhApi = require('lighthouse/lighthouse-core/fraggle-rock/api.js');`);

    let isMobile = true;
    for (const step of flow.steps) {
      if (step.type !== 'setViewport') continue;
      isMobile = step.isMobile;
    }

    if (isMobile) {
      // eslint-disable-next-line max-len
      out.appendLine(`const config = undefined;`);
    } else {
      // eslint-disable-next-line max-len
      out.appendLine(`const config = require('lighthouse/lighthouse-core/config/desktop-config.js');`);
    }

    await super.beforeAllSteps(...args);

    const configContext = {
      settingsOverrides: {
        screenEmulation: {
          disabled: true,
        },
      },
    };

    // eslint-disable-next-line max-len
    out.appendLine(`const lhFlow = await lhApi.startFlow(page, {name: '${flow.title || 'undefined'}', config, configContext: ${JSON.stringify(configContext)}});`);
  }

  /**
   * @param {Parameters<PuppeteerStringifyExtension['stringifyStep']>} args
   */
  async stringifyStep(...args) {
    const [out, step] = args;

    if (step.type === 'setViewport') {
      await super.stringifyStep(...args);
      return;
    }

    const isNavigation = isNavigationStep(step);

    if (isNavigation) {
      if (this.isTimespanRunning) {
        out.appendLine(`await lhFlow.endTimespan();`);
        this.isTimespanRunning = false;
      }
      out.appendLine(`await lhFlow.startNavigation();`);
    } else if (!this.isTimespanRunning) {
      out.appendLine(`await lhFlow.startTimespan();`);
      this.isTimespanRunning = true;
    }

    await super.stringifyStep(...args);

    if (isNavigation) {
      out.appendLine(`await lhFlow.endNavigation();`);
    }
  }

  /**
   * @param {Parameters<PuppeteerStringifyExtension['afterAllSteps']>} args
   */
  async afterAllSteps(...args) {
    const [out] = args;
    if (this.isTimespanRunning) {
      out.appendLine(`await lhFlow.endTimespan();`);
    }
    out.appendLine(`const lhFlowReport = await lhFlow.generateReport();`);
    out.appendLine(`fs.writeFileSync(__dirname + '/flow.report.html', lhFlowReport)`);
    await super.afterAllSteps(...args);
  }
}

module.exports = LighthouseStringifyExtension;
