'use client';
import InterviewPractice from '@/components/interview-practice';
import ProfileOverview from '@/components/profile-overview';
import OpportunityCard from '@/components/opportunity-card';
import SkillArchive from '@/components/skill-archive';
import JobPlatforms from '@/components/job-platforms';
import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Sparkles,
  Upload,
  UserRound,
  Workflow,
  X,
} from 'lucide-react';
import {
  api,
  download,
  materialKinds,
  statuses,
  type MpcTokenRecord,
  type MpcTokenResponse,
  type AuthContext,
  type Job,
  type Material,
  type Report,
  type State,
} from '@/lib/career';
import {
  getCareerAuth,
  configureCareerAuth,
  type CareerAuthConfig,
  listenCareerAuthChanged,
  signInWithGoogle,
  signOutCareer,
} from '@/lib/career-auth';
import { setAuthToken } from '@/lib/career';
const nav = [
  { label: '今日准备', icon: LayoutDashboard },
  { label: '公司与投递', icon: BriefcaseBusiness },
  { label: '求职平台', icon: Search },
  { label: '我的履历', icon: UserRound },
  { label: '准备资料', icon: FileText },
  { label: '面试练习', icon: CalendarDays },
  { label: '每日分析', icon: Sparkles },
  { label: 'Agent 协作', icon: Workflow },
  { label: '管理后台', icon: Shield, adminOnly: true },
];
const researchFields = [
  ['company', '公司名称'],
  ['role', '职位名称'],
  ['url', '招聘来源链接'],
  ['sourceDate', '信息确认日期'],
  ['location', '工作地点'],
  ['salary', '薪资范围'],
  ['business', '公司业务与特点'],
  ['requirements', '岗位要求'],
  ['description', '职位内容'],
  ['japanese', '日语要求'],
  ['foreigner', '外国人招聘信息'],
  ['visa', '在留资格支持信息'],
  ['matchNotes', '与我的匹配点'],
  ['unknowns', '待确认事项'],
];
const profileFields = [
  ['summary', '职业摘要'],
  ['targetRoles', '目标岗位'],
  ['skills', '技能与项目能力'],
  ['experience', '工作经历与证据'],
  ['japanese', '日语与沟通能力'],
  ['conditions', '求职条件'],
];
function day(value: string) {
  return value ? value.slice(0, 10).replaceAll('-', '.') : '待确认';
}
function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      className={
        'badge ' +
        (children === '需重做'
          ? 'amber'
          : children === '面试中'
            ? 'blue'
            : children === '内定' || children === '已核对'
              ? 'green'
              : children === '未通过'
                ? 'gray'
                : '')
      }
    >
      {children}
    </span>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <BriefcaseBusiness size={28} />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
function Field({
  name,
  label,
  value = '',
  large = false,
  required = false,
  type = 'text',
}: {
  name: string;
  label: string;
  value?: string;
  large?: boolean;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className={large ? 'field wide' : 'field'}>
      <span>
        {label}
        {required && ' *'}
      </span>
      {large ? (
        <textarea
          name={name}
          defaultValue={value}
          rows={4}
          required={required}
        />
      ) : (
        <input
          name={name}
          defaultValue={value}
          required={required}
          type={type}
        />
      )}
    </label>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="关闭" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Home() {
  const [active, setActive] = useState('今日准备'),
    [data, setData] = useState<State | null>(null),
    [auth, setAuth] = useState<AuthContext | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(''),
    [query, setQuery] = useState(''),
    [filter, setFilter] = useState('全部'),
    [jobEdit, setJobEdit] = useState<Partial<Job> | null>(null),
    [doc, setDoc] = useState<Material | Report | null>(null);
  const [practiceJob, setPracticeJob] = useState('');
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => {
    const navigate = () => {
      if (window.location.hash === '#interview') setActive('面试练习');
      if (window.location.hash === '#platforms') setActive('求职平台');
    };
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, []);
  const [importOpen, setImportOpen] = useState(false),
    [importText, setImportText] = useState(''),
    [preview, setPreview] = useState<Record<string, number> | null>(null),
    [profileEdit, setProfileEdit] = useState(false);
  const [authConfig, setAuthConfig] = useState<CareerAuthConfig | null>(null);
  const sessionEpoch = useRef(0);
  const lastUid = useRef<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [mcpTokens, setMcpTokens] = useState<MpcTokenRecord[]>([]);
  const [tokenName, setTokenName] = useState('MCP Agent Token');
  const [tokenDays, setTokenDays] = useState('30');
  const visibleNav = useMemo(
    () => nav.filter((item) => !item.adminOnly || auth?.admin),
    [auth],
  );
  const reload = useCallback(async () => {
    const epoch = sessionEpoch.current;
    try {
      const next = await api<State>('state');
      if (epoch !== sessionEpoch.current) return;
      setData(next);
      setError('');
    } catch (e) {
      if (epoch !== sessionEpoch.current) return;
      setData(null);
      setError(e instanceof Error ? e.message : '无法连接本机数据服务');
    }
  }, []);
  const refreshAuth = useCallback(async () => {
    const epoch = sessionEpoch.current;
    try {
      const session = await api<AuthContext>('auth/me');
      if (epoch !== sessionEpoch.current) return false;
      setAuth(session);
      setLoggedIn(session.mode !== 'off' && !!session.uid);
      return true;
    } catch (e) {
      if (epoch !== sessionEpoch.current) return false;
      setAuth(null);
      setData(null);
      setLoggedIn(false);
      setError(e instanceof Error ? e.message : '登录验证失败');
      return false;
    }
  }, []);
  const invalidateSession = useCallback(() => { sessionEpoch.current++; }, []);
  useEffect(() => {
    let disposed = false;
    let removeAuth = () => {};
    void configureCareerAuth().then(config => {
      if (disposed) return;
      setAuthConfig(config);
      removeAuth = listenCareerAuthChanged((user, token) => {
        if (disposed) return;
        if (lastUid.current !== (user?.uid || null)) {
          sessionEpoch.current++;
          setData(null);
          setAuth(null);
          setMcpTokens([]);
          setImportOpen(false);
          setImportText('');
          setPreview(null);
          setProfileEdit(false);
          setJobEdit(null);
          setSelected('');
        }
        lastUid.current = user?.uid || null;
        setAuthToken(token);
        setUserName(user?.displayName || '');
        setUserEmail(user?.email || '');
        setLoggedIn(false);
        if (!user && config.mode !== 'off') {
          setAuth(null);
          setData(null);
          return;
        }
        void refreshAuth().then(ok => { if (ok && !disposed) void reload(); });
      }, error => { if (!disposed) setError(error.message); });
    }).catch(error => { if (!disposed) setError(error.message); });
    return () => { disposed = true; invalidateSession(); removeAuth(); };
  }, [refreshAuth, reload, invalidateSession]);
  useEffect(() => {
    if (!auth) return;
    const timer = setInterval(() => {
      void refreshAuth().then(ok => { if (ok) void reload(); });
    }, 30000);
    return () => clearInterval(timer);
  }, [auth, refreshAuth, reload]);
  const refreshMcpTokens = useCallback(async () => {
    try {
      const response = await api<{ tokens: MpcTokenRecord[] }>('mcp/tokens');
      setMcpTokens(response.tokens || []);
    } catch {
      setMcpTokens([]);
    }
  }, []);
  useEffect(() => {
    if (active === '管理后台' && auth?.admin) {
      void refreshMcpTokens();
    }
  }, [active, auth, refreshMcpTokens]);
  useEffect(() => {
    if (!visibleNav.some((item) => item.label === active)) {
      setActive('今日准备');
    }
  }, [active, visibleNav]);
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(''), 6000);
    return () => clearTimeout(timer);
  }, [message]);
  async function action(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError('');
    try {
      await fn();
      await reload();
      setMessage(success);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作失败');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function login() {
    try {
      setBusy(true);
      const token = await signInWithGoogle();
      setAuthToken(token);
      if (await refreshAuth()) {
        await reload();
        setMessage('已登录');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败');
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      setBusy(true);
      sessionEpoch.current++;
      setData(null);
      setAuth(null);
      setLoggedIn(false);
      await signOutCareer();
      setAuthToken(null);
      setMcpTokens([]);
      setMessage('已退出登录');
    } catch (e) {
      setError(e instanceof Error ? e.message : '退出失败');
    } finally {
      setBusy(false);
    }
  }
  async function createMcpToken() {
    const days = Number(tokenDays);
    if (!tokenName || !days) return;
    try {
      const record = await api<MpcTokenResponse>('mcp/tokens', {
        name: tokenName,
        scopes: ['career:read', 'career:write', 'agent:write'],
        expiresInDays: days,
      });
      await refreshMcpTokens();
      await navigator.clipboard.writeText(record.token);
      setMessage('已生成并复制 MCP token（仅显示一次）');
    } catch (e) {
      setError(e instanceof Error ? e.message : '生成 token 失败');
    }
  }
  async function revokeMcpToken(id: string) {
    await action(() => api('mcp/tokens/revoke', { id }), '已撤销 MCP token');
    await refreshMcpTokens();
  }
  function go(label: string) {
    window.scrollTo(0, 0);
    if (visibleNav.some((item) => item.label === label)) {
      setActive(label);
      window.history.replaceState(null, '', label === '求职平台' ? '#platforms' : label === '面试练习' ? '#interview' : window.location.pathname);
    }
    setMoreOpen(false);
    setSelected('');
    setFilter('全部');
    setQuery('');
  }
  async function request(kind: string, jobId = '') {
    await action(
      () => api('tasks', { kind, jobId, instructions: '' }),
      '已加入 Codex 待处理队列；分析完成后会显示结果。',
    );
  }
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (tool: unknown, options: unknown) => Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tools = [
      {
        name: 'read_career_workspace',
        description:
          'Read saved jobs, profile, reports and pending preparation tasks.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: () => api('state'),
      },
      {
        name: 'queue_career_preparation',
        description:
          'Queue company preparation for Codex; does not generate content or apply to a job.',
        inputSchema: {
          type: 'object',
          properties: { jobId: { type: 'string' } },
          required: ['jobId'],
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: async (input: unknown) => {
          const x = input as { jobId?: unknown };
          if (typeof x?.jobId !== 'string') throw Error('jobId is required');
          const result = await api('tasks', {
            kind: '公司准备',
            jobId: x.jobId,
          });
          await reload();
          return result;
        },
      },
    ];
    for (const tool of tools) {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {});
      } catch {}
    }
    return () => lifecycle.abort();
  }, [reload]);
  const job = data?.jobs.find((j) => j.id === selected),
    openJobs =
      data?.jobs.filter(
        (j) => !['未通过', '已撤回', '内定'].includes(j.status),
      ) || [];
  const due = openJobs.filter(
      (j) => j.nextDate && j.nextDate <= (data?.today || ''),
    ),
    interviews = openJobs.filter((j) => j.status === '面试中');
  const latest = data?.reports
    .slice()
    .sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    )[0];
  const visible =
    data?.jobs.filter(
      (j) =>
        (filter === '全部' || j.status === filter) &&
        `${j.company} ${j.role} ${j.requirements}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) || [];
  const pending = data?.tasks.filter((t) => t.status === '待处理') || [];
  function promptText() {
    return `请处理我的本机求职工作区。先阅读 当前项目的 docs/agent-workflow.md。按工作流读取 state 并更新 pending tasks，然后根据来源核验职位信息，基于个人事实准备材料和每日报告，按工作流要求 preview/import 写入结果。严禁编造经历或修改投递状态，严禁代我发送申请或联系企业。`;
  }
  if (!authConfig || (authConfig.mode !== 'off' && !loggedIn)) {
    return <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">CAREER NOTE</p>
        <h1>登录就职手帖</h1>
        <p>使用获准的 Google 账号，访问你的求职资料与面试练习。</p>
        {error && <p role="alert">{error}</p>}
        {!authConfig ? <p>{error ? '请检查服务后刷新页面。' : '正在读取登录配置…'}</p> : <>
          {!getCareerAuth() && <p>尚未配置 Google 登录。请按 README 设置 Firebase 后重启服务。</p>}
          <button className="primary" disabled={busy || !getCareerAuth()} onClick={() => void login()}>Google 登录</button>
          {userEmail && <button className="text-button" disabled={busy} onClick={() => void logout()}>退出 {userEmail}</button>}
        </>}
      </section>
    </main>;
  }
  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <span>就</span>
          <div>
            就职手帖<small>CAREER NOTE / TOKYO</small>
          </div>
        </div>
        <nav aria-label="工作区导航">
          {visibleNav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              aria-current={active === label ? 'page' : undefined}
              className={active === label ? 'active' : ''}
              onClick={() => go(label)}
            >
              <Icon size={19} />
              {label}
              {label === 'Agent 协作' && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
      </aside>
      <nav className="mobile-nav" aria-label="手机导航">
        {[
          { label: '今日准备', short: '今日', icon: LayoutDashboard },
          { label: '公司与投递', short: '公司', icon: BriefcaseBusiness },
          { label: '面试练习', short: '面试练习', icon: CalendarDays },
          { label: '我的履历', short: '履历', icon: UserRound },
        ].map(({ label, short, icon: Icon }) => (
          <button
            key={label}
            className={active === label ? 'active' : ''}
            aria-label={label}
            aria-current={active === label ? 'page' : undefined}
            onClick={() => go(label)}
          >
            <Icon size={21} />
            <span>{short}</span>
          </button>
        ))}
        <button
          className={
            ['求职平台', '准备资料', '每日分析', 'Agent 协作', '管理后台'].includes(active) ||
            moreOpen
              ? 'active'
              : ''
          }
          aria-label="更多页面"
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={22} />
          <span>更多</span>
        </button>
      </nav>
      {moreOpen && (
        <Modal title="更多页面" onClose={() => setMoreOpen(false)}>
          <div className="more-pages">
            {visibleNav
              .filter((item) =>
                ['求职平台', '准备资料', '每日分析', 'Agent 协作', '管理后台'].includes(
                  item.label,
                ),
              )
              .map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  aria-current={active === label ? 'page' : undefined}
                  onClick={() => go(label)}
                >
                  <Icon size={21} />
                  <span>{label}</span>
                  <ChevronRight size={18} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      <main>
        <header>
          <span>
            我的工作区 <span className="muted">/ {active}</span>
          </span>
          <div className="row">
          <span className="location">
              日本 · {data ? day(data.today) : '日本求职'}
            </span>
            {loggedIn && (
              <span className="location">
                {userName || userEmail || '已登录'}
              </span>
            )}
            {!getCareerAuth() ? <span className="muted">本机模式 · Google 登录未启用</span> : (
              loggedIn ? (
                <button
                  className="text-button"
                  onClick={() => void logout()}
                  disabled={busy}
                >
                  退出
                </button>
              ) : (
                <button
                  className="primary"
                  onClick={() => void login()}
                  disabled={busy}
                >
                  Google 登录
                </button>
              )
            )}
            <button
              className="icon-button"
              aria-label="刷新资料"
              onClick={() => void reload()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <div className="page">
          {error && (
            <div className="alert" role="alert">
              {error}
              <button className="text-button" onClick={() => void reload()}>
                重试
              </button>
            </div>
          )}
          {message && (
            <div className="toast" role="status">
              <Check size={17} />
              {message}
            </div>
          )}
          <div className="page-title">
            <div>
              <div className="eyebrow">一歩ずつ、前へ。</div>
              <h1>{job ? job.company : active}</h1>
              <p>
                {job
                  ? job.role
                  : active === '求职平台'
                    ? '找到适合自己的求职入口。'
                  : active === '今日准备'
                    ? '从了解一家公司，到准备好下一场面试。'
                    : active === '公司与投递'
                      ? '一处整理机会、进展与下一步。'
                      : active === '我的履历'
                        ? '一份真实经历，为不同机会选择合适的表达。'
                        : active === '准备资料'
                          ? '每家公司，一份有依据的准备。'
                          : active === '面试练习'
                            ? '把每一道题，练成你能自然说出的回答。'
                    : active === '每日分析'
                      ? '保留判断依据，也记录准备的变化。'
                      : active === '管理后台'
                        ? '管理入口与账户策略用于接入权限与审计。'
                        : '让研究和准备，持续回到你的工作区。'}
              </p>
            </div>
            <div className="row">
              {active === '我的履历' ? (
                <button
                  disabled={!data}
                  className="primary"
                  onClick={() => setProfileEdit(true)}
                >
                  编辑履历
                </button>
              ) : active === '每日分析' ? (
                <button
                  className="primary"
                  disabled={busy || !data}
                  onClick={() => void request('每日分析')}
                >
                  <Sparkles size={17} />
                  请求今日分析
                </button>
              ) : active === '今日准备' && !!data?.questionSets.length ? (
                <button className="primary" onClick={() => go('面试练习')}>
                  <CalendarDays size={18} />
                  开始面试练习
                </button>
              ) : active === '公司与投递' || active === '今日准备' ? (
                <button
                  className="primary"
                  disabled={!data}
                  onClick={() => setJobEdit({})}
                >
                  <Plus size={18} />
                  添加职位
                </button>
              ) : null}
            </div>
          </div>
          {!data ? (
            <section className="panel">
              <Empty
                title={error ? '数据服务尚未连接' : '正在读取求职资料…'}
              >
                <p>资料当前来自当前工作区/租户，仅展示您授权范围内的信息。</p>
              </Empty>
            </section>
          ) : (
            <>
              <div hidden={active !== '面试练习'}>
                <InterviewPractice
                  data={data}
                  initialJobId={practiceJob}
                  onJobChange={setPracticeJob}
                  reload={reload}
                />
              </div>
              {active === '今日准备' && (
                <>
                  {data.jobs.length <= 3 &&
                  !openJobs.some((j) =>
                    ['已投递', '书类选考', '面试中'].includes(j.status),
                  ) ? (
                    <section className="progress-note">
                      <span className="progress-mark">
                        <Check size={20} />
                      </span>
                      <div>
                        <h2>
                          {data.jobs.length
                            ? `已整理 ${data.jobs.length} 个职位${data.materials.length ? `，准备了 ${data.materials.length} 份材料` : ''}。`
                            : '先找到一个想了解的职位。'}
                        </h2>
                        <p>
                          {data.questionSets.length
                            ? '今天，先练好一道面试题。每次回答都会保留下来。'
                            : data.jobs.length
                              ? '下一步，围绕这家公司的要求整理经历和准备材料。'
                              : '保存招聘来源，再一步步整理经历和准备材料。'}
                        </p>
                      </div>
                    </section>
                  ) : (
                    <div className="stats">
                      {[
                        ['关注职位', data.jobs.length, '全部保存的求职机会'],
                        [
                          '进行中的投递',
                          openJobs.filter((j) =>
                            ['已投递', '书类选考', '面试中'].includes(j.status),
                          ).length,
                          '等待回复或进入下一阶段',
                        ],
                        ['待准备面试', interviews.length, '把准备留在面试之前'],
                        [
                          '专属准备资料',
                          data.materials.length,
                          '按公司整理并保留版本',
                        ],
                      ].map(([title, count, sub]) => (
                        <div
                          key={title}
                          className={count === 0 ? 'is-zero' : undefined}
                        >
                          <span>{title}</span>
                          <strong>
                            {count}
                            <small>项</small>
                          </strong>
                          <p>{sub}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="dashboard-grid home-grid">
                    <div className="home-main">
                      <section className="panel">
                        <div className="section-head">
                          <h2>
                            <CalendarDays size={19} />
                            今天的下一步
                          </h2>
                          <span className="tag">
                            {due.length ? '今日到期 / 已逾期' : '按准备进度'}
                          </span>
                        </div>
                        {due.length ? (
                          due.map((j, i) => (
                            <button
                              className="task-row"
                              key={j.id}
                              onClick={() => {
                                go('公司与投递');
                                setSelected(j.id);
                              }}
                            >
                              <span className="step">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <span>
                                <b>{j.nextAction || '跟进投递进展'}</b>
                                <small>
                                  {j.company} · {day(j.nextDate)}{' '}
                                  {j.nextDate < data.today ? '· 已逾期' : ''}
                                </small>
                              </span>
                              <ChevronRight size={17} />
                            </button>
                          ))
                        ) : (
                          <>
                            {[
                              [
                                '01',
                                data.profile.summary
                                  ? '核对求职条件与日语能力'
                                  : '整理个人履历',
                                data.profile.summary
                                  ? '确认目标岗位、工作条件和当前日语水平。'
                                  : '补充工作经历、项目事实和求职条件。',
                                '我的履历',
                              ],
                              [
                                '02',
                                data.questionSets.length
                                  ? '练一题自我介绍'
                                  : data.jobs.length
                                    ? '整理公司准备资料'
                                    : '收集目标职位',
                                data.questionSets.length
                                  ? '先用自己的话回答，再交给 Codex 点评。'
                                  : '保留招聘链接、岗位要求和信息确认日期。',
                                data.questionSets.length
                                  ? '面试练习'
                                  : '公司与投递',
                              ],
                              [
                                '03',
                                pending.length
                                  ? '查看 Agent 待处理任务'
                                  : '整理每日分析',
                                '从匹配点和准备缺口中，确定下一步行动。',
                                pending.length ? 'Agent 协作' : '每日分析',
                              ],
                            ].map(([n, t, s, d]) => (
                              <button
                                className="task-row"
                                key={n}
                                onClick={() => go(d)}
                              >
                                <span className="step">{n}</span>
                                <span>
                                  <b>{t}</b>
                                  <small>{s}</small>
                                </span>
                                <ArrowUpRight size={18} />
                              </button>
                            ))}
                          </>
                        )}
                      </section>
                      <section className="panel">
                        <div className="section-head">
                          <h2>正在了解的公司</h2>
                          <button
                            className="text-button"
                            onClick={() => go('公司与投递')}
                          >
                            查看全部 <ArrowUpRight size={16} />
                          </button>
                        </div>
                        {data.jobs.length ? (
                          <div className="job-list">
                            {data.jobs.slice(0, 5).map((j) => (
                              <button
                                className="job-summary"
                                key={j.id}
                                onClick={() => {
                                  go('公司与投递');
                                  setSelected(j.id);
                                }}
                              >
                                <span className="company-avatar">
                                  {j.company.slice(0, 1)}
                                </span>
                                <span>
                                  <b>{j.company}</b>
                                  <small>{j.role}</small>
                                </span>
                                <Badge>{j.status}</Badge>
                                <ChevronRight size={17} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Empty title="下一份工作，从一条机会开始">
                            <p>添加招聘信息，或让 Codex 整理后导入。</p>
                          </Empty>
                        )}
                      </section>
                    </div>
                    <section className="analysis-card">
                      <Sparkles size={24} />
                      <div className="eyebrow">
                        DAILY BRIEF ·{' '}
                        {latest ? day(latest.date) : '等待第一份分析'}
                      </div>
                      <h2>
                        {latest ? (
                          latest.title
                        ) : (
                          <>
                            让每天的准备
                            <br />
                            有一个明确方向。
                          </>
                        )}
                      </h2>
                      <p>
                        {latest
                          ? latest.content.replace(/[#*]/g, '').slice(0, 110) +
                            '…'
                          : '结合投递进度、职位要求与准备缺口，整理当日分析和优先事项。'}
                      </p>
                      <div className="notice">
                        {latest ? (
                          <button
                            className="light-button"
                            onClick={() => setDoc(latest)}
                          >
                            阅读报告 <ArrowUpRight size={15} />
                          </button>
                        ) : (
                          <button
                            className="light-button"
                            disabled={busy}
                            onClick={() => void request('每日分析')}
                          >
                            交给 Codex 分析 <ArrowUpRight size={15} />
                          </button>
                        )}
                      </div>
                    </section>
                  </div>
                </>
              )}
              {active === '公司与投递' &&
                (job ? (
                  <>
                    <button
                      className="text-button back"
                      onClick={() => setSelected('')}
                    >
                      <ArrowLeft size={16} />
                      返回职位列表
                    </button>
                    <section className="panel">
                      <div className="section-head">
                        <h2>投递时间线</h2>
                        <div className="row">
                          <Badge>{job.status}</Badge>
                          <button
                            className="secondary"
                            onClick={() => setJobEdit(job)}
                          >
                            更新进展
                          </button>
                        </div>
                      </div>
                      <div className="timeline">
                        {job.history.map((h, i) => (
                          <div key={i}>
                            <span className="timeline-dot" />
                            <b>{h.status}</b>
                            <small>{day(h.at)}</small>
                          </div>
                        ))}
                      </div>
                      <div className="next-action">
                        <CalendarDays size={18} />
                        <span>
                          <b>{job.nextAction || '还没有设置下一步行动'}</b>
                          <small>
                            {job.nextDate
                              ? `${day(job.nextDate)}${job.nextDate < data.today ? ' · 已逾期' : ''}`
                              : '设置跟进日期，方便每天查看'}
                          </small>
                        </span>
                        <Badge>{job.priority}优先级</Badge>
                      </div>
                    </section>
                    <div className="detail-grid">
                      <section className="panel">
                        <div className="section-head">
                          <h2>职位与公司</h2>
                          {job.url && (
                            <a
                              className="text-button"
                              href={job.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              招聘原文 <ExternalLink size={15} />
                            </a>
                          )}
                        </div>
                        <dl className="facts">
                          {[
                            ['工作地点', job.location],
                            ['薪资范围', job.salary],
                            ['日语要求', job.japanese],
                            ['外国人招聘信息', job.foreigner],
                            ['在留资格支持', job.visa],
                            ['信息确认日期', day(job.sourceDate)],
                          ].map(([k, v]) => (
                            <div key={k}>
                              <dt>{k}</dt>
                              <dd>{v || '待确认'}</dd>
                            </div>
                          ))}
                        </dl>
                        {[
                          ['公司业务与特点', job.business],
                          ['岗位要求', job.requirements],
                          ['工作内容', job.description],
                          ['匹配点', job.matchNotes],
                          ['待确认事项', job.unknowns],
                          ['我的跟进记录', job.notes],
                        ].map(([k, v]) => (
                          <div className="text-section" key={k}>
                            <h3>{k}</h3>
                            <p className="prewrap">{v || '尚未补充'}</p>
                          </div>
                        ))}
                      </section>
                      <section className="panel">
                        <div className="section-head">
                          <h2>这家公司的准备资料</h2>
                        </div>
                        <button
                          className="secondary block-button"
                          onClick={() => {
                            setPracticeJob(job.id);
                            go('面试练习');
                          }}
                        >
                          <CalendarDays size={17} />
                          开始面试练习
                        </button>
                        <p>结合岗位特点与个人履历整理，完成后保存在这里。</p>
                        <button
                          className="primary block-button"
                          disabled={busy}
                          onClick={() => void request('公司准备', job.id)}
                        >
                          <Sparkles size={17} />
                          交给 Codex 准备
                        </button>
                        {pending.some((t) => t.jobId === job.id) && (
                          <div className="inline-note">
                            已加入待处理队列，等待 Codex 生成。
                          </div>
                        )}
                        {data.materials
                          .filter((m) => m.jobId === job.id)
                          .map((m) => (
                            <button
                              className="doc-card"
                              key={m.id}
                              onClick={() => setDoc(m)}
                            >
                              <FileText size={20} />
                              <span>
                                <b>{m.title}</b>
                                <small>
                                  {m.kind} · {day(m.createdAt)} · 待核对
                                </small>
                              </span>
                              <ChevronRight size={17} />
                            </button>
                          ))}
                        {!data.materials.some((m) => m.jobId === job.id) && (
                          <Empty title="尚无专属准备材料">
                            <p>
                              履歴書 · 職務経歴書
                              <br />
                              志望動機 · 面试准备 · 公司研究
                            </p>
                          </Empty>
                        )}
                      </section>
                    </div>
                  </>
                ) : (
                  <section className="panel">
                    <div className="toolbar">
                      <label className="search">
                        <Search size={17} />
                        <input
                          aria-label="搜索公司或职位"
                          placeholder="搜索公司、职位或技能…"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label="筛选投递状态"
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        {['全部', ...statuses].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                      <button
                        className="secondary"
                        onClick={() => {
                          setImportOpen(true);
                          setPreview(null);
                        }}
                      >
                        <Upload size={16} />
                        导入
                      </button>
                    </div>
                    {visible.length && data.jobs.length <= 3 ? (
                      <div className="opportunity-list">
                        {visible.map((j) => (
                          <OpportunityCard
                            key={j.id}
                            job={j}
                            materialCount={
                              data.materials.filter((m) => m.jobId === j.id)
                                .length
                            }
                            questionCount={
                              [...data.questionSets]
                                .filter((q) => q.jobId === j.id)
                                .sort((a, b) =>
                                  b.createdAt.localeCompare(a.createdAt),
                                )[0]?.questions.length || 0
                            }
                            onOpen={() => setSelected(j.id)}
                            onPractice={() => {
                              setPracticeJob(j.id);
                              go('面试练习');
                            }}
                            onEdit={() => setJobEdit(j)}
                          />
                        ))}
                      </div>
                    ) : visible.length ? (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>公司 / 职位</th>
                              <th>投递状态</th>
                              <th>日语要求</th>
                              <th>下一步</th>
                              <th>优先级</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visible.map((j) => (
                              <tr key={j.id}>
                                <td>
                                  <button
                                    className="table-link"
                                    onClick={() => setSelected(j.id)}
                                  >
                                    {j.company}
                                    <small>{j.role}</small>
                                  </button>
                                </td>
                                <td>
                                  <Badge>{j.status}</Badge>
                                </td>
                                <td>{j.japanese || '待确认'}</td>
                                <td>
                                  {j.nextAction || '待安排'}
                                  <small
                                    className={
                                      j.nextDate && j.nextDate < data.today
                                        ? 'overdue'
                                        : ''
                                    }
                                  >
                                    {j.nextDate ? day(j.nextDate) : ''}
                                  </small>
                                </td>
                                <td>
                                  {j.priority === '高' ? (
                                    <span className="priority">高</span>
                                  ) : (
                                    j.priority
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <Empty
                        title={
                          data.jobs.length
                            ? '没有符合条件的职位'
                            : '还没有保存职位'
                        }
                      >
                        <p>
                          {data.jobs.length
                            ? '调整搜索词或状态筛选。'
                            : '手动添加，或将 Agent 整理好的数据导入。'}
                        </p>
                        <button
                          className="text-button centered"
                          disabled={busy}
                          onClick={() => void request('职位研究')}
                        >
                          请求 Codex 收集职位 <ArrowUpRight size={16} />
                        </button>
                      </Empty>
                    )}
                  </section>
                ))}
              {active === '求职平台' && <JobPlatforms platforms={data.platforms || []} reload={reload} />}
              {active === '我的履历' && (
                <>
                  <div className="inline-note">
                    以真实经历为依据。日语水平、在留资格、技能年限及未确认的成果，请核对后再用于投递。
                  </div>
                  <ProfileOverview profile={data.profile} />
                  <p className="source-line">
                    资料来源：{data.profile.sourcePath || '手动整理'}
                    <br />
                    更新于 {day(data.profile.updatedAt)} · 版本{' '}
                    {data.profile.revision}
                  </p>
                </>
              )}
              {active === '准备资料' && (
                <section className="panel">
                  <div className="toolbar">
                    <select
                      aria-label="筛选准备资料类型"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {['全部', ...materialKinds].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <span className="small muted">
                      {data.materials.length &&
                      data.materials.every((m) => m.reviewStatus === '待核对')
                        ? `共 ${data.materials.length} 份 AI 草稿，使用前请核对事实与表达。`
                        : 'AI 文稿使用前需核对事实与表达。'}
                    </span>
                  </div>
                  {data.materials
                    .filter((m) => filter === '全部' || m.kind === filter)
                    .map((m) => (
                      <button
                        className="doc-card"
                        key={m.id}
                        onClick={() => setDoc(m)}
                      >
                        <FileText size={22} />
                        <span>
                          <b>{m.title}</b>
                          <small>
                            {data.jobs.find((j) => j.id === m.jobId)?.company} ·{' '}
                            {m.kind} · {day(m.createdAt)}
                          </small>
                        </span>
                        {!data.materials.every(
                          (item) => item.reviewStatus === '待核对',
                        ) && <Badge>{m.reviewStatus}</Badge>}
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  {!data.materials.filter(
                    (m) => filter === '全部' || m.kind === filter,
                  ).length && (
                    <Empty title="暂无准备资料">
                      <p>在公司详情中，把准备任务交给 Codex。</p>
                      <button
                        className="text-button centered"
                        onClick={() => go('公司与投递')}
                      >
                        前往公司与投递 <ArrowUpRight size={16} />
                      </button>
                    </Empty>
                  )}
                </section>
              )}
              {active === '每日分析' && (
                <section className="panel">
                  {data.reports.length === 1 && latest ? (
                    <article className="first-report">
                      <div className="eyebrow">
                        DAILY BRIEF · {day(latest.date)}
                      </div>
                      <h2>{latest.title}</h2>
                      <DocumentText
                        text={latest.content
                          .split(/\n(?=##? )/)
                          .slice(0, 2)
                          .join('\n')}
                      />
                      <button
                        className="primary"
                        onClick={() => setDoc(latest)}
                      >
                        阅读完整分析 <ArrowUpRight size={16} />
                      </button>
                    </article>
                  ) : (
                    data.reports
                      .slice()
                      .sort(
                        (a, b) =>
                          b.date.localeCompare(a.date) ||
                          b.createdAt.localeCompare(a.createdAt),
                      )
                      .map((r) => (
                        <button
                          className="report-row"
                          key={r.id}
                          onClick={() => setDoc(r)}
                        >
                          <div className="report-date">
                            <b>{r.date.slice(8)}</b>
                            <small>{r.date.slice(0, 7)}</small>
                          </div>
                          <span>
                            <b>{r.title}</b>
                            <p>
                              {r.content.replace(/[#*]/g, '').slice(0, 90)}…
                            </p>
                          </span>
                          <ArrowUpRight size={19} />
                        </button>
                      ))
                  )}
                  {!data.reports.length && (
                    <Empty title="还没有每日分析">
                      <p>请求分析后，由 Codex 读取最新进度并整理建议。</p>
                    </Empty>
                  )}
                </section>
              )}
              {active === 'Agent 协作' && (
                <>
                  <SkillArchive />
                  <div className="dashboard-grid">
                    <section className="panel">
                      <h2>
                        <Workflow size={20} />
                        收集 → 分析 → 写入
                      </h2>
                      <p>
                        Codex
                        研究招聘来源，结合个人履历整理内容，再导入这个工作区。网页不调用
                        AI，也不会自动发送申请。
                      </p>
                      <ol className="instructions">
                        <li>添加职位，或请求收集适合的机会。</li>
                        <li>在公司详情中提交准备任务。</li>
                        <li>把下面的指令交给 Codex 处理。</li>
                        <li>核对生成的材料，再自行投递。</li>
                      </ol>
                      <button
                        className="primary"
                        onClick={() =>
                          void action(
                            () => navigator.clipboard.writeText(promptText()),
                            '已复制 Codex 工作指令',
                          )
                        }
                      >
                        <Workflow size={17} />
                        复制给 Codex 的指令
                      </button>
                      <details>
                        <summary>查看指令</summary>
                        <p className="prewrap">{promptText()}</p>
                      </details>
                    </section>
                    <section className="panel">
                      <h2>资料导入与备份</h2>
                      <p>
                        导入 Agent 输出的 JSON
                        数据包。先预览条目数量，再写入本机数据库。
                      </p>
                      <div className="button-stack">
                        <button
                          className="secondary"
                          onClick={() => {
                            setImportOpen(true);
                            setPreview(null);
                          }}
                        >
                          <Upload size={17} />
                          导入 Agent 数据包
                        </button>
                        <button
                          className="secondary"
                          onClick={() =>
                            download(
                              'career-backup-' + data.today + '.json',
                              JSON.stringify(data, null, 2),
                              'application/json',
                            )
                          }
                        >
                          <Download size={17} />
                          导出完整资料备份
                        </button>
                      </div>
                      <p className="small">
                        备份包含私人履历与投递记录。完整备份用于留存；Agent
                        导入只接收研究、报告和新版本材料。
                      </p>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="section-head">
                      <h2>任务队列</h2>
                      <span className="tag">{pending.length} 项待处理</span>
                    </div>
                    {data.tasks.map((t) => (
                      <div className="queue-row" key={t.id}>
                        <span>
                          <b>{t.kind}</b>
                          <small>
                            {data.jobs.find((j) => j.id === t.jobId)?.company ||
                              '整个求职工作区'}{' '}
                            · {day(t.createdAt)}
                          </small>
                        </span>
                        <Badge>{t.status}</Badge>
                      </div>
                    ))}
                    {!data.tasks.length && (
                      <Empty title="没有待处理任务">
                        <p>在公司详情中请求准备，或请求一份每日分析。</p>
                      </Empty>
                    )}
                  </section>
                </>
              )}
              {active === '管理后台' && (
                <section className="panel">
                  <h2>
                    <Shield size={19} />
                    管理后台
                  </h2>
                  <p>
                    后台判断依据不是邮箱，而是 UID 与管理员声明（admin
                    claim）。默认不需要登录时返回本机演示上下文。
                  </p>
                  <div className="form-grid">
                    <label className="field">
                      <span>当前 UID</span>
                      <input
                        value={auth?.uid || 'local'}
                        readOnly
                        aria-readonly="true"
                      />
                    </label>
                    <label className="field">
                      <span>身份模式</span>
                      <input
                        value={auth?.mode || 'off'}
                        readOnly
                        aria-readonly="true"
                      />
                    </label>
                    <label className="field">
                      <span>是否管理员</span>
                      <input
                        value={auth?.admin ? '是' : '否'}
                        readOnly
                        aria-readonly="true"
                      />
                    </label>
                  </div>
                  <p>
                    管理员账户建议在服务端维护：
                    <br />
                    1）Firebase 自定义 claim 中写
                    <code>admin:true</code>；
                    <br />
                    2）或在环境变量中维护 UID 白名单：
                    <code>CAREER_ADMIN_UIDS</code>。
                  </p>

                  <div className="form-grid">
                    <label className="field">
                      <span>MCP Token 名称</span>
                      <input
                        value={tokenName}
                        onChange={(e) => setTokenName(e.target.value)}
                        aria-label="MCP Token 名称"
                      />
                    </label>
                    <label className="field">
                      <span>有效天数</span>
                      <input
                        type="number"
                        min="1"
                        max="365"
                        value={tokenDays}
                        onChange={(e) => setTokenDays(e.target.value)}
                        aria-label="Token 有效天数"
                      />
                    </label>
                    <div className="button-stack">
                      <button className="secondary" onClick={() => void createMcpToken()}>
                        生成 MCP Token
                      </button>
                    </div>
                  </div>

                  <section className="panel">
                    <h3>MCP Token 管理</h3>
                    {!mcpTokens.length ? (
                      <Empty title="暂无 MCP Token">
                        <p>生成后会显示在这里，包含可撤销的 id 与有效期。</p>
                      </Empty>
                    ) : (
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>名称</th>
                              <th>Owner</th>
                              <th>Scope</th>
                              <th>失效时间</th>
                              <th>最近使用</th>
                              <th>状态</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {mcpTokens.map((item) => (
                              <tr key={item.id}>
                                <td>
                                  {item.name}
                                  <small>{item.id.slice(0, 8)}</small>
                                </td>
                                <td>{item.ownerUid}</td>
                                <td>{item.scopes.join(' / ')}</td>
                                <td>{item.expiresAt || '长期有效'}</td>
                                <td>{item.lastUsedAt || '未使用'}</td>
                                <td>{item.revoked ? '已撤销' : '有效'}</td>
                                <td>
                                  <button
                                    className="text-button"
                                    disabled={item.revoked}
                                    onClick={() => void revokeMcpToken(item.id)}
                                  >
                                    撤销
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </section>
              )}
            </>
          )}
        </div>
      </main>
      {jobEdit && (
        <Modal
          title={jobEdit.id ? '编辑职位与投递进展' : '添加目标职位'}
          onClose={() => setJobEdit(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = Object.fromEntries(new FormData(e.currentTarget));
              const ok = await action(
                () => api('jobs', { ...jobEdit, ...form }),
                '职位与投递进展已保存',
              );
              if (ok) setJobEdit(null);
            }}
          >
            <div className="form-grid">
              {researchFields.map(([k, label]) => (
                <Field
                  key={k}
                  name={k}
                  label={label}
                  value={String(jobEdit[k as keyof Job] || '')}
                  required={k === 'company' || k === 'role'}
                  type={
                    k === 'sourceDate' ? 'date' : k === 'url' ? 'url' : 'text'
                  }
                  large={[
                    'business',
                    'requirements',
                    'description',
                    'matchNotes',
                    'unknowns',
                  ].includes(k)}
                />
              ))}
              <label className="field">
                <span>投递状态</span>
                <select name="status" defaultValue={jobEdit.status || '关注中'}>
                  {statuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>优先级</span>
                <select
                  name="priority"
                  defaultValue={jobEdit.priority || '普通'}
                >
                  {['高', '普通', '低'].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <Field
                name="nextAction"
                label="下一步行动"
                value={jobEdit.nextAction}
              />
              <Field
                name="nextDate"
                label="跟进 / 面试日期"
                value={jobEdit.nextDate}
                type="date"
              />
              <Field
                name="notes"
                label="我的跟进记录"
                value={jobEdit.notes}
                large
              />
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setJobEdit(null)}
              >
                取消
              </button>
              <button className="primary" disabled={busy}>
                {busy ? '保存中…' : '保存职位'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {profileEdit && data && (
        <Modal title="编辑个人履历" onClose={() => setProfileEdit(false)}>
          <ProfileForm
            profile={data.profile}
            busy={busy}
            error={error}
            save={async (value) => {
              const ok = await action(
                () => api('profile', value),
                '个人履历已保存',
              );
              if (ok) setProfileEdit(false);
            }}
          />
        </Modal>
      )}
      {doc && (
        <Modal title={doc.title} onClose={() => setDoc(null)}>
          <div className="document-meta">
            <Badge>{'kind' in doc ? doc.kind : '每日分析'}</Badge>
            <span>{day(doc.createdAt)} · AI 草稿，使用前请核对</span>
            <button
              className="secondary"
              onClick={() =>
                download(
                  doc.title.replaceAll('/', '-') + '.md',
                  `# ${doc.title}\n\n${doc.content}\n\n## 依据与待确认事项\n${doc.sourceNotes}`,
                )
              }
            >
              <Download size={16} />
              下载 Markdown
            </button>
          </div>
          {'jobId' in doc &&
            data &&
            (doc.profileRevision !== data.profile.revision ||
              doc.jobRevision !==
                data.jobs.find((j) => j.id === doc.jobId)?.revision) && (
              <div className="inline-note">
                此文稿生成后，个人履历或职位信息有更新，请核对是否需要重新准备。
              </div>
            )}
          <article className="document-body">
            <DocumentText text={doc.content} />
          </article>
          <div className="source-box">
            <h3>依据与待确认事项</h3>
            <p className="prewrap">{doc.sourceNotes}</p>
          </div>
        </Modal>
      )}
      {importOpen && (
        <Modal title="导入 Agent 数据包" onClose={() => setImportOpen(false)}>
          <p>
            支持职位研究、公司准备资料和每日分析。导入不会修改你的投递状态。
          </p>
          <label className="file-input">
            选择 JSON 文件
            <input
              type="file"
              accept="application/json,.json"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (f.size > 3000000) {
                    setError('文件不能超过 3 MB');
                    return;
                  }
                  setImportText(await f.text());
                  setPreview(null);
                }
              }}
            />
          </label>
          <textarea
            className="json-input"
            aria-label="Agent JSON 数据包"
            placeholder='{"schemaVersion":1,"jobs":[],"materials":[],"reports":[]}'
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setPreview(null);
            }}
          />
          {preview && (
            <div className="inline-note">
              检查通过：{preview.jobs} 条职位、{preview.materials} 份准备资料、
              {preview.reports} 份分析报告，{preview.questionSets || 0}{' '}
              组面试题，{preview.reviews || 0} 份回答点评。
            </div>
          )}
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button
              className="secondary"
              disabled={busy || !importText}
              onClick={() =>
                void action(async () => {
                  setPreview(
                    await api<Record<string, number>>(
                      'import/preview',
                      JSON.parse(importText),
                    ),
                  );
                }, '数据包检查通过')
              }
            >
              检查并预览
            </button>
            <button
              className="primary"
              disabled={!preview || busy}
              onClick={async () => {
                if (
                  await action(
                    () => api('import', JSON.parse(importText)),
                    'Agent 数据已写入本机',
                  )
                ) {
                  setImportOpen(false);
                  setImportText('');
                  setPreview(null);
                }
              }}
            >
              确认导入
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function ProfileForm({
  profile,
  busy,
  error,
  save,
}: {
  profile: State['profile'];
  busy: boolean;
  error: string;
  save: (value: unknown) => Promise<void>;
}) {
  const initial = useRef(profile);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save({
          ...initial.current,
          ...Object.fromEntries(new FormData(e.currentTarget)),
        });
      }}
    >
      <div className="form-grid">
        {profileFields.map(([k, label]) => (
          <Field
            key={k}
            name={k}
            label={label}
            value={String(initial.current[k as keyof typeof profile] || '')}
            large
          />
        ))}
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="modal-actions">
        <button className="primary" disabled={busy}>
          保存个人履历
        </button>
      </div>
    </form>
  );
}

function DocumentText({ text }: { text: string }) {
  return (
    <>
      {text
        .replace(/^(#{1,4} .+)$/gm, '\n$1\n')
        .trim()
        .split(/\n\s*\n/)
        .map((block, i) => {
          const heading = block.match(/^(#{1,4}) (.+)$/);
          if (heading)
            return heading[1].length === 1 ? (
              <h2 key={i}>{heading[2]}</h2>
            ) : (
              <h3 key={i}>{heading[2]}</h3>
            );
          return <p key={i}>{block}</p>;
        })}
    </>
  );
}
