import defaults from './data/job-platforms.json';

export type JobPlatform = (typeof defaults)[number];
export const builtinPlatforms: JobPlatform[] = defaults;
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
    enabled: data.enabled as boolean,
    favorite: data.favorite as boolean,
    deleted: data.deleted as boolean,
    builtin: old?.builtin ?? false,
    sourceUrl: old?.sourceUrl ?? '',
    verifiedAt: old?.verifiedAt ?? '',
    revision: (old?.revision ?? 0) + 1,
  };
}
