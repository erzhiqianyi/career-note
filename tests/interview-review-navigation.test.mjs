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
