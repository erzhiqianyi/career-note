import { z } from 'zod';

export const resumeKinds = [
  'basics',
  'employment',
  'education',
  'project',
  'skill',
  'achievement',
  'language',
  'preferences',
  'document',
] as const;
export type ResumeKind = (typeof resumeKinds)[number];
// 每种语言一套独立记录；旧数据没有该字段，按日语处理。
export const resumeLanguages = ['ja', 'zh', 'en'] as const;
export type ResumeLanguage = (typeof resumeLanguages)[number];
export const resumeLanguageLabels: Record<ResumeLanguage, string> = {
  ja: '日本語',
  zh: '中文',
  en: 'English',
};
export type ResumeField = {
  key: string;
  label: string;
  required?: boolean;
  multiline?: boolean;
  date?: boolean;
};
const field = (
  key: string,
  label: string,
  options: Omit<ResumeField, 'key' | 'label'> = {},
): ResumeField => ({ key, label, ...options });
export const resumeSections: Record<
  ResumeKind,
  { label: string; fields: ResumeField[] }
> = {
  basics: {
    label: '基本资料',
    fields: [
      field('name', '姓名', { required: true }),
      field('reading', '姓名读音'),
      field('headline', '职业定位'),
      field('location', '所在地'),
      field('summary', '职业摘要', { multiline: true }),
      field('website', '个人网站'),
      field('github', 'GitHub'),
    ],
  },
  employment: {
    label: '工作经历',
    fields: [
      field('employer', '雇主', { required: true }),
      field('client', '客户或项目'),
      field('role', '职位', { required: true }),
      field('startDate', '开始年月', { date: true }),
      field('endDate', '结束年月', { date: true }),
      field('location', '工作地点'),
      field('responsibilities', '职责', { multiline: true }),
      field('technologies', '使用技术'),
    ],
  },
  education: {
    label: '教育经历',
    fields: [
      field('school', '学校', { required: true }),
      field('major', '专业或课程'),
      field('degree', '学位'),
      field('startDate', '开始年月', { date: true }),
      field('endDate', '结束年月', { date: true }),
      field('details', '补充说明', { multiline: true }),
    ],
  },
  project: {
    label: '项目经历',
    fields: [
      field('name', '项目名称', { required: true }),
      field('role', '本人角色'),
      field('problem', '解决的问题', { multiline: true }),
      field('contribution', '本人贡献', { multiline: true }),
      field('technologies', '使用技术'),
      field('status', '项目状态'),
      field('url', '项目链接'),
      field('startDate', '开始年月', { date: true }),
      field('endDate', '结束年月', { date: true }),
    ],
  },
  skill: {
    label: '技能',
    fields: [
      field('name', '技能名称', { required: true }),
      field('category', '技能分类'),
      field('usage', '应用场景', { multiline: true }),
      field('years', '使用年数（已确认）'),
    ],
  },
  achievement: {
    label: '成果案例',
    fields: [
      field('title', '成果标题', { required: true }),
      field('context', '背景与问题', { multiline: true }),
      field('action', '本人行动', { multiline: true }),
      field('result', '成果', { multiline: true }),
      field('measurement', '数字口径与限制', { multiline: true }),
    ],
  },
  language: {
    label: '语言能力',
    fields: [
      field('name', '语言', { required: true }),
      field('level', '能力说明'),
      field('qualification', '证书或资格'),
      field('date', '取得年月', { date: true }),
      field('usage', '实际使用场景', { multiline: true }),
    ],
  },
  preferences: {
    label: '求职意向',
    fields: [
      field('roles', '目标岗位', { multiline: true }),
      field('locations', '希望地点'),
      field('availability', '入职时间'),
      field('salary', '希望年薪'),
      field('conditions', '其他条件', { multiline: true }),
    ],
  },
  document: {
    label: '文档版本',
    fields: [
      field('title', '文档标题', { required: true }),
      field('language', '文档语言'),
      field('version', '文档版本', { required: true }),
      field('content', '文档正文', { required: true, multiline: true }),
    ],
  },
};
export const resumeWriteSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    revision: z.number().int().nonnegative(),
    kind: z.enum(resumeKinds),
    language: z.enum(resumeLanguages).default('ja'),
    data: z.record(z.string(), z.string().max(100000)),
    parentId: z.string().max(100).default(''),
    sourceNotes: z.string().max(10000).default(''),
    verification: z
      .enum(['recorded', 'confirmed', 'pending'])
      .default('recorded'),
    archived: z.boolean().default(false),
  })
  .strict();
export type ResumeWrite = z.infer<typeof resumeWriteSchema>;
export type ResumeEntry = ResumeWrite & { updatedAt: string };
export function validateResume(input: unknown): ResumeWrite {
  const entry = resumeWriteSchema.parse(input);
  const fields = resumeSections[entry.kind].fields;
  if (Object.keys(entry.data).some((key) => !fields.some((f) => f.key === key)))
    throw new Error('存在不支持的字段');
  for (const f of fields) {
    const value = (entry.data[f.key] ?? '').trim();
    if (f.required && !value) throw new Error(f.label + '不能为空');
    if (value && f.date && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      throw new Error(f.label + '请使用 YYYY-MM');
    if (value && ['url', 'website', 'github'].includes(f.key)) {
      const u = new URL(value);
      if (!['http:', 'https:'].includes(u.protocol))
        throw new Error('链接必须使用 HTTP 或 HTTPS');
    }
    entry.data[f.key] = value;
  }
  const { startDate, endDate } = entry.data;
  if (startDate && endDate && endDate < startDate)
    throw new Error('结束年月不能早于开始年月');
  return entry;
}
export function resumeTitle(entry: ResumeEntry) {
  return (
    entry.data.name ||
    entry.data.employer ||
    entry.data.school ||
    entry.data.title ||
    entry.data.roles ||
    resumeSections[entry.kind].label
  );
}
