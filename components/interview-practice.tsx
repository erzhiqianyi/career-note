'use client';
import { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  MessageSquareText,
  Save,
  Sparkles,
} from 'lucide-react';
import { api, type Attempt, type State } from '@/lib/career';
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
export default function InterviewPractice({
  data,
  initialJobId,
  onJobChange,
  reload,
}: {
  data: State;
  initialJobId: string;
  onJobChange: (id: string) => void;
  reload: () => Promise<void>;
}) {
  const jobId = initialJobId || data.jobs[0]?.id || '';
  const [packId, setPackId] = useState(''),
    [questionId, setQuestionId] = useState(''),
    [drafts, setDrafts] = useState<Record<string, Draft>>({}),
    [picked, setPicked] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (initialJobId) {
      setPackId('');
      setQuestionId('');
    }
  }, [initialJobId]);
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
  const packs = (data.questionSets || [])
    .filter((p) => p.jobId === jobId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pack = packs.find((p) => p.id === packId) || packs[0];
  const question =
    pack?.questions.find((q) => q.id === questionId) || pack?.questions[0];
  const key = pack && question ? pack.id + ':' + question.id : '';
  const draft = drafts[key] || emptyDraft;
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
      setNotice(
        requestReview
          ? '回答已保存，点评请求已交给 Codex。处理完成后，建议会出现在下方。'
          : '本次回答已保存。你可以查看历史，或继续提交点评。',
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
        `请点评我在就职手帖保存的面试回答。先阅读 当前项目的 docs/agent-workflow.md。只针对回答 id ${attempt.id}，结合所属问题、公司来源、个人履历和历史回答，依据我在个人履历中确认的背景，将工作能力与日语表达分开分析，补充简单口述版与外国求职者沟通建议，不推测个人身份或签证结论。按 reviews 协议写回建议并完成对应任务，不伪造或覆盖我的原回答，不改变投递状态。`,
      );
      setNotice('指令已复制，可以发给当前 Codex 对话处理。');
    });
  }
  return (
    <div className="practice-workspace">
      <div className="toolbar">
        <label className="practice-select">
          练习公司
          <select
            value={jobId}
            onChange={(e) => {
              onJobChange(e.target.value);
              setPackId('');
              setQuestionId('');
              setNotice('');
              setError('');
            }}
          >
            {data.jobs.map((j) => (
              <option value={j.id} key={j.id}>
                {j.company}
              </option>
            ))}
          </select>
        </label>
        {packs.length > 1 && (
          <label className="practice-select">
            题组版本
            <select
              value={pack?.id || ''}
              onChange={(e) => {
                setPackId(e.target.value);
                setQuestionId('');
              }}
            >
              {packs.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="tag">模拟练习 · 不改变投递状态</span>
      </div>
      {!pack || !question ? (
        <section className="panel">
          <h2>先为这家公司准备一组问题</h2>
          <p>Codex 会结合公司特点、岗位要求和你的经历整理练习题。</p>
          <button
            className="primary block-button"
            disabled={busy || !jobId}
            onClick={() =>
              void run(async () => {
                await api('tasks', { kind: '公司准备', jobId });
                setNotice('已请求公司准备，等待 Codex 写入题组。');
              })
            }
          >
            请求公司准备
          </button>
          {notice && <p role="status">{notice}</p>}
          {error && <p role="alert">{error}</p>}
        </section>
      ) : (
        <>
          {pack.candidateContext && (
            <section className="panel candidate-context">
              <h2>结合你的求职背景</h2>
              <p>{pack.candidateContext}</p>
              <div className="row">
                <span className="tag">工作经验单独看</span>
                <span className="tag">用能说出口的日语练习</span>
              </div>
              <details>
                <summary>沟通练习与企业确认事项</summary>
                <p className="prewrap">{pack.communicationGuide}</p>
              </details>
            </section>
          )}
          <section className="practice-intro">
            <div>
              <span className="eyebrow">INTERVIEW REHEARSAL</span>
              <h2>{pack.scenario}</h2>
              <p>先独立回答 → 提交点评 → 根据追问再说一次。每次保留原回答。</p>
            </div>
            <div className="practice-progress">
              <strong>
                {practiced.size}
                <small> / {pack.questions.length}</small>
              </strong>
              <span>已练问题</span>
            </div>
          </section>
          <details className="panel preparation-plan">
            <summary>
              <BookOpen size={18} />
              面试前要做什么
            </summary>
            <p className="prewrap">{pack.plan}</p>
            <p className="source-line">{pack.sourceNotes}</p>
          </details>
          {notice && (
            <div className="inline-note" role="status">
              {notice}
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <div className="practice-grid">
            <aside className="panel question-list">
              <div className="section-head">
                <h2>按题练习</h2>
                <span className="small muted">建议顺序</span>
              </div>
              {pack.questions.map((q, i) => (
                <button
                  disabled={busy}
                  className={
                    'question-option ' + (q.id === question.id ? 'chosen' : '')
                  }
                  key={q.id}
                  onClick={() => {
                    setQuestionId(q.id);
                    setNotice('');
                    setError('');
                  }}
                >
                  <span className="question-number">
                    {practiced.has(q.id) ? (
                      <Check size={16} />
                    ) : (
                      String(i + 1).padStart(2, '0')
                    )}
                  </span>
                  <span>
                    <b>{q.title}</b>
                    <small>
                      {q.category} · {q.targetSeconds} 秒
                    </small>
                  </span>
                  <ChevronRight size={15} />
                </button>
              ))}
            </aside>
            <section className="panel answer-panel">
              <div className="section-head">
                <span className="tag">{question.category}</span>
                <span className="row small">
                  <Clock3 size={16} />
                  建议 {question.targetSeconds} 秒
                </span>
              </div>
              <h2 className="japanese-question" lang="ja">
                {question.questionJa}
              </h2>
              <p>{question.meaning}</p>
              {(question.simpleQuestionJa || question.vocabulary) && (
                <details className="language-support">
                  <summary>换个简单说法，理解这道题</summary>
                  {question.simpleQuestionJa && (
                    <p lang="ja">{question.simpleQuestionJa}</p>
                  )}
                  {question.vocabulary && (
                    <p className="prewrap">{question.vocabulary}</p>
                  )}
                </details>
              )}
              <div className="question-purpose">
                <b>为什么提前练这题</b>
                <p>{question.why}</p>
              </div>
              <details>
                <summary>卡住时，看看回答思路</summary>
                <p className="prewrap">{question.outline}</p>
              </details>
              <details>
                <summary>面试官可能继续问</summary>
                <p className="prewrap" lang="ja">
                  {question.followUps}
                </p>
              </details>
              <div className="answer-editor">
                <label htmlFor="practice-answer">
                  你的回答 <span>{draft.dirty ? '· 尚未保存' : ''}</span>
                </label>
                <textarea
                  id="practice-answer"
                  value={draft.text}
                  disabled={busy}
                  onChange={(e) => edit({ text: e.target.value })}
                  placeholder="先用自己的话回答。可以直接写日语，也可以先用中文理清思路；口述后可粘贴转写稿。"
                  rows={9}
                  maxLength={20000}
                />
                <div className="answer-options">
                  <label>
                    回答语言
                    <select
                      value={draft.language}
                      disabled={busy}
                      onChange={(e) => edit({ language: e.target.value })}
                    >
                      {['日语', '中文构思', '中日混合'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    实际口述时长（可选）
                    <div className="duration-input">
                      <input
                        aria-label="实际口述秒数"
                        type="number"
                        min="0"
                        max="3600"
                        value={draft.seconds}
                        disabled={busy}
                        onChange={(e) => edit({ seconds: e.target.value })}
                      />
                      <span>秒</span>
                    </div>
                  </label>
                </div>
                <p className="small">
                  当前分析文字内容；发音、重音和真实语速需要音频依据。网站不录音，也不即时调用
                  AI。
                </p>
                <div className="answer-actions">
                  <button
                    className="secondary"
                    disabled={busy || !draft.text.trim()}
                    onClick={() => void save(false)}
                  >
                    <Save size={16} />
                    保存本次回答
                  </button>
                  <button
                    className="primary"
                    disabled={busy || !draft.text.trim()}
                    onClick={() => void save(true)}
                  >
                    <Sparkles size={16} />
                    保存并请 Codex 点评
                  </button>
                </div>
              </div>
            </section>
          </div>
          <section className="panel feedback-panel">
            <div className="section-head">
              <h2>
                <MessageSquareText size={20} />
                回答记录与点评
              </h2>
              {attempt && (
                <select
                  aria-label="选择历史回答"
                  value={attempt.id}
                  disabled={busy}
                  onChange={(e) =>
                    setPicked((p) => ({ ...p, [key]: e.target.value }))
                  }
                >
                  {attempts.map((a, i) => (
                    <option key={a.id} value={a.id}>
                      第 {attempts.length - i} 次 ·{' '}
                      {new Date(a.createdAt).toLocaleString('zh-CN', {
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
                  保存第一段回答后，这里会保留原文、修改建议和下次练习重点。
                </p>
              </div>
            ) : (
              <>
                <details className="saved-answer" open>
                  <summary>
                    这次保存的原回答 · {attempt.language}
                    {attempt.durationSeconds
                      ? ` · ${attempt.durationSeconds} 秒`
                      : ''}
                  </summary>
                  <p className="prewrap">{attempt.answer}</p>
                </details>
                {attempt.profileRevision !== data.profile.revision && (
                  <div className="inline-note">
                    个人履历在这次回答后有更新，点评时需要核对差异。
                  </div>
                )}
                {review ? (
                  <>
                    <div className="feedback-summary">
                      <span className="eyebrow">
                        CODEX FEEDBACK ·{' '}
                        {new Date(review.createdAt).toLocaleDateString(
                          'zh-CN',
                          { timeZone: 'Asia/Tokyo' },
                        )}
                      </span>
                      <h3>这次最值得改进的地方</h3>
                      <p className="prewrap">{review.summary}</p>
                    </div>
                    <div className="feedback-grid">
                      {[
                        ['保留的优点', review.strengths],
                        ['工作能力与回答内容', review.improvements],
                        ['日语表达（单独点评）', review.japaneseNotes],
                        ['事实与追问风险', review.factChecks],
                      ].map(([title, text]) => (
                        <div className="feedback-block" key={title}>
                          <h3>{title}</h3>
                          <p className="prewrap">{text}</p>
                        </div>
                      ))}
                    </div>
                    {review.foreignApplicantNotes && (
                      <div className="feedback-block">
                        <h3>外国求职者的沟通建议</h3>
                        <p className="prewrap">
                          {review.foreignApplicantNotes}
                        </p>
                      </div>
                    )}
                    {review.simpleAnswer && (
                      <details className="revised-answer" open>
                        <summary>先练这一版：简短、礼貌、能说出口</summary>
                        <p className="prewrap" lang="ja">
                          {review.simpleAnswer}
                        </p>
                      </details>
                    )}
                    <details className="revised-answer">
                      <summary>参考改写：理解结构后，用自己的话重说</summary>
                      <p className="prewrap" lang="ja">
                        {review.revisedAnswer}
                      </p>
                    </details>
                    <div className="feedback-grid">
                      <div className="feedback-block">
                        <h3>下一轮追问</h3>
                        <p className="prewrap">{review.followUps}</p>
                      </div>
                      <div className="feedback-block">
                        <h3>下一次只练这件事</h3>
                        <p className="prewrap">{review.nextPractice}</p>
                      </div>
                    </div>
                    <details>
                      <summary>点评依据与局限</summary>
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
                      重新作答，保存下一版
                    </button>
                  </>
                ) : (
                  <div className="waiting-feedback">
                    <h3>
                      {pending ? '等待 Codex 点评' : '这次回答还没有点评'}
                    </h3>
                    <p>
                      {pending
                        ? '请求已加入任务队列。可以复制指令发给 Codex 现在处理，也会由每日任务处理；结果写回后自动显示。'
                        : '提交后，Codex 会针对这份已保存的回答分析，而不是评价尚未保存的编辑内容。'}
                    </p>
                    <div className="answer-actions">
                      {!pending && (
                        <button
                          disabled={busy}
                          className="primary"
                          onClick={() => void queueReview()}
                        >
                          <Sparkles size={16} />
                          请求点评这个版本
                        </button>
                      )}
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={() => void copyPrompt()}
                      >
                        <Copy size={16} />
                        复制给 Codex 的指令
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
