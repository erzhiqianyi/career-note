import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);

const result = await build({
  stdin: {
    contents: `
      import React from 'react';
      import { renderToStaticMarkup } from 'react-dom/server';
      import { CompanyBoard } from './components/company-board';
      const profile = (facts) => ({ tagline: '', overview: '概要', facts, segments: [], strengths: [], history: [], outlook: [], concerns: [], sources: [{ label: '会社概要', url: 'https://example.com' }], verifiedAt: '2026-10-29' });
      export const render = (job) => renderToStaticMarkup(React.createElement(CompanyBoard, { job: { id: 'j', company: 'Example', role: 'Engineer', status: '准备投递', history: [], ...job } }));
      export { profile };
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{
    name: 'locale',
    setup(builder) {
      builder.onResolve({ filter: /^@\/components\/locale-provider$/ }, () => ({ path: 'locale', namespace: 'test' }));
      builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export const useLocale=()=>({locale:"zh-CN",t:(k)=>k});', loader: 'js' }));
    },
  }],
});
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require });
const { render, profile } = module.exports;

test('the company board shows headcount from the job when the research facts lack it', () => {
  const html = render({ employeeCount: '約350名（2025年4月時点）', companyProfile: profile([{ label: '設立', value: '2010年4月' }]) });
  assert.match(html, /<dt>従業員数<\/dt>/);
  assert.ok(html.includes('約350名'));
});

test('research facts that already state headcount are not duplicated', () => {
  const html = render({ employeeCount: '30 人', companyProfile: profile([{ label: '従業員数（連結）', value: '1,200名' }]) });
  assert.equal(html.match(/従業員数/g).length, 1);
  assert.ok(!html.includes('30 人'));
  assert.ok(!render({ companyProfile: profile([]) }).includes('従業員数'));
});
