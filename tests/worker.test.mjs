import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const bundled=await build({entryPoints:['worker/index.ts'],bundle:true,write:false,format:'esm',platform:'browser',target:'es2022'});
async function worker(t,bindings={}) {
 const mf=new Miniflare({workers:[{name:'career',modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-05-22',d1Databases:['CAREER_DB'],bindings}]});
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
