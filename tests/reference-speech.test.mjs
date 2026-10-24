import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteReferenceSpeechForPacks, numberedReferenceQuestions, plainReferenceSpeech, referenceSpeechResponse, ReferenceSpeechError } from '../worker/reference-speech.ts';

test('numbered reverse questions keep only one spoken question at a time', () => {
  const sample = '① Javaの{開発案件|かいはつあんけん}はありますか。\n\n② {日本語|にほんご}はどこで使いますか。';
  assert.deepEqual(numberedReferenceQuestions(sample), [
    'Javaの{開発案件|かいはつあんけん}はありますか。',
    '{日本語|にほんご}はどこで使いますか。',
  ]);
  assert.equal(plainReferenceSpeech(numberedReferenceQuestions(sample)[0]), 'Javaの開発案件はありますか。');
});

test('deleting a question pack removes only its stored speech across R2 pages', async () => {
  const keys = new Set([
    'owner/reference-speech/v1/pack-a/q1/voice/first.mp3',
    'owner/reference-speech/v1/pack-a/q2/voice/second.mp3',
    'owner/reference-speech/v1/pack-b/q1/voice/keep.mp3',
    'other/reference-speech/v1/pack-a/q1/voice/keep.mp3',
  ]);
  const bucket = {
    list: async ({ prefix, cursor }) => {
      const matches = [...keys].filter(key => key.startsWith(prefix) && (!cursor || key > cursor)).sort();
      const objects = matches.slice(0, 1).map(key => ({ key }));
      return { objects, truncated: matches.length > 1, cursor: objects[0]?.key };
    },
    delete: async entries => { for (const key of entries) keys.delete(key); },
  };
  await deleteReferenceSpeechForPacks(bucket, 'owner', ['pack-a']);
  assert.deepEqual([...keys].sort(), [
    'other/reference-speech/v1/pack-a/q1/voice/keep.mp3',
    'owner/reference-speech/v1/pack-b/q1/voice/keep.mp3',
  ]);
});

test('Azure synthesis is saved once in private R2 and later served without a key', async () => {
  const objects = new Map();
  const bucket = {
    get: async key => objects.has(key) ? { body: new Response(objects.get(key)).body, size: objects.get(key).length } : null,
    put: async (key, bytes, options) => {
      assert.equal(options.httpMetadata.contentType, 'audio/mpeg');
      objects.set(key, new Uint8Array(bytes));
    },
  };
  const sampleAnswer = '① Javaや{金融|きんゆう}の案件はありますか。\n\n② 配属後の工程は何ですか。';
  const base = { uid: 'owner', packId: 'pack', questionId: 'reverse',
    source: numberedReferenceQuestions(sampleAnswer)[0], voice: 'ja-JP-NanamiNeural',
    sampleAnswer, category: '逆質問', bucket };
  const audio = Uint8Array.from([0xff, 0xfb, 0x90, 0x64]);
  let calls = 0;
  const fetcher = async (url, options) => {
    calls += 1;
    assert.equal(url, 'https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1');
    assert.equal(options.headers['Ocp-Apim-Subscription-Key'], 'test-key');
    assert.match(options.body, /Javaや金融の案件はありますか。/);
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg' } });
  };
  const first = await referenceSpeechResponse({ ...base, azureRegion: 'japaneast', azureKey: 'test-key', fetcher });
  assert.equal(first.status, 200);
  assert.deepEqual(new Uint8Array(await first.arrayBuffer()), audio);
  assert.equal(objects.size, 1);
  const second = await referenceSpeechResponse(base);
  assert.equal(second.status, 200);
  assert.deepEqual(new Uint8Array(await second.arrayBuffer()), audio);
  assert.equal(calls, 1);
  assert.equal(second.headers.get('cache-control'), 'private, no-store');
  await assert.rejects(referenceSpeechResponse({ ...base, source: '任意の文章' }),
    error => error instanceof ReferenceSpeechError && error.status === 409);
  await assert.rejects(referenceSpeechResponse({ ...base, voice: 'other' }),
    error => error instanceof ReferenceSpeechError && error.status === 400);
});
