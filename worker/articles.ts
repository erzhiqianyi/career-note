import { agentArticles } from '../lib/agent-article-seed';

export type Article = {
  slug: string; category: 'start' | 'prepare' | 'connect'; title: string; summary: string;
  steps: string[]; body: string; prompt: string; status: 'draft' | 'published';
  revision: number; updatedAt: string;
};

const seedBody: Record<string, string> = {
  'work-email-to-experience': '一封邮件能证明的是邮件里实际写出的内容。收到任务说明，只能证明任务被提出；本人回复了处理方案，可以支持“提出方案”；完成时间、效果和数字还需要后续记录佐证。\n\n记录邮件日期、主题或消息 ID，并核对项目、本人行动和后续结果。区分雇主、客户、团队与本人工作。输入前可以去除无关的姓名、地址、电话和账号信息。',
};

export async function ensureArticleSchema(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS agent_articles (
    slug TEXT PRIMARY KEY, revision INTEGER NOT NULL, status TEXT NOT NULL,
    category TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL,
    steps TEXT NOT NULL, body TEXT NOT NULL, prompt TEXT NOT NULL, updated_at TEXT NOT NULL
  )`).run();
  // One-time migration of the original six static articles. Once inserted, D1 is authoritative.
  for (const article of agentArticles) {
    await db.prepare(`INSERT OR IGNORE INTO agent_articles
      (slug,revision,status,category,title,summary,steps,body,prompt,updated_at)
      VALUES (?,1,'published',?,?,?,?,?,?,?)`)
      .bind(article.slug, article.category, article.title, article.summary,
        JSON.stringify(article.steps), seedBody[article.slug] || '', article.prompt, '2026-10-27T00:00:00.000Z').run();
  }
}

const fromRow = (row: Record<string, unknown>): Article => ({
  slug: String(row.slug), revision: Number(row.revision), status: row.status as Article['status'],
  category: row.category as Article['category'], title: String(row.title), summary: String(row.summary),
  steps: JSON.parse(String(row.steps)), body: String(row.body), prompt: String(row.prompt), updatedAt: String(row.updated_at),
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
export async function saveArticle(db: D1Database, input: Record<string, unknown>): Promise<Response> {
  const slug = text(input.slug, 80);
  const title = text(input.title, 160);
  const summary = text(input.summary, 300);
  const body = text(input.body, 20000);
  const prompt = text(input.prompt, 10000);
  const category = input.category;
  const status = input.status;
  const revision = input.revision;
  const steps = input.steps;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug === 'manage' || slug.length < 3 || slug.length > 80 ||
    !title || title.length > 160 || !summary || summary.length > 300 || body.length > 20000 ||
    prompt.length > 10000 || !['start','prepare','connect'].includes(String(category)) ||
    !['draft','published'].includes(String(status)) || !Number.isInteger(revision) || Number(revision) < 0 ||
    !Array.isArray(steps) || steps.length < 1 || steps.length > 12 ||
    steps.some(step => typeof step !== 'string' || !step.trim() || step.length > 500))
    return Response.json({ error: '文章字段不正确' }, { status: 400 });
  const at = new Date().toISOString();
  const values = [slug, status, category, title, summary, JSON.stringify(steps.map(step => step.trim())), body, prompt, at];
  if (revision === 0) {
    const result = await db.prepare(`INSERT OR IGNORE INTO agent_articles
      (slug,revision,status,category,title,summary,steps,body,prompt,updated_at) VALUES (?,1,?,?,?,?,?,?,?,?)`)
      .bind(...values).run();
    if (!result.meta.changes) return Response.json({ error: '文章地址已存在，请刷新' }, { status: 409 });
  } else {
    const result = await db.prepare(`UPDATE agent_articles SET revision=revision+1,status=?,category=?,title=?,summary=?,steps=?,body=?,prompt=?,updated_at=? WHERE slug=? AND revision=?`)
      .bind(status, category, title, summary, JSON.stringify(steps.map(step => step.trim())), body, prompt, at, slug, revision).run();
    if (!result.meta.changes) return Response.json({ error: '文章已更新，请刷新后重试' }, { status: 409 });
  }
  return Response.json(await getArticle(db, slug, true));
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c] || c);
function paragraphs(value: string) { return value.split(/\n\s*\n/).filter(Boolean).map(part => `<p>${escape(part).replaceAll('\n','<br>')}</p>`).join(''); }
export function articleHtml(article: Article, requestUrl: string, webOrigin: string): Response {
  const url = new URL(requestUrl);
  const canonical = url.origin + url.pathname;
  const schema = JSON.stringify({ '@context':'https://schema.org', '@type':'Article', headline:article.title, description:article.summary, inLanguage:'zh-CN', mainEntityOfPage:canonical, author:{'@type':'Organization',name:'就职手帖'}, publisher:{'@type':'Organization',name:'就职手帖'} }).replaceAll('<','\\u003c');
  const back = webOrigin.replace(/\/$/,'') + '/#agents';
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(article.title)} · 就职手帖</title><meta name="description" content="${escape(article.summary)}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:type" content="article"><meta property="og:title" content="${escape(article.title)}"><meta property="og:description" content="${escape(article.summary)}"><meta property="og:url" content="${escape(canonical)}"><script type="application/ld+json">${schema}</script><style>body{margin:0;background:#f4f7fa;color:#203248;font:16px/1.8 system-ui,-apple-system,sans-serif}main{max-width:860px;margin:auto;padding:28px 18px 72px}a{color:#315b8e}article{background:white;border:1px solid #d9e1e9;border-radius:16px;padding:clamp(24px,5vw,52px);box-shadow:0 12px 38px #253f6210}header{border-bottom:1px solid #d9e1e9;padding-bottom:24px}h1{font-size:clamp(1.9rem,4vw,2.7rem);line-height:1.3;margin:.3em 0}h2{font-size:1.2rem;margin:32px 0 10px}ol{padding-left:24px}li{margin:12px 0}p{white-space:normal}aside{background:#f0f5fa;padding:20px;border-radius:10px;margin-top:30px;white-space:pre-wrap}small{color:#58708d}button{margin-top:14px;padding:10px 16px;border:0;border-radius:8px;background:#315b8e;color:white;cursor:pointer}</style></head><body><main><p><a href="${escape(back)}">← Agent 协作</a></p><article><header><small>AI 求职技巧 · 就职手帖</small><h1>${escape(article.title)}</h1><p>${escape(article.summary)}</p></header><section><h2>操作步骤</h2><ol>${article.steps.map(step => `<li>${escape(step)}</li>`).join('')}</ol></section>${article.body ? `<section><h2>详细说明</h2>${paragraphs(article.body)}</section>` : ''}<section><h2>可以这样问 AI</h2><aside id="prompt">${escape(article.prompt)}</aside><button id="copy" type="button">复制提问</button></section></article></main><script>document.getElementById('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(document.getElementById('prompt').textContent);document.getElementById('copy').textContent='已复制提问'}catch{document.getElementById('copy').textContent='复制失败'}})</script></body></html>`;
  return new Response(html, { headers: { 'content-type':'text/html; charset=utf-8', 'cache-control':'public, max-age=60', 'x-content-type-options':'nosniff' } });
}

export async function articleSitemap(db: D1Database, origin: string): Promise<Response> {
  const articles = await listArticles(db);
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${articles.map(a => `<url><loc>${escape(origin + '/api/career/articles/view/' + a.slug)}</loc><lastmod>${escape(a.updatedAt.slice(0,10))}</lastmod></url>`).join('')}</urlset>`;
  return new Response(xml, { headers: { 'content-type':'application/xml; charset=utf-8', 'cache-control':'public, max-age=60' } });
}
