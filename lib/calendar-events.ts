import type { Report } from './career';

export type EventStatus = 'confirmed' | 'provisional' | 'cancelled';
export type EventKind = 'interview' | 'counseling' | 'fair';
export type EventTimeStatus = 'exact' | 'end-estimated' | 'unknown';
/** A reference for the event (job posting, venue map, prep page); `url` stays the one place to join it. */
export type EventLink = { label: string; url: string };
export type EventTodo = { text: string; done: boolean };

/** The JSON on the first sourceNotes line of a schedule report, after the `career-event-v1:` prefix. */
export type EventHeader = {
  date: string;
  start?: string;
  end?: string;
  timeStatus: EventTimeStatus;
  status: EventStatus;
  kind: EventKind;
  location?: string;
  url?: string;
  jobId?: string;
  links?: EventLink[];
  todos?: EventTodo[];
  /** Older schedule report ids this version replaces; they drop off the calendar. */
  supersedes?: string[];
};

export type CareerEvent = Omit<EventHeader, 'supersedes'> & {
  id: string;
  title: string;
  description: string;
};

export const EVENT_PREFIX = 'career-event-v1:';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Parse the event header of a schedule report. Returns null for ordinary reports, and an error message
 * for a header that is present but malformed, so imports can reject it instead of silently hiding it.
 */
export function parseEventHeader(sourceNotes: string | undefined, reportDate: string): EventHeader | { error: string } | null {
  const line = sourceNotes?.split('\n', 1)[0] || '';
  if (!line.startsWith(EVENT_PREFIX)) return null;
  let data: Record<string, unknown>;
  try { data = JSON.parse(line.slice(EVENT_PREFIX.length)); } catch { return { error: '日程 JSON 无法解析' }; }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return { error: '日程 JSON 必须是对象' };
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date)) return { error: '日程 date 必须是 YYYY-MM-DD' };
  if (data.date !== reportDate) return { error: '日程 date 必须与报告 date 一致' };
  if (!['exact', 'end-estimated', 'unknown'].includes(data.timeStatus as string)) return { error: '日程 timeStatus 不正确' };
  if (!['confirmed', 'provisional', 'cancelled'].includes(data.status as string)) return { error: '日程 status 不正确' };
  if (!['interview', 'counseling', 'fair'].includes(data.kind as string)) return { error: '日程 kind 不正确' };
  if (data.timeStatus !== 'unknown' && !(TIME.test(String(data.start)) && TIME.test(String(data.end)))) return { error: '日程 start/end 必须是 HH:MM' };
  for (const key of ['location', 'url', 'jobId'] as const) if (data[key] !== undefined && typeof data[key] !== 'string') return { error: `日程 ${key} 必须是字符串` };
  const links = data.links === undefined ? [] : data.links;
  if (!Array.isArray(links) || links.length > 20) return { error: '日程 links 必须是最多 20 条的数组' };
  for (const link of links) {
    if (typeof link !== 'object' || link === null || typeof link.url !== 'string' || !/^https?:\/\/\S+$/.test(link.url) || link.url.length > 2000) return { error: '日程 links 的 url 必须是 http(s) 链接' };
    if (link.label !== undefined && (typeof link.label !== 'string' || link.label.length > 100)) return { error: '日程 links 的 label 必须是 100 字以内的字符串' };
  }
  const todos = data.todos === undefined ? [] : data.todos;
  if (!Array.isArray(todos) || todos.length > 50) return { error: '日程 todos 必须是最多 50 条的数组' };
  for (const todo of todos) {
    if (typeof todo !== 'object' || todo === null || typeof todo.text !== 'string' || !todo.text.trim() || todo.text.length > 500) return { error: '日程 todos 的 text 必须是 500 字以内的非空字符串' };
    if (todo.done !== undefined && typeof todo.done !== 'boolean') return { error: '日程 todos 的 done 必须是 true 或 false' };
  }
  const supersedes = data.supersedes === undefined ? [] : Array.isArray(data.supersedes) ? data.supersedes : [data.supersedes];
  if (!supersedes.every((id) => typeof id === 'string' && id)) return { error: '日程 supersedes 必须是报告 id 或其数组' };
  const header: EventHeader = { date: data.date, timeStatus: data.timeStatus as EventTimeStatus, status: data.status as EventStatus, kind: data.kind as EventKind };
  if (header.timeStatus !== 'unknown') Object.assign(header, { start: data.start, end: data.end });
  for (const key of ['location', 'url', 'jobId'] as const) if (data[key]) header[key] = data[key] as string;
  if (links.length) header.links = links.map((link: Record<string, unknown>) => ({ label: String(link.label || '').trim(), url: link.url as string }));
  if (todos.length) header.todos = todos.map((todo: Record<string, unknown>) => ({ text: (todo.text as string).trim(), done: todo.done === true }));
  if (supersedes.length) header.supersedes = supersedes as string[];
  return header;
}

/** Write an event header line back into sourceNotes, keeping the notes that follow it. */
export function withEventHeader(sourceNotes: string, header: EventHeader): string {
  const rest = sourceNotes.startsWith(EVENT_PREFIX) ? sourceNotes.slice(sourceNotes.indexOf('\n') + 1 || sourceNotes.length) : sourceNotes;
  const line = EVENT_PREFIX + JSON.stringify(header);
  return rest ? `${line}\n${rest}` : line;
}

/** Schedule events from reports. Removed reports, and reports a later version supersedes, are left out. */
export function eventsFromReports(reports: (Report & { archivedAt?: string })[]): CareerEvent[] {
  const parsed = reports.flatMap((report) => {
    const header = parseEventHeader(report.sourceNotes, report.date);
    return header && !('error' in header) ? [{ report, header }] : [];
  });
  const superseded = new Set(parsed.filter(({ report }) => !report.archivedAt).flatMap(({ header }) => header.supersedes || []));
  return parsed
    .filter(({ report }) => !report.archivedAt && !superseded.has(report.id))
    .map(({ report, header: { supersedes: _, ...header } }) => ({ ...header, id: report.id, title: report.title, description: report.content }))
    .sort((a, b) => `${a.date} ${a.start || ''}`.localeCompare(`${b.date} ${b.start || ''}`));
}

const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const utcIcs = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function eventIcs(event: CareerEvent): string | null {
  if (!event.start || !event.end || event.timeStatus === 'unknown') return null;
  const links = (event.links || []).map(link => `\n${link.label ? `${link.label}: ` : ''}${link.url}`).join('');
  const todos = (event.todos || []).map(todo => `\n${todo.done ? '☑' : '☐'} ${todo.text}`).join('');
  const description = `${event.description}${event.timeStatus === 'end-estimated' ? '\n结束时间为估计。' : ''}${event.url ? `\n${event.url}` : ''}${links}${todos}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Career Note//Calendar Event//ZH',
    'BEGIN:VEVENT', `UID:${event.id}@career-note`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${utcIcs(event.date, event.start)}`, `DTEND:${utcIcs(event.date, event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(description)}`,
    `STATUS:${event.status === 'provisional' ? 'TENTATIVE' : event.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
