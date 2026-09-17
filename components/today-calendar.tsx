'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import type { Attempt, Job, Material } from '@/lib/career';

export type CalendarMark = 'due' | 'interview' | 'target';

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

/** Month grid with today, upcoming marks and a per-day log of what was done; tap a day to read it. */
export default function TodayCalendar({
  today,
  marks,
  activity,
}: {
  today: string;
  marks: Record<string, CalendarMark>;
  activity: Record<string, DayActivity>;
}) {
  const { locale, t } = useLocale();
  const [selected, setSelected] = useState(today);
  const [offset, setOffset] = useState(0); // months from the current one
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
  const monthTotals = KINDS.map(([key, label]) => [
    label,
    Object.entries(activity).reduce((sum, [date, dayLog]) => (date.startsWith(prefix) ? sum + dayLog[key].length : sum), 0),
  ] as const).filter(([, count]) => count > 0);
  const dayLog = activity[selected];
  const selectedTitle = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(new Date(selected + 'T00:00:00Z'));
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
              className={['calendar-day', date === today && 'is-today', date === selected && 'is-selected', done && 'has-activity', mark && 'has-' + mark]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={date === selected}
              aria-label={date}
              title={mark ? t(mark === 'due' ? '待跟进' : mark === 'interview' ? '面试日' : '目标日期') : undefined}
              onClick={() => setSelected(date)}
            >
              {d}
            </button>
          );
        })}
      </div>
      {monthTotals.length > 0 && (
        <p className="calendar-totals">
          {t('本月')}
          {monthTotals.map(([label, count]) => (
            <span key={label}>
              {t(label)} {count}
            </span>
          ))}
        </p>
      )}
      <div className="calendar-log">
        <h3>
          {selectedTitle}
          {selected === today && <small>{t('今天')}</small>}
        </h3>
        {dayLog ? (
          KINDS.filter(([key]) => dayLog[key].length).map(([key, label]) => (
            <p key={key}>
              <b>
                {t(label)} {dayLog[key].length}
              </b>
              <span>{dayLog[key].join('、')}</span>
            </p>
          ))
        ) : (
          <p className="muted">{t('这一天没有记录。')}</p>
        )}
      </div>
    </div>
  );
}
