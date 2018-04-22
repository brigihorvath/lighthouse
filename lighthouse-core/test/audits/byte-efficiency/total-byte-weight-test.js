/**
 * @license Copyright 2017 Google Inc. All Rights Reserved.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.
 */
'use strict';

const TotalByteWeight = require('../../../audits/byte-efficiency/total-byte-weight.js');
const WebInspector = require('../../../lib/web-inspector');
const assert = require('assert');
const options = TotalByteWeight.defaultOptions;

/* eslint-env mocha */

function generateRequest(url, size, resourceType, baseUrl = 'http://google.com/') {
  return {
    url: `${baseUrl}${url}`,
    finished: true,
    transferSize: size * 1024,
    responseReceivedTime: 1000,
    endTime: 2000,
    _resourceType: resourceType,
  };
}

function generateArtifacts(records) {
  if (records[0] && records[0].length > 1) {
    records = records.map(args => generateRequest(...args));
  }
  return {
    devtoolsLogs: {defaultPass: []},
    requestNetworkRecords: () => Promise.resolve(records),
    requestNetworkThroughput: () => Promise.resolve(1024),
  };
}

describe('Total byte weight audit', () => {
  it('passes when requests are small', () => {
    const artifacts = generateArtifacts([
      ['file.html', 30, WebInspector.resourceTypes.Document],
      ['file.js', 50, WebInspector.resourceTypes.Script],
      ['file.jpg', 70, WebInspector.resourceTypes.Image],
    ]);

    return TotalByteWeight.audit(artifacts, {options}).then(result => {
      assert.strictEqual(result.rawValue, 150 * 1024);
      assert.strictEqual(result.score, 1);
      const results = result.details.items;
      assert.strictEqual(results.length, 3);
      assert.strictEqual(result.extendedInfo.value.totalCompletedRequests, 3);
      assert.strictEqual(results[0].totalBytes, 71680, 'results are sorted');
    });
  });

  it('scores in the middle when a mixture of small and large requests are used', () => {
    const artifacts = generateArtifacts([
      ['file.html', 30, WebInspector.resourceTypes.Document],
      ['file.js', 50, WebInspector.resourceTypes.Script],
      ['file.jpg', 70, WebInspector.resourceTypes.Image],
      ['file-large.jpg', 1000, WebInspector.resourceTypes.Image],
      ['file-xlarge.jpg', 3000, WebInspector.resourceTypes.Image],
      ['small1.js', 5, WebInspector.resourceTypes.Script],
      ['small2.js', 5, WebInspector.resourceTypes.Script],
      ['small3.js', 5, WebInspector.resourceTypes.Script],
      ['small4.js', 5, WebInspector.resourceTypes.Script],
      ['small5.js', 5, WebInspector.resourceTypes.Script],
      ['small6.js', 5, WebInspector.resourceTypes.Script],
    ]);

    return TotalByteWeight.audit(artifacts, {options}).then(result => {
      assert.ok(0.40 < result.score && result.score < 0.6, 'score is around 0.5');
      assert.strictEqual(result.rawValue, 4180 * 1024);
      const results = result.details.items;
      assert.strictEqual(results.length, 10, 'results are clipped at top 10');
      assert.strictEqual(result.extendedInfo.value.totalCompletedRequests, 11);
    });
  });

  it('should flag script requests which are exceeding the file size', () => {
    const artifacts = generateArtifacts([
      ['file.html', 30, WebInspector.resourceTypes.Document],
      ['file.js', 451, WebInspector.resourceTypes.Script],
      ['file.jpg', 70, WebInspector.resourceTypes.Image],
      ['file-large.jpg', 1000, WebInspector.resourceTypes.Image],
      ['file-xlarge.jpg', 3000, WebInspector.resourceTypes.Image],
      ['small1.js', 5, WebInspector.resourceTypes.Script],
    ]);

    return TotalByteWeight.audit(artifacts, {options}).then(result => {
      const results = result.details.items;
      assert.strictEqual(results[2].flagged, true);
    });
  });

  it('fails when requests are huge', () => {
    const artifacts = generateArtifacts([
      ['file.html', 3000, WebInspector.resourceTypes.Document],
      ['file.js', 5000, WebInspector.resourceTypes.Script],
      ['file.jpg', 7000, WebInspector.resourceTypes.Image],
    ]);

    return TotalByteWeight.audit(artifacts, {options}).then(result => {
      assert.strictEqual(result.rawValue, 15000 * 1024);
      assert.strictEqual(result.score, 0);
    });
  });
});
