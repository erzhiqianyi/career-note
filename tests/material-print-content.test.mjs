import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const dir = await mkdtemp(join(tmpdir(), 'career-note-material-print-'));
const bundled = await build({ entryPoints: ['lib/material-print-content.ts'], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
const path = join(dir, 'material-print-content.mjs');
await writeFile(path, bundled.outputFiles[0].text);
const { prepareMaterialPrint } = await import(pathToFileURL(path).href);

test('internal review notes stay out of the print body and remain available for the warning', () => {
  const source = '# 履歴書\n\n氏名：例\n生年月日：＿＿＿＿\n\n内部核对，不随正式履歴書提交：出生日期、电话、详细地址仍须本人补齐。';
  const result = prepareMaterialPrint(source);
  assert.match(result.printableContent, /氏名：例/);
  assert.doesNotMatch(result.printableContent, /内部核对|电话/);
  assert.match(result.internalNotes[0], /出生日期、电话/);
  assert.equal(result.hasPlaceholders, true);
});

test('internal note sections end at the next peer heading', () => {
  const source = '# 職務経歴書\n\n## 内部確認\n\n応募前に確認。\n\n## スキル\n\nJava開発。';
  const result = prepareMaterialPrint(source);
  assert.equal(result.internalNotes.length, 2);
  assert.doesNotMatch(result.printableContent, /内部確認|応募前に確認/);
  assert.match(result.printableContent, /## スキル\n\nJava開発/);
});

test('type fair internal confirmation never enters the application copy', () => {
  const source = `# 履歴書\n\n氏名：例\n\n## 内部確認\n\n- 10/24 type エンジニア転職フェア用。会場で正式名称を確認する。\n- 写真はWeb版に含まれないため、提出時は印刷版PDFを使用する。\n- 日本語水準・外国籍採用・在留資格支援・給与は未確認。`;
  const result = prepareMaterialPrint(source);
  assert.equal(result.printableContent, '# 履歴書\n\n氏名：例');
  assert.equal(result.internalNotes.length, 2);
  assert.doesNotMatch(result.printableContent, /内部確認|フェア用|印刷版PDF|未確認/);
});

test('drafting title, metadata, inline checks and memo sections are left out of the print copy', () => {
  const source = [
    '# 履歴書草稿（type応募用・未提出）v2',
    '応募先：株式会社例\n応募職種：ITコンサル（type求人 No.1）\n提出期限の目安：2026年11月2日',
    '| 項目 | 内容 |\n|---|---|\n| メール | a@example.com（typeアカウント。送信前に要確認） |\n| 学歴 | 2026年4月 日本語学校 入学（在学中） |\n| 職歴 | 2026年1月 一身上の都合により退職【本人確認：退職理由の表現】 |',
    '## 本人希望記入欄（案）',
    '勤務地は大阪を希望します。',
    '## 記入メモ（中文）',
    'v2 变更：希望年收填 600 万円。',
    '参照：该岗位年収 400～800 万。',
  ].join('\n\n');
  const result = prepareMaterialPrint(source);
  assert.match(result.printableContent, /^# 履歴書\n/);
  assert.match(result.printableContent, /\| メール \| a@example\.com \|/);
  assert.match(result.printableContent, /入学（在学中）/);
  assert.match(result.printableContent, /一身上の都合により退職 \|/);
  assert.match(result.printableContent, /## 本人希望記入欄\n\n勤務地は大阪/);
  assert.doesNotMatch(result.printableContent, /草稿|未提出|v2|応募先|応募職種|提出期限|要確認|本人確認|（案）|記入メモ|变更|参照/);
  assert.ok(result.internalNotes.length >= 7);
});

test('the printed title always comes from the document kind', () => {
  assert.equal(prepareMaterialPrint('氏名：例', '履歴書').printableContent, '# 履歴書\n\n氏名：例');
  const renamed = prepareMaterialPrint('# 応募書類 v3\n\n2026年10月28日現在', '職務経歴書');
  assert.equal(renamed.printableContent, '# 職務経歴書\n\n2026年10月28日現在');
  assert.deepEqual(renamed.internalNotes, ['応募書類 v3']);
  assert.deepEqual(prepareMaterialPrint('# 履歴書\n\n氏名：例', '履歴書').internalNotes, []);
});

test('ordinary prose mentioning internal review is retained', () => {
  const source = '社内の内部確認フローを改善した。';
  const result = prepareMaterialPrint(source);
  assert.equal(result.printableContent, source);
  assert.deepEqual(result.internalNotes, []);
  assert.equal(result.hasPlaceholders, false);
});

test('blank lines inside a saved Markdown table still render as a table', () => {
  const source = '# 履歴書\n\n| 項目 | 内容 |\n\n|---|---|\n\n| 氏名 | 例 |\n\n| 住所 | 東京 |\n\n## 職歴\n\n| prose with a pipe | stays prose';
  const { printableContent } = prepareMaterialPrint(source);
  const html = renderToStaticMarkup(createElement(ReactMarkdown, { remarkPlugins: [remarkGfm], children: printableContent }));
  assert.match(html, /<table>/);
  assert.match(html, /<th>項目<\/th>/);
  assert.match(html, /<td>東京<\/td>/);
  assert.match(html, /<h2>職歴<\/h2>/);
  assert.match(printableContent, /\| prose with a pipe \| stays prose/);
});
