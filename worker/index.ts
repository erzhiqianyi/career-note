import { agentPracticeSchema, hasPracticeQuestions } from '../lib/practice-plan';
import { SpeechTranscriptionError, type SpeechAI, ensureSpeechSchema, startSpeechJob, getSpeechJob, speechJobStatus, recognizeSpeechChunk, completeSpeechJob, speechUsage, SPEECH_MAX_WAV_BYTES } from './speech-transcription';
import { answerFlowSchema, type AnswerFlow } from '../lib/answer-flow';
import { ensurePersonalizedSchema, listPersonalized, savePersonalized, deletePersonalized, publishResume, revokePublication, publicResumeResponse } from './personalized-resume';
import { ensureMaterialPublicationSchema, listMaterialPublications, publishMaterial, revokeMaterialPublication, publicMaterialResponse } from './material-publication';
import { ensureMaterialFilesSchema, materialFileMeta, materialFileKey, saveMaterialFile, deleteMaterialFile, type MaterialFileKind } from './material-files';
import { ensureStateRevision, ensureStateRevisionTriggers, stateRevision } from './state-revision';
import { ensureResumeSchema, readResume, writeResume, deleteResumeDocument, resumeHistory, resumeVersion, resumeOverview, listResume, resumeDetails, resumeDocumentChunk } from './resume';
import { ensureArticleSchema, listArticles, getArticle, saveArticle, articleHtml, articleSitemap } from './articles';
import { createMcpAppServer, AppServerError, type McpAppServer, type Origins, type ToolContext } from '@ninomae/mcp-app-server';
import { inspectorResponse } from '@ninomae/mcp-app-server/inspector';
import { sqlStore } from '@ninomae/mcp-app-server/sql';
import { createCareerTools, createCareerPrompts, CAREER_SCOPES, CAREER_CONTRACT } from './agent-tools';
import { listReadings, saveReadings, builtinJapanese, ReadingsError } from './readings';
import { ensureActivitySchema, logActivity, listActivity, summarizeToolResult } from './activity';
import { verifyFirebaseToken } from './firebase-auth';
import { deleteReferenceSpeechForPacks, referenceSpeechResponse, ReferenceSpeechError } from './reference-speech';
import { mergePlatforms, validatePlatform, type JobPlatform } from '../lib/job-platforms';
import { BANK_JOB_ID, findBuiltinQuestionSet, isBuiltinQuestionSet } from '../lib/interview-bank';
import type { ExportedHandler } from '@cloudflare/workers-types';
import type { Material } from '../lib/career';
import { parseEventHeader, withEventHeader, type EventHeader } from '../lib/calendar-events';
import { applicationBodyIssues, type ApplicationKind, type MaterialReviewItem } from '../lib/material-print-content';
import { normalizeCompanyProfile } from '../lib/company-profile';
import { plainJapanese } from '../lib/japanese-readings';
import { preferenceGroups } from '../lib/job-preferences';
import { jobStatuses, type JobStatus } from '../lib/job-status';
import { InterviewError, listInterviews, getInterview, getInterviewVersion, createInterview, updateInterview, requestInterviewAnalysis,
  importInterviewSource, beginInterviewAudio, uploadInterviewPart, completeInterviewAudio, interviewAudioResponse, readInterviewBytes } from './interviews';
import { interviewSummary } from '../lib/interview-session';
import { PracticePlanError, createPracticePlan, editPracticePlan, getPracticePlan, listPracticePlans, practicePlanDetail,
  requestPracticePlanTask, savePracticePlan, savePracticePlanReview, setPracticePlanStatus, validatePracticeContext, type PracticePlanStore } from './practice-plans';

type JobPriority = '高' | '普通' | '低';
type McpScope = 'career:read' | 'career:write' | 'agent:write' | 'admin';
type FirebaseClaim = Record<string, unknown>;
type TaskKind = '每日分析' | '公司准备' | '职位研究' | '回答点评';
type MaterialKind = '履歴書' | '職務経歴書' | '志望動機' | '面试准备' | '公司研究';

type Env = {
  CAREER_DB: D1Database;
  AI?: SpeechAI;
  CAREER_AUTH_MODE?: string;
  CAREER_ADMIN_UIDS?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_APP_ID?: string;
  MCP_TOKEN_TTL_DAYS?: string;
  CAREER_PUBLIC_ORIGIN?: string;
  CAREER_WEB_ORIGIN?: string;
  CAREER_OAUTH_REFRESH_DAYS?: string;
  CAREER_CORS_ORIGINS?: string;
  /** Serve the dev inspector at /api/career/mcp/inspector in on/strict mode too (off mode always has it; it is local only). */
  CAREER_INSPECTOR?: string;
  /** Private binary files in R2: answer recordings, saved PDFs, and resume photos. */
  CAREER_AUDIO?: R2Bucket;
  AZURE_SPEECH_REGION?: string;
  AZURE_SPEECH_KEY?: string;
};

type AuthContext = {
  uid: string;
  admin: boolean;
  mode: 'off' | 'on' | 'strict';
  claims: FirebaseClaim;
  tokenType: 'firebase' | 'mcp';
  scopes: McpScope[];
};

class AppError extends Error {
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

const STATUSES: readonly JobStatus[] = jobStatuses;
const PRIORITIES: JobPriority[] = ['高', '普通', '低'];
// Research verdict from the company-search skill; empty means not yet assessed.
const MATCH_LEVELS = ['优先准备', '先确认条件', '暂不匹配'];
const SOURCE_CHANNELS = ['主动发现', 'AI 搜索', 'Agent 推荐'];
const MATERIAL_KINDS: MaterialKind[] = ['履歴書', '職務経歴書', '志望動機', '面试准备', '公司研究'];
const REVIEW_FIELDS = [
  'summary',
  'strengths',
  'improvements',
  'japaneseNotes',
  'factChecks',
  'revisedAnswer',
  'followUps',
  'nextPractice',
  'sourceNotes',
] as const;


function now() {
  return new Date().toISOString();
}

function today(): string {
  const jst = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
  });
  return jst.format(new Date());
}

function ensureMode(env: Env): 'off' | 'on' | 'strict' {
  const mode = (env.CAREER_AUTH_MODE || (env.FIREBASE_PROJECT_ID ? 'strict' : 'off')).toLowerCase();
  if (!['off', 'on', 'strict'].includes(mode)) throw new AppError(503, 'Invalid CAREER_AUTH_MODE');
  return mode === 'on' || mode === 'strict' ? (mode as 'on' | 'strict') : 'off';
}

function adminUidSet(env: Env): Set<string> {
  const raw = env.CAREER_ADMIN_UIDS || '';
  return new Set(raw.split(',').map((value) => value.trim()).filter(Boolean));
}

function bool(value: unknown): boolean {
  return value === true;
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  return '';
}

function validateString(
  value: unknown,
  field: string,
  options?: { required?: boolean; max?: number },
) {
  const text = asString(value);
  if (!text && options?.required) throw new AppError(400, `字段不正确：${field}`);
  if (options?.max !== undefined && text.length > options.max)
    throw new AppError(400, `字段过长：${field}`);
  return text;
}

/** Items the applicant must fill in, confirm or reword, kept beside the formal body instead of inside it. */
function validateReviewItems(value: unknown): MaterialReviewItem[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 50) throw new AppError(400, 'reviewItems 必须是最多 50 条的数组');
  return value.map((item, index) => {
    if (typeof item !== 'object' || item === null) throw new AppError(400, `reviewItems[${index}] 必须是对象`);
    const obj = item as Record<string, unknown>;
    return {
      field: validateString(obj.field, `reviewItems[${index}].field`, { required: true, max: 60 }),
      note: validateString(obj.note, `reviewItems[${index}].note`, { required: true, max: 500 }),
    };
  });
}

function validateDate(value: string, field: string) {
  if (!value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(400, `日期不正确：${field}`);
  return value;
}

function validateDay(value: unknown, field: string) {
  const text = validateString(value, field, { max: 10 });
  if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new AppError(400, `日期不正确：${field}`);
  return validateDate(text, field);
}

function ensureDb(env: Env): D1Database {
  if (!env.CAREER_DB) throw new AppError(500, 'CAREER_DB not bound');
  return env.CAREER_DB;
}

async function ensureSchema(db: D1Database, gateway: McpAppServer): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (kind,id));`,
  );
  await db.exec(
    `CREATE INDEX IF NOT EXISTS records_missing_company_number ON records(kind) WHERE json_type(body, '$.companyNumber') IS NULL OR json_type(body, '$.companyNumber') = 'null';`,
  );
  await ensureStateRevision(db);
  await db.exec(`CREATE TABLE IF NOT EXISTS question_numbers (workspace TEXT NOT NULL, number INTEGER NOT NULL, pack_id TEXT NOT NULL, question_id TEXT NOT NULL, PRIMARY KEY (workspace, number), UNIQUE (workspace, pack_id, question_id));`);
  await db.exec(`CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  await ensureStateRevisionTriggers(db, ['records', 'question_numbers', 'meta']);
  // Who each MCP grant belongs to, in human terms: refreshed at every consent so career_get_connection_info can name the account.
  await db.exec(`CREATE TABLE IF NOT EXISTS mcp_owners (uid TEXT PRIMARY KEY, email TEXT, display_name TEXT, provider TEXT, updated_at TEXT NOT NULL);`);
  await gateway.ensureSchema();
  await ensureActivitySchema(db);
}

const STATE_CACHE_LIMIT = 8;
const stateCache = new Map<string, { revision: string; day: string; body: string }>();
async function cachedState(db: Workspace, uid: string, resumeSummary: boolean): Promise<string> {
  const key = JSON.stringify([db.namespace, uid, resumeSummary]);
  const revision = await stateRevision(db.connection);
  const day = today();
  const hit = stateCache.get(key);
  if (hit && revision && hit.revision === revision && hit.day === day) return hit.body;
  const body = JSON.stringify(await state(db, uid, resumeSummary));
  // state() may itself write (first company/question numbers); cache only a snapshot nothing changed under.
  if (revision && (await stateRevision(db.connection)) === revision) {
    stateCache.delete(key);
    stateCache.set(key, { revision, day, body });
    while (stateCache.size > STATE_CACHE_LIMIT) stateCache.delete(stateCache.keys().next().value as string);
  }
  return body;
}

// Request-local scope derived only from the verified identity, never from input.
// Legacy local data keeps its original keys and is not assigned to a new login.
type Workspace = { connection: D1Database; namespace: string };
function workspaceKey(db: Workspace, key: string) {
  return db.namespace ? JSON.stringify([db.namespace, key]) : key;
}

async function records(db: Workspace, kind: string): Promise<Record<string, unknown>[]> {
  const result = await db.connection
    .prepare('SELECT body FROM records WHERE kind = ?1 ORDER BY rowid DESC')
    .bind(workspaceKey(db, kind))
    .all<{ body: string }>();
  return (result.results || []).map((row) => JSON.parse(row.body));
}

async function getRecord(db: Workspace, kind: string, id: string) {
  const result = await db.connection
    .prepare('SELECT body FROM records WHERE kind=?1 AND id=?2')
    .bind(workspaceKey(db, kind), id)
    .first<{ body: string }>();
  return result ? JSON.parse(result.body) : null;
}

async function putRecord(db: Workspace, kind: string, item: Record<string, unknown>) {
  const id = String(item.id || '');
  if (!id) throw new AppError(400, '缺少 id');
  await db.connection
    .prepare(
      'INSERT INTO records(kind,id,body) VALUES (?1, ?2, ?3) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body',
    )
    .bind(workspaceKey(db, kind), id, JSON.stringify(item))
    .run();
}

function practicePlanStore(db: Workspace): PracticePlanStore {
  return { ...db, get: (kind, id) => getRecord(db, kind, id), put: (kind, value) => putRecord(db, kind, value), list: kind => records(db, kind) };
}

// The sequence is scoped to the verified user's workspace. Allocation is one atomic
// SQLite statement, so concurrent imports cannot receive the same number.
async function nextCompanyNumber(db: Workspace): Promise<number> {
  const kind = workspaceKey(db, 'jobs');
  const row = await db.connection.prepare(`
    INSERT INTO meta(id, body)
    VALUES (?1, CAST(COALESCE((SELECT MAX(CAST(json_extract(body, '$.companyNumber') AS INTEGER)) FROM records WHERE kind = ?2), 0) + 1 AS TEXT))
    ON CONFLICT(id) DO UPDATE SET body = CAST(
      MAX(CAST(meta.body AS INTEGER), COALESCE((SELECT MAX(CAST(json_extract(body, '$.companyNumber') AS INTEGER)) FROM records WHERE kind = ?2), 0)) + 1 AS TEXT
    )
    RETURNING body
  `).bind(workspaceKey(db, 'companyNumberSequence'), kind).first<{ body: string }>();
  if (!row || !Number.isSafeInteger(Number(row.body))) throw new AppError(500, '无法分配公司编号');
  return Number(row.body);
}

// The WHERE clause must match records_missing_company_number exactly so SQLite answers it from that
// partial index (normally empty) instead of reading every job row on every state request.
async function ensureCompanyNumbers(db: Workspace): Promise<void> {
  const kind = workspaceKey(db, 'jobs');
  const missing = await db.connection.prepare(`
    SELECT id FROM records WHERE kind = ?1
      AND (json_type(body, '$.companyNumber') IS NULL OR json_type(body, '$.companyNumber') = 'null')
    ORDER BY rowid ASC
  `).bind(kind).all<{ id: string }>();
  for (const row of missing.results || []) {
    const number = await nextCompanyNumber(db);
    await db.connection.prepare(`
      UPDATE records SET body = json_set(body, '$.companyNumber', ?3)
      WHERE kind = ?1 AND id = ?2
        AND (json_type(body, '$.companyNumber') IS NULL OR json_type(body, '$.companyNumber') = 'null')
    `).bind(kind, row.id, number).run();
  }
}

function defaultProfile() {
  return {
    revision: 0,
    summary: '',
    skills: '',
    experience: '',
    targetRoles: '',
    japanese: '',
    conditions: '',
    sourcePath: '',
    // Personal target for landing an offer (YYYY-MM-DD); shown on the home page, optional.
    targetDate: '',
    updatedAt: '',
  };
}

async function getMeta(db: Workspace) {
  const row = await db.connection
    .prepare("SELECT body FROM meta WHERE id=?1")
    .bind(workspaceKey(db, "profile"))
    .first<{ body: string }>();
  if (row?.body) return JSON.parse(row.body);
  return null;
}

async function putMeta(db: Workspace, id: string, body: Record<string, unknown>) {
  await db.connection
    .prepare(
      'INSERT INTO meta VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
    )
    .bind(workspaceKey(db, id), JSON.stringify(body))
    .run();
}

async function getProfile(db: Workspace) {
  return { ...defaultProfile(), ...((await getMeta(db)) || {}) };
}

// Numbers live independently of editable content and are never recycled after deletion.
async function numberedQuestionSets(db: Workspace) {
  const packs = await records(db, 'questionSets');
  const workspace = workspaceKey(db, 'questionNumbers');
  const saved = await db.connection.prepare('SELECT number, pack_id, question_id FROM question_numbers WHERE workspace=?1').bind(workspace).all<{number: number; pack_id: string; question_id: string}>();
  const numbers = new Map((saved.results || []).map(row => [JSON.stringify([row.pack_id, row.question_id]), row.number]));
  for (const pack of packs) {
    const questions = (pack.questions || []) as Record<string, unknown>[];
    for (const question of questions) {
      const key = JSON.stringify([pack.id, question.id]);
      let number = numbers.get(key);
      if (number === undefined) {
        // Atomic allocation and unique identity also handle concurrent first reads.
        const row = await db.connection.prepare(`
          INSERT INTO question_numbers(workspace, number, pack_id, question_id)
          SELECT ?1, COALESCE(MAX(number), 0) + 1, ?2, ?3 FROM question_numbers WHERE workspace=?1
          ON CONFLICT(workspace, pack_id, question_id) DO UPDATE SET question_id=excluded.question_id
          RETURNING number
        `).bind(workspace, String(pack.id), String(question.id)).first<{number: number}>();
        if (!row) throw new AppError(500, '无法分配问题编号');
        number = row.number;
        numbers.set(key, number);
      }
      question.questionNumber = number;
    }
  }
  return packs;
}

async function state(db: Workspace, uid = 'local', resumeSummary = false) {
  await ensureCompanyNumbers(db);
  const profile = await getProfile(db);
  return {
    platforms: mergePlatforms(await records(db, 'platforms:' + uid) as JobPlatform[]),
    jobs: await records(db, 'jobs'),
    profile,
    resume: await readResume(db.connection, db.namespace, resumeSummary),
    materials: await records(db, 'materials'),
    reports: await records(db, 'reports'),
    tasks: await records(db, 'tasks'),
    today: today(),
    questionSets: await numberedQuestionSets(db),
    attempts: await records(db, 'attempts'),
    reviews: await records(db, 'reviews'),
    interviews: (await records(db, 'interviews')).map(item => interviewSummary(item as Parameters<typeof interviewSummary>[0])),
    practicePlans: await records(db, 'practicePlans'),
    practicePlanReviews: await records(db, 'practicePlanReviews'),
    // Study furigana for the app; agents read it through career_get_readings instead of every context call.
    ...(resumeSummary ? {} : { readings: await listReadings(db.connection, workspaceKey(db, 'readings')) }),
  };
}

function validateTaskKind(kind: string): kind is TaskKind {
  return ['每日分析', '公司准备', '职位研究', '回答点评'].includes(kind);
}

async function saveProfile(db: Workspace, data: Record<string, unknown>) {
  const old = await getProfile(db);
  if (data.revision !== old.revision) throw new AppError(400, '资料已更新，请刷新后重新编辑');
  const result = {
    summary: validateString(data.summary, 'summary', { max: 100000 }),
    skills: validateString(data.skills, 'skills', { max: 100000 }),
    experience: validateString(data.experience, 'experience', { max: 100000 }),
    targetRoles: validateString(data.targetRoles, 'targetRoles', { max: 100000 }),
    japanese: validateString(data.japanese, 'japanese', { max: 100000 }),
    conditions: validateString(data.conditions, 'conditions', { max: 100000 }),
    sourcePath: validateString(data.sourcePath, 'sourcePath', { max: 100000 }),
    // Absent (older clients, agents that only know the text fields) keeps the current value.
    targetDate: data.targetDate === undefined ? old.targetDate || '' : validateDay(data.targetDate, 'targetDate'),
    revision: Number(old.revision) + 1,
    updatedAt: now(),
  };
  await putMeta(db, 'profile', result);
  return result;
}

function validateResearch(data: Record<string, unknown>) {
  const result: Record<string, string> = {
    id: validateString(data.id, 'id', { required: false, max: 120 }),
    company: validateString(data.company, 'company', { required: true, max: 1000 }),
    companyReading: validateString(data.companyReading, 'companyReading', { max: 1000 }),
    role: validateString(data.role, 'role', { required: true, max: 1000 }),
    url: validateString(data.url, 'url', { max: 2000 }),
    description: validateString(data.description, 'description', { max: 100000 }),
    requirements: validateString(data.requirements, 'requirements', { max: 100000 }),
    business: validateString(data.business, 'business', { max: 100000 }),
    employeeCount: validateString(data.employeeCount, 'employeeCount', { max: 1000 }),
    companyType: validateString(data.companyType, 'companyType', { max: 1000 }),
    employmentType: validateString(data.employmentType, 'employmentType', { max: 1000 }),
    japanese: validateString(data.japanese, 'japanese', { max: 100000 }),
    foreigner: validateString(data.foreigner, 'foreigner', { max: 100000 }),
    visa: validateString(data.visa, 'visa', { max: 100000 }),
    salary: validateString(data.salary, 'salary', { max: 100000 }),
    location: validateString(data.location, 'location', { max: 1000 }),
    sourceDate: validateString(data.sourceDate, 'sourceDate', { max: 64 }),
    sourcePlatform: validateString(data.sourcePlatform, 'sourcePlatform', { max: 120 }),
    sourceChannel: validateString(data.sourceChannel, 'sourceChannel', { max: 30 }),
    matchLevel: validateString(data.matchLevel, 'matchLevel', { max: 20 }),
    matchNotes: validateString(data.matchNotes, 'matchNotes', { max: 100000 }),
    unknowns: validateString(data.unknowns, 'unknowns', { max: 100000 }),
  };
  if (result.url) {
    try {
      const parsed = new URL(result.url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('invalid url');
      }
    } catch {
      throw new AppError(400, '招聘来源必须是完整的 http 或 https 链接');
    }
  }
  if (result.sourceDate) validateDate(result.sourceDate, 'sourceDate');
  if (result.matchLevel && !MATCH_LEVELS.includes(result.matchLevel)) throw new AppError(400, '无效的匹配评价');
  if (result.sourceChannel && !SOURCE_CHANNELS.includes(result.sourceChannel)) throw new AppError(400, '无效的发现方式');
  return result;
}

type StatusEntry = { status: string; at: string };
/**
 * Status history after recording `status`. A new status appends an entry dated `statusDate` (YYYY-MM-DD, the day
 * it actually changed) or now; repeating the current status with a different date corrects the latest entry.
 */
function statusHistory(history: unknown, previous: unknown, status: string, statusDate: string): StatusEntry[] {
  const list = [...((history as StatusEntry[]) || [])];
  const at = statusDate ? statusDate + 'T00:00:00.000Z' : now();
  const last = list[list.length - 1];
  if (previous !== status) list.push({ status, at });
  else if (statusDate && last?.status === status && last.at.slice(0, 10) !== statusDate) list[list.length - 1] = { ...last, at };
  return list;
}
function validateStatusDate(value: unknown) {
  const date = validateDay(value, 'statusDate');
  if (date && date > today()) throw new AppError(400, '状态更新日期不能晚于今天');
  return date;
}

async function saveJob(db: Workspace, data: Record<string, unknown>, researchOnly = false) {
  await ensureCompanyNumbers(db);
  const key = data.id ? validateString(data.id, 'id', { required: true, max: 120 }) : toId();
  const old = await getRecord(db, 'jobs', key);
  if (old && !researchOnly && data.revision !== old.revision) {
    throw new AppError(400, '职位已更新，请刷新后重新编辑');
  }

  const base: Record<string, unknown> = {
    ...((old || {}) as Record<string, unknown>),
    ...validateResearch(data),
    id: key,
    companyNumber: old?.companyNumber || await nextCompanyNumber(db),
  };
  // Older import clients do not know these fields; their research refresh must not erase provenance.
  if (old && data.sourcePlatform === undefined) base.sourcePlatform = old.sourcePlatform || '';
  if (old && data.sourceChannel === undefined) base.sourceChannel = old.sourceChannel || '';
  for (const field of ['companyReading', 'employeeCount', 'companyType', 'employmentType'] as const) {
    if (old && data[field] === undefined) base[field] = old[field] || '';
  }
  // The company board is optional: omitted keeps the stored one, null removes it.
  if (data.companyProfile === undefined) base.companyProfile = old?.companyProfile ?? null;
  else {
    try { base.companyProfile = normalizeCompanyProfile(data.companyProfile); }
    catch (error) { throw new AppError(400, error instanceof Error ? error.message : '企业看板数据无效'); }
  }

  if (!researchOnly) {
    const status = validateString(data.status, 'status', { required: true, max: 20 }) as JobStatus;
    const priority = validateString(data.priority, 'priority', { required: true, max: 20 }) as JobPriority;
    const nextAction = validateString(data.nextAction, 'nextAction', { max: 100000 });
    const nextDate = validateString(data.nextDate, 'nextDate', { max: 20 });
    const notes = validateString(data.notes, 'notes', { max: 100000 });
    const rating = data.rating === undefined ? (old?.rating ?? 0) : Number(data.rating);

    if (!STATUSES.includes(status as JobStatus)) throw new AppError(400, '无效的投递状态');
    if (!PRIORITIES.includes(priority as JobPriority)) throw new AppError(400, '无效的优先级');
    if (nextDate) validateDate(nextDate, 'nextDate');
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) throw new AppError(400, '评分必须是 0 到 5 星');

    base.status = status;
    base.priority = priority;
    base.rating = rating;
    const preferenceGroup = data.preferenceGroup === undefined ? (old?.preferenceGroup ?? '') : data.preferenceGroup;
    if (typeof preferenceGroup !== 'string' || (preferenceGroup !== '' && !preferenceGroups.includes(preferenceGroup as typeof preferenceGroups[number]))) {
      throw new AppError(400, '无效的志望群');
    }
    base.preferenceGroup = preferenceGroup;
    base.nextAction = nextAction;
    base.nextDate = nextDate;
    base.notes = notes;
    base.history = statusHistory(old?.history, old?.status, status, validateStatusDate(data.statusDate));
    base.revision = (old ? Number(old.revision) : 0) + 1;
    base.updatedAt = now();
  }

  if (researchOnly && old) {
    base.history = old.history || [];
    base.status = old.status || '关注中';
    base.priority = old.priority || '普通';
    base.rating = old.rating || 0;
    base.nextAction = old.nextAction || '';
    base.nextDate = old.nextDate || '';
    base.notes = old.notes || '';
    base.revision = Number(old.revision || 0);
    base.updatedAt = old.updatedAt || now();
  }

  if (researchOnly && !old) {
    base.status = '关注中';
    base.priority = '普通';
    base.rating = 0;
    base.nextAction = '';
    base.nextDate = '';
    base.notes = '';
    base.history = [{ status: '关注中', at: now() }];
    base.revision = 1;
    base.updatedAt = now();
  }

  if (base.status === undefined || base.status === '') base.status = '关注中';
  if (base.status && !Array.isArray(base.history)) base.history = [];
  if (!base.updatedAt) base.updatedAt = now();

  await putRecord(db, 'jobs', base);
  return base;
}

function validateApplicationDoc(value: unknown) {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).some(key => !['motivation', 'wishes', 'email'].includes(key))) {
    throw new AppError(400, 'applicationDoc 只接受 motivation、wishes 和 email');
  }
  const doc = value as Record<string, unknown>;
  return {
    motivation: validateString(doc.motivation, 'motivation', { max: 5000 }),
    wishes: validateString(doc.wishes, 'wishes', { max: 3000 }),
    email: validateString(doc.email, 'email', { max: 200 }),
  };
}

async function updateJobPersonalField(db: Workspace, data: Record<string, unknown>, field: 'rating' | 'preferenceGroup' | 'applicationDoc') {
  if (Array.isArray(data) || Object.keys(data).some(key => !['id', 'revision', field].includes(key))) {
    throw new AppError(400, `更新只接受 id、revision 和 ${field}`);
  }
  const id = validateString(data.id, 'id', { required: true, max: 120 });
  const revision = data.revision;
  const value = data[field];
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) {
    throw new AppError(400, 'revision 必须是正整数');
  }
  if (field === 'rating' && (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 5)) {
    throw new AppError(400, '评分必须是 0 到 5 星');
  }
  if (field === 'preferenceGroup' && (typeof value !== 'string' || (value !== '' && !preferenceGroups.includes(value as typeof preferenceGroups[number])))) {
    throw new AppError(400, '志望群必须是第一志望群、第二志望群、第三志望群或空字符串');
  }
  const stored = field === 'applicationDoc' ? JSON.stringify(validateApplicationDoc(value)) : value;
  // Patch the stored JSON in one conditional statement, preserving concurrent research writes.
  const saved = await db.connection.prepare(
    `UPDATE records SET body=json_set(body, ?3, ${field === 'applicationDoc' ? 'json(?4)' : '?4'}, '$.revision', ?5, '$.updatedAt', ?6) WHERE kind=?1 AND id=?2 AND json_extract(body, '$.revision')=?7 RETURNING body`,
  ).bind(workspaceKey(db, 'jobs'), id, '$.' + field, stored as string | number, revision + 1, now(), revision).first<{ body: string }>();
  if (!saved) {
    if (!(await getRecord(db, 'jobs', id))) throw new AppError(404, '职位不存在');
    throw new AppError(409, '职位已更新，请读取最新 revision 后重试');
  }
  return JSON.parse(saved.body);
}

/**
 * Changes only the application status, appending to history as the job editor does. Follow-ups, notes,
 * priority, rating and research are left untouched, so an agent can record a status the user reports.
 */
async function updateJobStatus(db: Workspace, data: Record<string, unknown>) {
  if (Array.isArray(data) || Object.keys(data).some(key => !['id', 'revision', 'status', 'statusDate'].includes(key))) {
    throw new AppError(400, '更新只接受 id、revision、status 和 statusDate');
  }
  const id = validateString(data.id, 'id', { required: true, max: 120 });
  const revision = data.revision;
  const status = data.status;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 1) {
    throw new AppError(400, 'revision 必须是正整数');
  }
  if (typeof status !== 'string' || !STATUSES.includes(status as JobStatus)) throw new AppError(400, '无效的投递状态');
  const statusDate = validateStatusDate(data.statusDate);
  const job = await getRecord(db, 'jobs', id);
  if (!job) throw new AppError(404, '职位不存在');
  if (job.revision !== revision) throw new AppError(409, '职位已更新，请读取最新 revision 后重试');
  const history = statusHistory(job.history, job.status, status, statusDate);
  if (JSON.stringify(history) === JSON.stringify(job.history || [])) return job;
  const at = now();
  const saved = await db.connection.prepare(
    "UPDATE records SET body=json_set(body, '$.status', ?3, '$.history', json(?4), '$.revision', ?5, '$.updatedAt', ?6) WHERE kind=?1 AND id=?2 AND json_extract(body, '$.revision')=?7 RETURNING body",
  ).bind(workspaceKey(db, 'jobs'), id, status, JSON.stringify(history), revision + 1, at, revision).first<{ body: string }>();
  if (!saved) throw new AppError(409, '职位已更新，请读取最新 revision 后重试');
  return JSON.parse(saved.body);
}

async function deleteJobs(db: Workspace, env: Env, uid: string, data: Record<string, unknown>) {
  const targets = data.jobs;
  if (!Array.isArray(targets) || !targets.length || targets.length > 200)
    throw new AppError(400, '请选择 1–200 个职位');
  const selected = new Map<string, number>();
  for (const item of targets) {
    if (!item || typeof item !== 'object') throw new AppError(400, '职位参数不正确');
    const entry = item as Record<string, unknown>;
    const id = validateString(entry.id, 'id', { required: true, max: 120 });
    const revision = Number(entry.revision);
    if (selected.has(id) || !Number.isSafeInteger(revision) || revision < 1)
      throw new AppError(400, '职位参数不正确');
    selected.set(id, revision);
  }
  for (const [id, revision] of selected) {
    const job = await getRecord(db, 'jobs', id);
    if (!job || job.revision !== revision) throw new AppError(409, '职位已更新，请刷新后重新选择');
  }
  const ids = new Set(selected.keys());
  const materials = (await records(db, 'materials')).filter(item => ids.has(String(item.jobId)));
  const packs = (await records(db, 'questionSets')).filter(item => ids.has(String(item.jobId)));
  const packIds = new Set(packs.map(item => String(item.id)));
  const attempts = (await records(db, 'attempts')).filter(item => ids.has(String(item.jobId)) || packIds.has(String(item.questionSetId)));
  const attemptIds = new Set(attempts.map(item => String(item.id)));
  const reviews = (await records(db, 'reviews')).filter(item => ids.has(String(item.jobId)) || attemptIds.has(String(item.attemptId)));
  const tasks = (await records(db, 'tasks')).filter(item => ids.has(String(item.jobId)) || attemptIds.has(String(item.attemptId)));
  const audioKeys = new Set(attempts.filter(item => item.audio).map(item => audioKey(uid, String(item.id))));
  const links = (await records(audioLinks(db.connection), 'audioLinks')).filter(item => audioKeys.has(String(item.key)));
  const statements = [
    ...[...selected].map(([id, revision]) => db.connection.prepare("DELETE FROM records WHERE kind=?1 AND id=?2 AND json_extract(body, '$.revision')=?3").bind(workspaceKey(db, 'jobs'), id, revision)),
    ...([['materials', materials], ['questionSets', packs], ['attempts', attempts], ['reviews', reviews], ['tasks', tasks]] as const)
      .flatMap(([kind, items]) => items.map(item => db.connection.prepare('DELETE FROM records WHERE kind=?1 AND id=?2').bind(workspaceKey(db, kind), item.id))),
    ...links.map(item => db.connection.prepare('DELETE FROM records WHERE kind=?1 AND id=?2').bind(workspaceKey(audioLinks(db.connection), 'audioLinks'), item.id)),
    ...materials.map(item => db.connection.prepare("UPDATE material_publications SET revoked_at=?1 WHERE owner=?2 AND json_extract(body, '$.materialId')=?3 AND revoked_at=''").bind(now(), db.namespace, item.id)),
    ...materials.map(item => db.connection.prepare("DELETE FROM material_files WHERE owner=? AND material_id=? AND kind='pdf'").bind(db.namespace, item.id)),
  ];
  const results = await db.connection.batch(statements);
  // D1 counts trigger writes (state_revision) in meta.changes, so test for "deleted nothing" rather than exactly 1.
  if (results.slice(0, selected.size).some(result => !result.meta.changes))
    throw new AppError(409, '职位已更新，请刷新后重新选择');
  if (env.CAREER_AUDIO) {
    await Promise.allSettled([
      ...[...audioKeys, ...materials.map(item => materialFileKey(db.namespace, 'pdf', String(item.id)))]
        .map(key => env.CAREER_AUDIO!.delete(key)),
      deleteReferenceSpeechForPacks(env.CAREER_AUDIO, uid, [...packIds]),
    ]);
  }
  return { deleted: selected.size };
}

// Only sets with nothing left to practice and no saved answers qualify, so real work cannot be lost here.
async function deleteClearedQuestionSets(db: Workspace, env: Env, uid: string) {
  const answered = new Set((await records(db, 'attempts')).map(item => String(item.questionSetId)));
  const ids = (await records(db, 'questionSets'))
    .filter(pack => !hasPracticeQuestions(pack as unknown as { questions: { category?: string }[] }) && !answered.has(String(pack.id)))
    .map(pack => String(pack.id));
  if (ids.length) {
    await db.connection.batch(ids.map(id => db.connection.prepare('DELETE FROM records WHERE kind=?1 AND id=?2').bind(workspaceKey(db, 'questionSets'), id)));
    if (env.CAREER_AUDIO) await deleteReferenceSpeechForPacks(env.CAREER_AUDIO, uid, ids).catch(() => undefined);
  }
  return { deleted: ids.length };
}

async function requestTask(db: Workspace, data: Record<string, unknown>) {
  const kind = validateString(data.kind, 'kind', { required: true, max: 20 });
  if (!validateTaskKind(kind)) throw new AppError(400, '任务类型不正确');
  const jobId = validateString(data.jobId, 'jobId', { max: 120 });
  const attemptId = validateString(data.attemptId, 'attemptId', { max: 120 });

  if (kind === '公司准备' && !jobId) throw new AppError(400, '请选择现有职位');
  if (kind === '公司准备') {
    const exists = await getRecord(db, 'jobs', jobId);
    if (!exists) throw new AppError(400, '请选择现有职位');
  }
  if (kind === '回答点评') {
    if (!attemptId) throw new AppError(400, '回答点评需要 attemptId');
    const attempt = await getRecord(db, 'attempts', attemptId);
    if (!attempt || attempt.jobId !== jobId)
      throw new AppError(400, '请选择该公司的已保存回答版本');
  } else if (attemptId) {
    throw new AppError(400, '仅回答点评任务可指定回答版本');
  }

  const allTasks = await records(db, 'tasks');
  const existing = allTasks.find(
    (task) =>
      task.status === '待处理' &&
      task.kind === kind &&
      task.jobId === jobId &&
      String(task.attemptId || '') === attemptId,
  ) as Record<string, unknown> | undefined;

  if (existing) return existing;

  const task = {
    id: toId(),
    kind,
    jobId,
    status: '待处理',
    attemptId,
    createdAt: now(),
    instructions: validateString(data.instructions, 'instructions', { max: 100000 }) || (kind === '公司准备'
      ? '默认准备公司研究、履歴書、職務経歴書、志望動機四类申请资料；复用已确认母版，按岗位调整重点并列出待确认项。公司专项面试资料和题组等收到面试安排或本人明确要求后再准备；当前沿用已有个人通用练习。按本次任务阶段验收并读回，不自动投递或改变状态。'
      : ''),
  };
  await putRecord(db, 'tasks', task);
  return task;
}

type ParsedQuestion = {
  id: string;
  title: string;
  questionJa: string;
  meaning: string;
  why: string;
  outline: string;
  answerFlow?: AnswerFlow;
  sampleAnswer?: string;
  followUps: string;
  category: string;
  targetSeconds: number;
  simpleQuestionJa?: string;
  vocabulary?: string;
};

function parseQuestionSetQuestions(questions: unknown[]) {
  const parsed: ParsedQuestion[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(questions) || questions.length < 1 || questions.length > 40)
    throw new AppError(400, '题组需要 1–40 个问题');

  for (const question of questions) {
    if (typeof question !== 'object' || question === null) throw new AppError(400, '问题必须是对象');
    const q = question as Record<string, unknown>;
    const flow = q.answerFlow === undefined ? undefined : answerFlowSchema.safeParse(q.answerFlow);
    if (flow && !flow.success) throw new AppError(400, 'answerFlow: ' + flow.error.issues.map(issue => issue.message).join('; '));
    const node: ParsedQuestion = {
      ...(flow?.success ? { answerFlow: flow.data } : {}),
      id: validateString(q.id, 'id', { required: true, max: 120 }),
      title: validateString(q.title, 'title', { required: true, max: 200 }),
      questionJa: validateString(q.questionJa, 'questionJa', { required: true, max: 5000 }),
      meaning: validateString(q.meaning, 'meaning', { required: true, max: 5000 }),
      why: validateString(q.why, 'why', { required: true, max: 5000 }),
      outline: validateString(q.outline, 'outline', { required: true, max: 10000 }),
      sampleAnswer: validateString(q.sampleAnswer, 'sampleAnswer', { max: 30000 }),
      followUps: validateString(q.followUps, 'followUps', { required: true, max: 5000 }),
      category: validateString(q.category, 'category', { required: true, max: 1000 }),
      targetSeconds: Number(q.targetSeconds),
      simpleQuestionJa: validateString(q.simpleQuestionJa, 'simpleQuestionJa', { max: 5000 }),
      vocabulary: validateString(q.vocabulary, 'vocabulary', { max: 5000 }),
    };

    if (
      !Number.isInteger(node.targetSeconds) ||
      node.targetSeconds < 30 ||
      node.targetSeconds > 300
    )
      throw new AppError(400, '目标回答时长应为 30–300 秒');

    if (seen.has(node.id)) throw new AppError(400, '题组内问题 id 重复');
    seen.add(node.id);
    parsed.push(node);
  }
  for (const question of parsed) {
    for (const item of question.answerFlow?.followUps ?? []) {
      if (item.questionId && !seen.has(item.questionId)) throw new AppError(400, '追问引用的题目不在当前题组中');
    }
  }
  return parsed;
}

async function importQuestionSet(db: Workspace, data: Record<string, unknown>) {
  const key = validateString(data.id, 'id', { required: true, max: 120 });
  if (isBuiltinQuestionSet(key)) throw new AppError(400, '内置题库不能修改');
  const jobId = validateString(data.jobId, 'jobId', { required: true, max: 120 });
  if (jobId !== BANK_JOB_ID && !(await getRecord(db, 'jobs', jobId))) throw new AppError(400, '题组关联的职位不存在');
  const existing = await getRecord(db, 'questionSets', key);
  if (existing && existing.jobId !== jobId) throw new AppError(400, '题组不能改关联职位');
  if (!existing && (await records(db, 'questionSets')).some((pack) => pack.jobId === jobId))
    throw new AppError(400, '该职位已有练习题组，请沿用现有题组 id 更新题目');
  const oldQuestions = (existing?.questions ?? []) as ParsedQuestion[];
  const inputQuestions = Array.isArray(data.questions) ? data.questions : [];
  const questions = parseQuestionSetQuestions(inputQuestions.map(q => {
    if (!q || typeof q !== 'object') return q;
    const old = oldQuestions.find(item => item.id === q.id);
    return q.answerFlow === undefined && old?.answerFlow ? { ...q, answerFlow: old.answerFlow } : q;
  }));
  if (existing) {
    const answeredIds = new Set((await records(db, 'attempts'))
      .filter((attempt) => attempt.questionSetId === key)
      .map((attempt) => attempt.questionId));
    if ([...answeredIds].some((id) => !questions.some((question) => question.id === id)))
      throw new AppError(400, '已有回答的问题 id 必须保留；可直接修改题目内容');
  }
  const result = {
    id: key,
    jobId,
    title: validateString(data.title, 'title', { required: true, max: 1000 }),
    scenario: validateString(data.scenario, 'scenario', { required: true, max: 5000 }),
    plan: validateString(data.plan, 'plan', { required: true, max: 5000 }),
    sourceNotes: validateString(data.sourceNotes, 'sourceNotes', { required: true, max: 15000 }),
    candidateContext: validateString(data.candidateContext, 'candidateContext', { max: 15000 }),
    communicationGuide: validateString(data.communicationGuide, 'communicationGuide', { max: 15000 }),
    questions,
    createdAt: existing?.createdAt || now(),
    updatedAt: now(),
  };
  await putRecord(db, 'questionSets', result);
  return result;
}

// Patches questions of an existing set without resending it: listed questions merge over the saved
// question with the same id (new ids need every field), removeQuestionIds drops questions, others stay.
async function patchQuestionSet(db: Workspace, data: Record<string, unknown>, preview: boolean) {
  if (typeof data !== 'object' || data === null) throw new AppError(400, '每条数据必须是对象');
  for (const field of Object.keys(data)) {
    if (!['id', 'questions', 'removeQuestionIds'].includes(field))
      throw new AppError(400, 'questionSetPatches 只能包含 id、questions、removeQuestionIds；修改题组其他字段请提交完整题组');
  }
  const key = validateString(data.id, 'id', { required: true, max: 120 });
  if (isBuiltinQuestionSet(key)) throw new AppError(400, '内置题库不能修改');
  const existing = await getRecord(db, 'questionSets', key);
  if (!existing) throw new AppError(400, '要修改的题组不存在；新题组请用 questionSets 创建');
  const patches = data.questions ?? [];
  const removals = data.removeQuestionIds ?? [];
  if (!Array.isArray(patches) || patches.length > 40) throw new AppError(400, 'questions 必须是最多 40 条的数组');
  if (!Array.isArray(removals) || removals.length > 40) throw new AppError(400, 'removeQuestionIds 必须是最多 40 条的数组');
  if (patches.length + removals.length === 0) throw new AppError(400, '题目修改至少需要一条 questions 或 removeQuestionIds');
  const removeIds = new Set(removals.map((value) => validateString(value, 'removeQuestionIds', { required: true, max: 120 })));
  const current = (Array.isArray(existing.questions) ? existing.questions : []) as Record<string, unknown>[];
  for (const id of removeIds)
    if (!current.some((question) => question.id === id)) throw new AppError(400, '要删除的问题 id 不存在');
  const patchedIds = new Set<string>();
  const merged = current.filter((question) => !removeIds.has(String(question.id)));
  for (const patch of patches) {
    if (typeof patch !== 'object' || patch === null) throw new AppError(400, '问题必须是对象');
    const id = validateString((patch as Record<string, unknown>).id, 'id', { required: true, max: 120 });
    if (patchedIds.has(id)) throw new AppError(400, '题目修改中问题 id 重复');
    if (removeIds.has(id)) throw new AppError(400, '同一问题不能同时修改和删除');
    patchedIds.add(id);
    const index = merged.findIndex((question) => question.id === id);
    if (index === -1) merged.push(patch as Record<string, unknown>);
    else merged[index] = { ...merged[index], ...(patch as Record<string, unknown>) };
  }
  const questions = parseQuestionSetQuestions(merged);
  if (removeIds.size) {
    const answered = (await records(db, 'attempts')).some(
      (attempt) => attempt.questionSetId === key && removeIds.has(String(attempt.questionId)),
    );
    if (answered) throw new AppError(400, '已有回答的问题 id 必须保留；可直接修改题目内容');
  }
  const result = { ...existing, questions, updatedAt: now() };
  if (!preview) await putRecord(db, 'questionSets', result);
  return result;
}

async function importReview(db: Workspace, data: Record<string, unknown>) {
  const key = validateString(data.id, 'id', { required: true, max: 120 });
  if (await getRecord(db, 'reviews', key)) throw new AppError(400, '点评 id 已存在，请保留历史并使用新版本');
  const attemptId = validateString(data.attemptId, 'attemptId', { required: true, max: 120 });
  const attempt = await getRecord(db, 'attempts', attemptId);
  if (!attempt) throw new AppError(400, '点评对应的回答版本不存在');
  const result: Record<string, unknown> = {
    id: key,
    attemptId,
    jobId: attempt.jobId,
    createdAt: now(),
    author: 'Codex / Agent',
  };
  for (const field of REVIEW_FIELDS) {
    result[field] = validateString(data[field], field, { required: true, max: 30000 });
  }
  result.foreignApplicantNotes = validateString(data.foreignApplicantNotes, 'foreignApplicantNotes', { max: 30000 });
  result.simpleAnswer = validateString(data.simpleAnswer, 'simpleAnswer', { max: 30000 });
  if (!result.foreignApplicantNotes) {
    result.foreignApplicantNotes = '未提供外国人背景核对说明。';
  }
  if (!result.simpleAnswer) result.simpleAnswer = result.revisedAnswer || '';
  await putRecord(db, 'reviews', result);
  return result;
}

async function saveAttempt(db: Workspace, data: Record<string, unknown>, preview = false) {
  const parsedAgent = data.agentPractice === undefined ? undefined : agentPracticeSchema.safeParse(data.agentPractice);
  if (parsedAgent && !parsedAgent.success) throw new AppError(400, "Agent 练习记录格式不正确");
  const agentPractice = parsedAgent?.data;
  if (agentPractice && (!data.clientRequestId || !data.practiceContext)) throw new AppError(400, "Agent 练习必须关联计划并提供稳定请求 ID");
  const clientRequestId = validateString(data.clientRequestId, 'clientRequestId', { max: 120 });
  const practiceContext = await validatePracticeContext(practicePlanStore(db), data.practiceContext, asString(data.questionSetId), asString(data.questionId));
  if (clientRequestId) {
    const existing = (await records(db, 'attempts')).find(item => item.clientRequestId === clientRequestId);
    if (existing) {
      if (existing.questionSetId !== data.questionSetId || existing.questionId !== data.questionId ||
          existing.answer !== data.answer || existing.language !== data.language ||
          existing.durationSeconds !== data.durationSeconds ||
          JSON.stringify(existing.agentPractice ?? null) !== JSON.stringify(agentPractice ?? null) ||
          JSON.stringify(existing.practiceContext ?? null) !== JSON.stringify(practiceContext ?? null)) {
        throw new AppError(409, '请求 ID 已用于另一条回答');
      }
      return existing;
    }
  }
  const questionSetId = validateString(data.questionSetId, 'questionSetId', { required: true, max: 120 });
  const questionId = validateString(data.questionId, 'questionId', { required: true, max: 120 });
  // Built-in bank packs are not stored in D1; attempts against them carry an empty jobId.
  const attemptPack =
    (findBuiltinQuestionSet(questionSetId) as Record<string, unknown> | undefined) ??
    (await getRecord(db, 'questionSets', questionSetId));
  if (!attemptPack) throw new AppError(400, '面试题组不存在');

  const question = ((attemptPack.questions || []) as Array<{ id: string }>).find(
    (item) => item.id === questionId,
  );
  if (!question) throw new AppError(400, '面试问题不存在');

  const duration = Number(data.durationSeconds);
  if (!Number.isInteger(duration) || duration < 0 || duration > 3600)
    throw new AppError(400, '练习时长应为 0–3600 秒');

  const language = validateString(data.language, 'language', { required: true, max: 50 });
  if (!['日语', '中文构思', '中日混合'].includes(language)) {
    throw new AppError(400, '回答语言不正确');
  }

  const attempt = {
    id: toId(),
    ...(clientRequestId ? { clientRequestId } : {}),
    questionSetId,
    questionId,
    question,
    jobId: attemptPack.jobId === BANK_JOB_ID ? '' : attemptPack.jobId,
    answer: validateString(data.answer, 'answer', { required: true, max: 20000 }),
    language,
    durationSeconds: duration,
    profileRevision: (await getProfile(db)).revision,
    createdAt: now(),
    ...(practiceContext ? { practiceContext } : {}),
    ...(agentPractice ? { agentPractice } : {}),
  };
  if (preview) return { valid: true, attempt };
  await putRecord(db, 'attempts', attempt);

  if (data.requestReview === true) {
    await requestTask(db, {
      kind: '回答点评',
      jobId: attempt.jobId,
      attemptId: attempt.id,
      instructions: practiceContext ? `计划练习回答。先用 career_get_practice_plan 读取计划的对应版本和练习目标。优先指出一个影响理解的问题，给具体重练动作；不伪造测量或经历。计划关联：${JSON.stringify(practiceContext)}` : '',
    });
  }

  return attempt;
}

function assertFirebaseClaims(payload: FirebaseClaim, env: Env) {
  const mode = ensureMode(env);
  if (mode === 'off') return;
  const project = env.FIREBASE_PROJECT_ID || '';
  const uid = asString(payload.sub);
  if (!uid) throw new AppError(401, 'Token missing uid');
  const nowUnix = Math.floor(Date.now() / 1000);
  if (payload.exp !== undefined) {
    const exp = Number(payload.exp);
    if (!Number.isFinite(exp)) throw new AppError(401, 'Invalid exp in token');
    if (exp < nowUnix) throw new AppError(401, 'Token expired');
  }

  if (mode === 'strict' && project) {
    const iss = asString(payload.iss);
    const aud = asString(payload.aud);
    const expected = `https://securetoken.google.com/${project}`;
    if (iss && iss !== expected) throw new AppError(401, 'Token issuer mismatch');
    if (aud && aud !== project) throw new AppError(401, 'Token audience mismatch');
  }

  const admin =
    bool(payload.admin) ||
    asString(payload.role) === 'admin' ||
    bool(payload.admin_claim) ||
    adminUidSet(env).has(uid);

  return { uid, admin, claims: payload };
}

async function getAuthContext(request: Request, env: Env, gateway: McpAppServer): Promise<AuthContext> {
  const mode = ensureMode(env);
  if (gateway.carriesToken(request)) {
    let grant;
    try { grant = await gateway.authenticate(request); }
    catch (error) { throw error instanceof AppServerError ? new AppError(error.status, error.message) : error; }
    if (!grant) throw new AppError(401, 'Invalid MCP token');
    if (mode === 'off' && grant.ownerId !== 'local') throw new AppError(401, 'MCP token belongs to a signed-in workspace');
    if (mode !== 'off' && grant.ownerId === 'local') throw new AppError(401, 'MCP token belongs to the local workspace');
    return { uid: grant.ownerId, admin: false, mode, claims: { mcp: true, tokenId: grant.grantId }, tokenType: 'mcp', scopes: grant.scopes as McpScope[] };
  }
  if (mode === 'off') {
    return {
      uid: 'local',
      admin: false,
      mode,
      claims: {},
      tokenType: 'firebase',
      scopes: ['career:read', 'career:write', 'agent:write'],
    };
  }

  const header = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!header || !header.startsWith('Bearer ')) {
    throw new AppError(401, 'Missing Authorization Bearer token');
  }

  const token = header.slice('Bearer '.length).trim();
  if (!env.FIREBASE_PROJECT_ID) throw new AppError(503, '请配置 FIREBASE_PROJECT_ID');
  let payload;
  try { payload = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID); }
  catch { throw new AppError(401, 'Google 或 Apple 登录已失效，请重新登录'); }
  const result = assertFirebaseClaims(payload, env);
  if (!result || !result.uid) throw new AppError(401, 'Token missing uid');
  return {
    uid: result.uid,
    admin: result.admin,
    mode,
    claims: result.claims,
    tokenType: 'firebase',
    scopes: ['career:read', 'career:write', 'agent:write'],
  };
}

function toId() {
  return crypto.randomUUID();
}

function ensureScopes(context: AuthContext, required: readonly string[]) {
  if (context.tokenType === 'mcp') {
    for (const scope of required) {
      if (!context.scopes.includes(scope as McpScope)) {
        throw new AppError(403, 'Token scope denied');
      }
    }
  }
}


// Recorded answers live in R2 under the owner's uid; D1 only keeps the metadata on the attempt.
const AUDIO_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a'];
const AUDIO_MAX_BYTES = 12 * 1024 * 1024;
const AUDIO_LINK_TTL_MS = 15 * 60 * 1000;
type AttemptAudio = { contentType: string; size: number; uploadedAt: string };

function audioBucket(env: Env): R2Bucket {
  if (!env.CAREER_AUDIO) throw new AppError(503, '录音存储未配置（CAREER_AUDIO）');
  return env.CAREER_AUDIO;
}
function audioKey(uid: string, attemptId: string) {
  return `${uid}/attempts/${attemptId}`;
}
function audioContentType(header: string | null) {
  const type = (header || '').split(';')[0].trim().toLowerCase();
  if (!AUDIO_TYPES.includes(type)) throw new AppError(400, '录音格式不支持，请使用 webm / ogg / mp4 / mp3 / wav');
  return type;
}

async function saveAttemptAudio(db: Workspace, env: Env, uid: string, attemptId: string, request: Request) {
  const attempt = await getRecord(db, 'attempts', attemptId);
  if (!attempt) throw new AppError(404, '回答版本不存在');
  const contentType = audioContentType(request.headers.get('content-type'));
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > AUDIO_MAX_BYTES) throw new AppError(413, '录音超过 12 MB');
  const body = await request.arrayBuffer();
  if (!body.byteLength) throw new AppError(400, '录音为空');
  if (body.byteLength > AUDIO_MAX_BYTES) throw new AppError(413, '录音超过 12 MB');
  await audioBucket(env).put(audioKey(uid, attemptId), body, { httpMetadata: { contentType } });
  const audio: AttemptAudio = { contentType, size: body.byteLength, uploadedAt: now() };
  const saved = { ...attempt, audio };
  await putRecord(db, 'attempts', saved);
  return saved;
}

async function attemptAudioResponse(env: Env, key: string, contentType: string) {
  const object = await audioBucket(env).get(key);
  if (!object) throw new AppError(404, '录音文件不存在');
  return new Response(object.body, { headers: {
    'content-type': contentType,
    'content-length': String(object.size),
    'cache-control': 'private, no-store',
    'x-content-type-options': 'nosniff',
  } });
}

// Agents cannot receive audio through MCP, so they get a short-lived, unguessable download URL instead.
const audioLinks = (connection: D1Database): Workspace => ({ connection, namespace: '' });
async function createAudioLink(db: Workspace, env: Env, request: Request, uid: string, attemptId: string) {
  const attempt = await getRecord(db, 'attempts', attemptId);
  if (!attempt) throw new AppError(404, '回答版本不存在');
  const audio = attempt.audio as AttemptAudio | undefined;
  if (!audio) throw new AppError(404, '这个回答没有录音');
  audioBucket(env);
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date(Date.now() + AUDIO_LINK_TTL_MS).toISOString();
  await putRecord(audioLinks(db.connection), 'audioLinks', { id: token, key: audioKey(uid, attemptId), contentType: audio.contentType, expiresAt });
  return {
    attemptId,
    url: resolveOrigins(request, env).publicOrigin + '/api/career/attempts/audio/' + token,
    expiresAt,
    contentType: audio.contentType,
    size: audio.size,
    durationSeconds: attempt.durationSeconds,
    language: attempt.language,
  };
}
async function audioLinkResponse(rawDb: D1Database, env: Env, token: string, request: Request) {
  const links = audioLinks(rawDb);
  const link = await getRecord(links, 'audioLinks', token);
  if (!link) return jsonResponse({ error: '下载链接不存在或已过期' }, { status: 404 });
  if (Date.parse(String(link.expiresAt)) < Date.now()) {
    await rawDb.prepare('DELETE FROM records WHERE kind=?1 AND id=?2').bind(workspaceKey(links, 'audioLinks'), token).run();
    return jsonResponse({ error: '下载链接已过期，请重新获取' }, { status: 410 });
  }
  if (link.interview === true) return interviewAudioResponse(audioBucket(env), String(link.key), request);
  return attemptAudioResponse(env, String(link.key), String(link.contentType));
}

// Archiving only hides a superseded version from default lists; content and history are kept and it can be restored.
async function archiveMaterials(db: Workspace, items: unknown, preview = false) {
  if (!Array.isArray(items) || items.length > 200) throw new AppError(400, 'archiveMaterials 必须是最多 200 条的数组');
  const seen = new Set<string>();
  const targets: { material: Record<string, unknown>; archived: boolean }[] = [];
  for (const item of items) {
    if (typeof item !== 'object' || item === null) throw new AppError(400, '每条数据必须是对象');
    const obj = item as Record<string, unknown>;
    const id = validateString(obj.id, 'id', { required: true, max: 120 });
    if (seen.has(id)) throw new AppError(400, '数据包中存在重复 id');
    seen.add(id);
    if (typeof obj.archived !== 'boolean') throw new AppError(400, 'archived 必须是 true 或 false');
    const material = await getRecord(db, 'materials', id);
    if (!material) throw new AppError(400, '要归档的材料不存在');
    targets.push({ material, archived: obj.archived });
  }
  if (!preview) for (const { material, archived } of targets) {
    if (archived) material.archivedAt = String(material.archivedAt || '') || now();
    else delete material.archivedAt;
    await putRecord(db, 'materials', material);
  }
  return targets.length;
}

async function setMaterialReviewStatus(db: Workspace, payload: Record<string, unknown>) {
  const id = validateString(payload.id, 'id', { required: true, max: 120 });
  const reviewed = payload.reviewed;
  if (typeof reviewed !== 'boolean') throw new AppError(400, 'reviewed 必须是 true 或 false');
  const material = await getRecord(db, 'materials', id);
  if (!material) throw new AppError(404, '材料不存在');
  if (material.archivedAt) throw new AppError(409, '已归档的材料不能更新核对状态');
  material.reviewStatus = reviewed ? '已核对' : '待核对';
  if (reviewed) material.reviewedAt = now();
  else delete material.reviewedAt;
  await putRecord(db, 'materials', material);
  return { id, reviewStatus: material.reviewStatus, reviewedAt: material.reviewedAt || null };
}

/** The user corrects a schedule entry in the app: header fields, title and notes are rewritten in place. */
async function updateEvent(db: Workspace, payload: Record<string, unknown>) {
  const id = validateString(payload.id, 'id', { required: true, max: 120 });
  const report = await getRecord(db, 'reports', id);
  const current = report && parseEventHeader(report.sourceNotes as string, report.date as string);
  if (!report || !current || 'error' in current) throw new AppError(404, '日程不存在');
  const date = validateString(payload.date, 'date', { required: true, max: 16 });
  const header: Record<string, unknown> = {
    date,
    timeStatus: payload.timeStatus,
    status: payload.status,
    kind: payload.kind,
    ...(payload.timeStatus !== 'unknown' ? { start: payload.start, end: payload.end } : {}),
  };
  for (const key of ['location', 'url', 'jobId'] as const) {
    const value = validateString(payload[key], key, { max: key === 'url' ? 2000 : 200 });
    if (value) header[key] = value;
  }
  // Fields left out of the payload keep their saved value.
  for (const key of ['links', 'todos'] as const) {
    const value = payload[key] === undefined ? current[key] : payload[key];
    if (value !== undefined) header[key] = value;
  }
  if (current.supersedes) header.supersedes = current.supersedes;
  const sourceNotes = (report.sourceNotes as string) || '';
  const next = withEventHeader(sourceNotes, header as EventHeader);
  const checked = parseEventHeader(next, date);
  if (!checked || 'error' in checked) throw new AppError(400, checked ? checked.error : '日程格式不正确');
  report.date = date;
  report.title = validateString(payload.title, 'title', { required: true, max: 200 });
  report.content = validateString(payload.content, 'content', { max: 100000 });
  report.sourceNotes = withEventHeader(sourceNotes, checked);
  report.updatedAt = now();
  await putRecord(db, 'reports', report);
  return { id, date, updatedAt: report.updatedAt };
}

/** Remove a schedule entry from the calendar (or restore it); the report and its notes are kept. */
async function removeEvent(db: Workspace, payload: Record<string, unknown>) {
  const id = validateString(payload.id, 'id', { required: true, max: 120 });
  if (typeof payload.removed !== 'boolean') throw new AppError(400, 'removed 必须是 true 或 false');
  const report = await getRecord(db, 'reports', id);
  if (!report || !parseEventHeader(report.sourceNotes as string, report.date as string)) throw new AppError(404, '日程不存在');
  if (payload.removed) report.archivedAt = now();
  else delete report.archivedAt;
  await putRecord(db, 'reports', report);
  return { id, archivedAt: report.archivedAt || null };
}

async function importBundle(db: Workspace, data: Record<string, unknown>, preview = false, media?: { bucket?: R2Bucket; uid: string }) {
  if (Number(data.schemaVersion) !== 1) throw new AppError(400, '需要 schemaVersion: 1 的 JSON 数据包');

  for (const key of Object.keys(data)) {
    if (!['schemaVersion', 'jobs', 'materials', 'archiveMaterials', 'reports', 'questionSets', 'questionSetPatches', 'reviews', 'completeTaskIds'].includes(key)) {
      throw new AppError(400, '数据包包含未知字段');
    }
  }

  const counts: Record<string, number> = {
    jobs: 0,
    materials: 0,
    archivedMaterials: 0,
    reports: 0,
    questionSets: 0,
    questionSetPatches: 0,
    reviews: 0,
  };
  const allJobs = await records(db, 'jobs');
  const currentProfile = (await getProfile(db));

  const handlers: Record<string, (items: unknown[]) => Promise<void>> = {
    jobs: async (items) => {
      if (items.length > 200) throw new AppError(400, 'jobs 必须是最多 200 条的数组');
      const seen = new Set<string>();
      for (const item of items) {
        if (typeof item !== 'object' || item === null) throw new AppError(400, '每条数据必须是对象');
        const obj = item as Record<string, unknown>;
        const key = validateString(obj.id, 'id', { required: true, max: 120 });
        if (seen.has(key)) throw new AppError(400, '数据包中存在重复 id');
        seen.add(key);
        if (Object.prototype.hasOwnProperty.call(obj, 'rating')) {
          throw new AppError(400, '个人星级请使用 career_update_job_rating，不能通过研究导入修改');
        }
        if (Object.prototype.hasOwnProperty.call(obj, 'preferenceGroup')) {
          throw new AppError(400, '志望群请使用 career_update_job_preference，不能通过研究导入修改');
        }
        if (Object.prototype.hasOwnProperty.call(obj, 'applicationDoc')) {
          throw new AppError(400, 'applicationDoc 只能由本人在导出页面保存');
        }
        if (
          ['status', 'history', 'notes', 'nextDate', 'nextAction', 'priority', 'revision'].some(
            (field) => Object.prototype.hasOwnProperty.call(obj, field),
          )
        ) {
          throw new AppError(400, 'Agent 导入不能修改投递状态或个人跟进信息；投递状态请按本人指示使用 career_update_job_status，其余请在网页编辑');
        }
        if (preview && obj.companyProfile !== undefined) {
          try { normalizeCompanyProfile(obj.companyProfile); }
          catch (error) { throw new AppError(400, error instanceof Error ? error.message : '企业看板数据无效'); }
        }
        if (!preview) await saveJob(db, obj, true);
        counts.jobs += 1;
      }
    },
    materials: async (items) => {
      if (items.length > 200) throw new AppError(400, 'materials 必须是最多 200 条的数组');
      const seen = new Set<string>();
      for (const item of items) {
        if (typeof item !== 'object' || item === null) throw new AppError(400, '每条数据必须是对象');
        const obj = item as Record<string, unknown>;
        const key = validateString(obj.id, 'id', { required: true, max: 120 });
        if (seen.has(key)) throw new AppError(400, '数据包中存在重复 id');
        seen.add(key);
        if (!preview && (await getRecord(db, 'materials', key))) {
          throw new AppError(400, '文档 id 已存在；请使用新 id 保留版本');
        }

        const title = validateString(obj.title, 'title', { required: true, max: 200 });
        const content = validateString(obj.content, 'content', { required: true, max: 100000 });
        const sourceNotes = validateString(obj.sourceNotes, 'sourceNotes', { required: true, max: 30000 });
        const jobId = validateString(obj.jobId, 'jobId', { required: true, max: 120 });
        const kind = validateString(obj.kind, 'kind', { required: true, max: 20 });
        if (!MATERIAL_KINDS.includes(kind as MaterialKind)) throw new AppError(400, '材料类型不正确');
        const reviewItems = validateReviewItems(obj.reviewItems);
        // Short answer for optional 応募理由 form fields; counted without inline readings, as the employer sees it.
        const applicationReason = validateString(obj.applicationReason, 'applicationReason', { max: 400 }).trim();
        if (applicationReason && kind !== '志望動機') throw new AppError(400, 'applicationReason 只用于志望動機');
        if ([...plainJapanese(applicationReason)].length > 100) throw new AppError(400, 'applicationReason 去掉读音后必须在 100 字以内');
        if (kind === '履歴書' || kind === '職務経歴書') {
          const issues = applicationBodyIssues(content, kind as ApplicationKind);
          if (issues.length) throw new AppError(400, `${kind}正文只能包含正式内容，标题固定为「${kind}」。请把以下内容移到 reviewItems（待本人填写/确认/修改）或 sourceNotes（依据与说明）：${issues.slice(0, 5).map(issue => issue.split('\n')[0].slice(0, 60)).join('；')}`);
        }

        const related = allJobs.find((job) => job.id === jobId) as Record<string, unknown> | undefined;
        if (!related) throw new AppError(400, '材料关联的职位不存在');

        if (!preview) {
          await putRecord(db, 'materials', {
            id: key,
            title,
            content,
            sourceNotes,
            reviewItems,
            ...(applicationReason ? { applicationReason } : {}),
            jobId,
            kind,
            createdAt: now(),
            reviewStatus: '待核对',
            jobRevision: related.revision || 0,
            profileRevision: currentProfile.revision,
          });
        }
        counts.materials += 1;
      }
    },
    reports: async (items) => {
      if (items.length > 200) throw new AppError(400, 'reports 必须是最多 200 条的数组');
      const seen = new Set<string>();
      for (const item of items) {
        if (typeof item !== 'object' || item === null) throw new AppError(400, '每条数据必须是对象');
        const obj = item as Record<string, unknown>;
        const key = validateString(obj.id, 'id', { required: true, max: 120 });
        if (seen.has(key)) throw new AppError(400, '数据包中存在重复 id');
        seen.add(key);
        if (!preview && (await getRecord(db, 'reports', key))) throw new AppError(400, '文档 id 已存在；请使用新 id 保留版本');
        const title = validateString(obj.title, 'title', { required: true, max: 200 });
        const content = validateString(obj.content, 'content', { required: true, max: 100000 });
        const sourceNotes = validateString(obj.sourceNotes, 'sourceNotes', { required: true, max: 30000 });
        const date = validateString(obj.date, 'date', { required: true, max: 16 });
        if (!date) throw new AppError(400, '报告需要日期');
        validateDate(date, 'date');
        const event = parseEventHeader(sourceNotes, date);
        if (event && 'error' in event) throw new AppError(400, `${key}：${event.error}`);
        for (const old of event?.supersedes || []) {
          if (old === key) throw new AppError(400, '日程不能替换自身');
          const replaced = await getRecord(db, 'reports', old);
          if (!replaced || !parseEventHeader(replaced.sourceNotes as string, replaced.date as string)) throw new AppError(400, `supersedes 指向的日程不存在：${old}`);
        }

        let interviewId: string | undefined;
        if (obj.sourceInterview !== undefined) {
          if (!media) throw new AppError(503, '录音导入上下文不可用');
          interviewId = await importInterviewSource(practicePlanStore(db), media.bucket, media.uid, obj.sourceInterview, preview);
        }
        if (!preview) {
          await putRecord(db, 'reports', {
            id: key,
            date,
            title,
            content,
            sourceNotes,
            ...(interviewId ? { interviewId } : {}),
            createdAt: now(),
          });
        }
        counts.reports += 1;
      }
    },
    questionSets: async (items) => {
      if (items.length > 200) throw new AppError(400, 'questionSets 必须是最多 200 条的数组');
      for (const item of items) {
        if (!preview) await importQuestionSet(db, item as Record<string, unknown>);
        counts.questionSets += 1;
      }
    },
    questionSetPatches: async (items) => {
      if (items.length > 200) throw new AppError(400, 'questionSetPatches 必须是最多 200 条的数组');
      for (const item of items) {
        await patchQuestionSet(db, item as Record<string, unknown>, preview);
        counts.questionSetPatches += 1;
      }
    },
    reviews: async (items) => {
      if (items.length > 200) throw new AppError(400, 'reviews 必须是最多 200 条的数组');
      for (const item of items) {
        if (!preview) await importReview(db, item as Record<string, unknown>);
        counts.reviews += 1;
      }
    },
  };

  for (const [kind, handler] of Object.entries(handlers)) {
    const list = data[kind] as unknown;
    if (!Array.isArray(list)) {
      if (list === undefined) continue;
      throw new AppError(400, `${kind} 必须是最多 200 条的数组`);
    }
    await handler(list);
  }

  // After new materials, so one bundle can add a version and archive the one it replaces.
  if (data.archiveMaterials !== undefined) counts.archivedMaterials = await archiveMaterials(db, data.archiveMaterials, preview);

  const completeTaskIds = data.completeTaskIds;
  if (!Array.isArray(completeTaskIds)) throw new AppError(400, 'completeTaskIds 必须是数组');
  for (const taskValue of completeTaskIds) {
    const taskId = validateString(taskValue, 'taskId', { required: true, max: 120 });
    const task = await getRecord(db, 'tasks', taskId);
    if (!task) throw new AppError(400, '待处理任务不存在');
    if (task.kind === '面试复盘') {
      const interview = await getRecord(db, 'interviews', String(task.interviewId));
      if (interview?.status !== 'practice' || !interview.practice?.length) throw new AppError(400, '面试复盘必须完成全体把握、复盘及练习关联');
    }
    if (task.kind === '练习计划') {
      const plan = await getPracticePlan(practicePlanStore(db), asString(task.planId));
      if (!plan.content) throw new AppError(400, '练习计划必须先保存能力、练习、日程和检查标准');
    }
    if (task.kind === '计划复盘' && !(await records(db, 'practicePlanReviews')).some(item => item.planId === task.planId && item.checkpointId === task.checkpointId && item.planRevision === task.planRevision)) {
      throw new AppError(400, '计划复盘任务必须先保存对应检查点的评估');
    }
    if (!preview) {
      if (task.kind === '公司准备' && counts.materials === 0)
        throw new AppError(400, '公司准备任务必须附上对应职位的材料');
      if (task.kind === '每日分析' && counts.reports === 0) throw new AppError(400, '每日分析任务必须附上报告');
      if (task.kind === '职位研究' && counts.jobs === 0) throw new AppError(400, '职位研究任务必须附上职位');
      if (task.kind === '回答点评' && counts.reviews === 0)
        throw new AppError(400, '回答点评任务必须附上该回答版本的点评');
      task.status = '已完成';
      task.completedAt = now();
      await putRecord(db, 'tasks', task);
    }
  }

  return counts;
}

function jsonResponse(payload: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers || {}),
    },
  });
}

function normalizeOrigin(value: string | undefined): string {
  const text = (value || '').trim();
  if (!text) return '';
  try { return new URL(text).origin; }
  catch { throw new AppError(503, 'Invalid origin configuration'); }
}

function resolveOrigins(request: Request, env: Env): Origins {
  const publicOrigin = normalizeOrigin(env.CAREER_PUBLIC_ORIGIN) || new URL(request.url).origin;
  return { publicOrigin, webOrigin: normalizeOrigin(env.CAREER_WEB_ORIGIN) || publicOrigin };
}

function envDays(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 365 ? parsed : fallback;
}

// The gateway owns OAuth, agent tokens and the MCP transport; Career Note supplies identity,
// tools and the audit log. Tool calls re-enter the REST handler with the agent's own token so
// scope and tenancy checks are never duplicated.
function createGateway(env: Env, db: D1Database): McpAppServer {
  const invoke = async (ctx: ToolContext, path: string, body?: Record<string, unknown>) => {
    const response = await handler(new Request(new URL('/api/career/' + path, ctx.request.url), {
      method: body ? 'POST' : 'GET', headers: { authorization: ctx.request.headers.get('authorization') || '', 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }) as Request<unknown, IncomingRequestCfProperties<unknown>>, env);
    // Every tool call is attributed to the grant that made it; payloads are never stored.
    const summary = body !== undefined ? summarizeToolResult(path.replace(/\?.*$/, ''), body, response.ok ? await response.clone().json().catch(() => null) : null) : null;
    await logActivity(db, { ownerUid: ctx.ownerId, tokenId: ctx.grantId, clientId: ctx.clientId || null, clientName: ctx.clientName || 'agent', event: 'tool:' + path.replace(/\?.*$/, ''), ok: response.ok, detail: summary });
    return response;
  };
  const gateway: McpAppServer = createMcpAppServer({
    name: 'career-note',
    basePath: '/api/career',
    scopes: CAREER_SCOPES,
    contract: CAREER_CONTRACT,
    tools: createCareerTools(invoke),
    prompts: createCareerPrompts(invoke),
    // Existing deployments already hold these tables; column layout is unchanged.
    storage: sqlStore(db, { clients: 'oauth_clients', codes: 'oauth_codes', refreshTokens: 'oauth_refresh_tokens', accessTokens: 'mcp_tokens' }),
    origins: (request) => resolveOrigins(request, env),
    tokenPrefix: 'mcp_',
    accessTokenDays: envDays(env.MCP_TOKEN_TTL_DAYS, 30),
    refreshTokenDays: envDays(env.CAREER_OAUTH_REFRESH_DAYS, 90),
    // Off mode is already refused over a public address, so the inspector page is safe there; elsewhere it is opt-in.
    inspector: (ensureMode(env) === 'off' || env.CAREER_INSPECTOR === 'true') && inspectorResponse,
    // `career_get_connection_info` lets an agent confirm which workspace and environment a token is bound to.
    connectionInfo: {
      toolName: 'career_get_connection_info',
      resolve: async ({ ownerId }) => {
        const owner = ownerId === 'local'
          ? { email: null, display_name: 'Local workspace', provider: null }
          : await db.prepare('SELECT email, display_name, provider FROM mcp_owners WHERE uid = ?1').bind(ownerId).first<{ email: string | null; display_name: string | null; provider: string | null }>();
        return {
          // null → the grant's account was never seen at consent (pre-0.3 grant); the agent sees status "missing" rather than a guessed name.
          user: owner ? {
            ...(owner.email ? { email: owner.email } : {}),
            ...(owner.display_name ? { displayName: owner.display_name } : {}),
            ...(owner.provider ? { identities: [{ provider: owner.provider, subject: ownerId, issuer: env.FIREBASE_PROJECT_ID ? `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}` : undefined }] } : {}),
          } : null,
          environment: ensureMode(env) === 'off' ? 'local' : env.CAREER_PUBLIC_ORIGIN ? 'hosted' : 'development',
          dataSource: 'd1:career-note',
        };
      },
    },
    identity: {
      // Consent is approved with the same credential the web app uses (Firebase ID token, or the local workspace).
      async resolve(request) {
        let user: AuthContext;
        try { user = await getAuthContext(request, env, gateway); }
        catch (error) { throw error instanceof AppError ? new AppServerError(error.code, error.message, 'invalid_token') : error; }
        if (user.tokenType !== 'firebase') throw new AppServerError(403, 'Sign in to approve an agent', 'access_denied');
        const email = typeof user.claims.email === 'string' ? user.claims.email : undefined;
        if (user.uid !== 'local') {
          const firebase = user.claims.firebase as { sign_in_provider?: unknown } | undefined;
          await db.prepare('INSERT INTO mcp_owners (uid, email, display_name, provider, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(uid) DO UPDATE SET email = excluded.email, display_name = excluded.display_name, provider = excluded.provider, updated_at = excluded.updated_at')
            .bind(user.uid, email ?? null, typeof user.claims.name === 'string' ? user.claims.name : null, typeof firebase?.sign_in_provider === 'string' ? firebase.sign_in_provider : null, new Date().toISOString()).run();
        }
        return { id: user.uid, email };
      },
    },
    onEvent: async (event) => {
      if (event.type === 'tool') return; // invoke() above records tool calls with a REST-level summary
      await logActivity(db, { ownerUid: event.ownerId, tokenId: event.grantId, clientId: event.clientId || null, clientName: event.clientName, event: event.type, ok: true, detail: event.scopes ? { scopes: event.scopes } : null });
    },
  });
  return gateway;
}

let schemaReady: Promise<void> | undefined;
async function ensureAllSchemas(db: D1Database, gateway: McpAppServer): Promise<void> {
  await ensureSchema(db, gateway);
  await ensureMaterialPublicationSchema(db);
  await ensureMaterialFilesSchema(db);
  await ensureResumeSchema(db);
  await ensurePersonalizedSchema(db);
  await ensureArticleSchema(db);
}

const handler = async (
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  env: Env,
): Promise<Response> => {
  if (new URL(request.url).pathname === '/api/career/auth/config' && request.method === 'GET') {
    const firebase = env.FIREBASE_API_KEY && env.FIREBASE_AUTH_DOMAIN && env.FIREBASE_PROJECT_ID && env.FIREBASE_APP_ID
      ? {apiKey: env.FIREBASE_API_KEY, authDomain: env.FIREBASE_AUTH_DOMAIN, projectId: env.FIREBASE_PROJECT_ID, appId: env.FIREBASE_APP_ID}
      : null;
    return jsonResponse({mode: ensureMode(env), firebase});
  }
  const rawDb = ensureDb(env);
  const gateway = createGateway(env, rawDb);
  // CREATE TABLE IF NOT EXISTS once per isolate, not once per request; a failed attempt is retried next time.
  schemaReady ??= ensureAllSchemas(rawDb, gateway).catch((error) => { schemaReady = undefined; throw error; });
  await schemaReady;
  const publicMatch = new URL(request.url).pathname.match(/^\/api\/career\/public-resumes\/([a-f0-9-]{36})$/);
  if (publicMatch && request.method === 'GET') return publicResumeResponse(rawDb, publicMatch[1]);
  const publicMaterialMatch = new URL(request.url).pathname.match(/^\/api\/career\/public-materials\/([a-f0-9-]{36})$/);
  if (publicMaterialMatch && request.method === 'GET') return publicMaterialResponse(rawDb, publicMaterialMatch[1]);
  const articlePath = new URL(request.url).pathname;
  if (request.method === 'GET' && articlePath === '/api/career/articles')
    return jsonResponse({ articles: await listArticles(rawDb) });
  if (request.method === 'GET' && articlePath === '/api/career/articles/sitemap.xml')
    return articleSitemap(rawDb, new URL(request.url).origin);
  const publicArticleMatch = articlePath.match(/^\/api\/career\/articles\/view\/([a-z0-9-]{3,80})$/);
  if (request.method === 'GET' && publicArticleMatch) {
    const article = await getArticle(rawDb, publicArticleMatch[1]);
    return article ? articleHtml(article, request.url, resolveOrigins(request, env).webOrigin) : new Response('Not found', { status: 404 });
  }
  const articleJsonMatch = articlePath.match(/^\/api\/career\/articles\/([a-z0-9-]{3,80})$/);
  if (request.method === 'GET' && articleJsonMatch && articleJsonMatch[1] !== 'manage') {
    const article = await getArticle(rawDb, articleJsonMatch[1]);
    return article ? jsonResponse(article) : jsonResponse({ error: '文章不存在' }, { status: 404 });
  }
  const audioMatch = new URL(request.url).pathname.match(/^\/api\/career\/(?:attempts|interviews)\/audio\/([a-f0-9]{48})$/);
  if (audioMatch && request.method === 'GET') return audioLinkResponse(rawDb, env, audioMatch[1], request);

  const url = new URL(request.url);
  const pathname = url.pathname;
  const method = request.method.toUpperCase();

  // Auth mode off trusts every caller, so it must never be served through a tunnel or Cloudflare edge.
  if (ensureMode(env) === 'off' && request.headers.get('cf-ray'))
    return jsonResponse({ error: 'Local mode is not available over a public address; set CAREER_AUTH_MODE=strict' }, { status: 403 });
  // Discovery, OAuth grant endpoints and the MCP transport belong to the gateway and need no user session.
  if (ensureMode(env) === 'off' && pathname.startsWith('/api/career/oauth/') && resolveOrigins(request, env).publicOrigin.startsWith('https://'))
    return jsonResponse({ error: 'server_error', error_description: 'Auth mode off is only allowed for local use; set CAREER_AUTH_MODE=strict' }, { status: 503 });
  const gatewayResponse = await gateway.fetch(request);
  if (gatewayResponse) return gatewayResponse;
  if (!pathname.startsWith('/api/career')) {
    return jsonResponse({ error: '接口不存在' }, { status: 404 });
  }

  let context: AuthContext;
  try {
    context = await getAuthContext(request, env, gateway);
  } catch (error) {
    const message = error instanceof AppError ? error.message : '未授权';
    const status = error instanceof AppError ? error.code : 401;
    return jsonResponse({ error: message }, { status });
  }

  const db: Workspace = { connection: rawDb, namespace: context.mode === 'off' ? '' : JSON.stringify([env.FIREBASE_PROJECT_ID, context.uid]) };

  if (pathname === '/api/career/practice-plans' || pathname.startsWith('/api/career/practice-plans/')) {
    const store = practicePlanStore(db);
    const action = pathname.slice('/api/career/practice-plans'.length);
    if (method === 'GET') {
      ensureScopes(context, ['career:read']);
      if (!action) return jsonResponse(await listPracticePlans(store));
      const id = url.searchParams.get('id') || '';
      if (action === '/detail') return jsonResponse(await practicePlanDetail(store, id, url.searchParams.has('revision') ? Number(url.searchParams.get('revision')) : undefined));
      if (action === '/history') {
        await getPracticePlan(store, id);
        return jsonResponse({ versions: (await records(db, 'practicePlanVersions')).filter(item => item.id === id).map(item => ({ revision: item.revision, updatedAt: item.updatedAt, status: item.status, goal: item.goal })) });
      }
      throw new PracticePlanError(404, '计划接口不存在');
    }
    if (method !== 'POST') throw new PracticePlanError(405, '请求方法不支持');
    if (['/edit', '/status'].includes(action)) {
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new PracticePlanError(403, '目标、期间和达成状态请由本人在应用中修改');
    } else ensureScopes(context, context.tokenType === 'mcp' ? ['agent:write'] : ['career:write']);
    if (Number(request.headers.get('content-length')) > 900000) throw new PracticePlanError(413, '计划内容过大');
    let data: Record<string, unknown>;
    try { data = JSON.parse(new TextDecoder().decode(await readInterviewBytes(request, 900000))); }
    catch (error) { if (error instanceof InterviewError) throw error; throw new PracticePlanError(400, '请求体必须是 JSON 对象'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new PracticePlanError(400, '请求体必须是 JSON 对象');
    if (action === '/turn' || action === '/turn/preview') {
      if (!data.agentPractice) throw new PracticePlanError(400, '缺少 Agent 练习阶段');
      return jsonResponse(await saveAttempt(db, { ...data, requestReview: false }, action.endsWith('/preview')));
    }
    if (!action) return jsonResponse(await createPracticePlan(store, data));
    if (action === '/edit') return jsonResponse(await editPracticePlan(store, data));
    if (action === '/status') return jsonResponse(await setPracticePlanStatus(store, data));
    if (action === '/save' || action === '/save/preview') return jsonResponse(await savePracticePlan(store, data, action.endsWith('/preview')));
    if (action === '/review' || action === '/review/preview') return jsonResponse(await savePracticePlanReview(store, data, action.endsWith('/preview')));
    if (action === '/request') {
      if (!['planning', 'review'].includes(asString(data.kind))) throw new PracticePlanError(400, '计划任务类型不正确');
      return jsonResponse(await requestPracticePlanTask(store, asString(data.id), data.kind as 'planning' | 'review', asString(data.checkpointId)));
    }
    throw new PracticePlanError(404, '计划接口不存在');
  }

  if (pathname === '/api/career/speech' || pathname.startsWith('/api/career/speech/')) {
    ensureScopes(context, [method === 'GET' ? 'career:read' : 'career:write']);
    if (context.tokenType === 'mcp') throw new SpeechTranscriptionError(403, '認識の実行は本人のアプリから操作してください。');
    const store = { ...db, get: (kind: string, id: string) => getRecord(db, kind, id),
      put: (kind: string, value: Record<string, unknown>) => putRecord(db, kind, value),
      list: (kind: string) => records(db, kind) };
    await ensureSpeechSchema(db.connection);
    const action = pathname.slice('/api/career/speech'.length);
    const id = url.searchParams.get('id') || '';
    if (method === 'GET' && action === '/usage') return jsonResponse(await speechUsage(store));
    if (method === 'GET' && action === '/status') return jsonResponse(await speechJobStatus(store, id));
    if (method !== 'POST') throw new SpeechTranscriptionError(405, '認識の操作が正しくありません。');
    if (action === '/chunk') {
      if (!env.AI || !env.CAREER_AUDIO) throw new SpeechTranscriptionError(503, 'Cloudflare AI と録音保存の設定が必要です。');
      return jsonResponse(await recognizeSpeechChunk(store, env.AI, env.CAREER_AUDIO, context.uid, id,
        url.searchParams.has('part') ? Number(url.searchParams.get('part')) : NaN, await readInterviewBytes(request, SPEECH_MAX_WAV_BYTES)));
    }
    let data: Record<string, unknown>;
    try { data = JSON.parse(new TextDecoder().decode(await readInterviewBytes(request, 4096))); }
    catch (error) { if (error instanceof InterviewError) throw error; throw new SpeechTranscriptionError(400, 'JSON を送信してください。'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SpeechTranscriptionError(400, 'JSON オブジェクトを送信してください。');
    if (!action) {
      if (!env.AI || !env.CAREER_AUDIO) throw new SpeechTranscriptionError(503, 'Cloudflare AI と録音保存の設定が必要です。');
      return jsonResponse(await startSpeechJob(store, data));
    }
    if (action === '/complete') {
      const result = await completeSpeechJob(store, asString(data.id));
      if (result.job.target === 'interview') {
        let document = await getInterview(store, result.job.interviewId);
        if (document.transcript?.source !== result.transcript.source) {
          if (document.transcript) throw new SpeechTranscriptionError(409, '既存の転写を保持しています。認識結果を上書きしません。');
          await updateInterview(store, { id: document.id, revision: result.job.sourceRevision,
            stage: 'transcript', data: result.transcript }, false);
          document = await getInterview(store, result.job.interviewId);
        }
        const latest = await getSpeechJob(store, result.job.id);
        await store.put('speechJobs', { ...latest, committedRevision: document.revision });
      }
      return jsonResponse(result);
    }
    throw new SpeechTranscriptionError(404, '認識の操作が見つかりません。');
  }

  if (pathname === '/api/career/interviews' || pathname.startsWith('/api/career/interviews/')) {
    const store = { ...db, get: (kind: string, id: string) => getRecord(db, kind, id),
      put: (kind: string, value: Record<string, unknown>) => putRecord(db, kind, value),
      list: (kind: string) => records(db, kind) };
    const action = pathname.slice('/api/career/interviews'.length);
    if (method === 'GET') {
      ensureScopes(context, ['career:read']);
      if (!action) return jsonResponse(await listInterviews(store));
      const id = url.searchParams.get('id') || '';
      const session = await getInterviewVersion(store, id, url.searchParams.get('revision'));
      if (action === '/detail') {
        const { transcript, ...detail } = session;
        return jsonResponse({ ...detail, transcript: transcript ? { source: transcript.source, segmentCount: transcript.segments.length, originalLength: Array.from(transcript.originalText).length } : null });
      }
      if (action === '/document') return jsonResponse(session);
      if (action === '/history') {
        const versions = (await records(db, 'interviewVersions')).filter(item => item.id === id).map(item => interviewSummary(item as Parameters<typeof interviewSummary>[0]));
        return jsonResponse({ versions: versions.sort((a, b) => b.revision - a.revision) });
      }
      if (action === '/transcript') {
        const view = url.searchParams.get('view') || 'segments';
        const maxLimit = view === 'original' ? 12000 : 100;
        const offset = Number(url.searchParams.get('offset') || 0), limit = Number(url.searchParams.get('limit') || maxLimit);
        if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new InterviewError(400, '转写分页参数不正确');
        const transcript = session.transcript;
        const source = transcript?.source || '';
        const original = Array.from(transcript?.originalText || '');
        const values = view === 'original' ? original : transcript?.segments || [];
        if (!['segments', 'original'].includes(view)) throw new InterviewError(400, '转写视图不正确');
        return jsonResponse({ id, revision: session.revision, source, view, offset, total: values.length,
          ...(view === 'original' ? { text: original.slice(offset, offset + limit).join('') } : { segments: values.slice(offset, offset + limit) }),
          hasMore: offset + limit < values.length, nextOffset: Math.min(values.length, offset + limit) });
      }
      if (action === '/audio') {
        if (!session.audio) throw new InterviewError(404, '录音尚未上传');
        return interviewAudioResponse(audioBucket(env), `${context.uid}/interviews/${id}/original`, request);
      }
      throw new InterviewError(404, '面试接口不存在');
    }
    if (method !== 'POST') throw new InterviewError(405, '请求方法不支持');
    if (['/stage', '/stage/preview'].includes(action)) ensureScopes(context, ['agent:write']);
    else if (action === '/audio-link') ensureScopes(context, ['career:read']);
    else {
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new InterviewError(403, '原始录音导入和任务提交请在应用中操作');
    }
    if (action === '/upload-part') return jsonResponse(await uploadInterviewPart(store, audioBucket(env), url.searchParams.get('id') || '', Number(url.searchParams.get('part')), request));
    if (Number(request.headers.get('content-length')) > 1_500_000) throw new InterviewError(413, '面试内容过大');
    const body = new TextDecoder().decode(await readInterviewBytes(request, 1_500_000));
    let data: Record<string, unknown>;
    try { data = JSON.parse(body); } catch { throw new InterviewError(400, '请求体必须是 JSON 对象'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new InterviewError(400, '请求体必须是 JSON 对象');
    if (!action) return jsonResponse(await createInterview(store, data));
    if (action === '/stage' || action === '/stage/preview') {
      const result = await updateInterview(store, data, action.endsWith('/preview'));
      if (action === '/stage' && data.stage === 'practice') {
        for (const task of await records(db, 'tasks')) {
          if (task.interviewId === data.id && task.status === '待处理') await putRecord(db, 'tasks', { ...task, status: '已完成', completedAt: now() });
        }
      }
      return jsonResponse(result);
    }
    if (action === '/request-analysis') return jsonResponse(await requestInterviewAnalysis(store, asString(data.id)));
    if (action === '/upload') return jsonResponse(await beginInterviewAudio(store, audioBucket(env), context.uid, data));
    if (action === '/upload-complete') return jsonResponse(await completeInterviewAudio(store, audioBucket(env), asString(data.id)));
    if (action === '/audio-link') {
      const session = await getInterview(store, asString(data.id));
      if (!session.audio) throw new InterviewError(404, '录音尚未上传');
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)), b => b.toString(16).padStart(2, '0')).join('');
      const expiresAt = new Date(Date.now() + AUDIO_LINK_TTL_MS).toISOString();
      await putRecord(audioLinks(rawDb), 'audioLinks', { id: token, interview: true, key: `${context.uid}/interviews/${session.id}/original`, expiresAt });
      return jsonResponse({ id: session.id, ...session.audio, durationSeconds: session.durationSeconds, expiresAt,
        url: resolveOrigins(request, env).publicOrigin + '/api/career/interviews/audio/' + token });
    }
    throw new InterviewError(404, '面试接口不存在');
  }

  if (pathname === '/api/career/material-files' || pathname === '/api/career/material-files/content') {
    const requestedKind = url.searchParams.get('kind');
    // The ID photo belongs to the account, so exporting from records needs no saved material.
    const accountPhoto = requestedKind === 'photo' && !url.searchParams.get('id');
    const id = accountPhoto ? '' : validateString(url.searchParams.get('id'), 'id', { required: true, max: 120 });
    const material = accountPhoto ? null : await getRecord(db, 'materials', id) as Material | null;
    if (!accountPhoto && (!material || !material.jobId || !['履歴書', '職務経歴書'].includes(material.kind))) throw new AppError(404, '申请文稿不存在');
    if (pathname.endsWith('/content') || method !== 'GET' || accountPhoto) {
      if (requestedKind !== 'pdf' && requestedKind !== 'photo') throw new AppError(400, '文件类型不支持');
      const kind = requestedKind as MaterialFileKind;
      if (method === 'GET') {
        ensureScopes(context, ['career:read']);
        const meta = await materialFileMeta(rawDb, db.namespace, kind, id);
        if (!meta) throw new AppError(404, '文件不存在');
        if (!env.CAREER_AUDIO) throw new AppError(503, '文件存储未配置（CAREER_AUDIO）');
        const object = await env.CAREER_AUDIO.get(materialFileKey(db.namespace, kind, id));
        if (!object) throw new AppError(404, '文件不存在');
        return new Response(object.body, { headers: {
          'content-type': kind === 'pdf' ? 'application/pdf' : object.httpMetadata?.contentType || 'application/octet-stream',
          'content-length': String(object.size),
          'cache-control': 'private, no-store',
          'x-content-type-options': 'nosniff',
        } });
      }
      if (method === 'POST' || method === 'DELETE') {
        ensureScopes(context, ['career:write']);
        if (context.tokenType === 'mcp') throw new AppError(403, '文件只能由本人在应用中管理');
        if (!env.CAREER_AUDIO) throw new AppError(503, '文件存储未配置（CAREER_AUDIO）');
        if (method === 'DELETE') {
          await deleteMaterialFile(rawDb, env.CAREER_AUDIO, db.namespace, kind, id);
          return jsonResponse({ ok: true });
        }
        try { return jsonResponse(await saveMaterialFile(rawDb, env.CAREER_AUDIO, db.namespace, kind, id, request)); }
        catch (error) { throw new AppError(400, error instanceof Error ? error.message : '文件上传失败'); }
      }
      throw new AppError(405, '请求方法不支持');
    }
    ensureScopes(context, ['career:read']);
    return jsonResponse({
      pdf: await materialFileMeta(rawDb, db.namespace, 'pdf', id),
      photo: await materialFileMeta(rawDb, db.namespace, 'photo', id),
    });
  }

  if (pathname === '/api/career/auth/me' && method === 'GET') {
    return jsonResponse(context);
  }
  if (pathname === '/api/career/articles/manage' && method === 'GET') {
    if (!context.admin && context.mode !== 'off') throw new AppError(403, '仅管理员可管理文章');
    if (context.tokenType === 'mcp') throw new AppError(403, '请在应用中管理文章');
    return jsonResponse({ articles: await listArticles(rawDb, true) });
  }

  if (pathname === '/api/career/questions/by-number' && method === 'GET') {
    ensureScopes(context, ['career:read']);
    const input = url.searchParams.get('number') || '';
    if (!/^(?:Q)?[1-9][0-9]*$/i.test(input)) throw new AppError(400, '问题编号应为 Q123 或 123');
    const number = Number(input.replace(/^q/i, ''));
    if (!Number.isSafeInteger(number)) throw new AppError(400, '问题编号无效');
    const packs = await numberedQuestionSets(db);
    for (const pack of packs) {
      const question = (pack.questions as Record<string, unknown>[]).find(q => q.questionNumber === number);
      if (!question) continue;
      const attempts = (await records(db, 'attempts')).filter(a => a.questionSetId === pack.id && a.questionId === question.id);
      const attemptIds = new Set(attempts.map(a => a.id));
      const reviews = (await records(db, 'reviews')).filter(r => attemptIds.has(r.attemptId));
      return jsonResponse({ reference: 'Q' + number, questionSetId: pack.id, questionSetTitle: pack.title, jobId: pack.jobId, question,
        attempts, reviews, instructions: 'Use questionSetId and question.id for questionSetPatches. Preview, import, then read back. Reference answers are not user answers.' });
    }
    throw new AppError(404, '找不到该编号的问题');
  }

  if (pathname === '/api/career/state' && method === 'GET') {
    ensureScopes(context, ['career:read']);
    const body = await cachedState(db, context.uid, url.searchParams.get('resumeView') === 'summary');
    return new Response(body, { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
  }

  if (method === 'GET' && pathname === '/api/career/personalized-resumes') {
    ensureScopes(context, ['career:read']);
    return jsonResponse(await listPersonalized(rawDb, db.namespace));
  }
  if (method === 'GET' && pathname === '/api/career/material-publications') {
    ensureScopes(context, ['career:read']);
    return jsonResponse(await listMaterialPublications(rawDb, db.namespace));
  }

  if (method === 'GET' && pathname === '/api/career/readings') {
    ensureScopes(context, ['career:read']);
    const entries = await listReadings(rawDb, workspaceKey(db, 'readings'));
    return jsonResponse(url.searchParams.get('include') === 'bank' ? { entries, builtinJapanese: builtinJapanese() } : { entries });
  }
  if (method === 'GET' && pathname === '/api/career/resume') {
    ensureScopes(context, ['career:read']);
    return jsonResponse({ entries: await readResume(rawDb, db.namespace, url.searchParams.get('view') === 'summary') });
  }
  if (method === 'GET' && pathname === '/api/career/resume/overview') {
    ensureScopes(context, ['career:read']);
    return jsonResponse(await resumeOverview(rawDb, db.namespace, { kind: url.searchParams.get('kind') || undefined, language: url.searchParams.get('language') || undefined, archived: url.searchParams.has('archived') ? url.searchParams.get('archived') === 'true' : undefined }));
  }
  if (method === 'GET' && pathname === '/api/career/resume/list') {
    ensureScopes(context, ['career:read']);
    return jsonResponse(await listResume(rawDb, db.namespace, { kind: url.searchParams.get('kind') || undefined, language: url.searchParams.get('language') || undefined, archived: url.searchParams.has('archived') ? url.searchParams.get('archived') === 'true' : undefined }, Number(url.searchParams.get('pageSize') || 20), url.searchParams.get('cursor') || ''));
  }
  if (method === 'GET' && pathname === '/api/career/resume/details') {
    ensureScopes(context, ['career:read']);
    const ids = url.searchParams.getAll('id');
    if (!ids.length) throw new AppError(400, 'at least one id is required');
    return jsonResponse(await resumeDetails(rawDb, db.namespace, ids));
  }
  if (method === 'GET' && pathname === '/api/career/resume/history') {
    ensureScopes(context, ['career:read']);
    return jsonResponse({ entries: await resumeHistory(rawDb, db.namespace, url.searchParams.get('id') || '', url.searchParams.get('view') === 'summary') });
  }

  if (method === 'GET' && pathname === '/api/career/resume/version') {
    ensureScopes(context, ['career:read']);
    const id = url.searchParams.get('id') || '';
    const rawRevision = url.searchParams.get('revision') || '';
    const revision = Number(rawRevision);
    if (!id || !/^[1-9]\d*$/.test(rawRevision) || !Number.isSafeInteger(revision)) {
      throw new AppError(400, 'id and a positive integer revision are required');
    }
    const entry = await resumeVersion(rawDb, db.namespace, id, revision);
    if (!entry) throw new AppError(404, 'Resume version not found');
    return jsonResponse({ entry });
  }
  if (method === 'GET' && pathname === '/api/career/resume/document') {
    ensureScopes(context, ['career:read']);
    const id = url.searchParams.get('id') || '';
    const rawRevision = url.searchParams.get('revision') || '';
    if (!id || !/^[1-9]\d*$/.test(rawRevision)) throw new AppError(400, 'id and a positive integer revision are required');
    const chunk = await resumeDocumentChunk(rawDb, db.namespace, id, Number(rawRevision), Number(url.searchParams.get('offset') || 0), Number(url.searchParams.get('limit') || 12000));
    if (!chunk) throw new AppError(404, 'Document version not found');
    return jsonResponse(chunk);
  }

  // Agent access is granted only through OAuth; the owner can list and revoke it here.
  if (method === 'GET' && pathname === '/api/career/mcp/tokens') {
    if (context.tokenType !== 'firebase') throw new AppError(403, 'Agents cannot manage access tokens');
    return jsonResponse({ tokens: (await gateway.listGrants(context.uid)).map(({ ownerId, ...grant }) => ({ ...grant, ownerUid: ownerId })) });
  }

  if (method === 'GET' && pathname === '/api/career/mcp/activity') {
    if (context.tokenType !== 'firebase') throw new AppError(403, 'Agents cannot read the audit trail');
    const tokenId = url.searchParams.get('tokenId') || null;
    return jsonResponse({ activity: await listActivity(rawDb, context.uid, tokenId, Number(url.searchParams.get('limit') || 50)) });
  }

  if (method === 'POST' && pathname === '/api/career/mcp/tokens') throw new AppError(404, '接口不存在');

  if (method === 'POST' && pathname === '/api/career/mcp/tokens/revoke') {
    if (context.tokenType !== 'firebase') throw new AppError(403, 'Agents cannot manage access tokens');
    const payload = (await request.json()) as Record<string, unknown>;
    const id = validateString(payload.id, 'id', { required: true, max: 120 });
    try { await gateway.revokeGrant(context.uid, id); }
    catch (error) { throw error instanceof AppServerError ? new AppError(400, '未找到 token') : error; }
    return jsonResponse({ ok: true });
  }

  if (pathname === '/api/career/attempts/audio') {
    const id = validateString(url.searchParams.get('id'), 'id', { required: true, max: 120 });
    if (method === 'GET') {
      ensureScopes(context, ['career:read']);
      const attempt = await getRecord(db, 'attempts', id);
      const audio = attempt?.audio as AttemptAudio | undefined;
      if (!attempt || !audio) throw new AppError(404, '这个回答没有录音');
      return attemptAudioResponse(env, audioKey(context.uid, id), audio.contentType);
    }
    if (method === 'POST') {
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '录音只能由本人在应用中上传');
      return jsonResponse(await saveAttemptAudio(db, env, context.uid, id, request));
    }
  }

  if (pathname === '/api/career/reference-speech') {
    if (method !== 'POST') throw new AppError(405, '请求方法不支持');
    ensureScopes(context, ['career:read']);
    if (context.tokenType !== 'firebase') throw new AppError(403, '音声は本人のアプリからのみ再生できます');
    if (!env.CAREER_AUDIO) throw new AppError(503, '音声ストレージが設定されていません');
    if (Number(request.headers.get('content-length') || 0) > 16_000) throw new AppError(413, '请求体过大');
    const body = await request.text();
    if (body.length > 16_000) throw new AppError(413, '请求体过大');
    let payload: Record<string, unknown>;
    try { payload = JSON.parse(body) as Record<string, unknown>; }
    catch { throw new AppError(400, '请求体必须是 JSON 对象'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new AppError(400, '请求体必须是 JSON 对象');
    const packId = validateString(payload.questionSetId, 'questionSetId', { required: true, max: 120 });
    const questionId = validateString(payload.questionId, 'questionId', { required: true, max: 120 });
    const voice = validateString(payload.voice, 'voice', { required: true, max: 80 });
    const source = typeof payload.source === 'string' ? payload.source : '';
    if (!source || source.length > 6_000) throw new AppError(400, '参考回答が正しくありません');
    const pack = await getRecord(db, 'questionSets', packId);
    const question = Array.isArray(pack?.questions) ? pack.questions.find((item: { id?: string }) => item.id === questionId) : null;
    if (!question?.sampleAnswer) throw new AppError(404, '参考回答が見つかりません');
    try {
      return await referenceSpeechResponse({ uid: context.uid, packId, questionId, source, voice,
        sampleAnswer: String(question.sampleAnswer), category: String(question.category || ''),
        bucket: env.CAREER_AUDIO, azureRegion: env.AZURE_SPEECH_REGION, azureKey: env.AZURE_SPEECH_KEY });
    } catch (error) {
      if (error instanceof ReferenceSpeechError) throw new AppError(error.status, error.message);
      throw error;
    }
  }

  if (method !== 'POST') return jsonResponse({ error: '接口不存在' }, { status: 404 });

  const payload = (await request.json()) as Record<string, unknown>;
  if (typeof payload !== 'object' || payload === null) {
    return jsonResponse({ error: '请求体必须是 JSON 对象' }, { status: 400 });
  }

  let result: unknown;
  switch (pathname) {
    case '/api/career/articles/manage':
      if (!context.admin && context.mode !== 'off') throw new AppError(403, '仅管理员可管理文章');
      if (context.tokenType === 'mcp') throw new AppError(403, '请在应用中管理文章');
      return saveArticle(rawDb, payload);
    case '/api/career/personalized-resumes':
      ensureScopes(context, ['career:write']);
      return savePersonalized(rawDb, db.namespace, payload);
    case '/api/career/personalized-resumes/delete':
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '请在应用中确认删除个性化简历');
      return deletePersonalized(rawDb, db.namespace, payload);
    case '/api/career/resume-publications':
    case '/api/career/resume-publications/revoke':
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '请在应用中预览并管理公开链接');
      return pathname.endsWith('/revoke') ? revokePublication(rawDb, db.namespace, payload.id) : publishResume(rawDb, db.namespace, payload);
    case '/api/career/material-publications':
    case '/api/career/material-publications/revoke':
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '请在应用中预览并管理公开链接');
      return pathname.endsWith('/revoke')
        ? revokeMaterialPublication(rawDb, db.namespace, payload.id)
        : publishMaterial(rawDb, db.namespace, payload, await getRecord(db, 'materials', String(payload.materialId || '')) as Material | null);
    case '/api/career/platforms': {
      ensureScopes(context, ['career:write']);
      const kind = 'platforms:' + context.uid;
      const saved = await records(db, kind) as JobPlatform[];
      const old = mergePlatforms(saved).find((p) => p.id === payload.id);
      if (payload.id && !old) return jsonResponse({ error: '平台不存在，请刷新' }, { status: 404 });
      let platform: JobPlatform;
      try { platform = validatePlatform(payload, old); }
      catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : '平台数据无效' }, { status: 400 }); }
      const write = await db.connection.prepare(`INSERT INTO records(kind,id,body) VALUES (?1,?2,?3)
        ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body
        WHERE json_extract(records.body, '$.revision') = ?4`)
        .bind(workspaceKey(db, kind), platform.id, JSON.stringify(platform), old?.revision ?? 0).run();
      if (!write.meta.changes) return jsonResponse({ error: '平台已更新，请刷新后重新编辑' }, { status: 409 });
      result = platform;
      break;
    }
    case '/api/career/resume': {
      ensureScopes(context, ['career:write']);
      const saved = await writeResume(rawDb, db.namespace, workspaceKey(db, 'profile'), payload);
      return jsonResponse(saved.value, { status: saved.status });
    }
    case '/api/career/resume/delete': {
      ensureScopes(context, ['career:write']);
      const deleted = await deleteResumeDocument(rawDb, db.namespace, workspaceKey(db, 'profile'), payload.id as string, payload.revision as number);
      return jsonResponse(deleted.value, { status: deleted.status });
    }
    case '/api/career/readings':
      ensureScopes(context, ['agent:write']);
      try { result = await saveReadings(rawDb, workspaceKey(db, 'readings'), payload, context.tokenType === 'mcp'); }
      catch (error) { throw error instanceof ReadingsError ? new AppError(error.code, error.message) : error; }
      break;
    case '/api/career/profile':
      ensureScopes(context, ['career:write']);
      result = await saveProfile(db, payload);
      break;
    case '/api/career/jobs':
      ensureScopes(context, ['career:write']);
      result = await saveJob(db, payload);
      break;
    case '/api/career/jobs/rating':
      ensureScopes(context, ['career:write']);
      result = await updateJobPersonalField(db, payload, 'rating');
      break;
    case '/api/career/jobs/preference':
      ensureScopes(context, ['career:write']);
      result = await updateJobPersonalField(db, payload, 'preferenceGroup');
      break;
    case '/api/career/jobs/application-doc':
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '应募文书内容只能由本人在应用中保存');
      result = await updateJobPersonalField(db, payload, 'applicationDoc');
      break;
    case '/api/career/jobs/status':
      ensureScopes(context, ['career:write']);
      result = await updateJobStatus(db, payload);
      break;
    case '/api/career/jobs/delete':
      ensureScopes(context, ['career:write']);
      result = await deleteJobs(db, env, context.uid, payload);
      break;
    case '/api/career/question-sets/delete-cleared':
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '已清空题组只能由本人在应用中删除');
      result = await deleteClearedQuestionSets(db, env, context.uid);
      break;
    case '/api/career/tasks':
      ensureScopes(context, ['agent:write']);
      result = await requestTask(db, payload);
      break;
    case '/api/career/attempts':
      ensureScopes(context, ['career:write']);
      result = await saveAttempt(db, payload);
      break;
    case '/api/career/attempts/audio-link':
      ensureScopes(context, ['career:read']);
      result = await createAudioLink(db, env, request, context.uid, validateString(payload.attemptId, 'attemptId', { required: true, max: 120 }));
      break;
    case '/api/career/materials/archive':
      ensureScopes(context, ['career:write']);
      result = { archivedMaterials: await archiveMaterials(db, payload.items) };
      break;
    case '/api/career/materials/review':
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '请在应用中由本人确认材料');
      result = await setMaterialReviewStatus(db, payload);
      break;
    case '/api/career/events/update':
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '请在应用中修改日程；Agent 请导入带 supersedes 的新版本');
      result = await updateEvent(db, payload);
      break;
    case '/api/career/events/remove':
      ensureScopes(context, ['career:write']);
      if (context.tokenType === 'mcp') throw new AppError(403, '请在应用中移除日程；Agent 请导入带 supersedes 的新版本');
      result = await removeEvent(db, payload);
      break;
    case '/api/career/import':
      ensureScopes(context, ['agent:write']);
      result = await importBundle(db, payload, false, { bucket: env.CAREER_AUDIO, uid: context.uid });
      break;
    case '/api/career/import/preview':
      ensureScopes(context, ['agent:write']);
      result = await importBundle(db, payload, true, { bucket: env.CAREER_AUDIO, uid: context.uid });
      break;
    default:
      return jsonResponse({ error: '接口不存在' }, { status: 404 });
  }

  return jsonResponse(result);
};

// Browser origins allowed to call the API: the web app's own origin (which may be a different
// hostname when the static site and the Worker are hosted separately) plus any extra origins
// listed in CAREER_CORS_ORIGINS. Non-browser clients (agents, CLIs, apps) are unaffected.
function allowedCorsOrigin(request: Request, env: Env): string {
  const origin = request.headers.get('origin');
  if (!origin || origin === new URL(request.url).origin) return '';
  let allowed: string[];
  try {
    allowed = [resolveOrigins(request, env).webOrigin, ...(env.CAREER_CORS_ORIGINS || '').split(',').map((item) => normalizeOrigin(item))];
  } catch { return ''; }
  return allowed.includes(origin) ? origin : '';
}

function withCors(response: Response, origin: string): Response {
  if (!origin) return response;
  const out = new Response(response.body, response);
  out.headers.set('access-control-allow-origin', origin);
  out.headers.append('vary', 'Origin');
  return out;
}

const worker = {
  fetch: (
    request: Request<unknown, IncomingRequestCfProperties<unknown>>,
    env: Env,
  ) => {
    const corsOrigin = allowedCorsOrigin(request, env);
    if (request.method === 'OPTIONS' && request.headers.has('access-control-request-method')) {
      if (!corsOrigin) return new Response(null, { status: 403 });
      return withCors(new Response(null, { status: 204, headers: {
        'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
        'access-control-allow-headers': request.headers.get('access-control-request-headers') || 'authorization, content-type',
        'access-control-max-age': '86400',
      } }), corsOrigin);
    }
    return handler(request, env).catch((error: unknown) =>
      jsonResponse({ error: error instanceof AppError || error instanceof InterviewError || error instanceof PracticePlanError || error instanceof SpeechTranscriptionError ? error.message : '本机数据服务处理失败，请重试' },
        { status: error instanceof AppError || error instanceof InterviewError || error instanceof PracticePlanError || error instanceof SpeechTranscriptionError ? error.code : 500 })).then((response) => withCors(response, corsOrigin));
  },
} as unknown as ExportedHandler<Env>;

export default worker;
