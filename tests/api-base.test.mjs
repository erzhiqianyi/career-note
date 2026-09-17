import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
// The API address is inlined at build time (vite `define`); compile the module twice to cover both shapes.
async function load(apiUrl) {
 const out=await build({entryPoints:['lib/api-base.ts'],bundle:true,write:false,format:'iife',globalName:'mod',define:{'process.env.NEXT_PUBLIC_CAREER_API_URL':JSON.stringify(apiUrl)}});
 const sandbox={};runInNewContext(out.outputFiles[0].text,sandbox);return sandbox.mod;
}
void test('unset API address keeps every request same-origin',async()=>{
 const {apiUrl,API_BASE_PATH}=await load('');
 assert.equal(API_BASE_PATH,'/api/career');assert.equal(apiUrl('state'),'/api/career/state');assert.equal(apiUrl('/auth/config'),'/api/career/auth/config');assert.equal(apiUrl(),'/api/career');
});
void test('hosted API address is prefixed and trailing slashes are ignored',async()=>{
 const {apiUrl,API_BASE_PATH}=await load(' https://career-api.example.com/ ');
 assert.equal(API_BASE_PATH,'https://career-api.example.com/api/career');assert.equal(apiUrl('mcp'),'https://career-api.example.com/api/career/mcp');
});
