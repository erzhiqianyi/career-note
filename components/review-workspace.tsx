'use client';
import { useState } from 'react';
import type { Material, Report, State } from '@/lib/career';
import { api } from '@/lib/career';
import { practiceAgentPrompt, practicePlanProgress } from '@/lib/practice-plan';
import InterviewReviewHub from './interview-review-hub';
import InterviewPractice from './interview-practice';
import { RecordBack } from './record-page';
import { Ja } from './japanese-text';
const base = '#interview-review';

export default function ReviewWorkspace({
  data,
  hash,
  reload,
  openMaterial,
  openReport,
}: {
  data: State;
  hash: string;
  reload: () => Promise<void>;
  openMaterial: (m: Material) => void;
  openReport: (r: Report) => void;
}) {
  // Keep old deep links readable; the visible entry now lives under Practice.
  if (hash === base + '/japanese')
    return <PracticeWorkspace data={data} reload={reload} />;
  if (
    /^#interview-review\/(question|help|guide|company)\//.test(hash) ||
    hash.startsWith(base + '/japanese/')
  )
    return (
      <InterviewPractice
        data={data}
        reload={reload}
        openMaterial={openMaterial}
        openReport={openReport}
        routeBase={
          hash.startsWith(base + '/japanese/') ? base + '/japanese' : base
        }
      />
    );
  if (hash === base + '/preparation')
    return (
      <>
        <RecordBack
          title="复盘"
          onBack={() => {
            window.location.hash = base;
          }}
        />
        <PracticeWorkspace data={data} reload={reload} companyOnly />
        {data.questionSets
          .filter((p) => p.jobId !== 'builtin:general')
          .map((p) => (
            <a
              className="panel review-entry"
              key={p.id}
              href={base + '/company/' + encodeURIComponent(p.jobId)}
            >
              <Ja text={p.title} />
              <p>预先练习与历史回答</p>
            </a>
          ))}
      </>
    );
  if (hash.startsWith(base + '/'))
    return (
      <>
        <RecordBack
          title="复盘"
          onBack={() => {
            window.location.hash = base;
          }}
        />
        <InterviewReviewHub data={data} openReport={openReport} />
      </>
    );
  return (
    <section className="review-entry-grid">
      <a className="panel review-entry" href={base + '/preparation'}>
        <h2>公司预先练习</h2>
        <p>面试前的专题计划、公司问题与练习回顾。</p>
      </a>
      <a className="panel review-entry" href={base + '/interviews'}>
        <h2>实际面试复盘</h2>
        <p>原始录音、实际问答、复盘与后续改进。</p>
      </a>
    </section>
  );
}

export function PracticeWorkspace({
  data,
  reload,
  companyOnly = false,
}: {
  data: State;
  reload: () => Promise<void>;
  companyOnly?: boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [goal, setGoal] = useState('');
  const [situation, setSituation] = useState('');
  const [start, setStart] = useState(data.today);
  const [end, setEnd] = useState('');
  const [minutes, setMinutes] = useState(20);
  const [purpose, setPurpose] = useState<'interview' | 'japanese'>('interview');
  const [jobId, setJobId] = useState('');
  const plans = (data.practicePlans || [])
    .filter((plan) => Boolean(plan.jobId || plan.interviewId) === companyOnly)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="japanese-practice-hub">
      <section className="panel">
        <h2>{companyOnly ? '公司预先练习' : '专题练习'}</h2>
        <p>基本关键词 → 逐句练习 → 完整回答</p>
        <p>
          在 AI Agent
          中按计划练习；这里保存原回答、逐句反馈、接续位置和练习回顾。
        </p>
        <button
          className="primary"
          onClick={() => {
            setRequestId(crypto.randomUUID());
            setCreating(true);
          }}
          disabled={busy || creating}
        >
          制定专题计划
        </button>
      </section>
      {!companyOnly && !creating && (
        <section className="review-entry-grid" aria-label="专题建议">
          {['面试基本问题', '日语提升', '転職フェア练习'].map((topic) => (
            <button
              className="panel review-entry"
              key={topic}
              onClick={() => {
                setPurpose(topic === '日语提升' ? 'japanese' : 'interview');
                setGoal(topic);
                setRequestId(crypto.randomUUID());
                setCreating(true);
              }}
            >
              <h3>{topic}</h3>
              <p>设定目标与时间，交给 Agent 安排练习</p>
            </button>
          ))}
        </section>
      )}
      {creating && (
        <form
          className="panel japanese-practice-form"
          onSubmit={(event) => {
            event.preventDefault();
            void run(async () => {
              await api('practice-plans', {
                id: requestId,
                input: {
                  purpose,
                  title: goal.trim().slice(0, 60),
                  goal: goal.trim(),
                  currentSituation:
                    situation.trim() || '尚未评估，请根据第一次实际回答确认。',
                  startDate: start,
                  endDate: end,
                  dailyMinutes: minutes,
                  jobId: companyOnly ? jobId : '',
                  interviewId: '',
                  sourceAttemptIds: [],
                },
              });
              setCreating(false);
              setNotice('已保存目标并请求制定计划，同步后查看结果。');
              await reload();
            });
          }}
        >
          <h3>制定专题计划</h3>
          <label>
            练习方向
            <select
              value={purpose}
              onChange={(e) =>
                setPurpose(e.target.value as 'interview' | 'japanese')
              }
            >
              <option value="interview">面试基本问题／活动专题</option>
              {!companyOnly && <option value="japanese">日语提升</option>}
            </select>
          </label>
          {companyOnly && (
            <label>
              公司
              <select
                required
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
              >
                <option value="">选择公司</option>
                {data.jobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.company}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            练习目标
            <textarea
              required
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="例如：面试基本问题、日语提升、11/7 転職フェア练习"
            />
          </label>
          <label>
            目前的困难
            <textarea
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
            />
          </label>
          <label>
            开始日期
            <input
              type="date"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              required
              min={start}
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label>
            每天练习时间（分钟）
            <input
              type="number"
              min={5}
              max={180}
              required
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            />
          </label>
          <button className="primary" disabled={busy}>
            保存并请求制定计划
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => setCreating(false)}
          >
            取消
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <h3>专题计划与练习回顾</h3>
      {!plans.length && (
        <p className="muted">
          还没有专题计划。先设定目标、日期和时间预算，再让 Agent 制定具体练习。
        </p>
      )}
      {plans.map((plan) => (
        <section className="panel" key={plan.id}>
          <h3>
            <Ja text={plan.title} />
          </h3>
          <p>
            <Ja text={plan.goal} />
          </p>
          <p>
            {plan.startDate} — {plan.endDate} · 每天 {plan.dailyMinutes} 分钟
          </p>
          {!plan.content ? (
            <div>
              <p>等待 Agent 根据目标制定计划。</p>
              <button
                className="secondary"
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(
                      practiceAgentPrompt(plan),
                    );
                    setNotice('已复制 Agent 指令。');
                  })
                }
              >
                复制 Agent 计划指令
              </button>
            </div>
          ) : (
            <>
              <p>
                已完成 {practicePlanProgress(plan, data.attempts).completed} /{' '}
                {plan.content.schedule.length} 项练习
              </p>
              <details>
                <summary>能力目标与练习方法</summary>
                <p>
                  <Ja text={plan.content.baselineAnalysis} />
                </p>
                {plan.content.skills.map((skill) => (
                  <p key={skill.id}>
                    <b>
                      <Ja text={skill.title} />
                    </b>{' '}
                    · <Ja text={skill.target} />
                  </p>
                ))}
                <p>
                  <Ja text={plan.content.successCriteria} />
                </p>
              </details>
              {plan.content.schedule.map((item) => {
                const ex = plan.content!.exercises.find(
                  (ex) => ex.id === item.exerciseId,
                );
                return (
                  ex && (
                    <div className="panel" key={item.id}>
                      <p>
                        {item.date} · <Ja text={ex.title} /> · {item.minutes}{' '}
                        分钟
                      </p>
                      <p>
                        <Ja text={ex.instructions} />
                      </p>
                      <button
                        className="secondary"
                        onClick={() =>
                          void run(async () => {
                            await navigator.clipboard.writeText(
                              practiceAgentPrompt(plan, item.id),
                            );
                            setNotice(
                              '已复制接续指令，粘贴到连接 Career Note MCP 的 Agent 即可继续。',
                            );
                          })
                        }
                      >
                        复制 Agent 练习指令
                      </button>
                      {data.attempts
                        .filter(
                          (a) =>
                            a.practiceContext?.planId === plan.id &&
                            a.practiceContext?.scheduleId === item.id,
                        )
                        .map((a) => (
                          <details key={a.id}>
                            <summary>
                              {a.createdAt.slice(0, 10)} ·{' '}
                              {a.agentPractice
                                ? {
                                    keywords: '关键词',
                                    sentence: '逐句',
                                    full: '完整回答',
                                  }[a.agentPractice.stage]
                                : '完整回答'}
                            </summary>
                            <p className="prewrap">
                              <Ja text={a.answer} />
                            </p>
                            {a.agentPractice && (
                              <>
                                <p>
                                  反馈：
                                  <Ja text={a.agentPractice.feedback} />
                                </p>
                                <p>
                                  下次接续：
                                  <Ja text={a.agentPractice.nextStep} />
                                </p>
                              </>
                            )}
                          </details>
                        ))}
                    </div>
                  )
                );
              })}
              {plan.content.checkpoints.map((check) => (
                <div key={check.id}>
                  <h4>
                    {check.date} · <Ja text={check.title} />
                  </h4>
                  <p>
                    <Ja text={check.criteria} />
                  </p>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api('practice-plans/request', {
                          id: plan.id,
                          kind: 'review',
                          checkpointId: check.id,
                        });
                        setNotice('已请求阶段复盘，点评会依据实际回答保存。');
                        await reload();
                      })
                    }
                  >
                    请求阶段复盘
                  </button>
                  {(data.practicePlanReviews || [])
                    .filter(
                      (review) =>
                        review.planId === plan.id &&
                        review.checkpointId === check.id,
                    )
                    .map((review) => (
                      <div key={review.id}>
                        <p>
                          <Ja text={review.summary} />
                        </p>
                        <p>
                          <Ja text={review.nextActions} />
                        </p>
                      </div>
                    ))}
                </div>
              ))}
            </>
          )}
        </section>
      ))}
    </section>
  );
}
