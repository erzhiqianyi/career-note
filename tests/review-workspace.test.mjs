import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const result = await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import ReviewWorkspace, {PracticeWorkspace} from './components/review-workspace';
 const q = (id,category,title)=>({id,category,title,questionJa:title});
 const data={today:'2026-11-06',questionSets:[{id:'general',jobId:'builtin:general',questions:[q('grammar','日语表达基础','Daily grammar fixture'),q('intro','自己紹介','Interview introduction fixture'),q('fair','フェア基本練習','Fair greeting fixture'),q('fair-full','総合練習','Fair full fixture')]}],practicePlans:[],practicePlanReviews:[],attempts:[],jobs:[],reviews:[],reports:[],tasks:[],materials:[]};
 export const practice=()=>renderToStaticMarkup(React.createElement(PracticeWorkspace,{data,reload:async()=>{}}));
 export const render=hash=>renderToStaticMarkup(React.createElement(ReviewWorkspace,{data,hash,reload:async()=>{},openMaterial(){},openReport(){}}));`,
    resolveDir: process.cwd(),
    loader: 'tsx',
  },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  write: false,
  define: { 'process.env.NEXT_PUBLIC_CAREER_API_URL': '""' },
});
const module = { exports: {} };
runInNewContext(result.outputFiles[0].text, {
  module,
  exports: module.exports,
  require,
});
const { render, practice } = module.exports;
test('review separates company rehearsal from actual interviews; practice uses topic plans and Agent handoff', () => {
  const home = render('#interview-review');
  assert.match(home, /href="#interview-review\/interviews"/);
  assert.match(home, /href="#interview-review\/preparation"/);
  assert.ok(!home.includes('日语练习'));
  const topics = practice();
  assert.ok(topics.includes('专题计划与练习回顾'));
  assert.ok(topics.includes('面试基本问题'));
  assert.ok(topics.includes('日语提升'));
  assert.ok(topics.includes('転職フェア练习'));
  assert.ok(topics.includes('制定计划'));
  assert.ok(!topics.includes('按专题计划练习'));
  assert.match(topics, /href="#practice\/question\//);
  assert.ok(topics.includes('Daily grammar fixture'));
  assert.ok(topics.includes('Interview introduction fixture'));
  assert.ok(topics.includes('Fair greeting fixture'));
  assert.match(topics, /転職フェア练习 · 2 道题/);
  assert.ok(render('#interview-review/japanese').includes('专题计划与练习回顾'));
  assert.ok(render('#interview-review/interviews').includes('还没有面试记录'));
});
