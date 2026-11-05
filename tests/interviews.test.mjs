import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, createFetchMock } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authorizeAgent } from './oauth-client.mjs';

const bundled = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', conditions: ['workerd'], target: 'es2022' });
const origin = 'http://local/api/career/';
const source = { id: 'interview-fixture', title: '架空面接', jobId: '', date: '2026-11-05', durationSeconds: 120 };
const transcript = { source: 'synthetic.srt', originalText: 'Synthetic original 🗣️', segments: [
  { id: 's1', start: 0, end: 30, speaker: 'interviewer', text: '経験を説明してください。', confirmed: false },
  { id: 's2', start: 30, end: 120, speaker: 'candidate', text: 'Javaを使って開発しました。', confirmed: false },
] };
const flow = { overview: '全体を読んだ上で経歴説明を整理。', reviewedThroughSeconds: 120, sourceNotes: 'Synthetic full recording, no external assertions.',
  stages: [{ id: 'experience', title: '経歴紹介', kind: 'experience', start: 0, end: 120, summary: '経験と技術の確認。' }],
  exchanges: [{ id: 'e1', stageId: 'experience', question: '経験は？', answerSummary: 'Javaの開発経験。', ranges: [{ start: 0, end: 120 }], needsConfirmation: false }],
};
const review = { summary: '結論を先に伝える。', strengths: '具体的な経験。', externalFactors: '未確認。', uncertainties: '発音は未評価。',
  improvements: [{ id: 'i1', title: '結論から答える', exchangeIds: ['e1'], observation: '背景が先行。', suggestion: '最初の一文で答える。' }] };

async function host(t, options = {}) {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22',
    d1Databases: ['CAREER_DB'], r2Buckets: ['CAREER_AUDIO'], ...options });
  t.after(() => mf.dispose());
  return mf;
}
function api(mf, token) {
  return async (path, body, expected = 200, extra = {}) => {
    const response = await mf.dispatchFetch(origin + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json();
    assert.equal(response.status, expected, JSON.stringify(data));
    return data;
  };
}
async function audio(mf, send, id = source.id, size = 5 * 1024 * 1024 + 16, token) {
  const request = { id, size, contentType: 'audio/mp4', fileName: 'synthetic.m4a' };
  const upload = await send('interviews/upload', request);
  assert.equal(upload.partSize, 5 * 1024 * 1024);
  await send('interviews/upload-complete', { id }, 400);
  for (let number = 1; number <= Math.ceil(size / upload.partSize); number++) {
    const bytes = new Uint8Array(Math.min(upload.partSize, size - (number - 1) * upload.partSize)).fill(number);
    const response = await mf.dispatchFetch(origin + `interviews/upload-part?id=${id}&part=${number}`, {
      method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: bytes,
    });
    assert.equal(response.status, 200, await response.text());
    const resumed = await send('interviews/upload', request);
    assert.deepEqual(resumed.parts.map(part => part.partNumber), Array.from({ length: number }, (_, i) => i + 1));
  }
  const saved = await send('interviews/upload-complete', { id });
  assert.equal(saved.audio.size, size);
  assert.equal((await send('interviews/upload-complete', { id })).revision, saved.revision);
  return saved;
}

test('full interview: resumable audio → full flow → review → linked practice, immutable versions and no fabricated attempts', async t => {
  const mf = await host(t), send = api(mf);
  let current = await send('interviews', source);
  assert.equal((await send('interviews', source)).revision, 1);
  await send('interviews', { ...source, title: 'different source' }, 409);
  await send('interviews/request-analysis', { id: source.id }, 400);
  current = await audio(mf, send);
  const task = await send('interviews/request-analysis', { id: source.id });
  assert.equal((await send('interviews/request-analysis', { id: source.id })).id, task.id);
  await send('import', { schemaVersion: 1, completeTaskIds: [task.id] }, 400);
  const save = (stage, data, code = 200, revision = current.revision, preview = false) => send('interviews/stage' + (preview ? '/preview' : ''), { id: source.id, revision, stage, data }, code);
  await save('review', review, 400);
  await save('flow', flow, 400);
  const preview = await save('transcript', transcript, 200, current.revision, true);
  assert.equal(preview.valid, true);
  assert.equal((await send('interviews/document?id=' + source.id)).status, 'imported');
  await save('transcript', { ...transcript, segments: [{ ...transcript.segments[0], end: 121 }] }, 400);
  current = await save('transcript', transcript);
  const transcriptRevision = current.revision;
  const page = await send(`interviews/transcript?id=${source.id}&revision=${current.revision}&limit=1`);
  assert.equal(page.segments[0].id, 's1'); assert.equal(page.hasMore, true);
  assert.equal((await send(`interviews/transcript?id=${source.id}&revision=${current.revision}&offset=${page.nextOffset}&limit=1`)).segments[0].id, 's2');
  assert.equal((await send(`interviews/transcript?id=${source.id}&revision=${current.revision}&view=original&limit=12000`)).text, transcript.originalText);
  await save('flow', { ...flow, reviewedThroughSeconds: 60 }, 400);
  await save('flow', { ...flow, exchanges: [{ ...flow.exchanges[0], ranges: [{ start: 0, end: 121 }] }] }, 400);
  current = await save('flow', flow);
  await save('review', review, 409, current.revision - 1);
  await save('review', { ...review, improvements: [{ ...review.improvements[0], exchangeIds: ['missing'] }] }, 400);
  current = await save('review', review);
  const links = [{ questionSetId: 'fixture-pack', questionId: 'q1', exchangeIds: ['e1'], improvementIds: ['i1'] }];
  await save('practice', links, 400);
  const bundle = { schemaVersion: 1, completeTaskIds: [], questionSets: [{ id: 'fixture-pack', jobId: 'builtin:general', title: '架空練習',
    scenario: '面接の振り返り', plan: '結論を先に', sourceNotes: 'Fixture source interview',
    questions: [{ id: 'q1', title: '職歴', questionJa: '経験を説明してください。', meaning: '经历', why: 'Improve clarity', outline: '結論→背景',
      followUps: '具体例は？', category: 'experience', targetSeconds: 90 }] }] };
  await send('import/preview', bundle); await send('import', bundle);
  current = await save('practice', links);
  const state = await send('state');
  assert.equal(state.attempts.length, 0); assert.equal(state.reviews.length, 0);
  assert.equal(state.tasks.find(item => item.id === task.id).status, '已完成');
  assert.equal(state.interviews[0].practiceCount, 1);
  assert.equal(state.interviews[0].transcript, undefined);
  const historical = await send(`interviews/document?id=${source.id}&revision=${transcriptRevision}`);
  assert.equal(historical.flow, undefined); assert.equal(historical.transcript.segments[1].text, transcript.segments[1].text);
  await save('transcript', { ...transcript, originalText: 'overwrite source' }, 400);
  current = await save('transcript', { ...transcript, segments: transcript.segments.map(item => ({ ...item, confirmed: true })) });
  assert.equal(current.flow, undefined); assert.equal(current.review, undefined); assert.equal(current.practice, undefined);
  const versions = await send('interviews/history?id=' + source.id);
  assert.equal(versions.versions.length, current.revision);
  const savedPractice = await send(`interviews/document?id=${source.id}&revision=${current.revision - 1}`);
  assert.equal(savedPractice.practice.length, 1);
  const full = await mf.dispatchFetch(origin + 'interviews/audio?id=' + source.id);
  assert.equal(full.status, 200); assert.equal(Number(full.headers.get('content-length')), 5 * 1024 * 1024 + 16);
  await full.arrayBuffer();
  const partial = await mf.dispatchFetch(origin + 'interviews/audio?id=' + source.id, { headers: { Range: 'bytes=0-7' } });
  assert.equal(partial.status, 206); assert.deepEqual([...new Uint8Array(await partial.arrayBuffer())], Array(8).fill(1));
  assert.equal((await mf.dispatchFetch(origin + 'interviews/audio?id=' + source.id, { headers: { Range: 'bytes=99999999-' } })).status, 416);
  const link = await send('interviews/audio-link', { id: source.id });
  const linked = await mf.dispatchFetch(link.url, { headers: { Range: 'bytes=-4' } });
  assert.equal(linked.status, 206); assert.deepEqual([...new Uint8Array(await linked.arrayBuffer())], [2, 2, 2, 2]);
});

test('MCP exposes whole-interview workflow, scoped stage writes, bounded reads and private source audio', async t => {
  const mf = await host(t), send = api(mf);
  await send('interviews', source);
  await audio(mf, send, source.id, 16);
  const reader = (await authorizeAgent(mf, { scopes: ['career:read'] })).issued.access_token;
  const writer = (await authorizeAgent(mf, { scopes: ['career:read', 'agent:write'] })).issued.access_token;
  const rpc = async (token, method, params) => api(mf, token)('mcp', { jsonrpc: '2.0', id: 1, method, params }, 200, { Accept: 'application/json, text/event-stream' });
  const call = async (token, name, args = {}) => {
    const response = await rpc(token, 'tools/call', { name, arguments: args });
    assert.ok(response.result && !response.result.isError, JSON.stringify(response));
    return response.result;
  };
  const tools = (await rpc(reader, 'tools/list')).result.tools;
  assert.ok(tools.some(item => item.name === 'career_get_interview'));
  assert.ok(!tools.some(item => item.name === 'career_save_interview_stage'));
  assert.match((await call(reader, 'career_get_interview_guide')).content[0].text, /WHOLE/);
  assert.equal((await call(reader, 'career_list_interviews')).structuredContent.interviews.length, 1);
  const current = (await call(reader, 'career_get_interview', { id: source.id })).structuredContent;
  const change = { id: source.id, revision: current.revision, stage: 'transcript', data: transcript };
  assert.equal((await call(writer, 'career_save_interview_stage', { change, preview: true })).structuredContent.valid, true);
  const saved = (await call(writer, 'career_save_interview_stage', { change, preview: false })).structuredContent;
  const page = await call(reader, 'career_get_interview_transcript', { id: source.id, revision: saved.revision, limit: 1 });
  assert.equal(page.structuredContent.hasMore, true);
  assert.equal((await call(reader, 'career_get_interview_audio', { id: source.id })).structuredContent.size, 16);
  await api(mf, writer)('interviews', { ...source, id: 'forbidden' }, 403);
  await api(mf, reader)('interviews/stage', change, 403);
});

test('interview source, transcript, history, upload receipts and audio remain isolated by authenticated owner', async t => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'interview-tenant' };
  const mock = createFetchMock(); mock.disableNetConnect();
  mock.get('https://www.googleapis.com').intercept({ path: '/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com' }).reply(200, { keys: [jwk] }).persist();
  const mf = await host(t, { bindings: { FIREBASE_PROJECT_ID: 'test-project' }, fetchMock: mock });
  const sign = uid => new SignJWT({ email: uid + '@example.com', email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'google.com' } })
    .setProtectedHeader({ alg: 'RS256', kid: 'interview-tenant' }).setSubject(uid).setIssuer('https://securetoken.google.com/test-project').setAudience('test-project').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const aliceToken = await sign('alice'), bobToken = await sign('bob');
  const alice = api(mf, aliceToken), bob = api(mf, bobToken);
  await alice('interviews', source);
  await audio(mf, alice, source.id, 16, aliceToken);
  for (const path of ['document', 'transcript', 'history', 'audio']) await bob('interviews/' + path + '?id=' + source.id, undefined, 404);
  await bob('interviews/upload', { id: source.id, size: 16, contentType: 'audio/mp4', fileName: 'synthetic.m4a' }, 404);
  assert.equal((await bob('state')).interviews.length, 0);
  await bob('interviews', { ...source, title: 'Bob separate source' });
  assert.equal((await alice('interviews/document?id=' + source.id)).title, source.title);
  assert.equal((await bob('interviews/document?id=' + source.id)).audio, undefined);
  await bob('interviews/audio-link', { id: source.id }, 404);
});
