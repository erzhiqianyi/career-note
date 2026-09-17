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
const { builtinPlatforms, validatePlatform } = compiled.exports;

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
