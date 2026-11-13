import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const result = await build({
  entryPoints: ['lib/application-reason.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
});
const compiled = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module: compiled, exports: compiled.exports });
const { currentApplicationReason } = compiled.exports;

const material = (over) => ({ jobId: 'a', kind: '志望動機', createdAt: '2026-09-01T00:00:00Z', ...over });

void test('the list copies the newest current 志望動機 short reason, without study readings', () => {
  const materials = [
    material({ applicationReason: '旧い理由です。' }),
    material({ createdAt: '2026-09-03T00:00:00Z', applicationReason: '{御社|おんしゃ}の事業に{貢献|こうけん}したいです。' }),
    material({ createdAt: '2026-09-05T00:00:00Z', applicationReason: '別の会社の理由です。', jobId: 'b' }),
    material({ createdAt: '2026-09-06T00:00:00Z', applicationReason: '企業研究のメモ', kind: '企業研究' }),
  ];
  assert.equal(currentApplicationReason(materials, 'a'), '御社の事業に貢献したいです。');
  assert.equal(currentApplicationReason(materials, 'b'), '別の会社の理由です。');
});

void test('archived versions and versions without a short reason are never offered', () => {
  const materials = [
    material({ applicationReason: '現行の理由です。' }),
    material({ createdAt: '2026-09-04T00:00:00Z', applicationReason: '取り下げた理由です。', archivedAt: '2026-09-05T00:00:00Z' }),
    material({ createdAt: '2026-09-06T00:00:00Z', applicationReason: '  ' }),
  ];
  assert.equal(currentApplicationReason(materials, 'a'), '現行の理由です。');
  assert.equal(currentApplicationReason([material({})], 'a'), '');
  assert.equal(currentApplicationReason(materials, 'missing'), '');
});
