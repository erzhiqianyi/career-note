import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const bundled = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });

test('articles live in D1, publish as crawlable HTML, and drafts stay private', async t => {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'] });
  t.after(() => mf.dispose());
  const get = path => mf.dispatchFetch('http://local/api/career/' + path);
  const post = (path, body) => mf.dispatchFetch('http://local/api/career/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const initial = await get('articles');
  assert.equal(initial.status, 200);
  assert.equal((await initial.json()).articles.length, 6);
  const list = await get('articles/manage');
  assert.equal(list.status, 200);
  const first = (await list.json()).articles.find(a => a.slug === 'work-email-to-experience');
  assert.equal(first.revision, 1);
  const savedResponse = await post('articles/manage', { ...first, title: '更新后的文章', body: '<script>alert(1)</script>\n\n第二段', status: 'published' });
  assert.equal(savedResponse.status, 200, await savedResponse.clone().text());
  const saved = await savedResponse.json();
  assert.equal(saved.revision, 2);
  const htmlResponse = await get('articles/view/work-email-to-experience');
  const html = await htmlResponse.text();
  assert.equal(htmlResponse.status, 200);
  assert.match(html, /<title>更新后的文章 · 就职手帖<\/title>/);
  assert.match(html, /rel="canonical"/);
  assert.match(html, /application\/ld\+json/);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.equal((await post('articles/manage', { ...first, title: 'stale' })).status, 409);
  assert.equal((await post('articles/manage', { ...saved, status: 'draft' })).status, 200);
  assert.equal((await get('articles/view/work-email-to-experience')).status, 404);
  const sitemap = await (await get('articles/sitemap.xml')).text();
  assert.ok(!sitemap.includes('work-email-to-experience'));
  assert.ok(sitemap.includes('read-job-posting'));
});

test('public articles stay readable while management requires a signed-in admin', async t => {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'], bindings: { CAREER_AUTH_MODE: 'strict', FIREBASE_PROJECT_ID: 'test-project', CAREER_WEB_ORIGIN: 'https://career.example.com', CAREER_PUBLIC_ORIGIN: 'https://career-api.example.com' } });
  t.after(() => mf.dispose());
  const get = path => mf.dispatchFetch('https://career-api.example.com/api/career/' + path);
  assert.equal((await get('articles')).status, 200);
  assert.equal((await get('articles/view/read-job-posting')).status, 200);
  assert.equal((await get('articles/manage')).status, 401);
  const write = await mf.dispatchFetch('https://career-api.example.com/api/career/articles/manage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(write.status, 401);
});
