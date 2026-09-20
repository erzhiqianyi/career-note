'use client';
import { useState, useSyncExternalStore, type SetStateAction } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocale } from './locale-provider';

const subscribe = (notify: () => void) => {
  const navigate = () => { notify(); window.scrollTo(0, 0); };
  window.addEventListener('hashchange', navigate);
  return () => window.removeEventListener('hashchange', navigate);
};
const snapshot = () => window.location.hash;
const serverSnapshot = () => '';

/** Record views have browser history while unsaved edits remain local. */
export function useRecordPage<T>(base: string, view: string, resolve: (id: string) => T | null, identify: (value: T) => string) {
  const prefix = `${base}/${view}/`;
  const hash = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [cache, setCache] = useState<Map<string, T>>(() => new Map());
  const [returnTo, setReturnTo] = useState(base);
  let id: string | null = null;
  if (hash.startsWith(prefix)) {
    try { id = decodeURIComponent(hash.slice(prefix.length)); } catch { /* malformed route */ }
  }
  const value = id === null ? null : cache.get(id) ?? resolve(id);
  const setValue = (action: SetStateAction<T | null>) => {
    const next = typeof action === 'function' ? (action as (v: T | null) => T | null)(value) : action;
    if (next) {
      const key = identify(next);
      const target = prefix + encodeURIComponent(key);
      setCache(previous => new Map(previous).set(key, next));
      if (window.location.hash !== target) {
        setReturnTo(window.location.hash || base);
        window.location.hash = target;
      }
    } else if (window.location.hash.startsWith(prefix)) {
      window.history.replaceState(null, '', returnTo);
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    }
  };
  return [value, setValue] as const;
}

export function RecordBack({ onBack }: { onBack: () => void }) {
  const { t } = useLocale();
  return <button type="button" className="text-button record-back" onClick={onBack}><ArrowLeft size={17} />{t('返回')}</button>;
}
