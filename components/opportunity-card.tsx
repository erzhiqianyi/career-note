import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  ExternalLink,
} from 'lucide-react';
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
  return (
    <article className="opportunity-card">
      <div className="opportunity-heading">
        <div>
          <button className="opportunity-name" onClick={onOpen}>
            {job.company}
            <ArrowUpRight size={17} />
          </button>
          <p>{job.role}</p>
        </div>
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
          {job.status}
        </span>
      </div>
      <div className="opportunity-body">
        <div>
          <dl className="opportunity-facts">
            <div>
              <dt>工作地点</dt>
              <dd>{job.location || '待确认'}</dd>
            </div>
            <div>
              <dt>日语要求</dt>
              <dd>{job.japanese || '待确认'}</dd>
            </div>
          </dl>
          <details>
            <summary>匹配点与待确认事项</summary>
            <p className="prewrap">{job.matchNotes || '匹配情况待补充'}</p>
            <p className="prewrap">
              {job.unknowns || '请先核对招聘来源与岗位要求。'}
            </p>
          </details>
          {job.url && (
            <a
              className="source-link"
              href={job.url}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
              招聘原文{job.sourceDate && ` · 信息日期 ${job.sourceDate}`}
            </a>
          )}
        </div>
        <div className="opportunity-preparation">
          <h3>从这家公司开始准备</h3>
          <p>
            {materialCount
              ? `已整理 ${materialCount} 份准备材料`
              : '先整理职位要求与个人经历'}
            {questionCount > 0 && `，可练习 ${questionCount} 道面试题`}。
          </p>
          <button
            className={questionCount ? 'primary' : 'secondary'}
            onClick={questionCount ? onPractice : onOpen}
          >
            {questionCount ? (
              <CalendarDays size={17} />
            ) : (
              <FileText size={17} />
            )}{' '}
            {questionCount ? '练一题面试回答' : '查看准备资料'}
          </button>
          <div className="opportunity-next">
            <span>{job.nextAction ? '已安排的下一步' : '跟进安排'}</span>
            <p>
              {job.nextAction || '准备好后，为下一步留个日期。'}
              {job.nextDate && ` · ${job.nextDate}`}
            </p>
            <button className="text-button" onClick={onEdit}>
              {job.nextAction ? '更新进展' : '设置下一步'}
              <ArrowUpRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
