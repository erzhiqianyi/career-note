'use client';
import { useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Globe,
  MonitorSmartphone,
  RefreshCw,
  TerminalSquare,
} from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import {
  CodeBlock,
  EndpointField,
  useCopy,
  useMcpEndpoint,
} from '@/components/mcp-endpoint';
import {
  mcpClientKinds,
  mcpClients,
  probeExpectation,
  type McpClient,
} from '@/lib/mcp-clients';
import type { MpcTokenRecord } from '@/lib/career';
import shots from '@/lib/mcp-guides.generated.json';

const available = new Set<string>(shots);

const kindIcon = {
  cli: TerminalSquare,
  editor: MonitorSmartphone,
  hosted: Globe,
} as const;

const stages = ['选择助手', '复制地址并配置', '验证授权'] as const;

export function matchedTokens(client: McpClient, tokens: MpcTokenRecord[]) {
  return tokens
    .filter((item) => !item.revoked && client.match.test(item.name))
    .sort((a, b) =>
      (b.lastUsedAt || b.createdAt).localeCompare(a.lastUsedAt || a.createdAt),
    );
}

function Stepper({ current }: { current: number }) {
  const { t } = useLocale();
  return (
    <ol className="agent-stepper" aria-label={t('添加进度')}>
      {stages.map((label, i) => (
        <li
          key={label}
          className={i < current ? 'done' : i === current ? 'current' : ''}
          aria-current={i === current ? 'step' : undefined}
        >
          <b>{i < current ? <Check size={14} /> : i + 1}</b>
          <span>{t(label)}</span>
        </li>
      ))}
    </ol>
  );
}

/** Step 1 — pick the assistant to connect. */
function ClientPicker({
  tokens,
  isLocal,
  onSelect,
}: {
  tokens: MpcTokenRecord[];
  isLocal: boolean;
  onSelect: (client: McpClient) => void;
}) {
  const { t } = useLocale();
  return (
    <section className="panel">
      <div className="section-head">
        <h2>{t('选择你使用的 AI 客户端')}</h2>
        <span className="tag">MCP · Streamable HTTP · OAuth 2.1</span>
      </div>
      <p className="agent-lead page-note">
        {t('选择后会看到该客户端的配置步骤；首次连接时在浏览器里登录并同意，助手会自动拿到令牌。')}
      </p>
      <div className="agent-client-grid">
        {mcpClients.map((client) => {
          const Icon = kindIcon[client.kind];
          const connected = matchedTokens(client, tokens);
          const blocked = client.kind === 'hosted' && isLocal;
          return (
            <button
              key={client.id}
              className="agent-client-card"
              onClick={() => onSelect(client)}
            >
              <Icon size={22} />
              <span>
                <b>{t(client.name)}</b>
                <small>{t(client.summary)}</small>
                <em>
                  {connected.length ? (
                    <span className="mcp-chip ok">
                      <CheckCircle2 size={12} />
                      {t('已授权')}
                    </span>
                  ) : (
                    <span className="mcp-chip">
                      {t(mcpClientKinds[client.kind])}
                    </span>
                  )}
                  {blocked && (
                    <span className="mcp-chip warn">{t('需要公开地址')}</span>
                  )}
                </em>
              </span>
              <ChevronRight size={18} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Steps 2 and 3 for one client; remounted per client via `key`. */
function ClientSetup({
  client,
  tokens,
  refresh,
  day,
  onBack,
  onDone,
}: {
  client: McpClient;
  tokens: MpcTokenRecord[];
  refresh: () => Promise<void>;
  day: (value: string) => string;
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useLocale();
  const endpoint = useMcpEndpoint();
  const { copied, copy } = useCopy();
  const connected = matchedTokens(client, tokens);
  const [stage, setStage] = useState<'configure' | 'verify'>(
    connected.length ? 'verify' : 'configure',
  );
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const Kind = kindIcon[client.kind];
  const blocked = client.kind === 'hosted' && endpoint.isLocal;
  const steps = client.steps(endpoint.endpoint);
  const check = async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
    setChecked(true);
  };
  return (
    <>
      <Stepper current={stage === 'configure' ? 1 : 2} />
      <section className="panel">
        <div className="section-head">
          <h2>
            <Kind size={19} />
            {t(client.name)}
          </h2>
          <span className="tag">{t(mcpClientKinds[client.kind])}</span>
        </div>
        <p className="agent-lead">{t(client.summary)}</p>
        {stage === 'configure' && (
          <>
            <EndpointField endpoint={endpoint} />
            {blocked && (
              <div className="agent-warning">
                <AlertTriangle size={15} />
                <div>
                  {t(
                    '{0} 通过云端访问 MCP，无法使用本机地址。先在终端运行下面的命令，把打印的 Public MCP endpoint 粘贴到上方地址栏，再按步骤操作。',
                    [t(client.name)],
                  )}
                  <CodeBlock
                    code="npm run dev:tunnel"
                    id="tunnel"
                    copied={copied}
                    copy={copy}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </section>

      {stage === 'configure' ? (
        <section className="panel">
          <div className="section-head">
            <h2>{t('操作步骤')}</h2>
            <span className="tag">
              {steps.length}
              {t('步')}
            </span>
          </div>
          <ol className="mcp-steps">
            {steps.map((step, i) => (
              <li key={i}>
                <b>{i + 1}</b>
                <div className="mcp-step-body">
                  <h3>{t(step.title)}</h3>
                  {step.detail && <p>{t(step.detail)}</p>}
                  {step.code && (
                    <CodeBlock
                      code={step.code}
                      id={client.id + i}
                      copied={copied}
                      copy={copy}
                    />
                  )}
                  {step.image && available.has(step.image) && (
                    <figure className="mcp-shot">
                      {/* oxlint-disable-next-line next/no-img-element -- static screenshots served from public/ */}
                      <img
                        src={'/mcp-guides/' + step.image}
                        alt={t(step.imageAlt || step.title)}
                        loading="lazy"
                      />
                      {step.imageAlt && (
                        <figcaption>{t(step.imageAlt)}</figcaption>
                      )}
                    </figure>
                  )}
                </div>
              </li>
            ))}
          </ol>
          <div className="agent-wizard-actions">
            <button className="secondary" onClick={onBack}>
              <ArrowLeft size={15} />
              {t('重新选择助手')}
            </button>
            <button className="primary" onClick={() => setStage('verify')}>
              {t('下一步：验证授权')}
              <ArrowRight size={16} />
            </button>
          </div>
        </section>
      ) : (
        <>
          <section className="panel mcp-verify">
            <div className="section-head">
              <h2>{t('验证连接')}</h2>
              <button
                className="secondary"
                onClick={() => void check()}
                disabled={checking}
              >
                <RefreshCw size={15} className={checking ? 'spin' : ''} />
                {t('检查授权状态')}
              </button>
            </div>
            {connected.length ? (
              <div className="mcp-status ok">
                <CheckCircle2 size={18} />
                <div>
                  <b>{t('已收到 {0} 的授权', [connected[0].name])}</b>
                  <small>
                    {t('有效期至 {0}', [day(connected[0].expiresAt)])}
                    {connected[0].lastUsedAt
                      ? ' · ' +
                        t('最近使用 {0}', [day(connected[0].lastUsedAt)])
                      : ' · ' + t('尚未调用过工具')}
                    {' · '}
                    {connected[0].scopes.join(' · ')}
                  </small>
                </div>
              </div>
            ) : (
              <div className="mcp-status pending">
                <CircleDashed size={18} />
                <div>
                  <b>
                    {checked
                      ? t('还没有收到来自 {0} 的授权', [t(client.name)])
                      : t('尚未检测到授权')}
                  </b>
                  <small>
                    {t('完成上面的步骤并在浏览器里同意后，点击"检查授权状态"。')}
                  </small>
                </div>
              </div>
            )}
            <h3>{t('在助手里确认工具可用')}</h3>
            <p>{t('把下面这句话发给助手：')}</p>
            <CodeBlock
              code={client.probe}
              id="probe"
              copied={copied}
              copy={copy}
              wrap
            />
            <p className="small">{t(probeExpectation)}</p>
            <div className="agent-wizard-actions">
              <button
                className="secondary"
                onClick={() => setStage('configure')}
              >
                <ArrowLeft size={15} />
                {t('上一步')}
              </button>
              <button
                className="primary"
                onClick={onDone}
                disabled={!connected.length}
              >
                <Check size={16} />
                {t('完成')}
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>{t('常见问题')}</h2>
            <dl className="mcp-faq">
              {client.troubleshooting.map(([problem, fix]) => (
                <div key={problem}>
                  <dt>{t(problem)}</dt>
                  <dd>{t(fix)}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}
    </>
  );
}

/** Three-step flow for adding an assistant: pick → configure → verify. */
export default function AgentSetup({
  client,
  tokens,
  refresh,
  day,
  onSelect,
  onBack,
  onDone,
}: {
  client?: McpClient;
  tokens: MpcTokenRecord[];
  refresh: () => Promise<void>;
  day: (value: string) => string;
  onSelect: (client: McpClient) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const endpoint = useMcpEndpoint();
  return (
    <div className="mcp-guide">
      {client ? (
        <ClientSetup
          key={client.id}
          client={client}
          tokens={tokens}
          refresh={refresh}
          day={day}
          onBack={onBack}
          onDone={onDone}
        />
      ) : (
        <>
          <Stepper current={0} />
          <ClientPicker
            tokens={tokens}
            isLocal={endpoint.isLocal}
            onSelect={onSelect}
          />
        </>
      )}
    </div>
  );
}
