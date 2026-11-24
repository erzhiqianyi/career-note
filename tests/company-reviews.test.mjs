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
      import { CompanyReviewsPanel } from './components/company-reviews';
      export const render = (job) => renderToStaticMarkup(React.createElement(CompanyReviewsPanel, { job: { id: 'j', company: 'Example', role: 'Engineer', status: '准备投递', history: [], ...job } }));
    `,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  plugins: [{
    name: 'stubs',
    setup(builder) {
      builder.onResolve({ filter: /^@\/components\/(locale-provider|japanese-text)$/ }, (args) => ({ path: args.path, namespace: 'test' }));
      builder.onLoad({ filter: /locale-provider$/, namespace: 'test' }, () => ({ contents: 'export const useLocale=()=>({locale:"zh-CN",t:(k)=>k});', loader: 'js' }));
      builder.onLoad({ filter: /japanese-text$/, namespace: 'test' }, () => ({ contents: 'export const Ja=({text})=>text||null;', loader: 'js' }));
    },
  }],
});
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require });
const { render } = module.exports;

const reviews = {
  overall: '3.9（口コミ220件）', summaryJa: '案件次第という声が多い。', summaryZh: '很多人说取决于案件。',
  themes: [{ title: '働き方', tone: 'negative', ja: '待機期間が長い', zh: '待机期长' }],
  entries: [{ postedAt: '2026-11-08', reviewer: '男性／エンジニア', category: '働き方', rating: '2.4', ja: '有休は現場次第。', zh: '年假取决于现场。', url: 'https://example.com/r/1' }],
  sources: [{ label: '口コミサイト', url: 'https://example.com/kuchikomi' }], verifiedAt: '2026-11-24',
};

test('reviews show Japanese text with its Chinese translation, date, score and source link', () => {
  const html = render({ companyReviews: reviews });
  for (const text of ['有休は現場次第。', '年假取决于现场。', '2026-11-08', '★ 2.4', '3.9（口コミ220件）', 'https://example.com/r/1', 'cr-negative', '差评'])
    assert.ok(html.includes(text), text);
});

test('a job without reviews shows the empty state', () => {
  assert.ok(render({}).includes('还没有口碑'));
  assert.ok(!render({ companyReviews: { ...reviews, summaryZh: '', themes: [], entries: [] } }).includes('口碑列表'));
});
