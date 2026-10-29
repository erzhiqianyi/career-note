import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const result = await build({ entryPoints: ['lib/company-timeline.ts'], bundle: true, platform: 'node', format: 'cjs', write: false });
const module = { exports: {} };
// Same realm as the assertions, so arrays and objects compare structurally.
new Function('module', 'exports', 'require', result.outputFiles[0].text)(module, module.exports, require);
const { pipelineView, companyTimeline } = module.exports;

const job = (status, history, extra = {}) => ({ id: 'j', company: 'Example', role: 'Engineer', status, history, ...extra });

test('the pipeline dates each reached step and marks skipped ones as passed', () => {
  const view = pipelineView(job('书类选考', [
    { status: '关注中', at: '2026-10-01T03:00:00.000Z' },
    { status: '已投递', at: '2026-10-20T00:00:00.000Z' },
    { status: '书类选考', at: '2026-10-25T00:00:00.000Z' },
  ]));
  assert.deepEqual(view.steps.map((s) => [s.status, s.state, s.date]), [
    ['关注中', 'done', '2026-10-01'],
    ['准备投递', 'done', ''],
    ['已投递', 'done', '2026-10-20'],
    ['书类选考', 'current', '2026-10-25'],
    ['面试中', 'upcoming', ''],
    ['内定', 'upcoming', ''],
  ]);
  assert.equal(view.ending, undefined);
});

test('an ended application stops at the furthest step it reached', () => {
  const view = pipelineView(job('未通过', [
    { status: '已投递', at: '2026-10-20T00:00:00.000Z' },
    { status: '面试中', at: '2026-10-26T00:00:00.000Z' },
    { status: '未通过', at: '2026-10-28T00:00:00.000Z' },
  ]));
  assert.equal(view.steps[4].state, 'ended');
  assert.equal(view.steps[5].state, 'upcoming');
  assert.deepEqual(view.ending, { status: '未通过', date: '2026-10-28' });
});

test('the timeline puts the next step and future events first and groups practice per day', () => {
  const header = (date, jobId) => 'career-event-v1:' + JSON.stringify({ date, timeStatus: 'unknown', status: 'confirmed', kind: 'interview', jobId });
  const data = {
    today: '2026-10-29',
    reports: [
      { id: 'e1', title: '一次面接', content: '', date: '2026-11-02', sourceNotes: header('2026-11-02', 'j'), createdAt: '2026-10-28T00:00:00Z' },
      { id: 'e2', title: '他社', content: '', date: '2026-11-03', sourceNotes: header('2026-11-03', 'other'), createdAt: '2026-10-28T00:00:00Z' },
    ],
    materials: [{ id: 'm1', jobId: 'j', title: '履歴書', kind: '履歴書', createdAt: '2026-10-21T02:00:00Z' }],
    attempts: [{ id: 'a1', jobId: 'j', createdAt: '2026-10-22T01:00:00Z' }, { id: 'a2', jobId: 'j', createdAt: '2026-10-22T05:00:00Z' }],
    reviews: [{ id: 'r1', jobId: 'j', attemptId: 'a1', createdAt: '2026-10-22T08:00:00Z' }],
  };
  const { upcoming, past } = companyTimeline(job('书类选考', [{ status: '已投递', at: '2026-10-20T00:00:00.000Z' }], { nextAction: '面接の準備', nextDate: '2026-10-28' }), data);
  assert.deepEqual(upcoming.map((i) => [i.kind, i.date]), [['next', '2026-10-28'], ['event', '2026-11-02']]);
  assert.equal(upcoming[0].overdue, true);
  assert.deepEqual(past.map((i) => i.kind), ['practice', 'material', 'status']);
  assert.equal(past[0].count, 2);
  assert.equal(past[0].detail, '1');
});
