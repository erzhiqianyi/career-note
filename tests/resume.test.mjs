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
  const saveRecord = async (entry, overrides) => {
    const { updatedAt, ...payload } = entry;
    return ok('resume', { ...payload, ...overrides });
  };
  const archived = await saveRecord(current, { archived: true });
  assert.equal(archived.archived, true);
  assert.equal((await ok('resume')).entries.length, 4);
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
  assert.equal((await ok('state')).profile.summary, 'Preserve summary');
});
