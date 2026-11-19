import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const result = await build({
  entryPoints: ['lib/job-platforms.ts'],
  bundle: true,
  write: false,
  format: 'cjs',
  platform: 'node',
  target: 'es2022',
});
const compiled = { exports: {} };
runInNewContext(result.outputFiles[0].text, { module: compiled, exports: compiled.exports, crypto, URL });
const { builtinPlatforms, postingSource, postingMedia, registrableDomain, unlistedPostingSites, validatePlatform } = compiled.exports;

void test('platform keeps the current resume version and its upload note', () => {
  const base = { ...builtinPlatforms[0] };
  const saved = validatePlatform({ ...base, currentResumeId: ' type-general-v2 ', currentResumeNote: ' upload.pdf ' }, base);
  assert.equal(saved.currentResumeId, 'type-general-v2');
  assert.equal(saved.currentResumeNote, 'upload.pdf');
  // Older records have neither field; they stay unset.
  assert.equal(validatePlatform(base, base).currentResumeId, '');
  assert.throws(() => validatePlatform({ ...base, currentResumeId: '../other' }, base), /请选择有效的简历版本/);
  assert.throws(() => validatePlatform({ ...base, currentResumeNote: 'x'.repeat(501) }, base), /简历备注不能超过 500 字/);
});

void test('platform account status keeps registration flag and login email', () => {
  const base = { ...builtinPlatforms[0] };
  const saved = validatePlatform(
    { ...base, registered: true, accountEmail: ' me@example.com ' },
    base,
  );
  assert.equal(saved.registered, true);
  assert.equal(saved.accountEmail, 'me@example.com');
  assert.equal(saved.revision, 1);

  // Records saved before the feature existed have no `registered` key; treat as not registered.
  const legacy = validatePlatform({ ...base, registered: undefined, accountEmail: undefined }, base);
  assert.equal(legacy.registered, false);
  assert.equal(legacy.accountEmail, '');

  assert.throws(
    () => validatePlatform({ ...base, accountEmail: 'not-an-email' }, base),
    /登录邮箱格式不正确/,
  );
});

const plain = (value) => JSON.parse(JSON.stringify(value));
void test('posting media comes from the posting URL and is checked against the platform list', () => {
  const platforms = [
    { name: 'Green', url: 'https://www.green-japan.com/' },
    { name: 'type', url: 'https://type.jp/' },
    { name: 'type転職エージェント', url: 'https://type.career-agent.jp/' },
    { name: 'レバテックキャリア', url: 'https://career.levtech.jp/' },
    { name: 'Old', url: 'https://old.example/', deleted: true },
  ];
  // The URL wins over a hand-typed platform name.
  assert.deepEqual(plain(postingMedia({ url: 'https://www.green-japan.com/company/1', sourcePlatform: 'LinkedIn' }, platforms)), { name: 'Green', listed: true, site: 'green-japan.com' });
  assert.equal(postingSource({ url: 'https://jobs.green-japan.com/company/1' }, platforms), 'Green');
  // Another subdomain of a listed platform's registered domain still belongs to it; an exact host wins first.
  assert.equal(postingSource({ url: 'https://mypage.levtech.jp/jobs/1' }, platforms), 'レバテックキャリア');
  assert.equal(postingSource({ url: 'https://type.career-agent.jp/job/1' }, platforms), 'type転職エージェント');
  assert.equal(postingSource({ url: 'https://type.jp/job-1/2' }, platforms), 'type');
  // Sites outside the list are named but flagged; deleted platforms do not count.
  assert.deepEqual(plain(postingMedia({ url: 'https://www.hellowork.mhlw.go.jp/x', sourcePlatform: 'ハローワーク' }, platforms)), { name: 'ハローワーク', listed: false, site: 'hellowork.mhlw.go.jp' });
  assert.deepEqual(plain(postingMedia({ url: 'https://www.acme.example/careers' }, platforms)), { name: 'acme.example', listed: false, site: 'acme.example' });
  assert.equal(postingMedia({ url: 'https://old.example/1' }, platforms).listed, false);
  // Without a URL only the recorded name is known.
  assert.deepEqual(plain(postingMedia({ url: '', sourcePlatform: 'Green' }, platforms)), { name: 'Green', listed: true, site: '' });
  assert.equal(postingMedia({ url: 'not a url' }, platforms), null);
  assert.equal(registrableDomain('gaga-ltd.co.jp'), 'gaga-ltd.co.jp');
  assert.equal(registrableDomain('www.hellowork.mhlw.go.jp'), 'mhlw.go.jp');
  assert.deepEqual(plain(unlistedPostingSites([
    { url: 'https://www.hellowork.mhlw.go.jp/a', sourcePlatform: 'ハローワーク' },
    { url: 'https://www.hellowork.mhlw.go.jp/b' },
    { url: 'https://mypage.levtech.jp/1' },
    { url: 'https://acme.example/1' },
  ], platforms)), [
    { site: 'mhlw.go.jp', name: 'ハローワーク', count: 2 },
    { site: 'acme.example', name: 'acme.example', count: 1 },
  ]);
});
