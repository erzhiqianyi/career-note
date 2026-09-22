'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { RecordBack, SubViewContext, useRecordPage, type SubView } from '@/components/record-page';
import { LanguageSwitcher, useLocale } from '@/components/locale-provider';

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
import ScheduledTemplates from '@/components/scheduled-templates';
import TodayCalendar, { collectActivity, type CalendarMark } from '@/components/today-calendar';
import CareerWelcome from '@/components/career-welcome';
import SystemSettings from '@/components/system-settings';
import WorkspaceFooter from '@/components/workspace-footer';
import InterviewPractice from '@/components/interview-practice';
import StatusMark from '@/components/status-mark';
import DailyBrief, { collectBrief, briefSize } from '@/components/daily-brief';
import { BANK_JOB_ID, builtinQuestionSets } from '@/lib/interview-bank';
import { MaterialPrint } from '@/components/material-print';
import ResumeManager from '@/components/resume-manager';
import PersonalizedResumes from '@/components/personalized-resumes';
import {
  DataActions,
  DataCell,
  DataRow,
  DataTable,
  DataTitle,
} from '@/components/data-table';
import SkillArchive from '@/components/skill-archive';
import JobPlatforms from '@/components/job-platforms';
import {
  useCallback,
  useEffect,
  useRef,
  useMemo,
  useState,
  Fragment,
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
  FileText,
  Flag,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Newspaper,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  ScrollText,
  Upload,
  UserRound,
  Workflow,
  X,
} from 'lucide-react';
import {
  api,
  download,
  statuses,
  matchLevels,
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
  { label: '公司', icon: BriefcaseBusiness },
  { label: '我的履历', icon: UserRound },
  { label: '个性化简历', icon: FileText },
  { label: 'Agent 协作', icon: Workflow },
  { label: '求职平台', icon: Search },
  { label: '系统设置', icon: Settings },
];
// Phone layout: four tabs for what happens on the move; the rest lives in the drawer behind the brand.
// Pages that are read or edited occasionally come first; anything that configures the workspace is "settings".
const phoneTabs = [
  { label: '今日准备', short: '今日', icon: LayoutDashboard },
  { label: '公司', short: '公司', icon: BriefcaseBusiness },
  { label: '我的履历', short: '履历', icon: UserRound },
];
const drawerPages = ['个性化简历'];
const drawerSettings = ['Agent 协作', '求职平台', '系统设置'];
// `parent` is the nav page that stays highlighted; `back` is where the header arrow goes when it is not the parent.
const subPages: Record<string, { parent: string; hash: string; back?: string }> = {
  技能库: { parent: 'Agent 协作', hash: '#skills' },
  定时任务: { parent: 'Agent 协作', hash: '#schedule' },
  [mcpSetupPage]: { parent: 'Agent 协作', hash: mcpSetupHash },
  ...Object.fromEntries(
    mcpClients.map((c) => [
      mcpClientPage(c.id),
      { parent: 'Agent 协作', hash: mcpClientHash(c.id), back: mcpSetupPage },
    ]),
  ),
};
const sidebarKey = 'career-note.sidebar-collapsed';
const hashes: Record<string, string> = {
  '#settings': '系统设置',
  '#today': '今日准备',
  '#jobs': '公司',
  '#interview': '公司', // legacy links from before interview prep merged into the company page
  '#platforms': '求职平台',
  '#resume': '我的履历',
  '#personalized': '个性化简历',
  '#materials': '公司',
  '#reports': '公司',
  '#documents': '公司',
  '#agents': 'Agent 协作',
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
  ['matchLevel', '匹配评价'],
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
function RecordPage({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { t: tr } = useLocale();
  return <section className="panel record-page"><RecordBack onBack={onClose} /><h2>{tr(title)}</h2>{children}</section>;
}
// Left-hand sheet for the phone layout; the desktop sidebar makes it redundant there (hidden by CSS).
function Drawer({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  const { t: tr } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="drawer"
      aria-label={tr('菜单')}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer-head">
        <div className="brand">
          <span>{tr('就')}</span>
          <div>{tr('就职手帖')}</div>
        </div>
        <button className="icon-button" aria-label={tr('关闭')} onClick={onClose}>
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
  const [hash, setHash] = useState('');
  const [jobEdit, setJobEdit] = useState<Partial<Job> | null>(null),
    [doc, setDoc] = useRecordPage<Material | Report>('#documents', 'view', id => [...(data?.materials || []), ...(data?.reports || [])].find(item => item.id === id) || null, item => item.id);
  const [printMaterial, setPrintMaterial] = useRecordPage<Material>('#documents', 'print', id => data?.materials.find(m => m.id === id && !!m.jobId && ['履歴書', '職務経歴書'].includes(m.kind)) || null, m => m.id);
  const [taskPage, setTaskPage] = useRecordPage<State['tasks'][number]>('#agents', 'task', id => data?.tasks.find(t => t.id === id) || null, t => t.id);
  const [archivedTokens, setArchivedTokens] = useRecordPage<boolean>('#agents', 'archive', () => true, () => 'all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [goalEdit, setGoalEdit] = useState(false);
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
      const hash = window.location.hash;
      const editMatch = hash.match(/^#jobs\/([^/]+)\/edit$/);
      const detailMatch = hash.match(/^#jobs\/([^/]+)$/);
      if (hash === '#jobs/new' || editMatch) {
        setActive('公司');
        if (hash === '#jobs/new') {
          setJobEdit({});
        } else if (data) {
          const editing = data.jobs.find((item) => encodeURIComponent(item.id) === editMatch?.[1]);
          setJobEdit(editing || null);
          if (!editing) setError('职位不存在或已移除');
        }
      } else {
        setJobEdit(null);
        if (detailMatch && detailMatch[1] !== 'new' && data?.jobs.some((item) => encodeURIComponent(item.id) === detailMatch[1])) {
          // Old-style company link: the company page now lives under the merged page's own routes.
          window.location.replace('#jobs/company/' + detailMatch[1]);
          return;
        } else {
          const target = hash.startsWith('#documents/view/') && data?.reports.some(r => encodeURIComponent(r.id) === hash.slice('#documents/view/'.length)) ? '公司' : hashes[hash] || hashes[hash.split('/')[0]];
          if (target) setActive(target);
        }
      }
      setHash(hash);
      window.scrollTo(0, 0);
    };
    navigate();
    window.addEventListener('hashchange', navigate);
    return () => window.removeEventListener('hashchange', navigate);
  }, [data]);
  const [importOpen, setImportOpen] = useRecordPage<boolean>('#agents', 'import', () => true, () => 'new'),
    [importText, setImportText] = useState(''),
    [preview, setPreview] = useState<Record<string, number> | null>(null),
    [profileEdit, setProfileEdit] = useRecordPage<boolean>('#resume', 'profile', () => true, () => 'edit');
  const [authConfig, setAuthConfig] = useState<CareerAuthConfig | null>(null);
  const sessionEpoch = useRef(0);
  const lastUid = useRef<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [mcpTokens, setMcpTokens] = useState<MpcTokenRecord[]>([]);
  const [subViews, setSubViews] = useState<Map<string, SubView>>(() => new Map());
  const registerSubView = useCallback((id: string, view: SubView | null) => setSubViews((previous) => {
    const next = new Map(previous);
    if (view) next.set(id, view); else next.delete(id);
    return next;
  }), []);
  const [agentTrail, setAgentTrail] = useRecordPage<{ tokenId: string; rows: AgentActivity[] }>('#agents', 'activity', id => ({tokenId:id, rows:[]}), item => item.tokenId);
  useEffect(() => {
    if (!agentTrail) return;
    let cancelled = false;
    api<{activity: AgentActivity[]}>('mcp/activity?tokenId=' + encodeURIComponent(agentTrail.tokenId) + '&limit=50').then(response => {
      if (!cancelled) setAgentTrail(previous => previous && ({...previous, rows: response.activity}));
    }).catch(e => { if (!cancelled) setError(String(e)); });
    return () => { cancelled = true; };
  }, [agentTrail?.tokenId]);
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
    if (agentTrail?.tokenId === id) { const r = await api<{activity: AgentActivity[]}>('mcp/activity?tokenId=' + encodeURIComponent(id) + '&limit=50'); setAgentTrail({tokenId:id, rows:r.activity}); }
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
  function openJob(id: string) {
    setActive('公司');
    window.location.hash = 'jobs/company/' + encodeURIComponent(id);
  }
  function openJobEditor(value: Partial<Job>) {
    const parent = value.id ? '#jobs/company/' + encodeURIComponent(value.id) : active === '今日准备' ? '#today' : '#jobs';
    window.history.replaceState(null, '', parent);
    setJobEdit(value);
    setActive('公司');
    window.location.hash = value.id ? 'jobs/' + encodeURIComponent(value.id) + '/edit' : 'jobs/new';
    window.scrollTo(0, 0);
  }
  function closeJobEditor() {
    const id = jobEdit?.id;
    setJobEdit(null);
    setActive('公司');
    window.history.replaceState(null, '', id ? '#jobs/company/' + encodeURIComponent(id) : '#jobs');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    window.scrollTo(0, 0);
  }
  function go(label: string) {
    setJobEdit(null);
    window.scrollTo(0, 0);
    if (label === '今日简报') { setActive('今日准备'); window.location.hash = '#today/brief'; setDrawerOpen(false); return; }
    const page = subPages[label]?.parent ?? label;
    if (visibleNav.some((item) => item.label === page)) {
      setActive(label);
      window.history.replaceState(
        null,
        '',
        label === '公司'
          ? '#jobs'
          : label === '今日准备'
            ? '#today'
            : label === '求职平台'
          ? '#platforms'
          : (subPages[label]?.hash ?? Object.entries(hashes).find(([, name]) => name === label)?.[0] ?? '#today'),
      );
    }
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    setDrawerOpen(false);
  }
  async function request(kind: string, jobId = '') {
    await action(
      () => api('tasks', { kind, jobId, instructions: kind === '公司准备' ? '请先为指定公司分别生成并保存履歴書、職務経歴書两份独立 materials 版本（各自使用对应 kind）。参考 Hello Work：https://www.hellowork.mhlw.go.jp/member/career_doc01.html 。履歴書按厚生劳动省样式的栏目组织为可打印表格；職務経歴書突出岗位相关经历与成果，正文包含姓名、日期及职务经历。正文必须是完整的投递草稿，来源、解释和缺失信息清单放 sourceNotes；不得编造缺失事实。网页在保存后直接打印该版本正文。其他公司研究和面试准备材料照常生成。' : '' }),
      '已加入 AI Agent 待处理队列；分析完成后会显示结果。',
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
          'Queue company preparation for the AI Agent; does not generate content or apply to a job.',
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
  const openJobs =
      data?.jobs.filter(
        (j) => !['未通过', '已撤回', '内定'].includes(j.status),
      ) || [];
  // A drilled-in view (company detail, agent sub-pages): the header shows "back", phones drop the tab bar.
  // Drilled-in interview routes: the header carries their title and back arrow, so the pages themselves show neither.
  const prepRoute = (() => {
    const match = active === '公司' && !jobEdit ? hash.match(/^#jobs\/(company|question|guide|help)\/(.+)$/) : null;
    if (!match || !data) return null;
    let id = '';
    try { id = decodeURIComponent(match[2]); } catch { return null; }
    const [packId, questionId] = id.split('|');
    const pack = [...builtinQuestionSets, ...data.questionSets].find((p) => p.id === packId);
    const companyOf = (jobId: string) => (jobId === BANK_JOB_ID ? tr('通用题库（模板）') : data.jobs.find((j) => j.id === jobId)?.company || '');
    switch (match[1]) {
      case 'company': return { title: companyOf(id), back: '#jobs' };
      case 'guide': return { title: tr('面试前要做什么'), back: '#jobs/company/' + encodeURIComponent(pack?.jobId || BANK_JOB_ID) };
      case 'question': return { title: pack?.questions.find((q) => q.id === questionId)?.title || tr('面试练习'), back: '#jobs/company/' + encodeURIComponent(pack?.jobId || BANK_JOB_ID) };
      case 'help': return { title: tr('回答提示'), back: '#jobs/question/' + encodeURIComponent(id) };
    }
    return null;
  })();
  const briefOpen = active === '今日准备' && hash.startsWith('#today/brief');
  // Record views inside the tabs (resume entries, drafts, platform details…) register here; the innermost one owns the back arrow.
  const recordView = subViews.size ? [...subViews.values()][subViews.size - 1] : null;
  const isSubPage = !!(recordView || jobEdit || subPages[active] || prepRoute || briefOpen);
  const due = openJobs.filter(
      (j) => j.nextDate && j.nextDate <= (data?.today || ''),
    ),
    interviews = openJobs.filter((j) => j.status === '面试中');
  const pending = data?.tasks.filter((t) => t.status === '待处理') || [];
  // 首页「下一步」按实际资料推导：先补履历，再收集职位、定制简历、练习回答，最后看分析。
  const nextSteps = (() => {
    if (!data) return [] as [string, string, string, string, string?][];
    const resume = data.resume.filter((e) => !e.archived);
    const hasBasics = resume.some((e) => e.kind === 'basics') || !!data.profile.summary;
    const hasEmployment = resume.some((e) => e.kind === 'employment');
    const firstJob = openJobs[0];
    const noNext = openJobs.find((j) => !j.nextAction);
    const practiced = new Set(data.attempts.map((a) => a.questionSetId));
    const unpracticed = data.questionSets.find((q) => !practiced.has(q.id));
    const todayReport = data.reports.some((r) => r.date === data.today);
    const steps: [string, string, string, string?][] = [];
    if (!hasBasics || !hasEmployment)
      steps.push(['整理个人履历', '补充基本资料、工作经历和求职条件，后续材料都从这里引用。', '我的履历']);
    if (pending.length) steps.push(['查看 Agent 待处理任务', '核对 Agent 整理的结果，再决定是否导入。', 'Agent 协作']);
    if (!openJobs.length) steps.push(['收集目标职位', '保留招聘链接、岗位要求和信息确认日期。', '公司']);
    if (noNext) steps.push(['为{0}设定下一步', '写下这家公司接下来要做的事和日期，首页会提醒。', '公司', noNext.company]);
    if (firstJob && hasEmployment) steps.push(['为{0}生成个性化简历', '按岗位要求调整职业定位和经历顺序，保留可核对的版本。', '个性化简历', firstJob.company]);
    if (unpracticed) steps.push(['练一题自我介绍', '先用自己的话回答，再交给 AI Agent 点评。', '公司']);
    else if (firstJob && !data.questionSets.length) steps.push(['整理公司准备资料', '让 AI Agent 生成面试题组，或自己整理常见问题。', '公司']);
    if (!todayReport) steps.push(['整理每日分析', '从匹配点和准备缺口中，确定下一步行动。', '今日简报']);
    return steps.slice(0, 3).map((step, i) => [String(i + 1).padStart(2, '0'), ...step] as [string, string, string, string, string?]);
  })();
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
  if (printMaterial) {
    return <main className="material-print-layout">
      <MaterialPrint key={printMaterial.id} material={printMaterial} onBack={() => { window.location.hash = '#documents/view/' + encodeURIComponent(printMaterial.id); }} />
    </main>;
  }
  return (
    <div className={['shell', navCollapsed && 'nav-collapsed', isSubPage && 'sub-page'].filter(Boolean).join(' ')}>
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
              className={[activePage === label ? 'active' : '', ['我的履历', 'Agent 协作'].includes(label) ? 'nav-group-start' : ''].filter(Boolean).join(' ')}
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
        {phoneTabs.map(({ label, short, icon: Icon }) => (
          <button
            key={label}
            className={activePage === label ? 'active' : ''}
            aria-label={tr(label)}
            aria-current={activePage === label ? 'page' : undefined}
            onClick={() => go(label)}
          >
            <Icon size={21} />
            <span>{tr(short)}</span>
          </button>
        ))}
      </nav>
      {drawerOpen && (
        <Drawer onClose={() => setDrawerOpen(false)}>
          <div className="drawer-section">
            <h3>{tr('页面')}</h3>
            {visibleNav
              .filter((item) => drawerPages.includes(item.label))
              .map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  aria-current={activePage === label ? 'page' : undefined}
                  onClick={() => go(label)}
                >
                  <Icon size={20} />
                  <span>{tr(label)}</span>
                  <ChevronRight size={18} />
                </button>
              ))}
          </div>
          <div className="drawer-section">
            <h3>{tr('设置')}</h3>
            <div className="drawer-field">
              <LanguageSwitcher />
            </div>
            {visibleNav
              .filter((item) => drawerSettings.includes(item.label))
              .map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  aria-current={activePage === label ? 'page' : undefined}
                  onClick={() => go(label)}
                >
                  <Icon size={20} />
                  <span>{tr(label)}</span>
                  {label === 'Agent 协作' && pending.length > 0 && (
                    <span className="nav-count">{pending.length}</span>
                  )}
                  <ChevronRight size={18} />
                </button>
              ))}
          </div>
          <div className="drawer-section drawer-account">
            {!getCareerAuth() ? (
              <p className="muted">{tr('本机模式 · Google 登录未启用')}</p>
            ) : loggedIn ? (
              <>
                <p className="muted">{userName || userEmail || tr('已登录')}</p>
                <button onClick={() => void logout()} disabled={busy}>
                  <LogOut size={20} />
                  <span>{tr('退出')}</span>
                </button>
              </>
            ) : (
              <button onClick={() => void login()} disabled={busy}>
                <LogIn size={20} />
                <span>{tr('Google 登录')}</span>
              </button>
            )}
          </div>
        </Drawer>
      )}
      <SubViewContext.Provider value={registerSubView}>
      <main>
        <header>
          <div className="header-nav">
            {/* Phone only (CSS): the sidebar is hidden there, so the brand glyph doubles as the menu button. */}
            <button
              type="button"
              className="header-brand"
              aria-label={tr('打开菜单')}
              aria-haspopup="dialog"
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <span>{tr('就')}</span>
              <Menu size={16} aria-hidden="true" />
            </button>
            {isSubPage && (
              <button
                className="icon-button header-back"
                aria-label={tr('返回 {0}', [
                  recordView ? tr(activePage) : tr(subPages[active]?.back ?? subPages[active]?.parent ?? active),
                ])}
                onClick={() => {
                  if (recordView) recordView.onBack();
                  else if (jobEdit) closeJobEditor();
                  else if (subPages[active]) go(subPages[active].back ?? subPages[active].parent);
                  else if (prepRoute) { window.history.replaceState(null, '', prepRoute.back); window.dispatchEvent(new HashChangeEvent('hashchange')); }
                  else if (briefOpen) go('今日准备');
                  else go('公司');
                }}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            {isSubPage ? (
              <span className="breadcrumb" id="page-subtitle">{recordView ? recordView.title ?? tr(activePage) : briefOpen ? tr('今日简报') : prepRoute ? prepRoute.title : jobEdit ? tr(jobEdit.id ? '编辑职位与投递进展' : '添加目标职位') : tr(activePage)}</span>
            ) : (
              <h1 className="header-page-title">{tr(activePage)}</h1>
            )}
          </div>
          <div className="row header-tools">
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
              className="icon-button phone-hidden"
              aria-label={tr('刷新资料')}
              onClick={() => void reload()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        </header>
        <div className="page">
          {!doc && !printMaterial && !profileEdit && !importOpen && !agentTrail && !taskPage && !archivedTokens && <>
          {jobEdit ? (
<section className="panel job-editor-page" key={jobEdit.id || 'new'} aria-labelledby="page-subtitle">
          {jobEdit.company && <div className="editor-heading"><p>{jobEdit.company}</p></div>}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = Object.fromEntries(new FormData(e.currentTarget));
              const ok = await action(
                () => api('jobs', { ...jobEdit, ...form }),
                '职位与投递进展已保存',
              );
              if (ok) closeJobEditor();
            }}
          >
            <div className="form-grid">
              {researchFields.map(([k, label]) => k === 'matchLevel' ? (
                <label className="field" key={k}>
                  <span>{tr(label)}</span>
                  <select name="matchLevel" defaultValue={jobEdit.matchLevel || ''}>
                    <option value="">{tr('待评估')}</option>
                    {matchLevels.map((s) => (
                      <option key={s} value={s}>
                        {tr(s)}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
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
            <div className="editor-actions">
              <button
                type="button"
                className="secondary"
                onClick={closeJobEditor}
              >
                {tr('取消')}
              </button>
              <button className="primary" disabled={busy}>
                {busy ? tr('保存中…') : tr('保存职位')}
              </button>
            </div>
          </form>
        </section>
          ) : (<>
          {active === '今日准备' && !briefOpen && (
            <div className="workspace-heading">
              <button className="primary" disabled={!data} onClick={() => data?.questionSets.length ? go('公司') : openJobEditor({})}>
                {data?.questionSets.length ? <CalendarDays size={18} /> : <Plus size={18} />}
                {tr(data?.questionSets.length ? '开始面试练习' : '添加职位')}
              </button>
            </div>
          )}
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
            const action = null;
            return action ? <div className="page-actions">{action}</div> : null;
          })()}
          {active === '系统设置' ? <SystemSettings /> : !data ? (
            <section className="panel">
              <Empty
                title={error ? tr('数据服务尚未连接') : tr('正在读取求职资料…')}
              >
              </Empty>
            </section>
          ) : (
            <>
              <div hidden={active !== '公司'}>
                <InterviewPractice
                  data={data}
                  reload={reload}
                  openMaterial={(m) => setDoc(m)}
                  openReport={(r) => setDoc(r)}
                  requestPreparation={(jobId) => void request('公司准备', jobId)}
                  pendingJobIds={pending.filter((t) => t.kind === '公司准备').map((t) => t.jobId)}
                  requesting={busy}
                  onAddJob={() => openJobEditor({})}
                  onImport={() => { setImportOpen(true); setPreview(null); }}
                  onEditJob={(j) => openJobEditor(j)}
                />
              </div>
              {briefOpen && (
                <DailyBrief
                  data={data}
                  openJob={openJob}
                  openMaterial={(m) => setDoc(m)}
                  openReport={(r) => setDoc(r)}
                  requestAnalysis={() => void request('每日分析')}
                  pendingAnalysis={pending.some((t) => t.kind === '每日分析')}
                  requesting={busy}
                />
              )}
              {active === '今日准备' && !briefOpen && (
                <>
                  {(() => {
                    // Today's brief: what agents brought in, what is due, what changed. Opens the day's full list.
                    const brief = collectBrief(data, data.today);
                    const parts: Array<[string, number]> = [
                      ['到期', brief.due.length + brief.overdue.length],
                      ['Agent 分析', brief.reports.length],
                      ['新职位', brief.addedJobs.length],
                      ['新资料', brief.materials.length],
                      ['新题组', brief.questionSets.length],
                      ['新点评', brief.reviews.length],
                      ['Agent 任务', brief.completedTasks.length + brief.pendingTasks.length],
                    ];
                    const shown = parts.filter(([, n]) => n > 0);
                    return (
                      <button type="button" className="brief-entry" onClick={() => { window.location.hash = '#today/brief'; }}>
                        <Newspaper size={20} />
                        <span className="brief-entry-title">{tr('今日简报')}</span>
                        <span className="brief-entry-parts">
                          {shown.length ? shown.map(([label, n]) => <span key={label}>{tr(label)} <b>{n}</b></span>) : <span className="muted">{tr('今天还没有新内容')}</span>}
                        </span>
                        <span className="brief-entry-total">{briefSize(brief)}</span>
                      </button>
                    );
                  })()}
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
                    ].map(([title, count]) => (
                      <div
                        key={title}
                        className={count === 0 ? 'is-zero' : undefined}
                      >
                        <span>{tr(String(title))}</span>
                        <strong>
                          {count}
                          <small>{tr('项')}</small>
                        </strong>
                      </div>
                    ))}
                  </div>
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
                                go('公司');
                                openJob(j.id);
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
                            </button>
                          ))
                        ) : (
                          <>
                            {nextSteps.map(([n, t, , d, arg]) => (
                              <button
                                className="task-row"
                                key={n}
                                onClick={() => go(d)}
                              >
                                <span className="step">{n}</span>
                                <span>
                                  <b>{tr(t, arg ? [arg] : [])}</b>
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
                            onClick={() => go('公司')}
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
                                  go('公司');
                                  openJob(j.id);
                                }}
                              >
                                <span className="company-avatar">
                                  {j.company.slice(0, 1)}
                                </span>
                                <span>
                                  <b>{j.company}</b>
                                  <small>{j.role}</small>
                                </span>
                                <StatusMark status={j.status} />
                              </button>
                            ))}
                          </div>
                        ) : (
                          <Empty title={tr('下一份工作，从一条机会开始')}>
                            <p>{tr('添加招聘信息，或让 AI Agent 整理后导入。')}</p>
                          </Empty>
                        )}
                      </section>
                    </div>
                    <aside className="home-aside">
                  {(() => {
                    // Calendar marks: follow-ups on their due day, interviews, and the personal target date.
                    const marks: Record<string, CalendarMark> = {};
                    for (const j of openJobs) {
                      if (!j.nextDate) continue;
                      const date = j.nextDate.slice(0, 10);
                      const interview = j.status === '面试中' || /面试|面接|interview/i.test(j.nextAction);
                      const kind = interview ? 'interview' : 'due';
                      const prev = marks[date];
                      if (prev && prev.kind === 'interview' && !interview) continue; // an interview outranks a follow-up on the same day
                      marks[date] = { kind, jobs: [...(prev && prev.kind === kind ? prev.jobs : []), { id: j.id, company: j.company }] };
                    }
                    const target = data.profile.targetDate;
                    if (target && !marks[target]) marks[target] = { kind: 'target', jobs: [] };
                    const daysLeft = target ? Math.round((Date.parse(target) - Date.parse(data.today)) / 86400000) : null;
                    return (
                      <section className="today-hero">
                        <TodayCalendar today={data.today} marks={marks} activity={collectActivity(data.jobs, data.attempts, data.materials)} onOpenJob={openJob} />
                        <div className="goal">
                          <h2>
                            <Flag size={18} />
                            {tr('目标')}
                          </h2>
                          {goalEdit ? (
                            <form
                              className="goal-form"
                              onSubmit={(e) => {
                                e.preventDefault();
                                const targetDate = String(new FormData(e.currentTarget).get('targetDate') || '');
                                void action(() => api('profile', { ...data.profile, targetDate }), '目标已保存').then((ok) => {
                                  if (ok) setGoalEdit(false);
                                });
                              }}
                            >
                              <label>
                                {tr('希望在这一天之前找到工作')}
                                <input type="date" name="targetDate" defaultValue={target} min={data.today} />
                              </label>
                              <div className="row">
                                <button className="primary" type="submit" disabled={busy}>
                                  {tr('保存')}
                                </button>
                                <button className="text-button" type="button" onClick={() => setGoalEdit(false)}>
                                  {tr('取消')}
                                </button>
                              </div>
                            </form>
                          ) : target && daysLeft !== null ? (
                            <>
                              <p className="goal-date">{day(target)}</p>
                              <p className="goal-count">
                                {daysLeft > 0
                                  ? tr('距离目标还有 {0} 天', [daysLeft])
                                  : daysLeft === 0
                                    ? tr('目标日期就是今天')
                                    : tr('目标日期已过 {0} 天，可以重新设定', [-daysLeft])}
                              </p>
                              <button className="text-button" onClick={() => setGoalEdit(true)}>
                                {tr('修改目标')}
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="secondary" onClick={() => setGoalEdit(true)}>
                                {tr('设定目标日期')}
                              </button>
                            </>
                          )}
                        </div>
                      </section>
                    );
                  })()}
                    </aside>
                  </div>
                </>
              )}
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
              {active === '个性化简历' && <PersonalizedResumes entries={data.resume || []} jobs={data.jobs} />}
              {active === 'Agent 协作' && (
                <>
                  <AgentConnection onAdd={() => go(mcpSetupPage)} />
                  <div className="agent-entries">
                    <button className="agent-entry" onClick={() => go('技能库')}>
                      <Blocks size={22} />
                      <span>
                        <b>{tr('技能库')}</b>
                      </span>
                    </button>
                    <button className="agent-entry" onClick={() => go('定时任务')}>
                      <CalendarClock size={22} />
                      <span>
                        <b>{tr('定时任务')}</b>
                      </span>
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
                    <p className="page-note">{tr('助手仅可访问你的工作区，可随时撤销授权。')}</p>
                    {auth?.mode !== 'off' && userEmail && (
                      <p className="small page-note">{tr('当前账号：{0}。授权页登录的是哪个 Google 账号，授权就归哪个账号；用其他账号授权的助手不会显示在这里。', [userEmail])}</p>
                    )}
                    {(() => {
                      const active = mcpTokens.filter((item) => !item.revoked && !item.expired);
                      const archived = mcpTokens.filter((item) => item.revoked || item.expired);
                      const tokenColumns = [
                        { key: 'name', label: tr('助手 / 权限'), width: 'minmax(180px, 1.5fr)' },
                        { key: 'expires', label: tr('有效期至'), width: '92px', hide: 'phone' as const },
                        { key: 'used', label: tr('最近使用'), width: '92px', hide: 'tablet' as const },
                        { key: 'state', label: tr('状态'), width: '72px' },
                        { key: 'ops', label: tr('操作'), width: '76px', align: 'end' as const },
                      ];
                      const row = (item: MpcTokenRecord) => {
                        const live = !item.revoked && !item.expired;
                        return (
                          <Fragment key={item.id}>
                            <DataRow onOpen={() => void showAgentTrail(item.id)}>
                              <DataTitle title={item.name} meta={item.scopes.join(' · ')} onClick={() => void showAgentTrail(item.id)} />
                              <DataCell label={tr('有效期至')} hide="phone" className="num">{day(item.expiresAt)}</DataCell>
                              <DataCell label={tr('最近使用')} hide="tablet" className="num">{item.lastUsedAt ? day(item.lastUsedAt) : '—'}</DataCell>
                              <DataCell label={tr('状态')}>
                                <span className={'badge ' + (live ? 'green' : 'gray')}>{item.revoked ? tr('已撤销') : item.expired ? tr('已过期') : tr('有效')}</span>
                              </DataCell>
                              <DataActions>
                                <button className="icon-button" onClick={() => void showAgentTrail(item.id)} title={tr('打开')} aria-label={tr('打开')}>
                                  <ScrollText size={16} />
                                </button>

                              </DataActions>
                            </DataRow>

                          </Fragment>
                        );
                      };
                      return (
                        <>
                          {!active.length ? (
                            <Empty title={tr('暂无已授权的助手')}>
                              <button className="text-button centered" onClick={() => go(mcpSetupPage)}>
                                {tr('添加 AI 助手')}
                                <ArrowUpRight size={16} />
                              </button>
                            </Empty>
                          ) : (
                            <DataTable label={tr('MCP Token 管理')} columns={tokenColumns}>{active.map(row)}</DataTable>
                          )}
                          {archived.length > 0 && (
                            <button className="secondary" onClick={() => setArchivedTokens(true)}>{tr('已撤销 / 已过期（{0}）', [archived.length])}</button>
                          )}
                        </>
                      );
                    })()}
                  </section>
                  <div className="phone-hidden">
                    <section className="panel">
                      <h2>{tr('资料导入与备份')}</h2>
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
                    {data.tasks.length > 0 && (
                      <DataTable
                        label={tr('任务队列')}
                        columns={[
                          { key: 'kind', label: tr('任务'), width: 'minmax(0, 1fr)' },
                          { key: 'created', label: tr('创建'), width: '84px', hide: 'phone' },
                          { key: 'created', label: tr('创建'), width: '84px', hide: 'phone' },
                          { key: 'status', label: tr('状态'), width: '80px', align: 'end' },
                        ]}
                      >
                        {data.tasks.map((t) => (
                          <DataRow key={t.id} onOpen={() => setTaskPage(t)}>
                            <DataTitle
                              title={tr(t.kind)}
                              onClick={() => setTaskPage(t)}
                              meta={data.jobs.find((j) => j.id === t.jobId)?.company || tr('整个求职工作区')}
                            />
                            <DataCell label={tr('创建')} hide="phone" className="num">{day(t.createdAt)}</DataCell>
                            <DataCell align="end">
                              <span className={'badge ' + (t.status === '待处理' ? 'amber' : 'green')}>{tr(t.status)}</span>
                            </DataCell>
                          </DataRow>
                        ))}
                      </DataTable>
                    )}
                    {!data.tasks.length && (
                      <Empty title={tr('没有待处理任务')}>
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
                  onDone={() => go('Agent 协作')}
                />
              )}
              {active === '定时任务' && (
                <>
                  <ScheduledTemplates />
                </>
              )}
            </>
          )}
          </>)}
          </>}
      {archivedTokens && <RecordPage title={tr('已撤销 / 已过期的授权')} onClose={() => setArchivedTokens(null)}><DataTable label={tr('已撤销 / 已过期的授权')} columns={[{key:'name',label:tr('标题'),width:'minmax(0,1fr)'}]}>{mcpTokens.filter(item => item.revoked || item.expired).map(item => <DataRow key={item.id} onOpen={() => void showAgentTrail(item.id)}><DataTitle title={item.name} onClick={() => void showAgentTrail(item.id)} /></DataRow>)}</DataTable></RecordPage>}
      {taskPage && <RecordPage title={tr(taskPage.kind)} onClose={() => setTaskPage(null)}><p>{tr(taskPage.status)} · {day(taskPage.createdAt)}</p><p>{data?.jobs.find(j => j.id === taskPage.jobId)?.company || tr('整个求职工作区')}</p><p className="prewrap">{taskPage.instructions}</p></RecordPage>}
      {agentTrail && <RecordPage title={mcpTokens.find(item => item.id === agentTrail.tokenId)?.name || tr('操作记录')} onClose={() => setAgentTrail(null)}>
        {mcpTokens.some(item => item.id === agentTrail.tokenId && !item.revoked && !item.expired) && <button className="secondary" onClick={() => void revokeMcpToken(agentTrail.tokenId)}>{tr('撤销')}</button>}
        <ul className="agent-trail">{!agentTrail.rows.length && <li>{tr('还没有操作记录。')}</li>}{agentTrail.rows.map(entry => <li key={entry.id}><time dateTime={entry.at}>{entry.at.slice(0,16).replace('T',' ')}</time><span>{describeActivity(entry)}</span></li>)}</ul>
      </RecordPage>}
      {profileEdit && data && (
        <RecordPage title={tr('编辑个人履历')} onClose={() => setProfileEdit(false)}>
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
        </RecordPage>
      )}
      {doc && (
        <RecordPage title={doc.title} onClose={() => setDoc(null)}>
          <div className="document-meta">
            <Badge>{'kind' in doc ? tr(doc.kind) : tr('每日分析')}</Badge>
            <span>
              {day(doc.createdAt)}
              {tr('· AI 草稿，使用前请核对')}
            </span>
            <button
              className="secondary phone-hidden"
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
          {'kind' in doc && doc.jobId && ['履歴書', '職務経歴書'].includes(doc.kind) && <button className="secondary" onClick={() => setPrintMaterial(doc)}>{tr('预览并打印已生成的简历')}</button>}
          <article className="document-body">
            {'kind' in doc && ['履歴書', '職務経歴書'].includes(doc.kind) ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.content}</ReactMarkdown> : <DocumentText text={doc.content} />}
          </article>
          <div className="source-box">
            <h3>{tr('依据与待确认事项')}</h3>
            <p className="prewrap">{doc.sourceNotes}</p>
          </div>
        </RecordPage>
      )}
      {importOpen && (
        <RecordPage
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
        </RecordPage>
      )}
        </div>
        <WorkspaceFooter />
      </main>
      </SubViewContext.Provider>

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
