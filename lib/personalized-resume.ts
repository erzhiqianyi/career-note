import { z } from 'zod';
const text = z.string().trim().max(6000);
const link = z
  .object({
    label: z.string().trim().min(1).max(100),
    url: z
      .string()
      .url()
      .max(2000)
      .refine(
        (v) => ['https:', 'http:', 'mailto:'].includes(new URL(v).protocol),
        '仅支持网页或邮件链接',
      ),
  })
  .strict();
export const publicResumeSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    headline: text,
    summary: text,
    location: text,
    links: z.array(link).max(12),
    sections: z
      .array(
        z
          .object({
            heading: z.string().trim().min(1).max(200),
            items: z
              .array(
                z
                  .object({
                    title: z.string().trim().min(1).max(300),
                    subtitle: text,
                    period: z.string().max(100),
                    bullets: z.array(text).max(30),
                  })
                  .strict(),
              )
              .max(30),
          })
          .strict(),
      )
      .max(12),
  })
  .strict();
export const personalizedResumeSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
    revision: z.number().int().nonnegative(),
    title: z.string().trim().min(1).max(200),
    targetRole: text,
    targetCompany: text,
    language: z.enum(['zh', 'ja', 'en']),
    content: publicResumeSchema,
    sourceRefs: z
      .array(
        z
          .object({
            id: z.string().max(100),
            revision: z.number().int().positive(),
          })
          .strict(),
      )
      .max(150),
    privateNotes: z.string().max(20000),
    archived: z.boolean().default(false),
  })
  .strict();
export type PersonalizedResume = z.infer<typeof personalizedResumeSchema> & {
  updatedAt?: string;
};
export type PublicResume = z.infer<typeof publicResumeSchema>;
export type ResumePublication = {
  id: string;
  draftId: string;
  draftRevision: number;
  title: string;
  language: string;
  content: PublicResume;
  mode: 'public' | 'unlisted';
  expiresAt: string;
  revokedAt: string;
  createdAt: string;
  path: string;
};
export const blankResume = (): PersonalizedResume => ({
  id: crypto.randomUUID(),
  revision: 0,
  title: '新的个性化简历',
  targetRole: '',
  targetCompany: '',
  language: 'ja',
  content: {
    name: '',
    headline: '',
    summary: '',
    location: '',
    links: [],
    sections: [],
  },
  sourceRefs: [],
  privateNotes: '',
  archived: false,
});
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
export function resumeHTML(raw: PublicResume, language: string) {
  const c = publicResumeSchema.parse(raw),
    e = escape;
  return `<!doctype html><html lang="${['ja', 'en', 'zh'].includes(language) ? language : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(c.name)} — ${e(c.headline)}</title><style>body{font:16px/1.75 system-ui,sans-serif;color:#243046;background:#f3f5f8;margin:0}main{max-width:800px;margin:32px auto;padding:48px;background:white}h1{font-size:32px;margin:0}h2{font-size:20px;border-bottom:1px solid #ccd3dd;padding-bottom:8px;margin-top:32px}h3{font-size:17px;margin-bottom:0}p{white-space:pre-wrap}a{color:#28559c}small{color:#59677b}li{white-space:pre-wrap;margin-bottom:6px}nav a{margin-right:16px}@media(max-width:600px){main{margin:0;padding:24px}}@media print{body{background:white}main{margin:0;padding:0}article{break-inside:avoid}a{color:inherit}}</style></head><body><main><h1>${e(c.name)}</h1><p>${e(c.headline)}</p><small>${e(c.location)}</small><nav>${c.links.map((l) => `<a href="${e(l.url)}" rel="noopener noreferrer">${e(l.label)}</a>`).join('')}</nav><p>${e(c.summary)}</p>${c.sections.map((s) => `<section><h2>${e(s.heading)}</h2>${s.items.map((i) => `<article><h3>${e(i.title)}</h3><small>${e(i.subtitle)} · ${e(i.period)}</small><ul>${i.bullets.map((b) => `<li>${e(b)}</li>`).join('')}</ul></article>`).join('')}</section>`).join('')}</main></body></html>`;
}

type SourceEntry = {
  id: string;
  revision: number;
  kind: string;
  language?: string;
  archived: boolean;
  verification: string;
  parentId: string;
  data: Record<string, string>;
};
const bullets = (text = '') =>
  text
    .split('\n')
    .map((l) => l.trim().replace(/^(\d+[.、)]|[-•・*])\s*/, ''))
    .filter(Boolean);
const span = (start = '', end = '', language = 'ja') =>
  start ? `${start} — ${end || (language === 'en' ? 'present' : language === 'zh' ? '至今' : '現在')}` : '';
/**
 * 用结构化履历记录预填一份个性化简历草稿：基本资料、职历（含关联成果与项目）、个人项目、技能、学历。
 * 只引用已确认或已有记载的记录，并把引用写进 sourceRefs，方便后续核对。
 */
export function resumeFromEntries(
  entries: SourceEntry[],
  language: 'zh' | 'ja' | 'en',
  target: { company?: string; role?: string } = {},
): PersonalizedResume {
  const used = entries.filter((e) => !e.archived && (e.language || 'ja') === language && e.verification !== 'pending');
  const byKind = (k: string) => used.filter((e) => e.kind === k);
  const desc = (a: SourceEntry, b: SourceEntry) => (b.data.startDate || '').localeCompare(a.data.startDate || '');
  const basics = byKind('basics')[0]?.data || {};
  const employment = byKind('employment').sort(desc);
  const projects = byKind('project');
  const labels = {
    ja: { employment: '職務経歴', projects: '個人プロジェクト・公開作品', skills: 'スキル', education: '学歴', languages: '語学' },
    zh: { employment: '工作经历', projects: '个人项目', skills: '技能', education: '教育经历', languages: '语言能力' },
    en: { employment: 'Experience', projects: 'Personal projects', skills: 'Skills', education: 'Education', languages: 'Languages' },
  }[language];
  const sections: PublicResume['sections'] = [];
  if (employment.length)
    sections.push({
      heading: labels.employment,
      items: employment.map((e) => ({
        title: e.data.employer,
        subtitle: [e.data.role, e.data.client].filter(Boolean).join(' · '),
        period: span(e.data.startDate, e.data.endDate, language),
        bullets: [
          ...bullets(e.data.responsibilities),
          ...used.filter((a) => a.kind === 'achievement' && a.parentId === e.id).map((a) => [a.data.title, a.data.result].filter(Boolean).join('：')),
        ].slice(0, 30),
      })),
    });
  const personal = projects.filter((p) => !p.parentId || !employment.some((e) => e.id === p.parentId)).sort(desc);
  if (personal.length)
    sections.push({
      heading: labels.projects,
      items: personal.map((p) => ({
        title: p.data.name,
        subtitle: [p.data.role, p.data.technologies].filter(Boolean).join(' · '),
        period: p.data.url || span(p.data.startDate, p.data.endDate, language),
        bullets: [p.data.problem, p.data.contribution].filter(Boolean),
      })),
    });
  const skills = byKind('skill');
  const languages = byKind('language');
  if (skills.length || languages.length)
    sections.push({
      heading: labels.skills,
      items: [
        ...skills.map((s) => ({ title: s.data.category || s.data.name, subtitle: s.data.category ? s.data.name : '', period: s.data.years ? s.data.years + (language === 'en' ? ' yrs' : '年') : '', bullets: [] })),
        ...languages.map((l) => ({ title: l.data.name, subtitle: [l.data.level, l.data.qualification].filter(Boolean).join(' · '), period: l.data.date || '', bullets: [] })),
      ],
    });
  const education = byKind('education').sort(desc);
  if (education.length)
    sections.push({
      heading: labels.education,
      items: education.map((e) => ({ title: e.data.school, subtitle: [e.data.major, e.data.degree].filter(Boolean).join(' · '), period: span(e.data.startDate, e.data.endDate, language), bullets: [] })),
    });
  const links: PublicResume['links'] = [];
  if (basics.website) links.push({ label: 'Website', url: basics.website });
  if (basics.github) links.push({ label: 'GitHub', url: basics.github });
  if (basics.email) links.push({ label: 'Email', url: 'mailto:' + basics.email });
  const draft = blankResume();
  return {
    ...draft,
    title:
      [target.company, target.role].filter(Boolean).join(' · ') ||
      { ja: '個別履歴書', zh: '个性化简历', en: 'Personalized resume' }[language] + ' ' + new Date().toISOString().slice(0, 10),
    targetRole: target.role || '',
    targetCompany: target.company || '',
    language,
    content: {
      name: basics.name || '',
      headline: basics.headline || '',
      summary: basics.summary || '',
      location: basics.location || '',
      links,
      sections,
    },
    sourceRefs: used.filter((e) => e.revision > 0).map((e) => ({ id: e.id, revision: e.revision })).slice(0, 150),
  };
}
