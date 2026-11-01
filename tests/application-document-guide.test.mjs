import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { authorizeAgent, json, origin } from './oauth-client.mjs';

const bundled = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });

test('MCP document skill guides a scoped agent through preview, versioned saves and read-back', async t => {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'] });
  t.after(() => mf.dispose());
  const rpc = async (token, method, params = {}) => json(await mf.dispatchFetch(origin + '/api/career/mcp', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  const reader = (await authorizeAgent(mf, { scopes: ['career:read'] })).issued.access_token;
  const call = async (token, name, args = {}) => {
    const response = await rpc(token, 'tools/call', { name, arguments: args });
    assert.ok(response.result, JSON.stringify(response));
    assert.ok(!response.result.isError, JSON.stringify(response));
    return response.result.structuredContent;
  };
  const guide = await call(reader, 'career_get_application_document_guide');
  const source = await readFile('.agents/skills/career-japanese-job-documents/SKILL.md', 'utf8');
  assert.equal(guide.instructions, source.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim());
  assert.deepEqual(guide.stages, ['inventory', 'tailor', 'review']);
  const before = await call(reader, 'career_get_context');
  assert.equal(before.materials.length, 0);
  assert.equal(before.reports.length, 0);

  const writer = (await authorizeAgent(mf, { scopes: ['career:read', 'agent:write'] })).issued.access_token;
  const listed = (await rpc(writer, 'tools/list')).result.tools;
  const documentGuide = listed.find(tool => tool.name === 'career_get_application_document_guide');
  assert.equal(documentGuide.annotations.readOnlyHint, true);
  for (const stage of ['inventory', 'tailor', 'review']) {
    const route = guide.saveRoutes[stage];
    for (const field of ['previewTool', 'saveTool', 'readBackTool']) assert.ok(listed.some(tool => tool.name === route[field]));
    assert.equal(route.scope, 'agent:write');
  }
  assert.equal(guide.saveRoutes.generalResume.scope, 'career:write');
  assert.equal(guide.saveRoutes.sourceFacts.scope, 'career:write');
  assert.ok(!listed.some(tool => tool.name === guide.saveRoutes.generalResume.saveTool));
  const owner = (await authorizeAgent(mf, { scopes: ['career:read', 'career:write'] })).issued.access_token;
  const ownerTools = (await rpc(owner, 'tools/list')).result.tools;
  for (const key of ['generalResume', 'sourceFacts']) assert.ok(ownerTools.some(tool => tool.name === guide.saveRoutes[key].saveTool));

  // A real job must be saved before the company-specific documents.
  await call(writer, 'career_import', { bundle: { schemaVersion: 1, jobs: [{ id: 'fixture-job', company: 'Example', role: 'Engineer' }], completeTaskIds: [] } });
  const seeded = await call(reader, 'career_get_context');
  const report = (id, stage) => ({ id, date: '2026-10-30', title: stage, content: 'Fixture evidence and unresolved facts.', sourceNotes: `stage=${stage}; jobId=fixture-job; fixture source` });
  const material = { id: 'fixture-doc-v1', jobId: 'fixture-job', kind: '職務経歴書', title: 'Example · 職務経歴書 v1', content: '# 職務経歴書\n\n## 職務要約\n\n確認済みの開発経験。', sourceNotes: 'Fixture evidence', reviewItems: [{ field: '成果', note: '数値を確認' }] };
  const bundle = { schemaVersion: 1, reports: [report('fixture-inventory', 'inventory'), report('fixture-review', 'review')], materials: [material], completeTaskIds: [] };
  await call(writer, guide.saveRoutes.tailor.previewTool, { bundle });
  const previewed = await call(reader, 'career_get_context');
  assert.equal(previewed.materials.length, 0);
  assert.equal(previewed.reports.length, 0);
  const denied = await rpc(reader, 'tools/call', { name: guide.saveRoutes.tailor.saveTool, arguments: { bundle } });
  assert.ok(denied.error || denied.result?.isError);
  await call(writer, guide.saveRoutes.tailor.saveTool, { bundle });
  let saved = await call(reader, guide.saveRoutes.tailor.readBackTool);
  assert.deepEqual(saved.reports.map(row => row.id).sort(), ['fixture-inventory', 'fixture-review']);
  assert.equal(saved.materials[0].content, material.content);
  assert.deepEqual(saved.materials[0].reviewItems, material.reviewItems);
  assert.equal(saved.materials[0].jobId, 'fixture-job');
  await call(writer, 'career_import', { bundle: { schemaVersion: 1, materials: [{ ...material, id: 'fixture-doc-v2', title: 'Example · 職務経歴書 v2', content: material.content + '\n\n追加の確認済み経験。' }], completeTaskIds: [] } });
  saved = await call(reader, 'career_get_context');
  assert.equal(saved.materials.length, 2);
  assert.equal(saved.materials.find(row => row.id === material.id).content, material.content);
  assert.equal(saved.jobs[0].status, seeded.jobs[0].status);
});
