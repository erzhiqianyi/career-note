'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Clock, Flag, MessageSquare, X } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import type { Attempt, Job, Material } from '@/lib/career';

export type CalendarMarkKind = 'due' | 'interview' | 'target';
/** A dated item on the calendar; `jobs` are the companies involved (empty for the target date). */
export type CalendarMark = { kind: CalendarMarkKind; jobs: { id: string; company: string }[] };

/** What the user did on one day, derived from record timestamps (workspace timezone). */
export type DayActivity = {
  added: string[]; // companies saved
  applied: string[]; // "company · role" moved to 已投递
  progressed: string[]; // other status changes, "company · status"
  practiced: string[]; // question titles answered
  materials: string[]; // preparation materials that arrived
};

const TOKYO_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
/** ISO timestamp → YYYY-MM-DD in the workspace timezone (the API's `today` uses Asia/Tokyo too). */
export function workspaceDay(at: string): string {
  const time = Date.parse(at);
  return Number.isNaN(time) ? at.slice(0, 10) : TOKYO_DAY.format(time);
}

export function collectActivity(jobs: Job[], attempts: Attempt[], materials: Material[]): Record<string, DayActivity> {
  const days: Record<string, DayActivity> = {};
  const at = (date: string) => (days[date] ??= { added: [], applied: [], progressed: [], practiced: [], materials: [] });
  for (const job of jobs) {
    job.history.forEach((entry, index) => {
      if (!entry.at) return;
      const date = workspaceDay(entry.at);
      if (index === 0) at(date).added.push(job.company);
      else if (entry.status === '已投递') at(date).applied.push(`${job.company} · ${job.role}`);
      else at(date).progressed.push(`${job.company} · ${entry.status}`);
    });
  }
  for (const attempt of attempts) if (attempt.createdAt) at(workspaceDay(attempt.createdAt)).practiced.push(attempt.question?.title || attempt.questionId);
  for (const material of materials) if (material.createdAt) at(workspaceDay(material.createdAt)).materials.push(material.title);
  return days;
}

const KINDS: Array<[keyof DayActivity, string]> = [
  ['added', '新增公司'],
  ['applied', '投递'],
  ['progressed', '进展'],
  ['practiced', '练习'],
  ['materials', '资料'],
];

const MARK_LABEL: Record<CalendarMarkKind, string> = { due: '待跟进', interview: '面试日', target: '目标日期' };

/**
 * Month grid with today, follow-up / interview / target marks and the month's interviews listed underneath.
 * Tapping a day swaps that list for what is on that day; the company names open the company page.
 */
export default function TodayCalendar({
  today,
  marks,
  activity,
  onOpenJob,
}: {
  today: string;
  marks: Record<string, CalendarMark>;
  activity: Record<string, DayActivity>;
  onOpenJob?: (jobId: string) => void;
}) {
  const { locale, t } = useLocale();
  const [offset, setOffset] = useState(0); // months from the current one
  const [selected, setSelected] = useState(''); // YYYY-MM-DD, or '' for the month's interview list
  const [ty, tm] = today.split('-').map(Number);
  const first = new Date(Date.UTC(ty, tm - 1 + offset, 1));
  const year = first.getUTCFullYear();
  const month = first.getUTCMonth() + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const leading = first.getUTCDay(); // Sunday-first, like Japanese calendars
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(new Date(Date.UTC(2023, 0, 1 + i))),
  );
  const title = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(first);
  const cells: (number | null)[] = [...Array<null>(leading).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const iso = (d: number) => `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const prefix = `${year}-${String(month).padStart(2, '0')}-`;
  const shortDay = (date: string) => new Intl.DateTimeFormat(locale, { month: 'numeric', day: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
  const interviews = Object.entries(marks)
    .filter(([date, mark]) => date.startsWith(prefix) && mark.kind === 'interview')
    .sort(([a], [b]) => a.localeCompare(b));
  /** Tooltip for a day: its mark plus a short summary of what was done. */
  const tooltip = (date: string) => {
    const mark = marks[date];
    const dayLog = activity[date];
    const lines = [];
    if (mark) lines.push(`${t(MARK_LABEL[mark.kind])}${mark.jobs.length ? ' · ' + mark.jobs.map((j) => j.company).join('、') : ''}`);
    if (dayLog) for (const [key, label] of KINDS) if (dayLog[key].length) lines.push(`${t(label)} ${dayLog[key].length}：${dayLog[key].join('、')}`);
    return lines.length ? lines.join('\n') : undefined;
  };
  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" className="icon-button" aria-label={t('上个月')} onClick={() => setOffset(offset - 1)}>
          <ChevronLeft size={18} />
        </button>
        <div className="calendar-title">{title}</div>
        <button type="button" className="icon-button" aria-label={t('下个月')} onClick={() => setOffset(offset + 1)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="calendar-grid" role="grid">
        {weekdays.map((w, i) => (
          <span key={i} className="calendar-weekday">
            {w}
          </span>
        ))}
        {cells.map((d, i) => {
          if (!d) return <span key={i} />;
          const date = iso(d);
          const mark = marks[date];
          const done = !!activity[date];
          return (
            <button
              type="button"
              key={i}
              className={['calendar-day', date === today && 'is-today', date === selected && 'is-selected', done && 'has-activity', mark && 'has-' + mark.kind].filter(Boolean).join(' ')}
              aria-label={date}
              aria-pressed={date === selected}
              title={tooltip(date)}
              onClick={() => setSelected(date === selected ? '' : date)}
            >
              {d}
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="calendar-day-detail">
          <div className="calendar-day-detail-head">
            <b>{shortDay(selected)}{selected === today && <small>{t('今天')}</small>}</b>
            <button type="button" className="icon-button" aria-label={t('关闭')} onClick={() => setSelected('')}><X size={14} /></button>
          </div>
          {(() => {
            const mark = marks[selected];
            const dayLog = activity[selected];
            if (!mark && !dayLog) return <p className="muted">{t('这一天没有安排或记录。')}</p>;
            return <ul className="calendar-interviews">
              {mark && (mark.jobs.length ? mark.jobs : [null]).map((job, index) => (
                <li key={job ? job.id : 'mark-' + index} className={'is-' + mark.kind}>
                  {mark.kind === 'interview' ? <MessageSquare size={14} /> : mark.kind === 'target' ? <Flag size={14} /> : <Clock size={14} />}
                  <b>{t(MARK_LABEL[mark.kind])}</b>
                  <span>
                    {job ? (onOpenJob ? <button type="button" className="text-button" onClick={() => onOpenJob(job.id)}>{job.company}</button> : job.company) : t('希望在这一天之前找到工作')}
                  </span>
                </li>
              ))}
              {dayLog && KINDS.filter(([key]) => dayLog[key].length).map(([key, label]) => (
                <li key={key} className="is-activity">
                  <span className="calendar-activity-count">{dayLog[key].length}</span>
                  <b>{t(label)}</b>
                  <span>{dayLog[key].join('、')}</span>
                </li>
              ))}
            </ul>;
          })()}
        </div>
      ) : interviews.length > 0 && (
        <ul className="calendar-interviews">
          {interviews.map(([date, mark]) => (
            <li key={date} className={date < today ? 'is-past' : undefined}>
              <MessageSquare size={14} />
              <b>{shortDay(date)}</b>
              <span>
                {t('面试')} · {mark.jobs.map((job, index) => <span key={job.id}>{index > 0 && '、'}{onOpenJob ? <button type="button" className="text-button" onClick={() => onOpenJob(job.id)}>{job.company}</button> : job.company}</span>)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
