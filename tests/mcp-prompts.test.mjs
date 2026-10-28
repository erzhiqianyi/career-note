import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { authorizeAgent, json, origin } from './oauth-client.mjs';

const bundled = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });

void test('MCP prompts carry the board and 志望動機 instructions with the caller’s own job', async (t) => {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'] });
  t.after(() => mf.dispose());
  const send = (path, body) => mf.dispatchFetch(origin + '/api/career/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  assert.equal((await send('import', { schemaVersion: 1, jobs: [{ id: 'prompt-job', company: 'Example 株式会社', role: 'Data Engineer', business: 'データ基盤' }], completeTaskIds: [] })).status, 200);
  const rpc = async (method, params, token) => json(await mf.dispatchFetch(origin + '/api/career/mcp', { method: 'POST', headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) }));

  // Anonymous discovery lists static metadata only.
  const names = (await rpc('prompts/list', {})).result.prompts.map((p) => p.name);
  assert.deepEqual(names.sort(), ['career_company_board', 'career_motivation']);

  const { issued } = await authorizeAgent(mf, { scopes: ['career:read', 'agent:write'], resource: origin + '/api/career/mcp' });
  const board = (await rpc('prompts/get', { name: 'career_company_board', arguments: { company: '#1' } }, issued.access_token)).result;
  const boardText = board.messages[0].content.text;
  assert.match(boardText, /Example 株式会社/);
  assert.match(boardText, /"business": "データ基盤"/);
  assert.match(boardText, /companyProfile/);
  const motive = (await rpc('prompts/get', { name: 'career_motivation', arguments: { company: 'prompt-job' } }, issued.access_token)).result;
  assert.match(motive.messages[0].content.text, /applicationReason/);
  assert.match(motive.messages[0].content.text, /100 字/);

  const missing = await rpc('prompts/get', { name: 'career_motivation', arguments: { company: 'nope' } }, issued.access_token);
  assert.ok(missing.error);

  // A read-only grant cannot fetch prompts that end in writes.
  const { issued: reader } = await authorizeAgent(mf, { scopes: ['career:read'], resource: origin + '/api/career/mcp' });
  const readerList = await rpc('prompts/list', {}, reader.access_token);
  assert.deepEqual(readerList.result?.prompts ?? [], []);
  assert.ok((await rpc('prompts/get', { name: 'career_company_board', arguments: { company: '#1' } }, reader.access_token)).error);
});
