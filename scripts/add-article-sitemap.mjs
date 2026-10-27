import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const apiOrigin = (process.env.NEXT_PUBLIC_CAREER_API_URL || '').trim().replace(/\/+$/, '');
const target = 'dist/client/robots.txt';
if (apiOrigin && existsSync(target)) {
  const url = new URL('/api/career/articles/sitemap.xml', apiOrigin).toString();
  const current = readFileSync(target, 'utf8');
  if (!current.includes(url)) writeFileSync(target, current.trimEnd() + `\nSitemap: ${url}\n`);
}
