import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('Workers AI is bound only in the deployment config; local startup remains credential free', () => {
  const root = mkdtempSync(join(tmpdir(), 'career-deploy-config-'));
  try {
    const output = join(root, 'wrangler.toml');
    const generic = readFileSync('wrangler.toml', 'utf8');
    assert.doesNotMatch(generic, /^\[ai\]/m);
    execFileSync(process.execPath, ['scripts/render-wrangler-config.mjs', output], { env: { ...process.env,
      CAREER_API_HOST: 'career-api.example.com', CAREER_D1_ID: '00000000-0000-4000-8000-000000000001', CAREER_D1_NAME: 'synthetic-database' } });
    const rendered = readFileSync(output, 'utf8');
    assert.match(rendered, /^\[ai\]\nbinding = "AI"$/m);
    assert.match(rendered, /pattern = "career-api.example.com"/);
    assert.match(rendered, /database_name = "synthetic-database"/);
    assert.equal(readFileSync('wrangler.toml', 'utf8'), generic);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
