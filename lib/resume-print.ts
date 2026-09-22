import { resumeTitle, type ResumeEntry } from './resume';

/**
 * 从结构化履历记录生成可打印的 A4 文档（自包含 HTML，浏览器「打印 → 保存为 PDF」）。
 * 两种模板：参考厚生劳动省样式的「履歴書」和「職務経歴書」。只读取记录，不改写数据。
 */
export type PrintTemplate = 'rirekisho' | 'shokumu';
export type PrintOptions = {
  template: PrintTemplate;
  /** 是否把「待确认」的记录也打印出来；默认不打印，避免未核对的数字进入提交稿。 */
  includePending?: boolean;
  /** 打印日期，默认今天。 */
  date?: string;
  /** 应募先名称，写在标题下方（可选）。 */
  company?: string;
  photo?: string;
  motivation?: string;
  wishes?: string;
};

const escape = (v = '') =>
  v.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
const lines = (text = '') =>
  text
    .replace(/\\r\\n|\\n/g, '\n').split('\n')
    .map((l) => l.trim().replace(/^(\d+[.、)]|[-•・*])\s*/, ''))
    .filter(Boolean);
const ym = (v = '') => {
  const m = /^(\d{4})-(\d{2})$/.exec(v);
  return m ? { y: m[1], m: String(Number(m[2])) } : { y: '', m: '' };
};
const jaDate = (v = '') => {
  const { y, m } = ym(v);
  return y ? `${y}年${m}月` : '';
};
const period = (start = '', end = '') => (start ? `${jaDate(start)}～${end ? jaDate(end) : '終了年月未入力'}` : '');
const fullDate = (v = '') => {
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(v);
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : jaDate(v);
};
export function resumePrintWarnings(entries: ResumeEntry[], template: PrintTemplate) {
  const b = entries.find(e => e.kind === 'basics')?.data || {};
  const warnings: string[] = [];
  for (const [key, label] of [['name', '姓名'], ['reading', '姓名读音'], ['email', '邮箱']])
    if (!b[key]) warnings.push(label);
  if (template === 'rirekisho') for (const [key, label] of [['birthDate', '出生日期'], ['address', '详细地址'], ['phone', '电话']])
    if (!b[key] || (key === 'birthDate' && b[key].length !== 10)) warnings.push(label);
  if (entries.some(e => ['employment', 'education'].includes(e.kind) && (!e.data.startDate || !e.data.endDate))) warnings.push('经历起止年月（未填写结束年月不会视为在职）');
  if (entries.some(e => Object.values(e.data).some(v => /待确认|待填写|TODO|XXX|〇〇/.test(v)))) warnings.push('正文中的待填写或占位文字');
  return warnings;
}
export function resumePrintFilename(name: string, template: PrintTemplate, date: string) {
  return [template === 'rirekisho' ? '履歴書' : '職務経歴書', name, date].filter(Boolean).join('_').replace(/[\\/:*?"<>|]/g, '-');
}

export function printableEntries(entries: ResumeEntry[], language: string, includePending = false) {
  return entries.filter(
    (e) => !e.archived && (e.language || 'ja') === language && (includePending || e.verification !== 'pending'),
  );
}

type Model = ReturnType<typeof buildModel>;
function buildModel(entries: ResumeEntry[]) {
  const byKind = (k: ResumeEntry['kind']) => entries.filter((e) => e.kind === k);
  const desc = (a: ResumeEntry, b: ResumeEntry) => (b.data.startDate || '').localeCompare(a.data.startDate || '');
  const asc = (a: ResumeEntry, b: ResumeEntry) => (a.data.startDate || '').localeCompare(b.data.startDate || '');
  const employment = byKind('employment').sort(desc);
  const projects = byKind('project');
  return {
    basics: byKind('basics')[0]?.data || {},
    employment,
    education: byKind('education').sort(asc),
    workProjects: (id: string) => projects.filter((p) => p.parentId === id).sort(desc),
    personalProjects: projects.filter((p) => !p.parentId || !employment.some((e) => e.id === p.parentId)).sort(desc),
    achievements: (id: string) => byKind('achievement').filter((a) => a.parentId === id),
    skills: byKind('skill').sort((a, b) => (a.data.category || '').localeCompare(b.data.category || '')),
    languages: byKind('language'),
    preferences: byKind('preferences')[0]?.data || {},
  };
}

const baseCss = `
@page { size: A4; margin: 14mm 16mm; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { margin: 0; color: #111; background: #e9ecf0; font-family: "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", "Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, serif; font-size: 10.5pt; line-height: 1.6; }
.page { width: 210mm; max-width: 100%; min-height: 297mm; margin: 12mm auto; padding: 14mm 16mm; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
.page + .page { page-break-before: always; }
h1 { font-size: 20pt; letter-spacing: .5em; margin: 0 0 6mm; font-weight: 600; }
h2 { break-after: avoid; font-size: 12pt; margin: 8mm 0 3mm; padding-bottom: 1.5mm; border-bottom: 1.5px solid #111; font-weight: 700; }
h3 { break-after: avoid; font-size: 11pt; margin: 4mm 0 1.5mm; font-weight: 700; }
p { margin: 0 0 2mm; white-space: pre-wrap; }
ul { margin: 0 0 2mm; padding-left: 5mm; }
li { margin-bottom: 1mm; }
table { width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #111; padding: 1.6mm 2.4mm; vertical-align: top; text-align: left; font-weight: 400; }
th { background: #f2f2f2; white-space: nowrap; }
.meta { text-align: right; font-size: 9.5pt; margin-bottom: 4mm; }
.muted { color: #555; font-size: 9pt; }
.avoid { break-inside: avoid; }
tr, li { break-inside: avoid; }
thead { display: table-header-group; }
p { orphans: 3; widows: 3; overflow-wrap: anywhere; }
td { overflow-wrap: anywhere; }
@media print { body { background: #fff; } .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; } .toolbar { display: none; } }
`;

function rirekisho(m: Model, o: PrintOptions) {
  const b = m.basics;
  const eduRows: { y: string; m: string; text: string }[] = [];
  for (const e of m.education) {
    const school = [e.data.school, e.data.major].filter(Boolean).join('　');
    const d1 = ym(e.data.startDate);
    if (d1.y) eduRows.push({ y: d1.y, m: d1.m, text: school + '　入学' });
    const d2 = ym(e.data.endDate);
    if (d2.y) eduRows.push({ y: d2.y, m: d2.m, text: school + (e.data.degree ? '　卒業' : '　修了') });
  }
  const workRows: typeof eduRows = [];
  for (const e of [...m.employment].reverse()) {
    const employer = e.data.employer || '';
    const d1 = ym(e.data.startDate);
    if (d1.y) workRows.push({ y: d1.y, m: d1.m, text: `${employer}　入社（${e.data.role}）` });
    const d2 = ym(e.data.endDate);
    if (d2.y) workRows.push({ y: d2.y, m: d2.m, text: `${employer}　退職` });
  }
  const history = [
    { y: '', m: '', text: '学歴', head: true },
    ...eduRows,
    { y: '', m: '', text: '職歴', head: true },
    ...workRows,
    { y: '', m: '', text: '以上', end: true },
  ];
  const quals = m.languages
    .filter((l) => l.data.qualification)
    .map((l) => ({ ...ym(l.data.date), text: `${l.data.qualification}　取得` }));
  const cell = (r: { y: string; m: string; text: string; head?: boolean; end?: boolean }) =>
    `<tr><td class="y">${escape(r.y)}</td><td class="m">${escape(r.m)}</td><td class="${r.head ? 'head' : r.end ? 'end' : ''}">${escape(r.text)}</td></tr>`;
  const links = [b.email].filter(Boolean).map(escape).join('<br>');
  const css = `
.rirekisho h1 { display: flex; justify-content: space-between; align-items: flex-end; }
.rirekisho h1 small { font-size: 9.5pt; letter-spacing: 0; font-weight: 400; }
.id { display: grid; grid-template-columns: 1fr 30mm; gap: 4mm; align-items: start; }
.photo { height: 40mm; border: 1px dashed #777; display: grid; place-items: center; font-size: 8pt; color: #777; text-align: center; padding: 2mm; }
.id table th { width: 24mm; }
.id .name { font-size: 16pt; line-height: 1.3; }
.id .kana { font-size: 8.5pt; color: #444; }
.hist td.y { width: 16mm; text-align: center; } .hist td.m { width: 10mm; text-align: center; }
.hist td.head { text-align: center; font-weight: 700; } .hist td.end { text-align: right; }
.box { min-height: 30mm; }
`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>履歴書 — ${escape(b.name)}</title><style>${baseCss}${css}</style></head><body>
<div class="page rirekisho">
<h1>履歴書 <small>${escape(fullDate(o.date))}現在</small></h1>
<div class="id">
<table>
<tr><th>ふりがな</th><td class="kana">${escape(b.reading || '')}</td></tr>
<tr><th>氏名</th><td class="name">${escape(b.name || '')}</td></tr>
<tr><th>生年月日</th><td>${b.birthDate ? escape(fullDate(b.birthDate)) + '生' : '　'}</td></tr>
<tr><th>性別（任意）</th><td>${escape(b.gender || '')}</td></tr>
<tr><th>ふりがな</th><td class="kana">${escape(b.addressReading || '')}</td></tr>
<tr><th>現住所</th><td>${escape([b.postalCode, b.address || b.location].filter(Boolean).join('　'))}</td></tr>
<tr><th>電話番号</th><td>${escape(b.phone || '')}</td></tr>
<tr><th>E-mail</th><td>${links}</td></tr>
<tr><th>連絡先</th><td>${escape(b.contactAddress || '')}<br><small>現住所以外に連絡を希望する場合のみ記入</small></td></tr>
</table>
<div class="photo">${o.photo && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(o.photo) ? `<img alt="証明写真" src="${o.photo}" style="width:100%;height:100%;object-fit:contain">` : '写真（必要な場合）<br>縦40mm×横30mm'}</div>
</div>
<h2>学歴・職歴</h2>
<table class="hist"><thead><tr><th class="y">年</th><th class="m">月</th><th>学歴・職歴</th></tr></thead><tbody>${history.slice(0, 12).map(cell).join('')}</tbody></table>
</div>
<div class="page rirekisho">
<h2>学歴・職歴（続き）</h2>
<table class="hist"><thead><tr><th>年</th><th>月</th><th>学歴・職歴</th></tr></thead><tbody>${history.slice(12).map(cell).join('') || cell({ y: '', m: '', text: '' })}</tbody></table>
<h2>免許・資格</h2>
<table class="hist"><thead><tr><th class="y">年</th><th class="m">月</th><th>免許・資格</th></tr></thead><tbody>${quals.length ? quals.map(cell).join('') : cell({ y: '', m: '', text: '' })}</tbody></table>
<h2>志望の動機・特技・アピールポイントなど</h2>
<div class="box"><p>${escape(o.motivation ?? '')}</p></div>
<h2>本人希望記入欄</h2>
<div class="box"><p>${escape(o.wishes ?? '')}</p></div>
</div>
</body></html>`;
}

function shokumu(m: Model, o: PrintOptions) {
  const b = m.basics;
  const skillRows = m.skills
    .map(
      (s) =>
        `<tr><th>${escape(s.data.category || '')}</th><td>${escape(s.data.name)}</td><td class="num">${escape(s.data.years ? s.data.years + '年' : '')}</td></tr>`,
    )
    .join('');
  const langRows = m.languages
    .map((l) => `<tr><th>${escape(l.data.name)}</th><td>${escape([l.data.level, l.data.qualification && l.data.date ? `${l.data.qualification}（${jaDate(l.data.date)}）` : l.data.qualification].filter(Boolean).join('、'))}</td></tr>`)
    .join('');
  const employment = m.employment
    .map((e) => {
      const projects = m.workProjects(e.id);
      const achievements = m.achievements(e.id);
      return `<section class="job">
<h3>${escape(e.data.employer)}${e.data.client ? `　<span class="muted">${escape(e.data.client)}</span>` : ''}</h3>
<table class="job-meta">
<tr><th>期間</th><td>${escape(period(e.data.startDate, e.data.endDate))}</td><th>職種・役割</th><td>${escape(e.data.role)}</td></tr>
<tr><th>勤務地</th><td>${escape(e.data.location || '')}</td><th>使用技術</th><td>${escape(e.data.technologies || '')}</td></tr>
</table>
${e.data.responsibilities ? `<p class="lbl">主な担当業務</p><ul>${lines(e.data.responsibilities).map((l) => `<li>${escape(l)}</li>`).join('')}</ul>` : ''}
${achievements.length ? `<p class="lbl">主な実績</p><ul>${achievements.map((a) => `<li><b>${escape(a.data.title)}</b>${a.data.result ? '：' + escape(a.data.result) : ''}</li>`).join('')}</ul>` : ''}
${projects.length ? `<p class="lbl">担当プロジェクト</p><ul>${projects.map((p) => `<li><b>${escape(p.data.name)}</b>${p.data.role ? `（${escape(p.data.role)}）` : ''}${p.data.contribution ? '：' + escape(p.data.contribution) : ''}</li>`).join('')}</ul>` : ''}
</section>`;
    })
    .join('');
  // 個人プロジェクトは上位3件を本文に、残りは1行にまとめる（開始年月の新しい順）。
  const featured = m.personalProjects.slice(0, 3);
  const rest = m.personalProjects.slice(3);
  const personal = featured
    .map(
      (p) => `<section class="avoid"><h3>${escape(p.data.name)}${p.data.status ? `　<span class="muted">${escape(p.data.status)}</span>` : ''}</h3>
<p class="muted">${escape([p.data.role, p.data.technologies].filter(Boolean).join('　／　'))}${p.data.url ? `　${escape(p.data.url)}` : ''}</p>
${p.data.problem ? `<p>${escape(p.data.problem)}</p>` : ''}${p.data.contribution ? `<p>${escape(p.data.contribution)}</p>` : ''}</section>`,
    )
    .join('') + (rest.length ? `<p class="muted">その他：${rest.map((p) => escape(p.data.name) + (p.data.url ? `（${escape(p.data.url)}）` : '')).join('、')}</p>` : '');
  const css = `
.shokumu h1 { letter-spacing: .3em; }
.head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #111; padding-bottom: 2mm; margin-bottom: 4mm; }
.head .who { text-align: right; font-size: 9.5pt; }
.head .who b { font-size: 12pt; display: block; }
.job { margin-bottom: 5mm; }
.job-meta th { width: 20mm; } .job-meta td { width: 30%; }
.lbl { margin: 2.5mm 0 1mm; font-weight: 700; font-size: 10pt; }
.num { width: 14mm; text-align: right; white-space: nowrap; }
.skills th { width: 32mm; }
`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>職務経歴書 — ${escape(b.name)}</title><style>${baseCss}${css}</style></head><body>
<div class="page shokumu">
<div class="head"><h1 style="margin:0">職務経歴書</h1><div class="who">${escape(fullDate(o.date))}現在<b>${escape(b.name || '')}</b>${o.company ? escape(o.company) + ' 御中' : ''}</div></div>
${b.headline ? `<p><b>${escape(b.headline)}</b></p>` : ''}
<h2>職務要約</h2>
<p>${escape(b.summary || '')}</p>
${skillRows ? `<h2>活かせる経験・知識・技術</h2><table class="skills"><thead><tr><th>分野</th><th style="width:auto">技術・経験</th><th class="num">経験年数</th></tr></thead><tbody>${skillRows}</tbody></table>` : ''}
${langRows ? `<h3>語学</h3><table class="skills">${langRows}</table>` : ''}
<h2>職務経歴</h2>
${employment}
${personal ? `<h2>個人プロジェクト・公開作品</h2>${personal}` : ''}
<h2>学歴</h2>
<ul>${m.education.map((e) => `<li>${escape(period(e.data.startDate, e.data.endDate))}　${escape([e.data.school, e.data.major, e.data.degree].filter(Boolean).join('　'))}</li>`).join('')}</ul>
${m.preferences.rationale ? `<h2>自己PR</h2><p>${escape(m.preferences.rationale)}</p>` : ''}

<p class="muted" style="text-align:right;margin-top:6mm">以上</p>
</div>
</body></html>`;
}

export function resumePrintHTML(entries: ResumeEntry[], options: PrintOptions) {
  const model = buildModel(entries.filter(e => !e.archived && (options.includePending || e.verification !== 'pending')));
  return options.template === 'rirekisho' ? rirekisho(model, options) : shokumu(model, options);
}

export const printTemplateLabels: Record<PrintTemplate, string> = {
  rirekisho: '履歴書',
  shokumu: '職務経歴書',
};

/** 打印页里显示的记录摘要，帮助用户核对哪些记录被引用。 */
export function printSources(entries: ResumeEntry[]) {
  return entries.map((e) => resumeTitle(e));
}
