'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, FileText, Headphones } from 'lucide-react';
import { DataActions, DataCell, DataRow, DataTable, DataTitle } from './data-table';
import { api, apiBlob, type Report, type State } from '@/lib/career';
import type { InterviewSession } from '@/lib/interview-session';
import { interviewReportSection, reportInterviewId } from '@/lib/interview-review-navigation';
import { RecordBack, useRecordPage } from './record-page';
import { useLocale } from './locale-provider';
import { Ja } from './japanese-text';

const sections = [['questions', '实际问题'], ['transcript', '原始转写'], ['review', '复盘总结'], ['outcome', '面试结果']] as const;
export default function InterviewReviewHub({ data, openReport }: { data: State; openReport: (report: Report) => void }) {
  const { t } = useLocale();
  const [sort, setSort] = useState<{ key: 'company' | 'date' | 'questions'; desc: boolean }>({ key: 'date', desc: true });
  const [selected, setSelected] = useRecordPage<string>('#interview-review', 'session', id => id, id => id);
  const [document, setDocument] = useState<InterviewSession | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [audio, setAudio] = useState('');
  const [audioLoading, setAudioLoading] = useState(false);
  const audioElement = useRef<HTMLAudioElement>(null);
  const generation = useRef(0);
  const audioObject = useRef('');
  const seekOnLoad = useRef(0);
  const companyName = (session: { jobId: string; title: string }) => data.jobs.find(job => job.id === session.jobId)?.company || session.title;
  const sessions = [...(data.interviews || [])].sort((a, b) => {
    const comparison = sort.key === 'company' ? companyName(a).localeCompare(companyName(b)) : sort.key === 'questions' ? (a.exchangeCount || 0) - (b.exchangeCount || 0) : a.date.localeCompare(b.date);
    return comparison * (sort.desc ? -1 : 1) || b.createdAt.localeCompare(a.createdAt);
  });
  const source = sessions.find(item => item.id === selected);
  const reports = data.reports.filter(item => !item.archivedAt && reportInterviewId(item) === selected);
  useEffect(() => {
    const epoch = ++generation.current;
    setDocument(null); setError(''); setAudio(''); setAudioLoading(false); seekOnLoad.current = 0;
    if (audioObject.current) URL.revokeObjectURL(audioObject.current);
    audioObject.current = '';
    if (!selected) { setLoading(false); return; }
    setLoading(true);
    api<InterviewSession>('interviews/document?id=' + encodeURIComponent(selected)).then(value => {
      if (generation.current === epoch) setDocument(value);
    }).catch(e => { if (generation.current === epoch) setError(e.message); })
      .finally(() => { if (generation.current === epoch) setLoading(false); });
    return () => { generation.current++; if (audioObject.current) URL.revokeObjectURL(audioObject.current); audioObject.current = ''; };
  }, [selected]);
  async function listen(start?: number) {
    if (!selected) return;
    const epoch = generation.current;
    try {
      if (!audioObject.current) {
        setAudioLoading(true);
        const blob = await apiBlob('interviews/audio?id=' + encodeURIComponent(selected));
        if (generation.current !== epoch) return;
        audioObject.current = URL.createObjectURL(blob); setAudio(audioObject.current);
        seekOnLoad.current = start ?? 0;
      } else if (audioElement.current && start !== undefined) {
        audioElement.current.currentTime = start;
        await audioElement.current.play();
      }
      setError('');
    } catch (e) { if (generation.current === epoch) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (generation.current === epoch) setAudioLoading(false); }
  }
  if (!selected) return <section className="interview-review-hub">
    <div className="section-head"><span className="muted">{t('面试记录')} <b>{sessions.length}</b></span></div>
    <section className="panel dt-panel interview-review-table">
      {!sessions.length ? <div className="empty"><h3>{t('还没有面试记录')}</h3><p>{t('同步面试录音和复盘后，会在这里按日期显示。')}</p></div> :
        <DataTable label={t('面试记录')} sort={sort.key} desc={sort.desc} onSort={key => {
          if (key === 'company' || key === 'date' || key === 'questions') setSort({ key, desc: sort.key === key ? !sort.desc : key !== 'company' });
        }} columns={[
          { key: 'company', label: t('公司名称'), width: 'minmax(180px,2fr)', sortable: true },
          { key: 'date', label: t('面试日期'), width: '130px', sortable: true },
          { key: 'questions', label: t('实际问题'), width: '100px', sortable: true },
          { key: 'duration', label: t('录音时长'), width: '110px', hide: 'tablet' },
          { key: 'stage', label: t('复盘状态'), width: '130px' },
          { key: 'actions', label: t('操作'), width: '40px', align: 'end' },
        ]}>{sessions.map(session => {
          const questions = data.reports.filter(report => !report.archivedAt && reportInterviewId(report) === session.id && interviewReportSection(report) === 'questions')
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
          const seconds = Math.max(0, Math.round(session.durationSeconds));
          const stage = { imported: '待转写', transcript: '待复盘', flow: '待复盘', review: '已复盘', practice: '已关联练习' }[session.status];
          return <DataRow key={session.id} onOpen={() => setSelected(session.id)}>
            <DataTitle title={<Ja text={companyName(session)} />} onClick={() => setSelected(session.id)} />
            <DataCell label={t('面试日期')}>{session.date}</DataCell>
            <DataCell label={t('实际问题')}>{questions ? <button className="text-button" title={t('实际问题清单')} aria-label={t('实际问题清单')} onClick={() => openReport(questions)}>{session.exchangeCount ?? 0}</button> : session.exchangeCount ?? 0}</DataCell>
            <DataCell label={t('录音时长')} hide="tablet">{session.audio ? Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0') : '—'}</DataCell>
            <DataCell label={t('复盘状态')}><span className="prep-stage">{t(stage)}</span></DataCell>
            <DataActions><button className="icon-button" title={t('查看复盘')} aria-label={t('查看复盘')} onClick={() => setSelected(session.id)}><ArrowUpRight size={18} /></button></DataActions>
          </DataRow>;
        })}</DataTable>}
    </section>
  </section>;
  const current = document || source;
  return <section className="interview-review-hub">
    <RecordBack title={t('面试复盘')} onBack={() => setSelected(null)} />
    <div className="section-head"><div><h2><Ja text={current?.title || t('面试复盘')} /></h2><p className="muted">{current?.date} · <Ja text={data.jobs.find(job => job.id === current?.jobId)?.company || t('未关联公司')} /></p></div></div>
    {loading && <p role="status">{t('正在读取面试记录…')}</p>}
    {error && <p className="inline-note" role="alert">{error}</p>}
    <div className="interview-review-documents">{sections.map(([section, label]) => {
      const matching = reports.filter(report => interviewReportSection(report) === section).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return <section className="panel" key={section}><h3>{t(label)}</h3>{matching.length ? matching.map(report => <button className="text-button" key={report.id} onClick={() => openReport(report)}><FileText size={16} aria-hidden="true" /><Ja text={report.title} /></button>) : <p className="muted">{t('尚未保存')}</p>}</section>;
    })}</div>
    <section className="panel"><h3>{t('原始录音')}</h3>{current?.audio ? <><button className="secondary" disabled={audioLoading} onClick={() => void listen()}><Headphones size={17} aria-hidden="true" />{t(audioLoading ? '正在读取录音…' : '载入录音')}</button>{audio && <audio ref={audioElement} controls src={audio} preload="metadata" onLoadedMetadata={() => { if (audioElement.current) audioElement.current.currentTime = Math.min(seekOnLoad.current, audioElement.current.duration || 0); }} aria-label={t('原始录音')} />}</> : <p className="muted">{t('尚未保存')}</p>}</section>
    {document?.flow && <section className="panel"><h3>{t('实际问答')}</h3><p className="muted">{t('问题经过语义整理；未确认内容请结合原录音核对。')}</p>{document.flow.exchanges.map((exchange, i) => <details className="interview-review-exchange" key={exchange.id}><summary>{i + 1}. <Ja text={exchange.question} /></summary><p><Ja text={exchange.answerSummary} /></p>{exchange.ranges.map((range, j) => <button className="secondary" key={j} disabled={audioLoading} onClick={() => void listen(range.start)}>{t('定位录音')} {Math.floor(range.start / 60)}:{String(Math.floor(range.start % 60)).padStart(2, '0')}</button>)}</details>)}</section>}
  </section>;
}
