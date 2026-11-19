import defaults from './data/job-platforms.json';

/** currentResumeId points at the personalized resume draft used on this platform; the note says which file was uploaded. */
export type JobPlatform = (typeof defaults)[number] & { currentResumeId?: string; currentResumeNote?: string };
export const builtinPlatforms: JobPlatform[] = defaults;
export const resumeIdPattern = /^[a-zA-Z0-9_-]{0,100}$/;

/** Reads and checks only the current-resume pair; shared by the app form and the MCP tool. */
export function platformResumeFields(data: Record<string, unknown>) {
  const id = data.currentResumeId ?? '';
  const note = data.currentResumeNote ?? '';
  if (typeof id !== 'string' || !resumeIdPattern.test(id.trim())) throw Error('请选择有效的简历版本');
  if (typeof note !== 'string' || note.length > 500) throw Error('简历备注不能超过 500 字');
  return { currentResumeId: id.trim(), currentResumeNote: note.trim() };
}
export const platformCategories = [
  'IT・软件工程',
  '双语・国际业务',
  '综合・多行业',
  '转职中介',
  '其他',
];

export function mergePlatforms(overrides: JobPlatform[]): JobPlatform[] {
  const rows = new Map(builtinPlatforms.map((p) => [p.id, { ...p }]));
  for (const p of overrides) rows.set(p.id, p);
  return [...rows.values()];
}

const siteOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

// Second-level labels under which Japanese (and similar) registries hand out names: example.co.jp, not co.jp.
const SHARED_SECOND_LEVEL = new Set(['co', 'ne', 'or', 'ac', 'go', 'ed', 'gr', 'lg', 'ad', 'com', 'net', 'org', 'gov', 'edu']);
/** The part of a host its owner registered: mypage.levtech.jp and career.levtech.jp both give levtech.jp. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const take = labels.at(-1)!.length === 2 && SHARED_SECOND_LEVEL.has(labels.at(-2)!) ? 3 : 2;
  return labels.slice(-take).join('.');
}

/**
 * The media a posting came from, read from the posting URL. A site in the platform list gives that
 * platform's name (`listed`); any other site is named by the recorded platform or its host and is
 * flagged as missing from the list. Without a usable URL the recorded platform is all there is.
 */
export type PostingMedia = { name: string; listed: boolean; site: string };
export function postingMedia(job: { url?: string; sourcePlatform?: string }, platforms: Array<Pick<JobPlatform, 'name' | 'url'> & { deleted?: boolean }> | undefined): PostingMedia | null {
  const active = (platforms || []).filter((p) => !p.deleted);
  const site = siteOf(job.url || '');
  const recorded = job.sourcePlatform?.trim() || '';
  if (site) {
    const domain = registrableDomain(site);
    // Prefer the platform on the very same host (type.jp vs type.career-agent.jp), then one on the same registered domain.
    const platform = active.find((p) => siteOf(p.url) === site) ||
      active.find((p) => { const own = siteOf(p.url); return !!own && registrableDomain(own) === domain; });
    if (platform) return { name: platform.name, listed: true, site };
    return { name: recorded || site, listed: false, site };
  }
  if (!recorded) return null;
  return { name: recorded, listed: active.some((p) => p.name === recorded), site: '' };
}

/** Where a posting lives, by name: the listed platform its URL belongs to, else the recorded platform or host. */
export function postingSource(job: { url: string; sourcePlatform?: string }, platforms: JobPlatform[] | undefined): string {
  return postingMedia(job, platforms)?.name || '';
}

/** Posting sites that jobs link to but the platform list does not know, most used first. */
export function unlistedPostingSites(jobs: Array<{ url?: string; sourcePlatform?: string }>, platforms: JobPlatform[]) {
  const counts = new Map<string, { site: string; name: string; count: number }>();
  for (const job of jobs) {
    const media = postingMedia(job, platforms);
    if (!media || media.listed || !media.site) continue;
    const key = registrableDomain(media.site);
    const entry = counts.get(key) || { site: key, name: media.name === media.site ? key : media.name, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.site.localeCompare(b.site));
}

export function validatePlatform(
  data: Record<string, unknown>,
  old?: JobPlatform,
): JobPlatform {
  if (data.revision !== (old?.revision ?? 0))
    throw Error('平台已更新，请刷新后重新编辑');
  const text = (key: string, max: number, required = false) => {
    const value = data[key] ?? '';
    if (
      typeof value !== 'string' ||
      value.length > max ||
      (required && !value.trim())
    )
      throw Error(`请检查平台字段：${key}`);
    return value.trim();
  };
  const url = text('url', 2000, true);
  try {
    const parsed = new URL(url);
    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      throw Error();
  } catch {
    throw Error('平台网址需要完整的 http 或 https 链接，且不能包含账号密码');
  }
  const category = text('category', 80, true);
  if (!platformCategories.includes(category))
    throw Error('请选择有效的平台类别');
  for (const key of ['enabled', 'favorite', 'deleted']) {
    if (typeof data[key] !== 'boolean') throw Error(`请检查平台字段：${key}`);
  }
  const registered = data.registered === true;
  const accountEmail = text('accountEmail', 254);
  if (accountEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail))
    throw Error('登录邮箱格式不正确');
  return {
    id: old?.id ?? `custom-${crypto.randomUUID()}`,
    name: text('name', 120, true),
    url,
    category,
    description: text('description', 2000),
    cautions: old?.cautions ?? '',
    notes: text('notes', 5000),
    registered,
    accountEmail,
    ...platformResumeFields(data),
    enabled: data.enabled as boolean,
    favorite: data.favorite as boolean,
    deleted: data.deleted as boolean,
    builtin: old?.builtin ?? false,
    sourceUrl: old?.sourceUrl ?? '',
    verifiedAt: old?.verifiedAt ?? '',
    revision: (old?.revision ?? 0) + 1,
  };
}
