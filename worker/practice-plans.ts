import { z } from 'zod';
import { findBuiltinQuestionSet } from '../lib/interview-bank';
import { practiceIdSchema, practicePlanInputSchema, practicePlanContentSchema, practiceContextSchema, practicePlanReviewSchema,
  practicePlanProgress, type PracticePlan, type PracticeContext, type PracticePlanReview } from '../lib/practice-plan';

export class PracticePlanError extends Error { constructor(public code: number, message: string) { super(message); } }
export type PracticePlanStore = {
  connection: D1Database; namespace: string;
  get(kind: string, id: string): Promise<Record<string, unknown> | null>;
  list(kind: string): Promise<Record<string, unknown>[]>;
  put(kind: string, value: Record<string, unknown>): Promise<void>;
};
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new PracticePlanError(400, result.error.issues.map(item => `${item.path.join('.')}: ${item.message}`).join('; '));
  return result.data;
}
const stamp = () => new Date().toISOString();
const key = (store: PracticePlanStore, kind: string) => store.namespace ? JSON.stringify([store.namespace, kind]) : kind;
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function unique(values: string[]) { return values.length === new Set(values).size; }
export async function getPracticePlan(store: PracticePlanStore, id: string, revision?: number): Promise<PracticePlan> {
  parse(practiceIdSchema, id);
  const current = await store.get('practicePlans', id) as PracticePlan | null;
  if (!current) throw new PracticePlanError(404, '练习计划不存在');
  if (revision === undefined || revision === current.revision) return current;
  if (!Number.isSafeInteger(revision) || revision < 1) throw new PracticePlanError(400, '版本号不正确');
  const version = await store.get('practicePlanVersions', `${id}:${revision}`) as PracticePlan | null;
  if (!version) throw new PracticePlanError(404, '计划历史版本不存在');
  return version;
}
async function commit(store: PracticePlanStore, old: PracticePlan, value: PracticePlan) {
  const next = { ...value, revision: old.revision + 1, updatedAt: stamp() };
  const body = JSON.stringify(next);
  if (new TextEncoder().encode(body).length > 800000) throw new PracticePlanError(413, '计划内容过大');
  const results = await store.connection.batch([
    store.connection.prepare(`INSERT INTO records(kind,id,body) SELECT ?1,?2,?3 WHERE EXISTS
      (SELECT 1 FROM records WHERE kind=?4 AND id=?5 AND json_extract(body,'$.revision')=?6)`)
      .bind(key(store, 'practicePlanVersions'), `${old.id}:${next.revision}`, body, key(store, 'practicePlans'), old.id, old.revision),
    store.connection.prepare(`UPDATE records SET body=?1 WHERE kind=?2 AND id=?3 AND json_extract(body,'$.revision')=?4`)
      .bind(body, key(store, 'practicePlans'), old.id, old.revision),
  ]).catch(error => {
    if (String(error).includes('UNIQUE constraint')) throw new PracticePlanError(409, '计划已更新，请重新读取');
    throw error;
  });
  if (!results[1].meta.changes) throw new PracticePlanError(409, '计划已更新，请重新读取');
  return next;
}
async function validateSources(store: PracticePlanStore, input: z.infer<typeof practicePlanInputSchema>) {
  if (input.jobId && !await store.get('jobs', input.jobId)) throw new PracticePlanError(400, '关联职位不存在');
  if (input.interviewId) {
    const interview = await store.get('interviews', input.interviewId);
    if (!interview || (input.jobId && interview.jobId !== input.jobId)) throw new PracticePlanError(400, '关联面试不存在或公司不一致');
  }
  for (const id of input.sourceAttemptIds) if (!await store.get('attempts', id)) throw new PracticePlanError(400, '基准回答不存在');
}
export async function createPracticePlan(store: PracticePlanStore, input: unknown) {
  const data = parse(z.object({ id: practiceIdSchema, input: practicePlanInputSchema }).strict(), input);
  const old = await store.get('practicePlans', data.id) as PracticePlan | null;
  if (old) {
    if (!Object.entries(data.input).every(([field, value]) => same((old as unknown as Record<string, unknown>)[field], value))) throw new PracticePlanError(409, '计划编号已用于其他内容');
    if (!old.content) await requestPracticePlanTask(store, old.id, 'planning');
    return old;
  }
  await validateSources(store, data.input);
  const now = stamp();
  const plan: PracticePlan = { ...data.input, id: data.id, revision: 1, status: 'requested', createdAt: now, updatedAt: now };
  await store.connection.batch([
    store.connection.prepare('INSERT OR IGNORE INTO records(kind,id,body) VALUES (?1,?2,?3)').bind(key(store, 'practicePlans'), data.id, JSON.stringify(plan)),
    store.connection.prepare('INSERT OR IGNORE INTO records(kind,id,body) SELECT ?1,?2,body FROM records WHERE kind=?3 AND id=?4')
      .bind(key(store, 'practicePlanVersions'), `${data.id}:1`, key(store, 'practicePlans'), data.id),
  ]);
  const saved = await getPracticePlan(store, data.id);
  if (!Object.entries(data.input).every(([field, value]) => same((saved as unknown as Record<string, unknown>)[field], value))) throw new PracticePlanError(409, '计划编号已用于其他内容');
  await requestPracticePlanTask(store, data.id, 'planning');
  return saved;
}
export async function editPracticePlan(store: PracticePlanStore, input: unknown) {
  const data = parse(z.object({ id: practiceIdSchema, revision: z.number().int().positive(), input: practicePlanInputSchema }).strict(), input);
  const old = await getPracticePlan(store, data.id);
  if (old.revision !== data.revision) throw new PracticePlanError(409, '计划已更新，请重新读取');
  await validateSources(store, data.input);
  const next = { ...old, ...data.input, status: 'requested' as const };
  delete next.content;
  const saved = await commit(store, old, next);
  await requestPracticePlanTask(store, saved.id, 'planning');
  return saved;
}
export async function listPracticePlans(store: PracticePlanStore) {
  const plans = await store.list('practicePlans') as PracticePlan[];
  const attempts = await store.list('attempts') as { id: string; practiceContext?: unknown }[];
  return { plans: plans.map(plan => {
    const { content, ...summary } = plan;
    return { ...summary, skillCount: content?.skills.length ?? 0, exerciseCount: content?.exercises.length ?? 0, progress: practicePlanProgress(plan, attempts) };
  }) };
}
export async function practicePlanDetail(store: PracticePlanStore, id: string, revision?: number) {
  const plan = await getPracticePlan(store, id, revision);
  const attempts = (await store.list('attempts')).filter(item => (item.practiceContext as PracticeContext | undefined)?.planId === id);
  const reviews = (await store.list('practicePlanReviews')).filter(item => item.planId === id);
  const attemptIds = new Set(attempts.map(item => item.id));
  const answerReviews = (await store.list('reviews')).filter(item => attemptIds.has(item.attemptId));
  return { plan, progress: practicePlanProgress(plan, attempts as { id: string; practiceContext?: unknown }[]),
    attemptIds: [...attemptIds], answerReviewIds: answerReviews.map(item => item.id), reviews };
}
export async function requestPracticePlanTask(store: PracticePlanStore, id: string, kind: 'planning' | 'review', checkpointId = '') {
  const plan = await getPracticePlan(store, id);
  if (kind === 'review' && !plan.content?.checkpoints.some(item => item.id === checkpointId)) throw new PracticePlanError(400, '检查点不存在');
  const taskKind = kind === 'planning' ? '练习计划' : '计划复盘';
  const existing = (await store.list('tasks')).find(item => item.kind === taskKind && item.planId === id && item.planRevision === plan.revision &&
    (typeof item.checkpointId === 'string' ? item.checkpointId : '') === checkpointId && item.status === '待处理');
  if (existing) return existing;
  const task = { id: crypto.randomUUID(), kind: taskKind, planId: id, planRevision: plan.revision, checkpointId,
    jobId: plan.jobId, status: '待处理', createdAt: stamp(), instructions: '使用 career_get_practice_plan_guide。基于目标、期间、时间预算和真实回答准备或调整计划；进度不等于目标达成。' };
  await store.put('tasks', task);
  return task;
}
async function finishTasks(store: PracticePlanStore, planId: string, kind: string, checkpointId = '') {
  for (const task of await store.list('tasks')) if (task.planId === planId && task.kind === kind && task.status === '待处理' &&
    (!checkpointId || task.checkpointId === checkpointId)) await store.put('tasks', { ...task, status: '已完成', completedAt: stamp() });
}
export async function savePracticePlan(store: PracticePlanStore, input: unknown, preview: boolean) {
  const data = parse(z.object({ id: practiceIdSchema, revision: z.number().int().positive(), content: practicePlanContentSchema }).strict(), input);
  const old = await getPracticePlan(store, data.id);
  if (data.revision !== old.revision) throw new PracticePlanError(409, '计划已更新，请重新读取');
  const content = data.content;
  for (const items of [content.skills, content.exercises, content.schedule, content.checkpoints]) if (!unique(items.map(item => item.id))) throw new PracticePlanError(400, '计划内编号重复');
  for (const exercise of content.exercises) {
    if (!unique(exercise.skillIds) || exercise.skillIds.some(id => !content.skills.some(skill => skill.id === id))) throw new PracticePlanError(400, '练习必须关联计划内的能力');
    const pack = findBuiltinQuestionSet(exercise.questionSetId) || await store.get('questionSets', exercise.questionSetId) as { jobId: string; questions?: { id: string }[] } | null;
    if (!pack?.questions?.some(item => item.id === exercise.questionId) || (pack.jobId !== old.jobId && pack.jobId !== 'builtin:general')) throw new PracticePlanError(400, '练习题不存在或不属于关联公司／通用题组');
  }
  const budgets = new Map<string, number>();
  for (const item of content.schedule) {
    if (item.date < old.startDate || item.date > old.endDate || !content.exercises.some(exercise => exercise.id === item.exerciseId)) throw new PracticePlanError(400, '日程必须在计划期间内并关联有效练习');
    const minutes = (budgets.get(item.date) || 0) + item.minutes;
    if (minutes > old.dailyMinutes) throw new PracticePlanError(400, '当天练习超过可用时间');
    budgets.set(item.date, minutes);
  }
  if (content.skills.some(skill => !content.exercises.some(exercise => exercise.skillIds.includes(skill.id))) || content.exercises.some(exercise => !content.schedule.some(item => item.exerciseId === exercise.id))) throw new PracticePlanError(400, '每项能力都需要对应练习，每项练习都需要时间安排');
  if (content.checkpoints.some(item => item.date < old.startDate || item.date > old.endDate) || !content.checkpoints.some(item => item.date === old.endDate)) throw new PracticePlanError(400, '检查点必须在计划期间内，且包含结束日检查');
  const priorAttempts = (await store.list('attempts')).filter(item => (item.practiceContext as PracticeContext | undefined)?.planId === old.id);
  for (const attempt of priorAttempts) {
    const context = attempt.practiceContext as PracticeContext;
    const changed = content.exercises.find(item => item.id === context.exerciseId);
    if (changed && (changed.questionSetId !== attempt.questionSetId || changed.questionId !== attempt.questionId)) throw new PracticePlanError(400, '已练习的编号不能改为其他问题，请创建新练习编号');
    const schedule = content.schedule.find(item => item.id === context.scheduleId);
    if (schedule && schedule.exerciseId !== context.exerciseId) throw new PracticePlanError(400, '已练习的日程编号不能改指其他练习');
  }
  if (preview) return { valid: true, skillCount: content.skills.length, scheduledCount: content.schedule.length };
  const saved = await commit(store, old, { ...old, content, status: old.status === 'requested' ? 'active' : old.status });
  await finishTasks(store, old.id, '练习计划');
  return saved;
}
export async function validatePracticeContext(store: PracticePlanStore, value: unknown, packId: string, questionId: string): Promise<PracticeContext | undefined> {
  if (value === undefined || value === null) return undefined;
  const context = parse(practiceContextSchema, value);
  const current = await getPracticePlan(store, context.planId);
  // Offline answers retain the exact plan version used when recording; later revisions do not erase them.
  const plan = await getPracticePlan(store, context.planId, context.planRevision);
  if (context.planRevision > current.revision) throw new PracticePlanError(400, '计划版本不正确');
  const exercise = plan.content?.exercises.find(item => item.id === context.exerciseId);
  const schedule = plan.content?.schedule.find(item => item.id === context.scheduleId);
  if (!exercise || !schedule || schedule.exerciseId !== exercise.id || exercise.questionSetId !== packId || exercise.questionId !== questionId) throw new PracticePlanError(400, '回答和计划练习不匹配');
  return context;
}
export async function savePracticePlanReview(store: PracticePlanStore, input: unknown, preview: boolean) {
  const data = parse(practicePlanReviewSchema, input);
  const plan = await getPracticePlan(store, data.planId);
  if (data.planRevision !== plan.revision) throw new PracticePlanError(409, '计划已更新，请基于当前计划复盘');
  if (!plan.content?.checkpoints.some(item => item.id === data.checkpointId)) throw new PracticePlanError(400, '检查点不存在');
  if (!unique(data.assessments.map(item => item.skillId))) throw new PracticePlanError(400, '能力评估重复');
  for (const assessment of data.assessments) {
    if (!plan.content.skills.some(item => item.id === assessment.skillId)) throw new PracticePlanError(400, '能力不存在');
    if (assessment.outcome !== 'insufficient_evidence' && !assessment.evidenceAttemptIds.length) throw new PracticePlanError(400, '缺少真实回答时只能标为证据不足');
    for (const id of assessment.evidenceAttemptIds) {
      const attempt = await store.get('attempts', id);
      const context = attempt?.practiceContext as PracticeContext | undefined;
      if (!attempt || context?.planId !== plan.id || !plan.content.exercises.some(exercise => exercise.id === context.exerciseId && exercise.skillIds.includes(assessment.skillId) && exercise.questionSetId === attempt.questionSetId && exercise.questionId === attempt.questionId)) throw new PracticePlanError(400, '评估依据必须是本计划对应能力的真实回答');
    }
  }
  const existing = await store.get('practicePlanReviews', data.id);
  if (existing && Object.entries(data).some(([field, value]) => !same(existing[field], value))) throw new PracticePlanError(409, '复盘编号已用于其他版本');
  if (preview) return { valid: true };
  if (existing) { await finishTasks(store, plan.id, '计划复盘', data.checkpointId); return existing; }
  const result: PracticePlanReview = { ...data, createdAt: stamp() };
  await store.connection.prepare('INSERT INTO records(kind,id,body) VALUES (?1,?2,?3)').bind(key(store, 'practicePlanReviews'), result.id, JSON.stringify(result)).run();
  await finishTasks(store, plan.id, '计划复盘', data.checkpointId);
  return result;
}
export async function setPracticePlanStatus(store: PracticePlanStore, input: unknown) {
  const data = parse(z.object({ id: practiceIdSchema, revision: z.number().int().positive(), status: z.enum(['active', 'paused', 'completed']) }).strict(), input);
  const old = await getPracticePlan(store, data.id);
  if (old.revision !== data.revision) throw new PracticePlanError(409, '计划已更新，请重新读取');
  if (!old.content) throw new PracticePlanError(400, '先完成计划制定');
  if (old.status === data.status) return old;
  return commit(store, old, { ...old, status: data.status });
}
