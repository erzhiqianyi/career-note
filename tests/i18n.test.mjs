import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
import { readFileSync } from 'node:fs';

const dictionary = JSON.parse(
  readFileSync(new URL('../lib/i18n/messages.json', import.meta.url)),
);
void test('Japanese and English messages preserve all interpolation parameters', () => {
  for (const [key, translations] of Object.entries(dictionary)) {
    for (const locale of ['ja', 'en']) {
      assert.ok(translations[locale]?.trim(), `${locale}: ${key}`);
      const parameters = (text) =>
        [...text.matchAll(/\{\d+\}/g)].map((m) => m[0]).sort((a, b) => a.localeCompare(b));
      assert.deepEqual(
        parameters(translations[locale]),
        parameters(key),
        `${locale}: ${key}`,
      );
    }
  }
});

for (const locale of ['zh-CN', 'ja', 'en']) {
  void test(`${locale}: rendered controls keep stored values and personal text`, async () => {
    const result = await build({
      stdin: {
        contents: `
          import React from 'react';
          import { renderToStaticMarkup } from 'react-dom/server';
          import OpportunityCard, { MatchBadge, jobAddedAt } from './components/opportunity-card';
          import InterviewPractice from './components/interview-practice';
          import { setTestRoute } from './components/record-page';
          import { translate, resolveLocale } from './lib/i18n';
          export { translate, resolveLocale };
          export const card = renderToStaticMarkup(React.createElement(OpportunityCard, {
            job: {company:'公司名称',role:'Original role',status:'面试中',location:'Tokyo',japanese:'N2',matchLevel:'优先准备',nextAction:'原文を保持',nextDate:'2026-09-10',history:[{status:'关注中',at:'2026-09-01T00:00:00Z'}]},
            today:'2026-09-12',day:(v)=>v.slice(0,10),onOpen(){}
          }));
          export const matchBadge = renderToStaticMarkup(React.createElement(MatchBadge, {level:'优先准备'}));
          export const addedAt = jobAddedAt({history:[{status:'关注中',at:'2026-09-01T00:00:00Z'}]});
          const practiceProps = {
            async reload(){},
            data: {jobs:[{id:'demo',company:'Example'}],profile:{revision:0},tasks:[],reviews:[],attempts:[],
              questionSets:[{id:'pack',jobId:'demo',title:'Original title',createdAt:'2026-09-12',questions:[
                {id:'q',title:'質問の原文',questionJa:'自己紹介をお願いします。',category:'自己紹介',targetSeconds:60}
              ]}]}
          };
          export const practice = renderToStaticMarkup(React.createElement(InterviewPractice, practiceProps));
          setTestRoute('#interview/company/demo');
          export const practiceCompany = renderToStaticMarkup(React.createElement(InterviewPractice, practiceProps));
          setTestRoute('#interview/question/pack%7Cq');
          export const practiceDetail = renderToStaticMarkup(React.createElement(InterviewPractice, practiceProps));
        `,
        resolveDir: process.cwd(),
        loader: 'tsx',
      },
      bundle: true,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
      write: false,
      // vite.config.ts inlines the API address the same way; the vm sandbox has no `process`.
      define: { 'process.env.NEXT_PUBLIC_CAREER_API_URL': '""' },
      plugins: [
        {
          name: 'test-locale',
          setup(builder) {
            builder.onResolve({ filter: /record-page$/ }, () => ({ path: 'record-page', namespace: 'route-test' }));
            builder.onLoad({ filter: /.*/, namespace: 'route-test' }, () => ({
              contents: `let route=''; export const setTestRoute=(value)=>{route=value}; export const RecordBack=()=>null; export const useRecordPage=(base,view,resolve)=>[route.startsWith(base+'/'+view+'/') ? resolve(decodeURIComponent(route.slice((base+'/'+view+'/').length))) : null,()=>{}];`,
              loader: 'ts',
            }));
            builder.onResolve(
              { filter: /^@\/components\/locale-provider$/ },
              () => ({ path: 'locale', namespace: 'test' }),
            );
            builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
              contents: `import { translate } from './lib/i18n'; export const useLocale=()=>({locale:${JSON.stringify(locale)},t:(key,values)=>translate(${JSON.stringify(locale)},key,values)});`,
              resolveDir: process.cwd(),
              loader: 'ts',
            }));
          },
        },
      ],
    });
    const compiled = { exports: {} };
    runInNewContext(result.outputFiles[0].text, { require, module: compiled, exports: compiled.exports });
    const output = compiled.exports;
    assert.match(output.card, /公司名称/); // Personal company names are never translated.
    assert.match(output.card, /原文を保持/);
    assert.match(output.card, /badge blue/);
    assert.ok(output.card.includes(output.translate(locale, '面试中')));
    assert.ok(output.matchBadge.includes(output.translate(locale, '优先准备')));
    assert.ok(!output.card.includes(output.translate(locale, '优先准备')));
    assert.ok(output.card.includes(output.translate(locale, '查看职位详情')));
    assert.match(output.addedAt, /2026-09-01/); // Added date comes from the first status entry.
    assert.ok(output.card.includes(output.translate(locale, '已逾期')));
    assert.match(output.practice, /Example/);
    assert.doesNotMatch(output.practice, /質問の原文/);
    assert.match(output.practiceCompany, /質問の原文/);
    assert.doesNotMatch(output.practiceCompany, /<textarea/);
    assert.doesNotMatch(output.practice, /自己紹介をお願いします。/);
    assert.doesNotMatch(output.practice, /<textarea/);
    assert.match(output.practiceDetail, /自己紹介をお願いします。/);
    assert.match(output.practiceDetail, /value="日语" selected/);
    assert.match(output.practiceDetail, /value="中文构思"/);
    assert.match(output.practiceDetail, /value="中日混合"/);
    assert.ok(
      output.practiceDetail.includes(output.translate(locale, '保存本次回答')),
    );
    assert.equal(
      output.translate(locale, 'Unknown personal text'),
      'Unknown personal text',
    );
    assert.equal(output.resolveLocale('en-US'), 'en');
    assert.equal(output.resolveLocale('ja-JP'), 'ja');
    assert.equal(output.resolveLocale('fr-FR'), 'zh-CN');
  });
}
