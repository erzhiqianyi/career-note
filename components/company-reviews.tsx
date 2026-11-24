'use client';
import { ExternalLink } from 'lucide-react';
import type { Job } from '@/lib/career';
import type { ReviewTone } from '@/lib/company-reviews';
import { Ja } from '@/components/japanese-text';
import { useLocale } from '@/components/locale-provider';

const TONE_LABEL: Record<ReviewTone, string> = { positive: '好评', negative: '差评', mixed: '褒贬不一' };

/** Japanese text with its Chinese translation underneath, so a review can be read in either language. */
function Bilingual({ ja, zh }: { ja: string; zh: string }) {
  return <div className="cr-bilingual">
    <p className="prewrap" lang="ja"><Ja text={ja} /></p>
    {zh && <p className="prewrap cr-zh" lang="zh-CN">{zh}</p>}
  </div>;
}

/**
 * Employee reviews (口コミ) for one company: overall reading, recurring themes and individual entries.
 * These are opinions from review sites, so every entry keeps its date, reviewer attributes and source link.
 */
export function CompanyReviewsPanel({ job }: { job: Job }) {
  const { t: tr } = useLocale();
  const reviews = job.companyReviews;
  if (!reviews) {
    return <section className="panel prep-tab-panel company-board-empty">
      <h2>{tr('还没有口碑')}</h2>
      <p className="muted">{tr('让 Agent 读取口碑网站并写入 companyReviews 后，这里会并排显示日语原文与中文翻译。')}</p>
    </section>;
  }
  return <div className="prep-tab-panel company-reviews">
    <section className="panel cr-summary">
      <div className="cr-head">
        <h2>{tr('口碑')}</h2>
        {reviews.overall && <span className="cr-overall">{reviews.overall}</span>}
      </div>
      <Bilingual ja={reviews.summaryJa} zh={reviews.summaryZh} />
      <p className="muted cr-note">{tr('口碑是在职或离职员工的个人感受，不是已核实的公司事实；时间较早的评价可能已不符合现状。')}</p>
    </section>
    {reviews.themes.length > 0 && <section className="panel cr-themes">
      <h3>{tr('主要话题')}</h3>
      <ul>
        {reviews.themes.map((theme, i) => <li key={i} className={`cr-theme cr-${theme.tone}`}>
          <div className="cr-theme-head"><b><Ja text={theme.title} /></b><span className="cr-tone">{tr(TONE_LABEL[theme.tone])}</span></div>
          <Bilingual ja={theme.ja} zh={theme.zh} />
        </li>)}
      </ul>
    </section>}
    {reviews.entries.length > 0 && <section className="panel cr-entries">
      <h3>{tr('口碑列表')} <span className="muted">（{reviews.entries.length}）</span></h3>
      <ol>
        {reviews.entries.map((entry, i) => <li key={i} className="cr-entry">
          <div className="cr-meta">
            <span className="cr-category">{entry.category}</span>
            {entry.rating && <span className="cr-rating">★ {entry.rating}</span>}
            <time>{entry.postedAt}</time>
            {entry.reviewer && <span className="muted">{entry.reviewer}</span>}
            {entry.url && <a href={entry.url} target="_blank" rel="noreferrer noopener" aria-label={tr('打开原文')}><ExternalLink size={14} aria-hidden="true" /></a>}
          </div>
          <Bilingual ja={entry.ja} zh={entry.zh} />
        </li>)}
      </ol>
    </section>}
    <footer className="muted cr-sources">
      <span>{tr('来源')}：</span>
      {reviews.sources.map((source, i) => <a key={i} href={source.url} target="_blank" rel="noreferrer noopener">{source.label}</a>)}
      <span>· {tr('核验日期')} {reviews.verifiedAt}</span>
    </footer>
  </div>;
}
