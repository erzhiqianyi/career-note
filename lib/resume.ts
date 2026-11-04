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
  'compensation',
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
  /** Whole yen (or hours for `hours`); stored as plain digits. */
  amount?: 'yen' | 'hours';
  options?: readonly { value: string; label: string }[];
};
const field = (
  key: string,
  label: string,
  options: Omit<ResumeField, 'key' | 'label'> = {},
): ResumeField => ({ key, label, ...options });
export const incomeSources = [
  { value: 'withholding', label: '最新的源泉徴収票或住民税決定通知' },
  { value: 'estimate', label: '根据最近的月收和奖金估算' },
  { value: 'other', label: '其他' },
] as const;
/** 月收×12＋奖金; null until the monthly figure is known. Forms reject a 现年收 that does not match it. */
// 职务经历书有两张技能表：按领域归纳的「得意とする分野」，和一项技术一行的「PCスキル/テクニカルスキル」。旧记录没有该字段，按领域处理。
export const skillTypes = [
  { value: 'area', label: '擅长领域（按领域归纳）' },
  { value: 'tech', label: '技术技能（一项技术一行，含年数与水平）' },
] as const;
// 纯数字按年显示；「約半年」「8ヶ月」「母語」等原样显示。
export const formatYears = (years = '', unit = '年') => {
  const v = years.trim();
  return /^\d+(\.\d+)?$/.test(v) ? v + unit : v;
};
// 技术技能按常见分类顺序排列，同一分类内经验长的在前（「約半年」「8ヶ月」也换算成年）。
const techCategoryOrder = ['言語', 'フレームワーク・ライブラリ', 'データベース', 'クラウド・インフラ', 'ツール・その他'];
const yearsValue = (v = '') => {
  const n = Number((v.match(/\d+(\.\d+)?/) || [''])[0]) || 0;
  return /ヶ月|か月|カ月|个月|months?/.test(v) ? n / 12 : /半年/.test(v) ? n + 0.5 : n;
};
const categoryRank = (c = '') => {
  const i = techCategoryOrder.indexOf(c);
  return i < 0 ? techCategoryOrder.length : i;
};
export function sortTechSkills<T extends { data: Record<string, string> }>(skills: T[]) {
  return skills
    .filter((s) => s.data.skillType === 'tech')
    .sort((a, b) =>
      categoryRank(a.data.category) - categoryRank(b.data.category) ||
      (a.data.category || '').localeCompare(b.data.category || '') ||
      yearsValue(b.data.years) - yearsValue(a.data.years) ||
      (a.data.name || '').localeCompare(b.data.name || ''),
    );
}

export function annualFromMonthly(data: Record<string, string>): number | null {
  if (!data.monthlyIncome) return null;
  return Number(data.monthlyIncome) * 12 + Number(data.annualBonus || 0);
}
export const resumeSections: Record<
  ResumeKind,
  { label: string; fields: ResumeField[] }
> = {
  basics: {
    label: '基本资料',
    fields: [
      field('name', '姓名', { required: true }),
      field('reading', '姓名读音'),
      field('birthDate', '出生日期（YYYY-MM-DD，兼容旧年月）'),
      field('postalCode', '邮政编码'),
      field('address', '详细地址'),
      field('addressReading', '地址读音'),
      field('phone', '电话'),
      field('email', '邮箱'),
      field('contactAddress', '其他联系地址（可选）'),
      field('headline', '职业定位'),
      field('location', '所在地'),
      field('summary', '职业摘要', { multiline: true }),
      field('website', '个人网站'),
      field('github', 'GitHub'),
      field('gender', '性别（选填）'),
    ],
  },
  employment: {
    label: '工作经历',
    fields: [
      field('employer', '雇主', { required: true }),
      // Japanese forms often ask for the company in English; only the official English name, never a made-up one.
      field('employerEn', '雇主英文名称'),
      field('client', '客户或项目'),
      field('role', '职位', { required: true }),
      field('startDate', '开始年月', { date: true }),
      field('endDate', '结束年月', { date: true }),
      field('location', '工作地点'),
      field('responsibilities', '职责', { multiline: true }),
      field('technologies', '使用技术'),
      field('historyNote', '履歴書职历栏的一行说明'),
    ],
  },
  education: {
    label: '教育经历',
    fields: [
      field('school', '学校', { required: true }),
      // Official Japanese name, or the name in Japanese kanji (新字体) when there is none.
      field('schoolJa', '学校日语名称'),
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
      field('brief', '简历简介（填写后进入職務経歴書的個人開発）', { multiline: true }),
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
      field('skillType', '记录类型', { options: skillTypes }),
      field('usage', '应用场景', { multiline: true }),
      field('years', '经验年数（数字按年显示，也可写「約半年」「8ヶ月」）'),
      field('skillLevel', '技能水平・备注'),
    ],
  },
  achievement: {
    label: '成果案例',
    fields: [
      field('title', '成果标题', { required: true }),
      field('context', 'S｜背景与状况', { multiline: true }),
      field('task', 'T｜需要完成的任务', { multiline: true }),
      field('action', 'A｜本人行动', { multiline: true }),
      field('result', 'R｜成果与影响', { multiline: true }),
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
      field('experience', '技能表「经验年数」栏（如「母語」「4年間の業務使用」）'),
      field('skillLevel', '技能水平・备注'),
    ],
  },
  preferences: {
    label: '求职意向',
    fields: [
      field('role', '目标岗位'),
      field('rationale', '投递理由与匹配依据', { multiline: true }),
      field('selfPr', '自己PR（「・」开头的行是小标题）', { multiline: true }),
      field('roles', '旧版目标岗位（兼容）', { multiline: true }),
      field('locations', '希望地点'),
      field('availability', '入职时间'),
      field('salary', '希望年薪'),
      field('conditions', '其他条件', { multiline: true }),
    ],
  },
  // 応募フォームの「現在の状況・職歴 › 年収詳細・諸手当 / 年収参照先」。税込額で、源泉徴収票や給与明細に合わせて記入する。
  compensation: {
    label: '现年收明细',
    fields: [
      field('annualIncome', '现年收（税前）', { amount: 'yen' }),
      field('monthlyIncome', '月收（含各种津贴的税前总额）', { amount: 'yen' }),
      field('overtimeHours', '每月加班时间', { amount: 'hours' }),
      field('overtimePay', '加班费（每月）', { amount: 'yen' }),
      field('housingAllowance', '住房补贴（每月）', { amount: 'yen' }),
      field('companyHousing', '寮・社宅的公司负担（每月）', { amount: 'yen' }),
      field('allowance1Name', '其他津贴 1 名称'),
      field('allowance1Amount', '其他津贴 1 金额（每月）', { amount: 'yen' }),
      field('allowance2Name', '其他津贴 2 名称'),
      field('allowance2Amount', '其他津贴 2 金额（每月）', { amount: 'yen' }),
      field('annualBonus', '年间奖金', { amount: 'yen' }),
      field('incomeSource', '年收参照先', { options: incomeSources }),
      field('incomeSourceNote', '参照先说明（选择「其他」时必填）', { multiline: true }),
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
    if (value && f.key === 'birthDate') {
      if (!/^\d{4}-(0[1-9]|1[0-2])(-(?:0[1-9]|[12]\d|3[01]))?$/.test(value) ||
        (value.length === 10 && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) !== value))
        throw new Error('出生日期请使用有效的 YYYY-MM-DD（或旧版 YYYY-MM）');
    }
    if (value && f.date && !/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      throw new Error(f.label + '请使用 YYYY-MM');
    if (value && f.amount) {
      const plain = value.replace(/[,，\s]/g, '').replace(/円$/, '');
      if (!(f.amount === 'hours' ? /^\d{1,3}(\.\d{1,2})?$/ : /^\d{1,12}$/).test(plain))
        throw new Error(f.label + (f.amount === 'hours' ? '请填写小时数' : '请填写以日元为单位的整数'));
      entry.data[f.key] = plain;
      continue;
    }
    if (value && f.options && !f.options.some((option) => option.value === value))
      throw new Error(f.label + '的选项不正确');
    if (value && ['url', 'website', 'github'].includes(f.key)) {
      const u = new URL(value);
      if (!['http:', 'https:'].includes(u.protocol))
        throw new Error('链接必须使用 HTTP 或 HTTPS');
    }
    entry.data[f.key] = value;
  }
  if (entry.kind === 'preferences' && !entry.data.role && !entry.data.roles)
    throw new Error('目标岗位不能为空');
  if (entry.kind === 'compensation') {
    // One record for every interface language; the application forms it feeds are Japanese.
    entry.language = 'ja';
    if (entry.data.incomeSource === 'other' && !entry.data.incomeSourceNote)
      throw new Error('选择「其他」时请填写参照先说明');
    const computed = annualFromMonthly(entry.data);
    if (computed !== null && entry.data.annualIncome && computed !== Number(entry.data.annualIncome))
      throw new Error(`月收×12＋奖金（${computed.toLocaleString('ja-JP')} 円）与现年收（${Number(entry.data.annualIncome).toLocaleString('ja-JP')} 円）不一致`);
  }
  const { startDate, endDate } = entry.data;
  if (startDate && endDate && endDate < startDate)
    throw new Error('结束年月不能早于开始年月');
  return entry;
}
export function resumeTitle(entry: ResumeEntry) {
  return (
    entry.data.name ||
    entry.data.role ||
    entry.data.employer ||
    entry.data.school ||
    entry.data.title ||
    entry.data.roles ||
    resumeSections[entry.kind].label
  );
}
