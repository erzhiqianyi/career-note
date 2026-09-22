import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// lib files import each other without extensions, so bundle them like the app does.
const dir = await mkdtemp(join(tmpdir(), 'career-note-print-'));
const load = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
  const file = join(dir, entry.replace(/\//g, '-') + '.mjs');
  await writeFile(file, out.outputFiles[0].text);
  return import(pathToFileURL(file).href);
};
const { printableEntries, resumePrintHTML, resumePrintWarnings } = await load('lib/resume-print.ts');
const { resumeFromEntries, personalizedPrintHTML } = await load('lib/personalized-resume.ts');

const entry = (id, kind, data, extra = {}) => ({
  id, revision: 1, kind, language: 'ja', data, parentId: '', sourceNotes: '', verification: 'recorded', archived: false, updatedAt: '2026-09-21T00:00:00Z', ...extra,
});
const entries = [
  entry('b', 'basics', { name: 'テスト 太郎', reading: 'てすと たろう', headline: 'エンジニア', location: '東京都', summary: '要約。', website: 'https://example.com/', email: 'a@example.com' }),
  entry('e1', 'employment', { employer: '株式会社サンプル（正社員）', role: 'エンジニア', startDate: '2021-09', endDate: '2026-01', responsibilities: '- ETL基盤を設計\n- 回帰を自動化', technologies: 'Java' }),
  entry('a1', 'achievement', { title: '処理時間を短縮', result: '2時間→45分' }, { parentId: 'e1' }),
  entry('a2', 'achievement', { title: '未確認の実績', result: '推定値' }, { parentId: 'e1', verification: 'pending' }),
  entry('p1', 'project', { name: '個人アプリ', role: '個人開発', contribution: 'iOSアプリ', url: 'https://example.com/app' }),
  entry('s1', 'skill', { name: 'Java、Spring Boot', category: 'バックエンド', years: '9' }),
  entry('l1', 'language', { name: '日本語', level: 'N2', qualification: 'JLPT N2', date: '2024-12' }),
  entry('ed', 'education', { school: 'サンプル大学', major: '工学', degree: '学士', startDate: '2012-09', endDate: '2016-07' }),
  entry('pr', 'preferences', { role: 'バックエンド', conditions: '在留資格の変更が必要です。' }),
  entry('zh', 'basics', { name: '中文' }, { language: 'zh' }),
  entry('old', 'employment', { employer: '旧社', role: '旧', startDate: '2010-01' }, { archived: true }),
];

test('print templates use only current-language, unarchived, confirmed records', () => {
  const used = printableEntries(entries, 'ja');
  assert.ok(!used.some((e) => e.id === 'a2' || e.id === 'zh' || e.id === 'old'));
  const rirekisho = resumePrintHTML(used, { template: 'rirekisho', date: '2026/09/21', wishes: '在留資格の変更が必要です。' });
  assert.match(rirekisho, /<title>履歴書 — テスト 太郎<\/title>/);
  assert.match(rirekisho, /株式会社サンプル（正社員）　入社（エンジニア）/);
  assert.match(rirekisho, /<td class="y">2026<\/td><td class="m">1<\/td>/);
  assert.match(rirekisho, /JLPT N2　取得/);
  assert.match(rirekisho, /在留資格の変更が必要です。/);
  assert.doesNotMatch(rirekisho, /一身上の都合|扶養家族|配偶者|通勤時間/);
  const shokumu = resumePrintHTML(used, { template: 'shokumu', date: '2026/09/21', company: '株式会社応募先' });
  assert.match(shokumu, /株式会社応募先 御中/);
  assert.match(shokumu, /<li>ETL基盤を設計<\/li>/);
  assert.match(shokumu, /<b>処理時間を短縮<\/b>：2時間→45分/);
  assert.doesNotMatch(shokumu, /未確認の実績/);
  assert.match(shokumu, /<td class="num">9年<\/td>/);
  assert.match(shokumu, /個人プロジェクト・公開作品/);
  const withPending = resumePrintHTML(printableEntries(entries, 'ja', true), { template: 'shokumu', includePending: true });
  assert.match(withPending, /未確認の実績/);
});

test('personalized drafts are prefilled from records with source references', () => {
  const draft = resumeFromEntries(entries, 'ja', { company: '株式会社応募先', role: 'Java エンジニア' });
  assert.equal(draft.title, '株式会社応募先 · Java エンジニア');
  assert.equal(draft.content.name, 'テスト 太郎');
  assert.deepEqual(draft.content.links.map((l) => l.url), ['https://example.com/', 'mailto:a@example.com']);
  const work = draft.content.sections.find((s) => s.heading === '職務経歴');
  assert.equal(work.items[0].title, '株式会社サンプル（正社員）');
  assert.deepEqual(work.items[0].bullets, ['ETL基盤を設計', '回帰を自動化', '処理時間を短縮：2時間→45分']);
  assert.ok(draft.sourceRefs.some((r) => r.id === 'e1'));
  assert.ok(!draft.sourceRefs.some((r) => r.id === 'a2' || r.id === 'zh' || r.id === 'old'));
  assert.match(resumeFromEntries(entries, 'ja').title, /^個別履歴書 \d{4}-\d{2}-\d{2}$/);
});

 test('submission templates preserve unknown facts and exact selected draft content', () => {
  const sample = [entry('b', 'basics', {name: '<script>Example</script>', birthDate: '1990-02-03'}), entry('e', 'employment', {employer: 'Example', role: 'Engineer', startDate: '2020-01'})];
  const html = resumePrintHTML(sample, {template:'rirekisho', date:'2026-09-22', motivation:'Only this application'});
  assert.match(html, /1990年2月3日生/);
  assert.match(html, /Only this application/);
  assert.doesNotMatch(html, /特になし|一身上の都合|<script>/);
  assert.match(resumePrintHTML(sample,{template:'shokumu'}), /終了年月未入力/);
  assert.ok(resumePrintWarnings(sample,'rirekisho').includes('详细地址'));
  const d = resumeFromEntries(entries, 'ja'); d.content.summary = 'Selected revision only'; d.content.readings = {'要約':'ようやく'};
  const customized = personalizedPrintHTML(d.content,'ja','2026-09-22');
  assert.match(customized, /Selected revision only/); assert.match(customized, /<h1>職務経歴書<\/h1>/);
  assert.doesNotMatch(customized, /<ruby>/);
});
