import type { Job, State } from './career';
import { eventsFromReports, type CareerEvent } from './calendar-events';
import { workspaceDay } from './workspace-day';

/** The usual path of one application; 未通过 and 已撤回 end it at whichever step it had reached. */
export const pipeline = ['关注中', '准备投递', '已投递', '书类选考', '面试中', '内定'] as const;
const endings = ['未通过', '已撤回'];

export type PipelineStep = {
  status: string;
  /** Day this step was last entered; empty when it was skipped or not reached yet. */
  date: string;
  state: 'done' | 'current' | 'ended' | 'upcoming';
};
export type PipelineView = { steps: PipelineStep[]; ending?: { status: string; date: string } };

/** Where the application stands on the usual path, dated from the status history. */
export function pipelineView(job: Pick<Job, 'status' | 'history'>): PipelineView {
  const history = job.history || [];
  const lastDate = (status: string) => {
    const entry = [...history].reverse().find((item) => item.status === status);
    return entry?.at ? workspaceDay(entry.at) : '';
  };
  const ended = endings.includes(job.status);
  // An ended application stops at the furthest step it reached before ending.
  let current = pipeline.indexOf(job.status as (typeof pipeline)[number]);
  if (ended) current = Math.max(-1, ...history.map((item) => pipeline.indexOf(item.status as (typeof pipeline)[number])));
  const steps = pipeline.map((status, index): PipelineStep => ({
    status,
    date: index <= current ? lastDate(status) : '',
    state: index < current ? 'done' : index === current ? (ended ? 'ended' : 'current') : 'upcoming',
  }));
  return ended ? { steps, ending: { status: job.status, date: lastDate(job.status) } } : { steps };
}

export type TimelineItem = {
  key: string;
  date: string;
  kind: 'status' | 'next' | 'event' | 'material' | 'practice';
  title: string;
  /** Kept verbatim (company and agent text) or a status / kind label the page translates. */
  detail?: string;
  count?: number;
  overdue?: boolean;
  event?: CareerEvent;
  materialId?: string;
};

/**
 * Everything dated that happened with one company, split into what is coming up and what already happened
 * (newest first). Practice answers and reviews are grouped per day so a busy practice day stays one line.
 */
export function companyTimeline(job: Job, data: Pick<State, 'today' | 'materials' | 'attempts' | 'reviews' | 'reports'>) {
  const items: TimelineItem[] = [];
  (job.history || []).forEach((entry, index) => {
    if (entry.at) items.push({ key: 'status-' + index, date: workspaceDay(entry.at), kind: 'status', title: entry.status });
  });
  if (job.nextAction || job.nextDate) {
    items.push({ key: 'next', date: job.nextDate || '', kind: 'next', title: job.nextAction || '', overdue: !!job.nextDate && job.nextDate < data.today });
  }
  for (const event of eventsFromReports(data.reports || []).filter((item) => item.jobId === job.id)) {
    items.push({ key: 'event-' + event.id, date: event.date, kind: 'event', title: event.title, detail: event.kind, event });
  }
  for (const material of (data.materials || []).filter((item) => item.jobId === job.id)) {
    items.push({ key: 'material-' + material.id, date: workspaceDay(material.createdAt), kind: 'material', title: material.title, detail: material.kind, materialId: material.id });
  }
  const practiceDays = new Map<string, { answers: number; reviews: number }>();
  const tally = (at: string, field: 'answers' | 'reviews') => {
    const date = workspaceDay(at);
    const day = practiceDays.get(date) ?? { answers: 0, reviews: 0 };
    day[field] += 1;
    practiceDays.set(date, day);
  };
  (data.attempts || []).filter((item) => item.jobId === job.id).forEach((item) => tally(item.createdAt, 'answers'));
  (data.reviews || []).filter((item) => item.jobId === job.id).forEach((item) => tally(item.createdAt, 'reviews'));
  for (const [date, day] of practiceDays) {
    items.push({ key: 'practice-' + date, date, kind: 'practice', title: '', count: day.answers, detail: String(day.reviews) });
  }
  // The next step stays "coming up" while it is undated or overdue: it is still the thing to do.
  const isUpcoming = (item: TimelineItem) => item.kind === 'next' || (item.kind === 'event' && item.date >= data.today);
  const upcoming = items.filter(isUpcoming).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const past = items.filter((item) => !isUpcoming(item)).sort((a, b) => b.date.localeCompare(a.date) || order(b) - order(a));
  return { upcoming, past };
}
// Same-day ties: a status change reads as the headline of that day.
const order = (item: TimelineItem) => ({ status: 3, event: 2, material: 1, practice: 0, next: 0 })[item.kind];
