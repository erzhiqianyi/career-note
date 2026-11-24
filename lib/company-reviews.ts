/**
 * Employee reviews (口コミ) an agent collects from review sites for one company: an overall reading,
 * recurring themes and individual entries, each kept in Japanese with a Chinese translation beside it.
 * Entries stay tied to their source page; they are other people's opinions, not verified company facts.
 */
export type ReviewTone = 'positive' | 'negative' | 'mixed';
export type ReviewTheme = { title: string; tone: ReviewTone; ja: string; zh: string };
export type ReviewEntry = {
  /** Posting date as shown by the site, YYYY-MM-DD or free text such as 「2026年11月」. */
  postedAt: string;
  /** Reviewer attributes as the site shows them, e.g. 「男性／ITエンジニア／退職済み（2024年）」. */
  reviewer: string;
  category: string;
  /** Site score as written, e.g. 「2.4」. */
  rating?: string;
  /** Japanese text: the review or a faithful summary of it. */
  ja: string;
  /** Chinese translation of `ja`. */
  zh: string;
  url?: string;
};
export type CompanyReviews = {
  /** Site-wide score and count with its date, e.g. 「3.9（口コミ220件、2026-11-24時点）」. */
  overall?: string;
  summaryJa: string;
  summaryZh: string;
  themes: ReviewTheme[];
  entries: ReviewEntry[];
  sources: { label: string; url: string }[];
  /** Date the sources were read, YYYY-MM-DD. */
  verifiedAt: string;
};

const LIMITS = { themes: 12, entries: 60, sources: 10 };
const TONES: ReviewTone[] = ['positive', 'negative', 'mixed'];

function text(value: unknown, field: string, max: number, required = false): string {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw Error(`口碑字段必须是文字：${field}`);
  const result = value.trim();
  if (required && !result) throw Error(`口碑缺少字段：${field}`);
  if (result.length > max) throw Error(`口碑字段过长：${field}`);
  return result;
}

function link(value: unknown, field: string, required: boolean): string {
  const url = text(value, field, 2000, required);
  if (!url) return '';
  let parsed: URL;
  try { parsed = new URL(url); } catch { throw Error(`口碑链接必须是完整链接：${field}`); }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw Error(`口碑链接必须是 http 或 https：${field}`);
  return url;
}

function list<T>(value: unknown, field: keyof typeof LIMITS, item: (entry: Record<string, unknown>, path: string) => T): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error(`口碑字段必须是数组：${field}`);
  if (value.length > LIMITS[field]) throw Error(`口碑 ${field} 最多 ${LIMITS[field]} 条`);
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error(`口碑条目必须是对象：${field}[${index}]`);
    return item(entry as Record<string, unknown>, `${field}[${index}]`);
  });
}

/** Checks agent-written reviews; `null` means the record has none. Throws with a user-facing message. */
export function normalizeCompanyReviews(value: unknown): CompanyReviews | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('companyReviews 必须是对象或 null');
  const data = value as Record<string, unknown>;
  const verifiedAt = text(data.verifiedAt, 'verifiedAt', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt) || Number.isNaN(Date.parse(verifiedAt + 'T00:00:00Z')))
    throw Error('companyReviews.verifiedAt 必须是 YYYY-MM-DD');
  const overall = text(data.overall, 'overall', 160);
  const reviews: CompanyReviews = {
    ...(overall ? { overall } : {}),
    summaryJa: text(data.summaryJa, 'summaryJa', 3000, true),
    summaryZh: text(data.summaryZh, 'summaryZh', 3000),
    themes: list(data.themes, 'themes', (entry, path) => {
      const tone = text(entry.tone, path + '.tone', 10, true) as ReviewTone;
      if (!TONES.includes(tone)) throw Error(`口碑 ${path}.tone 只能是 positive、negative 或 mixed`);
      return { title: text(entry.title, path + '.title', 80, true), tone, ja: text(entry.ja, path + '.ja', 1500, true), zh: text(entry.zh, path + '.zh', 1500) };
    }),
    entries: list(data.entries, 'entries', (entry, path) => {
      const rating = text(entry.rating, path + '.rating', 10);
      const url = link(entry.url, path + '.url', false);
      return {
        postedAt: text(entry.postedAt, path + '.postedAt', 30, true),
        reviewer: text(entry.reviewer, path + '.reviewer', 200),
        category: text(entry.category, path + '.category', 60, true),
        ...(rating ? { rating } : {}),
        ja: text(entry.ja, path + '.ja', 4000, true),
        zh: text(entry.zh, path + '.zh', 4000),
        ...(url ? { url } : {}),
      };
    }),
    sources: list(data.sources, 'sources', (entry, path) => ({ label: text(entry.label, path + '.label', 120, true), url: link(entry.url, path + '.url', true) })),
    verifiedAt,
  };
  if (!reviews.sources.length) throw Error('口碑至少需要一个来源链接');
  return reviews;
}
