import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reportInterviewId, interviewReportSection, interviewSessionHash } from '../lib/interview-review-navigation.ts';

test('actual interview documents are grouped by explicit source and preserve independent deep links', () => {
  const report = { id: 'actual-interview-questions-fixture', sourceNotes: 'Synthetic；interviewId=session-1。', title: 'Actual questions' };
  assert.equal(reportInterviewId(report), 'session-1');
  assert.equal(interviewReportSection(report), 'questions');
  assert.equal(reportInterviewId({ ...report, interviewId: 'saved-session' }), 'saved-session');
  assert.equal(reportInterviewId({ ...report, sourceNotes: 'No link; title mentions the same company' }), undefined);
  assert.equal(interviewReportSection({ ...report, sourceNotes: 'No link' }), undefined);
  assert.equal(reportInterviewId({ ...report, sourceNotes: 'interviewId=session-10;' }), 'session-10');
  assert.equal(interviewReportSection({ ...report, id: 'ordinary-report' }), undefined);
  assert.equal(interviewSessionHash('record:1'), '#interview-review/session/record%3A1');
});

test('scheduled review practice retains the exact question, schedule and plan revision', async () => {
  const { reviewPracticeContext, reviewPracticeHash } = await import('../lib/interview-review-navigation.ts');
  const plan = { id: 'plan-1', revision: 2, content: {
    schedule: [{ id: 'day-1', exerciseId: 'ex-1' }],
    exercises: [{ id: 'ex-1', questionSetId: 'general', questionId: 'cv' }],
  } };
  const record = decodeURIComponent(reviewPracticeHash('general', 'cv', plan, 'day-1').split('/question/')[1]);
  assert.deepEqual(reviewPracticeContext(record, [plan]), { planId: 'plan-1', planRevision: 2, scheduleId: 'day-1', exerciseId: 'ex-1', keywords: '' });
  assert.equal(reviewPracticeContext(record.replace('|2', '|3'), [plan]), undefined);
  assert.equal(reviewPracticeContext(record.replace('|cv|', '|salary|'), [plan]), undefined);
  assert.equal(reviewPracticeContext(record.replace('day-1', 'day-2'), [plan]), undefined);
  assert.equal(reviewPracticeContext('general|cv', [plan]), undefined);
});
