import {
  personalizedResumeSchema,
  resumeHTML,
  type PersonalizedResume,
  type ResumePublication,
} from '../lib/personalized-resume';
export async function ensurePersonalizedSchema(db: D1Database) {
  await db.batch([
    db.prepare(
      'CREATE TABLE IF NOT EXISTS personalized_resumes(owner TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(owner,id))',
    ),
    db.prepare(
      'CREATE TABLE IF NOT EXISTS personalized_resume_history(owner TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(owner,id,revision))',
    ),
    db.prepare(
      'CREATE TRIGGER IF NOT EXISTS personalized_insert AFTER INSERT ON personalized_resumes BEGIN INSERT INTO personalized_resume_history VALUES(NEW.owner,NEW.id,NEW.revision,NEW.body); END',
    ),
    db.prepare(
      'CREATE TRIGGER IF NOT EXISTS personalized_update AFTER UPDATE ON personalized_resumes BEGIN INSERT INTO personalized_resume_history VALUES(NEW.owner,NEW.id,NEW.revision,NEW.body); END',
    ),
    db.prepare(
      "CREATE TABLE IF NOT EXISTS resume_publications(id TEXT PRIMARY KEY,owner TEXT NOT NULL,body TEXT NOT NULL,revoked_at TEXT NOT NULL DEFAULT '')",
    ),
  ]);
}
const json = (v: unknown, status = 200) => Response.json(v, { status });
export async function listPersonalized(db: D1Database, owner: string) {
  const rows = await db
    .prepare(
      'SELECT body FROM personalized_resumes WHERE owner=? ORDER BY rowid DESC',
    )
    .bind(owner)
    .all<{ body: string }>();
  const pubs = await db
    .prepare(
      'SELECT body,revoked_at FROM resume_publications WHERE owner=? ORDER BY rowid DESC',
    )
    .bind(owner)
    .all<{ body: string; revoked_at: string }>();
  return {
    drafts: rows.results.map((r) => JSON.parse(r.body)),
    publications: pubs.results.map((r) => ({
      ...JSON.parse(r.body),
      revokedAt: r.revoked_at,
    })),
  };
}
export async function savePersonalized(
  db: D1Database,
  owner: string,
  input: unknown,
) {
  const parsed = personalizedResumeSchema.safeParse(input);
  if (!parsed.success) return json({ error: parsed.error.message }, 400);
  const value = parsed.data;
  for (const ref of value.sourceRefs) {
    const found = await db
      .prepare(
        'SELECT id FROM resume_history WHERE owner=? AND id=? AND revision=?',
      )
      .bind(owner, ref.id, ref.revision)
      .first();
    if (!found) return json({ error: '来源版本不存在：' + ref.id }, 400);
  }
  const saved = {
    ...value,
    revision: value.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  const result =
    value.revision === 0
      ? await db
          .prepare('INSERT OR IGNORE INTO personalized_resumes VALUES(?,?,?,?)')
          .bind(owner, value.id, 1, JSON.stringify(saved))
          .run()
      : await db
          .prepare(
            'UPDATE personalized_resumes SET revision=?,body=? WHERE owner=? AND id=? AND revision=?',
          )
          .bind(
            saved.revision,
            JSON.stringify(saved),
            owner,
            value.id,
            value.revision,
          )
          .run();
  return result.meta.changes > 0
    ? json(saved)
    : json({ error: '草稿已更改，请重新载入后保存' }, 409);
}
export async function deletePersonalized(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
) {
  const { id, revision } = input;
  if (typeof id !== 'string' || !id || id.length > 100 || !Number.isSafeInteger(revision) || (revision as number) < 1)
    return json({ error: '请提供草稿 id 和当前修订号' }, 400);
  const row = await db
    .prepare('SELECT revision,body FROM personalized_resumes WHERE owner=? AND id=?')
    .bind(owner, id)
    .first<{ revision: number; body: string }>();
  if (!row) return json({ error: '草稿不存在' }, 404);
  if (!(JSON.parse(row.body) as PersonalizedResume).archived)
    return json({ error: '只能永久删除已归档的草稿' }, 400);
  if (row.revision !== revision) return json({ error: '草稿已更改，请刷新后重试' }, 409);
  // A live link must be withdrawn deliberately; deleting the draft never takes a public page down silently.
  const activeLink = `SELECT 1 FROM resume_publications WHERE owner=? AND json_extract(body,'$.draftId')=? AND revoked_at=''
    AND (coalesce(json_extract(body,'$.expiresAt'),'')='' OR json_extract(body,'$.expiresAt')>?)`;
  const now = new Date().toISOString();
  if (await db.prepare(activeLink).bind(owner, id, now).first())
    return json({ error: '此草稿仍有公开链接，请先撤下' }, 409);
  const gone = 'NOT EXISTS (SELECT 1 FROM personalized_resumes WHERE owner=? AND id=?)';
  const results = await db.batch([
    db.prepare(`DELETE FROM personalized_resumes WHERE owner=? AND id=? AND revision=?
      AND json_extract(body,'$.archived')=1 AND NOT EXISTS (${activeLink})`)
      .bind(owner, id, revision, owner, id, now),
    db.prepare(`DELETE FROM personalized_resume_history WHERE owner=? AND id=? AND ${gone}`)
      .bind(owner, id, owner, id),
    // Withdrawn and expired snapshots still hold the content; remove them with the draft.
    db.prepare(`DELETE FROM resume_publications WHERE owner=? AND json_extract(body,'$.draftId')=? AND ${gone}`)
      .bind(owner, id, owner, id),
  ]);
  return results[0].meta.changes > 0
    ? json({ ok: true })
    : json({ error: '草稿已更改，请刷新后重试' }, 409);
}
export async function publishResume(
  db: D1Database,
  owner: string,
  input: Record<string, unknown>,
) {
  const { draftId, draftRevision, mode, expiresAt } = input;
  if (
    typeof draftId !== 'string' ||
    !Number.isInteger(draftRevision) ||
    !['public', 'unlisted'].includes(String(mode)) ||
    typeof expiresAt !== 'string'
  )
    return json({ error: '发布参数无效' }, 400);
  if (
    expiresAt &&
    (!Number.isFinite(Date.parse(expiresAt)) ||
      Date.parse(expiresAt) <= Date.now())
  )
    return json({ error: '有效期必须在未来' }, 400);
  const row = await db
    .prepare(
      'SELECT body FROM personalized_resumes WHERE owner=? AND id=? AND revision=?',
    )
    .bind(owner, draftId, draftRevision)
    .first<{ body: string }>();
  if (!row) return json({ error: '草稿版本已改变，请重新预览' }, 409);
  const draft: PersonalizedResume = JSON.parse(row.body);
  if (draft.archived) return json({ error: '请先恢复草稿' }, 400);
  const id = crypto.randomUUID();
  const publication: ResumePublication = {
    id,
    draftId,
    draftRevision: draft.revision,
    title: draft.title,
    language: draft.language,
    content: draft.content,
    mode: mode as 'public' | 'unlisted',
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '',
    createdAt: new Date().toISOString(),
    revokedAt: '',
    path: '/api/career/public-resumes/' + id,
  };
  await db
    .prepare('INSERT INTO resume_publications(id,owner,body) VALUES(?,?,?)')
    .bind(id, owner, JSON.stringify(publication))
    .run();
  return json(publication);
}
export async function revokePublication(
  db: D1Database,
  owner: string,
  id: unknown,
) {
  if (typeof id !== 'string') return json({ error: '链接不存在' }, 404);
  const result = await db
    .prepare(
      "UPDATE resume_publications SET revoked_at=? WHERE owner=? AND id=? AND revoked_at=''",
    )
    .bind(new Date().toISOString(), owner, id)
    .run();
  return result.meta.changes
    ? json({ ok: true })
    : json({ error: '链接不存在或已撤下' }, 404);
}
export async function publicResumeResponse(db: D1Database, id: string) {
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy':
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow',
  };
  const row = await db
    .prepare('SELECT body,revoked_at FROM resume_publications WHERE id=?')
    .bind(id)
    .first<{ body: string; revoked_at: string }>();
  if (!row || row.revoked_at)
    return new Response('Resume unavailable', { status: 404, headers });
  const p: ResumePublication = JSON.parse(row.body);
  if (p.expiresAt && Date.parse(p.expiresAt) <= Date.now())
    return new Response('Resume unavailable', { status: 404, headers });
  headers['X-Robots-Tag'] =
    p.mode === 'unlisted' ? 'noindex, nofollow' : 'index, follow';
  return new Response(resumeHTML(p.content, p.language), { headers });
}
