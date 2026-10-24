import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

void test('an offline answer retry returns the original answer and review task', async t => {
  const bundled = await build({
    entryPoints: ['worker/index.ts'], bundle: true, write: false,
    format: 'esm', platform: 'browser', conditions: ['workerd'], target: 'es2022'
  });
  const mf = new Miniflare({ workers: [{
    name: 'career', modules: true, script: bundled.outputFiles[0].text,
    compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'], r2Buckets: ['CAREER_AUDIO']
  }] });
  t.after(() => mf.dispose());
  const body = {
    clientRequestId: 'offline-attempt-1', questionSetId: 'builtin-basics',
    questionId: 'self-intro', answer: '自己紹介をします。',
    language: '日语', durationSeconds: 30, requestReview: true
  };
  const send = () => mf.dispatchFetch('http://local/api/career/attempts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const first = await send();
  assert.equal(first.status, 200);
  const attempt = await first.json();
  const retry = await send();
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).id, attempt.id);
  const state = await (await mf.dispatchFetch('http://local/api/career/state')).json();
  assert.equal(state.attempts.length, 1);
  assert.equal(state.tasks.filter(task => task.attemptId === attempt.id).length, 1);
  const conflict = await mf.dispatchFetch('http://local/api/career/attempts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, answer: 'a different answer' })
  });
  assert.equal(conflict.status, 409);
  const audio = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]);
  const upload = await mf.dispatchFetch(`http://local/api/career/attempts/audio?id=${attempt.id}`, {
    method: 'POST', headers: { 'Content-Type': 'audio/mp4' }, body: audio
  });
  assert.equal(upload.status, 200);
  assert.equal((await upload.json()).audio.size, audio.length);
  const fetchAudio = await mf.dispatchFetch(`http://local/api/career/attempts/audio?id=${attempt.id}`);
  assert.equal(fetchAudio.status, 200);
  assert.deepEqual(Buffer.from(await fetchAudio.arrayBuffer()), audio);
});
