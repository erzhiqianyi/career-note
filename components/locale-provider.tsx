'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  languageKey,
  locales,
  resolveLocale,
  translate,
  type Locale,
} from '@/lib/i18n';

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, values?: readonly unknown[]) => string;
};
const LocaleContext = createContext<LocaleContextValue>({
  locale: 'zh-CN',
  setLocale: () => {},
  t: (key, values) => translate('zh-CN', key, values),
});
// A browser preference, independent of all persisted career data and answer languages.
let sessionLocale: Locale | undefined;
function getSnapshot(): Locale {
  if (sessionLocale) return sessionLocale;
  try {
    const saved = localStorage.getItem(languageKey);
    if (saved) return resolveLocale(saved);
  } catch {
    /* Storage may be disabled. */
  }
  return resolveLocale(navigator.language);
}
function subscribe(onChange: () => void) {
  const sync = (event: StorageEvent) => {
    if (event.key === languageKey || event.key === null) {
      sessionLocale = undefined;
      onChange();
    }
  };
  window.addEventListener('storage', sync);
  window.addEventListener('career-locale-change', onChange);
  return () => {
    window.removeEventListener('storage', sync);
    window.removeEventListener('career-locale-change', onChange);
  };
}
const getServerSnapshot = (): Locale => 'zh-CN';
export function LocaleProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  useEffect(() => {
    document.documentElement.lang = locale;
    document.title = {
      'zh-CN': '就职手帖 · 日本求职准备',
      ja: '就職手帖 · 日本での就職準備',
      en: 'Career Note · Job preparation in Japan',
    }[locale];
  }, [locale]);
  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale(next) {
        if (!locales.includes(next)) return;
        sessionLocale = next;
        try {
          localStorage.setItem(languageKey, next);
        } catch {
          /* Keep the session usable without storage. */
        }
        window.dispatchEvent(new Event('career-locale-change'));
      },
      t: (key, values) => translate(locale, key, values),
    }),
    [locale],
  );
  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}
export function useLocale() {
  return useContext(LocaleContext);
}
export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();
  const label = { 'zh-CN': '界面语言', ja: '表示言語', en: 'Display language' }[
    locale
  ];
  return (
    <label className="language-switcher">
      <span>{label}</span>
      <select
        aria-label={label}
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
      >
        <option value="zh-CN" lang="zh-CN">
          中文
        </option>
        <option value="ja" lang="ja">
          日本語
        </option>
        <option value="en" lang="en">
          English
        </option>
      </select>
    </label>
  );
}
