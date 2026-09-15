import { validateResume, type ResumeEntry } from '../lib/resume';
export async function ensureResumeSchema(db: D1Database) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS resume_entries (owner TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,parent_id TEXT NOT NULL,archived INTEGER NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(owner,id));`,
  );
  // 基本资料、求职意向按语言各一条；旧索引按 (owner,kind) 唯一，需先移除。
  // 旧记录没有 language 字段，一律视为日语；不改写 body，以免触发历史表触发器。
  await db.exec(`DROP INDEX IF EXISTS resume_singleton;`);
  await db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS resume_singleton_language ON resume_entries(owner,kind,coalesce(json_extract(body,'$.language'),'ja')) WHERE archived=0 AND kind IN ('basics','preferences');`,
  );
  await db.exec(
    `CREATE TABLE IF NOT EXISTS resume_history (owner TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(owner,id,revision));`,
  );
  await db.exec(
    `CREATE TRIGGER IF NOT EXISTS resume_insert_history AFTER INSERT ON resume_entries BEGIN INSERT INTO resume_history VALUES(NEW.owner,NEW.id,NEW.revision,NEW.body); END;`,
  );
  await db.exec(
    `CREATE TRIGGER IF NOT EXISTS resume_update_history AFTER UPDATE ON resume_entries BEGIN INSERT INTO resume_history VALUES(NEW.owner,NEW.id,NEW.revision,NEW.body); END;`,
  );
}
export async function readResume(
  db: D1Database,
  owner: string,
): Promise<ResumeEntry[]> {
  const rows = await db
    .prepare(
      'SELECT body FROM resume_entries WHERE owner=? ORDER BY kind,updated_at,id',
    )
    .bind(owner)
    .all<{ body: string }>();
  return rows.results.map((r) => withLanguage(JSON.parse(r.body)));
}
// 历史版本在加入语言字段前写入，读出时补默认值。
function withLanguage(entry: ResumeEntry): ResumeEntry {
  return { ...entry, language: entry.language || 'ja' };
}
export async function resumeHistory(db: D1Database, owner: string, id: string) {
  const rows = await db
    .prepare(
      'SELECT body FROM resume_history WHERE owner=? AND id=? ORDER BY revision DESC',
    )
    .bind(owner, id)
    .all<{ body: string }>();
  return rows.results.map((r) => withLanguage(JSON.parse(r.body)));
}
export async function writeResume(
  db: D1Database,
  owner: string,
  profileKey: string,
  input: unknown,
) {
  let entry;
  try {
    entry = validateResume(input);
  } catch (e) {
    return {
      status: 400,
      value: { error: e instanceof Error ? e.message : '无效履历' },
    };
  }
  if (!entry.archived && ['basics', 'preferences'].includes(entry.kind)) {
    const duplicate = await db
      .prepare(
        "SELECT id FROM resume_entries WHERE owner=? AND kind=? AND coalesce(json_extract(body,'$.language'),'ja')=? AND archived=0 AND id<>?",
      )
      .bind(owner, entry.kind, entry.language, entry.id)
      .first();
    if (duplicate)
      return {
        status: 409,
        value: { error: '该分类在此语言下已有记录，请编辑现有记录' },
      };
  }
  const existing = await db
    .prepare('SELECT body FROM resume_entries WHERE owner=? AND id=?')
    .bind(owner, entry.id)
    .first<{ body: string }>();
  const old: ResumeEntry | undefined = existing
    ? JSON.parse(existing.body)
    : undefined;
  if ((old?.revision ?? 0) !== entry.revision)
    return { status: 409, value: { error: '记录已更新，请刷新后重新编辑' } };
  if (old && old.kind !== entry.kind)
    return { status: 400, value: { error: '记录类型不可更改' } };
  if (
    old &&
    entry.kind === 'document' &&
    JSON.stringify(old.data) !== JSON.stringify(entry.data)
  )
    return { status: 400, value: { error: '请保存为新的文档版本' } };
  if (entry.parentId) {
    const parent = await db
      .prepare(
        'SELECT kind,archived FROM resume_entries WHERE owner=? AND id=?',
      )
      .bind(owner, entry.parentId)
      .first<{ kind: string; archived: number }>();
    if (
      entry.parentId === entry.id ||
      !['project', 'skill', 'achievement'].includes(entry.kind) ||
      !parent ||
      parent.archived ||
      !['employment', 'project'].includes(parent.kind) ||
      (entry.kind === 'project' && parent.kind !== 'employment')
    )
      return { status: 400, value: { error: '关联经历不存在或类型不符' } };
  }
  const saved = {
    ...entry,
    revision: entry.revision + 1,
    updatedAt: new Date().toISOString(),
  };
  const statement = old
    ? db
        .prepare(
          'UPDATE resume_entries SET revision=?,parent_id=?,archived=?,body=?,updated_at=? WHERE owner=? AND id=? AND revision=?',
        )
        .bind(
          saved.revision,
          saved.parentId,
          +saved.archived,
          JSON.stringify(saved),
          saved.updatedAt,
          owner,
          saved.id,
          entry.revision,
        )
    : db
        .prepare('INSERT OR IGNORE INTO resume_entries VALUES(?,?,?,?,?,?,?,?)')
        .bind(
          owner,
          saved.id,
          saved.kind,
          saved.revision,
          saved.parentId,
          +saved.archived,
          JSON.stringify(saved),
          saved.updatedAt,
        );
  // CAS and dependent profile revision bump are in one transaction; a stale write cannot invalidate materials.
  const results = await db.batch([
    statement,
    db
      .prepare(
        `INSERT INTO meta(id,body) SELECT ?,json_object('revision',1,'updatedAt',?) WHERE changes()=1 ON CONFLICT(id) DO UPDATE SET body=json_set(meta.body,'$.revision',coalesce(json_extract(meta.body,'$.revision'),0)+1,'$.updatedAt',?)`,
      )
      .bind(profileKey, saved.updatedAt, saved.updatedAt),
  ]);
  if (!results[0].meta.changes)
    return { status: 409, value: { error: '记录已更新，请刷新后重新编辑' } };
  return { status: 200, value: saved };
}
