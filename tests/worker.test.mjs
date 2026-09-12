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
