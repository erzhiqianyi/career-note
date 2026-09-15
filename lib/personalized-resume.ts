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
