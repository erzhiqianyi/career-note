'use client';
import { LanguageSwitcher, useLocale } from '@/components/locale-provider';

import { RecordList, RecordRow } from '@/components/record-list';
import AgentConnection from '@/components/agent-connection';
import AgentSetup from '@/components/agent-setup';
import {
  findMcpClient,
  mcpClientHash,
  mcpClientPage,
  mcpClients,
  mcpSetupHash,
  mcpSetupPage,
} from '@/lib/mcp-clients';
import ScheduledSync from '@/components/scheduled-sync';
import CareerWelcome from '@/components/career-welcome';
import InterviewPractice from '@/components/interview-practice';
import ResumeManager from '@/components/resume-manager';
import PersonalizedResumes from '@/components/personalized-resumes';
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
  CalendarClock,
  CalendarDays,
  Blocks,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  LayoutDashboard,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
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
  type AgentActivity,
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
  { label: '个性化简历', icon: FileText },
  { label: '准备资料', icon: FileText },
  { label: '面试练习', icon: CalendarDays },
  { label: '每日分析', icon: Sparkles },
  { label: 'Agent 协作', icon: Workflow },
];
const subPages: Record<string, { parent: string; hash: string }> = {
  技能库: { parent: 'Agent 协作', hash: '#skills' },
  定时任务: { parent: 'Agent 协作', hash: '#schedule' },
  [mcpSetupPage]: { parent: 'Agent 协作', hash: mcpSetupHash },
  ...Object.fromEntries(
    mcpClients.map((c) => [
      mcpClientPage(c.id),
      { parent: 'Agent 协作', hash: mcpClientHash(c.id) },
    ]),
  ),
};
const sidebarKey = 'career-note.sidebar-collapsed';
const hashes: Record<string, string> = {
  '#interview': '面试练习',
  '#platforms': '求职平台',
  ...Object.fromEntries(
    Object.entries(subPages).map(([label, page]) => [page.hash, label]),
  ),
};
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
  return value ? value.slice(0, 10).replaceAll('-', '.') : '—';
}
function Badge({ children }: { children: ReactNode }) {
  const { t: tr } = useLocale();
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
      {typeof children === 'string' ? tr(children) : children}
    </span>
  );
}
function Empty({ title, children }: { title: string; children?: ReactNode }) {
  const { t: tr } = useLocale();
  return (
    <div className="empty">
      <BriefcaseBusiness size={28} />
      <h3>{tr(title)}</h3>
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
  const { t: tr } = useLocale();
  return (
    <label className={large ? 'field wide' : 'field'}>
      <span>
        {tr(label)}
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
  const { t: tr } = useLocale();
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
        <h2>{tr(title)}</h2>
        <button
          className="icon-button"
          aria-label={tr('关闭')}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Home() {
  const { t: tr } = useLocale();
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
  const [navCollapsed, setNavCollapsed] = useState(false);
  useEffect(() => {
    try {
      setNavCollapsed(localStorage.getItem(sidebarKey) === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const toggleNav = () => {
    setNavCollapsed((value) => {
      try {
        localStorage.setItem(sidebarKey, value ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !value;
    });
  };
  useEffect(() => {
    const navigate = () => {
      const target = hashes[window.location.hash];
      if (target) setActive(target);
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
  const [agentTrail, setAgentTrail] = useState<{ tokenId: string; rows: AgentActivity[] } | null>(null);
  const visibleNav = useMemo(
    () => nav,
    [auth],
  );
  const activePage = subPages[active]?.parent ?? active;
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
  const invalidateSession = useCallback(() => {
    sessionEpoch.current++;
  }, []);
  useEffect(() => {
    let disposed = false;
    let removeAuth = () => {};
    void configureCareerAuth()
      .then((config) => {
        if (disposed) return;
        setAuthConfig(config);
        removeAuth = listenCareerAuthChanged(
          (user, token) => {
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
            void refreshAuth().then((ok) => {
              if (ok && !disposed) void reload();
            });
          },
          (error) => {
            if (!disposed) setError(error.message);
          },
        );
      })
      .catch((error) => {
        if (!disposed) setError(error.message);
      });
    return () => {
      disposed = true;
      invalidateSession();
      removeAuth();
    };
  }, [refreshAuth, reload, invalidateSession]);
  useEffect(() => {
    if (!auth) return;
    const timer = setInterval(() => {
      void refreshAuth().then((ok) => {
        if (ok) void reload();
      });
    }, 30000);
    return () => clearInterval(timer);
  }, [auth, refreshAuth, reload]);
  const refreshMcpTokens = useCallback(async () => {
    const epoch = sessionEpoch.current;
    try {
      const response = await api<{ tokens: MpcTokenRecord[] }>('mcp/tokens');
      if (epoch !== sessionEpoch.current) return;
      setMcpTokens(response.tokens || []);
    } catch {
      if (epoch !== sessionEpoch.current) return;
      setMcpTokens([]);
    }
  }, []);
  useEffect(() => {
    if (activePage === 'Agent 协作' && auth) {
      void refreshMcpTokens();
    }
  }, [activePage, auth, refreshMcpTokens]);
  useEffect(() => {
    const page = subPages[active]?.parent ?? active;
    if (!visibleNav.some((item) => item.label === page)) {
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
  async function revokeMcpToken(id: string) {
    await action(() => api('mcp/tokens/revoke', { id }), '已撤销 MCP token');
    await refreshMcpTokens();
    if (agentTrail?.tokenId === id) await showAgentTrail(id);
  }
  async function showAgentTrail(tokenId: string) {
    if (agentTrail?.tokenId === tokenId) { setAgentTrail(null); return; }
    try {
      const response = await api<{ activity: AgentActivity[] }>('mcp/activity?tokenId=' + encodeURIComponent(tokenId) + '&limit=50');
      setAgentTrail({ tokenId, rows: response.activity });
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取操作记录失败');
    }
  }
  function describeActivity(row: AgentActivity) {
    const names: Record<string, string> = { authorized: '完成授权', refreshed: '刷新令牌', revoked: '撤销授权', 'tool:state': '读取工作区', 'tool:resume': '写入履历条目', 'tool:personalized-resumes': '写入个性化简历', 'tool:import/preview': '预览导入', 'tool:import': '导入数据', 'tool:tasks': '排队任务', 'tool:profile': '更新履历摘要' };
    const base = names[row.event] || (row.event.startsWith('tool:resume/history') ? '读取履历历史' : row.event.startsWith('tool:personalized-resumes') ? '读取个性化简历' : row.event);
    const requested = row.detail && typeof row.detail.requested === 'object' && row.detail.requested ? Object.entries(row.detail.requested as Record<string, number>).map(([k, v]) => `${k} ${v}`).join('，') : '';
    const kind = row.detail && typeof row.detail.kind === 'string' ? row.detail.kind : '';
    return tr(base) + (requested ? `（${requested}）` : kind ? `（${kind}）` : '') + (row.ok ? '' : ' · ' + tr('失败'));
  }
  function go(label: string) {
    window.scrollTo(0, 0);
    const page = subPages[label]?.parent ?? label;
    if (visibleNav.some((item) => item.label === page)) {
      setActive(label);
      window.history.replaceState(
        null,
        '',
        label === '求职平台'
          ? '#platforms'
          : label === '面试练习'
            ? '#interview'
            : (subPages[label]?.hash ?? window.location.pathname),
      );
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
  if (!authConfig || (authConfig.mode !== 'off' && !loggedIn)) {
    return (
      <CareerWelcome
        ready={!!authConfig}
        configured={!!getCareerAuth()}
        busy={busy}
        error={error}
        userEmail={userEmail}
        onLogin={() => void login()}
        onLogout={() => void logout()}
      />
    );
  }
  return (
    <div className={navCollapsed ? 'shell nav-collapsed' : 'shell'}>
      <aside className="sidebar">
        <div className="brand">
          <span>{tr('就')}</span>
          <div>
            {tr('就职手帖')}
            <small>CAREER NOTE / TOKYO</small>
          </div>
        </div>
        <nav aria-label={tr('工作区导航')}>
          {visibleNav.map(({ label, icon: Icon }) => (
            <button
              key={label}
              aria-current={activePage === label ? 'page' : undefined}
              className={activePage === label ? 'active' : ''}
              title={navCollapsed ? tr(label) : undefined}
              aria-label={navCollapsed ? tr(label) : undefined}
              onClick={() => go(label)}
            >
              <Icon size={19} />
              <span className="nav-label">{tr(label)}</span>
              {label === 'Agent 协作' && pending.length > 0 && (
                <span className="nav-count">{pending.length}</span>
              )}
            </button>
          ))}
        </nav>
        <button
          className="sidebar-toggle"
          aria-label={navCollapsed ? tr('展开导航栏') : tr('收起导航栏')}
          title={navCollapsed ? tr('展开导航栏') : tr('收起导航栏')}
          aria-expanded={!navCollapsed}
          onClick={toggleNav}
        >
          {navCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          <span className="nav-label">{tr('收起导航栏')}</span>
        </button>
      </aside>
      <nav className="mobile-nav" aria-label={tr('手机导航')}>
        {[
          { label: '今日准备', short: '今日', icon: LayoutDashboard },
          { label: '公司与投递', short: '公司', icon: BriefcaseBusiness },
          { label: '面试练习', short: '面试', icon: CalendarDays },
          { label: '我的履历', short: '履历', icon: UserRound },
        ].map(({ label, short, icon: Icon }) => (
          <button
            key={label}
            className={active === label ? 'active' : ''}
            aria-label={tr(label)}
            aria-current={active === label ? 'page' : undefined}
            onClick={() => go(label)}
          >
            <Icon size={21} />
            <span>{tr(short)}</span>
          </button>
        ))}
        <button
          className={
            [
              '求职平台',
              '准备资料',
              '每日分析',
              'Agent 协作',
              '管理后台',
            ].includes(activePage) || moreOpen
              ? 'active'
              : ''
          }
          aria-label={tr('更多页面')}
          aria-haspopup="dialog"
          aria-expanded={moreOpen}
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={22} />
          <span>{tr('更多')}</span>
        </button>
      </nav>
      {moreOpen && (
        <Modal title={tr('更多页面')} onClose={() => setMoreOpen(false)}>
          <div className="more-pages">
            {visibleNav
              .filter((item) =>
                [
                  '求职平台',
                  '准备资料',
                  '每日分析',
                  'Agent 协作',
                  '管理后台',
                ].includes(item.label),
              )
              .map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  aria-current={activePage === label ? 'page' : undefined}
                  onClick={() => go(label)}
                >
                  <Icon size={21} />
                  <span>{tr(label)}</span>
                  <ChevronRight size={18} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      <main>
        <header>
          <div className="header-nav">
            {(subPages[active] || (active === '公司与投递' && job)) && (
              <button
                className="icon-button header-back"
                aria-label={tr('返回 {0}', [
                  tr(subPages[active]?.parent ?? active),
                ])}
                onClick={() =>
                  subPages[active]
                    ? go(subPages[active].parent)
                    : setSelected('')
                }
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <span className="breadcrumb">
              {tr(activePage)}
              {(subPages[active] || (active === '公司与投递' && job)) && (
                <span className="muted">
                  / {job ? job.company : tr(findMcpClient(active)?.name ?? active)}
                  {job?.role ? ' · ' + job.role : ''}
                </span>
              )}
            </span>
          </div>
          <div className="row">
            <LanguageSwitcher />
            <span className="location">
              {tr('日本 ·')}
              {data ? day(data.today) : tr('日本求职')}
            </span>
            {loggedIn && (
              <span className="location">
                {userName || userEmail || tr('已登录')}
              </span>
            )}
            {!getCareerAuth() ? (
              <span className="muted">
                {tr('本机模式 · Google 登录未启用')}
              </span>
            ) : loggedIn ? (
              <button
                className="text-button"
                onClick={() => void logout()}
                disabled={busy}
              >
                {tr('退出')}
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => void login()}
                disabled={busy}
              >
                {tr('Google 登录')}
              </button>
            )}
            <button
              className="icon-button"
              aria-label={tr('刷新资料')}
              onClick={() => void reload()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <div className="page">
          {error && (
            <div className="alert" role="alert">
              {tr(error)}
              <button className="text-button" onClick={() => void reload()}>
                {tr('重试')}
              </button>
            </div>
          )}
          {message && (
            <div className="toast" role="status">
              <Check size={17} />
              {tr(message)}
            </div>
          )}
          {(() => {
            const action =
              active === '每日分析' ? (
                <button
                  className="primary"
                  disabled={busy || !data}
                  onClick={() => void request('每日分析')}
                >
                  <Sparkles size={17} />
                  {tr('请求今日分析')}
                </button>
              ) : active === '今日准备' && !!data?.questionSets.length ? (
                <button className="primary" onClick={() => go('面试练习')}>
                  <CalendarDays size={18} />
                  {tr('开始面试练习')}
                </button>
              ) : active === '公司与投递' || active === '今日准备' ? (
                <button
                  className="primary"
                  disabled={!data}
                  onClick={() => setJobEdit({})}
                >
                  <Plus size={18} />
                  {tr('添加职位')}
                </button>
              ) : null;
            return action ? <div className="page-actions">{action}</div> : null;
          })()}
          {!data ? (
            <section className="panel">
              <Empty
                title={error ? tr('数据服务尚未连接') : tr('正在读取求职资料…')}
              >
                <p>
                  {tr(
                    '资料当前来自当前工作区/租户，仅展示您授权范围内的信息。',
                  )}
                </p>
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
                            ? tr('已整理 {0} 个职位{1}。', [
                                data.jobs.length,
                                data.materials.length
                                  ? tr('，准备了 {0} 份材料', [
                                      data.materials.length,
                                    ])
                                  : '',
                              ])
                            : tr('先找到一个想了解的职位。')}
                        </h2>
                        <p>
                          {data.questionSets.length
                            ? tr(
                                '今天，先练好一道面试题。每次回答都会保留下来。',
                              )
                            : data.jobs.length
                              ? tr(
                                  '下一步，围绕这家公司的要求整理经历和准备材料。',
                                )
                              : tr(
                                  '保存招聘来源，再一步步整理经历和准备材料。',
                                )}
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
                          <span>{tr(String(title))}</span>
                          <strong>
                            {count}
                            <small>{tr('项')}</small>
                          </strong>
                          <p>{tr(String(sub))}</p>
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
                            {tr('今天的下一步')}
                          </h2>
                          <span className="tag">
                            {due.length
                              ? tr('今日到期 / 已逾期')
                              : tr('按准备进度')}
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
                                <b>{j.nextAction || tr('跟进投递进展')}</b>
                                <small>
                                  {j.company} · {day(j.nextDate)}{' '}
                                  {j.nextDate < data.today
                                    ? tr('· 已逾期')
                                    : ''}
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
                                  <b>{tr(t)}</b>
                                  <small>{tr(s)}</small>
                                </span>
                                <ArrowUpRight size={18} />
                              </button>
                            ))}
                          </>
                        )}
                      </section>
                      <section className="panel">
                        <div className="section-head">
                          <h2>{tr('正在了解的公司')}</h2>
                          <button
                            className="text-button"
                            onClick={() => go('公司与投递')}
                          >
                            {tr('查看全部')}
                            <ArrowUpRight size={16} />
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
                          <Empty title={tr('下一份工作，从一条机会开始')}>
                            <p>{tr('添加招聘信息，或让 Codex 整理后导入。')}</p>
                          </Empty>
                        )}
                      </section>
                    </div>
                    <section className="analysis-card">
                      <Sparkles size={24} />
                      <div className="eyebrow">
                        DAILY BRIEF ·{' '}
                        {latest ? day(latest.date) : tr('等待第一份分析')}
                      </div>
                      <h2>
                        {latest ? (
                          latest.title
                        ) : (
                          <>
                            {tr('让每天的准备')}
                            <br />
                            {tr('有一个明确方向。')}
                          </>
                        )}
                      </h2>
                      <p>
                        {latest
                          ? latest.content.replace(/[#*]/g, '').slice(0, 110) +
                            '…'
                          : tr(
                              '结合投递进度、职位要求与准备缺口，整理当日分析和优先事项。',
                            )}
                      </p>
                      <div className="notice">
                        {latest ? (
                          <button
                            className="light-button"
                            onClick={() => setDoc(latest)}
                          >
                            {tr('阅读报告')}
                            <ArrowUpRight size={15} />
                          </button>
                        ) : (
                          <button
                            className="light-button"
                            disabled={busy}
                            onClick={() => void request('每日分析')}
                          >
                            {tr('交给 Codex 分析')}
                            <ArrowUpRight size={15} />
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
                    <section className="panel">
                      <div className="section-head">
                        <h2>{tr('投递时间线')}</h2>
                        <div className="row">
                          <Badge>{job.status}</Badge>
                          <button
                            className="secondary"
                            onClick={() => setJobEdit(job)}
                          >
                            {tr('更新进展')}
                          </button>
                        </div>
                      </div>
                      <div className="timeline">
                        {job.history.map((h, i) => (
                          <div key={i}>
                            <span className="timeline-dot" />
                            <b>{tr(h.status)}</b>
                            <small>{day(h.at)}</small>
                          </div>
                        ))}
                      </div>
                      <div className="next-action">
                        <CalendarDays size={18} />
                        <span>
                          <b>{job.nextAction || tr('还没有设置下一步行动')}</b>
                          <small>
                            {job.nextDate
                              ? `${day(job.nextDate)}${job.nextDate < data.today ? ' ' + tr('· 已逾期') : ''}`
                              : tr('设置跟进日期，方便每天查看')}
                          </small>
                        </span>
                        <Badge>
                          {tr(job.priority)}
                          {tr('优先级')}
                        </Badge>
                      </div>
                    </section>
                    <div className="detail-grid">
                      <section className="panel">
                        <div className="section-head">
                          <h2>{tr('职位与公司')}</h2>
                          {job.url && (
                            <a
                              className="text-button"
                              href={job.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {tr('招聘原文')}
                              <ExternalLink size={15} />
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
                              <dt>{tr(k)}</dt>
                              <dd>{v || tr('待确认')}</dd>
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
                            <h3>{tr(k)}</h3>
                            <p className="prewrap">{v || tr('尚未补充')}</p>
                          </div>
                        ))}
                      </section>
                      <section className="panel">
                        <div className="section-head">
                          <h2>{tr('这家公司的准备资料')}</h2>
                        </div>
                        <button
                          className="secondary block-button"
                          onClick={() => {
                            setPracticeJob(job.id);
                            go('面试练习');
                          }}
                        >
                          <CalendarDays size={17} />
                          {tr('开始面试练习')}
                        </button>
                        <p>
                          {tr('结合岗位特点与个人履历整理，完成后保存在这里。')}
                        </p>
                        <button
                          className="primary block-button"
                          disabled={busy}
                          onClick={() => void request('公司准备', job.id)}
                        >
                          <Sparkles size={17} />
                          {tr('交给 Codex 准备')}
                        </button>
                        {pending.some((t) => t.jobId === job.id) && (
                          <div className="inline-note">
                            {tr('已加入待处理队列，等待 Codex 生成。')}
                          </div>
                        )}
                        {data.materials
                          .filter((m) => m.jobId === job.id)
                          .map((m) => (
                            <button
                              className="doc-card record-row"
                              key={m.id}
                              onClick={() => setDoc(m)}
                            >
                              <FileText size={20} />
                              <span>
                                <b>{m.title}</b>
                                <small>
                                  {tr(m.kind)} · {day(m.createdAt)}
                                  {tr('· 待核对')}
                                </small>
                              </span>
                              <ChevronRight size={17} />
                            </button>
                          ))}
                        {!data.materials.some((m) => m.jobId === job.id) && (
                          <Empty title={tr('尚无专属准备材料')}>
                            <p>
                              {tr('履歴書 · 職務経歴書')}
                              <br />
                              {tr('志望動機 · 面试准备 · 公司研究')}
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
                          aria-label={tr('搜索公司或职位')}
                          placeholder={tr('搜索公司、职位或技能…')}
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                      <select
                        aria-label={tr('筛选投递状态')}
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                      >
                        {['全部', ...statuses].map((s) => (
                          <option key={s} value={s}>
                            {tr(s)}
                          </option>
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
                        {tr('导入')}
                      </button>
                    </div>
                    {visible.length ? (
                      <div className="opportunity-list record-list" role="list" aria-label={tr('公司与投递')}>
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
                    ) : (
                      <Empty
                        title={
                          data.jobs.length
                            ? tr('没有符合条件的职位')
                            : tr('还没有保存职位')
                        }
                      >
                        <p>
                          {data.jobs.length
                            ? tr('调整搜索词或状态筛选。')
                            : tr('手动添加，或将 Agent 整理好的数据导入。')}
                        </p>
                        <button
                          className="text-button centered"
                          disabled={busy}
                          onClick={() => void request('职位研究')}
                        >
                          {tr('请求 Codex 收集职位')}
                          <ArrowUpRight size={16} />
                        </button>
                      </Empty>
                    )}
                  </section>
                ))}
              {active === '求职平台' && (
                <JobPlatforms
                  platforms={data.platforms || []}
                  reload={reload}
                />
              )}
              {active === '我的履历' && (
                <ResumeManager
                  entries={data.resume || []}
                  profile={data.profile}
                  reload={reload}
                />
              )}
              {active === '个性化简历' && <PersonalizedResumes />}
              {active === '准备资料' && (
                <section className="panel">
                  <div className="toolbar">
                    <select
                      aria-label={tr('筛选准备资料类型')}
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      {['全部', ...materialKinds].map((s) => (
                        <option key={s} value={s}>
                          {tr(s)}
                        </option>
                      ))}
                    </select>
                    <span className="small muted">
                      {data.materials.length &&
                      data.materials.every((m) => m.reviewStatus === '待核对')
                        ? tr('共 {0} 份 AI 草稿，使用前请核对事实与表达。', [
                            data.materials.length,
                          ])
                        : tr('AI 文稿使用前需核对事实与表达。')}
                    </span>
                  </div>
                  {data.materials
                    .filter((m) => filter === '全部' || m.kind === filter)
                    .map((m) => (
                      <button
                        className="doc-card record-row"
                        key={m.id}
                        onClick={() => setDoc(m)}
                      >
                        <FileText size={22} />
                        <span>
                          <b>{m.title}</b>
                          <small>
                            {data.jobs.find((j) => j.id === m.jobId)?.company} ·{' '}
                            {tr(m.kind)} · {day(m.createdAt)}
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
                    <Empty title={tr('暂无准备资料')}>
                      <p>{tr('在公司详情中，把准备任务交给 Codex。')}</p>
                      <button
                        className="text-button centered"
                        onClick={() => go('公司与投递')}
                      >
                        {tr('前往公司与投递')}
                        <ArrowUpRight size={16} />
                      </button>
                    </Empty>
                  )}
                </section>
              )}
              {active === '每日分析' && (
                <section className="panel">
                  {
                    data.reports
                      .slice()
                      .sort(
                        (a, b) =>
                          b.date.localeCompare(a.date) ||
                          b.createdAt.localeCompare(a.createdAt),
                      )
                      .map((r) => (
                        <button
                          className="report-row record-row"
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
                  }
                  {!data.reports.length && (
                    <Empty title={tr('还没有每日分析')}>
                      <p>
                        {tr('请求分析后，由 Codex 读取最新进度并整理建议。')}
                      </p>
                    </Empty>
                  )}
                </section>
              )}
              {active === 'Agent 协作' && (
                <>
                  <AgentConnection onAdd={() => go(mcpSetupPage)} />
                  <div className="agent-entries">
                    <button className="agent-entry" onClick={() => go('技能库')}>
                      <Blocks size={22} />
                      <span>
                        <b>{tr('技能库')}</b>
                        <small>
                          {tr('浏览并安装求职技能，把指令交给助手执行。')}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                    <button className="agent-entry" onClick={() => go('定时任务')}>
                      <CalendarClock size={22} />
                      <span>
                        <b>{tr('定时任务')}</b>
                        <small>
                          {tr('配置来源与频率，生成定时收集的任务指令。')}
                        </small>
                      </span>
                      <ChevronRight size={18} />
                    </button>
                  </div>
                  <section className="panel agent-access">
                    <div className="section-head">
                      <h2>
                        <Shield size={19} />
                        {tr('已授权的 AI 助手')}
                      </h2>
                      <span className="tag">
                        {mcpTokens.filter((item) => !item.revoked).length}
                        {tr('个有效')}
                      </span>
                    </div>
                    <p>{tr('助手在浏览器里完成登录与同意后才会出现在这里。每个授权只能访问你的工作区，可随时撤销。')}</p>
                    {auth?.mode !== 'off' && userEmail && (
                      <p className="small">{tr('当前账号：{0}。授权页登录的是哪个 Google 账号，授权就归哪个账号；用其他账号授权的助手不会显示在这里。', [userEmail])}</p>
                    )}
                    {(() => {
                      const active = mcpTokens.filter((item) => !item.revoked && !item.expired);
                      const archived = mcpTokens.filter((item) => item.revoked || item.expired);
                      const row = (item: MpcTokenRecord) => (
                        <RecordRow key={item.id} title={item.name} badge={<Badge>{item.revoked ? tr('已撤销') : item.expired ? tr('已过期') : tr('有效')}</Badge>} meta={tr('有效期至 {0}', [day(item.expiresAt)]) + (item.lastUsedAt ? ' · ' + tr('最近使用 {0}', [day(item.lastUsedAt)]) : '')} description={item.scopes.join(' · ')} actions={<><button className="text-button" onClick={() => void showAgentTrail(item.id)}>{agentTrail?.tokenId === item.id ? tr('收起记录') : tr('操作记录')}</button>{!item.revoked && !item.expired && <button className="text-button" onClick={() => void revokeMcpToken(item.id)}>{tr('撤销')}</button>}</>}>
                          {agentTrail?.tokenId === item.id && (
                            <ul className="agent-trail">
                              {!agentTrail.rows.length && <li>{tr('还没有操作记录。')}</li>}
                              {agentTrail.rows.map((entry) => <li key={entry.id}><time dateTime={entry.at}>{entry.at.slice(0, 16).replace('T', ' ')}</time><span>{describeActivity(entry)}</span></li>)}
                            </ul>
                          )}
                        </RecordRow>
                      );
                      return (
                        <>
                          {!active.length ? (
                            <Empty title={tr('暂无已授权的助手')}>
                              <p>{tr('在助手里添加上面的 MCP 地址并完成授权后，会显示在这里。')}</p>
                              <button className="text-button centered" onClick={() => go(mcpSetupPage)}>
                                {tr('添加 AI 助手')}
                                <ArrowUpRight size={16} />
                              </button>
                            </Empty>
                          ) : (
                            <RecordList label={tr('MCP Token 管理')}>{active.map(row)}</RecordList>
                          )}
                          {archived.length > 0 && (
                            <details className="agent-archive">
                              <summary>{tr('已撤销 / 已过期（{0}）', [archived.length])}</summary>
                              <p className="small">{tr('归档保留 180 天的操作记录，用于事后核对；记录不含具体内容，只有工具名和条数。')}</p>
                              <RecordList label={tr('已撤销 / 已过期的授权')}>{archived.map(row)}</RecordList>
                            </details>
                          )}
                        </>
                      );
                    })()}
                  </section>
                  <div>
                    <section className="panel">
                      <h2>{tr('资料导入与备份')}</h2>
                      <p>
                        {tr(
                          '导入 Agent 输出的 JSON 数据包。先预览条目数量，再写入本机数据库。',
                        )}
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
                          {tr('导入 Agent 数据包')}
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
                          {tr('导出完整资料备份')}
                        </button>
                      </div>
                      <p className="small">
                        {tr(
                          '备份包含私人履历与投递记录。完整备份用于留存；Agent 导入只接收研究、报告和新版本材料。',
                        )}
                      </p>
                    </section>
                  </div>
                  <section className="panel">
                    <div className="section-head">
                      <h2>{tr('任务队列')}</h2>
                      <span className="tag">
                        {pending.length}
                        {tr('项待处理')}
                      </span>
                    </div>
                    {data.tasks.map((t) => (
                      <div className="queue-row record-row" key={t.id}>
                        <span>
                          <b>{tr(t.kind)}</b>
                          <small>
                            {data.jobs.find((j) => j.id === t.jobId)?.company ||
                              tr('整个求职工作区')}{' '}
                            · {day(t.createdAt)}
                          </small>
                        </span>
                        <Badge>{t.status}</Badge>
                      </div>
                    ))}
                    {!data.tasks.length && (
                      <Empty title={tr('没有待处理任务')}>
                        <p>
                          {tr('在公司详情中请求准备，或请求一份每日分析。')}
                        </p>
                      </Empty>
                    )}
                  </section>
                </>
              )}
              {active === '技能库' && <SkillArchive />}
              {(active === mcpSetupPage || findMcpClient(active)) && (
                <AgentSetup
                  client={findMcpClient(active)}
                  tokens={mcpTokens}
                  refresh={refreshMcpTokens}
                  day={day}
                  onSelect={(client) => go(mcpClientPage(client.id))}
                  onBack={() => go(mcpSetupPage)}
                  onDone={() => go('Agent 协作')}
                />
              )}
              {active === '定时任务' && <ScheduledSync />}
            </>
          )}
        </div>
      </main>
      {jobEdit && (
        <Modal
          title={jobEdit.id ? tr('编辑职位与投递进展') : tr('添加目标职位')}
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
                  label={tr(label)}
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
                <span>{tr('投递状态')}</span>
                <select name="status" defaultValue={jobEdit.status || '关注中'}>
                  {statuses.map((s) => (
                    <option key={s} value={s}>
                      {tr(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>{tr('优先级')}</span>
                <select
                  name="priority"
                  defaultValue={jobEdit.priority || '普通'}
                >
                  {['高', '普通', '低'].map((s) => (
                    <option key={s} value={s}>
                      {tr(s)}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                name="nextAction"
                label={tr('下一步行动')}
                value={jobEdit.nextAction}
              />
              <Field
                name="nextDate"
                label={tr('跟进 / 面试日期')}
                value={jobEdit.nextDate}
                type="date"
              />
              <Field
                name="notes"
                label={tr('我的跟进记录')}
                value={jobEdit.notes}
                large
              />
            </div>
            {error && <p className="form-error">{tr(error)}</p>}
            <div className="modal-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setJobEdit(null)}
              >
                {tr('取消')}
              </button>
              <button className="primary" disabled={busy}>
                {busy ? tr('保存中…') : tr('保存职位')}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {profileEdit && data && (
        <Modal title={tr('编辑个人履历')} onClose={() => setProfileEdit(false)}>
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
            <Badge>{'kind' in doc ? tr(doc.kind) : tr('每日分析')}</Badge>
            <span>
              {day(doc.createdAt)}
              {tr('· AI 草稿，使用前请核对')}
            </span>
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
              {tr('下载 Markdown')}
            </button>
          </div>
          {'jobId' in doc &&
            data &&
            (doc.profileRevision !== data.profile.revision ||
              doc.jobRevision !==
                data.jobs.find((j) => j.id === doc.jobId)?.revision) && (
              <div className="inline-note">
                {tr(
                  '此文稿生成后，个人履历或职位信息有更新，请核对是否需要重新准备。',
                )}
              </div>
            )}
          <article className="document-body">
            <DocumentText text={doc.content} />
          </article>
          <div className="source-box">
            <h3>{tr('依据与待确认事项')}</h3>
            <p className="prewrap">{doc.sourceNotes}</p>
          </div>
        </Modal>
      )}
      {importOpen && (
        <Modal
          title={tr('导入 Agent 数据包')}
          onClose={() => setImportOpen(false)}
        >
          <p>
            {tr(
              '支持职位研究、公司准备资料和每日分析。导入不会修改你的投递状态。',
            )}
          </p>
          <label className="file-input">
            {tr('选择 JSON 文件')}
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
            aria-label={tr('Agent JSON 数据包')}
            placeholder='{"schemaVersion":1,"jobs":[],"materials":[],"reports":[]}'
            value={importText}
            onChange={(e) => {
              setImportText(e.target.value);
              setPreview(null);
            }}
          />
          {preview && (
            <div className="inline-note">
              {tr('检查通过：')}
              {preview.jobs}
              {tr('条职位、')}
              {preview.materials}
              {tr('份准备资料、')}
              {preview.reports}
              {tr('份分析报告，')}
              {preview.questionSets || 0} {tr('组面试题，')}
              {preview.reviews || 0}
              {tr('份回答点评。')}
            </div>
          )}
          {error && <p className="form-error">{tr(error)}</p>}
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
              {tr('检查并预览')}
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
              {tr('确认导入')}
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
  const { t: tr } = useLocale();
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
            label={tr(label)}
            value={String(initial.current[k as keyof typeof profile] || '')}
            large
          />
        ))}
      </div>
      {error && <p className="form-error">{tr(error)}</p>}
      <div className="modal-actions">
        <button className="primary" disabled={busy}>
          {tr('保存个人履历')}
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
