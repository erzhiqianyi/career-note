'use client';
import { ExternalLink, FolderOpen, MessageSquare, Pencil } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocale } from '@/components/locale-provider';
import {
  Count,
  DataActions,
  DataCell,
  DataRow,
  DataTable,
  DataTitle,
  type Column,
} from '@/components/data-table';
import type { Job } from '@/lib/career';

export type JobSortKey = 'title' | 'added' | 'updated' | 'next' | 'match' | 'status';

const statusTone: Record<string, string> = {
  面试中: 'blue',
  内定: 'green',
  未通过: 'gray',
  已撤回: 'gray',
};
const matchTone: Record<string, string> = {
  优先准备: 'green',
  先确认条件: 'amber',
  暂不匹配: 'gray',
};

/** First status entry is when the job entered the workspace. */
export function jobAddedAt(job: Job) {
  return job.history?.[0]?.at || job.sourceDate || job.updatedAt || '';
}

export function MatchBadge({ level }: { level: string }) {
  const { t } = useLocale();
  return level ? (
    <span className={'badge ' + (matchTone[level] || '')}>{t(level)}</span>
  ) : (
    <span className="badge pending">{t('待评估')}</span>
  );
}

export function OpportunityTable({
  sort,
  desc,
  onSort,
  children,
}: {
  sort: JobSortKey;
  desc: boolean;
  onSort: (key: JobSortKey) => void;
  children: ReactNode;
}) {
  const { t } = useLocale();
  const columns: Column<JobSortKey>[] = [
    { key: 'title', label: t('公司 / 职位'), width: 'minmax(200px, 1.6fr)' },
    { key: 'status', label: t('状态'), width: '96px', sortable: true },
    { key: 'match', label: t('匹配评价'), width: '104px', sortable: true },
    { key: 'added', label: t('加入'), width: '84px', sortable: true, hide: 'tablet' },
    { key: 'next', label: t('下一步'), width: 'minmax(150px, 1fr)', sortable: true },
    { key: 'updated', label: t('操作'), width: '132px', align: 'end' },
  ];
  return (
    <DataTable columns={columns} label={t('公司与投递')} sort={sort} desc={desc} onSort={onSort}>
      {children}
    </DataTable>
  );
}

export default function OpportunityCard({
  job,
  today,
  materialCount,
  questionCount,
  day,
  onOpen,
  onPractice,
  onEdit,
}: {
  job: Job;
  today: string;
  materialCount: number;
  questionCount: number;
  day: (value: string) => ReactNode;
  onOpen: () => void;
  onPractice: () => void;
  onEdit: () => void;
}) {
  const { t } = useLocale();
  const overdue = !!job.nextDate && job.nextDate < today;
  return (
    <DataRow>
      <DataTitle
        title={job.company}
        meta={job.role + (job.location ? ' · ' + job.location : '')}
        onClick={onOpen}
      />
      <DataCell label={t('状态')}>
        <span className={'badge ' + (statusTone[job.status] || '')}>{t(job.status)}</span>
      </DataCell>
      <DataCell label={t('匹配评价')}>
        <MatchBadge level={job.matchLevel} />
      </DataCell>
      <DataCell label={t('加入')} hide="tablet" className="num">
        {day(jobAddedAt(job))}
      </DataCell>
      <DataCell
        label={t('下一步')}
        className={'dt-next' + (overdue ? ' overdue' : '')}
        title={job.nextAction || undefined}
      >
        {job.nextDate ? (
          <>
            <b>{day(job.nextDate)}</b>
            {overdue && <small>{t('已逾期')}</small>}
          </>
        ) : (
          <small>{t('未安排')}</small>
        )}
        {job.nextAction && <span className="ellipsis">{job.nextAction}</span>}
      </DataCell>
      <DataActions>
        <button
          className="icon-button"
          onClick={onOpen}
          title={`${t('查看准备资料')} · ${materialCount}`}
          aria-label={`${t('查看准备资料')} · ${materialCount}`}
        >
          <FolderOpen size={16} />
          <Count n={materialCount} />
        </button>
        <button
          className="icon-button"
          onClick={onPractice}
          disabled={questionCount === 0}
          title={questionCount ? `${t('面试练习')} · ${questionCount}` : t('还没有练习题')}
          aria-label={`${t('面试练习')} · ${questionCount}`}
        >
          <MessageSquare size={16} />
          <Count n={questionCount} />
        </button>
        <button className="icon-button" onClick={onEdit} title={t('更新进展')} aria-label={t('更新进展')}>
          <Pencil size={16} />
        </button>
        {job.url ? (
          <a
            className="icon-button"
            href={job.url}
            target="_blank"
            rel="noreferrer"
            title={t('招聘原文')}
            aria-label={t('招聘原文')}
          >
            <ExternalLink size={16} />
          </a>
        ) : (
          <span className="icon-button placeholder" aria-hidden />
        )}
      </DataActions>
    </DataRow>
  );
}
