import { readFile } from 'node:fs/promises';
const [command, file] = process.argv.slice(2);
try {
  if (!['state', 'preview', 'import'].includes(command) || (command !== 'state' && !file)) throw new Error('Usage: node scripts/career-data.mjs state | preview FILE | import FILE');
  const base = process.env.CAREER_API_URL || 'http://127.0.0.1:4211';
  const headers = {};
  if (process.env.CAREER_API_TOKEN) headers.Authorization = `Bearer ${process.env.CAREER_API_TOKEN}`;
  const path = command === 'state' ? 'state' : command === 'preview' ? 'import/preview' : 'import';
  const body = command === 'state' ? undefined : JSON.stringify(JSON.parse(await readFile(file, 'utf8')));
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base.replace(/\/$/, '')}/api/career/${path}`, {method: body ? 'POST' : 'GET', headers, body});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  console.log(JSON.stringify(data, null, 2));
} catch (error) { console.error(error.message); process.exitCode = 1; }
