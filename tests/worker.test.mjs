import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const bundled=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',conditions:['workerd'],target:'es2022'});
async function worker(t,bindings={}) {
 const mf=new Miniflare({workers:[{name:'career',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:['CAREER_DB'],r2Buckets:['CAREER_AUDIO'],bindings}]});
 t.after(()=>mf.dispose());return mf;
}
void test('local Worker state and profile persistence use D1',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 assert.equal((await send('auth/config')).status,200);
 const state=await (await send('state')).json();assert.equal(state.profile.revision,0);
 const save=await send('profile',{...state.profile,summary:'Test profile'});assert.equal(save.status,200);
 assert.equal((await (await send('state')).json()).profile.summary,'Test profile');
 const conflict=await send('profile',{...state.profile,summary:'Stale update'});assert.equal(conflict.status,400);
 assert.equal((await (await send('state')).json()).profile.summary,'Test profile');
 const preview=await send('import/preview',{schemaVersion:1,jobs:[],materials:[],reports:[],completeTaskIds:[]});assert.equal(preview.status,200);
});
void test('job provenance keeps platform and discovery channel across research updates',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const job={id:'source-job',company:'Example Company',role:'Engineer',url:'https://example.com/jobs/1',sourcePlatform:'Green',sourceChannel:'AI 搜索'};
 assert.equal((await send('import',{schemaVersion:1,jobs:[job],completeTaskIds:[]})).status,200);
 assert.equal((await send('import',{schemaVersion:1,jobs:[{id:job.id,company:job.company,role:'Senior Engineer',url:job.url}],completeTaskIds:[]})).status,200);
 let saved=(await (await send('state')).json()).jobs[0];
 assert.equal(saved.sourcePlatform,'Green');assert.equal(saved.sourceChannel,'AI 搜索');
 assert.equal((await send('jobs',{...saved,sourcePlatform:'公司官网',sourceChannel:'主动发现'})).status,200);
 saved=(await (await send('state')).json()).jobs[0];
 assert.equal(saved.sourcePlatform,'公司官网');assert.equal(saved.sourceChannel,'主动发现');
 const invalid=await send('import',{schemaVersion:1,jobs:[{...job,sourceChannel:'猜测来源'}],completeTaskIds:[]});
 assert.equal(invalid.status,400);
 assert.equal((await (await send('state')).json()).jobs[0].sourceChannel,'主动发现');
});
void test('bulk job deletion checks revisions and removes only selected jobs with their dependent records',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const jobs=[{id:'delete-a',company:'Company A',role:'Engineer'},{id:'keep-b',company:'Company B',role:'Designer'},{id:'delete-c',company:'Company C',role:'Analyst'}];
 assert.equal((await send('import',{schemaVersion:1,jobs,completeTaskIds:[]})).status,200);
 const content='応募書類の本文です。'.repeat(15);
 assert.equal((await send('import',{schemaVersion:1,materials:[{id:'material-a',jobId:'delete-a',kind:'履歴書',title:'Application',content,sourceNotes:'Test source'}],completeTaskIds:[]})).status,200);
 const publication=await (await send('material-publications',{materialId:'material-a',mode:'unlisted',expiresAt:''})).json();
 assert.ok(publication.id);
 const question={id:'intro',title:'Introduction',questionJa:'自己紹介をお願いします。',meaning:'Introduce yourself',why:'Practice',outline:'Experience',followUps:'Why?',category:'Opening',targetSeconds:60};
 assert.equal((await send('import',{schemaVersion:1,questionSets:[{id:'pack-a',jobId:'delete-a',title:'Practice',scenario:'Interview',plan:'Practice',sourceNotes:'Test source',questions:[question]}],completeTaskIds:[]})).status,200);
 const attempt=await (await send('attempts',{questionSetId:'pack-a',questionId:'intro',answer:'My answer',language:'日语',durationSeconds:45})).json();
 assert.equal((await mf.dispatchFetch('http://local/api/career/attempts/audio?id='+attempt.id,{method:'POST',headers:{'Content-Type':'audio/webm'},body:new Uint8Array([0x1a,0x45,0xdf,0xa3,1,2,3,4])})).status,200);
 const audioLink=await (await send('attempts/audio-link',{attemptId:attempt.id})).json();
 const review={id:'review-a',attemptId:attempt.id};
 for(const key of ['summary','strengths','improvements','japaneseNotes','factChecks','revisedAnswer','followUps','nextPractice','sourceNotes']) review[key]='Test '+key;
 assert.equal((await send('import',{schemaVersion:1,reviews:[review],completeTaskIds:[]})).status,200);
 assert.equal((await send('tasks',{kind:'公司准备',jobId:'delete-a'})).status,200);
 assert.equal((await send('jobs/delete',{jobs:[{id:'delete-a',revision:2}]})).status,409);
 assert.equal((await send('jobs/delete',{jobs:[{id:'delete-a',revision:1},{id:'missing',revision:1}]})).status,409);
 assert.equal((await send('jobs/delete',{jobs:[{id:'delete-a',revision:1},{id:'delete-c',revision:1}]})).status,200);
 const state=await (await send('state')).json();
 assert.deepEqual(state.jobs.map(job=>job.id),['keep-b']);
 for(const kind of ['materials','questionSets','attempts','reviews','tasks']) assert.equal(state[kind].length,0,kind);
 assert.equal((await send('material-publications')).status,200);
 assert.ok((await (await send('material-publications')).json())[0].revokedAt);
 assert.equal((await mf.dispatchFetch(audioLink.url)).status,404);
 assert.equal((await send('jobs/delete',{jobs:[{id:'keep-b',revision:1},{id:'keep-b',revision:1}]})).status,400);
 assert.equal((await (await send('state')).json()).jobs.length,1);
});
void test('company numbers increment per workspace and remain stable on updates',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const jobs=[{id:'first-long-job-id',company:'First',role:'Engineer'},{id:'second-long-job-id',company:'Second',role:'Designer'}];
 assert.equal((await send('import',{schemaVersion:1,jobs,completeTaskIds:[]})).status,200);
 let saved=(await (await send('state')).json()).jobs;
 assert.deepEqual(saved.map(j=>j.companyNumber).sort((a,b)=>a-b),[1,2]);
 const first=saved.find(j=>j.id===jobs[0].id);
 assert.equal((await send('import',{schemaVersion:1,jobs:[{...jobs[0],company:'First renamed',companyNumber:999}],completeTaskIds:[]})).status,200);
 saved=(await (await send('state')).json()).jobs;
 assert.equal(saved.find(j=>j.id===jobs[0].id).companyNumber,first.companyNumber);
 assert.equal((await send('import',{schemaVersion:1,jobs:[{id:'third-long-job-id',company:'Third',role:'Engineer',companyNumber:999}],completeTaskIds:[]})).status,200);
 saved=(await (await send('state')).json()).jobs;
 assert.equal(saved.find(j=>j.id==='third-long-job-id').companyNumber,3);
});
void test('existing companies receive numbers in insertion order before another save',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 await send('state');
 const db=await mf.getD1Database('CAREER_DB');
 for(const id of ['legacy-a','legacy-b']) await db.prepare('INSERT INTO records(kind,id,body) VALUES (?1,?2,?3)').bind('jobs',id,JSON.stringify({id,company:id,role:'Engineer',revision:1})).run();
 const state=await (await send('state')).json();
 assert.equal(state.jobs.find(j=>j.id==='legacy-a').companyNumber,1);
 assert.equal(state.jobs.find(j=>j.id==='legacy-b').companyNumber,2);
 assert.equal((await send('import',{schemaVersion:1,jobs:[{id:'new-job',company:'New',role:'Engineer'}],completeTaskIds:[]})).status,200);
 const after=(await (await send('state')).json()).jobs;
 assert.equal(after.find(j=>j.id==='new-job').companyNumber,3);
 assert.equal(after.find(j=>j.id==='legacy-a').companyNumber,1);
});
void test('configured Google mode exposes only public config and rejects anonymous/forged access',async t=>{
 const mf=await worker(t,{FIREBASE_PROJECT_ID:'test-project',FIREBASE_API_KEY:'public-key',FIREBASE_AUTH_DOMAIN:'test.firebaseapp.com',FIREBASE_APP_ID:'app',CAREER_ALLOWED_EMAILS:'private@example.com'});
 const response=await mf.dispatchFetch('http://local/api/career/auth/config');const config=await response.json();
 assert.equal(config.mode,'strict');assert.equal(config.firebase.projectId,'test-project');assert.ok(!JSON.stringify(config).includes('private@example.com'));
 for(const path of ['state','auth/me','mcp/tokens']) assert.equal((await mf.dispatchFetch('http://local/api/career/'+path)).status,401);
 assert.equal((await mf.dispatchFetch('http://local/api/career/state',{headers:{Authorization:'Bearer forged.token.value'}})).status,401);
});
void test('CORS admits the configured web origin and extra client origins, nothing else',async t=>{
 const mf=await worker(t,{CAREER_WEB_ORIGIN:'https://career.example.com',CAREER_CORS_ORIGINS:'https://app.example.com, https://other.example.com/'});
 const preflight=await mf.dispatchFetch('http://local/api/career/state',{method:'OPTIONS',headers:{origin:'https://career.example.com','access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'}});
 assert.equal(preflight.status,204);assert.equal(preflight.headers.get('access-control-allow-origin'),'https://career.example.com');
 assert.match(preflight.headers.get('access-control-allow-headers'),/authorization/);assert.equal(preflight.headers.get('vary'),'Origin');
 const extra=await mf.dispatchFetch('http://local/api/career/auth/config',{headers:{origin:'https://other.example.com'}});
 assert.equal(extra.status,200);assert.equal(extra.headers.get('access-control-allow-origin'),'https://other.example.com');
 const stranger=await mf.dispatchFetch('http://local/api/career/auth/config',{headers:{origin:'https://evil.example.com'}});
 assert.equal(stranger.status,200);assert.equal(stranger.headers.get('access-control-allow-origin'),null);
 assert.equal((await mf.dispatchFetch('http://local/api/career/state',{method:'OPTIONS',headers:{origin:'https://evil.example.com','access-control-request-method':'GET'}})).status,403);
 // Same-origin and non-browser callers never see CORS headers.
 assert.equal((await mf.dispatchFetch('http://local/api/career/auth/config')).headers.get('access-control-allow-origin'),null);
});
void test('profile keeps an optional target date and rejects malformed ones',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 let profile=(await (await send('state')).json()).profile;assert.equal(profile.targetDate,'');
 assert.equal((await send('profile',{...profile,targetDate:'2026-12-31'})).status,200);
 profile=(await (await send('state')).json()).profile;assert.equal(profile.targetDate,'2026-12-31');
 // Older clients and agents that do not know the field must not wipe it.
 const {targetDate:_omit,...withoutDate}=profile;
 assert.equal((await send('profile',{...withoutDate,summary:'agent edit'})).status,200);
 profile=(await (await send('state')).json()).profile;assert.equal(profile.targetDate,'2026-12-31');assert.equal(profile.summary,'agent edit');
 assert.equal((await send('profile',{...profile,targetDate:'2026/12/31'})).status,400);
 assert.equal((await send('profile',{...profile,targetDate:'2026-13-45'})).status,400);
 assert.equal((await send('profile',{...profile,targetDate:''})).status,200);
 assert.equal((await (await send('state')).json()).profile.targetDate,'');
});
void test('built-in question bank accepts attempts and review requests without a saved job',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const saved=await send('attempts',{questionSetId:'builtin-basics',questionId:'self-intro',answer:'田中と申します。',language:'日语',durationSeconds:45,requestReview:true});
 assert.equal(saved.status,200);const attempt=await saved.json();
 assert.equal(attempt.jobId,'');assert.equal(attempt.question.questionJa,'まず、簡単に自己紹介をお願いします。');
 const state=await (await send('state')).json();
 assert.equal(state.attempts.length,1);assert.equal(state.questionSets.length,0); // bank packs are static, never stored
 assert.ok(state.tasks.some(task=>task.kind==='回答点评'&&task.attemptId===attempt.id&&task.jobId===''));
 assert.equal((await send('attempts',{questionSetId:'builtin-basics',questionId:'missing',answer:'x',language:'日语',durationSeconds:0})).status,400);
 // Imports must not shadow a built-in pack id.
 const clash=await send('import',{schemaVersion:1,questionSets:[{id:'builtin-basics',jobId:'none',title:'t',scenario:'s',plan:'p',sourceNotes:'n',questions:[]}]});
 assert.equal(clash.status,400);
});
void test('one company question set is updated in place while answers keep their question snapshot',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const job={id:'fixture-job',company:'Example Company',role:'Engineer'};
 assert.equal((await send('import',{schemaVersion:1,jobs:[job],completeTaskIds:[]})).status,200);
 const question={id:'intro',title:'Introduction',questionJa:'自己紹介をお願いします。',meaning:'Introduce yourself',why:'Opening question',outline:'Experience',sampleAnswer:'経験を簡単に説明します。',followUps:'What did you build?',category:'Opening',targetSeconds:60};
 const pack={id:'fixture-pack',jobId:job.id,title:'Practice',scenario:'First interview',plan:'Practice once',sourceNotes:'Fixture only',questions:[question]};
 assert.equal((await send('import',{schemaVersion:1,questionSets:[pack],completeTaskIds:[]})).status,200);
 const originalCreatedAt=(await (await send('state')).json()).questionSets[0].createdAt;
 const duplicate=await send('import',{schemaVersion:1,questionSets:[{...pack,id:'fixture-pack-v2'}],completeTaskIds:[]});
 assert.equal(duplicate.status,400);assert.match((await duplicate.json()).error,/现有题组 id/);
 const attempt=await (await send('attempts',{questionSetId:pack.id,questionId:question.id,answer:'My answer',language:'日语',durationSeconds:60})).json();
 const removed=await send('import',{schemaVersion:1,questionSets:[{...pack,questions:[{...question,id:'replacement'}]}],completeTaskIds:[]});
 assert.equal(removed.status,400);assert.match((await removed.json()).error,/已有回答的问题 id/);
 const updated={...pack,title:'Updated practice',questions:[{...question,title:'Revised introduction',questionJa:'これまでの経験を教えてください。'}]};
 assert.equal((await send('import',{schemaVersion:1,questionSets:[updated],completeTaskIds:[]})).status,200);
 const state=await (await send('state')).json();
 assert.equal(state.questionSets.length,1);
 assert.equal(state.questionSets[0].id,pack.id);
 assert.equal(state.questionSets[0].createdAt,originalCreatedAt);
 assert.equal(state.questionSets[0].questions[0].title,'Revised introduction');
 assert.equal(state.questionSets[0].questions[0].sampleAnswer,question.sampleAnswer);
 assert.equal(state.attempts.find(a=>a.id===attempt.id).question.title,'Introduction');
 assert.equal(state.attempts.find(a=>a.id===attempt.id).question.sampleAnswer,question.sampleAnswer);
});
void test('a saved answer can carry a recording: owner playback, agent download link, expiry',async t=>{
 const mf=await worker(t);const send=(path,body)=>mf.dispatchFetch('http://local/api/career/'+path,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});
 const attempt=await (await send('attempts',{questionSetId:'builtin-basics',questionId:'self-intro',answer:'田中と申します。',language:'日语',durationSeconds:45})).json();
 assert.equal((await send('attempts/audio?id='+attempt.id)).status,404); // nothing recorded yet
 const bytes=new Uint8Array([0x1a,0x45,0xdf,0xa3,1,2,3,4]);
 const upload=(id,body,type='audio/webm;codecs=opus')=>mf.dispatchFetch('http://local/api/career/attempts/audio?id='+id,{method:'POST',headers:{'Content-Type':type},body});
 assert.equal((await upload(attempt.id,bytes,'text/plain')).status,400);
 assert.equal((await upload('missing',bytes)).status,404);
 const saved=await (await upload(attempt.id,bytes)).json();
 assert.equal(saved.audio.contentType,'audio/webm');assert.equal(saved.audio.size,bytes.length);
 assert.equal((await (await send('state')).json()).attempts[0].audio.size,bytes.length);
 const play=await send('attempts/audio?id='+attempt.id);
 assert.equal(play.status,200);assert.equal(play.headers.get('content-type'),'audio/webm');
 assert.deepEqual(new Uint8Array(await play.arrayBuffer()),bytes);
 // Agents get a short-lived unauthenticated URL instead of bytes through MCP.
 const link=await (await send('attempts/audio-link',{attemptId:attempt.id})).json();
 assert.match(link.url,/\/api\/career\/attempts\/audio\/[a-f0-9]{48}$/);assert.equal(link.durationSeconds,45);
 const fetched=await mf.dispatchFetch(link.url);assert.equal(fetched.status,200);assert.deepEqual(new Uint8Array(await fetched.arrayBuffer()),bytes);
 assert.equal((await mf.dispatchFetch(link.url.replace(/.{4}$/,'0000'))).status,404);
 assert.equal((await send('attempts/audio-link',{attemptId:'missing'})).status,404);
});
