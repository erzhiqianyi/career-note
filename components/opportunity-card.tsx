'use client';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { useLocale } from '@/components/locale-provider';
import {
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
    { key: 'title', label: t('公司 / 职位'), width: 'minmax(0, 1fr)' },
    { key: 'status', label: t('状态'), width: '120px', sortable: true },
    { key: 'next', label: t('下一步'), width: 'minmax(140px, .65fr)', sortable: true },
    { key: 'updated', label: '', width: '40px', align: 'end' },
  ];  return (
    <DataTable columns={columns} className="opportunities-table" label={t('公司与投递')} sort={sort} desc={desc} onSort={onSort}>
      {children}
    </DataTable>
  );
}

export default function OpportunityCard({
  job,
  today,
  day,
  onOpen,
}: {
  job: Job;
  today: string;
  day: (value: string) => ReactNode;
  onOpen: () => void;
}) {
  const { t } = useLocale();
  const overdue = !!job.nextDate && job.nextDate < today;
  return (
    <DataRow>
      <DataTitle
        title={job.company}
        meta={job.role}
        onClick={onOpen}
      />
      <DataCell label={t('状态')}>
        <span className={'badge ' + (statusTone[job.status] || '')}>{t(job.status)}</span>
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
        <button className="icon-button" onClick={onOpen} aria-label={t('查看职位详情')} title={t('查看职位详情')}>
          <ChevronRight size={18} />
        </button>
      </DataActions>
    </DataRow>
  );
}
