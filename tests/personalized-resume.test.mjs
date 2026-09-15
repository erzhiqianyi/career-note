import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const b = await build({
  entryPoints: ['worker/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
test('personalized drafts use CAS; publication snapshots exclude private data and can be revoked', async (t) => {
  const mf = new Miniflare({
    modules: true,
    script: b.outputFiles[0].text,
    compatibilityDate: '2026-05-22',
    d1Databases: ['CAREER_DB'],
  });
  t.after(() => mf.dispose());
  const send = (p, body) =>
    mf.dispatchFetch('http://local/api/career/' + p, {
      method: body ? 'POST' : 'GET',
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });
  const ok = async (p, body) => {
    const r = await send(p, body);
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    return d;
  };
  const d = {
    id: 'fixture',
    revision: 0,
    title: 'PRIVATE TITLE',
    targetRole: 'PRIVATE ROLE',
    targetCompany: 'PRIVATE COMPANY',
    language: 'en',
    content: {
      name: 'Example <script>alert(1)</script>',
      headline: 'Engineer',
      summary: 'First version',
      location: '',
      links: [],
      sections: [],
    },
    sourceRefs: [],
    privateNotes: 'PRIVATE NOTE',
  };
  assert.equal(
    (
      await send('personalized-resumes', {
        ...d,
        sourceRefs: [{ id: 'missing', revision: 1 }],
      })
    ).status,
    400,
  );
  const first = await ok('personalized-resumes', d);
  assert.equal(first.revision, 1);
  assert.equal((await send('personalized-resumes', d)).status, 409);
  const p = await ok('resume-publications', {
    draftId: d.id,
    draftRevision: 1,
    mode: 'unlisted',
    expiresAt: '',
  });
  const { updatedAt, ...edit } = first;
  await ok('personalized-resumes', {
    ...edit,
    content: { ...d.content, summary: 'Second version' },
  });
  assert.equal(
    (
      await send('resume-publications', {
        draftId: d.id,
        draftRevision: 1,
        mode: 'public',
        expiresAt: '',
      })
    ).status,
    409,
  );
  let page = await mf.dispatchFetch('http://local' + p.path);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  let html = await page.text();
  assert.ok(html.includes('First version'));
  assert.ok(!html.includes('Second version'));
  assert.ok(!html.includes('PRIVATE'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.equal(
    (
      await send('resume-publications', {
        draftId: d.id,
        draftRevision: 2,
        mode: 'public',
        expiresAt: '2000-01-01',
      })
    ).status,
    400,
  );
  await ok('resume-publications/revoke', { id: p.id });
  assert.equal((await mf.dispatchFetch('http://local' + p.path)).status, 404);
  const unsafe = {
    ...d,
    id: 'unsafe',
    content: {
      ...d.content,
      links: [{ label: 'Bad', url: 'javascript:alert(1)' }],
    },
  };
  assert.equal((await send('personalized-resumes', unsafe)).status, 400);
  const db = await mf.getD1Database('CAREER_DB');
  const expiring = await ok('resume-publications', {draftId:d.id,draftRevision:2,mode:'public',expiresAt:''});
  const indexed = await mf.dispatchFetch('http://local'+expiring.path);
  assert.equal(indexed.headers.get('x-robots-tag'),'index, follow');
  await db.prepare('UPDATE resume_publications SET body=? WHERE id=?').bind(JSON.stringify({...expiring,expiresAt:'2000-01-01T00:00:00.000Z'}),expiring.id).run();
  assert.equal((await mf.dispatchFetch('http://local'+expiring.path)).status,404);

  assert.equal(
    (
      await db
        .prepare('SELECT count(*) n FROM personalized_resume_history')
        .first()
    ).n,
    2,
  );
});
