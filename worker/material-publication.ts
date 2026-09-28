import { plainJapanese } from '../lib/japanese-readings';
import type { Material } from '../lib/career';

export type MaterialPublication = {
  id: string;
  materialId: string;
  kind: '履歴書' | '職務経歴書';
  title: string;
  content: string;
  mode: 'public' | 'unlisted';
  expiresAt: string;
  createdAt: string;
  revokedAt: string;
  path: string;
};

const headers = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
  'Content-Type': 'text/html; charset=utf-8',
  'X-Robots-Tag': 'noindex, nofollow',
};
const json = (value: unknown, status = 200) => Response.json(value, { status });
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const inline = (value: string) => escape(value).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
/** Deliberately small renderer: escaped text, headings, lists and simple tables. */
function renderBody(source: string) {
  const rows = plainJapanese(source).replace(/\r\n/g, '\n').split('\n');
  const output: string[] = [];
  let list = false;
  let table = false;
  const close = () => { if (list) output.push('</ul>'); if (table) output.push('</tbody></table>'); list = table = false; };
  for (let index = 0; index < rows.length; index++) {
    const line = rows[index].trim();
    if (!line) { close(); continue; }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) { close(); output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue; }
    if (/^\|.*\|$/.test(line) && /^\|?[\s:|-]+\|?$/.test(rows[index + 1]?.trim() || '')) {
      close(); output.push('<table><thead><tr>' + line.slice(1, -1).split('|').map(cell => `<th>${inline(cell.trim())}</th>`).join('') + '</tr></thead><tbody>'); table = true; index++; continue;
    }
    if (table && /^\|.*\|$/.test(line)) { output.push('<tr>' + line.slice(1, -1).split('|').map(cell => `<td>${inline(cell.trim())}</td>`).join('') + '</tr>'); continue; }
    if (table) { output.push('</tbody></table>'); table = false; }
    const bullet = /^[-*・]\s+(.+)$/.exec(line);
    if (bullet) { if (!list) { output.push('<ul>'); list = true; } output.push(`<li>${inline(bullet[1])}</li>`); continue; }
    if (list) { output.push('</ul>'); list = false; }
    output.push(`<p>${inline(line)}</p>`);
  }
  close();
  return output.join('');
}

export function materialHTML(kind: MaterialPublication['kind'], content: string) {
  const body = renderBody(content);
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(kind)}</title><style>
@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;color:#17202b;background:#eef1f4;font:16px/1.7 "Hiragino Mincho ProN","Yu Mincho",serif}
main{max-width:840px;min-height:100vh;margin:auto;padding:44px;background:white;overflow-wrap:anywhere}h1{font-size:26px}h2{font-size:20px;border-bottom:1px solid #9aa4ae;padding-bottom:5px}h1,h2,h3{break-after:avoid}
p{white-space:pre-wrap;orphans:3;widows:3}table{width:100%;border-collapse:collapse}td,th{border:1px solid #6d7680;padding:6px;text-align:left}tr,li{break-inside:avoid}thead{display:table-header-group}a{color:inherit}
@media(max-width:600px){main{padding:24px}}@media print{body{background:white;font-size:10.5pt}main{max-width:none;min-height:0;padding:0}}
</style></head><body><main>${body}</main></body></html>`;
}

export async function ensureMaterialPublicationSchema(db: D1Database) {
  await db.prepare("CREATE TABLE IF NOT EXISTS material_publications(id TEXT PRIMARY KEY,owner TEXT NOT NULL,body TEXT NOT NULL,revoked_at TEXT NOT NULL DEFAULT '')").run();
}

export async function listMaterialPublications(db: D1Database, owner: string) {
  const rows = await db.prepare('SELECT body,revoked_at FROM material_publications WHERE owner=? ORDER BY rowid DESC').bind(owner).all<{ body: string; revoked_at: string }>();
  return rows.results.map(row => {
    const { content, ...metadata } = JSON.parse(row.body) as MaterialPublication;
    void content;
    return { ...metadata, revokedAt: row.revoked_at };
  });
}

export async function publishMaterial(db: D1Database, owner: string, input: Record<string, unknown>, material: Material | null) {
  const { materialId, mode, expiresAt } = input;
  if (typeof materialId !== 'string' || !['public', 'unlisted'].includes(String(mode)) || typeof expiresAt !== 'string')
    return json({ error: '发布参数无效' }, 400);
  if (!material || material.id !== materialId || !material.jobId || !['履歴書', '職務経歴書'].includes(material.kind))
    return json({ error: '応募書類不存在' }, 404);
  if (expiresAt && (!Number.isFinite(Date.parse(expiresAt)) || Date.parse(expiresAt) <= Date.now()))
    return json({ error: '有效期必须在未来' }, 400);
  if (material.content.trim().length < 100 || /(^|\n)#{1,6}\s*(出典|來源|来源|提出前|記載内容の確認|応募に向けた補強|待確認)/m.test(material.content))
    return json({ error: '正文仍是占位稿或包含内部说明，请先保存新的投递版' }, 400);
  const id = crypto.randomUUID();
  const publication: MaterialPublication = {
    id, materialId, kind: material.kind as MaterialPublication['kind'], title: material.title,
    content: material.content, mode: mode as MaterialPublication['mode'],
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : '', createdAt: new Date().toISOString(), revokedAt: '',
    path: '/api/career/public-materials/' + id,
  };
  await db.prepare('INSERT INTO material_publications(id,owner,body) VALUES(?,?,?)').bind(id, owner, JSON.stringify(publication)).run();
  return json(publication);
}

export async function revokeMaterialPublication(db: D1Database, owner: string, id: unknown) {
  if (typeof id !== 'string') return json({ error: '链接不存在' }, 404);
  const result = await db.prepare("UPDATE material_publications SET revoked_at=? WHERE owner=? AND id=? AND revoked_at=''").bind(new Date().toISOString(), owner, id).run();
  return result.meta.changes ? json({ ok: true }) : json({ error: '链接不存在或已撤下' }, 404);
}

export async function publicMaterialResponse(db: D1Database, id: string) {
  const row = await db.prepare('SELECT body,revoked_at FROM material_publications WHERE id=?').bind(id).first<{ body: string; revoked_at: string }>();
  if (!row || row.revoked_at) return new Response('Document unavailable', { status: 404, headers });
  const publication: MaterialPublication = JSON.parse(row.body);
  if (publication.expiresAt && Date.parse(publication.expiresAt) <= Date.now())
    return new Response('Document unavailable', { status: 404, headers });
  return new Response(materialHTML(publication.kind, publication.content), {
    headers: { ...headers, 'X-Robots-Tag': publication.mode === 'public' ? 'index, follow' : 'noindex, nofollow' },
  });
}
