'use client';
import { useEffect } from 'react';
import { ExternalLink, Printer } from 'lucide-react';
import type { Job } from '@/lib/career';
import { Ja } from '@/components/japanese-text';
import { useLocale } from '@/components/locale-provider';

/**
 * One-page Japanese company board, laid out like a single infographic so it can be read at a glance
 * or printed. Headings stay Japanese in every UI language because the board is interview material.
 */
export function CompanyBoard({ job }: { job: Job }) {
  const { t: tr } = useLocale();
  const profile = job.companyProfile;
  useEffect(() => {
    const done = () => document.documentElement.classList.remove('print-company-board');
    window.addEventListener('afterprint', done);
    return () => { window.removeEventListener('afterprint', done); done(); };
  }, []);
  if (!profile) {
    return <section className="panel prep-tab-panel company-board-empty">
      <h2>{tr('还没有企业看板')}</h2>
      <p className="muted">{tr('让 Agent 按 career-job-research 流程调研这家公司，写入 companyProfile 后会在这里显示业务、优势、沿革和发展预期。')}</p>
    </section>;
  }
  // Headcount is one of the first things a reader checks; fall back to the job's 员工人数 when the research left it out.
  const hasHeadcount = profile.facts.some((fact) => /従業員|社員数|人数/.test(fact.label));
  const facts = job.employeeCount?.trim() && !hasHeadcount
    ? [{ label: '従業員数', value: job.employeeCount.trim() }, ...profile.facts]
    : profile.facts;
  const print = () => {
    document.documentElement.classList.add('print-company-board');
    window.print();
  };
  return <div className="prep-tab-panel company-board-wrap">
    <article className="company-board" lang="ja" aria-label={`${job.company} 企業ボード`}>
      <header className="cb-head">
        <div className="cb-title-row">
          <div className="cb-title">
            <p className="cb-kicker">企業研究ボード</p>
            <h2 className="cb-name">{job.company}</h2>
            {job.companyReading && <p className="cb-reading">{job.companyReading}</p>}
          </div>
          <div className="company-board-toolbar">
            <button type="button" className="secondary" onClick={print}><Printer size={16} aria-hidden="true" />{tr('打印 / 保存 PDF')}</button>
          </div>
        </div>
        {profile.tagline && <p className="cb-tagline"><Ja text={profile.tagline} /></p>}
        {facts.length > 0 && <dl className="cb-facts">
          {facts.map((fact, i) => <div key={i}><dt>{fact.label}</dt><dd><Ja text={fact.value} /></dd></div>)}
        </dl>}
      </header>
      <section className="cb-block cb-overview">
        <h3><span>01</span>事業概要</h3>
        <p className="prewrap"><Ja text={profile.overview} /></p>
      </section>
      {profile.segments.length > 0 && <section className="cb-block cb-segments">
        <h3><span>02</span>事業内容</h3>
        <ul>
          {profile.segments.map((segment, i) => <li key={i}>
            <b><Ja text={segment.name} /></b>
            {segment.share && <span className="cb-share"><Ja text={segment.share} /></span>}
            {segment.detail && <p><Ja text={segment.detail} /></p>}
          </li>)}
        </ul>
      </section>}
      <div className="cb-columns">
        {profile.strengths.length > 0 && <section className="cb-block cb-strengths">
          <h3><span>03</span>強み・優位性</h3>
          <ol>{profile.strengths.map((item, i) => <li key={i}><b><Ja text={item.title} /></b>{item.detail && <p><Ja text={item.detail} /></p>}</li>)}</ol>
        </section>}
        {profile.outlook.length > 0 && <section className="cb-block cb-outlook">
          <h3><span>04</span>今後の展望</h3>
          <ul>{profile.outlook.map((item, i) => <li key={i}><b><Ja text={item.title} /></b>{item.detail && <p><Ja text={item.detail} /></p>}</li>)}</ul>
        </section>}
      </div>
      {profile.history.length > 0 && <section className="cb-block cb-history">
        <h3><span>05</span>沿革</h3>
        <ol>{profile.history.map((item, i) => <li key={i}><time>{item.year}</time><p><Ja text={item.event} /></p></li>)}</ol>
      </section>}
      {profile.concerns.length > 0 && <section className="cb-block cb-concerns">
        <h3><span>06</span>懸念点・面接での確認事項</h3>
        <ul>{profile.concerns.map((item, i) => <li key={i}><b><Ja text={item.title} /></b>{item.detail && <p><Ja text={item.detail} /></p>}</li>)}</ul>
      </section>}
      <footer className="cb-foot">
        <p>情報確認日：{profile.verifiedAt.replaceAll('-', '.')}　／　公開情報をもとに作成。展望の「分析」は推測を含みます。</p>
        <ul>{profile.sources.map((source, i) => <li key={i}><a href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink size={12} aria-hidden="true" /></a></li>)}</ul>
      </footer>
    </article>
  </div>;
}
