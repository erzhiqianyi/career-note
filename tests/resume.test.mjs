import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';
const bundled = await build({
  entryPoints: ['worker/index.ts'],
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
});
test('structured resume records persist, reject conflicts, preserve documents and revision history', async (t) => {
  const mf = new Miniflare({
    workers: [
      {
        name: 'resume',
        modules: true,
        script: bundled.outputFiles[0].text,
        compatibilityDate: '2026-05-22',
        d1Databases: ['CAREER_DB'],
      },
    ],
  });
  t.after(() => mf.dispose());
  const send = (path, body) =>
    mf.dispatchFetch('http://local/api/career/' + path, {
      method: body ? 'POST' : 'GET',
      ...(body
        ? {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    });
  const ok = async (path, body) => {
    const r = await send(path, body);
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    return d;
  };
  const initial = await ok('state');
  await ok('profile', {
    ...initial.profile,
    experience: '# Original source',
    summary: 'Preserve summary',
  });
  await ok('resume', {
    id: 'basics',
    kind: 'basics',
    revision: 0,
    data: { name: 'Fixture' },
  });
  assert.equal(
    (
      await send('resume', {
        id: 'duplicate-basics',
        kind: 'basics',
        revision: 0,
        data: { name: 'Duplicate' },
      })
    ).status,
    409,
  );
  // 同一分类按语言各一条：日语（默认）已存在，中文可以新增，再来一条中文则冲突。
  const zhBasics = await ok('resume', {
    id: 'basics-zh',
    kind: 'basics',
    language: 'zh',
    revision: 0,
    data: { name: '中文资料' },
  });
  assert.equal(zhBasics.language, 'zh');
  assert.equal(
    (
      await send('resume', {
        id: 'basics-zh-duplicate',
        kind: 'basics',
        language: 'zh',
        revision: 0,
        data: { name: '重复' },
      })
    ).status,
    409,
  );
  assert.equal(
    (await ok('state')).resume.find((e) => e.id === 'basics').language,
    'ja',
  );
  const employment = {
    id: 'job-one',
    kind: 'employment',
    revision: 0,
    data: {
      employer: 'Fixture employer',
      role: 'Engineer',
      startDate: '2020-01',
      endDate: '2022-12',
    },
    verification: 'recorded',
    sourceNotes: 'Disposable fixture',
  };
  const created = await ok('resume', employment);
  assert.equal(created.revision, 1);
  assert.equal((await ok('state')).profile.experience, '# Original source');
  assert.equal((await ok('state')).profile.revision, 4);
  const db = await mf.getD1Database('CAREER_DB');
  assert.equal(
    (await db.prepare('SELECT count(*) AS n FROM resume_entries').first()).n,
    3,
  );
  assert.equal(
    (
      await send('resume', {
        ...employment,
        data: { ...employment.data, status: '已投递' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send('resume', {
        ...employment,
        id: 'bad-date',
        data: { ...employment.data, endDate: '2019-01' },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send('resume', {
        id: 'bad-link',
        kind: 'project',
        revision: 0,
        data: { name: 'Example', url: 'javascript:alert(1)' },
      })
    ).status,
    400,
  );
  const { updatedAt, ...base } = created;
  const requests = await Promise.all(
    ['A', 'B'].map((role) =>
      send('resume', { ...base, data: { ...base.data, role } }),
    ),
  );
  assert.deepEqual(requests.map((r) => r.status).sort(), [200, 409]);
  let current = (await ok('resume')).entries.find((e) => e.id === 'job-one');
  assert.equal(current.revision, 2);
  assert.equal((await ok('state')).profile.revision, 5);
  assert.equal(
    (
      await send('resume', {
        id: 'missing-parent',
        kind: 'achievement',
        revision: 0,
        parentId: 'unknown',
        data: { title: 'Missing' },
      })
    ).status,
    400,
  );
  const achievement = await ok('resume', {
    id: 'result',
    kind: 'achievement',
    revision: 0,
    parentId: 'job-one',
    data: { title: 'Improvement', result: 'Fixture outcome' },
  });
  assert.equal(achievement.parentId, 'job-one');
  const preferenceA = await ok('resume', {
    id: 'pref-backend', kind: 'preferences', revision: 0,
    data: { role: 'バックエンドエンジニア', rationale: 'Java・Spring・業務システムの実務経験', locations: '東京都' },
    sourceNotes: '職務経歴 job-one、本人入力', verification: 'pending',
  });
  const preferenceB = await ok('resume', {
    id: 'pref-data', kind: 'preferences', revision: 0,
    data: { role: 'データエンジニア', rationale: 'Scala・Spark・ETL基盤の実務経験', locations: '東京都' },
    sourceNotes: '職務経歴 job-one、本人入力', verification: 'pending',
  });
  assert.equal(preferenceA.data.role, 'バックエンドエンジニア');
  assert.equal(preferenceB.data.role, 'データエンジニア');
  const saveRecord = async (entry, overrides) => {
    const { updatedAt, ...payload } = entry;
    return ok('resume', { ...payload, ...overrides });
  };
  const archived = await saveRecord(current, { archived: true });
  assert.equal(archived.archived, true);
  assert.equal((await ok('resume')).entries.length, 6);
  current = await saveRecord(archived, { archived: false });
  assert.equal(current.archived, false);
  const history = await ok('resume/history?id=job-one');
  assert.deepEqual(
    history.entries.map((e) => e.revision),
    [4, 3, 2, 1],
  );
  assert.equal(history.entries.at(-1).data.role, 'Engineer');
  const doc = await ok('resume', {
    id: 'original',
    kind: 'document',
    revision: 0,
    data: { title: 'Source', version: 'v1', content: '# Immutable source' },
  });
  const { updatedAt: ignored, ...docInput } = doc;
  assert.equal(
    (
      await send('resume', {
        ...docInput,
        data: { ...doc.data, content: 'Overwrite' },
      })
    ).status,
    400,
  );
  await saveRecord(doc, { archived: true });
  assert.equal(
    (await ok('resume/history?id=original')).entries.at(-1).data.content,
    '# Immutable source',
  );
  const summary = await ok('resume?view=summary');
  const listedDoc = summary.entries.find(e => e.id === 'original');
  assert.equal(listedDoc.data.version, 'v1');
  assert.equal(listedDoc.revision, 2);
  assert.equal(Object.hasOwn(listedDoc.data, 'content'), false);
  assert.equal(summary.entries.find(e => e.id === 'basics').data.name, 'Fixture');
  assert.equal(JSON.stringify(await ok('state?resumeView=summary')).includes('# Immutable source'), false);
  const versions = await ok('resume/history?id=original&view=summary');
  assert.deepEqual(versions.entries.map(e => e.revision), [2, 1]);
  assert.ok(versions.entries.every(e => !Object.hasOwn(e, 'data')));
  const original = (await ok('resume/version?id=original&revision=1')).entry;
  assert.equal(original.data.content, '# Immutable source');
  assert.equal(original.archived, false);
  assert.equal((await ok('resume/version?id=original&revision=2')).entry.archived, true);
  assert.equal((await ok('resume/version?id=job-one&revision=1')).entry.data.role, 'Engineer');
  assert.equal((await send('resume/version?id=original&revision=99')).status, 404);
  assert.equal((await send('resume/version?id=unknown&revision=1')).status, 404);
  for (const revision of ['', '0', '-1', '1.5', 'abc']) {
    assert.equal((await send('resume/version?id=original&revision=' + revision)).status, 400);
  }
  assert.equal((await send('resume/version?revision=1')).status, 400);
  assert.equal((await ok('state')).profile.summary, 'Preserve summary');

  const overview = await ok('resume/overview?language=ja&archived=true');
  assert.equal(overview.filter.language, 'ja');
  assert.equal(overview.counts.document, 1);
  const page = await ok('resume/list?language=ja&pageSize=2');
  assert.equal(page.representation, 'metadata-preview');
  assert.equal(page.entries.length, 2);
  assert.ok(page.entries.every((entry) => !Object.hasOwn(entry.data, 'content')));
  const next = page.cursor ? await ok('resume/list?language=ja&pageSize=2&cursor=' + encodeURIComponent(page.cursor)) : null;
  assert.ok(!next || next.entries.every((entry) => !Object.hasOwn(entry.data, 'content')));
  const details = await ok('resume/details?id=job-one&id=original');
  assert.equal(details.returned, 2);
  assert.equal(details.entries.find((entry) => entry.id === 'original').data.content, '# Immutable source');
  const chunk = await ok('resume/document?id=original&revision=1&limit=4');
  assert.equal(chunk.text, '# Im');
  assert.equal(chunk.hasMore, true);
  assert.equal((await ok('resume/document?id=original&revision=1&offset=4&limit=100')).text, 'mutable source');
  assert.equal((await send('resume/details?id=unknown')).status, 200);
});

test('MCP resume reads request summaries and retrieve only the selected revision', async () => {
  const bundle = await build({ entryPoints: ['worker/agent-tools.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
  const { createCareerTools } = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));
  const paths = [];
  const tools = createCareerTools(async (_ctx, path) => {
    paths.push(path);
    return Response.json({ entries: [] });
  });
  for (const [name, args] of [
    ['career_get_resume', {}],
    ['career_get_context', {}],
    ['career_resume_history', { id: 'doc/a' }],
    ['career_get_resume_version', { id: 'doc/a', revision: 2 }],
  ]) {
    const tool = tools.find(t => t.name === name);
    assert.equal(tool.scope, 'career:read');
    await tool.handler(args, {});
  }
  assert.deepEqual(paths, [
    'resume?view=summary', 'state?resumeView=summary',
    'resume/history?id=doc%2Fa&view=summary', 'resume/version?id=doc%2Fa&revision=2',
  ]);
});
