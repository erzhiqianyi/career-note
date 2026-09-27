// Study furigana glossary: one row per word in the shared `records` table, scoped by workspace key.
// Agents may add suggestions; only the user confirms, edits over confirmed entries or removes them.
import { MAX_READINGS, readingInputSchema, type ReadingEntry } from '../lib/japanese-readings';
import { builtinQuestionSets } from '../lib/interview-bank';

export class ReadingsError extends Error {
  constructor(public code: number, message: string) {
    super(message);
  }
}

export async function listReadings(db: D1Database, kind: string): Promise<ReadingEntry[]> {
  const rows = await db.prepare('SELECT body FROM records WHERE kind=?1').bind(kind).all<{ body: string }>();
  return (rows.results || []).map((r) => JSON.parse(r.body) as ReadingEntry).sort((a, b) => a.word.localeCompare(b.word, 'ja'));
}

/** The built-in question bank is static and not in the user's context, so agents read its Japanese here. */
export function builtinJapanese() {
  return builtinQuestionSets.flatMap((p) => p.questions.flatMap((q) => [q.questionJa, q.simpleQuestionJa || '', q.followUps || ''])).filter(Boolean);
}

export async function saveReadings(db: D1Database, kind: string, payload: Record<string, unknown>, byAgent: boolean) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const remove = Array.isArray(payload.remove) ? payload.remove.map(String) : [];
  if (entries.length > 200 || remove.length > 200) throw new ReadingsError(400, '每次最多 200 条');
  if (byAgent && remove.length) throw new ReadingsError(403, '假名词条只能由本人在应用中删除');
  const parsed = entries.map((raw, i) => {
    const result = readingInputSchema.safeParse(raw);
    if (!result.success) throw new ReadingsError(400, `entries[${i}]: ${result.error.issues[0]?.message || '格式无效'}`);
    return result.data;
  });
  const existing = new Map((await listReadings(db, kind)).map((e) => [e.word, e]));
  const saved: ReadingEntry[] = [];
  const skipped: Array<{ word: string; reason: string }> = [];
  const updatedAt = new Date().toISOString();
  for (const input of parsed) {
    const old = existing.get(input.word);
    // The user's own and confirmed readings are authoritative; an agent only suggests new words.
    if (byAgent && old && (old.confirmed || old.source === 'user')) {
      skipped.push({ word: input.word, reason: old.reading === input.reading ? 'unchanged' : 'confirmed' });
      continue;
    }
    if (!old && existing.size + saved.filter((s) => !existing.has(s.word)).length >= MAX_READINGS) throw new ReadingsError(400, `词表最多 ${MAX_READINGS} 条`);
    const entry: ReadingEntry = byAgent
      ? { word: input.word, reading: input.reading, source: 'agent', confirmed: false, note: input.note || '', updatedAt }
      : {
          word: input.word,
          reading: input.reading,
          // Confirming an agent suggestion unchanged keeps its origin; any edit makes it the user's.
          source: old && old.reading === input.reading ? old.source : 'user',
          confirmed: input.confirmed ?? true,
          note: input.note ?? old?.note ?? '',
          updatedAt,
        };
    saved.push(entry);
  }
  const statements = [
    ...saved.map((e) =>
      db.prepare('INSERT INTO records(kind,id,body) VALUES (?1,?2,?3) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body').bind(kind, e.word, JSON.stringify(e)),
    ),
    ...remove.map((word) => db.prepare('DELETE FROM records WHERE kind=?1 AND id=?2').bind(kind, word)),
  ];
  if (statements.length) await db.batch(statements);
  return { saved, skipped, removed: remove.filter((w) => existing.has(w)) };
}
