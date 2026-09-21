'use client';
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type SetStateAction } from 'react';

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

export type SubView = { title?: string; onBack: () => void };
/** The page shell provides this; drilled-in views register here so the header's back arrow controls every return. */
export const SubViewContext = createContext<(id: string, view: SubView | null) => void>(() => {});

/** Registers a drilled-in view with the header (back arrow + optional title); renders nothing itself, so all pages return the same way. */
export function RecordBack({ onBack, title }: { onBack: () => void; title?: string }) {
  const register = useContext(SubViewContext);
  const id = useId();
  const latest = useRef(onBack);
  latest.current = onBack;
  useEffect(() => {
    register(id, { title, onBack: () => latest.current() });
    return () => register(id, null);
  }, [register, id, title]);
  return null;
}
