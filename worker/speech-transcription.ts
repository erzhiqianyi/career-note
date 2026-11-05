import { z } from 'zod';

export const SPEECH_MODEL = '@cf/openai/whisper-large-v3-turbo';
export const SPEECH_CHUNK_SECONDS = 30;
export const SPEECH_MAX_WAV_BYTES = 44 + 16000 * 2 * SPEECH_CHUNK_SECONDS;
export const SPEECH_DAILY_SECONDS = 180 * 60;
export class SpeechTranscriptionError extends Error {
  constructor(public code: number, message: string) { super(message); }
}
export type SpeechAI = { run(model: string, input: Record<string, unknown>): Promise<unknown> };
export type SpeechStore = {
  connection: D1Database; namespace: string;
  get(kind: string, id: string): Promise<Record<string, unknown> | null>;
  put(kind: string, value: Record<string, unknown>): Promise<void>;
};
const id = z.string().regex(/^[a-zA-Z0-9:_-]{1,100}$/);
export const speechJobSchema = z.object({
  id, target: z.enum(['interview', 'practice']), interviewId: z.string().max(120).default(''),
  language: z.enum(['ja', 'zh']), durationSeconds: z.number().positive().max(8 * 3600),
}).strict().refine(value => value.target !== 'interview' || !!value.interviewId, 'interviewId is required');
export type SpeechJob = z.infer<typeof speechJobSchema> & {
  chunkSeconds: number; chunkCount: number; createdAt: string; completedAt?: string;
  sourceRevision?: number; committedRevision?: number;
};
type Segment = { id: string; start: number; end: number; speaker: 'unknown'; text: string; confirmed: false };
export type SpeechChunk = { part: number; text: string; segments: Segment[] };
const kind = (store: SpeechStore, collection: string) => store.namespace ? JSON.stringify([store.namespace, collection]) : collection;
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new SpeechTranscriptionError(400, result.error.issues.map(issue => issue.message).join('; '));
  return result.data;
}
export async function ensureSpeechSchema(db: D1Database) {
  await db.prepare('CREATE TABLE IF NOT EXISTS speech_daily_usage (day TEXT PRIMARY KEY, seconds REAL NOT NULL)').run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS speech_chunks (owner TEXT NOT NULL, job_id TEXT NOT NULL, part INTEGER NOT NULL,
    state TEXT NOT NULL, lease_token TEXT NOT NULL, lease_until INTEGER NOT NULL, result TEXT, error TEXT,
    PRIMARY KEY(owner,job_id,part))`).run();
}
export async function getSpeechJob(store: SpeechStore, jobId: string): Promise<SpeechJob> {
  parse(id, jobId);
  const job = await store.get('speechJobs', jobId);
  if (!job) throw new SpeechTranscriptionError(404, '音声認識の依頼が見つかりません。');
  return job as SpeechJob;
}
export async function startSpeechJob(store: SpeechStore, input: unknown) {
  const data = parse(speechJobSchema, input);
  const old = await store.get('speechJobs', data.id);
  if (old) {
    if (Object.entries(data).some(([key, value]) => old[key] !== value)) throw new SpeechTranscriptionError(409, 'この認識番号は別の録音に使用されています。');
    return old as SpeechJob;
  }
  let sourceRevision: number | undefined;
  if (data.target === 'interview') {
    const interview = await store.get('interviews', data.interviewId);
    if (!interview?.audio) throw new SpeechTranscriptionError(400, '面接の原録音を先にアップロードしてください。');
    if (interview.transcript) throw new SpeechTranscriptionError(409, 'この面接には転写が保存されています。既存の転写を上書きしません。');
    if (Math.abs(Number(interview.durationSeconds) - data.durationSeconds) > 0.1) throw new SpeechTranscriptionError(400, '原録音と認識範囲の長さが一致しません。');
    sourceRevision = Number(interview.revision);
  }
  const job: SpeechJob = { ...data, chunkSeconds: SPEECH_CHUNK_SECONDS,
    chunkCount: Math.ceil(data.durationSeconds / SPEECH_CHUNK_SECONDS), sourceRevision, createdAt: new Date().toISOString() };
  await store.connection.prepare('INSERT OR IGNORE INTO records(kind,id,body) VALUES (?1,?2,?3)')
    .bind(kind(store, 'speechJobs'), job.id, JSON.stringify(job)).run();
  const saved = await getSpeechJob(store, job.id);
  if (Object.entries(data).some(([key, value]) => (saved as unknown as Record<string, unknown>)[key] !== value)) throw new SpeechTranscriptionError(409, '認識番号が競合しました。');
  return saved;
}
export async function speechJobStatus(store: SpeechStore, jobId: string) {
  const job = await getSpeechJob(store, jobId);
  const rows = await store.connection.prepare('SELECT part,state,error FROM speech_chunks WHERE owner=?1 AND job_id=?2 ORDER BY part')
    .bind(store.namespace, job.id).all<{ part: number; state: string; error: string | null }>();
  return { ...job, completedParts: (rows.results || []).filter(row => row.state === 'completed').map(row => row.part),
    failures: (rows.results || []).filter(row => row.state === 'failed').map(row => ({ part: row.part, error: row.error })) };
}
export function validateSpeechWav(bytes: Uint8Array, expectedDuration: number) {
  if (bytes.byteLength < 44 || bytes.byteLength > SPEECH_MAX_WAV_BYTES) throw new SpeechTranscriptionError(400, '認識用 WAV の長さが正しくありません。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ' || tag(36) !== 'data' ||
    view.getUint32(16, true) !== 16 || view.getUint16(20, true) !== 1 || view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== 16000 || view.getUint32(28, true) !== 32000 || view.getUint16(32, true) !== 2 ||
    view.getUint16(34, true) !== 16 || view.getUint32(4, true) !== bytes.length - 8 || view.getUint32(40, true) !== bytes.length - 44 || (bytes.length - 44) % 2) {
    throw new SpeechTranscriptionError(400, '16 kHz・モノラル・16 bit PCM の独立した WAV 区間を送信してください。');
  }
  const duration = (bytes.length - 44) / 32000;
  if (Math.abs(duration - expectedDuration) > 0.08) throw new SpeechTranscriptionError(400, '音声区間の長さが依頼内容と一致しません。');
  return duration;
}
function base64(bytes: Uint8Array) {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
export function normalizeSpeechResult(value: unknown, part: number, start: number, duration: number): SpeechChunk {
  const result = z.object({ text: z.string().max(12000), segments: z.array(z.object({
    start: z.number(), end: z.number(), text: z.string().max(12000),
  }).passthrough()).max(1000).optional() }).passthrough().safeParse(value);
  if (!result.success) throw new SpeechTranscriptionError(502, '音声認識の結果を読み取れませんでした。原録音は保持しています。');
  const text = result.data.text.trim();
  const segments: Segment[] = [];
  if (result.data.segments?.length) {
    for (const [index, segment] of result.data.segments.entries()) {
      const content = segment.text.trim();
      if (!content) continue;
      if (segment.start < 0 || segment.start >= duration || segment.end <= segment.start || segment.end > duration + 0.5 ||
        (index > 0 && segment.start < result.data.segments[index - 1].start)) throw new SpeechTranscriptionError(502, '認識結果の時刻が音声区間に一致しません。');
      segments.push({ id: `speech-${part}-${index}`, start: start + segment.start, end: start + Math.min(duration, segment.end),
        speaker: 'unknown', text: content, confirmed: false });
    }
  } else if (text) {
    segments.push({ id: `speech-${part}-0`, start, end: start + duration, speaker: 'unknown', text, confirmed: false });
  }
  return { part, text, segments };
}
export async function recognizeSpeechChunk(store: SpeechStore, ai: SpeechAI, bucket: R2Bucket, uid: string,
  jobId: string, part: number, bytes: Uint8Array) {
  const job = await getSpeechJob(store, jobId);
  if (!Number.isInteger(part) || part < 0 || part >= job.chunkCount) throw new SpeechTranscriptionError(400, '音声区間の番号が正しくありません。');
  const start = part * job.chunkSeconds, duration = Math.min(job.chunkSeconds, job.durationSeconds - start);
  const old = await store.connection.prepare('SELECT state,result FROM speech_chunks WHERE owner=?1 AND job_id=?2 AND part=?3')
    .bind(store.namespace, job.id, part).first<{ state: string; result: string | null }>();
  if (old?.state === 'completed' && old.result) return JSON.parse(old.result) as SpeechChunk;
  validateSpeechWav(bytes, duration);
  const lease = crypto.randomUUID(), now = Date.now();
  const acquired = await store.connection.prepare(`INSERT INTO speech_chunks(owner,job_id,part,state,lease_token,lease_until) VALUES (?1,?2,?3,'processing',?4,?5)
    ON CONFLICT(owner,job_id,part) DO UPDATE SET state='processing',lease_token=excluded.lease_token,lease_until=excluded.lease_until,error=NULL
    WHERE speech_chunks.state='failed' OR (speech_chunks.state='processing' AND speech_chunks.lease_until < ?6)`)
    .bind(store.namespace, job.id, part, lease, now + 120000, now).run();
  if (!acquired.meta.changes) throw new SpeechTranscriptionError(409, 'この音声区間を認識中です。少し待ってから再開してください。');
  try {
    const day = new Date().toISOString().slice(0, 10);
    const reservation = await store.connection.prepare(`INSERT INTO speech_daily_usage(day,seconds) VALUES (?1,?2)
      ON CONFLICT(day) DO UPDATE SET seconds=speech_daily_usage.seconds+excluded.seconds
      WHERE speech_daily_usage.seconds+excluded.seconds <= ?3 RETURNING seconds`)
      .bind(day, duration, SPEECH_DAILY_SECONDS).first<{ seconds: number }>();
    if (!reservation) throw new SpeechTranscriptionError(429, '本日のクラウド認識上限に達しました。日本時間の午前9時以降に再開するか、端末の認識を利用してください。');
    // Failures keep their reservation: a timed-out request might already have consumed inference usage.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const raw = await Promise.race([
      ai.run(SPEECH_MODEL, { audio: base64(bytes), task: 'transcribe', language: job.language, vad_filter: true,
        condition_on_previous_text: false, beam_size: 1 }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new SpeechTranscriptionError(504, '音声認識がタイムアウトしました。録音を保持して再開できます。')), 70000); }),
    ]).finally(() => { if (timer) clearTimeout(timer); });
    const result = normalizeSpeechResult(raw, part, start, duration);
    const rawBody = JSON.stringify(raw);
    if (new TextEncoder().encode(rawBody).length > 500000) throw new SpeechTranscriptionError(502, '認識結果が大きすぎます。');
    await bucket.put(`${uid}/speech/${job.id}/${part}.json`, rawBody, { httpMetadata: { contentType: 'application/json' } });
    const stored = await store.connection.prepare(`UPDATE speech_chunks SET state='completed',result=?1,error=NULL,lease_until=0
      WHERE owner=?2 AND job_id=?3 AND part=?4 AND lease_token=?5`).bind(JSON.stringify(result), store.namespace, job.id, part, lease).run();
    if (!stored.meta.changes) throw new SpeechTranscriptionError(409, '音声区間が更新されました。状態を再取得してください。');
    return result;
  } catch (error) {
    const message = error instanceof SpeechTranscriptionError ? error.message : 'クラウド音声認識を完了できませんでした。無料枠または接続状況を確認して再開してください。';
    await store.connection.prepare(`UPDATE speech_chunks SET state='failed',error=?1,lease_until=0 WHERE owner=?2 AND job_id=?3 AND part=?4 AND lease_token=?5`)
      .bind(message, store.namespace, job.id, part, lease).run();
    if (error instanceof SpeechTranscriptionError) throw error;
    throw new SpeechTranscriptionError(503, message);
  }
}
export async function completeSpeechJob(store: SpeechStore, jobId: string) {
  const job = await getSpeechJob(store, jobId);
  const rows = await store.connection.prepare("SELECT part,result FROM speech_chunks WHERE owner=?1 AND job_id=?2 AND state='completed' ORDER BY part")
    .bind(store.namespace, job.id).all<{ part: number; result: string }>();
  if (rows.results.length !== job.chunkCount || rows.results.some((row, index) => row.part !== index)) throw new SpeechTranscriptionError(409, 'まだ認識していない音声区間があります。途中から再開してください。');
  const chunks = rows.results.map(row => JSON.parse(row.result) as SpeechChunk);
  const text = chunks.map(chunk => chunk.text).filter(Boolean).join('\n');
  const segments = chunks.flatMap(chunk => chunk.segments);
  if (text.length > 350000 || segments.length > 5000) throw new SpeechTranscriptionError(413, '転写結果が保存可能な長さを超えています。');
  if (!job.completedAt) { job.completedAt = new Date().toISOString(); await store.put('speechJobs', job); }
  return { job, text, transcript: { source: `Cloudflare Workers AI / ${SPEECH_MODEL} / ${job.id}`, originalText: text, segments } };
}
export async function speechUsage(store: SpeechStore) {
  const day = new Date().toISOString().slice(0, 10);
  const row = await store.connection.prepare('SELECT seconds FROM speech_daily_usage WHERE day=?1').bind(day).first<{ seconds: number }>();
  return { day, usedSeconds: row?.seconds || 0, limitSeconds: SPEECH_DAILY_SECONDS, resetsAt: new Date(Date.parse(day) + 86400000).toISOString() };
}
