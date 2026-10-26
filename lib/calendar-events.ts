import type { Report } from './career';

export type CareerEvent = {
  id: string;
  title: string;
  date: string;
  start?: string;
  end?: string;
  timeStatus: 'exact' | 'end-estimated' | 'unknown';
  status: 'confirmed' | 'provisional';
  kind: 'interview' | 'counseling' | 'fair';
  location?: string;
  url?: string;
  jobId?: string;
  description: string;
};

const prefix = 'career-event-v1:';

export function eventsFromReports(reports: Report[]): CareerEvent[] {
  return reports.flatMap(report => {
    const line = report.sourceNotes?.split('\n', 1)[0] || '';
    if (!line.startsWith(prefix)) return [];
    try {
      const data = JSON.parse(line.slice(prefix.length));
      if (data.date !== report.date || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
          !['exact', 'end-estimated', 'unknown'].includes(data.timeStatus) ||
          !['confirmed', 'provisional'].includes(data.status) ||
          !['interview', 'counseling', 'fair'].includes(data.kind)) return [];
      const validTime = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
      if (data.timeStatus !== 'unknown' && (!validTime(data.start) || !validTime(data.end))) return [];
      return [{
        id: report.id, title: report.title, description: report.content, date: data.date,
        start: data.start, end: data.end, timeStatus: data.timeStatus,
        status: data.status, kind: data.kind, location: data.location,
        url: data.url, jobId: data.jobId,
      } as CareerEvent];
    } catch { return []; }
  }).sort((a, b) => `${a.date} ${a.start || ''}`.localeCompare(`${b.date} ${b.start || ''}`));
}

const escapeIcs = (value: string) => value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
const utcIcs = (date: string, time: string) => new Date(`${date}T${time}:00+09:00`).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function eventIcs(event: CareerEvent): string | null {
  if (!event.start || !event.end || event.timeStatus === 'unknown') return null;
  const description = `${event.description}${event.timeStatus === 'end-estimated' ? '\n结束时间为估计。' : ''}${event.url ? `\n${event.url}` : ''}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Career Note//Calendar Event//ZH',
    'BEGIN:VEVENT', `UID:${event.id}@career-note`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART:${utcIcs(event.date, event.start)}`, `DTEND:${utcIcs(event.date, event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`, `DESCRIPTION:${escapeIcs(description)}`,
    `STATUS:${event.status === 'provisional' ? 'TENTATIVE' : 'CONFIRMED'}`,
  ];
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.url) lines.push(`URL:${event.url}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
