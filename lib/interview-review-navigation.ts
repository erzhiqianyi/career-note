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
