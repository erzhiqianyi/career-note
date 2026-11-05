'use client';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, FileText, Headphones, MessageSquareText } from 'lucide-react';
import { api, apiBlob, type Report, type State } from '@/lib/career';
import type { InterviewSession } from '@/lib/interview-session';
import { interviewReportSection, interviewSessionHash, reportInterviewId } from '@/lib/interview-review-navigation';
import { RecordBack, useRecordPage } from './record-page';
import { useLocale } from './locale-provider';
import { Ja } from './japanese-text';

const sections = [['questions', '实际问题'], ['transcript', '原始转写'], ['review', '复盘总结'], ['outcome', '面试结果']] as const;
export default function InterviewReviewHub({ data, openReport }: { data: State; openReport: (report: Report) => void }) {
  const { t } = useLocale();
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
  const sessions = [...(data.interviews || [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
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
    <div className="section-head"><div><h2>{t('面试复盘')}</h2><p className="muted">{t('按面试日期回看实际问题、录音、转写、总结与结果。')}</p></div><MessageSquareText aria-hidden="true" /></div>
    {!sessions.length ? <section className="panel"><h3>{t('还没有面试记录')}</h3><p>{t('同步面试录音和复盘后，会在这里按日期显示。')}</p></section> :
      <div className="interview-review-list">{sessions.map(session => {
        const company = data.jobs.find(job => job.id === session.jobId)?.company;
        const related = data.reports.filter(report => !report.archivedAt && reportInterviewId(report) === session.id);
        return <article className="panel" key={session.id}>
          <div className="interview-review-meta"><span><CalendarDays size={16} aria-hidden="true" />{session.date}</span><span><Ja text={company || t('未关联公司')} /></span></div>
          <h3><a href={interviewSessionHash(session.id)}><Ja text={session.title} /></a></h3>
          <p className="muted">{t('实际问题')} {session.exchangeCount ?? 0} · {t('转写片段')} {session.segmentCount ?? 0}</p>
          <div className="interview-review-actions"><a className="primary" href={interviewSessionHash(session.id)}>{t('查看复盘')}</a>{related.filter(r => interviewReportSection(r) === 'questions').map(r => <button className="secondary" key={r.id} onClick={() => openReport(r)}>{t('实际问题清单')}</button>)}</div>
        </article>;
      })}</div>}
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
