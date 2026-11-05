import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, createFetchMock } from 'miniflare';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';
import { authorizeAgent } from './oauth-client.mjs';

const bundle = await build({ entryPoints: ['worker/index.ts'], bundle: true, write: false, format: 'esm', platform: 'browser', conditions: ['workerd'], target: 'es2022' });
const root = 'http://local/api/career/';
const input = { title: '架空の表現練習', goal: '質問に結論から答えられる', currentSituation: '未評価。初回回答から確認。',
  startDate: '2026-11-05', endDate: '2027-02-01', dailyMinutes: 20, jobId: '', interviewId: '', sourceAttemptIds: [] };
const content = { baselineAnalysis: 'まだ実際の回答がなく、初回に確認する。', successCriteria: '質問に答える一文と具体例を自分で説明できる。', sourceNotes: 'Fictional user goal; baseline unknown.',
  skills: [{ id: 'clarity', title: '結論を先に言う', baseline: '未評価。', target: '最初の一文で質問に答える。', priority: 1 }],
  exercises: [{ id: 'short-answer', title: '自己紹介を短く話す', skillIds: ['clarity'], instructions: '三つのキーワードを考え、録音し、一つ改善して再録音する。', questionSetId: 'builtin-basics', questionId: 'self-intro' }],
  schedule: [{ id: 'first-session', date: '2026-11-05', exerciseId: 'short-answer', minutes: 15, targetAttempts: 2 },
    { id: 'final-session', date: '2027-02-01', exerciseId: 'short-answer', minutes: 15, targetAttempts: 1 }],
  checkpoints: [{ id: 'final', date: '2027-02-01', title: '目標確認', criteria: '初回と直近の回答を比較し、結論が先に出ているか確認する。' }] };
async function host(t, options = {}) {
  const mf = new Miniflare({ modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-05-22', d1Databases: ['CAREER_DB'], r2Buckets: ['CAREER_AUDIO'], ...options });
  t.after(() => mf.dispose()); return mf;
}
function api(mf, token) {
  return async (path, body, status = 200, extra = {}) => {
    const response = await mf.dispatchFetch(root + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...extra },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const data = await response.json(); assert.equal(response.status, status, JSON.stringify(data)); return data;
  };
}
const change = (plan, value = content) => ({ id: plan.id, revision: plan.revision, content: value });
const answer = (plan, clientRequestId, extra = {}) => ({ clientRequestId, questionSetId: 'builtin-basics', questionId: 'self-intro',
  answer: 'Javaの開発を担当しました。', language: '日语', durationSeconds: 35, requestReview: true,
  practiceContext: { planId: plan.id, planRevision: plan.revision, exerciseId: 'short-answer', scheduleId: 'first-session', keywords: 'Java・担当・具体例' }, ...extra });

test('goal-based plans validate arbitrary dates, skill/exercise links, daily budget, preview and immutable versions', async t => {
  const send = api(await host(t));
  const plan = await send('practice-plans', { id: 'flexible-plan', input });
  assert.equal(plan.status, 'requested');
  assert.equal((await send('practice-plans', { id: plan.id, input })).revision, 1);
  assert.equal((await send('state')).tasks.filter(item => item.planId === plan.id).length, 1);
  await send('practice-plans', { id: plan.id, input: { ...input, goal: 'Different' } }, 409);
  await send('practice-plans', { id: 'bad-date', input: { ...input, endDate: '2026-02-30' } }, 400);
  await send('practice-plans', { id: 'reverse', input: { ...input, endDate: '2026-01-01' } }, 400);
  await send('practice-plans', { id: 'private-source', input: { ...input, sourceAttemptIds: ['missing'] } }, 400);
  const task = (await send('state')).tasks.find(item => item.planId === plan.id);
  await send('import/preview', { schemaVersion: 1, completeTaskIds: [task.id] }, 400);
  await send('practice-plans/save/preview', change(plan));
  assert.equal((await send('practice-plans/detail?id=' + plan.id)).plan.content, undefined);
  for (const invalid of [
    { ...content, schedule: [{ ...content.schedule[0], date: '2027-02-02' }] },
    { ...content, schedule: [{ ...content.schedule[0], minutes: 21 }] },
    { ...content, schedule: [content.schedule[0], { ...content.schedule[0], id: 'extra', minutes: 10 }] },
    { ...content, exercises: [{ ...content.exercises[0], skillIds: ['missing'] }] },
    { ...content, exercises: [{ ...content.exercises[0], questionId: 'missing' }] },
    { ...content, checkpoints: [{ ...content.checkpoints[0], date: '2026-11-20' }] },
    { ...content, skills: [...content.skills, { ...content.skills[0], id: 'untrained' }] },
  ]) await send('practice-plans/save', change(plan, invalid), 400);
  const active = await send('practice-plans/save', change(plan));
  assert.equal(active.status, 'active'); assert.equal(active.goal, input.goal); assert.equal(active.endDate, '2027-02-01');
  assert.equal((await send('state')).tasks.find(item => item.id === task.id).status, '已完成');
  const history = await send('practice-plans/history?id=' + plan.id);
  assert.equal(history.versions.length, 2);
  assert.equal((await send(`practice-plans/detail?id=${plan.id}&revision=1`)).plan.content, undefined);
  await send('practice-plans/save', change(plan), 409);
});

test('real planned answers and offline retries drive progress; adaptations preserve evidence without automatic achievement', async t => {
  const send = api(await host(t));
  let plan = await send('practice-plans', { id: 'progress-plan', input });
  plan = await send('practice-plans/save', change(plan));
  const originalRevision = plan.revision;
  const firstPayload = answer(plan, 'planned-first');
  const first = await send('attempts', firstPayload);
  assert.equal(first.practiceContext.planRevision, plan.revision);
  assert.equal((await send('attempts', { ...firstPayload, practiceContext: Object.fromEntries(Object.entries(firstPayload.practiceContext).reverse()) })).id, first.id);
  await send('attempts', { ...firstPayload, practiceContext: { ...firstPayload.practiceContext, keywords: 'Changed input' } }, 409);
  await send('attempts', answer(plan, 'wrong-exercise', { practiceContext: { ...firstPayload.practiceContext, exerciseId: 'missing' } }), 400);
  await send('attempts', { clientRequestId: 'unassociated', questionSetId: 'builtin-basics', questionId: 'self-intro', answer: '通常練習', language: '日语', durationSeconds: 20 });
  let detail = await send('practice-plans/detail?id=' + plan.id);
  assert.equal(detail.progress.items[0].savedAttempts, 1); assert.equal(detail.progress.completed, 0);
  const adapted = { ...content, baselineAnalysis: '初回回答を確認して調整。', sourceNotes: 'Fictional first attempt ' + first.id };
  plan = await send('practice-plans/save', change(plan, adapted));
  // Offline answer recorded under the prior version still links to that exact snapshot.
  const second = await send('attempts', answer({ ...plan, revision: originalRevision }, 'offline-second'));
  assert.equal(second.practiceContext.planRevision, originalRevision);
  detail = await send('practice-plans/detail?id=' + plan.id);
  assert.equal(detail.progress.items[0].savedAttempts, 2); assert.equal(detail.progress.completed, 1);
  assert.equal(detail.attemptIds.length, 2);
  await send('practice-plans/save', change(plan, { ...adapted, exercises: [{ ...adapted.exercises[0], questionId: 'strengths' }] }), 400);
  assert.equal((await send(`practice-plans/detail?id=${plan.id}&revision=${originalRevision}`)).plan.content.baselineAnalysis, content.baselineAnalysis);
  const reviewTask = await send('practice-plans/request', { id: plan.id, kind: 'review', checkpointId: 'final' });
  await send('import', { schemaVersion: 1, completeTaskIds: [reviewTask.id] }, 400);
  const evaluation = { id: 'checkpoint-evaluation', planId: plan.id, planRevision: plan.revision, checkpointId: 'final', summary: '結論を先に話せた例がある。', nextActions: '別の質問でも確認。', sourceNotes: 'Two saved fixture answers.',
    assessments: [{ skillId: 'clarity', outcome: 'reached', evidenceAttemptIds: [first.id, second.id], notes: '実回答を根拠にした定性的判断。' }] };
  await send('practice-plans/review', { ...evaluation, assessments: [{ ...evaluation.assessments[0], evidenceAttemptIds: [] }] }, 400);
  await send('practice-plans/review', { ...evaluation, assessments: [{ ...evaluation.assessments[0], evidenceAttemptIds: ['fabricated'] }] }, 400);
  await send('practice-plans/review/preview', evaluation);
  assert.equal((await send('state')).practicePlanReviews.length, 0);
  await send('practice-plans/review', evaluation);
  await send('practice-plans/review', evaluation);
  assert.equal((await send('state')).practicePlanReviews.length, 1);
  await send('practice-plans/review', { ...evaluation, summary: 'Overwrite' }, 409);
  assert.equal((await send('state')).tasks.find(item => item.id === reviewTask.id).status, '已完成');
  assert.equal((await send('practice-plans/detail?id=' + plan.id)).plan.status, 'active');
  const paused = await send('practice-plans/status', { id: plan.id, revision: plan.revision, status: 'paused' });
  const completed = await send('practice-plans/status', { id: plan.id, revision: paused.revision, status: 'completed' });
  assert.equal(completed.status, 'completed');
  const changed = await send('practice-plans/edit', { id: plan.id, revision: completed.revision, input: { ...input, goal: '新しい本人の目標', endDate: '2027-03-01' } });
  assert.equal(changed.status, 'requested'); assert.equal(changed.content, undefined);
  assert.equal((await send('state')).attempts.length, 3);
  assert.equal((await send(`practice-plans/detail?id=${plan.id}&revision=${plan.revision}`)).reviews.length, 1);
});

test('MCP provides scoped goal planning and checkpoint writes while achievement and goal edits stay with the owner', async t => {
  const mf = await host(t);
  const reader = (await authorizeAgent(mf, { scopes: ['career:read'] })).issued.access_token;
  const writer = (await authorizeAgent(mf, { scopes: ['career:read', 'agent:write', 'career:write'] })).issued.access_token;
  const rpc = (token, method, params = {}) => api(mf, token)('mcp', { jsonrpc: '2.0', id: 1, method, params }, 200, { Accept: 'application/json, text/event-stream' });
  const call = async (token, name, args = {}) => {
    const response = await rpc(token, 'tools/call', { name, arguments: args });
    assert.ok(response.result && !response.result.isError, JSON.stringify(response)); return response.result;
  };
  const readerTools = (await rpc(reader, 'tools/list')).result.tools;
  assert.ok(readerTools.some(item => item.name === 'career_get_practice_plan'));
  assert.ok(!readerTools.some(item => item.name === 'career_save_practice_plan'));
  assert.match((await call(reader, 'career_get_practice_plan_guide')).content[0].text, /never a hard-coded two-week/);
  let plan = (await call(writer, 'career_create_practice_plan', { id: 'mcp-plan', input })).structuredContent;
  await call(writer, 'career_save_practice_plan', { ...change(plan), preview: true });
  plan = (await call(writer, 'career_save_practice_plan', { ...change(plan), preview: false })).structuredContent;
  const detail = (await call(reader, 'career_get_practice_plan', { id: plan.id })).structuredContent;
  assert.equal(detail.plan.content.skills[0].id, 'clarity');
  assert.equal((await call(reader, 'career_list_practice_plans')).structuredContent.plans.length, 1);
  const review = { id: 'insufficient-evidence', planId: plan.id, planRevision: plan.revision, checkpointId: 'final',
    summary: '初回回答がまだない。', nextActions: '録音して確認する。', sourceNotes: 'No attempts.',
    assessments: [{ skillId: 'clarity', outcome: 'insufficient_evidence', evidenceAttemptIds: [], notes: '判断保留。' }] };
  await call(writer, 'career_save_practice_plan_review', { review, preview: true });
  await call(writer, 'career_save_practice_plan_review', { review, preview: false });
  await api(mf, reader)('practice-plans/save', change(plan), 403);
  await api(mf, writer)('practice-plans/status', { id: plan.id, revision: plan.revision, status: 'completed' }, 403);
  await api(mf, writer)('practice-plans/edit', { id: plan.id, revision: plan.revision, input }, 403);
});

test('practice plans, versions, baseline sources and recorded evidence stay isolated between accounts', async t => {
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'practice-tenant' };
  const mock = createFetchMock(); mock.disableNetConnect();
  mock.get('https://www.googleapis.com').intercept({ path: '/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com' }).reply(200, { keys: [jwk] }).persist();
  const mf = await host(t, { bindings: { FIREBASE_PROJECT_ID: 'test-project' }, fetchMock: mock });
  const sign = uid => new SignJWT({ email: uid + '@example.com', email_verified: true, auth_time: Math.floor(Date.now() / 1000), firebase: { sign_in_provider: 'google.com' } })
    .setProtectedHeader({ alg: 'RS256', kid: 'practice-tenant' }).setSubject(uid).setIssuer('https://securetoken.google.com/test-project').setAudience('test-project').setIssuedAt().setExpirationTime('1h').sign(privateKey);
  const alice = api(mf, await sign('alice')), bob = api(mf, await sign('bob'));
  let plan = await alice('practice-plans', { id: 'private-plan', input });
  plan = await alice('practice-plans/save', change(plan));
  const recorded = await alice('attempts', answer(plan, 'alice-only'));
  await bob('practice-plans/detail?id=' + plan.id, undefined, 404);
  await bob('practice-plans/history?id=' + plan.id, undefined, 404);
  await bob('practice-plans/save', change(plan), 404);
  await bob('attempts', answer(plan, 'bob-forgery'), 404);
  assert.equal((await bob('state')).practicePlans.length, 0);
  await bob('practice-plans', { id: 'baseline-forgery', input: { ...input, sourceAttemptIds: [recorded.id] } }, 400);
  await bob('practice-plans', { id: plan.id, input: { ...input, title: 'Bob private goal' } });
  assert.equal((await alice('practice-plans/detail?id=' + plan.id)).plan.title, input.title);
});
