'use client';
import { useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, Clock, ExternalLink, Flag, MapPin, MessageSquare, Pencil, Plus, Trash2, Video, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocale } from '@/components/locale-provider';
import type { Attempt, Job, Material } from '@/lib/career';
import { eventIcs, type CareerEvent, type EventKind, type EventLink, type EventStatus, type EventTimeStatus, type EventTodo } from '../lib/calendar-events';

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
const EVENT_KINDS: Array<[EventKind, string]> = [['interview', '面试'], ['counseling', '面谈・咨询'], ['fair', '招聘会・说明会']];
const EVENT_STATUSES: Array<[EventStatus, string]> = [['confirmed', '已确定'], ['provisional', '暂约'], ['cancelled', '已取消']];
const TIME_STATUSES: Array<[EventTimeStatus, string]> = [['exact', '时间确定'], ['end-estimated', '结束时间为估计'], ['unknown', '具体时间待确认']];

/** Share the event as an .ics file where the platform can, otherwise download it. */
async function exportEvent(event: CareerEvent) {
  const ics = eventIcs(event);
  if (!ics) return;
  const file = new File([ics], `${event.date}-${event.id}.ics`, { type: 'text/calendar' });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: event.title });
      return;
    }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

const hostOf = (url: string) => { try { return new URL(url).host; } catch { return url; } };

/** Editor for one schedule entry; the job link and source notes stay as they are. */
function EventEditor({ event, busy, onSave, onCancel }: { event: CareerEvent; busy?: boolean; onSave: (event: CareerEvent) => void; onCancel: () => void }) {
  const { t } = useLocale();
  const [draft, setDraft] = useState(event);
  const set = (patch: Partial<CareerEvent>) => setDraft({ ...draft, ...patch });
  const links = draft.links || [];
  const todos = draft.todos || [];
  const setLinks = (next: EventLink[]) => set({ links: next });
  const setTodos = (next: EventTodo[]) => set({ todos: next });
  const timed = draft.timeStatus !== 'unknown';
  return <form className="calendar-event-editor" onSubmit={(e) => { e.preventDefault(); onSave(draft); }}>
    <label className="field">{t('标题')}<input required maxLength={200} value={draft.title} onChange={(e) => set({ title: e.target.value })} /></label>
    <div className="calendar-event-editor-row">
      <label className="field">{t('日期')}<input type="date" required value={draft.date} onChange={(e) => set({ date: e.target.value })} /></label>
      <label className="field">{t('类型')}<select value={draft.kind} onChange={(e) => set({ kind: e.target.value as EventKind })}>{EVENT_KINDS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      <label className="field">{t('状态')}<select value={draft.status} onChange={(e) => set({ status: e.target.value as EventStatus })}>{EVENT_STATUSES.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
    </div>
    <div className="calendar-event-editor-row">
      <label className="field">{t('时间')}<select value={draft.timeStatus} onChange={(e) => set({ timeStatus: e.target.value as EventTimeStatus })}>{TIME_STATUSES.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}</select></label>
      {timed && <label className="field">{t('开始')}<input type="time" required value={draft.start || ''} onChange={(e) => set({ start: e.target.value })} /></label>}
      {timed && <label className="field">{t('结束')}<input type="time" required value={draft.end || ''} onChange={(e) => set({ end: e.target.value })} /></label>}
    </div>
    <label className="field">{t('地点')}<input maxLength={200} value={draft.location || ''} onChange={(e) => set({ location: e.target.value })} /></label>
    <label className="field">{t('会议链接')}<input type="url" maxLength={2000} value={draft.url || ''} onChange={(e) => set({ url: e.target.value })} /></label>
    <fieldset className="calendar-event-editor-list">
      <legend>{t('相关链接')}</legend>
      {links.map((link, index) => <div key={index} className="calendar-event-editor-item">
        <input aria-label={t('链接名称')} placeholder={t('名称')} maxLength={100} value={link.label} onChange={(e) => setLinks(links.map((item, i) => i === index ? { ...item, label: e.target.value } : item))} />
        <input aria-label={t('链接地址')} type="url" required placeholder="https://" maxLength={2000} value={link.url} onChange={(e) => setLinks(links.map((item, i) => i === index ? { ...item, url: e.target.value } : item))} />
        <button type="button" className="icon-button" aria-label={t('删除')} onClick={() => setLinks(links.filter((_, i) => i !== index))}><X size={14} /></button>
      </div>)}
      {links.length < 20 && <button type="button" className="text-button" onClick={() => setLinks([...links, { label: '', url: '' }])}><Plus size={14} />{t('添加链接')}</button>}
    </fieldset>
    <fieldset className="calendar-event-editor-list">
      <legend>{t('待办事项')}</legend>
      {todos.map((todo, index) => <div key={index} className="calendar-event-editor-item">
        <input type="checkbox" aria-label={t('已完成')} checked={todo.done} onChange={(e) => setTodos(todos.map((item, i) => i === index ? { ...item, done: e.target.checked } : item))} />
        <input aria-label={t('待办内容')} required maxLength={500} value={todo.text} onChange={(e) => setTodos(todos.map((item, i) => i === index ? { ...item, text: e.target.value } : item))} />
        <button type="button" className="icon-button" aria-label={t('删除')} onClick={() => setTodos(todos.filter((_, i) => i !== index))}><X size={14} /></button>
      </div>)}
      {todos.length < 50 && <button type="button" className="text-button" onClick={() => setTodos([...todos, { text: '', done: false }])}><Plus size={14} />{t('添加待办')}</button>}
    </fieldset>
    <label className="field">{t('说明')}<textarea rows={5} value={draft.description || ''} onChange={(e) => set({ description: e.target.value })} /></label>
    <div className="calendar-event-editor-actions">
      <button type="button" className="secondary" disabled={busy} onClick={onCancel}>{t('取消')}</button>
      <button type="submit" className="primary" disabled={busy}>{busy ? t('保存中…') : t('保存')}</button>
    </div>
  </form>;
}

/**
 * Month grid with today, follow-up / interview / target marks and the month's interviews listed underneath.
 * Tapping a day swaps that list for what is on that day; the company names open the company page.
 */
export default function TodayCalendar({
  today,
  marks,
  events,
  activity,
  onOpenJob,
  onOpenEvent,
}: {
  today: string;
  marks: Record<string, CalendarMark>;
  events: CareerEvent[];
  activity: Record<string, DayActivity>;
  onOpenJob?: (jobId: string) => void;
  onOpenEvent?: (event: CareerEvent) => void;
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
  const monthEvents = events.filter(event => event.date.startsWith(prefix));
  const eventRow = (event: CareerEvent) => {
    const todos = event.todos || [];
    const open = todos.filter(todo => !todo.done).length;
    return <li key={event.id} className={'calendar-event-row' + (event.status === 'cancelled' ? ' is-cancelled' : '')}>
      <Clock size={14} />
      <b>{shortDay(event.date)} {event.start || t('上午')}</b>
      <button type="button" className="calendar-event-open" onClick={() => onOpenEvent?.(event)} disabled={!onOpenEvent}>
        <strong>{event.title}</strong>
        <small>{event.status === 'provisional' ? `${t('暂约')} · ` : event.status === 'cancelled' ? `${t('已取消')} · ` : ''}{event.timeStatus === 'unknown' ? t('具体时间待确认') : event.timeStatus === 'end-estimated' ? t('结束约 {0}', [event.end]) : t('结束 {0}', [event.end])}{event.location ? ` · ${event.location}` : ''}{todos.length ? ` · ${open ? t('待办 {0}/{1}', [open, todos.length]) : t('待办已完成')}` : ''}</small>
      </button>
    </li>;
  };
  /** Tooltip for a day: its mark plus a short summary of what was done. */
  const tooltip = (date: string) => {
    const mark = marks[date];
    const dayLog = activity[date];
    const lines = [];
    if (mark) lines.push(`${t(MARK_LABEL[mark.kind])}${mark.jobs.length ? ' · ' + mark.jobs.map((j) => j.company).join('、') : ''}`);
    for (const event of events.filter(item => item.date === date)) lines.push(`${event.start || t('上午')} · ${event.title}`);
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
          const hasEvent = events.some(event => event.date === date && event.status !== 'cancelled');
          const done = !!activity[date];
          return (
            <button
              type="button"
              key={i}
              className={['calendar-day', date === today && 'is-today', date === selected && 'is-selected', done && 'has-activity', mark && 'has-' + mark.kind, hasEvent && 'has-event'].filter(Boolean).join(' ')}
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
            const dayEvents = events.filter(event => event.date === selected);
            if (!mark && !dayLog && !dayEvents.length) return <p className="muted">{t('这一天没有安排或记录。')}</p>;
            return <ul className="calendar-interviews">
              {dayEvents.map(eventRow)}
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
      ) : (interviews.length > 0 || monthEvents.length > 0) && (
        <ul className="calendar-interviews">
          {monthEvents.map(eventRow)}
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

/**
 * Detail page of one schedule entry: time and place, the join link, reference links, a checklist and notes.
 * Ticking a todo saves at once; everything else goes through the editor.
 */
export function EventDetail({ event, company, busy, onSave, onRemove, onOpenJob }: {
  event: CareerEvent;
  company?: string;
  busy?: boolean;
  /** Resolves true once saved; the editor closes then. */
  onSave: (event: CareerEvent) => Promise<boolean>;
  onRemove: (event: CareerEvent) => Promise<boolean>;
  onOpenJob?: (jobId: string) => void;
}) {
  const { locale, t } = useLocale();
  const [editing, setEditing] = useState(false);
  const [newTodo, setNewTodo] = useState('');
  if (editing) return <EventEditor event={event} busy={busy} onCancel={() => setEditing(false)} onSave={(draft) => void onSave(draft).then((saved) => { if (saved) setEditing(false); })} />;
  const todos = event.todos || [];
  const links = event.links || [];
  const kind = EVENT_KINDS.find(([value]) => value === event.kind)?.[1] || '';
  const status = EVENT_STATUSES.find(([value]) => value === event.status)?.[1] || '';
  const day = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(event.date + 'T00:00:00Z'));
  const time = event.timeStatus === 'unknown' ? t('具体时间待确认') : `${event.start}–${event.end}${event.timeStatus === 'end-estimated' ? ' ' + t('（结束为估计）') : ''}`;
  const saveTodos = (next: EventTodo[]) => onSave({ ...event, todos: next });
  return <div className={'event-detail' + (event.status === 'cancelled' ? ' is-cancelled' : '')}>
    <div className="event-detail-meta">
      <span className={'badge' + (event.status === 'confirmed' ? '' : ' amber')}>{t(status)}</span>
      <span className="badge">{t(kind)}</span>
    </div>
    <dl className="event-detail-facts">
      <div><dt><Clock size={15} aria-label={t('时间')} /></dt><dd><b>{day}</b> {time}</dd></div>
      {event.location && <div><dt><MapPin size={15} aria-label={t('地点')} /></dt><dd>{event.location}</dd></div>}
      {event.url && <div><dt><Video size={15} aria-label={t('会议链接')} /></dt><dd><a href={event.url} target="_blank" rel="noopener noreferrer">{hostOf(event.url)}<ExternalLink size={13} /></a></dd></div>}
      {event.jobId && <div><dt><Flag size={15} aria-label={t('关联公司')} /></dt><dd>{onOpenJob ? <button type="button" className="text-button" onClick={() => onOpenJob(event.jobId!)}>{company || t('查看公司')}</button> : company}</dd></div>}
    </dl>
    <div className="event-detail-actions">
      {event.url && event.status !== 'cancelled' && <a className="primary" href={event.url} target="_blank" rel="noopener noreferrer"><Video size={16} />{t('打开会议链接')}</a>}
      {event.start && event.end && event.status !== 'cancelled' && <button type="button" className="secondary" onClick={() => void exportEvent(event)}><CalendarPlus size={16} />{t('导出日历文件')}</button>}
      <button type="button" className="secondary" disabled={busy} onClick={() => setEditing(true)}><Pencil size={15} />{t('修改')}</button>
      <button type="button" className="secondary" disabled={busy} onClick={() => { if (window.confirm(t('从日程中移除「{0}」？记录会保留，可在报告中查看。', [event.title]))) void onRemove(event); }}><Trash2 size={15} />{t('移除')}</button>
    </div>
    <section className="event-detail-section">
      <h3>{t('待办事项')}{todos.length > 0 && <small>{todos.filter(todo => todo.done).length}/{todos.length}</small>}</h3>
      {todos.length > 0 && <ul className="event-todos">{todos.map((todo, index) => <li key={index} className={todo.done ? 'is-done' : undefined}>
        <label><input type="checkbox" disabled={busy} checked={todo.done} onChange={(e) => void saveTodos(todos.map((item, i) => i === index ? { ...item, done: e.target.checked } : item))} /><span>{todo.text}</span></label>
      </li>)}</ul>}
      {todos.length < 50 && <form className="event-todo-add" onSubmit={(e) => { e.preventDefault(); const text = newTodo.trim(); if (text) void saveTodos([...todos, { text, done: false }]).then((saved) => { if (saved) setNewTodo(''); }); }}>
        <input aria-label={t('新的待办')} placeholder={t('添加待办，回车保存')} maxLength={500} value={newTodo} onChange={(e) => setNewTodo(e.target.value)} disabled={busy} />
        <button type="submit" className="secondary" disabled={busy || !newTodo.trim()}><Plus size={15} />{t('添加')}</button>
      </form>}
    </section>
    {links.length > 0 && <section className="event-detail-section">
      <h3>{t('相关链接')}</h3>
      <ul className="event-links">{links.map((link, index) => <li key={index}><a href={link.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /><span><b>{link.label || hostOf(link.url)}</b>{link.label && <small>{hostOf(link.url)}</small>}</span></a></li>)}</ul>
    </section>}
    <section className="event-detail-section">
      <h3>{t('说明')}</h3>
      {event.description.trim() ? <div className="event-description"><ReactMarkdown remarkPlugins={[remarkGfm]}>{event.description}</ReactMarkdown></div> : <p className="muted">{t('还没有说明。')}</p>}
    </section>
  </div>;
}
