'use client';
import { useRecordPage } from './record-page';
import { DataTable, DataRow, DataTitle, DataCell } from './data-table';
import { useLocale } from '@/components/locale-provider';

import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  ListChecks,
  MessageSquare,
  MessageSquareText,
  Mic,
  Pencil,
  Play,
  Plus,
  Save,
  Square,
  Trash2,
  Upload,
  Search,
  Sparkles,
} from 'lucide-react';
import StatusMark from '@/components/status-mark';
import { api, apiBlob, apiUpload, materialKinds, statuses, type Attempt, type Job, type Material, type Profile, type Report, type State } from '@/lib/career';
import { BANK_JOB_ID, builtinQuestionSets } from '@/lib/interview-bank';
import { buildHints, type Hints } from '@/lib/interview-hints';
import { resumeSections } from '@/lib/resume';
import { prepRank, prepStage, prepStageTone, type PrepProgress } from '@/lib/prep-stage';
import { Ja } from '@/components/japanese-text';
const profileLabels: Record<string, string> = {
  summary: '个人概要',
  skills: '技能',
  experience: '经历',
  targetRoles: '目标岗位',
  japanese: '日语',
  conditions: '条件',
};
type Draft = {
  text: string;
  language: string;
  seconds: string;
  dirty: boolean;
};
const emptyDraft: Draft = {
  text: '',
  language: '日语',
  seconds: '',
  dirty: false,
};
type PrepSortKey = 'company' | 'status' | 'schedule' | 'prep';
type PrepColumn = PrepSortKey;
/** Four sections of one company's preparation page. */
type PrepTab = 'info' | 'materials' | 'practice' | 'summary';
const PREP_TABS: Array<[PrepTab, string]> = [
  ['info', '信息'],
  ['materials', '资料'],
  ['practice', '练习'],
  ['summary', '总结'],
];
const RECORD_MAX_SECONDS = 600;
const fmtClock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
/** MediaRecorder container the browser can produce; Chrome/Firefox give webm/opus, Safari gives mp4. */
function recordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
}
type Recording = { key: string; blob: Blob; url: string; seconds: number };

/** Plays the recording stored with a saved answer; bytes are fetched with the session's credentials. */
function AttemptAudio({ attemptId, size }: { attemptId: string; size: number }) {
  const { t } = useLocale();
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;
    apiBlob('attempts/audio?id=' + encodeURIComponent(attemptId))
      .then((blob) => { if (cancelled) return; objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : '录音读取失败'); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attemptId]);
  if (error) return <p className="muted small">{t(error)}</p>;
  return <div className="attempt-audio">
    <Mic size={15} />
    {/* eslint-disable-next-line jsx-a11y/media-has-caption -- the user's own voice memo; the answer text beside it is the transcript */}
    {url ? <audio controls preload="metadata" src={url} /> : <span className="muted small">{t('正在读取录音…')}</span>}
    <span className="muted small">{Math.round(size / 1024)} KB</span>
  </div>;
}

export default function InterviewPractice({
  data,
  reload,
  openMaterial,
  openReport,
  requestPreparation,
  pendingJobIds = [],
  requesting = false,
  onAddJob,
  onImport,
  onEditJob,
}: {
  data: State;
  reload: () => Promise<void>;
  openMaterial: (material: Material) => void;
  openReport?: (report: Report) => void;
  requestPreparation?: (jobId: string) => void;
  pendingJobIds?: string[];
  requesting?: boolean;
  /** List and company-page actions that belong to the job records themselves (owned by the page). */
  onAddJob?: () => void;
  onImport?: () => void;
  onEditJob?: (job: Job) => void;
}) {
  const { t: tr, locale } = useLocale();
  const day = (v: string) => (v ? v.slice(0, 10).replaceAll('-', '.') : '—');
  // 准备资料（企业研究、志望动机、面试准备等）和练习题同属一家公司的面试准备，放在同一页。
  const materials = data.materials || [];
  const materialsFor = (jobId: string) => materials.filter(m => (m.jobId || '') === jobId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const materialTable = (rows: Material[], label: string, withCompany = false) => <DataTable label={label} columns={[
    { key: 'title', label: tr(withCompany ? '标题 / 公司' : '标题'), width: 'minmax(0,1fr)' },
    { key: 'kind', label: tr('类型'), width: '110px' },
    { key: 'review', label: tr('状态'), width: '80px' },
  ]}>{rows.map(m => <DataRow key={m.id} onOpen={() => openMaterial(m)}>
    <DataTitle title={m.title} meta={<>{withCompany ? (data.jobs.find(j => j.id === m.jobId)?.company || tr('整个求职工作区')) + ' · ' : ''}{day(m.createdAt)}</>} onClick={() => openMaterial(m)} />
    <DataCell label={tr('类型')}>{tr(m.kind)}</DataCell>
    <DataCell label={tr('状态')} corner><span className="badge amber">{tr(m.reviewStatus || '待核对')}</span></DataCell>
  </DataRow>)}</DataTable>;
  const [company, setCompany] = useRecordPage<string>('#jobs', 'company', id => id === BANK_JOB_ID || data.jobs.some(j => j.id === id) ? id : null, id => id);
  const [help, setHelp] = useRecordPage<string>('#jobs', 'help', id => { const [p, q] = id.split('|'); return [...builtinQuestionSets, ...data.questionSets].some(pack => pack.id === p && pack.questions.some(question => question.id === q)) ? id : null; }, id => id);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('进行中');
  const [tab, setTab] = useState<PrepTab>('practice');
  const [sort, setSort] = useState<{ key: PrepSortKey; desc: boolean }>({ key: 'schedule', desc: false });
  const [practiceRecord, setPracticeRecord] = useRecordPage<string>('#jobs', 'question', id => {
    const [p, q] = id.split('|');
    return [...builtinQuestionSets, ...data.questionSets].some(pack => pack.id === p && pack.questions.some(question => question.id === q)) ? id : null;
  }, id => id);
  const [guide, setGuide] = useRecordPage<string>('#jobs', 'guide', id => [...builtinQuestionSets, ...data.questionSets].some(p => p.id === id) ? id : null, id => id);
  const routePack = help ? [...builtinQuestionSets, ...data.questionSets].find(p => p.id === help.split('|')[0]) : guide ? [...builtinQuestionSets, ...data.questionSets].find(p => p.id === guide) : practiceRecord ? [...builtinQuestionSets, ...data.questionSets].find(p => p.id === practiceRecord.split('|')[0]) : undefined;
  const jobId = routePack ? (routePack.jobId || BANK_JOB_ID) : company || BANK_JOB_ID;
  const isBank = jobId === BANK_JOB_ID;
  // Bank text is authored in Chinese and translatable; user/agent text is shown verbatim.
  const bt = (text: string) => (isBank ? tr(text) : text);
  const [packId, setPackId] = useState(''),
    [questionId, setQuestionId] = useState(''),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [picked, setPicked] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    // One recording at a time, for the question that is open; it is uploaded right after the answer is saved.
    [recordingState, setRecording] = useState<Recording | null>(null),
    [recState, setRecState] = useState<'idle' | 'recording'>('idle'),
    [recSeconds, setRecSeconds] = useState(0);
  const recorder = useRef<{ media: MediaRecorder; stream: MediaStream; chunks: Blob[]; ticks: number; timer: number } | null>(null);
  const canRecord = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && !!recordingMimeType();
  function discardRecording() {
    setRecording((current) => { if (current) URL.revokeObjectURL(current.url); return null; });
  }
  function stopRecording() {
    const current = recorder.current;
    if (!current) return;
    window.clearInterval(current.timer);
    current.media.stop();
    current.stream.getTracks().forEach((track) => track.stop());
    recorder.current = null;
    setRecState('idle');
  }
  async function startRecording(forKey: string) {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const media = new MediaRecorder(stream, { mimeType: recordingMimeType() });
      const chunks: Blob[] = [];
      media.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      media.onstop = () => {
        const seconds = Math.min(RECORD_MAX_SECONDS, Math.round(ticks.count / 2));
        const blob = new Blob(chunks, { type: media.mimeType.split(';')[0] });
        discardRecording();
        if (blob.size) {
          setRecording({ key: forKey, blob, url: URL.createObjectURL(blob), seconds });
          edit({ seconds: String(seconds) }); // the spoken length is the duration that matters
        }
      };
      // Elapsed time is counted in half-second ticks so the clock needs no wall-clock reads.
      const ticks = { count: 0 };
      const timer = window.setInterval(() => {
        ticks.count += 1;
        setRecSeconds(Math.round(ticks.count / 2));
        if (ticks.count >= RECORD_MAX_SECONDS * 2) stopRecording();
      }, 500);
      recorder.current = { media, stream, chunks, ticks: 0, timer };
      media.start();
      setRecSeconds(0);
      setRecState('recording');
    } catch (e) {
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? '浏览器没有允许使用麦克风。' : e instanceof Error ? e.message : '无法开始录音');
    }
  }
  useEffect(() => () => { stopRecording(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (Object.values(drafts).some((d) => d.dirty)) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [drafts]);
  const packs = isBank
    ? builtinQuestionSets
    : (data.questionSets || [])
        .filter((p) => p.jobId === jobId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pack = routePack || packs.find((p) => p.id === packId) || packs[0];
  const question =
    pack?.questions.find((q) => q.id === ((practiceRecord || help)?.split('|')[1] || questionId)) || pack?.questions[0];
  const key = pack && question ? pack.id + ':' + question.id : '';
  // What to say for this question at this company: terms and lines drawn from the posting and the structured résumé.
  const hints: Hints | null = question ? buildHints(question, data.jobs.find((j) => j.id === pack?.jobId), data.resume || []) : null;
  const draft = drafts[key] || emptyDraft;
  // A recording belongs to the question it was made for; another question sees none.
  const recording = recordingState && recordingState.key === key ? recordingState : null;
  const keywordChips = (h: Hints) =>
    (h.keywords.length || h.gaps.length) ? (
      <div className="hint-keywords">
        {h.keywords.map((k) => <span key={'k' + k} className="hint-chip is-have" lang="ja"><Ja text={k} mode="ja" /></span>)}
        {h.gaps.map((k) => <span key={'g' + k} className="hint-chip is-gap" lang="ja"><Ja text={k} mode="ja" /></span>)}
      </div>
    ) : null;
  const attempts = (data.attempts || [])
    .filter(
      (a) => a.questionSetId === pack?.id && a.questionId === question?.id,
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const attempt = attempts.find((a) => a.id === picked[key]) || attempts[0];
  const reviews = (data.reviews || [])
    .filter((r) => r.attemptId === attempt?.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const review = reviews[0];
  const pending = data.tasks.find(
    (t) =>
      t.kind === '回答点评' &&
      t.attemptId === attempt?.id &&
      t.status === '待处理',
  );
  const practiced = new Set(
    (data.attempts || [])
      .filter((a) => a.questionSetId === pack?.id)
      .map((a) => a.questionId),
  );
  function edit(change: Partial<Draft>) {
    setDrafts((current) => ({
      ...current,
      [key]: { ...(current[key] || emptyDraft), ...change, dirty: true },
    }));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
    } finally {
      setBusy(false);
    }
  }
  async function save(requestReview: boolean) {
    if (!pack || !question) return;
    const currentKey = key;
    await run(async () => {
      const saved = await api<Attempt>('attempts', {
        questionSetId: pack.id,
        questionId: question.id,
        answer: draft.text,
        language: draft.language,
        durationSeconds: Number(draft.seconds || 0),
        requestReview,
      });
      setPicked((p) => ({ ...p, [currentKey]: saved.id }));
      setDrafts((p) => ({ ...p, [currentKey]: { ...draft, dirty: false } }));
      let audioNote = '';
      if (recording) {
        try {
          await apiUpload('attempts/audio?id=' + encodeURIComponent(saved.id), recording.blob);
          discardRecording();
        } catch (e) {
          audioNote = '（录音上传失败：' + (e instanceof Error ? e.message : '未知错误') + '，文字回答已保存）';
        }
      }
      setNotice(
        (requestReview
          ? '回答已保存，点评请求已加入队列。将指令交给助手处理后，建议会出现在下方。'
          : '本次回答已保存。你可以查看历史，或继续提交点评。') + audioNote,
      );
    });
  }
  async function queueReview() {
    if (!attempt) return;
    await run(async () => {
      await api('tasks', {
        kind: '回答点评',
        jobId: attempt.jobId,
        attemptId: attempt.id,
      });
      setNotice('已请求点评这个回答版本。');
    });
  }
  function copyPrompt() {
    if (!attempt) return;
    return run(async () => {
      await navigator.clipboard.writeText(
        `使用 $career-interview-coach，通过已配置的 Career Note MCP 读取 career_get_contract 和 career_get_context。只针对已保存的回答 id ${attempt.id}，结合所属问题、公司来源、个人履历和历史回答，依据我在个人履历中确认的背景，将工作能力与日语表达分开分析，补充简单口述版与外国求职者沟通建议，不推测个人身份或签证结论。${attempt.audio ? '这个回答附有录音：先用 career_get_attempt_audio 取得下载链接，用 curl 下载后在本机转写（如 whisper），对照文字回答补充发音、语速、停顿方面的点评；转写结果只作参考，不覆盖我的原回答。' : ''}按 reviews 协议 preview/import 写回建议并读回关联，仅完成对应且已全部交付的点评任务，不伪造或覆盖我的原回答，不改变投递状态。`,
      );
      setNotice('指令已复制，可以发给当前 AI Agent 对话处理。');
    });
  }
  if (!company && !practiceRecord && !guide && !help) {
    const closed = ['未通过', '已撤回'];
    const progress = (jobId: string) => {
      const latest = data.questionSets.filter(p => p.jobId === jobId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      const answered = latest ? new Set(data.attempts.filter(a => a.questionSetId === latest.id).map(a => a.questionId)).size : 0;
      return latest ? { answered, total: latest.questions.length } : null;
    };
    const isInterview = (job: State['jobs'][number]) => job.status === '面试中' || /面试|面接|interview/i.test(job.nextAction || '');
    // Everything the preparation stage is derived from, per company.
    const prepOf = (job: State['jobs'][number]): PrepProgress => {
      const p = progress(job.id);
      return {
        materials: materialKinds.filter(kind => materialsFor(job.id).some(m => m.kind === kind)).length,
        materialTotal: materialKinds.length,
        questions: p?.total ?? 0,
        answered: p?.answered ?? 0,
        pending: pendingJobIds.includes(job.id),
      };
    };
    // Sort key per column; undated rows sink to the bottom whichever direction the schedule is sorted.
    const keyOf = (job: State['jobs'][number]): string | number => {
      switch (sort.key) {
        case 'company': return job.company;
        case 'status': return statuses.indexOf(job.status);
        case 'schedule': return job.nextDate || (sort.desc ? '' : '9999');
        case 'prep': return prepRank(prepOf(job));
      }
    };
    const jobs = data.jobs
      .filter(j => (j.company + ' ' + j.role).toLowerCase().includes(search.toLowerCase()))
      .filter(j => statusFilter === '全部' ? true : statusFilter === '进行中' ? !closed.includes(j.status) : statusFilter === '有面试' ? isInterview(j) : j.status === statusFilter)
      .sort((a, b) => {
        const x = keyOf(a), y = keyOf(b);
        const c = x < y ? -1 : x > y ? 1 : 0;
        return sort.desc ? -c : c;
      });
    const toggleSort = (key: PrepColumn) => setSort(s => ({ key, desc: s.key === key ? !s.desc : false }));
    const bankAnswered = new Set(data.attempts.filter(a => builtinQuestionSets.some(p => p.id === a.questionSetId)).map(a => a.questionSetId + '|' + a.questionId)).size;
    const bankTotal = builtinQuestionSets.reduce((n, p) => n + p.questions.length, 0);
    // 一家公司一行：状态与日程、资料齐全度、练习进度都在同一行里，细节点进公司再看。
    // 通用题库模板只在右上角留一个图标入口。
    return <div className="practice-workspace">
      <div className="page-actions list-toolbar">
        <label className="search"><Search size={17} /><input aria-label={tr('搜索公司或职位')} placeholder={tr('搜索公司或职位')} value={search} onChange={e => setSearch(e.target.value)} /></label>
        <select aria-label={tr('筛选投递状态')} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {['进行中', '有面试', '全部', ...statuses].map(s => <option key={s} value={s}>{s === '全部' ? tr('全部状态') : tr(s)}</option>)}
        </select>
        <span className="muted list-count">{tr('{0} / {1} 条', [String(jobs.length), String(data.jobs.length)])}</span>
        <button className="secondary icon-only" onClick={() => setCompany(BANK_JOB_ID)} title={tr('通用题库（模板）') + ' · ' + tr('练习 {0} / {1} 题', [String(bankAnswered), String(bankTotal)])} aria-label={tr('通用题库（模板）')}><BookOpen size={21} /></button>
        {onImport && <button className="secondary phone-hidden" onClick={onImport}><Upload size={16} />{tr('导入')}</button>}
        {onAddJob && <button className="primary" onClick={onAddJob}><Plus size={18} />{tr('添加职位')}</button>}
      </div>
      <section className="panel dt-panel prep-list">
        {jobs.length ? <DataTable<PrepColumn> label={tr('面试准备')} sort={sort.key} desc={sort.desc} onSort={toggleSort} columns={[
          { key: 'company', label: tr('公司 / 职位'), width: 'minmax(0,2fr)', sortable: true },
          { key: 'status', label: tr('投递状态'), width: 'minmax(96px,0.8fr)', sortable: true },
          { key: 'schedule', label: tr('面试 / 跟进'), width: 'minmax(0,1.2fr)', sortable: true },
          { key: 'prep', label: tr('准备阶段'), width: 'minmax(120px,1.2fr)', sortable: true },
        ]}>{jobs.map(job => {
          const prep = prepOf(job);
          const stage = prepStage(prep);
          const interview = isInterview(job);
          const overdue = !!job.nextDate && job.nextDate < data.today;
          return <DataRow key={job.id} className={closed.includes(job.status) ? 'is-closed' : ''} onOpen={() => setCompany(job.id)}>
            <DataTitle title={job.company} meta={job.role} onClick={() => setCompany(job.id)} />
            <DataCell label={tr('投递状态')} className="prep-status"><StatusMark status={job.status} label /></DataCell>
            <DataCell label={tr('面试 / 跟进')} className="prep-schedule">
              {job.nextDate ? <>
                <b className={'prep-when' + (overdue ? ' prep-overdue' : interview ? ' prep-interview' : '')} title={tr(overdue ? '已逾期' : interview ? '面试日' : '待跟进')}>
                  {interview ? <MessageSquare size={14} /> : <Clock3 size={14} />}{day(job.nextDate)}
                </b>
                {job.nextAction && <small className="muted">{job.nextAction}</small>}
              </> : job.nextAction ? <span className="muted">{job.nextAction}</span> : <span className="muted">—</span>}
            </DataCell>
            <DataCell label={tr('准备阶段')} className="prep-progress">
              <span className={'prep-stage tone-' + prepStageTone[stage]}>{tr(stage)}</span>
              <small className="muted">
                {tr('资料 {0} / {1}', [String(prep.materials), String(prep.materialTotal)])}
                {prep.questions ? ' · ' + tr('练习 {0} / {1} 题', [String(prep.answered), String(prep.questions)]) : ''}
              </small>
            </DataCell>
          </DataRow>;
        })}</DataTable> : <div className="empty"><p>{tr(data.jobs.length ? '没有符合条件的职位' : '还没有保存职位')}</p></div>}
      </section>
    </div>;
  }
  const currentJob = data.jobs.find(j => j.id === jobId);
  if (company && !practiceRecord && !guide && !help) {
    // Keep the company and posting together, and show practice feedback with its summary.
    const tabs = PREP_TABS.filter(([id]) => !isBank || id !== 'info');
    const activeTab = tabs.some(([id]) => id === tab) ? tab : 'practice';
    const companyMaterials = materialsFor(isBank ? '' : jobId);
    const packIds = new Set(packs.map(p => p.id));
    const companyAttempts = (data.attempts || []).filter(a => packIds.has(a.questionSetId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const attemptIds = new Set(companyAttempts.map(a => a.id));
    const companyReviews = (data.reviews || []).filter(r => attemptIds.has(r.attemptId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const reviewedAttemptIds = new Set(companyReviews.map(r => r.attemptId));
    const questionOf = (a: Attempt) => packs.find(p => p.id === a.questionSetId)?.questions.find(q => q.id === a.questionId);
    const openAttempt = (a: Attempt) => { setPicked(p => ({ ...p, [a.questionSetId + ':' + a.questionId]: a.id })); setQuestionId(a.questionId); setPracticeRecord(a.questionSetId + '|' + a.questionId); };
    const mentions = !isBank && currentJob ? (data.reports || []).filter(r => (r.title + '\n' + r.content).includes(currentJob.company)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5) : [];
    const factList = (items: Array<[string, string, boolean?]>) => <dl className="facts">
      {items.map(([k, v, own]) => <div key={k}><dt>{tr(k)}</dt><dd>{v ? own ? <Ja text={v} /> : v : <span className="muted">{tr('待确认')}</span>}</dd></div>)}
    </dl>;
    const textSections = (items: Array<[string, string]>, openKeys: string[] = []) => items.map(([k, v]) => (
      <details className="text-section detail-disclosure" key={k} open={openKeys.includes(k)}>
        <summary>{tr(k)}</summary>
        <p className="prewrap">{v ? <Ja text={v} /> : tr('尚未补充')}</p>
      </details>
    ));
    // The page header already shows the back arrow and the company (or template) name; only the meta line lives here.
    return <div className="practice-workspace">
      <div className="section-head practice-company-heading">
        <div>{isBank ? <p className="muted">{tr('自我介绍、志望动机、条件确认等大多数公司都会问的问题。')}</p> : currentJob && <p><StatusMark status={currentJob.status} label />{currentJob.role}{currentJob.nextDate ? <> · {tr(currentJob.status === '面试中' || /面试|面接|interview/i.test(currentJob.nextAction || '') ? '面试' : '跟进')} {day(currentJob.nextDate)}</> : null}</p>}</div>
        {!isBank && currentJob && onEditJob && <button className="secondary" onClick={() => onEditJob(currentJob)}><Pencil size={16} />{tr('更新进展')}</button>}
        {activeTab === 'practice' && packs.length > 1 && <select aria-label={tr('题组版本')} value={pack?.id || ''} onChange={e => {setPackId(e.target.value);setQuestionId('');}}>{packs.map(p => <option key={p.id} value={p.id}>{bt(p.title)}</option>)}</select>}
      </div>
      <div className="prep-tabs" role="tablist" aria-label={tr('面试准备')}>
        {tabs.map(([id, label]) => {
          const count = id === 'materials' ? companyMaterials.length : 0;
          return <button key={id} type="button" role="tab" aria-selected={id === activeTab} className={id === activeTab ? 'is-active' : ''} onClick={() => setTab(id)}>
            {tr(label)}{count > 0 && <span className="prep-tab-count">{count}</span>}
          </button>;
        })}
      </div>
      {activeTab === 'info' && currentJob && <div className="prep-tab-panel prep-info">
        <section className="panel prep-info-section">
          <h2 className="prep-block-heading"><span className="prep-block-icon" aria-hidden="true"><Building2 size={18} /></span>{tr('公司信息')}</h2>
          {factList([
            ['工作地点', currentJob.location, true],
            ['外国人招聘信息', currentJob.foreigner, true],
            ['在留资格支持', currentJob.visa, true],
            ['投递状态', currentJob.status ? tr(currentJob.status) : ''],
            ['优先级', currentJob.priority ? tr(currentJob.priority) : ''],
            ['下一步', currentJob.nextAction ? currentJob.nextAction + (currentJob.nextDate ? '（' + day(currentJob.nextDate) + '）' : '') : '', true],
          ])}
          {textSections([
            ['公司业务与特点', currentJob.business],
            ['我的跟进记录', currentJob.notes],
          ], ['公司业务与特点'])}
          <details className="text-section detail-disclosure"><summary>{tr('投递时间线')} · {currentJob.history.length}</summary>
            <div className="timeline">
              {currentJob.history.map((h, i) => <div key={i}><span className="timeline-dot" /><b>{tr(h.status)}</b><small>{day(h.at)}</small></div>)}
            </div>
          </details>
        </section>
        <section className="panel prep-info-section">
          <div className="section-head"><h2 className="prep-block-heading"><span className="prep-block-icon" aria-hidden="true"><BriefcaseBusiness size={18} /></span>{tr('招聘信息')}</h2>{currentJob.url && <a className="text-button" href={currentJob.url} target="_blank" rel="noreferrer">{tr('招聘原文')}<ExternalLink size={15} /></a>}</div>
          <p className="prep-posting-role">{currentJob.role}</p>
          {factList([
            ['薪资范围', currentJob.salary, true],
            ['日语要求', currentJob.japanese, true],
            ['信息确认日期', currentJob.sourceDate ? day(currentJob.sourceDate) : ''],
            ['匹配评价', currentJob.matchLevel ? tr(currentJob.matchLevel) : ''],
          ])}
          {textSections([
            ['岗位要求', currentJob.requirements],
            ['工作内容', currentJob.description],
            ['匹配点', currentJob.matchNotes],
            ['待确认事项', currentJob.unknowns],
          ], ['岗位要求', '匹配点'])}
        </section>
      </div>}
      {activeTab === 'materials' && <section className="panel dt-panel practice-materials prep-tab-panel">
        {!isBank && requestPreparation && <div className="section-head material-actions">
          {requestPreparation && (pendingJobIds.includes(jobId)
            ? <p className="muted">{tr('已加入待处理队列，等待 AI Agent 生成。')}</p>
            : <button className="secondary" disabled={requesting} onClick={() => requestPreparation(jobId)}><Sparkles size={16} />{tr(companyMaterials.length ? '请求准备新版本' : '交给 AI Agent 准备')}</button>)}
        </div>}
        {companyMaterials.length ? materialTable(companyMaterials, tr('准备资料')) : <div className="empty"><p>{tr(isBank ? '还没有通用准备资料。' : '还没有这家公司的准备资料。')}</p></div>}
      </section>}
      {activeTab === 'practice' && (!pack || !question ? (
        <section className="panel prep-tab-panel">
          <h2>{tr('先为这家公司准备一组问题')}</h2>
          <button
            className="primary block-button"
            disabled={busy || !jobId}
            onClick={() =>
              void run(async () => {
                await api('tasks', { kind: '公司准备', jobId });
                setNotice('已请求公司准备，等待 AI Agent 写入题组。');
              })
            }
          >
            {tr('请求公司准备')}
          </button>
          {notice && <p role="status">{tr(notice)}</p>}
          {error && <p role="alert">{tr(error)}</p>}
        </section>
      ) : (
        <>
          <div className="section-head prep-practice-head"><h2>{tr('练习题目')}</h2><span className="muted">{tr('已练问题')} {practiced.size} / {pack.questions.length}</span><button className="secondary" onClick={() => setGuide(pack.id)}>{tr('面试前要做什么')}</button></div>
          <section className="panel question-list prep-tab-panel">
            {pack.questions.map((q, i) => (
              <button
                disabled={busy}
                className="question-option"
                key={q.id}
                onClick={() => {
                  stopRecording();
                  setQuestionId(q.id);
                  setPracticeRecord(pack.id + '|' + q.id);
                  setNotice('');
                  setError('');
                }}
              >
                <span className="question-number">
                  {practiced.has(q.id) ? <Check size={16} /> : String(i + 1).padStart(2, '0')}
                </span>
                <span>
                  <b><Ja text={bt(q.title)} /></b>
                  <small>
                    {tr(q.category)} · {q.targetSeconds}
                    {tr('秒')}
                  </small>
                </span>
              </button>
            ))}
          </section>
        </>
      ))}
      {activeTab === 'summary' && <div className="prep-tab-panel prep-summary">
        <section className="panel prep-summary-block">
        <h2 className="prep-block-heading"><span className="prep-block-icon" aria-hidden="true"><ListChecks size={18} /></span>{tr('练习概览')}</h2>
        <div className="stats prep-stats">
          <div><span>{tr('题目')}</span><strong>{pack ? pack.questions.length : 0}</strong></div>
          <div><span>{tr('已练问题')}</span><strong>{practiced.size}</strong></div>
          <div><span>{tr('回答版本')}</span><strong>{companyAttempts.length}<small>{tr('含录音 {0}', [String(companyAttempts.filter(a => a.audio).length)])}</small></strong></div>
          <div><span>{tr('已点评')}</span><strong>{companyAttempts.filter(a => reviewedAttemptIds.has(a.id)).length}</strong></div>
        </div>
        {companyReviews.length > 0 && <>
          <h3>{tr('下一次只练这件事')}</h3>
          <ul className="prep-next-list">
            {companyReviews.slice(0, 5).map(r => { const a = companyAttempts.find(x => x.id === r.attemptId); const q = a && questionOf(a); return <li key={r.id}>
              <span className="num">{day(r.createdAt)}</span>
              <span>{a ? <button className="text-button" onClick={() => openAttempt(a)}><b>{q ? <Ja text={bt(q.title)} /> : ''}</b></button> : <b>{q ? <Ja text={bt(q.title)} /> : ''}</b>}<span className="prewrap"><Ja text={r.nextPractice} /></span></span>
            </li>; })}
          </ul>
        </>}
        {pack && <>
          <h3>{tr('每题进度')}</h3>
          <ul className="prep-question-progress">
            {pack.questions.map(q => {
              const tries = companyAttempts.filter(a => a.questionSetId === pack.id && a.questionId === q.id);
              const reviewed = tries.filter(a => reviewedAttemptIds.has(a.id)).length;
              return <li key={q.id} className={tries.length ? '' : 'is-untried'}>
                <button className="text-button" onClick={() => { setQuestionId(q.id); setPracticeRecord(pack.id + '|' + q.id); }}><b><Ja text={bt(q.title)} /></b></button>
                <span className="muted">{tries.length ? tr('{0} 次 · 点评 {1}', [String(tries.length), String(reviewed)]) : tr('未练习')}</span>
                {tries.length > 0 && <Play size={14} className="prep-tried" aria-hidden="true" />}
              </li>;
            })}
          </ul>
        </>}
        {mentions.length > 0 && <>
          <h3>{tr('提到这家公司的每日分析')}</h3>
          <ul className="prep-next-list">
            {mentions.map(r => <li key={r.id}><span className="num">{day(r.date)}</span><button className="text-button" onClick={() => openReport?.(r)}>{r.title}</button></li>)}
          </ul>
        </>}
        {!companyReviews.length && !pack && <p className="muted">{tr('还没有练习总结。')}</p>}
        </section>
        <section className="panel prep-summary-block">
        <h2 className="prep-block-heading"><span className="prep-block-icon" aria-hidden="true"><MessageSquareText size={18} /></span>{tr('反馈')}</h2>
        {companyReviews.length ? <ul className="prep-feedback-list">
          {companyReviews.map(r => { const a = companyAttempts.find(x => x.id === r.attemptId); const q = a && questionOf(a); return <li key={r.id}>
            <div className="prep-feedback-head"><b>{q ? <Ja text={bt(q.title)} /> : tr('回答点评')}</b><span className="num muted">{day(r.createdAt)}</span></div>
            <p className="prewrap"><Ja text={r.summary} /></p>
            {a && <button className="text-button" onClick={() => openAttempt(a)}>{tr('查看完整点评')}</button>}
          </li>; })}
        </ul> : <div className="empty"><p>{tr('还没有点评。')}</p></div>}
        </section>
      </div>}
    </div>;
  }
  return (
    <div className="practice-workspace">
      {!pack || !question ? (
        <section className="panel"><div className="empty"><p>{tr('题目不存在')}</p></div></section>
      ) : (
        <>
          {guide && <>
          {isBank && pack.communicationGuide && (
            <section className="panel candidate-context">
              <h2>{tr('这组题在考察什么')}</h2>
              <p><Ja text={bt(pack.communicationGuide)} /></p>
              <p className="small muted">
                {tr(
                  '题库内置，适用于大多数公司；针对某家公司的追问，请在该公司下请求「公司准备」。',
                )}
              </p>
            </section>
          )}
          {pack.candidateContext && (
            <section className="panel candidate-context">
              <h2>{tr('结合你的求职背景')}</h2>
              <p><Ja text={pack.candidateContext} /></p>
              <div className="row">
                <span className="tag">{tr('工作经验单独看')}</span>
                <span className="tag">{tr('用能说出口的日语练习')}</span>
              </div>
              <details>
                <summary>{tr('沟通练习与企业确认事项')}</summary>
                <p className="prewrap"><Ja text={pack.communicationGuide} /></p>
              </details>
            </section>
          )}
          <section className="practice-intro">
            <div>
              <span className="eyebrow">INTERVIEW REHEARSAL</span>
              <h2><Ja text={bt(pack.scenario)} /></h2>
              <p>
                {tr(
                  '先独立回答 → 提交点评 → 根据追问再说一次。每次保留原回答。',
                )}
              </p>
            </div>
            <div className="practice-progress">
              <strong>
                {practiced.size}
                <small> / {pack.questions.length}</small>
              </strong>
              <span>{tr('已练问题')}</span>
            </div>
          </section>
          <section className="panel preparation-plan">
            <h2>
              <BookOpen size={18} />
              {tr('面试前要做什么')}
            </h2>
            <p className="prewrap"><Ja text={bt(pack.plan)} /></p>
            <p className="source-line">
              {bt(pack.sourceNotes)}
            </p>
          </section>
          </>}
          {notice && (
            <div className="inline-note" role="status">
              {tr(notice)}
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              {tr(error)}
            </div>
          )}
          {help && <section className="panel question-help-page"><h2 lang="ja"><Ja text={question.questionJa} mode="ja" /></h2>              <p>{bt(question.meaning)}</p>
              {(question.simpleQuestionJa || question.vocabulary) && (
                <details className="language-support">
                  <summary>{tr('换个简单说法，理解这道题')}</summary>
                  {question.simpleQuestionJa && (
                    <p lang="ja"><Ja text={question.simpleQuestionJa} mode="ja" /></p>
                  )}
                  {question.vocabulary && (
                    <p className="prewrap"><Ja text={question.vocabulary} /></p>
                  )}
                </details>
              )}
              <div className="question-purpose">
                <b>{tr('为什么提前练这题')}</b>
                <p>{bt(question.why)}</p>
              </div>
              <details>
                <summary>{tr('卡住时，看看回答思路')}</summary>
                <p className="prewrap"><Ja text={bt(question.outline)} /></p>
              </details>
              {hints && (hints.keywords.length > 0 || hints.gaps.length > 0) && (
                <div className="question-purpose hint-block">
                  <b>{tr('关键词提示')}</b>
                  {keywordChips(hints)}
                  <p className="hint-legend"><i className="hint-chip is-have" />{tr('简历里有，可以直接说')}<i className="hint-chip is-gap" />{tr('招聘信息要求，简历没写——先想好怎么回应')}</p>
                </div>
              )}
              {hints && hints.company.length > 0 && (
                <div className="question-purpose hint-block">
                  <b>{tr('参考 · 招聘信息里对应的内容')}</b>
                  <ul className="hint-lines">
                    {hints.company.map((c, i) => <li key={i}><em>{c.field}</em><span lang="ja"><Ja text={c.text} /></span></li>)}
                  </ul>
                </div>
              )}
              {hints && hints.resume.length > 0 && (
                <div className="question-purpose hint-block">
                  <b>{tr('参考 · 你的经历里可以引用的')}</b>
                  <ul className="hint-records">
                    {hints.resume.map((r) => (
                      <li key={r.id}>
                        <span className="hint-record-head"><em>{tr(resumeSections[r.kind as keyof typeof resumeSections]?.label || r.kind)}</em><strong lang="ja"><Ja text={r.title} /></strong></span>
                        {r.lines.map((line, i) => <p key={i} lang="ja"><Ja text={line} /></p>)}
                      </li>
                    ))}
                  </ul>
                  <p className="small muted">{tr('引用时区分雇主、客户项目和个人项目；数字按简历里的口径说。')}</p>
                </div>
              )}
              {question.personalize && (
                <div className="question-purpose personalize-hint">
                  <b>{tr('结合你的实际情况补充')}</b>
                  <p>{bt(question.personalize)}</p>
                  {(question.profileFields || []).map((field) => {
                    const value = String(
                      data.profile?.[field as keyof Profile] || '',
                    ).trim();
                    return (
                      <details key={field}>
                        <summary>
                          {tr('履历 · ')}
                          {tr(profileLabels[field] || field)}
                          {value ? '' : tr('（尚未填写）')}
                        </summary>
                        <p className="prewrap small">
                          {value ? <Ja text={value} /> :
                            tr('在「我的履历」里补充后，这里会显示可引用的内容。')}
                        </p>
                      </details>
                    );
                  })}
                </div>
              )}
              <details>
                <summary>{tr('面试官可能继续问')}</summary>
                <p className="prewrap" lang="ja">
                  <Ja text={question.followUps} mode="ja" />
                </p>
              </details>
</section>}
          <div className="practice-record-layout">
            {practiceRecord && <section className="panel answer-panel">
              <div className="section-head">
                <span className="tag">{tr(question.category)}</span>
                <span className="row small">
                  <Clock3 size={16} />
                  {tr('建议')}
                  {question.targetSeconds}
                  {tr('秒')}
                </span>
              </div>
              <h2 className="japanese-question" lang="ja">
                <Ja text={question.questionJa} mode="ja" />
              </h2>
              <button className="text-button question-help-link" onClick={() => setHelp(pack.id + '|' + question.id)}>{tr('回答提示')}</button>
              {hints && keywordChips(hints)}
              <div className="answer-editor">
                <label htmlFor="practice-answer">
                  {tr('你的回答')}
                  <span>{draft.dirty ? tr('· 尚未保存') : ''}</span>
                </label>
                <textarea
                  id="practice-answer"
                  value={draft.text}
                  disabled={busy}
                  onChange={(e) => edit({ text: e.target.value })}
                  placeholder={tr(
                    '用日语或中文写下你的回答。',
                  )}
                  rows={6}
                  maxLength={20000}
                />
                {canRecord && <div className="answer-recorder">
                  {recState === 'recording' ? (
                    <button type="button" className="secondary is-recording" onClick={stopRecording} title={tr('停止录音')} aria-label={tr('停止录音')}>
                      <Square size={15} />{fmtClock(recSeconds)}
                    </button>
                  ) : (
                    <button type="button" className="secondary" disabled={busy} onClick={() => void startRecording(key)} title={tr(recording ? '重新录音' : '录音回答')} aria-label={tr(recording ? '重新录音' : '录音回答')}>
                      <Mic size={15} />{recording ? fmtClock(recording.seconds) : null}
                    </button>
                  )}
                  {recording && recState === 'idle' && <>
                    {/* eslint-disable-next-line jsx-a11y/media-has-caption -- unsaved voice memo; the textarea holds its text */}
                    <audio controls preload="metadata" src={recording.url} />
                    <button type="button" className="icon-button" disabled={busy} onClick={discardRecording} title={tr('删除录音')} aria-label={tr('删除录音')}><Trash2 size={15} /></button>
                  </>}
                  {!recording && recState === 'idle' && <span className="muted small">{tr('录下口述版本，保存时会和文字一起上传；AI Agent 可以下载后转写点评。')}</span>}
                </div>}
                <div className="answer-options">
                  <label>
                    {tr('回答语言')}
                    <select
                      value={draft.language}
                      disabled={busy}
                      onChange={(e) => edit({ language: e.target.value })}
                    >
                      {['日语', '中文构思', '中日混合'].map((v) => (
                        <option key={v} value={v}>
                          {tr(v)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {tr('实际口述时长（可选）')}
                    <div className="duration-input">
                      <input
                        aria-label={tr('实际口述秒数')}
                        type="number"
                        min="0"
                        max="3600"
                        value={draft.seconds}
                        disabled={busy}
                        onChange={(e) => edit({ seconds: e.target.value })}
                      />
                      <span>{tr('秒')}</span>
                    </div>
                  </label>
                </div>
                <div className="answer-actions">
                  <button
                    className="secondary"
                    disabled={busy || !draft.text.trim()}
                    onClick={() => void save(false)}
                  >
                    <Save size={16} />
                    {tr('保存本次回答')}
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !draft.text.trim()}
                    onClick={() => void save(true)}
                  >
                    <Sparkles size={16} />
                    {tr('保存并请 AI Agent 点评')}
                  </button>
                </div>
              </div>
            </section>}
          </div>
          {practiceRecord && <section className="panel feedback-panel">
            <div className="section-head">
              <h2>
                <MessageSquareText size={20} />
                {tr('回答记录与点评')}
              </h2>
              {attempt && (
                <select
                  aria-label={tr('选择历史回答')}
                  value={attempt.id}
                  disabled={busy}
                  onChange={(e) =>
                    setPicked((p) => ({ ...p, [key]: e.target.value }))
                  }
                >
                  {attempts.map((a, i) => (
                    <option key={a.id} value={a.id}>
                      {tr('第')}
                      {attempts.length - i}
                      {tr('次 ·')}{' '}
                      {new Date(a.createdAt).toLocaleString(locale, {
                        timeZone: 'Asia/Tokyo',
                      })}
                    </option>
                  ))}
                </select>
              )}
            </div>
            {!attempt ? (
              <div className="empty">
                <p>
                  {tr(
                    '还没有保存的回答。',
                  )}
                </p>
              </div>
            ) : (
              <>
                <details className="saved-answer" open>
                  <summary>
                    {tr('这次保存的原回答 ·')}
                    {tr(attempt.language)}
                    {attempt.durationSeconds
                      ? tr(' · {0} 秒', [attempt.durationSeconds])
                      : ''}
                  </summary>
                  <p className="prewrap"><Ja text={attempt.answer} /></p>
                  {attempt.audio && <AttemptAudio attemptId={attempt.id} size={attempt.audio.size} />}
                </details>
                {attempt.profileRevision !== data.profile.revision && (
                  <div className="inline-note">
                    {tr('个人履历在这次回答后有更新，点评时需要核对差异。')}
                  </div>
                )}
                {review ? (
                  <>
                    <div className="feedback-summary">
                      <span className="eyebrow">
                        CODEX FEEDBACK ·{' '}
                        {new Date(review.createdAt).toLocaleDateString(locale, {
                          timeZone: 'Asia/Tokyo',
                        })}
                      </span>
                      <h3>{tr('这次最值得改进的地方')}</h3>
                      <p className="prewrap"><Ja text={review.summary} /></p>
                    </div>
                    <div className="feedback-grid">
                      {[
                        ['保留的优点', review.strengths],
                        ['工作能力与回答内容', review.improvements],
                        ['日语表达（单独点评）', review.japaneseNotes],
                        ['事实与追问风险', review.factChecks],
                      ].map(([title, text]) => (
                        <div className="feedback-block" key={title}>
                          <h3>{tr(title)}</h3>
                          <p className="prewrap"><Ja text={text} /></p>
                        </div>
                      ))}
                    </div>
                    {review.foreignApplicantNotes && (
                      <div className="feedback-block">
                        <h3>{tr('外国求职者的沟通建议')}</h3>
                        <p className="prewrap">
                          <Ja text={review.foreignApplicantNotes} />
                        </p>
                      </div>
                    )}
                    {review.simpleAnswer && (
                      <details className="revised-answer" open>
                        <summary>
                          {tr('先练这一版：简短、礼貌、能说出口')}
                        </summary>
                        <p className="prewrap" lang="ja">
                          <Ja text={review.simpleAnswer} mode="ja" />
                        </p>
                      </details>
                    )}
                    <details className="revised-answer">
                      <summary>
                        {tr('参考改写：理解结构后，用自己的话重说')}
                      </summary>
                      <p className="prewrap" lang="ja">
                        <Ja text={review.revisedAnswer} mode="ja" />
                      </p>
                    </details>
                    <div className="feedback-grid">
                      <div className="feedback-block">
                        <h3>{tr('下一轮追问')}</h3>
                        <p className="prewrap"><Ja text={review.followUps} /></p>
                      </div>
                      <div className="feedback-block">
                        <h3>{tr('下一次只练这件事')}</h3>
                        <p className="prewrap"><Ja text={review.nextPractice} /></p>
                      </div>
                    </div>
                    <details>
                      <summary>{tr('点评依据与局限')}</summary>
                      <p className="prewrap">{review.sourceNotes}</p>
                    </details>
                    <button
                      className="secondary block-button"
                      disabled={busy}
                      onClick={() => {
                        edit({ text: '', seconds: '' });
                        document.getElementById('practice-answer')?.focus();
                      }}
                    >
                      {tr('重新作答，保存下一版')}
                    </button>
                  </>
                ) : (
                  <div className="waiting-feedback">
                    <h3>
                      {pending
                        ? tr('等待 AI Agent 点评')
                        : tr('这次回答还没有点评')}
                    </h3>
                    <p>
                      {pending
                        ? tr(
                            '请求已加入任务队列。复制指令交给助手处理；如已配置包含回答点评的定时任务，也可等待该任务执行。结果写回后显示。',
                          )
                        : tr(
                            '提交后，AI Agent 会针对这份已保存的回答分析，而不是评价尚未保存的编辑内容。',
                          )}
                    </p>
                    <div className="answer-actions">
                      {!pending && (
                        <button
                          disabled={busy}
                          className="primary"
                          onClick={() => void queueReview()}
                        >
                          <Sparkles size={16} />
                          {tr('请求点评这个版本')}
                        </button>
                      )}
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={() => void copyPrompt()}
                      >
                        <Copy size={16} />
                        {tr('复制给 AI Agent 的指令')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>}
        </>
      )}
    </div>
  );
}
