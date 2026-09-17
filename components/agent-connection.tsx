'use client';
import { Link2, Plus } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import { EndpointField, useMcpEndpoint } from '@/components/mcp-endpoint';

export default function AgentConnection({ onAdd }: { onAdd: () => void }) {
  const { t } = useLocale();
  const endpoint = useMcpEndpoint();
  return (
    <section className="panel agent-connection">
      <div className="section-head">
        <h2>
          <Link2 size={19} />
          {t('连接你的 AI 助手')}
        </h2>
        <span className="tag">MCP · Streamable HTTP · OAuth 2.1</span>
      </div>
      <p className="agent-lead page-note">
        {t(
          '把下方地址填进任意支持 MCP 的助手，首次连接时在浏览器里登录并同意，助手会自动拿到令牌，不需要手动复制。',
        )}
      </p>
      <EndpointField endpoint={endpoint} />
      <button className="agent-add" onClick={onAdd}>
        <Plus size={20} />
        <span>
          <b>{t('添加 AI 助手')}</b>
          <small>{t('选择客户端 → 复制地址并配置 → 验证授权')}</small>
        </span>
      </button>
    </section>
  );
}
