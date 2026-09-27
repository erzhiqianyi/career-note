import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// lib files import each other without extensions, so bundle them like the app does.
const dir = await mkdtemp(join(tmpdir(), 'career-note-html-'));
const load = async (entry) => {
  const out = await build({ entryPoints: [entry], bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022' });
  const file = join(dir, entry.replace(/\//g, '-') + '.mjs');
  await writeFile(file, out.outputFiles[0].text);
  return import(pathToFileURL(file).href);
};
const { resumeHTML } = await load('lib/personalized-resume.ts');

test('resume rendering repairs imported paragraph escapes without exposing markup', () => {
  const content = {
    name: 'Example', headline: 'Engineer', location: '', links: [], readings: {},
    summary: 'First paragraph\\n\\nSecond <script>alert(1)</script>',
    sections: [{ heading: 'Skills', items: [
      { title: 'Java', subtitle: 'Backend', period: '', bullets: [] },
      { title: 'Project', subtitle: '', period: '2024', bullets: [] },
    ] }],
  };
  const html = resumeHTML(content, 'en');
  assert.ok(html.includes('First paragraph\n\nSecond &lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('<small>Backend</small>'));
  assert.ok(html.includes('<small>2024</small>'));
  assert.ok(!html.includes('<ul></ul>'));
});
