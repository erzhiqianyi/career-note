import messages from './messages.json';

export const locales = ['zh-CN', 'ja', 'en'] as const;
export type Locale = (typeof locales)[number];
export const languageKey = 'career-note.locale';
export function resolveLocale(value: string | null | undefined): Locale {
  if (value?.toLowerCase().startsWith('ja')) return 'ja';
  if (value?.toLowerCase().startsWith('en')) return 'en';
  return 'zh-CN';
}
export function translate(
  locale: Locale,
  key: string,
  values: readonly unknown[] = [],
): string {
  const entry = (messages as Record<string, { ja: string; en: string }>)[key];
  const text = locale === 'zh-CN' ? key : (entry?.[locale] ?? key);
  return text.replace(/\{(\d+)\}/g, (match, index) =>
    Number(index) < values.length ? String(values[Number(index)]) : match,
  );
}
