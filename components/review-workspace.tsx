'use client';
import { useState } from 'react';
import type { Material, Question, QuestionSet, Report, State } from '@/lib/career';
import { api, apiDelete } from '@/lib/career';
import {
  hasPracticeQuestions,
  isCompanyPracticePlan,
  practiceAgentPrompt,
  practicePlanProgress,
} from '@/lib/practice-plan';
import InterviewReviewHub from './interview-review-hub';
import InterviewPractice from './interview-practice';
import { RecordBack } from './record-page';
import { Ja } from './japanese-text';
import { DataCell, DataRow, DataTable, DataTitle } from './data-table';
import { useLocale } from './locale-provider';
import { Search } from 'lucide-react';
const base = '#interview-review';
const TOPIC_PAGE_SIZE = 10;

type PracticeTopic = '面试基本问题' | '日语提升' | '転職フェア练习';
type TopicQuestion = {
  pack: QuestionSet;
  question: Question;
  topic: PracticeTopic;
  order: number;
};

function practiceTopic(question: Question): PracticeTopic | '复盘' {
  if (question.category === '日语表达基础') return '日语提升';
  if (
    question.category === 'フェア基本練習' ||
    (question.category === '総合練習' && question.id.startsWith('fair-'))
  )
    return '転職フェア练习';
  if (question.category === '面试复盘专项') return '复盘';
  return '面试基本问题';
}

function topicQuestions(data: State): TopicQuestion[] {
  const rank: Record<PracticeTopic, number> = {
    面试基本问题: 0,
    日语提升: 1,
    転職フェア练习: 2,
  };
  return data.questionSets
    .filter((pack) => pack.jobId === 'builtin:general')
    .flatMap((pack, packIndex) =>
      pack.questions.flatMap((question, questionIndex) => {
        const topic = practiceTopic(question);
        return topic === '复盘'
          ? []
          : [{ pack, question, topic, order: packIndex * 1000 + questionIndex }];
      }),
    )
    .sort((a, b) => rank[a.topic] - rank[b.topic] || a.order - b.order);
}

function PracticeTopicTable({ data }: { data: State }) {
  const { t } = useLocale();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [topicFilter, setTopicFilter] = useState<PracticeTopic | '全部'>('全部');
  const [categoryFilter, setCategoryFilter] = useState('全部');
  const [practiceFilter, setPracticeFilter] = useState<'全部' | '已练习' | '未练习'>('全部');
  const rows = topicQuestions(data);
  const attemptsByQuestion = new Map<string, number>();
  data.attempts.forEach((attempt) => {
    const key = attempt.questionSetId + '|' + attempt.questionId;
    attemptsByQuestion.set(key, (attemptsByQuestion.get(key) || 0) + 1);
  });
  const categories = [...new Set(rows.map((row) => row.question.category))];
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filteredRows = rows.filter((row) => {
    const key = row.pack.id + '|' + row.question.id;
    const attempts = attemptsByQuestion.get(key) || 0;
    const number = row.question.questionNumber
      ? 'q' + row.question.questionNumber
      : '';
    const searchable = [
      number,
      row.question.title,
      row.question.questionJa,
      row.question.category,
      row.topic,
    ]
      .join('\n')
      .toLocaleLowerCase();
    return (
      (!normalizedQuery || searchable.includes(normalizedQuery)) &&
      (topicFilter === '全部' || row.topic === topicFilter) &&
      (categoryFilter === '全部' || row.question.category === categoryFilter) &&
      (practiceFilter === '全部' ||
        (practiceFilter === '已练习' ? attempts > 0 : attempts === 0))
    );
  });
  const pageCount = Math.max(
    1,
    Math.ceil(filteredRows.length / TOPIC_PAGE_SIZE),
  );
  const currentPage = Math.min(page, pageCount);
  const visible = filteredRows.slice(
    (currentPage - 1) * TOPIC_PAGE_SIZE,
    currentPage * TOPIC_PAGE_SIZE,
  );
  const open = (row: TopicQuestion) => {
    window.location.assign(
      '#practice/question/' +
        encodeURIComponent(row.pack.id + '|' + row.question.id),
    );
  };
  const topicTone: Record<PracticeTopic, string> = {
    面试基本问题: 'blue',
    日语提升: 'green',
    転職フェア练习: 'amber',
  };

  return (
    <section className="japanese-practice-hub practice-topic-page">
      <div className="list-toolbar practice-topic-toolbar">
        <label className="search">
          <Search size={17} />
          <input
            aria-label={t('搜索题目或编号')}
            placeholder={t('搜索题目或编号')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </label>
        <select
          aria-label={t('筛选专题')}
          value={topicFilter}
          onChange={(event) => {
            setTopicFilter(event.target.value as PracticeTopic | '全部');
            setPage(1);
          }}
        >
          <option value="全部">{t('全部专题')}</option>
          <option value="面试基本问题">{t('面试基本问题')}</option>
          <option value="日语提升">{t('日语提升')}</option>
          <option value="転職フェア练习">{t('転職フェア练习')}</option>
        </select>
        <select
          aria-label={t('筛选题型')}
          value={categoryFilter}
          onChange={(event) => {
            setCategoryFilter(event.target.value);
            setPage(1);
          }}
        >
          <option value="全部">{t('全部题型')}</option>
          {categories.map((category) => (
            <option key={category} value={category}>
              {t(category)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('筛选练习状态')}
          value={practiceFilter}
          onChange={(event) => {
            setPracticeFilter(
              event.target.value as '全部' | '已练习' | '未练习',
            );
            setPage(1);
          }}
        >
          <option value="全部">{t('全部练习状态')}</option>
          <option value="已练习">{t('已练习')}</option>
          <option value="未练习">{t('未练习')}</option>
        </select>
        <span className="muted list-count">
          {t('{0} / {1} 条', [String(filteredRows.length), String(rows.length)])}
        </span>
      </div>
      <section className="panel dt-panel practice-topic-list">
        {filteredRows.length ? (
          <DataTable
            label={t('专题练习')}
            columns={[
              { key: 'question', label: t('题目'), width: 'minmax(0, 2fr)' },
              { key: 'topic', label: t('专题'), width: '150px' },
              {
                key: 'category',
                label: t('题型'),
                width: 'minmax(120px, 1fr)',
                hide: 'tablet',
              },
              {
                key: 'attempts',
                label: t('练习次数'),
                width: '90px',
                align: 'end',
              },
              {
                key: 'time',
                label: t('建议时长'),
                width: '90px',
                hide: 'phone',
                align: 'end',
              },
            ]}
          >
            {visible.map((row) => {
              const key = row.pack.id + '|' + row.question.id;
              return (
                <DataRow key={key} onOpen={() => open(row)}>
                  <DataTitle
                    title={
                      <>
                        <span className="company-number">
                          Q{row.question.questionNumber || '—'}
                        </span>
                        <Ja text={row.question.title} />
                      </>
                    }
                    meta={<Ja text={row.question.questionJa} mode="ja" />}
                    onClick={() => open(row)}
                  />
                  <DataCell label={t('专题')} corner>
                    <span className={'badge ' + topicTone[row.topic]}>
                      {t(row.topic)}
                    </span>
                  </DataCell>
                  <DataCell label={t('题型')} hide="tablet" className="ellipsis">
                    <Ja text={row.question.category} />
                  </DataCell>
                  <DataCell label={t('练习次数')} align="end" className="num">
                    {attemptsByQuestion.get(key) || 0}
                  </DataCell>
                  <DataCell label={t('建议时长')} hide="phone" align="end" className="num">
                    {row.question.targetSeconds ? `${row.question.targetSeconds} ${t('秒')}` : '—'}
                  </DataCell>
                </DataRow>
              );
            })}
          </DataTable>
        ) : (
          <div className="empty">
            <p>{t(rows.length ? '没有符合条件的练习题' : '还没有专题练习')}</p>
          </div>
        )}
        {pageCount > 1 && (
          <nav className="list-pagination" aria-label={t('分页')}>
            <span>{t('第 {0} / {1} 页', [String(currentPage), String(pageCount)])}</span>
            <button
              type="button"
              className="secondary"
              disabled={currentPage === 1}
              onClick={() => setPage(currentPage - 1)}
            >
              {t('上一页')}
            </button>
            <button
              type="button"
              className="secondary"
              disabled={currentPage === pageCount}
              onClick={() => setPage(currentPage + 1)}
            >
              {t('下一页')}
            </button>
          </nav>
        )}
      </section>
    </section>
  );
}

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
        companyPracticeOnly={!hash.startsWith(base + '/japanese/')}
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
        <div className="section-head company-practice-directory-heading">
          <div>
            <h2>公司预先练习</h2>
            <p className="muted">按公司查找面试练习，进入后只查看该公司的题目与历史回答。</p>
          </div>
        </div>
        <InterviewPractice
          data={data}
          reload={reload}
          openMaterial={openMaterial}
          openReport={openReport}
          routeBase={base}
          companyPracticeOnly
        />
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
  if (!companyOnly) return <PracticeTopicTable data={data} />;
  const clearedSets = companyOnly
    ? data.questionSets.filter((pack) => !hasPracticeQuestions(pack)).length
    : 0;
  const plans = (data.practicePlans || [])
    .filter(
      (plan) => isCompanyPracticePlan(plan, data.questionSets) === companyOnly,
    )
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
      <div className="section-head">
        <h2>{companyOnly ? '公司预先练习' : '专题练习'}</h2>
        <button
          className="primary"
          onClick={() => {
            setRequestId(crypto.randomUUID());
            setCreating(true);
          }}
          disabled={busy || creating}
        >
          制定计划
        </button>
      </div>
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
      {clearedSets > 0 && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`永久删除 ${clearedSets} 个已清空的题组？有回答记录的题组会保留。`))
              return;
            void run(async () => {
              const { deleted } = await api<{ deleted: number }>(
                'question-sets/delete-cleared',
                {},
              );
              setNotice(`已删除 ${deleted} 个已清空的题组。`);
              await reload();
            });
          }}
        >
          删除 {clearedSets} 个已清空题组
        </button>
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
          <div className="section-head">
            <h3><Ja text={plan.title} /></h3>
            <button
              type="button"
              className="text-button danger"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(`删除练习计划「${plan.title}」？没有真实回答的计划会永久删除。`)) return;
                void run(async () => {
                  await apiDelete(`practice-plans?id=${encodeURIComponent(plan.id)}&revision=${plan.revision}`);
                  setNotice('已删除练习计划。');
                  await reload();
                });
              }}
            >
              删除计划
            </button>
          </div>
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
