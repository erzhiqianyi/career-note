import { verifyFirebaseToken, allowedAccount } from './firebase-auth';
import { mergePlatforms, validatePlatform, type JobPlatform } from '../lib/job-platforms';
import type { ExportedHandler } from '@cloudflare/workers-types';

type JobStatus = '关注中' | '准备投递' | '已投递' | '书类选考' | '面试中' | '内定' | '未通过' | '已撤回';
type JobPriority = '高' | '普通' | '低';
type McpScope = 'career:read' | 'career:write' | 'agent:write' | 'admin';
type FirebaseClaim = Record<string, unknown>;
type TaskKind = '每日分析' | '公司准备' | '职位研究' | '回答点评';
type MaterialKind = '履歴書' | '職務経歴書' | '志望動機' | '面试准备' | '公司研究';

type Env = {
  CAREER_DB: D1Database;
  CAREER_AUTH_MODE?: string;
  CAREER_ADMIN_UIDS?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_API_KEY?: string;
  FIREBASE_AUTH_DOMAIN?: string;
  FIREBASE_APP_ID?: string;
  CAREER_ALLOWED_UIDS?: string;
  CAREER_ALLOWED_EMAILS?: string;
  MCP_TOKEN_TTL_DAYS?: string;
};

type AuthContext = {
  uid: string;
  admin: boolean;
  mode: 'off' | 'on' | 'strict';
  claims: FirebaseClaim;
  tokenType: 'firebase' | 'mcp';
  scopes: McpScope[];
};

type McpTokenRow = {
  id: string;
  token_hash: string;
  token_prefix: string;
  name: string;
  owner_uid: string;
  scopes: string;
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked: number;
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

const STATUSES: JobStatus[] = ['关注中', '准备投递', '已投递', '书类选考', '面试中', '内定', '未通过', '已撤回'];
const PRIORITIES: JobPriority[] = ['高', '普通', '低'];
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

const MCP_TOKEN_PREFIX = 'mcp_';

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

function randomTokenString() {
  return `${MCP_TOKEN_PREFIX}${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '')}`;
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

function validateDate(value: string, field: string) {
  if (!value) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new AppError(400, `日期不正确：${field}`);
  return value;
}

function ensureDb(env: Env): D1Database {
  if (!env.CAREER_DB) throw new AppError(500, 'CAREER_DB not bound');
  return env.CAREER_DB;
}

async function ensureSchema(db: D1Database): Promise<void> {
  await db.exec(
    `CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (kind,id));`,
  );
  await db.exec(`CREATE TABLE IF NOT EXISTS meta (id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS mcp_tokens (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      token_prefix TEXT NOT NULL,
      name TEXT NOT NULL,
      owner_uid TEXT NOT NULL,
      scopes TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT,
      revoked INTEGER NOT NULL DEFAULT 0,
      last_used_at TEXT
    );
  `).run();
}

async function records(db: D1Database, kind: string): Promise<Record<string, unknown>[]> {
  const result = await db
    .prepare('SELECT body FROM records WHERE kind = ?1 ORDER BY rowid DESC')
    .bind(kind)
    .all<{ body: string }>();
  return (result.results || []).map((row) => JSON.parse(row.body));
}

async function getRecord(db: D1Database, kind: string, id: string) {
  const result = await db
    .prepare('SELECT body FROM records WHERE kind=?1 AND id=?2')
    .bind(kind, id)
    .first<{ body: string }>();
  return result ? JSON.parse(result.body) : null;
}

async function putRecord(db: D1Database, kind: string, item: Record<string, unknown>) {
  const id = String(item.id || '');
  if (!id) throw new AppError(400, '缺少 id');
  await db
    .prepare(
      'INSERT INTO records(kind,id,body) VALUES (?1, ?2, ?3) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body',
    )
    .bind(kind, id, JSON.stringify(item))
    .run();
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
    updatedAt: '',
  };
}

async function getMeta(db: D1Database) {
  const row = await db
    .prepare("SELECT body FROM meta WHERE id='profile'")
    .first<{ body: string }>();
  if (row?.body) return JSON.parse(row.body);
  return null;
}

async function putMeta(db: D1Database, id: string, body: Record<string, unknown>) {
  await db
    .prepare(
      'INSERT INTO meta VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET body=excluded.body',
    )
    .bind(id, JSON.stringify(body))
    .run();
}

async function getProfile(db: D1Database) {
  return (await getMeta(db)) || defaultProfile();
}

async function state(db: D1Database, uid = 'local') {
  const profile = await getProfile(db);
  return {
    platforms: mergePlatforms(await records(db, 'platforms:' + uid) as JobPlatform[]),
    jobs: await records(db, 'jobs'),
    profile,
    materials: await records(db, 'materials'),
    reports: await records(db, 'reports'),
    tasks: await records(db, 'tasks'),
    today: today(),
    questionSets: await records(db, 'questionSets'),
    attempts: await records(db, 'attempts'),
    reviews: await records(db, 'reviews'),
  };
}

function validateTaskKind(kind: string): kind is TaskKind {
  return ['每日分析', '公司准备', '职位研究', '回答点评'].includes(kind);
}

async function saveProfile(db: D1Database, data: Record<string, unknown>) {
  const old = (await state(db)).profile;
  if (data.revision !== old.revision) throw new AppError(400, '资料已更新，请刷新后重新编辑');
  const result = {
    summary: validateString(data.summary, 'summary', { max: 100000 }),
    skills: validateString(data.skills, 'skills', { max: 100000 }),
    experience: validateString(data.experience, 'experience', { max: 100000 }),
    targetRoles: validateString(data.targetRoles, 'targetRoles', { max: 100000 }),
    japanese: validateString(data.japanese, 'japanese', { max: 100000 }),
    conditions: validateString(data.conditions, 'conditions', { max: 100000 }),
    sourcePath: validateString(data.sourcePath, 'sourcePath', { max: 100000 }),
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
    role: validateString(data.role, 'role', { required: true, max: 1000 }),
    url: validateString(data.url, 'url', { max: 2000 }),
    description: validateString(data.description, 'description', { max: 100000 }),
    requirements: validateString(data.requirements, 'requirements', { max: 100000 }),
    business: validateString(data.business, 'business', { max: 100000 }),
    japanese: validateString(data.japanese, 'japanese', { max: 100000 }),
    foreigner: validateString(data.foreigner, 'foreigner', { max: 100000 }),
    visa: validateString(data.visa, 'visa', { max: 100000 }),
    salary: validateString(data.salary, 'salary', { max: 100000 }),
    location: validateString(data.location, 'location', { max: 1000 }),
    sourceDate: validateString(data.sourceDate, 'sourceDate', { max: 64 }),
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
  return result;
}

async function saveJob(db: D1Database, data: Record<string, unknown>, researchOnly = false) {
  const key = data.id ? validateString(data.id, 'id', { required: true, max: 120 }) : toId();
  const old = await getRecord(db, 'jobs', key);
  if (old && !researchOnly && data.revision !== old.revision) {
    throw new AppError(400, '职位已更新，请刷新后重新编辑');
  }

  const base: Record<string, unknown> = {
    ...((old || {}) as Record<string, unknown>),
    ...validateResearch(data),
    id: key,
  };

  if (!researchOnly) {
    const status = validateString(data.status, 'status', { required: true, max: 20 }) as JobStatus;
    const priority = validateString(data.priority, 'priority', { required: true, max: 20 }) as JobPriority;
    const nextAction = validateString(data.nextAction, 'nextAction', { max: 100000 });
    const nextDate = validateString(data.nextDate, 'nextDate', { max: 20 });
    const notes = validateString(data.notes, 'notes', { max: 100000 });

    if (!STATUSES.includes(status as JobStatus)) throw new AppError(400, '无效的投递状态');
    if (!PRIORITIES.includes(priority as JobPriority)) throw new AppError(400, '无效的优先级');
    if (nextDate) validateDate(nextDate, 'nextDate');

    base.status = status;
    base.priority = priority;
    base.nextAction = nextAction;
    base.nextDate = nextDate;
    base.notes = notes;
    const history = [...((old?.history as unknown[]) || [])] as Array<{ status: string; at: string }>;
    if (!old || old.status !== status) history.push({ status, at: now() });
    base.history = history;
    base.revision = (old ? Number(old.revision) : 0) + 1;
    base.updatedAt = now();
  }

  if (researchOnly && old) {
    base.history = old.history || [];
    base.status = old.status || '关注中';
    base.priority = old.priority || '普通';
    base.nextAction = old.nextAction || '';
    base.nextDate = old.nextDate || '';
    base.notes = old.notes || '';
    base.revision = Number(old.revision || 0);
    base.updatedAt = old.updatedAt || now();
  }

  if (researchOnly && !old) {
    base.status = '关注中';
    base.priority = '普通';
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

async function requestTask(db: D1Database, data: Record<string, unknown>) {
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
    instructions: validateString(data.instructions, 'instructions', { max: 100000 }),
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
    const node: ParsedQuestion = {
      id: validateString(q.id, 'id', { required: true, max: 120 }),
      title: validateString(q.title, 'title', { required: true, max: 200 }),
      questionJa: validateString(q.questionJa, 'questionJa', { required: true, max: 5000 }),
      meaning: validateString(q.meaning, 'meaning', { required: true, max: 5000 }),
      why: validateString(q.why, 'why', { required: true, max: 5000 }),
      outline: validateString(q.outline, 'outline', { required: true, max: 10000 }),
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
  return parsed;
}

async function importQuestionSet(db: D1Database, data: Record<string, unknown>) {
  const key = validateString(data.id, 'id', { required: true, max: 120 });
  if (await getRecord(db, 'questionSets', key)) throw new AppError(400, '题组已存在，请使用新的版本 id');
  const jobId = validateString(data.jobId, 'jobId', { required: true, max: 120 });
  if (!(await getRecord(db, 'jobs', jobId))) throw new AppError(400, '题组关联的职位不存在');
  const result = {
    id: key,
    jobId,
    title: validateString(data.title, 'title', { required: true, max: 1000 }),
    scenario: validateString(data.scenario, 'scenario', { required: true, max: 5000 }),
    plan: validateString(data.plan, 'plan', { required: true, max: 5000 }),
    sourceNotes: validateString(data.sourceNotes, 'sourceNotes', { required: true, max: 15000 }),
    candidateContext: validateString(data.candidateContext, 'candidateContext', { max: 15000 }),
    communicationGuide: validateString(data.communicationGuide, 'communicationGuide', { max: 15000 }),
    questions: parseQuestionSetQuestions((data.questions as unknown[]) || []),
    createdAt: now(),
  };
  await putRecord(db, 'questionSets', result);
  return result;
}

async function importReview(db: D1Database, data: Record<string, unknown>) {
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

async function saveAttempt(db: D1Database, data: Record<string, unknown>) {
  const questionSetId = validateString(data.questionSetId, 'questionSetId', { required: true, max: 120 });
  const questionId = validateString(data.questionId, 'questionId', { required: true, max: 120 });
  const attemptPack = await getRecord(db, 'questionSets', questionSetId);
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
    questionSetId,
    questionId,
    question,
    jobId: attemptPack.jobId,
    answer: validateString(data.answer, 'answer', { required: true, max: 20000 }),
    language,
    durationSeconds: duration,
    profileRevision: (await getProfile(db)).revision,
    createdAt: now(),
  };
  await putRecord(db, 'attempts', attempt);

  if (data.requestReview === true) {
    await requestTask(db, {
      kind: '回答点评',
      jobId: attemptPack.jobId,
      attemptId: attempt.id,
      instructions: '',
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

async function sha256Hex(raw: string): Promise<string> {
  const value = new TextEncoder().encode(raw);
  const hashed = await crypto.subtle.digest('SHA-256', value);
  return [...new Uint8Array(hashed)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function parseScopes(raw: string): McpScope[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is McpScope => typeof value === 'string' && value.includes(':') as boolean);
    }
  } catch {}
  return [];
}

async function verifyMcpToken(db: D1Database, token: string): Promise<AuthContext> {
  const hashed = await sha256Hex(token);
  const row = await db
    .prepare('SELECT * FROM mcp_tokens WHERE token_hash = ?1')
    .bind(hashed)
    .first<McpTokenRow>();
  if (!row) throw new AppError(401, 'Invalid MCP token');
  if (row.revoked === 1) throw new AppError(401, 'MCP token revoked');
  if (row.expires_at && row.expires_at < now()) throw new AppError(401, 'MCP token expired');

  const scopes = parseScopes(row.scopes);
  await db
    .prepare('UPDATE mcp_tokens SET last_used_at = ?1 WHERE id = ?2')
    .bind(now(), row.id)
    .run();

  return {
    uid: row.owner_uid,
    admin: scopes.includes('admin'),
    mode: 'on',
    claims: { mcp: true, tokenId: row.id },
    tokenType: 'mcp',
    scopes,
  };
}

async function getAuthContext(request: Request, env: Env, db: D1Database): Promise<AuthContext> {
  const mode = ensureMode(env);
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
  if (token.startsWith(MCP_TOKEN_PREFIX)) {
    return await verifyMcpToken(db, token);
  }

  if (!env.FIREBASE_PROJECT_ID) throw new AppError(503, '请配置 FIREBASE_PROJECT_ID');
  let payload;
  try { payload = await verifyFirebaseToken(token, env.FIREBASE_PROJECT_ID); }
  catch { throw new AppError(401, 'Google 登录已失效，请重新登录'); }
  if (!allowedAccount(payload, env.CAREER_ALLOWED_UIDS, env.CAREER_ALLOWED_EMAILS)) {
    throw new AppError(403, '此 Google 账号未获工作区访问权限，请配置允许的账号');
  }
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

function isExpiredAt(raw: string | null) {
  if (!raw) return false;
  return raw < now();
}

async function listMcpTokens(db: D1Database, context: AuthContext) {
  const result =
    context.admin
      ? await db.prepare('SELECT * FROM mcp_tokens ORDER BY created_at DESC').all<McpTokenRow>()
      : await db
          .prepare('SELECT * FROM mcp_tokens WHERE owner_uid = ?1 ORDER BY created_at DESC')
          .bind(context.uid)
          .all<McpTokenRow>();

  const rows = result.results || [];

  return rows
    .filter((row) => !isExpiredAt(row.expires_at))
    .map((row) => ({
      id: row.id,
      name: row.name,
      ownerUid: row.owner_uid,
      scopes: parseScopes(row.scopes),
      createdAt: row.created_at,
      expiresAt: row.expires_at || '',
      lastUsedAt: row.last_used_at || '',
      revoked: row.revoked === 1,
      prefix: row.token_prefix,
    }));
}

function toId() {
  return crypto.randomUUID();
}

function envDays(env: Env): number {
  const parsed = Number(env.MCP_TOKEN_TTL_DAYS);
  if (Number.isFinite(parsed) && parsed > 0 && parsed <= 365) return parsed;
  return 30;
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

async function createMcpToken(db: D1Database, env: Env, context: AuthContext, payload: Record<string, unknown>) {
  const name = validateString(payload.name, 'name', { required: true, max: 200 }) || 'MCP Token';
  const days = Number(payload.expiresInDays || envDays(env));
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new AppError(400, 'expiresInDays 需要 1-365');
  const raw = randomTokenString();
  const tokenHash = await sha256Hex(raw);
  const scopeRaw = payload.scopes;
  const scopes =
    Array.isArray(scopeRaw) && scopeRaw.length > 0
      ? scopeRaw.filter((value): value is string => typeof value === 'string')
      : ['career:read', 'career:write', 'agent:write'];

  const createdAt = now();
  const expiresAt = new Date(Date.now() + days * 86400 * 1000).toISOString();
  const id = toId();
  const prefix = raw.slice(0, 8);

  await db
    .prepare(
      'INSERT INTO mcp_tokens(id, token_hash, token_prefix, name, owner_uid, scopes, created_at, expires_at, revoked, last_used_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, NULL)',
    )
    .bind(id, tokenHash, prefix, name, context.uid, JSON.stringify(scopes), createdAt, expiresAt)
    .run();

  return {
    token: raw,
    record: {
      id,
      name,
      ownerUid: context.uid,
      scopes,
      createdAt,
      expiresAt,
      revoked: false,
      prefix,
    },
  };
}

async function revokeMcpToken(db: D1Database, id: string) {
  const row = await db
    .prepare('SELECT id FROM mcp_tokens WHERE id = ?1')
    .bind(id)
    .first<{ id: string }>();
  if (!row) throw new AppError(400, '未找到 token');
  await db.prepare('UPDATE mcp_tokens SET revoked = 1 WHERE id = ?1').bind(id).run();
  return true;
}

async function importBundle(db: D1Database, data: Record<string, unknown>, preview = false) {
  if (Number(data.schemaVersion) !== 1) throw new AppError(400, '需要 schemaVersion: 1 的 JSON 数据包');

  for (const key of Object.keys(data)) {
    if (!['schemaVersion', 'jobs', 'materials', 'reports', 'questionSets', 'reviews', 'completeTaskIds'].includes(key)) {
      throw new AppError(400, '数据包包含未知字段');
    }
  }

  const counts: Record<string, number> = {
    jobs: 0,
    materials: 0,
    reports: 0,
    questionSets: 0,
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
        if (
          ['status', 'history', 'notes', 'nextDate', 'nextAction', 'priority', 'revision'].some(
            (field) => Object.prototype.hasOwnProperty.call(obj, field),
          )
        ) {
          throw new AppError(400, 'Agent 导入不能修改投递状态或个人跟进信息，请在网页编辑');
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

        const related = allJobs.find((job) => job.id === jobId) as Record<string, unknown> | undefined;
        if (!related) throw new AppError(400, '材料关联的职位不存在');

        if (!preview) {
          await putRecord(db, 'materials', {
            id: key,
            title,
            content,
            sourceNotes,
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

        if (!preview) {
          await putRecord(db, 'reports', {
            id: key,
            date,
            title,
            content,
            sourceNotes,
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

  const completeTaskIds = data.completeTaskIds;
  if (!Array.isArray(completeTaskIds)) throw new AppError(400, 'completeTaskIds 必须是数组');
  for (const taskValue of completeTaskIds) {
    const taskId = validateString(taskValue, 'taskId', { required: true, max: 120 });
    const task = await getRecord(db, 'tasks', taskId);
    if (!task) throw new AppError(400, '待处理任务不存在');
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

const handler = async (
  request: Request<unknown, IncomingRequestCfProperties<unknown>>,
  env: Env,
) => {
  if (new URL(request.url).pathname === '/api/career/auth/config' && request.method === 'GET') {
    const firebase = env.FIREBASE_API_KEY && env.FIREBASE_AUTH_DOMAIN && env.FIREBASE_PROJECT_ID && env.FIREBASE_APP_ID
      ? {apiKey: env.FIREBASE_API_KEY, authDomain: env.FIREBASE_AUTH_DOMAIN, projectId: env.FIREBASE_PROJECT_ID, appId: env.FIREBASE_APP_ID}
      : null;
    return jsonResponse({mode: ensureMode(env), firebase});
  }
  const db = ensureDb(env);
  await ensureSchema(db);

  const url = new URL(request.url);
  const pathname = url.pathname;
  if (!pathname.startsWith('/api/career')) {
    return jsonResponse({ error: '接口不存在' }, { status: 404 });
  }

  const method = request.method.toUpperCase();
  let context: AuthContext;
  try {
    context = await getAuthContext(request, env, db);
  } catch (error) {
    if (error instanceof AppError) {
      return jsonResponse({ error: error.message }, { status: error.code });
    }
    return jsonResponse({ error: '未授权' }, { status: 401 });
  }

  if (pathname === '/api/career/auth/me' && method === 'GET') {
    return jsonResponse(context);
  }

  if (pathname === '/api/career/state' && method === 'GET') {
    ensureScopes(context, ['career:read']);
    return jsonResponse(await state(db, context.uid));
  }

  if (method === 'GET' && pathname === '/api/career/mcp/tokens') {
    if (!context.admin) return jsonResponse({ error: '管理员才能查看 MCP token' }, { status: 403 });
    return jsonResponse({ tokens: await listMcpTokens(db, context) });
  }

  if (method === 'POST' && pathname === '/api/career/mcp/tokens') {
    if (!context.admin) return jsonResponse({ error: '管理员才能创建 MCP token' }, { status: 403 });
    ensureScopes(context, ['admin']);
    const payload = (await request.json()) as Record<string, unknown>;
    return jsonResponse(await createMcpToken(db, env, context, payload));
  }

  if (method === 'POST' && pathname === '/api/career/mcp/tokens/revoke') {
    if (!context.admin) return jsonResponse({ error: '管理员才能撤销 MCP token' }, { status: 403 });
    ensureScopes(context, ['admin']);
    const payload = (await request.json()) as Record<string, unknown>;
    const id = validateString(payload.id, 'id', { required: true, max: 120 });
    await revokeMcpToken(db, id);
    return jsonResponse({ ok: true });
  }

  if (method !== 'POST') return jsonResponse({ error: '接口不存在' }, { status: 404 });

  const payload = (await request.json()) as Record<string, unknown>;
  if (typeof payload !== 'object' || payload === null) {
    return jsonResponse({ error: '请求体必须是 JSON 对象' }, { status: 400 });
  }

  let result: unknown;
  switch (pathname) {
    case '/api/career/platforms': {
      ensureScopes(context, ['career:write']);
      const kind = 'platforms:' + context.uid;
      const saved = await records(db, kind) as JobPlatform[];
      const old = mergePlatforms(saved).find((p) => p.id === payload.id);
      if (payload.id && !old) return jsonResponse({ error: '平台不存在，请刷新' }, { status: 404 });
      let platform: JobPlatform;
      try { platform = validatePlatform(payload, old); }
      catch (error) { return jsonResponse({ error: error instanceof Error ? error.message : '平台数据无效' }, { status: 400 }); }
      const write = await db.prepare(`INSERT INTO records(kind,id,body) VALUES (?1,?2,?3)
        ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body
        WHERE json_extract(records.body, '$.revision') = ?4`)
        .bind(kind, platform.id, JSON.stringify(platform), old?.revision ?? 0).run();
      if (!write.meta.changes) return jsonResponse({ error: '平台已更新，请刷新后重新编辑' }, { status: 409 });
      result = platform;
      break;
    }
    case '/api/career/profile':
      ensureScopes(context, ['career:write']);
      result = await saveProfile(db, payload);
      break;
    case '/api/career/jobs':
      ensureScopes(context, ['career:write']);
      result = await saveJob(db, payload);
      break;
    case '/api/career/tasks':
      ensureScopes(context, ['agent:write']);
      result = await requestTask(db, payload);
      break;
    case '/api/career/attempts':
      ensureScopes(context, ['career:write']);
      result = await saveAttempt(db, payload);
      break;
    case '/api/career/import':
      ensureScopes(context, ['agent:write']);
      result = await importBundle(db, payload, false);
      break;
    case '/api/career/import/preview':
      ensureScopes(context, ['agent:write']);
      result = await importBundle(db, payload, true);
      break;
    default:
      return jsonResponse({ error: '接口不存在' }, { status: 404 });
  }

  return jsonResponse(result);
};

const worker = {
  fetch: (
    request: Request<unknown, IncomingRequestCfProperties<unknown>>,
    env: Env,
  ) => handler(request, env).catch((error: unknown) =>
    jsonResponse({ error: error instanceof AppError ? error.message : '本机数据服务处理失败，请重试' },
      { status: error instanceof AppError ? error.code : 500 })),
} as unknown as ExportedHandler<Env>;

export default worker;
