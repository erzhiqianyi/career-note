import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
async function load() {
 const out=await build({stdin:{contents:"export { collectActivity, workspaceDay } from './components/today-calendar';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'cjs',packages:'external',plugins:[{name:'stub-locale',setup(b){b.onResolve({filter:/^@\/components\/locale-provider$/},()=>({path:'locale',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const useLocale=()=>({locale:"zh-CN",t:k=>k});',loader:'js'}));b.onResolve({filter:/^@\//},a=>({path:process.cwd()+'/'+a.path.slice(2)}));}}]});
 const mod={exports:{}};runInNewContext(out.outputFiles[0].text,{require,module:mod,exports:mod.exports});return mod.exports;
}
void test('activity days follow the workspace timezone, not UTC',async()=>{
 const {workspaceDay}=await load();
 assert.equal(workspaceDay('2026-09-15T20:30:00.000Z'),'2026-09-16'); // 05:30 JST next day
 assert.equal(workspaceDay('2026-09-16T14:59:00.000Z'),'2026-09-16');
 assert.equal(workspaceDay('2026-09-16T15:00:00.000Z'),'2026-09-17');
 assert.equal(workspaceDay('2026-09-16'),'2026-09-16');
});
void test('collectActivity groups additions, applications, progress, practice and materials by day',async()=>{
 const {collectActivity}=await load();
 const jobs=[{company:'A社',role:'Backend',history:[{status:'关注中',at:'2026-09-10T01:00:00Z'},{status:'已投递',at:'2026-09-12T01:00:00Z'},{status:'面试中',at:'2026-09-14T01:00:00Z'}]},{company:'B社',role:'Web',history:[{status:'关注中',at:'2026-09-12T02:00:00Z'}]}];
 const attempts=[{questionId:'intro',question:{title:'自我介绍'},createdAt:'2026-09-12T03:00:00Z'},{questionId:'q2',question:null,createdAt:'2026-09-12T04:00:00Z'}];
 const materials=[{title:'A社 · 面试准备 v1',createdAt:'2026-09-11T00:00:00Z'}];
 // Objects cross the vm boundary with foreign prototypes; compare plain JSON.
 const days=JSON.parse(JSON.stringify(collectActivity(jobs,attempts,materials)));
 assert.deepEqual(days['2026-09-10'],{added:['A社'],applied:[],progressed:[],practiced:[],materials:[]});
 assert.deepEqual(days['2026-09-11'].materials,['A社 · 面试准备 v1']);
 assert.deepEqual(days['2026-09-12'],{added:['B社'],applied:['A社 · Backend'],progressed:[],practiced:['自我介绍','q2'],materials:[]});
 assert.deepEqual(days['2026-09-14'].progressed,['A社 · 面试中']);
 assert.equal(days['2026-09-13'],undefined);
});
