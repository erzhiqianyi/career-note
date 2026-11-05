import { z } from 'zod';
import { interviewSummary, interviewUpdateSchema, type InterviewSession } from '../lib/interview-session';

export class InterviewError extends Error {
  constructor(public code: number, message: string) { super(message); }
}
type Store = {
  connection: D1Database; namespace: string;
  get(kind: string, id: string): Promise<Record<string, unknown> | null>;
  put(kind: string, value: Record<string, unknown>): Promise<void>;
  list(kind: string): Promise<Record<string, unknown>[]>;
};
const key = (store: Store, kind: string) => store.namespace ? JSON.stringify([store.namespace, kind]) : kind;
const safeId = z.string().regex(/^[a-zA-Z0-9:_-]{1,120}$/);
const createSchema = z.object({
  id: safeId, title: z.string().trim().min(1).max(200), jobId: z.string().max(120).default(''),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().startsWith(value)),
  durationSeconds: z.number().positive().max(8 * 3600),
}).strict();
const uploadSchema = z.object({ id: safeId, size: z.number().int().positive().max(256 * 1024 * 1024),
  contentType: z.enum(['audio/mp4', 'audio/x-m4a', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg']), fileName: z.string().min(1).max(240) }).strict();
export const INTERVIEW_PART_SIZE = 5 * 1024 * 1024;
export async function readInterviewBytes(request: Request, max: number) {
  const reader = request.body?.getReader();
  const buffer = new Uint8Array(max);
  let length = 0;
  if (!reader) return buffer.subarray(0, 0);
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (length + value.length > max) {
        await reader.cancel();
        throw new InterviewError(413, '请求体超过大小限制');
      }
      buffer.set(value, length); length += value.length;
    }
  } finally { reader.releaseLock(); }
  return buffer.subarray(0, length);
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new InterviewError(400, result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; '));
  return result.data;
}
export async function getInterview(store: Store, id: string): Promise<InterviewSession> {
  parse(safeId, id);
  const found = await store.get('interviews', id);
  if (!found) throw new InterviewError(404, '面试记录不存在');
  return found as InterviewSession;
}
export async function getInterviewVersion(store: Store, id: string, revision?: string | null): Promise<InterviewSession> {
  const current = await getInterview(store, id);
  if (!revision || Number(revision) === current.revision) return current;
  if (!Number.isSafeInteger(Number(revision)) || Number(revision) < 1) throw new InterviewError(400, '版本号不正确');
  const version = await store.get('interviewVersions', `${id}:${Number(revision)}`);
  if (!version) throw new InterviewError(404, '面试历史版本不存在');
  return version as InterviewSession;
}
export async function listInterviews(store: Store) {
  return { interviews: (await store.list('interviews')).map(item => interviewSummary(item as InterviewSession)) };
}
async function commit(store: Store, old: InterviewSession, next: InterviewSession) {
  next.revision = old.revision + 1;
  next.updatedAt = new Date().toISOString();
  const body = JSON.stringify(next);
  if (new TextEncoder().encode(body).length > 1_500_000) throw new InterviewError(413, '面试内容过大，请缩短转写或分析');
  const result = await store.connection.batch([
    store.connection.prepare(`INSERT INTO records(kind,id,body) SELECT ?1,?2,?3 WHERE EXISTS
      (SELECT 1 FROM records WHERE kind=?4 AND id=?5 AND json_extract(body,'$.revision')=?6)`)
      .bind(key(store, 'interviewVersions'), `${old.id}:${next.revision}`, body, key(store, 'interviews'), old.id, old.revision),
    store.connection.prepare(`UPDATE records SET body=?1 WHERE kind=?2 AND id=?3 AND json_extract(body,'$.revision')=?4`)
      .bind(body, key(store, 'interviews'), old.id, old.revision),
  ]).catch(() => { throw new InterviewError(409, '面试记录已更新，请重新读取'); });
  if (!result[1].meta.changes) throw new InterviewError(409, '面试记录已更新，请重新读取');
  return next;
}
export async function createInterview(store: Store, input: unknown) {
  const data = parse(createSchema, input);
  const old = await store.get('interviews', data.id);
  if (old) {
    if (Object.entries(data).some(([k, v]) => old[k] !== v)) throw new InterviewError(409, '导入编号已用于其他内容');
    return old;
  }
  if (data.jobId && !await store.get('jobs', data.jobId)) throw new InterviewError(400, '请选择现有职位，或暂不关联公司');
  const stamp = new Date().toISOString();
  const session: InterviewSession = { ...data, revision: 1, status: 'imported', createdAt: stamp, updatedAt: stamp };
  // Idempotent creation, including simultaneous retries.
  await store.connection.batch([
    store.connection.prepare('INSERT OR IGNORE INTO records(kind,id,body) VALUES (?1,?2,?3)').bind(key(store, 'interviews'), data.id, JSON.stringify(session)),
    store.connection.prepare('INSERT OR IGNORE INTO records(kind,id,body) SELECT ?1,?2,body FROM records WHERE kind=?3 AND id=?4').bind(key(store, 'interviewVersions'), `${data.id}:1`, key(store, 'interviews'), data.id),
  ]);
  const saved = await getInterview(store, data.id);
  if (Object.entries(data).some(([k, v]) => (saved as unknown as Record<string, unknown>)[k] !== v)) throw new InterviewError(409, '导入编号已用于其他内容');
  return saved;
}
function unique(values: string[]) { return new Set(values).size === values.length; }
export async function updateInterview(store: Store, input: unknown, preview = false) {
  const change = parse(interviewUpdateSchema, input);
  const old = await getInterview(store, change.id);
  if (old.revision !== change.revision) throw new InterviewError(409, '面试记录已更新，请重新读取');
  const next = { ...old };
  const rangeOK = (start: number, end: number) => start >= 0 && end > start && end <= old.durationSeconds + 0.05;
  if (change.stage === 'transcript') {
    if (old.transcript && old.transcript.originalText !== change.data.originalText) throw new InterviewError(400, '原转写文本必须保留，修正请写入 segments');
    if (!change.data.originalText.trim() && !change.data.segments.length) throw new InterviewError(400, '转写不能为空');
    if (!unique(change.data.segments.map(item => item.id)) || change.data.segments.some((item, i, all) => !rangeOK(item.start, item.end) || (i > 0 && item.start < all[i - 1].start)))
      throw new InterviewError(400, '转写时间或编号不正确');
    next.transcript = change.data; delete next.flow; delete next.review; delete next.practice;
  } else if (change.stage === 'flow') {
    if (!old.transcript?.segments.length) throw new InterviewError(400, '先保存带真实时间戳的完整转写');
    const flow = change.data;
    if (Math.abs(flow.reviewedThroughSeconds - old.durationSeconds) > 0.05) throw new InterviewError(400, '必须先完整阅读整场面试');
    if (!unique(flow.stages.map(item => item.id)) || !unique(flow.exchanges.map(item => item.id))) throw new InterviewError(400, '环节或问答编号重复');
    if (flow.stages.some((item, i, all) => !rangeOK(item.start, item.end) || (i > 0 && item.start < all[i - 1].end))) throw new InterviewError(400, '面试环节必须按时间排序且不重叠');
    for (const exchange of flow.exchanges) {
      const stage = flow.stages.find(item => item.id === exchange.stageId);
      if (!stage || exchange.ranges.some(range => !rangeOK(range.start, range.end) || range.start < stage.start || range.end > stage.end)) throw new InterviewError(400, '问答范围必须位于关联环节内');
    }
    next.flow = flow; delete next.review; delete next.practice;
  } else if (change.stage === 'review') {
    if (!old.flow) throw new InterviewError(400, '先完成面试全体把握和流程分析');
    if (!unique(change.data.improvements.map(item => item.id)) || change.data.improvements.some(item => item.exchangeIds.some(id => !old.flow!.exchanges.some(exchange => exchange.id === id)))) throw new InterviewError(400, '改善建议必须关联真实问答');
    next.review = change.data; delete next.practice;
  } else {
    if (!old.review || !old.flow) throw new InterviewError(400, '先完成复盘，再生成练习');
    for (const link of change.data) {
      const pack = await store.get('questionSets', link.questionSetId) as { questions?: { id: string }[]; jobId?: string } | null;
      if (!pack || !pack.questions?.some((item: { id: string }) => item.id === link.questionId) || (pack.jobId !== old.jobId && pack.jobId !== 'builtin:general')) throw new InterviewError(400, '练习题不存在或不属于这家公司／通用题组');
      if (link.exchangeIds.some(id => !old.flow!.exchanges.some(item => item.id === id)) || link.improvementIds.some(id => !old.review!.improvements.some(item => item.id === id))) throw new InterviewError(400, '练习必须关联原问答和改善建议');
    }
    if (!unique(change.data.map(item => `${item.questionSetId}/${item.questionId}`))) throw new InterviewError(400, '练习题关联重复');
    next.practice = change.data;
  }
  next.status = change.stage;
  if (preview) return { valid: true, next: interviewSummary(next), invalidates: change.stage === 'transcript' ? ['flow', 'review', 'practice'] : change.stage === 'flow' ? ['review', 'practice'] : change.stage === 'review' ? ['practice'] : [] };
  return commit(store, old, next);
}
export async function requestInterviewAnalysis(store: Store, id: string) {
  const interview = await getInterview(store, id);
  if (!interview.audio) throw new InterviewError(400, '请先完成录音上传');
  const task = { id: `interview:${id}:${interview.revision}`, kind: '面试复盘', interviewId: id, jobId: interview.jobId,
    status: '待处理', createdAt: new Date().toISOString(), instructions: '先整体把握完整录音和转写，再划分流程、复盘、生成练习。使用 career_get_interview_guide；原回答不得伪造为练习 attempts。' };
  const existing = await store.get('tasks', task.id);
  if (existing) return existing;
  const pending = (await store.list('tasks')).find(item => item.interviewId === id && item.status === '待处理');
  if (pending) return pending;
  await store.put('tasks', task);
  return task;
}
type Upload = { id: string; key: string; uploadId: string; size: number; contentType: string; fileName: string; parts: { partNumber: number; etag: string }[] };
export async function beginInterviewAudio(store: Store, bucket: R2Bucket, uid: string, input: unknown) {
  const data = parse(uploadSchema, input);
  const session = await getInterview(store, data.id);
  if (session.audio) {
    if (session.audio.size !== data.size || session.audio.contentType !== data.contentType || session.audio.fileName !== data.fileName) throw new InterviewError(409, '原录音已保存，不能替换');
    return { complete: true, partSize: INTERVIEW_PART_SIZE, parts: [] };
  }
  const old = await store.get('interviewUploads', data.id) as Upload | null;
  if (old) {
    if (old.size !== data.size || old.contentType !== data.contentType || old.fileName !== data.fileName) throw new InterviewError(409, '上传文件已变化');
    const parts: R2UploadedPart[] = [];
    for (let part = 1; part <= Math.ceil(old.size / INTERVIEW_PART_SIZE); part++) {
      const receipt = await store.get('interviewUploadParts', `${data.id}:${part}`);
      if (receipt) parts.push({ partNumber: Number(receipt.partNumber), etag: String(receipt.etag) });
    }
    return { complete: false, partSize: INTERVIEW_PART_SIZE, parts };
  }
  const objectKey = `${uid}/interviews/${data.id}/original`;
  const upload = await bucket.createMultipartUpload(objectKey, { httpMetadata: { contentType: data.contentType } });
  const value: Upload = { ...data, key: objectKey, uploadId: upload.uploadId, parts: [] };
  await store.put('interviewUploads', value);
  return { complete: false, partSize: INTERVIEW_PART_SIZE, parts: [] };
}
export async function uploadInterviewPart(store: Store, bucket: R2Bucket, id: string, part: number, request: Request) {
  const upload = await store.get('interviewUploads', id) as Upload | null;
  if (!upload || !Number.isInteger(part) || part < 1 || part > Math.ceil(upload.size / INTERVIEW_PART_SIZE)) throw new InterviewError(400, '上传分段不存在');
  const expected = Math.min(INTERVIEW_PART_SIZE, upload.size - (part - 1) * INTERVIEW_PART_SIZE);
  if (Number(request.headers.get('content-length')) > INTERVIEW_PART_SIZE) throw new InterviewError(413, '上传分段过大');
  const bytes = await readInterviewBytes(request, INTERVIEW_PART_SIZE);
  if (bytes.byteLength !== expected) throw new InterviewError(400, '上传分段大小不正确');
  const result = await bucket.resumeMultipartUpload(upload.key, upload.uploadId).uploadPart(part, bytes);
  // Each part has its own record, so parallel retries cannot erase another part's receipt.
  await store.put('interviewUploadParts', { id: `${id}:${part}`, ...result });
  return result;
}
export async function completeInterviewAudio(store: Store, bucket: R2Bucket, id: string) {
  const session = await getInterview(store, id);
  if (session.audio) return session;
  const upload = await store.get('interviewUploads', id) as Upload | null;
  if (!upload) throw new InterviewError(404, '上传尚未开始');
  const parts: R2UploadedPart[] = [];
  for (let n = 1; n <= Math.ceil(upload.size / INTERVIEW_PART_SIZE); n++) {
    const found = await store.get('interviewUploadParts', `${id}:${n}`);
    if (!found) throw new InterviewError(400, '录音分段尚未上传完整');
    parts.push({ partNumber: Number(found.partNumber), etag: String(found.etag) });
  }
  // A lost completion response is recoverable even if the R2 multipart has already closed.
  let object = await bucket.head(upload.key);
  if (!object) object = await bucket.resumeMultipartUpload(upload.key, upload.uploadId).complete(parts);
  if (object.size !== upload.size) throw new InterviewError(400, '录音文件大小不一致');
  return commit(store, session, { ...session, audio: { size: upload.size, contentType: upload.contentType, fileName: upload.fileName } });
}
export async function interviewAudioResponse(bucket: R2Bucket, objectKey: string, request: Request) {
  const meta = await bucket.head(objectKey);
  if (!meta) throw new InterviewError(404, '录音文件不存在');
  const range = request.headers.get('range');
  let start = 0, end = meta.size - 1;
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${meta.size}` } });
    if (!match[1]) start = Math.max(0, meta.size - Number(match[2]));
    else { start = Number(match[1]); if (match[2]) end = Math.min(end, Number(match[2])); }
    if (start > end || start >= meta.size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${meta.size}` } });
  }
  const object = await bucket.get(objectKey, { range: { offset: start, length: end - start + 1 } });
  if (!object) throw new InterviewError(404, '录音文件不存在');
  return new Response(object.body, { status: range ? 206 : 200, headers: {
    'content-type': meta.httpMetadata?.contentType || 'audio/mp4', 'content-length': String(end - start + 1),
    'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${meta.size}` } : {}),
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff',
  } });
}
