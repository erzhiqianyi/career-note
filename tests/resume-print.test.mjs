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
const { printableEntries, resumePrintHTML, resumePrintMarkdown, resumePrintWarnings } = await load('lib/resume-print.ts');
const { applicationBodyIssues } = await load('lib/material-print-content.ts');
const { applicationDocDefaults, exportSnapshot } = await load('lib/application-export.ts');
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
  assert.match(rirekisho, /株式会社サンプル　入社/);
  assert.match(rirekisho, /同社　退職/);
  assert.match(rirekisho, /<td class="y">2026<\/td><td class="m">1<\/td>/);
  assert.match(rirekisho, /日本語能力試験（JLPT）N2　合格/);
  assert.match(rirekisho, /在留資格の変更が必要です。/);
  assert.doesNotMatch(rirekisho, /一身上の都合|扶養家族|配偶者|通勤時間/);
  const shokumu = resumePrintHTML(used, { template: 'shokumu', date: '2026/09/21', company: '株式会社応募先' });
  assert.match(shokumu, /株式会社応募先 御中/);
  assert.match(shokumu, /<p>ETL基盤を設計<\/p>/);
  assert.doesNotMatch(shokumu, /処理時間を短縮/);
  assert.doesNotMatch(shokumu, /未確認の実績/);
  assert.match(shokumu, /<td class="yrs">9年<\/td>/);
  assert.match(shokumu, /■個人開発/);
  const noDuties = entries.map((e) => (e.id === 'e1' ? { ...e, data: { ...e.data, responsibilities: '' } } : e));
  assert.match(resumePrintHTML(printableEntries(noDuties, 'ja'), { template: 'shokumu' }), /処理時間を短縮/);
  assert.match(resumePrintHTML(printableEntries(noDuties, 'ja', true), { template: 'shokumu', includePending: true }), /未確認の実績/);
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

test('technical skills print as a category / type / years / level table with languages last', () => {
  const tech = (id, name, category, years, skillLevel) => entry(id, 'skill', { name, category, years, skillLevel, skillType: 'tech' });
  const used = [
    ...entries.filter((e) => e.kind !== 'language'),
    tech('t1', 'Swift', '言語', '約半年', '個人開発で実装'),
    tech('t2', 'Git', 'ツール・その他', '9', '通常業務で対応可能'),
    tech('t3', 'Java', '言語', '9', '設計・技術指導が可能'),
    tech('t4', 'Scala', '言語', '4', '設計・実装が可能'),
    entry('l1', 'language', { name: '日本語', experience: 'JLPT N2', skillLevel: '通常業務で対応可能' }),
  ];
  const html = resumePrintHTML(printableEntries(used, 'ja'), { template: 'shokumu' });
  assert.match(html, /■テクニカルスキル/);
  assert.match(html, /<th rowspan="3">言語<\/th><td>Java<\/td><td class="yrs">9年<\/td><td>設計・技術指導が可能<\/td>/);
  assert.ok(html.indexOf('>Scala<') < html.indexOf('>Swift<'));
  assert.match(html, /<td>Swift<\/td><td class="yrs">約半年<\/td>/);
  assert.match(html, /■資格・語学/);
  // Area records are only a fallback for accounts without per-technology records.
  assert.doesNotMatch(html, /バックエンド/);
});

test('exported documents follow the application layout and pass the saved-body checks', () => {
  const used = [
    entry('b', 'basics', { name: 'テスト 花子', reading: 'てすと（通称：Hana）', birthDate: '1990-03-05', gender: '男', postalCode: '100-0001', address: '東京都', addressReading: 'とうきょうと', phone: '080', email: 'base@example.com', summary: '要約一。\n\n要約二。', github: 'https://github.com/example' }),
    entry('e', 'employment', { employer: '株式会社例（正社員）', role: 'エンジニア', client: 'A案件', location: '東京', startDate: '2020-01', endDate: '2026-01', historyNote: 'エンジニアとして開発', technologies: 'Java', responsibilities: '- 担当：設計、実装。\n- 組織：5名。\n- 性能改善：45分に短縮しました。' }),
    entry('ed', 'education', { school: '例大学', major: '工学', degree: '学士', startDate: '2012-09', endDate: '2016-07' }),
    entry('ed2', 'education', { school: '日本語学校', major: '日本語', startDate: '2026-04' }),
    entry('l', 'language', { name: '{英語|えいご}', experience: '4年間の業務使用' }),
    entry('p', 'project', { name: '掲載アプリ', brief: '短い紹介。', contribution: '長い説明' }),
    entry('q', 'project', { name: '非掲載', contribution: '載せない' }),
    entry('pr', 'preferences', { role: 'x', selfPr: '・強み\n本文です。' }),
  ];
  const options = { date: '2026-11-04', email: 'apply@example.com', motivation: '志望です。', wishes: '希望年収：550万円。', photo: 'data:image/png;base64,AAAA' };
  const rirekisho = resumePrintHTML(used, { ...options, template: 'rirekisho' });
  assert.match(rirekisho, /てすと<\/td>/);
  assert.doesNotMatch(rirekisho, /通称/);
  assert.match(rirekisho, /1990年3月5日生（満36歳）　性別：男/);
  assert.match(rirekisho, /apply@example\.com/);
  assert.doesNotMatch(rirekisho, /base@example/);
  assert.match(rirekisho, /例大学　工学専攻　卒業（学士）/);
  assert.match(rirekisho, /日本語学校　入学（在学中）/);
  assert.match(rirekisho, /エンジニアとして開発/);
  assert.match(rirekisho, /英語：4年間の業務使用/);
  assert.match(rirekisho, /<img alt="証明写真" src="data:image\/png/);
  const shokumu = resumePrintHTML(used, { ...options, template: 'shokumu' });
  assert.match(shokumu, /勤務先：株式会社例</);
  assert.match(shokumu, /雇用形態：正社員 ／ 職種：エンジニア ／ 勤務地：東京/);
  assert.match(shokumu, /【担当】設計、実装。/);
  assert.match(shokumu, /【担当案件】A案件/);
  assert.match(shokumu, /<h3>・性能改善<\/h3><p>45分に短縮しました。<\/p>/);
  assert.match(shokumu, /短い紹介。/);
  assert.doesNotMatch(shokumu, /非掲載|長い説明/);
  assert.match(shokumu, /<h3>・強み<\/h3><p>本文です。<\/p>/);
  for (const [template, kind] of [['rirekisho', '履歴書'], ['shokumu', '職務経歴書']]) {
    const body = resumePrintMarkdown(used, { ...options, template });
    assert.ok(body.startsWith('# ' + kind));
    assert.deepEqual(applicationBodyIssues(body, kind), []);
  }
});

test('export reuses saved company text and adds a version only when the body changes', () => {
  const job = { id: 'j', company: '例社' };
  const saved = (id, kind, content, createdAt) => ({ id, jobId: 'j', kind, content, createdAt });
  const materials = [
    saved('old', '履歴書', '# 履歴書\n\n## 本人希望記入欄\n古い', '2026-11-01'),
    saved('new', '履歴書', '# 履歴書\n\nE-mail：x@example.com\n\n## 志望動機\n{動機|どうき}です\n\n## 本人希望記入欄\n希望\n二行目', '2026-11-04'),
  ];
  assert.deepEqual(applicationDocDefaults(job, materials, 'base@example.com'), { motivation: '動機です', wishes: '希望\n二行目', email: 'x@example.com' });
  assert.equal(applicationDocDefaults(job, [], 'base@example.com').email, 'base@example.com');
  const own = { motivation: 'a', wishes: 'b', email: 'c' };
  assert.deepEqual(applicationDocDefaults({ ...job, applicationDoc: own }, materials), own);
  assert.equal(exportSnapshot(job, materials, 'rirekisho', materials[1].content, '2026-11-04', ['a r1']), null);
  const snapshot = exportSnapshot(job, materials, 'rirekisho', '# 履歴書\n\n新', '2026-11-05', ['a r1']);
  assert.equal(snapshot.kind, '履歴書');
  assert.match(snapshot.sourceNotes, /a r1/);
});
