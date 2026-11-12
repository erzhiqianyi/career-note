// Every write to a table that GET /api/career/state reads bumps one counter (SQLite triggers, so no write
// path can forget it). The state route then reads that single row and serves an unchanged workspace from
// the isolate's memory instead of re-reading every record. `epoch` tells apart databases that happen to
// reach the same counter value (fresh test databases, a restored copy).
export async function ensureStateRevision(db: D1Database) {
  await db.exec(`CREATE TABLE IF NOT EXISTS state_revision (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL, epoch TEXT NOT NULL);`);
  await db.exec(`INSERT OR IGNORE INTO state_revision VALUES (1, 0, lower(hex(randomblob(8))));`);
}
export async function ensureStateRevisionTriggers(db: D1Database, tables: string[]) {
  for (const table of tables) for (const event of ['INSERT', 'UPDATE', 'DELETE']) {
    await db.exec(`CREATE TRIGGER IF NOT EXISTS state_revision_${table}_${event.toLowerCase()} AFTER ${event} ON ${table} BEGIN UPDATE state_revision SET n = n + 1 WHERE id = 1; END;`);
  }
}
export async function stateRevision(db: D1Database) {
  const row = await db.prepare('SELECT n, epoch FROM state_revision WHERE id = 1').first<{ n: number; epoch: string }>();
  return row ? `${row.epoch}:${row.n}` : '';
}
