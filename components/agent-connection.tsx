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
      <EndpointField endpoint={endpoint} />
      <button className="agent-add" onClick={onAdd}>
        <Plus size={20} />
        <span>
          <b>{t('添加 AI 助手')}</b>
        </span>
      </button>
    </section>
  );
}
