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

test('articles carry Japanese and English versions for the list, the public page and the sitemap', async t => {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'] });
  t.after(() => mf.dispose());
  const get = path => mf.dispatchFetch('http://local/api/career/' + path);
  const post = (path, body) => mf.dispatchFetch('http://local/api/career/' + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const { articles } = await (await get('articles')).json();
  const seed = articles.find(a => a.slug === 'read-job-posting');
  assert.equal(seed.translations.ja.title, '求人票を読み解く');
  assert.equal(seed.translations.en.title, 'Understand a job posting');

  const ja = await get('articles/view/read-job-posting?lang=ja');
  const jaHtml = await ja.text();
  assert.equal(ja.headers.get('content-language'), 'ja');
  assert.match(jaHtml, /<html lang="ja">/);
  assert.match(jaHtml, /<title>求人票を読み解く · 就職手帖<\/title>/);
  assert.match(jaHtml, /rel="canonical" href="http:\/\/local\/api\/career\/articles\/view\/read-job-posting\?lang=ja"/);
  assert.match(jaHtml, /hreflang="en"/);
  assert.match(jaHtml, /hreflang="x-default"/);
  const en = await (await get('articles/view/read-job-posting?lang=en')).text();
  assert.match(en, /<h1>Understand a job posting<\/h1>/);
  assert.match(en, /Copy prompt/);

  // A language the article lacks falls back to Chinese with a Chinese canonical address.
  const draft = { slug: 'zh-only-tip', revision: 0, status: 'published', category: 'start', title: '只有中文', summary: '摘要', steps: ['一步'], body: '', prompt: '', translations: {} };
  assert.equal((await post('articles/manage', draft)).status, 200);
  const fallback = await (await get('articles/view/zh-only-tip?lang=en')).text();
  assert.match(fallback, /<html lang="zh-CN">/);
  assert.match(fallback, /rel="canonical" href="http:\/\/local\/api\/career\/articles\/view\/zh-only-tip"/);
  assert.ok(!fallback.includes('hreflang="en"'));

  // A partial translation is rejected; a blank one is simply dropped.
  const partial = await post('articles/manage', { ...draft, slug: 'partial-tip', translations: { ja: { title: 'タイトルだけ', summary: '', steps: [], body: '', prompt: '' } } });
  assert.equal(partial.status, 400);
  const blank = await (await post('articles/manage', { ...draft, slug: 'blank-tip', translations: { ja: { title: ' ', summary: '', steps: [''], body: '', prompt: '' } } })).json();
  assert.deepEqual(blank.translations, {});
  const translated = await (await post('articles/manage', { ...draft, slug: 'translated-tip', translations: { en: { title: 'English only', summary: 'Summary', steps: ['One step', ' '], body: '', prompt: 'Ask' } } })).json();
  assert.deepEqual(translated.translations.en.steps, ['One step']);

  const sitemap = await (await get('articles/sitemap.xml')).text();
  assert.ok(sitemap.includes('<loc>http://local/api/career/articles/view/read-job-posting?lang=ja</loc>'));
  assert.ok(sitemap.includes('xhtml:link rel="alternate" hreflang="en"'));
  assert.ok(sitemap.includes('<loc>http://local/api/career/articles/view/translated-tip?lang=en</loc>'));
  assert.ok(!sitemap.includes('translated-tip?lang=ja'));
});

test('existing article tables gain translations without overwriting edited seed articles', async t => {
  const mf = new Miniflare({ modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'] });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('CAREER_DB');
  await db.prepare(`CREATE TABLE agent_articles (
    slug TEXT PRIMARY KEY, revision INTEGER NOT NULL, status TEXT NOT NULL,
    category TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
    steps TEXT NOT NULL, body TEXT NOT NULL, prompt TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  const insert = `INSERT INTO agent_articles (slug,revision,status,category,title,summary,steps,body,prompt,updated_at) VALUES (?,?,'published','prepare',?,'摘要','["一步"]','','','2026-10-27T00:00:00.000Z')`;
  await db.prepare(insert).bind('read-job-posting', 1, '读懂一条招聘信息').run();
  await db.prepare(insert).bind('evidence-based-resume', 3, '我改过的标题').run();
  const { articles } = await (await mf.dispatchFetch('http://local/api/career/articles')).json();
  assert.equal(articles.find(a => a.slug === 'read-job-posting').translations.ja.title, '求人票を読み解く');
  const edited = articles.find(a => a.slug === 'evidence-based-resume');
  assert.equal(edited.title, '我改过的标题');
  assert.deepEqual(edited.translations, {});
});
