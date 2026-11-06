import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

const bundled = await build({ entryPoints: ['worker/resume.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022' });
const { ensureResumeSchema } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

const TABLE = 'CREATE TABLE resume_entries (owner TEXT NOT NULL,id TEXT NOT NULL,kind TEXT NOT NULL,revision INTEGER NOT NULL,parent_id TEXT NOT NULL,archived INTEGER NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(owner,id));';
// The exact statement earlier releases ran, so an index already in production must be recognised as current.
const RELEASED = "CREATE UNIQUE INDEX IF NOT EXISTS resume_singleton_language ON resume_entries(owner,kind,coalesce(json_extract(body,'$.language'),'ja')) WHERE archived=0 AND kind IN ('basics');";

async function database(t) {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'] });
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('CAREER_DB');
  const statements = [];
  const recording = { prepare: (sql) => db.prepare(sql), exec: (sql) => { statements.push(sql); return db.exec(sql); } };
  const indexes = async () => (await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='index' AND name LIKE 'resume_singleton%' ORDER BY name").all()).results;
  return { db, recording, statements, indexes };
}
const touchesIndex = (statements) => statements.filter((sql) => /(DROP|CREATE UNIQUE) INDEX/.test(sql));

test('a current resume singleton index is left alone on cold start', async (t) => {
  const { db, recording, statements, indexes } = await database(t);
  await db.exec(TABLE);
  await db.exec(RELEASED);
  await ensureResumeSchema(recording);
  assert.deepEqual(touchesIndex(statements), []);
  assert.equal((await indexes()).length, 1);
});

test('a fresh database gets the index once and repeat starts do not rebuild it', async (t) => {
  const { recording, statements, indexes } = await database(t);
  await ensureResumeSchema(recording);
  assert.equal(touchesIndex(statements).length, 1);
  statements.length = 0;
  await ensureResumeSchema(recording);
  assert.deepEqual(touchesIndex(statements), []);
  assert.equal((await indexes()).length, 1);
});

test('legacy resume singleton indexes are replaced by the current contract', async (t) => {
  const { db, recording, indexes } = await database(t);
  await db.exec(TABLE);
  await db.exec("CREATE UNIQUE INDEX resume_singleton ON resume_entries(owner,kind) WHERE archived=0 AND kind IN ('basics','preferences');");
  await db.exec("CREATE UNIQUE INDEX resume_singleton_language ON resume_entries(owner,kind,coalesce(json_extract(body,'$.language'),'ja')) WHERE archived=0 AND kind IN ('basics','preferences');");
  await ensureResumeSchema(recording);
  const rows = await indexes();
  assert.deepEqual(rows.map((row) => row.name), ['resume_singleton_language']);
  assert.doesNotMatch(rows[0].sql, /preferences/);
});
