'use client';
import { ArrowUpRight } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import { RecordRow } from '@/components/record-list';
import type { Job } from '@/lib/career';
export default function OpportunityCard({
  job,
  materialCount,
  questionCount,
  onOpen,
  onPractice,
  onEdit,
}: {
  job: Job;
  materialCount: number;
  questionCount: number;
  onOpen: () => void;
  onPractice: () => void;
  onEdit: () => void;
}) {
  const { t } = useLocale();
  return (
    <RecordRow
      title={
        <button className="record-title-button" onClick={onOpen}>
          {job.company}
          <ArrowUpRight size={16} />
        </button>
      }
      badge={
        <span
          className={
            'badge ' +
            (job.status === '面试中'
              ? 'blue'
              : job.status === '内定'
                ? 'green'
                : '')
          }
        >
          {t(job.status)}
        </span>
      }
      meta={`${job.role} · ${job.location || t('待确认')} · ${job.japanese || t('待确认')}`}
      description={job.nextAction || t('先整理职位要求与个人经历')}
      actions={
        <>
          <button className="text-button" onClick={onOpen}>
            {t('查看准备资料')} · {materialCount}
          </button>
          {questionCount > 0 && (
            <button className="text-button" onClick={onPractice}>
              {t('面试练习')} · {questionCount}
            </button>
          )}
          <button className="text-button" onClick={onEdit}>
            {t('更新进展')}
          </button>
        </>
      }
    >
      <small className="record-meta">{job.nextDate}</small>
      <details className="record-extra">
        <summary>{t('匹配点与待确认事项')}</summary>
        <p>{job.matchNotes || t('匹配情况待补充')}</p>
        <p>{job.unknowns || t('请先核对招聘来源与岗位要求。')}</p>
        {job.url && (
          <a href={job.url} target="_blank" rel="noreferrer">
            {t('招聘原文')}
          </a>
        )}
      </details>
    </RecordRow>
  );
}
