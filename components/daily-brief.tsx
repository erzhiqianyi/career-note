'use client';
import { useState } from 'react';
import { RecordBack, useRecordPage } from '@/components/record-page';
import { BriefcaseBusiness, ChevronLeft, ChevronRight, ClipboardList, FileText, MessageSquare, MessageSquareText, Sparkles, Clock3 } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import StatusMark from '@/components/status-mark';
import { workspaceDay } from '@/components/today-calendar';
import type { Job, Material, Report, State } from '@/lib/career';

/**
 * Everything that happened in the workspace on one day: what agents (scheduled or not) brought in,
 * what came due, and what the user did. New record kinds only need a new section here.
 */
export type Brief = {
  date: string;
  due: Job[]; // follow-ups and interviews dated that day
  overdue: Job[]; // only for today: dated earlier and still open
  addedJobs: Job[];
  progressed: { job: Job; status: string }[];
  materials: Material[];
  questionSets: State['questionSets'];
  attempts: State['attempts'];
  reviews: State['reviews'];
  reports: Report[];
  completedTasks: State['tasks'];
  pendingTasks: State['tasks'];
};

const CLOSED = ['未通过', '已撤回', '内定'];
const HISTORY_DAYS = 14;

export function collectBrief(data: State, date: string): Brief {
  const onDay = (at?: string) => !!at && workspaceDay(at) === date;
  const open = data.jobs.filter((j) => !CLOSED.includes(j.status));
  return {
    date,
    due: open.filter((j) => j.nextDate === date),
    overdue: date === data.today ? open.filter((j) => j.nextDate && j.nextDate < date) : [],
    addedJobs: data.jobs.filter((j) => onDay(j.history[0]?.at)),
    progressed: data.jobs.flatMap((job) => job.history.slice(1).filter((h) => onDay(h.at)).map((h) => ({ job, status: h.status }))),
    materials: data.materials.filter((m) => onDay(m.createdAt)),
    questionSets: data.questionSets.filter((q) => onDay(q.createdAt)),
    attempts: data.attempts.filter((a) => onDay(a.createdAt)),
    reviews: data.reviews.filter((r) => onDay(r.createdAt)),
    reports: data.reports.filter((r) => r.date === date),
    completedTasks: data.tasks.filter((t) => t.status === '已完成' && onDay((t as { completedAt?: string }).completedAt || t.createdAt)),
    pendingTasks: date === data.today ? data.tasks.filter((t) => t.status === '待处理') : [],
  };
}

/** Count of things worth a glance; drives the home-page entry badge. */
export function briefSize(b: Brief) {
  return b.due.length + b.overdue.length + b.addedJobs.length + b.materials.length + b.questionSets.length + b.reviews.length + b.reports.length + b.completedTasks.length;
}

export default function DailyBrief({
  data,
  openJob,
  openMaterial,
  openReport,
  requestAnalysis,
  pendingAnalysis = false,
  requesting = false,
}: {
  data: State;
  openJob: (id: string) => void;
  openMaterial: (m: Material) => void;
  openReport: (r: Report) => void;
  requestAnalysis?: () => void;
  pendingAnalysis?: boolean;
  requesting?: boolean;
}) {
  const { locale, t } = useLocale();
  const [date, setDate] = useState(data.today);
  const [openKey, setOpenKey] = useRecordPage<string>('#today/brief', 'section', (id) => id, (id) => id);
  const brief = collectBrief(data, date);
  const shift = (days: number) => {
    const d = new Date(date + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    setDate(d.toISOString().slice(0, 10));
  };
  const title = new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
  const company = (id: string) => data.jobs.find((j) => j.id === id)?.company || t('整个求职工作区');
  const day = (v: string) => (v ? v.slice(0, 10).replaceAll('-', '.') : '—');
  const clock = (at?: string) => (at ? new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(new Date(at)) : '');
  /** One line of a detail list: what it is, which company it belongs to, and where it opens. */
  type Row = { id: string; title: string; group?: string; tag?: string; mark?: string; sub?: string; excerpt?: string; time?: string; onOpen?: () => void };
  const jobRow = (j: Job, sub?: string, extra?: Partial<Row>): Row => ({ id: j.id, title: j.company, mark: j.status, sub: sub ?? j.role, onOpen: () => openJob(j.id), ...extra });
  type Section = { key: string; Icon: typeof FileText; label: string; rows: Row[] };
  const section = (key: string, Icon: typeof FileText, label: string, rows: Row[]): Section => ({ key, Icon, label, rows });
  // Every kind the day can hold, in reading order; the dashboard shows all of them, the detail view one at a time.
  const sections: Section[] = [
    section('due', Clock3, date === data.today ? '今天到期' : '当天到期', [
      ...brief.overdue.map((j) => jobRow(j, j.nextAction || j.role, { tag: t('已逾期') + ' ' + day(j.nextDate) })),
      ...brief.due.map((j) => jobRow(j, j.nextAction || j.role, { tag: j.status === '面试中' ? t('面试') : t('跟进') })),
    ]),
    section('reports', Sparkles, 'Agent 分析', brief.reports.map((r) => ({ id: r.id, title: r.title, time: clock(r.createdAt), excerpt: r.content.replace(/[#*>`_-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200), onOpen: () => openReport(r) }))),
    section('jobs', BriefcaseBusiness, '新收集的职位', brief.addedJobs.map((j) => jobRow(j, j.role, { time: clock(j.history[0]?.at) }))),
    section('materials', FileText, '新准备资料', brief.materials.map((m) => ({ id: m.id, title: m.title, group: company(m.jobId), tag: t(m.kind), time: clock(m.createdAt), onOpen: () => openMaterial(m) }))),
    section('questionSets', ClipboardList, '新题组', brief.questionSets.map((q) => ({ id: q.id, title: q.title, group: company(q.jobId), tag: t('{0} 题', [String(q.questions.length)]), time: clock(q.createdAt), onOpen: () => openJob(q.jobId) }))),
    section('reviews', MessageSquareText, '新点评', brief.reviews.map((r) => { const a = data.attempts.find((x) => x.id === r.attemptId); return { id: r.id, title: a?.question?.title || t('回答点评'), group: a?.jobId ? company(a.jobId) : t('通用题库（模板）'), excerpt: r.summary, time: clock(r.createdAt), onOpen: a ? () => openJob(a.jobId) : undefined }; })),
    section('practice', MessageSquare, '我的练习', brief.attempts.map((a) => ({ id: a.id, title: a.question?.title || a.questionId, group: a.jobId ? company(a.jobId) : t('通用题库（模板）'), tag: t(a.language) + (a.audio ? ' · ' + t('含录音') : ''), time: clock(a.createdAt), onOpen: () => openJob(a.jobId) }))),
    section('progress', BriefcaseBusiness, '投递进展', brief.progressed.map(({ job, status }, i) => ({ id: job.id + i, title: job.company, mark: status, sub: job.role, tag: t(status), onOpen: () => openJob(job.id) }))),
    section('tasks', ClipboardList, 'Agent 任务', [
      ...brief.pendingTasks.map((task) => ({ id: task.id, title: t(task.kind), group: company(task.jobId), tag: t('待处理'), time: clock(task.createdAt) })),
      ...brief.completedTasks.map((task) => ({ id: task.id, title: t(task.kind), group: company(task.jobId), tag: t('已完成'), time: clock((task as { completedAt?: string }).completedAt || task.createdAt) })),
    ]),
  ];
  const sectionCount = (s: Section) => s.rows.length;
  const total = sections.reduce((sum, s) => sum + sectionCount(s), 0);
  // Recent days with their counts, so history is one tap away instead of paging day by day.
  const history = Array.from({ length: HISTORY_DAYS }, (_, i) => {
    const d = new Date(data.today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - (HISTORY_DAYS - 1 - i));
    const key = d.toISOString().slice(0, 10);
    const b = collectBrief(data, key);
    return { key, count: briefSize(b) + b.attempts.length + b.progressed.length, weekday: new Intl.DateTimeFormat(locale, { weekday: 'narrow', timeZone: 'UTC' }).format(d), dayOfMonth: d.getUTCDate() };
  });
  const peak = Math.max(1, ...history.map((h) => h.count));
  const open = sections.find((s) => s.key === openKey);
  if (open) {
    // Group by company when the rows belong to companies; keep a flat list otherwise.
    const groups = new Map<string, Row[]>();
    for (const row of open.rows) groups.set(row.group ?? '', [...(groups.get(row.group ?? '') ?? []), row]);
    const grouped = groups.size > 1 || (groups.size === 1 && !groups.has(''));
    const list = (rows: Row[]) => (
      <ul className="brief-detail-list">
        {rows.map((row) => {
          const inner = (
            <>
              {row.mark && <StatusMark status={row.mark} />}
              <span className="brief-row-main">
                <span className="brief-row-title">{row.title}{row.tag && <em>{row.tag}</em>}</span>
                {row.sub && <span className="brief-row-sub">{row.sub}</span>}
                {row.excerpt && <span className="brief-row-sub brief-excerpt">{row.excerpt}</span>}
              </span>
              {row.time && <time className="brief-row-time">{row.time}</time>}
              {row.onOpen && <ChevronRight size={16} className="brief-row-chevron" aria-hidden="true" />}
            </>
          );
          return <li key={row.id}>{row.onOpen ? <button type="button" onClick={row.onOpen}>{inner}</button> : <div>{inner}</div>}</li>;
        })}
      </ul>
    );
    return (
      <div className="brief-page">
        <RecordBack title={t(open.label)} onBack={() => setOpenKey(null)} />
        <p className="brief-detail-meta"><open.Icon size={15} />{title}{date === data.today && ' · ' + t('今天')}<span className="brief-count">{open.rows.length}</span></p>
        {!open.rows.length ? (
          <section className="panel brief-section"><div className="empty"><p>{t('这一天没有新的内容。定时任务收集到的职位、资料和点评会出现在这里。')}</p></div></section>
        ) : grouped ? (
          [...groups].map(([name, rows]) => (
            <section key={name} className="panel brief-section brief-group">
              <h2><BriefcaseBusiness size={16} />{name || t('整个求职工作区')}<span className="brief-count">{rows.length}</span></h2>
              {list(rows)}
            </section>
          ))
        ) : (
          <section className="panel brief-section">{list(open.rows)}</section>
        )}
      </div>
    );
  }
  return (
    <div className="brief-page">
      <div className="brief-head">
        <button type="button" className="icon-button" aria-label={t('前一天')} onClick={() => shift(-1)}><ChevronLeft size={18} /></button>
        <b>{title}{date === data.today && <small>{t('今天')}</small>}</b>
        <button type="button" className="icon-button" aria-label={t('后一天')} disabled={date >= data.today} onClick={() => shift(1)}><ChevronRight size={18} /></button>
        {date !== data.today && <button type="button" className="text-button" onClick={() => setDate(data.today)}>{t('回到今天')}</button>}
        {date === data.today && requestAnalysis && (pendingAnalysis
          ? <span className="muted small brief-queued">{t('分析已排队，等待 AI Agent 生成。')}</span>
          : <button type="button" className="secondary brief-request" disabled={requesting} onClick={requestAnalysis}><Sparkles size={15} />{t('请求今日分析')}</button>)}
      </div>
      <p className="brief-summary">{total ? t('共 {0} 项新内容，点开分类查看详情。', [String(total)]) : t('这一天没有新的内容。定时任务收集到的职位、资料和点评会出现在这里。')}</p>
      <div className="brief-stats">
        {sections.map(({ key, Icon, label, rows }) => { const count = rows.length; return (
          <button key={key} type="button" className={count ? undefined : 'is-zero'} disabled={!count} aria-label={t('查看{0}', [t(label)])} onClick={() => setOpenKey(key)}>
            <span><Icon size={16} />{t(label)}</span>
            <strong>{count}<small>{t('项')}</small></strong>
          </button>
        ); })}
      </div>
      <section className="panel brief-history">
        <h2>{t('最近 {0} 天', [String(HISTORY_DAYS)])}</h2>
        <ol>
          {history.map((h) => (
            <li key={h.key}>
              <button type="button" aria-pressed={h.key === date} aria-label={h.key + ' · ' + t('{0} 项', [String(h.count)])} onClick={() => setDate(h.key)}>
                <i style={{ height: Math.round((h.count / peak) * 100) + '%' }} />
                <b>{h.count || ''}</b>
                <span>{h.dayOfMonth}</span>
                <small>{h.weekday}</small>
              </button>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
