import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
async function load() {
 const out=await build({stdin:{contents:"export { default as TodayCalendar, calendarDayCounts, collectActivity, workspaceDay } from './components/today-calendar';",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'cjs',packages:'external',plugins:[{name:'stub-locale',setup(b){b.onResolve({filter:/^@\/components\/locale-provider$/},()=>({path:'locale',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const useLocale=()=>({locale:"zh-CN",t:(k,args=[])=>k.replace(/\\{(\\d+)\\}/g,(_,i)=>args[i])});',loader:'js'}));b.onResolve({filter:/^@\//},a=>({path:process.cwd()+'/'+a.path.slice(2)}));}}]});
 const mod={exports:{}};runInNewContext(out.outputFiles[0].text,{require,module:mod,exports:mod.exports});return mod.exports;
}
void test('activity days follow the workspace timezone, not UTC',async()=>{
 const {workspaceDay}=await load();
 assert.equal(workspaceDay('2026-09-15T20:30:00.000Z'),'2026-09-16'); // 05:30 JST next day
 assert.equal(workspaceDay('2026-09-16T14:59:00.000Z'),'2026-09-16');
 assert.equal(workspaceDay('2026-09-16T15:00:00.000Z'),'2026-09-17');
 assert.equal(workspaceDay('2026-09-16'),'2026-09-16');
});
void test('day counts separate active appointments, dated marks and selection progress', async () => {
 const {calendarDayCounts}=await load();
 const date='2026-10-29';
 const events=[{date,status:'confirmed'},{date,status:'provisional'},{date,status:'cancelled'},{date:'2026-10-30',status:'confirmed'}];
 const activity={[date]:{applied:['A'],progressed:['B · 书类选考','C · 面试中']}};
 const marks={[date]:{kind:'due',jobs:[{id:'a'},{id:'b'}]}};
 assert.deepEqual(JSON.parse(JSON.stringify(calendarDayCounts(date,events,marks,activity))),{scheduled:4,records:3});
 assert.equal(calendarDayCounts(date,[],{[date]:{kind:'target',jobs:[]}},{}).scheduled,1);
 assert.equal(calendarDayCounts('2026-11-01',events,marks,activity).scheduled,0);
 assert.equal(calendarDayCounts('2026-11-01',events,marks,activity).records,0);
});
void test('calendar initially shows today details and exposes readable counts on date buttons',async()=>{
 const {TodayCalendar}=await load();
 const React=require('react');
 const {renderToStaticMarkup}=require('react-dom/server');
 const html=renderToStaticMarkup(React.createElement(TodayCalendar,{today:'2026-10-29',marks:{},events:[{id:'today',date:'2026-10-29',status:'confirmed',start:'10:00',end:'11:00',title:'Today appointment',todos:[]},{id:'other',date:'2026-10-28',status:'confirmed',start:'10:00',end:'11:00',title:'Other appointment',todos:[]}],activity:{}}));
 assert.match(html,/aria-label="2026-10-29 · 1 项日程" aria-pressed="true"/);
 assert.match(html,/Today appointment/);
 assert.doesNotMatch(html,/<strong>Other appointment<\/strong>/);
 assert.match(html,/calendar-month/);
 assert.match(html,/calendar-day-detail/);
});
void test('calendar includes only selection milestones for currently followed companies',async()=>{
 const {collectActivity}=await load();
 const jobs=[
  {company:'A社',role:'Backend',status:'面试中',history:[{status:'关注中',at:'2026-09-10T01:00:00Z'},{status:'已投递',at:'2026-09-12T01:00:00Z'},{status:'书类选考',at:'2026-09-13T01:00:00Z'},{status:'面试中',at:'2026-09-14T01:00:00Z'}]},
  ...['关注中','准备投递','未通过','已撤回','内定'].map(status=>({company:status,role:'Web',status,history:[{status:'已投递',at:'2026-09-11T02:00:00Z'},{status,at:'2026-09-12T02:00:00Z'}]})),
  {company:'C社',role:'Web',status:'已投递',history:[{status:'已投递',at:'2026-09-12T02:00:00Z'}]},
 ];
 // Objects cross the vm boundary with foreign prototypes; compare plain JSON.
 const days=JSON.parse(JSON.stringify(collectActivity(jobs)));
 assert.equal(days['2026-09-10'],undefined);
 assert.equal(days['2026-09-11'],undefined);
 assert.deepEqual(days['2026-09-12'],{applied:['A社 · Backend','C社 · Web'],progressed:[]});
 assert.deepEqual(days['2026-09-13'].progressed,['A社 · 书类选考']);
 assert.deepEqual(days['2026-09-14'].progressed,['A社 · 面试中']);
 assert.deepEqual(Object.keys(days['2026-09-12']).sort(),['applied','progressed']);
});
