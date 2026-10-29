import { agentArticles } from '../lib/agent-article-seed';
import { articleLanguage, articleLanguages, articleLocales, articleText, type Article, type ArticleLanguage, type ArticleText } from '../lib/articles';

export type { Article };

export async function ensureArticleSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS agent_articles (
    slug TEXT PRIMARY KEY, revision INTEGER NOT NULL, status TEXT NOT NULL,
    category TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
    steps TEXT NOT NULL, body TEXT NOT NULL, prompt TEXT NOT NULL, updated_at TEXT NOT NULL,
    translations TEXT NOT NULL DEFAULT '{}'
  )`).run();
  const columns = await db.prepare('PRAGMA table_info(agent_articles)').all<{ name: string }>();
  if (!(columns.results || []).some(column => column.name === 'translations'))
    await db.prepare(`ALTER TABLE agent_articles ADD COLUMN translations TEXT NOT NULL DEFAULT '{}'`).run();
  // One-time migration of the original six static articles. Once inserted, D1 is authoritative.
  for (const article of agentArticles) {
    await db.prepare(`INSERT OR IGNORE INTO agent_articles
      (slug,revision,status,category,title,summary,steps,body,prompt,updated_at,translations)
      VALUES (?,1,'published',?,?,?,?,?,?,?,?)`)
      .bind(article.slug, article.category, article.title, article.summary,
        JSON.stringify(article.steps), article.body, article.prompt, '2026-10-27T00:00:00.000Z', JSON.stringify(article.translations)).run();
    // Seed rows written before articles had translations get them, unless someone has edited the article since.
    await db.prepare(`UPDATE agent_articles SET translations=? WHERE slug=? AND revision=1 AND translations='{}'`)
      .bind(JSON.stringify(article.translations), article.slug).run();
  }
}

const fromRow = (row: Record<string, unknown>): Article => ({
  slug: String(row.slug), revision: Number(row.revision), status: row.status as Article['status'],
  category: row.category as Article['category'], title: String(row.title), summary: String(row.summary),
  steps: JSON.parse(String(row.steps)), body: String(row.body), prompt: String(row.prompt), updatedAt: String(row.updated_at),
  translations: typeof row.translations === 'string' ? JSON.parse(row.translations) : {},
});

export async function listArticles(db: D1Database, includeDrafts = false): Promise<Article[]> {
  const result = await db.prepare(`SELECT * FROM agent_articles ${includeDrafts ? '' : "WHERE status='published'"} ORDER BY rowid ASC`).all<Record<string, unknown>>();
  return (result.results || []).map(fromRow);
}
export async function getArticle(db: D1Database, slug: string, includeDrafts = false): Promise<Article | null> {
  const row = await db.prepare(`SELECT * FROM agent_articles WHERE slug=? ${includeDrafts ? '' : "AND status='published'"}`).bind(slug).first<Record<string, unknown>>();
  return row ? fromRow(row) : null;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max + 1) : '';
}
/** One language version, or null when its fields are out of bounds. */
function articleFields(input: Record<string, unknown>): ArticleText | null {
  const title = text(input.title, 160);
  const summary = text(input.summary, 300);
  const body = text(input.body, 20000);
  const prompt = text(input.prompt, 10000);
  const steps = Array.isArray(input.steps) ? input.steps.map(step => typeof step === 'string' ? step.trim() : '').filter(Boolean) : [];
  if (!title || title.length > 160 || !summary || summary.length > 300 || body.length > 20000 || prompt.length > 10000 ||
    steps.length < 1 || steps.length > 12 || steps.some(step => step.length > 500)) return null;
  return { title, summary, steps, body, prompt };
}
/** Translations are optional per language; a language left completely blank is dropped rather than rejected. */
function translationFields(input: unknown): Article['translations'] | null {
  if (input === undefined || input === null) return {};
  if (typeof input !== 'object' || Array.isArray(input)) return null;
  const result: Article['translations'] = {};
  for (const lang of articleLocales) {
    const value = (input as Record<string, unknown>)[lang];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'object' || Array.isArray(value)) return null;
    const fields = value as Record<string, unknown>;
    const blank = ['title', 'summary', 'body', 'prompt'].every(key => !text(fields[key], 1)) &&
      (!Array.isArray(fields.steps) || fields.steps.every(step => typeof step !== 'string' || !step.trim()));
    if (blank) continue;
    const parsed = articleFields(fields);
    if (!parsed) return null;
    result[lang] = parsed;
  }
  return result;
}
export async function saveArticle(db: D1Database, input: Record<string, unknown>): Promise<Response> {
  const slug = text(input.slug, 80);
  const category = input.category;
  const status = input.status;
  const revision = input.revision;
  const fields = articleFields(input);
  const translations = translationFields(input.translations);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug === 'manage' || slug.length < 3 || slug.length > 80 ||
    !fields || !['start','prepare','connect'].includes(String(category)) ||
    !['draft','published'].includes(String(status)) || !Number.isInteger(revision) || Number(revision) < 0)
    return Response.json({ error: '文章字段不正确' }, { status: 400 });
  if (!translations) return Response.json({ error: '翻译版本需要填写标题、摘要和至少一条步骤' }, { status: 400 });
  const at = new Date().toISOString();
  const { title, summary, steps, body, prompt } = fields;
  if (revision === 0) {
    const result = await db.prepare(`INSERT OR IGNORE INTO agent_articles
      (slug,revision,status,category,title,summary,steps,body,prompt,updated_at,translations) VALUES (?,1,?,?,?,?,?,?,?,?,?)`)
      .bind(slug, status, category, title, summary, JSON.stringify(steps), body, prompt, at, JSON.stringify(translations)).run();
    if (!result.meta.changes) return Response.json({ error: '文章地址已存在，请刷新' }, { status: 409 });
  } else {
    const result = await db.prepare(`UPDATE agent_articles SET revision=revision+1,status=?,category=?,title=?,summary=?,steps=?,body=?,prompt=?,updated_at=?,translations=? WHERE slug=? AND revision=?`)
      .bind(status, category, title, summary, JSON.stringify(steps), body, prompt, at, JSON.stringify(translations), slug, revision).run();
    if (!result.meta.changes) return Response.json({ error: '文章已更新，请刷新后重试' }, { status: 409 });
  }
  return Response.json(await getArticle(db, slug, true));
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c] || c);
function paragraphs(value: string) { return value.split(/\n\s*\n/).filter(Boolean).map(part => `<p>${escape(part).replaceAll('\n','<br>')}</p>`).join(''); }
// The public page is read without the app, so its own few labels are translated here.
const pageLabels: Record<ArticleLanguage, Record<'brand' | 'kicker' | 'back' | 'steps' | 'details' | 'ask' | 'copy' | 'copied' | 'failed' | 'languages', string>> = {
  'zh-CN': { brand: '就职手帖', kicker: 'AI 求职技巧', back: '← AI 求职技巧', steps: '操作步骤', details: '详细说明', ask: '可以这样问 AI', copy: '复制提问', copied: '已复制提问', failed: '复制失败', languages: '语言' },
  ja: { brand: '就職手帖', kicker: 'AI 就職のヒント', back: '← AI 就職のヒント', steps: '手順', details: '詳しい説明', ask: 'AI への質問例', copy: '質問をコピー', copied: 'コピーしました', failed: 'コピーできませんでした', languages: '言語' },
  en: { brand: 'Career Note', kicker: 'AI job-search tips', back: '← AI job-search tips', steps: 'Steps', details: 'Details', ask: 'Try asking AI', copy: 'Copy prompt', copied: 'Prompt copied', failed: 'Copy failed', languages: 'Language' },
};
const languageNames: Record<ArticleLanguage, string> = { 'zh-CN': '中文', ja: '日本語', en: 'English' };
/** Chinese is the plain URL; translations add `?lang=`. */
export const articleUrl = (origin: string, slug: string, lang: ArticleLanguage) =>
  origin + '/api/career/articles/view/' + slug + (lang === 'zh-CN' ? '' : '?lang=' + lang);

export function articleHtml(article: Article, requestUrl: string, webOrigin: string): Response {
  const url = new URL(requestUrl);
  const lang = articleLanguage(article, url.searchParams.get('lang'));
  const content = articleText(article, lang);
  const label = pageLabels[lang];
  const languages = articleLanguages(article);
  const canonical = articleUrl(url.origin, article.slug, lang);
  const alternates = languages.map(code => `<link rel="alternate" hreflang="${code}" href="${escape(articleUrl(url.origin, article.slug, code))}">`).join('') +
    `<link rel="alternate" hreflang="x-default" href="${escape(articleUrl(url.origin, article.slug, 'zh-CN'))}">`;
  const switcher = languages.length > 1 ? `<nav aria-label="${escape(label.languages)}">${languages.map(code => code === lang
    ? `<span aria-current="page">${languageNames[code]}</span>`
    : `<a href="${escape(articleUrl(url.origin, article.slug, code))}" hreflang="${code}" lang="${code}">${languageNames[code]}</a>`).join('')}</nav>` : '';
  const schema = JSON.stringify({ '@context':'https://schema.org', '@type':'Article', headline:content.title, description:content.summary, inLanguage:lang, mainEntityOfPage:canonical, author:{'@type':'Organization',name:label.brand}, publisher:{'@type':'Organization',name:label.brand} }).replaceAll('<','\\u003c');
  // Readers who came from the app go back in history (no reload, no sign-in screen); others open the tips list.
  const back = webOrigin.replace(/\/$/,'') + '/#tips';
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(content.title)} · ${escape(label.brand)}</title><meta name="description" content="${escape(content.summary)}"><link rel="canonical" href="${escape(canonical)}">${alternates}<meta property="og:type" content="article"><meta property="og:title" content="${escape(content.title)}"><meta property="og:description" content="${escape(content.summary)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:locale" content="${lang === 'zh-CN' ? 'zh_CN' : lang === 'ja' ? 'ja_JP' : 'en_US'}"><script type="application/ld+json">${schema}</script><style>body{margin:0;background:#f4f7fa;color:#203248;font:16px/1.8 system-ui,-apple-system,sans-serif}main{max-width:860px;margin:auto;padding:28px 18px 72px}a{color:#315b8e}.top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}nav{display:flex;gap:6px}nav a,nav span{padding:2px 10px;border-radius:999px;font-size:.85rem;text-decoration:none}nav span{background:#315b8e;color:white}article{background:white;border:1px solid #d9e1e9;border-radius:16px;padding:clamp(24px,5vw,52px);box-shadow:0 12px 38px #253f6210}header{border-bottom:1px solid #d9e1e9;padding-bottom:24px}h1{font-size:clamp(1.9rem,4vw,2.7rem);line-height:1.3;margin:.3em 0}h2{font-size:1.2rem;margin:32px 0 10px}ol{padding-left:24px}li{margin:12px 0}p{white-space:normal}aside{background:#f0f5fa;padding:20px;border-radius:10px;margin-top:30px;white-space:pre-wrap}small{color:#58708d}button{margin-top:14px;padding:10px 16px;border:0;border-radius:8px;background:#315b8e;color:white;cursor:pointer}</style></head><body><main><div class="top"><p><a id="back" href="${escape(back)}">${escape(label.back)}</a></p>${switcher}</div><article><header><small>${escape(label.kicker)} · ${escape(label.brand)}</small><h1>${escape(content.title)}</h1><p>${escape(content.summary)}</p></header><section><h2>${escape(label.steps)}</h2><ol>${content.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol></section>${content.body ? `<section><h2>${escape(label.details)}</h2>${paragraphs(content.body)}</section>` : ''}${content.prompt ? `<section><h2>${escape(label.ask)}</h2><aside id="prompt">${escape(content.prompt)}</aside><button id="copy" type="button">${escape(label.copy)}</button></section>` : ''}</article></main><script>document.getElementById('back').addEventListener('click',e=>{try{if(document.referrer&&new URL(document.referrer).origin===new URL(e.currentTarget.href).origin&&history.length>1){e.preventDefault();history.back()}}catch{}});const copy=document.getElementById('copy');if(copy)copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById('prompt').textContent);copy.textContent=${JSON.stringify(label.copied)}}catch{copy.textContent=${JSON.stringify(label.failed)}}})</script></body></html>`;
  return new Response(html, { headers: { 'content-type':'text/html; charset=utf-8', 'content-language':lang, 'cache-control':'public, max-age=60', 'x-content-type-options':'nosniff' } });
}

export async function articleSitemap(db: D1Database, origin: string): Promise<Response> {
  const articles = await listArticles(db);
  // One <url> per language version, each listing all versions so search engines can pair them.
  const urls = articles.flatMap(article => {
    const languages = articleLanguages(article);
    const links = languages.length > 1 ? languages.map(code => `<xhtml:link rel="alternate" hreflang="${code}" href="${escape(articleUrl(origin, article.slug, code))}"/>`).join('') : '';
    return languages.map(code => `<url><loc>${escape(articleUrl(origin, article.slug, code))}</loc><lastmod>${escape(article.updatedAt.slice(0,10))}</lastmod>${links}</url>`);
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${urls.join('')}</urlset>`;
  return new Response(xml, { headers: { 'content-type':'application/xml; charset=utf-8', 'cache-control':'public, max-age=60' } });
}
