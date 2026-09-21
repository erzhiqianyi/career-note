import { resumeKinds, validateResume, type ResumeEntry } from '../lib/resume';
export async function ensureResumeSchema(db: D1Database) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS resume_entries (owner TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,parent_id TEXT NOT NULL,archived INTEGER NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(owner,id));`,
  );
  // 基本资料按语言各一条；求职方向是一条记录一个方向。
  // 旧记录没有 language 字段，一律视为日语；不改写 body，以免触发历史表触发器。
  await db.exec(`DROP INDEX IF EXISTS resume_singleton;`);
  // 旧版本的同名索引也约束 preferences；显式删除后按新契约重建。
  await db.exec(`DROP INDEX IF EXISTS resume_singleton_language;`);
  await db.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS resume_singleton_language ON resume_entries(owner,kind,coalesce(json_extract(body,'$.language'),'ja')) WHERE archived=0 AND kind IN ('basics');`,
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
  summary = false,
): Promise<ResumeEntry[]> {
  const rows = await db
    .prepare(
      `SELECT ${summary ? "CASE WHEN kind='document' THEN json_remove(body,'$.data.content') ELSE body END" : 'body'} AS body FROM resume_entries WHERE owner=? ORDER BY kind,updated_at,id`,
    )
    .bind(owner)
    .all<{ body: string }>();
  return rows.results.map((r) => withLanguage(JSON.parse(r.body)));
}

export const RESUME_LIST_PAGE_SIZE = 20;
export const RESUME_DETAIL_BATCH_LIMIT = 5;
export const RESUME_DOCUMENT_CHUNK_SIZE = 12000;

type ResumeFilter = { kind?: string; language?: string; archived?: boolean };
function metadata(entry: ResumeEntry) {
  const { content: _content, ...data } = entry.data;
  return { ...entry, data };
}

export async function resumeOverview(db: D1Database, owner: string, filter: ResumeFilter = {}) {
  const entries = await readResume(db, owner, true);
  const filtered = entries.filter((entry) =>
    (!filter.kind || entry.kind === filter.kind) &&
    (!filter.language || (entry.language || 'ja') === filter.language) &&
    (entry.archived === (filter.archived ?? false)),
  );
  const counts = Object.fromEntries(resumeKinds.map((kind) => [kind, filtered.filter((e) => e.kind === kind).length]));
  return { filter: { ...filter, archived: filter.archived ?? false }, counts, count: filtered.length, updatedAt: filtered.map((e) => e.updatedAt).sort().at(-1) || null };
}

export async function listResume(db: D1Database, owner: string, filter: ResumeFilter = {}, pageSize = RESUME_LIST_PAGE_SIZE, cursor = '') {
  const safeSize = Math.min(Math.max(Number.isFinite(pageSize) ? Math.floor(pageSize) : RESUME_LIST_PAGE_SIZE, 1), RESUME_LIST_PAGE_SIZE);
  const entries = (await readResume(db, owner, true)).filter((entry) =>
    (!filter.kind || entry.kind === filter.kind) &&
    (!filter.language || (entry.language || 'ja') === filter.language) &&
    (filter.archived === undefined ? !entry.archived : entry.archived === filter.archived),
  ).sort((a, b) => (a.updatedAt + '\0' + a.id).localeCompare(b.updatedAt + '\0' + b.id));
  const start = cursor ? Math.max(0, entries.findIndex((e) => e.id === cursor) + 1) : 0;
  const page = entries.slice(start, start + safeSize).map(metadata);
  return { entries: page, filter: { ...filter, archived: filter.archived ?? false }, returned: page.length, hasMore: start + page.length < entries.length, cursor: start + page.length < entries.length ? page.at(-1)?.id || null : null, representation: 'metadata-preview' };
}

export async function resumeDetails(db: D1Database, owner: string, ids: string[]) {
  const unique = [...new Set(ids)].slice(0, RESUME_DETAIL_BATCH_LIMIT);
  const result = [];
  for (const id of unique) {
    const entry = await db.prepare('SELECT body FROM resume_entries WHERE owner=? AND id=?').bind(owner, id).first<{ body: string }>();
    if (entry) result.push(withLanguage(JSON.parse(entry.body)));
  }
  return { entries: result, requested: unique.length, returned: result.length, representation: 'full-record', truncated: ids.length > RESUME_DETAIL_BATCH_LIMIT };
}

export async function resumeDocumentChunk(db: D1Database, owner: string, id: string, revision: number, offset = 0, limit = RESUME_DOCUMENT_CHUNK_SIZE) {
  const entry = await resumeVersion(db, owner, id, revision);
  if (!entry || entry.kind !== 'document') return null;
  const content = entry.data.content || '';
  const start = Math.max(0, Math.floor(offset));
  const size = Math.min(Math.max(Math.floor(limit), 1), RESUME_DOCUMENT_CHUNK_SIZE);
  const text = Array.from(content).slice(start, start + size).join('');
  const nextOffset = start + Array.from(text).length;
  return { id, revision, offset: start, limit: size, text, hasMore: nextOffset < Array.from(content).length, nextOffset: nextOffset < Array.from(content).length ? nextOffset : null, representation: 'document-chunk', unit: 'Unicode code points' };
}
// 历史版本在加入语言字段前写入，读出时补默认值。
function withLanguage(entry: ResumeEntry): ResumeEntry {
  return { ...entry, language: entry.language || 'ja' };
}
export async function resumeHistory(db: D1Database, owner: string, id: string, summary = false) {
  const rows = await db
    .prepare(
      `SELECT ${summary ? "json_remove(body,'$.data')" : 'body'} AS body FROM resume_history WHERE owner=? AND id=? ORDER BY revision DESC`,
    )
    .bind(owner, id)
    .all<{ body: string }>();
  return rows.results.map((r) => withLanguage(JSON.parse(r.body)));
}
export async function resumeVersion(db: D1Database, owner: string, id: string, revision: number) {
  const row = await db.prepare('SELECT body FROM resume_history WHERE owner=? AND id=? AND revision=?')
    .bind(owner, id, revision).first<{ body: string }>();
  return row ? withLanguage(JSON.parse(row.body)) : null;
}
export async function writeResume(
  db: D1Database,
  owner: string,
  profileKey: string,
  input: unknown,
) {
  // Agents read documents without the body (summary view); archiving or restoring such a record may omit content.
  if (input && typeof input === 'object' && (input as { kind?: string }).kind === 'document') {
    const raw = input as { id?: string; data?: Record<string, string> };
    if (raw.data && raw.data.content === undefined && typeof raw.id === 'string') {
      const previous = await db
        .prepare('SELECT body FROM resume_entries WHERE owner=? AND id=?')
        .bind(owner, raw.id)
        .first<{ body: string }>();
      if (previous) raw.data = { ...raw.data, content: (JSON.parse(previous.body) as ResumeEntry).data.content || '' };
    }
  }
  let entry;
  try {
    entry = validateResume(input);
  } catch (e) {
    return {
      status: 400,
      value: { error: e instanceof Error ? e.message : '无效履历' },
    };
  }
  if (!entry.archived && entry.kind === 'basics') {
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
  const canonical = (data: Record<string, string>) =>
    JSON.stringify(Object.fromEntries(Object.entries(data).filter(([, v]) => v).sort(([a], [b]) => a.localeCompare(b))));
  if (
    old &&
    entry.kind === 'document' &&
    canonical(old.data) !== canonical(entry.data)
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
