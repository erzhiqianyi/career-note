import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
const require = createRequire(import.meta.url);
const result = await build({
  stdin: {
    contents: `import React from 'react'; import {renderToStaticMarkup} from 'react-dom/server'; import ReviewWorkspace, {PracticeWorkspace} from './components/review-workspace'; import {interviewFlowOf,interviewQuestionReturnHash} from './components/interview-practice';
 const q = (id,category,title,questionNumber)=>({id,category,title,questionJa:title,questionNumber,targetSeconds:60});
 const data={today:'2026-11-06',platforms:[],questionSets:[{id:'general',jobId:'builtin:general',questions:[q('grammar','日语表达基础','Daily grammar fixture',102),...Array.from({length:8},(_,i)=>q('grammar-'+i,'日语表达基础','Grammar fixture '+i,103+i)),q('intro','自己紹介','Interview introduction fixture',101),q('fair','フェア基本練習','Fair greeting fixture',111),q('fair-full','総合練習','Fair full fixture',112)]},{id:'cleared',jobId:'job-cleared',title:'Cleared fixture',questions:[q('intro','占位','題組已清空')]},{id:'real',jobId:'job-real',title:'Real company fixture',questions:[q('intro','自己紹介','Real question'),q('why-company','先练必答','志望動機'),q('project','经历说明','Project introduction'),q('tech','技术追问','Spark details'),q('salary','条件确认','希望年収'),q('reverse','逆質問','逆質問')]}],practicePlans:[],practicePlanReviews:[],attempts:[],jobs:[{id:'job-real',company:'Real company',role:'Engineer',status:'面试中',history:[],rating:0,nextDate:'2026-11-20',nextAction:'最終面接',companyNumber:1,url:''},{id:'job-other',company:'Other company',role:'Engineer',status:'关注中',history:[],rating:0,nextDate:'',nextAction:'',companyNumber:2,url:''}],reviews:[],reports:[],tasks:[],materials:[],profile:{},resume:[]};
 export const practice=()=>renderToStaticMarkup(React.createElement(PracticeWorkspace,{data,reload:async()=>{}}));
 export const render=hash=>renderToStaticMarkup(React.createElement(ReviewWorkspace,{data,hash,reload:async()=>{},openMaterial(){},openReport(){}})); export const phase=q=>interviewFlowOf(q); export const questionBack=(base,jobId)=>interviewQuestionReturnHash(base,jobId,data.jobs);`,
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
const { render, practice, phase, questionBack } = module.exports;
test('review separates company rehearsal from actual interviews; practice uses a paginated topic table', () => {
  const home = render('#interview-review');
  assert.match(home, /href="#interview-review\/interviews"/);
  assert.match(home, /href="#interview-review\/preparation"/);
  assert.ok(!home.includes('日语练习'));
  const topics = practice();
  assert.ok(topics.includes('practice-topic-list'));
  assert.ok(!topics.includes('选择题目查看详情'));
  assert.ok(topics.includes('搜索题目或编号'));
  assert.ok(topics.includes('全部专题'));
  assert.ok(topics.includes('全部题型'));
  assert.ok(topics.includes('全部练习状态'));
  assert.ok(topics.includes('Q101'));
  assert.ok(topics.includes('面试基本问题'));
  assert.ok(topics.includes('日语提升'));
  assert.match(topics, /badge blue/);
  assert.match(topics, /badge green/);
  assert.ok(!topics.includes('制定计划'));
  assert.ok(!topics.includes('专题计划与练习回顾'));
  assert.match(topics, /第 1 \/ 2 页/);
  assert.ok(topics.includes('Daily grammar fixture'));
  assert.ok(topics.includes('Interview introduction fixture'));
  assert.ok(!topics.includes('Fair greeting fixture'));
  assert.ok(render('#interview-review/japanese').includes('practice-topic-list'));
  assert.ok(render('#interview-review/interviews').includes('还没有面试记录'));
});
test('company rehearsal is a searchable, status-filtered company directory', () => {
  const page = render('#interview-review/preparation');
  assert.ok(page.includes('Real company'));
  assert.ok(!page.includes('Other company'));
  assert.ok(page.includes('搜索公司或职位'));
  assert.ok(page.includes('筛选投递状态'));
  assert.ok(!practice().includes('已清空题组'));
});
test('company questions are classified in interview-process order', () => {
  const item = (id, category, title) => ({ id, category, title });
  assert.equal(phase(item('self-intro', '先练必答', '自己紹介')), 'introduction');
  assert.equal(phase(item('why-company', '先练必答', '志望動機')), 'motivation');
  assert.equal(phase(item('project', '经历说明', 'Project introduction')), 'experience');
  assert.equal(phase(item('spark', '技术追问', 'Spark details')), 'technical');
  assert.equal(phase(item('salary', '条件确认', '希望年収')), 'conditions');
  assert.equal(phase(item('reverse', '逆質問', '逆質問')), 'questions');
});
test('company question detail returns to the company practice page', () => {
  assert.equal(questionBack('#interview-review', 'job-real'), '#interview-review/company/1');
  assert.equal(questionBack('#interview-review', 'missing'), '#interview-review');
  assert.equal(questionBack('#practice', 'job-real'), '#practice');
});
