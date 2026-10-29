'use client';
import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import type { Material } from '@/lib/career';
import { plainFormText, plainJapanese } from '@/lib/japanese-readings';
import { Ja } from '@/components/japanese-text';
import { useLocale } from '@/components/locale-provider';

/** Copy-ready 志望動機: the short ご応募理由 answer and the full body, both without study readings. */
export function ApplicationReason({ material }: { material: Material }) {
  const { t: tr } = useLocale();
  const [copied, setCopied] = useState('');
  const reason = plainJapanese(material.applicationReason || '').trim();
  const copy = async (key: string, text: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(key); }
    catch { setCopied('failed'); }
  };
  const button = (key: string, label: string, text: string) => <button type="button" className="secondary document-copy-button" onClick={() => void copy(key, text)}>
    {copied === key ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}{tr(copied === key ? '已复制' : label)}
  </button>;
  return <>
  <section className="application-reason" lang="ja" aria-label={tr('応募理由・100字版')}>
    <div className="application-reason-heading">
      <h3>{tr('応募理由・100字版')} <small>{tr('{0} / 100 字', [String([...reason].length)])}</small></h3>
      <div>
        {reason && button('reason', '复制应募理由', reason)}
      </div>
    </div>
    {reason ? <p><Ja text={material.applicationReason} /></p> : <p className="muted">{tr('这个版本尚未准备申请表短版。请让 Agent 为这份志望動機补充 100 字以内的応募理由。')}</p>}
    {copied === 'failed' && <p className="muted" role="status">{tr('复制失败，请手动复制。')}</p>}
  </section>
  <div className="motivation-full-heading">
    <h3>{tr('志望動機・完整版')}</h3>
    {button('body', '复制全文（无假名）', plainFormText(material.content))}
  </div>
  </>;
}
