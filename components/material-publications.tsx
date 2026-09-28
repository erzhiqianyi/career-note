'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/career';
import type { Material } from '@/lib/career';
import { API_ORIGIN } from '@/lib/api-base';
import { materialHTML } from '@/worker/material-publication';
import { useLocale } from './locale-provider';

type Publication = {
  id: string;
  materialId: string;
  mode: 'public' | 'unlisted';
  expiresAt: string;
  revokedAt: string;
  path: string;
};

export function MaterialPublications({ material }: { material: Material }) {
  const { t } = useLocale();
  const [items, setItems] = useState<Publication[]>([]);
  const [preview, setPreview] = useState(false);
  const [mode, setMode] = useState<'public' | 'unlisted'>('unlisted');
  const [expiry, setExpiry] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => setItems(await api('material-publications') as Publication[]);
  useEffect(() => { refresh().catch(e => setError(String(e))); }, []);
  const act = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const own = items.filter(item => item.materialId === material.id);
  return <section className="panel material-publications">
    <h3>{t('网页发布')}</h3>
    <p>{t('公开的是此保存版本的正文快照。任何获得链接的人都能查看；请先核对姓名、联系方式、待填写项和内部说明。')}</p>
    {error && <p role="alert" className="inline-note">{error}</p>}
    {!preview && <button className="secondary" onClick={() => { setPreview(true); setConfirmed(false); }}>{t('预览并创建网页链接')}</button>}
    {preview && <div>
      <iframe className="resume-print-preview" sandbox="" title={t('公开网页预览')} srcDoc={materialHTML(material.kind as '履歴書' | '職務経歴書', material.content)} />
      <label>{t('公开方式')}
        <select value={mode} onChange={e => setMode(e.target.value as typeof mode)}>
          <option value="unlisted">{t('仅链接访问 · 请求搜索引擎不收录')}</option>
          <option value="public">{t('公开 · 允许搜索引擎收录')}</option>
        </select>
      </label>
      <label>{t('到期时间（本地时间，留空永久有效）')}
        <input type="datetime-local" value={expiry} onChange={e => setExpiry(e.target.value)} />
      </label>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />{t('我已检查以上公开内容和联系方式')}</label>
      <div className="toolbar">
        <button className="primary" disabled={!confirmed || busy} onClick={() => act(async () => {
          await api('material-publications', { materialId: material.id, mode, expiresAt: expiry ? new Date(expiry).toISOString() : '' });
          await refresh(); setPreview(false);
        })}>{t('创建发布快照')}</button>
        <button onClick={() => setPreview(false)}>{t('关闭预览')}</button>
      </div>
    </div>}
    {own.length > 0 && <ul>{own.map(item => {
      const active = !item.revokedAt && (!item.expiresAt || Date.parse(item.expiresAt) > Date.now());
      const url = typeof window === 'undefined' ? '' : new URL(API_ORIGIN + item.path, window.location.origin).href;
      return <li key={item.id}>{active ? <>
        <a href={url} target="_blank" rel="noreferrer">{t('打开公开页')}</a>{' · '}
        <button className="text-button" onClick={() => act(async () => { await navigator.clipboard.writeText(url); })}>{t('复制链接')}</button>{' · '}
        <button className="text-button" disabled={busy} onClick={() => act(async () => { await api('material-publications/revoke', { id: item.id }); await refresh(); })}>{t('撤下链接')}</button>
        <span> · {item.mode === 'public' ? t('允许收录') : t('仅链接访问')}</span>
      </> : t('链接已撤下或过期')}</li>;
    })}</ul>}
  </section>;
}
