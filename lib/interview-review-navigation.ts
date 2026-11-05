import type { Report } from './career';

export type InterviewReportSection = 'questions' | 'transcript' | 'review' | 'outcome';
export function reportInterviewId(report: Report): string | undefined {
  if (report.interviewId) return report.interviewId;
  // Compatibility with source notes written before structured report links were saved.
  return report.sourceNotes.match(/(?:^|[\s；;])interviewId=([A-Za-z0-9:_-]{1,120})(?=[。；;\s]|$)/)?.[1];
}
export function interviewReportSection(report: Report): InterviewReportSection | undefined {
  if (!reportInterviewId(report)) return undefined;
  if (report.id.startsWith('actual-interview-questions-')) return 'questions';
  if (report.id.startsWith('interview-transcript-')) return 'transcript';
  if (report.id.startsWith('interview-outcome-')) return 'outcome';
  if (report.id.startsWith('interview-review-')) return 'review';
  return undefined;
}
export function interviewSessionHash(id: string) { return '#interview-review/session/' + encodeURIComponent(id); }

export function reviewPracticeHash(packId: string, questionId: string, plan?: { id: string; revision: number }, scheduleId?: string) {
  const parts = plan && scheduleId ? [packId, questionId, plan.id, scheduleId, String(plan.revision)] : [packId, questionId];
  return '#interview-review/question/' + encodeURIComponent(parts.join('|'));
}

/** A scheduled answer must refer to exactly the question and plan version shown to the learner. */
export function reviewPracticeContext(record: string | null, plans: import('./practice-plan').PracticePlan[] = []): import('./practice-plan').PracticeContext | undefined {
  if (!record) return undefined;
  const [packId, questionId, planId, scheduleId, version] = record.split('|');
  if (!planId || !scheduleId || !/^\d+$/.test(version || '')) return undefined;
  const plan = plans.find(p => p.id === planId && p.revision === Number(version));
  const schedule = plan?.content?.schedule.find(s => s.id === scheduleId);
  const exercise = plan?.content?.exercises.find(e => e.id === schedule?.exerciseId);
  if (!plan || !schedule || !exercise || exercise.questionSetId !== packId || exercise.questionId !== questionId) return undefined;
  return { planId, planRevision: plan.revision, scheduleId, exerciseId: exercise.id, keywords: '' };
}
