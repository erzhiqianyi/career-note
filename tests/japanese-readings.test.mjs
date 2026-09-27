import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
import { authorizeAgent, json, origin } from './oauth-client.mjs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// lib files import each other without extensions, so bundle them like the app does.
const dir = await mkdtemp(join(tmpdir(), 'career-note-readings-'));
const load = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
  const file = join(dir, entry.replace(/\//g, '-') + '.mjs');
  await writeFile(file, out.outputFiles[0].text);
  return import(pathToFileURL(file).href);
};
const { alignReading, annotate, buildGlossary, rubyHTML, inlineReadings, inlineRubyHTML, plainJapanese } = await load('lib/japanese-readings.ts');
const { resumeHTML } = await load('lib/personalized-resume.ts');

const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

void test('longest match in one pass: a shorter word never nests inside a longer one', () => {
  const g = buildGlossary([{ word: '職務経歴', reading: 'しょくむけいれき' }, { word: '職務', reading: 'しょくむ' }]);
  const html = rubyHTML('職務経歴と職務', g, esc, 'ja');
  assert.equal(html, '<ruby>職務経歴<rt>しょくむけいれき</rt></ruby>と<ruby>職務<rt>しょくむ</rt></ruby>');
  assert.doesNotMatch(html, /<ruby>[^<]*<ruby>/);
});

void test('okurigana and katakana in a word are not annotated again', () => {
  assert.deepEqual(alignReading('取り組み', 'とりくみ'), [{ text: '取', reading: 'と' }, { text: 'り' }, { text: '組', reading: 'く' }, { text: 'み' }]);
  assert.deepEqual(alignReading('株式会社テスト', 'かぶしきがいしゃテスト'), [{ text: '株式会社', reading: 'かぶしきがいしゃ' }, { text: 'テスト' }]);
  // A reading that does not fit the kana in the word falls back to one ruby over the whole word.
  assert.deepEqual(alignReading('取り組み', 'とくみ'), [{ text: '取り組み', reading: 'とくみ' }]);
});

void test('auto mode leaves Chinese lines alone; escaping still applies', () => {
  const g = buildGlossary([{ word: '改善', reading: 'かいぜん' }]);
  const segments = annotate('需要改善表达\n改善を続けました', g);
  assert.equal(segments.filter((s) => s.reading).length, 1);
  assert.equal(rubyHTML('<b>改善</b>します', g, esc), '&lt;b&gt;<ruby>改善<rt>かいぜん</rt></ruby>&lt;/b&gt;します');
  assert.equal(annotate('改善します', buildGlossary([{ word: '改善', reading: 'かいぜん', confirmed: false }]))[0].confirmed, false);
});

void test('resume furigana only appears in in-app previews, never on the public page or print copy', () => {
  const content = { name: 'Example', headline: '{開発|かいはつ}', location: '', links: [], readings: {}, summary: '{設計|せっけい}と{開発|かいはつ}', sections: [] };
  assert.doesNotMatch(resumeHTML(content, 'ja'), /<ruby>/);
  assert.doesNotMatch(resumeHTML(content, 'ja'), /\{開発\|/);
  const preview = resumeHTML(content, 'ja', true);
  assert.match(preview, /<ruby>開発<rt>かいはつ<\/rt><\/ruby>/);
  assert.match(preview, /<ruby>設計<rt>せっけい<\/rt><\/ruby>/);
  assert.doesNotMatch(resumeHTML(content, 'en', true), /<ruby>/);
});

void test('inline readings follow each occurrence and disappear without losing text', () => {
  const source = '{生物|せいぶつ}と{生物|なまもの}、{取り組み|とりくみ}';
  assert.equal(plainJapanese(source), '生物と生物、取り組み');
  assert.deepEqual(inlineReadings('{開発|かいはつ}')[0], { text: '開発', reading: 'かいはつ' });
  assert.match(inlineRubyHTML(source, esc, true), /<ruby>生物<rt>せいぶつ<\/rt><\/ruby>と<ruby>生物<rt>なまもの<\/rt><\/ruby>/);
  assert.equal(inlineRubyHTML(source, esc, false), '生物と生物、取り組み');
  assert.equal(inlineRubyHTML('{<script>|かな}', esc, true), '{&lt;script&gt;|かな}');
});

const bundled = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });

void test('glossary API: agents suggest, the user confirms, agents never overwrite or delete', async (t) => {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'] });
  t.after(() => mf.dispose());
  const send = (path, body) => mf.dispatchFetch(origin + '/api/career/' + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const { issued } = await authorizeAgent(mf, { scopes: ['career:read', 'agent:write'], resource: origin + '/api/career/mcp' });
  const call = async (name, args) => {
    const r = await json(await mf.dispatchFetch(origin + '/api/career/mcp', { method: 'POST', headers: { Authorization: 'Bearer ' + issued.access_token, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) }));
    const text = r.result.content[0].text;
    return { error: r.result.isError, data: r.result.isError ? text : JSON.parse(text) };
  };

  assert.equal((await send('readings', { entries: [{ word: '開発', reading: 'かいはつ' }] })).status, 200);
  const suggested = await call('career_save_readings', { entries: [{ word: '開発', reading: 'かいほつ' }, { word: '設計', reading: 'せっけい', note: '設計書' }] });
  assert.deepEqual(suggested.data.skipped, [{ word: '開発', reason: 'confirmed' }]);
  assert.deepEqual(suggested.data.saved.map((e) => [e.word, e.source, e.confirmed]), [['設計', 'agent', false]]);

  const read = await call('career_get_readings', {});
  assert.deepEqual(read.data.entries.map((e) => [e.word, e.reading, e.confirmed]), [['開発', 'かいはつ', true], ['設計', 'せっけい', false]]);
  assert.ok(read.data.builtinJapanese.length > 0);

  const kanaOnly = await call('career_save_readings', { entries: [{ word: 'テスト', reading: 'てすと' }] });
  assert.equal(kanaOnly.error, true);
  assert.match(kanaOnly.data, /只收录含汉字的词/);
  assert.equal((await send('readings', { entries: [{ word: '開発', reading: 'kaihatsu' }] })).status, 400);
  // Only the user removes words; the agent's attempt through the REST route is refused.
  const agentRemove = await mf.dispatchFetch(origin + '/api/career/readings', { method: 'POST', headers: { Authorization: 'Bearer ' + issued.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ remove: ['開発'] }) });
  assert.equal(agentRemove.status, 403);

  // Confirming an unchanged suggestion keeps its origin; the app state carries the glossary, the agent summary does not.
  assert.equal((await send('readings', { entries: [{ word: '設計', reading: 'せっけい' }], remove: ['開発'] })).status, 200);
  const state = await (await send('state')).json();
  assert.deepEqual(state.readings.map((e) => [e.word, e.source, e.confirmed]), [['設計', 'agent', true]]);
  assert.equal((await (await send('state?resumeView=summary')).json()).readings, undefined);
});
