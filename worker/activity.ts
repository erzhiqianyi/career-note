// Per-agent audit trail: what each OAuth grant did, kept per owner so the user can review
// and revoke with context. Entries hold tool names and counts only, never payloads.

export type ActivityEvent = {
  ownerUid: string;
  tokenId: string | null;
  clientId: string | null;
  clientName: string;
  event: string; // authorized | refreshed | revoked | tool:<path>
  ok: boolean;
  detail?: Record<string, unknown> | null;
};

type ActivityRow = {
  id: string;
  owner_uid: string;
  token_id: string | null;
  client_id: string | null;
  client_name: string;
  event: string;
  ok: number;
  detail: string | null;
  at: string;
};

const KEEP_PER_OWNER = 500;
const KEEP_DAYS = 180;

export async function ensureActivitySchema(db: D1Database) {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS agent_activity (id TEXT PRIMARY KEY, owner_uid TEXT NOT NULL, token_id TEXT, client_id TEXT, client_name TEXT NOT NULL, event TEXT NOT NULL, ok INTEGER NOT NULL, detail TEXT, at TEXT NOT NULL);`,
  );
  await db.exec(`CREATE INDEX IF NOT EXISTS agent_activity_owner ON agent_activity(owner_uid, at);`);
}

export async function logActivity(db: D1Database, entry: ActivityEvent) {
  const at = new Date().toISOString();
  await db
    .prepare('INSERT INTO agent_activity(id, owner_uid, token_id, client_id, client_name, event, ok, detail, at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)')
    .bind(crypto.randomUUID(), entry.ownerUid, entry.tokenId, entry.clientId, entry.clientName.slice(0, 200), entry.event.slice(0, 120), entry.ok ? 1 : 0, entry.detail ? JSON.stringify(entry.detail).slice(0, 2000) : null, at)
    .run();
  // Cheap bounded retention: drop old rows and anything past the per-owner cap.
  if (Math.random() < 0.05) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400 * 1000).toISOString();
    await db.prepare('DELETE FROM agent_activity WHERE owner_uid = ?1 AND at < ?2').bind(entry.ownerUid, cutoff).run();
    await db
      .prepare('DELETE FROM agent_activity WHERE owner_uid = ?1 AND id NOT IN (SELECT id FROM agent_activity WHERE owner_uid = ?1 ORDER BY at DESC LIMIT ?2)')
      .bind(entry.ownerUid, KEEP_PER_OWNER)
      .run();
  }
}

export async function listActivity(db: D1Database, ownerUid: string, tokenId: string | null, limit: number) {
  const capped = Math.min(Math.max(1, limit || 50), 200);
  const query = tokenId
    ? db.prepare('SELECT * FROM agent_activity WHERE owner_uid = ?1 AND token_id = ?2 ORDER BY at DESC LIMIT ?3').bind(ownerUid, tokenId, capped)
    : db.prepare('SELECT * FROM agent_activity WHERE owner_uid = ?1 ORDER BY at DESC LIMIT ?2').bind(ownerUid, capped);
  const rows = (await query.all<ActivityRow>()).results || [];
  return rows.map((row) => ({
    id: row.id,
    tokenId: row.token_id || '',
    clientId: row.client_id || '',
    clientName: row.client_name,
    event: row.event,
    ok: row.ok === 1,
    detail: row.detail ? (JSON.parse(row.detail) as Record<string, unknown>) : null,
    at: row.at,
  }));
}

// Summaries worth keeping for write tools; everything else logs the event name only.
export function summarizeToolResult(path: string, body: Record<string, unknown> | undefined, response: unknown): Record<string, unknown> | null {
  if (path === 'import' || path === 'import/preview') {
    const bundle = body || {};
    const counts: Record<string, number> = {};
    for (const key of ['jobs', 'materials', 'reports', 'questionSets', 'reviews', 'completeTaskIds']) {
      const value = bundle[key];
      if (Array.isArray(value) && value.length) counts[key] = value.length;
    }
    return { requested: counts, result: response && typeof response === 'object' ? (response as Record<string, unknown>) : null };
  }
  if (path === 'tasks') return { kind: body?.kind ?? null, jobId: body?.jobId ?? null };
  if (path === 'profile' || path === 'resume' || path === 'personalized-resumes') return { id: body?.id ?? null, revision: body?.revision ?? null };
  return null;
}
