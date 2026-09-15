'use client';
import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useLocale } from '@/components/locale-provider';
import { localEndpoint } from '@/lib/mcp-clients';

const storageKey = 'career-note.mcp-endpoint';

/** MCP address shared between the overview and every client guide. */
export function useMcpEndpoint() {
  const [url, setUrl] = useState('');
  const [defaultUrl, setDefaultUrl] = useState('');
  useEffect(() => {
    const href = new URL('/api/career/mcp', window.location.origin).href;
    setDefaultUrl(href);
    let saved = '';
    try {
      saved = localStorage.getItem(storageKey) || '';
    } catch {
      /* ignore */
    }
    setUrl(saved || href);
  }, []);
  const update = (next: string) => {
    setUrl(next);
    try {
      if (next.trim() && next.trim() !== defaultUrl)
        localStorage.setItem(storageKey, next.trim());
      else localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  };
  const endpoint = url.trim() || defaultUrl;
  return {
    url,
    endpoint,
    defaultUrl,
    isLocal: localEndpoint.test(endpoint),
    update,
  };
}

export function useCopy() {
  const [copied, setCopied] = useState('');
  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setCopied('');
    }
  };
  return { copied, copy };
}

export function CodeBlock({
  code,
  id,
  copied,
  copy,
  wrap,
}: {
  code: string;
  id: string;
  copied: string;
  copy: (text: string, key: string) => void;
  wrap?: boolean;
}) {
  const { t } = useLocale();
  return (
    <div className={wrap ? 'agent-code wrap' : 'agent-code'}>
      <pre>
        <code>{code}</code>
      </pre>
      <button aria-label={t('复制')} onClick={() => copy(code, id)}>
        {copied === id ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function EndpointField({
  endpoint,
}: {
  endpoint: ReturnType<typeof useMcpEndpoint>;
}) {
  const { t } = useLocale();
  const { copied, copy } = useCopy();
  return (
    <>
      <label className="agent-endpoint-label" htmlFor="mcp-endpoint">
        {t('MCP 服务地址')}
      </label>
      <div className="agent-endpoint">
        <input
          id="mcp-endpoint"
          value={endpoint.url}
          spellCheck={false}
          onChange={(e) => endpoint.update(e.target.value)}
          placeholder={endpoint.defaultUrl}
        />
        <button
          onClick={() => void copy(endpoint.endpoint, 'url')}
          disabled={!endpoint.endpoint}
        >
          {copied === 'url' ? <Check size={15} /> : <Copy size={15} />}
          {copied === 'url' ? t('已复制') : t('复制地址')}
        </button>
      </div>
      <p className="agent-note">
        {endpoint.isLocal
          ? t(
              '这是本机地址，只有本机运行的助手能访问。托管服务需要先运行 npm run dev:tunnel，再把打印的 Public MCP endpoint 粘贴到上方。',
            )
          : t('公开地址：本机与托管的助手都可以使用。')}
      </p>
    </>
  );
}
