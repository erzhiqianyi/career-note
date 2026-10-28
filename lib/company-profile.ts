/**
 * A one-page Japanese company board an agent writes from verified sources:
 * what the company does, why it is strong, how it got here and where it is heading.
 * Every claim stays traceable through `sources`; analysis is kept apart from facts in `outlook` and `concerns`.
 */
export type ProfilePoint = { title: string; detail: string };
export type CompanyProfile = {
  /** One sentence that says what the company is, in Japanese. */
  tagline: string;
  /** Business overview paragraph. */
  overview: string;
  /** Registry-style facts such as 設立, 資本金, 売上高, 本社; values keep their date or 「約」. */
  facts: { label: string; value: string }[];
  /** Business lines; `share` is a sourced figure such as 「売上の約60%（2025年3月期）」. */
  segments: { name: string; detail: string; share?: string }[];
  strengths: ProfilePoint[];
  /** Chronological milestones; `year` is free text such as 「2008年」 or 「2021年4月」. */
  history: { year: string; event: string }[];
  /** Growth outlook: stated plans first, the agent's own reading marked as 分析 in the detail. */
  outlook: ProfilePoint[];
  /** Risks and open questions worth checking in an interview. */
  concerns: ProfilePoint[];
  sources: { label: string; url: string }[];
  /** Date the sources were checked, YYYY-MM-DD. */
  verifiedAt: string;
};

const LIMITS = { facts: 12, segments: 8, strengths: 8, history: 30, outlook: 8, concerns: 8, sources: 20 };

function text(value: unknown, field: string, max: number, required = false): string {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string') throw Error(`企业看板字段必须是文字：${field}`);
  const result = value.trim();
  if (required && !result) throw Error(`企业看板缺少字段：${field}`);
  if (result.length > max) throw Error(`企业看板字段过长：${field}`);
  return result;
}

function list<T>(value: unknown, field: keyof typeof LIMITS, item: (entry: Record<string, unknown>, path: string) => T): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw Error(`企业看板字段必须是数组：${field}`);
  if (value.length > LIMITS[field]) throw Error(`企业看板 ${field} 最多 ${LIMITS[field]} 条`);
  return value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw Error(`企业看板条目必须是对象：${field}[${index}]`);
    return item(entry as Record<string, unknown>, `${field}[${index}]`);
  });
}

const point = (entry: Record<string, unknown>, path: string): ProfilePoint => ({
  title: text(entry.title, path + '.title', 80, true),
  detail: text(entry.detail, path + '.detail', 1200),
});

/** Checks an agent-written board; `null` means the record has none. Throws with a user-facing message. */
export function normalizeCompanyProfile(value: unknown): CompanyProfile | null {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('companyProfile 必须是对象或 null');
  const data = value as Record<string, unknown>;
  const verifiedAt = text(data.verifiedAt, 'verifiedAt', 10, true);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(verifiedAt) || Number.isNaN(Date.parse(verifiedAt + 'T00:00:00Z')))
    throw Error('companyProfile.verifiedAt 必须是 YYYY-MM-DD');
  const profile: CompanyProfile = {
    tagline: text(data.tagline, 'tagline', 160),
    overview: text(data.overview, 'overview', 2000, true),
    facts: list(data.facts, 'facts', (entry, path) => ({ label: text(entry.label, path + '.label', 30, true), value: text(entry.value, path + '.value', 200, true) })),
    segments: list(data.segments, 'segments', (entry, path) => {
      const share = text(entry.share, path + '.share', 80);
      return { name: text(entry.name, path + '.name', 80, true), detail: text(entry.detail, path + '.detail', 1200), ...(share ? { share } : {}) };
    }),
    strengths: list(data.strengths, 'strengths', point),
    history: list(data.history, 'history', (entry, path) => ({ year: text(entry.year, path + '.year', 30, true), event: text(entry.event, path + '.event', 400, true) })),
    outlook: list(data.outlook, 'outlook', point),
    concerns: list(data.concerns, 'concerns', point),
    sources: list(data.sources, 'sources', (entry, path) => {
      const url = text(entry.url, path + '.url', 2000, true);
      let parsed: URL;
      try { parsed = new URL(url); } catch { throw Error(`企业看板来源必须是完整链接：${path}.url`); }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw Error(`企业看板来源必须是 http 或 https 链接：${path}.url`);
      return { label: text(entry.label, path + '.label', 120, true), url };
    }),
    verifiedAt,
  };
  if (!profile.sources.length) throw Error('企业看板至少需要一个来源链接');
  return profile;
}
