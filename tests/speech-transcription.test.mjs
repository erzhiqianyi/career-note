import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, createFetchMock } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authorizeAgent } from './oauth-client.mjs';

// Stub only the external inference boundary. All routing, WAV checks, D1, R2 and revisions are real.
const bundle = await build({ stdin: { contents: `import worker from './worker/index.ts';
export default { fetch(request, env, ctx) { return worker.fetch(request, { ...env, AI: { async run(model, input) {
 if (input.language === 'zh') throw new Error('synthetic provider failure');
 return { text: '架空の回答です。', segments: [{ start: 0, end: 0.5, text: '架空の回答です。' }] };
} } }, ctx); } };`, resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', platform: 'browser', conditions: ['workerd'], target: 'es2022' });
function wav(seconds) {
  const data = new Uint8Array(44 + Math.round(seconds * 16000) * 2), view = new DataView(data.buffer);
  const tag = (i, str) => data.set(new TextEncoder().encode(str), i);
  tag(0, 'RIFF'); tag(8, 'WAVE'); tag(12, 'fmt '); tag(36, 'data');
  view.setUint32(4, data.length - 8, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, 16000, true);
  view.setUint32(28, 32000, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, data.length - 44, true);
  return data;
}
async function host(t, options = {}) {
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-22',
    d1Databases: ['CAREER_DB'], r2Buckets: ['CAREER_AUDIO'], ...options });
  t.after(() => mf.dispose());
  const send = async (path, body, expected = 200, token) => {
    const res = await mf.dispatchFetch('http://local/api/career/' + path, {
      method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': body instanceof Uint8Array ? 'audio/wav' : 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body),
    });
    const result = await res.json(); assert.equal(res.status, expected, JSON.stringify(result)); return result;
  };
  return { mf, send, db: await mf.getD1Database('CAREER_DB') };
}
const job = (id, durationSeconds = 31, language = 'ja') => ({ id, target: 'practice', language, durationSeconds });

test('cloud recognition resumes completed WAV chunks, keeps global time, and never fabricates attempts', async t => {
  const { send } = await host(t);
  await send('speech', job('resume'));
  await send('speech', job('resume', 32), 409);
  await send('speech/complete', { id: 'resume' }, 409);
  await send('speech/chunk?id=resume&part=0', new Uint8Array(44), 400);
  assert.equal((await send('speech/usage')).usedSeconds, 0);
  const first = await send('speech/chunk?id=resume&part=0', wav(30));
  assert.deepEqual((await send('speech/status?id=resume')).completedParts, [0]);
  assert.deepEqual(await send('speech/chunk?id=resume&part=0', wav(30)), first);
  assert.equal((await send('speech/usage')).usedSeconds, 30);
  await send('speech/chunk?id=resume&part=1', wav(1));
  const complete = await send('speech/complete', { id: 'resume' });
  assert.equal(complete.transcript.segments[1].start, 30);
  assert.equal(complete.transcript.segments[1].speaker, 'unknown');
  assert.equal(complete.transcript.segments[1].confirmed, false);
  assert.equal((await send('speech/usage')).usedSeconds, 31);
  assert.equal((await send('state')).attempts.length, 0);
  assert.equal((await send('speech/complete', { id: 'resume' })).text, complete.text);
});

test('quota stops inference, failures retain reservations, and invalid durations cannot spoof usage', async t => {
  const { send, db } = await host(t);
  await send('speech', job('failed', 1, 'zh'));
  await send('speech/chunk?id=failed&part=0', wav(1), 503);
  assert.equal((await send('speech/usage')).usedSeconds, 1);
  assert.equal((await send('speech/status?id=failed')).failures.length, 1);
  await send('speech', job('quota', 30));
  await send('speech/chunk?id=quota&part=0', wav(1), 400);
  const day = new Date().toISOString().slice(0, 10);
  await db.prepare('UPDATE speech_daily_usage SET seconds=10800 WHERE day=?1').bind(day).run();
  await send('speech/chunk?id=quota&part=0', wav(30), 429);
  assert.equal((await send('speech/usage')).usedSeconds, 10800);
  await db.prepare('UPDATE speech_daily_usage SET seconds=0 WHERE day=?1').bind(day).run();
  await send('speech/chunk?id=quota&part=0', wav(30));
  assert.deepEqual((await send('speech/status?id=quota')).completedParts, [0]);
});

async function interview(send, id) {
  await send('interviews', { id, title: '架空面接', jobId: '', date: '2026-11-05', durationSeconds: 1 });
  await send('interviews/upload', { id, size: 64, contentType: 'audio/wav', fileName: 'synthetic.wav' });
  await send(`interviews/upload-part?id=${id}&part=1`, new Uint8Array(64));
  await send('interviews/upload-complete', { id });
  await send('speech', { ...job('stt-' + id, 1), target: 'interview', interviewId: id });
  await send(`speech/chunk?id=stt-${id}&part=0`, wav(1));
}

test('interview completion saves versioned transcript once and protects existing human edits', async t => {
  const { send } = await host(t);
  await interview(send, 'save');
  const old = await send('interviews/document?id=save');
  await send('speech/complete', { id: 'stt-save' });
  const saved = await send('interviews/document?id=save');
  assert.equal(saved.revision, old.revision + 1);
  assert.equal(saved.transcript.originalText, '架空の回答です。');
  await send('speech/complete', { id: 'stt-save' });
  assert.equal((await send('interviews/document?id=save')).revision, saved.revision);
  await interview(send, 'protect');
  const current = await send('interviews/document?id=protect');
  await send('interviews/stage', { id: 'protect', revision: current.revision, stage: 'transcript',
    data: { source: 'human', originalText: '本人による転写', segments: [] } });
  await send('speech/complete', { id: 'stt-protect' }, 409);
  assert.equal((await send('interviews/document?id=protect')).transcript.originalText, '本人による転写');
});


test('recognition jobs and chunks are tenant private and MCP cannot spend inference quota', async t => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'speech-tenant' };
  const mock = createFetchMock(); mock.disableNetConnect();
  mock.get('https://www.googleapis.com').intercept({ path: '/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com' }).reply(200, { keys: [jwk] }).persist();
  const { mf, send } = await host(t, { bindings: { FIREBASE_PROJECT_ID: 'test-project' }, fetchMock: mock });
  const sign = uid => new SignJWT({ email: uid + '@example.com', email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'google.com' } })
    .setProtectedHeader({ alg: 'RS256', kid: 'speech-tenant' }).setSubject(uid).setIssuer('https://securetoken.google.com/test-project').setAudience('test-project').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const alice = await sign('alice'), bob = await sign('bob');
  await send('speech', job('same', 1), 200, alice);
  await send('speech/status?id=same', undefined, 404, bob);
  await send('speech/chunk?id=same&part=0', wav(1), 404, bob);
  await send('speech/complete', { id: 'same' }, 404, bob);
  await send('speech', job('same', 1), 200, bob);
  await send('speech/chunk?id=same&part=0', wav(1), 200, alice);
  assert.deepEqual((await send('speech/status?id=same', undefined, 200, bob)).completedParts, []);
  assert.equal((await send('speech/usage', undefined, 200, bob)).usedSeconds, 1);
  // OAuth capability still cannot be used to trigger external recognition.
  const local = await host(t);
  const token = (await authorizeAgent(local.mf, { scopes: ['career:read', 'career:write'] })).issued.access_token;
  await local.send('speech', job('agent', 1), 403, token);
  await local.send('speech/usage', undefined, 403, token);
});
