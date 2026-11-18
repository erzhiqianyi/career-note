import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

void test('a saved practice order lists questions in its own sequence with their Q numbers', async () => {
  const result = await build({
    stdin: {
      contents: `
        import React from 'react'; import { renderToStaticMarkup } from 'react-dom/server';
        import InterviewPractice from './components/interview-practice'; import { setTestRoute } from './components/record-page';
        const q=(id,n,category)=>({id,questionNumber:n,title:'Title '+id,questionJa:'質問',category,targetSeconds:60});
        const data={today:'2026-11-18',materials:[],reports:[],jobs:[{id:'demo',company:'Example',role:'R',status:'面试中',history:[]}],profile:{revision:0},tasks:[],reviews:[],attempts:[],
          questionSets:[{id:'pack',jobId:'demo',title:'T',scenario:'S',plan:'P',createdAt:'2026-11-01',questions:[q('a',140,'自己紹介'),q('b',150,'逆質問'),q('c',175,'志望動機')]}],
          questionOrders:[{id:'pack',activeOrderId:'focus',orders:[{id:'focus',name:'重点强化',questionIds:['a','c'],onlySelected:true}],revision:1,updatedAt:''}]};
        const props={data,reload:async()=>{},openMaterial(){},routeBase:'#interview-review'};
        setTestRoute('#interview-review/company/demo');
        export const custom = renderToStaticMarkup(React.createElement(InterviewPractice,props));
        export const flow = renderToStaticMarkup(React.createElement(InterviewPractice,{...props,data:{...data,questionOrders:[{...data.questionOrders[0],activeOrderId:null}]}}));
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
    define: { 'process.env.NEXT_PUBLIC_CAREER_API_URL': '""' },
    plugins: [{
      name: 'test-route',
      setup(builder) {
        builder.onResolve({ filter: /record-page$/ }, () => ({ path: 'record-page', namespace: 'route-test' }));
        builder.onLoad({ filter: /.*/, namespace: 'route-test' }, () => ({
          contents: `let route=''; export const setTestRoute=(value)=>{route=value}; export const RecordBack=()=>null; export const useRecordPage=(base,view,resolve)=>[route.startsWith(base+'/'+view+'/') ? resolve(decodeURIComponent(route.slice((base+'/'+view+'/').length))) : null,()=>{}];`,
          loader: 'ts',
        }));
      },
    }],
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, { module, exports: module.exports, require, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout });
  const numbers = html => [...html.matchAll(/<b><span>Q(?:<!-- -->)?(\d+)/g)].map(m => m[1]);
  const { custom, flow } = module.exports;
  assert.deepEqual(numbers(custom), ['140', '175']);
  assert.match(custom, /<option value="focus" selected="">重点强化<\/option>/);
  assert.match(custom, /重点强化<small>2<\/small>/);
  assert.equal(numbers(flow).length, 3);
  assert.match(flow, /<option value="" selected="">面试流程（默认）<\/option>/);
  assert.doesNotMatch(flow, /重点强化<small>/);
});
