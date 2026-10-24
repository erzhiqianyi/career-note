import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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

test('ordinary prose mentioning internal review is retained', () => {
  const source = '社内の内部確認フローを改善した。';
  const result = prepareMaterialPrint(source);
  assert.equal(result.printableContent, source);
  assert.deepEqual(result.internalNotes, []);
  assert.equal(result.hasPlaceholders, false);
});
