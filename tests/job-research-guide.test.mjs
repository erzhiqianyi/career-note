import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { authorizeAgent, json, origin } from './oauth-client.mjs';

const bundled = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });

test('MCP research skill supplies complete portable instructions and usable scoped save routes', async t => {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'] });
  t.after(() => mf.dispose());
  const rpc = async (token, method, params = {}) => json(await mf.dispatchFetch(origin + '/api/career/mcp', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  }));
  const call = async (token, name, args = {}) => {
    const response = await rpc(token, 'tools/call', { name, arguments: args });
    assert.ok(response.result && !response.result.isError, JSON.stringify(response));
    return response.result.structuredContent;
  };
  const reader = (await authorizeAgent(mf, { scopes: ['career:read'] })).issued.access_token;
  const listed = (await rpc(reader, 'tools/list')).result.tools;
  assert.equal(listed.find(tool => tool.name === 'career_get_job_research_guide').annotations.readOnlyHint, true);
  const before = await call(reader, 'career_get_context');
  const guide = await call(reader, 'career_get_job_research_guide');
  assert.equal(guide.skill, 'career-job-research');
  const source = await readFile('.agents/skills/career-job-research/SKILL.md', 'utf8');
  assert.equal(guide.instructions, source.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '').trim());
  // Every relative Markdown dependency must be available to an agent without the repository.
  const references = [...guide.instructions.matchAll(/\]\((references\/[^)]+\.md)\)/g)].map(match => match[1]);
  assert.ok(references.length);
  for (const path of references) {
    assert.equal(guide.references.find(reference => reference.path === path)?.content, await readFile('.agents/skills/career-job-research/' + path, 'utf8'));
  }
  const after = await call(reader, 'career_get_context');
  for (const collection of ['jobs', 'materials', 'reports']) assert.deepEqual(after[collection], before[collection]);

  const writer = (await authorizeAgent(mf, { scopes: ['career:read', 'agent:write'] })).issued.access_token;
  const writerTools = (await rpc(writer, 'tools/list')).result.tools;
  for (const key of ['research', 'materials', 'reports']) {
    for (const field of ['previewTool', 'saveTool', 'readBackTool']) assert.ok(writerTools.some(tool => tool.name === guide.saveRoutes[key][field]));
  }
  for (const key of ['rating', 'preference']) {
    assert.equal(guide.saveRoutes[key].scope, 'career:write');
    assert.equal(guide.saveRoutes[key].requiresUserRequest, true);
    assert.ok(!writerTools.some(tool => tool.name === guide.saveRoutes[key].saveTool));
  }
  const route = guide.saveRoutes.research;
  const job = {
    id: 'fixture-research-job', company: 'Example (fictional)', role: 'Data engineer',
    url: 'https://example.com/jobs/data', sourceDate: '2026-11-01', sourcePlatform: '公司官网',
    matchNotes: 'Fixture: SQL requirement matches recorded SQL experience.', unknowns: 'Spoken Japanese requirement is not stated.',
    companyProfile: { overview: '架空のデータサービス企業。', verifiedAt: '2026-11-01', sources: [{ label: 'Fixture official site', url: 'https://example.com' }] },
  };
  const bundle = { schemaVersion: 1, jobs: [job], completeTaskIds: [] };
  await call(writer, route.previewTool, { bundle });
  assert.equal((await call(reader, route.readBackTool)).jobs.length, before.jobs.length);
  const denied = await rpc(reader, 'tools/call', { name: route.saveTool, arguments: { bundle } });
  assert.ok(denied.error || denied.result?.isError);
  await call(writer, route.saveTool, { bundle });
  const saved = (await call(reader, route.readBackTool)).jobs.find(row => row.id === job.id);
  assert.equal(saved.matchNotes, job.matchNotes);
  assert.equal(saved.unknowns, job.unknowns);
  assert.equal(saved.url, job.url);
  assert.equal(saved.companyProfile.overview, job.companyProfile.overview);
  assert.deepEqual(saved.companyProfile.sources, job.companyProfile.sources);
  assert.equal(saved.status, '关注中');
  const materialRoute = guide.saveRoutes.materials;
  const material = { id: 'fixture-company-research', jobId: job.id, kind: '公司研究', title: 'Fixture company research', content: 'Fixture facts, fit and questions for the adviser.', sourceNotes: job.url };
  const materialsBundle = { schemaVersion: 1, materials: [material], completeTaskIds: [] };
  await call(writer, materialRoute.previewTool, { bundle: materialsBundle });
  await call(writer, materialRoute.saveTool, { bundle: materialsBundle });
  const linked = (await call(reader, materialRoute.readBackTool)).materials.find(row => row.id === material.id);
  assert.equal(linked.jobId, job.id);
  assert.equal(linked.content, material.content);

  // Preparing application documents must not require a speculative company interview pack.
  assert.deepEqual(guide.preparationPolicy.applicationMaterialKinds, ['公司研究', '履歴書', '職務経歴書', '志望動機']);
  assert.equal(guide.preparationPolicy.minimumApplicationSyncMaterial.kind, '志望動機');
  assert.equal(guide.preparationPolicy.minimumApplicationSyncMaterial.maxApplicationReasonCharacters, 100);
  assert.equal(guide.preparationPolicy.minimumApplicationSyncMaterial.exceptExplicitJobsOnlyOrPreview, true);
  const task = await call(writer, 'career_create_task', { kind: '公司准备', jobId: job.id });
  assert.match(task.instructions, /四类申请资料/);
  assert.match(task.instructions, /收到面试安排或本人明确要求/);
  const applicationMaterials = guide.preparationPolicy.applicationMaterialKinds.map((kind, index) => ({
    id: 'fixture-application-' + index, jobId: job.id, kind, title: 'Fixture ' + kind,
    content: '# ' + kind + '\n\nFixture confirmed facts.', sourceNotes: 'Disposable fixture',
  }));
  const applicationBundle = { schemaVersion: 1, materials: applicationMaterials, completeTaskIds: [task.id] };
  await call(writer, 'career_preview_import', { bundle: applicationBundle });
  await call(writer, 'career_import', { bundle: applicationBundle });
  const completed = await call(reader, 'career_get_context');
  assert.equal(completed.tasks.find(row => row.id === task.id).status, '已完成');
  assert.deepEqual(completed.questionSets, after.questionSets);
  const explicit = await call(writer, 'career_create_task', { kind: '公司准备', jobId: job.id, instructions: 'Interview arranged: prepare the first-round practice requested by the user.' });
  assert.equal(explicit.instructions, 'Interview arranged: prepare the first-round practice requested by the user.');
});
