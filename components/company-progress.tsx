'use client';
import { CalendarDays, Check, Clock3, FileText, Flag, MessageSquare, X } from 'lucide-react';
import type { Job, State } from '@/lib/career';
import type { CareerEvent } from '@/lib/calendar-events';
import { companyTimeline, pipelineView, type TimelineItem } from '@/lib/company-timeline';
import { useLocale } from '@/components/locale-provider';

const day = (value: string) => (value ? value.replaceAll('-', '.') : '');
/** Full date, with a month.day form that narrow screens show instead so six steps fit side by side. */
const stepDay = (value: string) => value ? <><span className="step-day-full">{day(value)}</span><span className="step-day-short">{day(value.slice(5))}</span></> : null;
const eventKinds: Record<string, string> = { interview: '面试', counseling: '面谈・咨询', fair: '招聘会・说明会' };

/** The usual application path with the day each step was reached, and the next step beside it. */
export function ProgressStepper({ job, today }: { job: Job; today: string }) {
  const { t } = useLocale();
  const { steps, ending } = pipelineView(job);
  const overdue = !!job.nextDate && job.nextDate < today;
  return <section className="progress-stepper" aria-label={t('选考进度')}>
    <ol>
      {steps.map((step) => <li key={step.status} className={'is-' + step.state} aria-current={step.state === 'current' ? 'step' : undefined}>
        <span className="progress-step-mark" aria-hidden="true">{step.state === 'done' ? <Check size={13} /> : step.state === 'ended' ? <X size={13} /> : null}</span>
        <b>{t(step.status)}</b>
        <small>{step.state === 'ended' && ending ? <>{t(ending.status)}{ending.date && <> · {stepDay(ending.date)}</>}</> : stepDay(step.date)}</small>
      </li>)}
    </ol>
    {(job.nextAction || job.nextDate) && !ending && <p className={'progress-next' + (overdue ? ' is-overdue' : '')}>
      <Flag size={15} aria-hidden="true" /><span>{t('下一步')}</span>
      <b>{job.nextAction || t('未填写内容')}</b>
      {job.nextDate && <time dateTime={job.nextDate}>{day(job.nextDate)}{overdue ? ' · ' + t('已逾期') : ''}</time>}
    </p>}
  </section>;
}

/** Everything dated for one company: what is coming up, then what already happened, newest first. */
export function CompanyTimeline({ job, data, onOpenMaterial, onOpenEvent, onOpenPractice }: {
  job: Job;
  data: State;
  onOpenMaterial: (id: string) => void;
  onOpenEvent?: (event: CareerEvent) => void;
  onOpenPractice: () => void;
}) {
  const { t } = useLocale();
  const { upcoming, past } = companyTimeline(job, data);
  const row = (item: TimelineItem) => {
    const body = (() => {
      switch (item.kind) {
        case 'status': return { icon: <Clock3 size={15} />, label: t('投递状态'), text: t(item.title) };
        case 'next': return { icon: <Flag size={15} />, label: t('下一步'), text: item.title || t('未填写内容') };
        case 'event': return { icon: <CalendarDays size={15} />, label: t(eventKinds[item.detail || ''] || '日程'), text: item.title + (item.event?.status === 'cancelled' ? '（' + t('已取消') + '）' : '') };
        case 'material': return { icon: <FileText size={15} />, label: t('资料'), text: item.title };
        case 'practice': return { icon: <MessageSquare size={15} />, label: t('练习'), text: [item.count ? t('回答 {0} 题', [item.count]) : '', Number(item.detail) ? t('点评 {0} 条', [item.detail]) : ''].filter(Boolean).join(' · ') };
      }
    })();
    const open = item.kind === 'material' && item.materialId ? () => onOpenMaterial(item.materialId!)
      : item.kind === 'event' && item.event && onOpenEvent ? () => onOpenEvent(item.event!)
      : item.kind === 'practice' ? onOpenPractice : undefined;
    const content = <>
      <span className="company-timeline-icon" aria-hidden="true">{body.icon}</span>
      <span className="company-timeline-text"><small>{body.label}</small><b>{body.text}</b></span>
      <time dateTime={item.date || undefined} className={item.overdue ? 'is-overdue' : ''}>{item.date ? day(item.date) : t('未定日期')}{item.overdue ? ' · ' + t('已逾期') : ''}</time>
    </>;
    return <li key={item.key} className={'is-' + item.kind}>{open ? <button type="button" onClick={open}>{content}</button> : <div>{content}</div>}</li>;
  };
  return <div className="prep-tab-panel company-timeline">
    <ProgressStepper job={job} today={data.today} />
    {upcoming.length > 0 && <section className="panel">
      <h2 className="prep-block-heading">{t('接下来')}</h2>
      <ol className="company-timeline-list">{upcoming.map(row)}</ol>
    </section>}
    <section className="panel">
      <h2 className="prep-block-heading">{t('已经发生')}</h2>
      {past.length ? <ol className="company-timeline-list">{past.map(row)}</ol> : <p className="muted">{t('还没有记录')}</p>}
    </section>
  </div>;
}
