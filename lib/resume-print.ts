import { formatYears, resumeTitle, sortTechSkills, type ResumeEntry } from './resume';
import { plainJapanese } from './japanese-readings';

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
  /** 本次投递使用的邮箱；省略时用基本资料里的邮箱。 */
  email?: string;
};

const escape = (v = '') =>
  plainJapanese(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c);
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
/** 雇用形态写在职务经历书的元信息行里，不重复进公司名。 */
const employerName = (v = '') => v.replace(/（(?:正社員|契約社員|派遣社員|業務委託)）$/, '');
/** 读音字段可能附带通称说明，履歴書只取读音本身。 */
const nameReading = (v = '') => v.replace(/[（(].*$/, '').trim();
const age = (birth = '', on = '') => {
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birth);
  const d = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(on);
  if (!b || !d) return '';
  return String(Number(d[1]) - Number(b[1]) - (d[2] + d[3] < b[2] + b[3] ? 1 : 0));
};
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
body { margin: 0; color: #111; background: #e9ecf0; font-family: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", system-ui, sans-serif; font-size: 9.5pt; line-height: 1.55; }
.page { width: 210mm; max-width: 100%; min-height: 297mm; margin: 12mm auto; padding: 14mm 16mm; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.12); }
.page + .page { page-break-before: always; }
h1 { font-size: 18pt; margin: 0; font-weight: 700; }
h2 { break-after: avoid; font-size: 10.5pt; margin: 5mm 0 1.5mm; font-weight: 700; }
h3 { break-after: avoid; font-size: 9.5pt; margin: 1.5mm 0 0; font-weight: 700; }
p { margin: 0 0 1.5mm; white-space: pre-wrap; orphans: 3; widows: 3; overflow-wrap: anywhere; }
table { width: 100%; border-collapse: collapse; }
td, th { border: 1px solid #999; padding: 1.3mm 2mm; vertical-align: middle; text-align: left; font-weight: 400; overflow-wrap: anywhere; }
th { background: #eee; }
tr, li { break-inside: avoid; }
thead { display: table-header-group; }
ul { margin: 0 0 2mm; padding-left: 5mm; }
.muted { color: #555; font-size: 8.5pt; }
.avoid { break-inside: avoid; }
@media print { body { background: #fff; } .page { width: auto; min-height: 0; margin: 0; padding: 0; box-shadow: none; } }
`;

type Row = { y: string; m: string; text: string; head?: boolean; end?: boolean };
function historyRows(m: Model) {
  const eduRows: Row[] = [];
  for (const e of m.education) {
    const school = e.data.schoolJa || e.data.school || '';
    const label = e.data.degree && e.data.major ? `${school}　${e.data.major}専攻` : school;
    const d1 = ym(e.data.startDate);
    if (d1.y) eduRows.push({ ...d1, text: `${label}　入学${e.data.endDate ? '' : '（在学中）'}` });
    const d2 = ym(e.data.endDate);
    if (d2.y) eduRows.push({ ...d2, text: `${label}　${e.data.degree ? `卒業（${e.data.degree}）` : '修了'}` });
  }
  const workRows: Row[] = [];
  for (const e of [...m.employment].reverse()) {
    const d1 = ym(e.data.startDate);
    if (d1.y) workRows.push({ ...d1, text: `${employerName(e.data.employer)}　入社` });
    if (e.data.historyNote) workRows.push({ y: '', m: '', text: e.data.historyNote });
    const d2 = ym(e.data.endDate);
    if (d2.y) workRows.push({ ...d2, text: '同社　退職' });
  }
  return [{ y: '', m: '', text: '学歴', head: true }, ...eduRows, { y: '', m: '', text: '職歴', head: true }, ...workRows, { y: '', m: '', text: '以上', end: true }] as Row[];
}
const qualification = (v = '') => v.replace(/^JLPT\s*/, '日本語能力試験（JLPT）');
function qualificationRows(m: Model) {
  const certified: Row[] = m.languages.filter((l) => l.data.qualification)
    .map((l) => ({ ...ym(l.data.date), text: `${qualification(l.data.qualification)}　${/JLPT/.test(l.data.qualification) ? '合格' : '取得'}` }));
  // 没有证书但有业务使用经验的外语也写在这里；母语不写。
  const used: Row[] = m.languages.filter((l) => !l.data.qualification && l.data.experience && l.data.experience !== '母語')
    .map((l) => ({ y: '', m: '', text: `${plainJapanese(l.data.name)}：${l.data.experience}` }));
  const rows = [...certified, ...used];
  return rows.length ? [...rows, { y: '', m: '', text: '以上', end: true }] : rows;
}
const birthLine = (b: Record<string, string>, date = '') => {
  if (!b.birthDate) return '';
  const years = age(b.birthDate, date);
  return `${fullDate(b.birthDate)}生${years ? `（満${years}歳）` : ''}${b.gender ? `　性別：${b.gender}` : ''}`;
};
const address = (b: Record<string, string>) => b.address || b.location || '';

function rirekisho(m: Model, o: PrintOptions) {
  const b = m.basics;
  const cell = (r: Row) =>
    `<tr><td class="y">${escape(r.y)}</td><td class="m">${escape(r.m)}</td><td class="${r.head ? 'head' : r.end ? 'end' : ''}">${escape(r.text)}</td></tr>`;
  const table = (title: string, rows: Row[]) =>
    `<table class="hist"><thead><tr><th class="y">年</th><th class="m">月</th><th class="c">${title}</th></tr></thead><tbody>${(rows.length ? rows : [{ y: '', m: '', text: '' }]).map(cell).join('')}</tbody></table>`;
  const box = (title: string, text = '', height: number) =>
    `<table class="box"><thead><tr><th class="c">${title}</th></tr></thead><tbody><tr><td style="height:${height}mm"><p>${escape(text)}</p></td></tr></tbody></table>`;
  const contact = b.contactAddress && b.contactAddress !== '同上' ? `<tr><th>連絡先</th><td>${escape(b.contactAddress)}</td></tr>` : '';
  const css = `
.top { display: grid; grid-template-columns: 1fr 30mm; gap: 4mm; align-items: end; }
.title { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 1.5mm; }
.id th { width: 20mm; text-align: center; background: none; font-size: 8pt; }
.id .name { font-size: 15pt; line-height: 1.3; }
.id .kana { font-size: 8pt; }
.photo { width: 30mm; height: 40mm; border: 1px dashed #777; display: grid; place-items: center; font-size: 8pt; color: #777; text-align: center; padding: 2mm; }
.photo.filled { border: 0; padding: 0; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.hist { margin-top: 4mm; }
.hist td, .hist th { padding: 1.5mm 2mm; }
.y { width: 18mm; text-align: center; } .m { width: 12mm; text-align: center; } .c { text-align: center; }
.hist td.y, .hist td.m { text-align: center; }
.hist td.head { text-align: center; } .hist td.end { text-align: right; }
.box { margin-bottom: 4mm; } .box td { vertical-align: top; padding: 2.5mm 3mm; }
`;
  const photo = o.photo && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(o.photo)
    ? `<div class="photo filled"><img alt="証明写真" src="${o.photo}"></div>`
    : '<div class="photo">写真<br>縦40mm×横30mm</div>';
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>履歴書 — ${escape(b.name)}</title><style>${baseCss}${css}</style></head><body>
<div class="page rirekisho">
<div class="top"><div>
<div class="title"><h1>履歴書</h1><span>${escape(fullDate(o.date))}現在</span></div>
<table class="id">
<tr><th>ふりがな</th><td class="kana">${escape(nameReading(b.reading))}</td></tr>
<tr><th>氏名</th><td class="name">${escape(b.name || '')}</td></tr>
<tr><th>生年月日</th><td>${escape(birthLine(b, o.date)) || '　'}</td></tr>
<tr><th>ふりがな</th><td class="kana">${escape(b.addressReading || '')}</td></tr>
<tr><th>現住所</th><td>${b.postalCode ? `〒${escape(b.postalCode)}<br>` : ''}${escape(address(b))}</td></tr>
<tr><th>電話</th><td>${escape(b.phone || '')}</td></tr>
<tr><th>E-mail</th><td>${escape(o.email || b.email || '')}</td></tr>
${contact}
</table>
</div>${photo}</div>
${table('学歴・職歴', historyRows(m))}
${table('免許・資格', qualificationRows(m))}
</div>
<div class="page rirekisho">
${box('志望動機', o.motivation, 50)}
${box('本人希望記入欄', o.wishes, 45)}
</div>
</body></html>`;
}

const pipe = (v = '') => plainJapanese(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
function rirekishoMarkdown(m: Model, o: PrintOptions) {
  const b = m.basics;
  const rows = (rs: Row[]) => rs.map((r) => `| ${r.y} | ${r.m} | ${pipe(r.text)} |`).join('\n');
  const info: [string, string][] = [
    ['ふりがな', nameReading(b.reading)], ['氏名', b.name || ''], ['生年月日', birthLine(b, o.date)], ['ふりがな', b.addressReading || ''],
    ['現住所', [b.postalCode && `〒${b.postalCode}`, address(b)].filter(Boolean).join(' ')], ['電話', b.phone || ''], ['E-mail', o.email || b.email || ''],
  ];
  return [
    '# 履歴書', `${fullDate(o.date)}現在`,
    `| 項目 | 内容 |\n| --- | --- |\n${info.map(([k, v]) => `| ${k} | ${pipe(v)} |`).join('\n')}`,
    '## 学歴・職歴', `| 年 | 月 | 学歴・職歴 |\n| --- | --- | --- |\n${rows(historyRows(m))}`,
    '## 免許・資格', `| 年 | 月 | 免許・資格 |\n| --- | --- | --- |\n${rows(qualificationRows(m))}`,
    '## 志望動機', plainJapanese(o.motivation || ''),
    '## 本人希望記入欄', plainJapanese(o.wishes || ''),
  ].filter(Boolean).join('\n\n');
}

type Duty = { label: string; text: string } | { heading: string; text: string } | { text: string };
/** 职责按「見出し：本文」写；「担当」「組織」「開発手法」归到表格顶部，其余是业务项目。 */
function duties(text = ''): Duty[] {
  return lines(text).map((line) => {
    const i = line.indexOf('：');
    const key = i > 0 && i <= 40 ? line.slice(0, i) : '';
    const value = key ? line.slice(i + 1) : line;
    if (key === '担当' || key === '組織' || key === '開発手法') return { label: key, text: value };
    return key ? { heading: key, text: value } : { text: line };
  });
}
function jobParts(e: ResumeEntry, m: Model) {
  const items = duties(e.data.responsibilities);
  const labels = items.filter((d): d is { label: string; text: string } => 'label' in d);
  if (e.data.client) labels.splice(Math.min(1, labels.length), 0, { label: '担当案件', text: e.data.client });
  // 职责已写全时不再追加成果和项目记录，它们描述的是同一批工作。
  const fallback = items.length ? [] : [
    ...m.achievements(e.id).map((a) => ({ heading: a.data.title, text: a.data.result || '' })),
    ...m.workProjects(e.id).map((p) => ({ heading: p.data.name, text: p.data.contribution || '' })),
  ];
  return {
    meta: ['雇用形態：' + (/（(正社員|契約社員|派遣社員|業務委託)）$/.exec(e.data.employer)?.[1] || ''), '職種：' + e.data.role, '勤務地：' + (e.data.location || '')].filter((v) => !v.endsWith('：')).join(' ／ '),
    labels,
    work: [...items.filter((d) => !('label' in d)), ...fallback] as ({ heading: string; text: string } | { text: string })[],
  };
}
const featuredProjects = (m: Model) => {
  const briefed = m.personalProjects.filter((p) => p.data.brief);
  return briefed.length ? briefed : m.personalProjects.slice(0, 3);
};
const projectMeta = (p: ResumeEntry) => [p.data.url, p.data.technologies].filter(Boolean).join('　／　');
const projectText = (p: ResumeEntry) => p.data.brief || p.data.contribution || '';
function languageLines(m: Model) {
  const certified = m.languages.filter((l) => l.data.qualification)
    .map((l) => `${jaDate(l.data.date)}　${qualification(l.data.qualification)}　${/JLPT/.test(l.data.qualification) ? '合格' : '取得'}`.trim());
  const other = m.languages.filter((l) => !l.data.qualification)
    .map((l) => `${plainJapanese(l.data.name)}：${l.data.experience || l.data.level || ''}`);
  return [...certified, other.join('／')].filter(Boolean);
}
const selfPr = (m: Model) => lines2(m.preferences.selfPr || m.preferences.rationale || '');
/** 自己PR 里以「・」开头的行是小标题，其余是正文。 */
function lines2(text: string) {
  return plainJapanese(text).replace(/\\r\\n|\\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean)
    .map((l) => (/^[・•]/.test(l) ? { heading: l.replace(/^[・•]\s*/, '') } : { text: l }));
}

function shokumu(m: Model, o: PrintOptions) {
  const b = m.basics;
  const groups = new Map<string, { name: string; years: string; level: string }[]>();
  for (const s of sortTechSkills(m.skills)) {
    const category = s.data.category || 'その他';
    groups.set(category, [...(groups.get(category) || []), { name: s.data.name, years: formatYears(s.data.years) || '－', level: s.data.skillLevel || '' }]);
  }
  const techRows = [...groups]
    .map(([category, items]) =>
      items
        .map((s, i) => `<tr>${i ? '' : `<th rowspan="${items.length}">${escape(category)}</th>`}<td>${escape(s.name)}</td><td class="yrs">${escape(s.years)}</td><td>${escape(s.level)}</td></tr>`)
        .join(''),
    )
    .join('');
  // 没有逐项技术记录时才用按领域归纳的表。
  const skillRows = techRows ? '' : m.skills
    .filter((s) => s.data.skillType !== 'tech')
    .map((s) => `<tr><th>${escape(s.data.category || '')}</th><td>${escape(s.data.name)}</td><td class="yrs">${escape(formatYears(s.data.years))}</td></tr>`)
    .join('');
  const employment = m.employment
    .map((e) => {
      const { meta, labels, work } = jobParts(e, m);
      const top = labels.map((d) => `<p>【${escape(d.label)}】${escape(d.text)}</p>`).join('');
      const rows = work.map((d) => `<tr><td class="period"></td><td>${'heading' in d ? `<h3>・${escape(d.heading)}</h3>` : ''}<p>${escape(d.text)}</p></td></tr>`).join('');
      const tech = e.data.technologies ? `<tr><td class="period"></td><td class="muted">【言語・環境】${escape(e.data.technologies)}</td></tr>` : '';
      const dates = [jaDate(e.data.startDate), '～', e.data.endDate ? jaDate(e.data.endDate) : '終了年月未入力'].map(escape).join('<br>');
      return `<section class="job">
<h3>勤務先：${escape(employerName(e.data.employer))}</h3>
<p class="muted">${escape(meta)}</p>
<table class="work"><thead><tr><th class="period c">期間</th><th class="c">業務内容</th></tr></thead><tbody><tr><td class="period dates">${dates}</td><td>${top}</td></tr>${rows}${tech}</tbody></table>
</section>`;
    })
    .join('');
  const projects = featuredProjects(m);
  const personal = projects.map((p) => `<section class="avoid"><h3>・${escape(p.data.name)}</h3><p class="muted">${escape(projectMeta(p))}</p><p>${escape(projectText(p))}</p></section>`).join('');
  const pr = selfPr(m).map((l) => ('heading' in l ? `<h3>・${escape(l.heading)}</h3>` : `<p>${escape(l.text)}</p>`)).join('');
  const css = `
@page { margin: 12mm 15mm; }
.shokumu { font-size: 8.8pt; line-height: 1.45; }
.shokumu h2 { margin: 3.5mm 0 1mm; }
.shokumu p { margin-bottom: 1mm; }
.shokumu h1 { text-align: center; font-size: 16pt; }
.who { text-align: right; margin-bottom: 2mm; }
.tech { table-layout: fixed; }
.tech td, .tech th { padding: .25mm 1.5mm; font-size: 8pt; line-height: 1.3; }
.tech .cat { width: 30mm; } .tech .kind { width: 38mm; }
.tech th { background: none; }
.tech thead th, .skills thead th { background: #eee; text-align: center; }
.yrs { width: 17mm; white-space: nowrap; }
.job { margin-bottom: 3mm; }
.job > h3, .job > .muted { break-after: avoid; margin-bottom: .5mm; }
.work td, .work th { border: 0; border-left: 1px solid #999; padding: .4mm 2mm; vertical-align: top; }
.work thead { display: table-row-group; }
.work { border: 1px solid #666; }
.work thead th { background: #eee; border-bottom: 1px solid #999; }
.work .period { width: 20mm; padding-left: .5mm; padding-right: .5mm; text-align: center; font-size: 8pt; white-space: nowrap; }
.c { text-align: center; }
`;
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>職務経歴書 — ${escape(b.name)}</title><style>${baseCss}${css}</style></head><body>
<div class="page shokumu">
<h1>職務経歴書</h1>
<div class="who">${escape(fullDate(o.date))}現在<br>氏名：${escape(b.name || '')}${o.company ? `<br>${escape(o.company)} 御中` : ''}</div>
<h2>■職務要約</h2>
${(b.summary || '').split(/\n\s*\n/).map((p) => `<p>${escape(p)}</p>`).join('')}
${techRows ? `<h2>■テクニカルスキル</h2><table class="skills tech"><thead><tr><th class="cat">カテゴリ</th><th class="kind">種別</th><th class="yrs">経験年数</th><th>スキルレベル・備考</th></tr></thead><tbody>${techRows}</tbody></table>` : ''}
${skillRows ? `<h2>■活かせる経験・知識・技術</h2><table class="skills"><thead><tr><th>分野</th><th>技術・経験</th><th class="yrs">経験年数</th></tr></thead><tbody>${skillRows}</tbody></table>` : ''}
<h2>■職務経歴</h2>
${employment}
${personal ? `<h2>■個人開発</h2>${personal}` : ''}
${b.github ? `<p>GitHub：${escape(b.github)}</p>` : ''}
${m.languages.length ? `<h2>■資格・語学</h2>${languageLines(m).map((l) => `<p>${escape(l)}</p>`).join('')}` : ''}
${pr ? `<h2>■自己PR</h2>${pr}` : ''}
<p style="text-align:right;margin-top:3mm">以上</p>
</div>
</body></html>`;
}

function shokumuMarkdown(m: Model, o: PrintOptions) {
  const b = m.basics;
  const plain = plainJapanese;
  const out: string[] = ['# 職務経歴書', `${fullDate(o.date)}現在 氏名：${plain(b.name || '')}`, '## 職務要約', plain(b.summary || '')];
  const tech = sortTechSkills(m.skills);
  if (tech.length) out.push('## テクニカルスキル', `| カテゴリ | 種別 | 経験年数 | スキルレベル・備考 |\n| --- | --- | --- | --- |\n${tech.map((s) => `| ${pipe(s.data.category || 'その他')} | ${pipe(s.data.name)} | ${pipe(formatYears(s.data.years) || '－')} | ${pipe(s.data.skillLevel || '')} |`).join('\n')}`);
  out.push('## 職務経歴');
  for (const e of m.employment) {
    const { meta, labels, work } = jobParts(e, m);
    out.push(`### ${plain(employerName(e.data.employer))}`, `${period(e.data.startDate, e.data.endDate)}\n${plain(meta)}`);
    if (labels.length) out.push(labels.map((d) => `【${d.label}】${plain(d.text)}`).join('\n'));
    for (const d of work) out.push('heading' in d ? `**${plain(d.heading)}**\n${plain(d.text)}` : plain(d.text));
    if (e.data.technologies) out.push(`【言語・環境】${plain(e.data.technologies)}`);
  }
  const projects = featuredProjects(m);
  if (projects.length) out.push('## 個人開発', ...projects.map((p) => `**${plain(p.data.name)}**\n${plain(projectMeta(p))}\n${plain(projectText(p))}`));
  if (b.github) out.push(`GitHub：${b.github}`);
  if (m.languages.length) out.push('## 資格・語学', languageLines(m).join('\n'));
  const pr = selfPr(m);
  if (pr.length) out.push('## 自己PR', pr.map((l) => ('heading' in l ? `**${l.heading}**` : l.text)).join('\n'));
  out.push('以上');
  return out.filter(Boolean).join('\n\n');
}

export function resumePrintHTML(entries: ResumeEntry[], options: PrintOptions) {
  const model = buildModel(entries.filter(e => !e.archived && (options.includePending || e.verification !== 'pending')));
  return options.template === 'rirekisho' ? rirekisho(model, options) : shokumu(model, options);
}

/** 同一份资料的 Markdown 版本，导出时存成 materials 快照。 */
export function resumePrintMarkdown(entries: ResumeEntry[], options: PrintOptions) {
  const model = buildModel(entries.filter(e => !e.archived && (options.includePending || e.verification !== 'pending')));
  return options.template === 'rirekisho' ? rirekishoMarkdown(model, options) : shokumuMarkdown(model, options);
}

export const printTemplateLabels: Record<PrintTemplate, string> = {
  rirekisho: '履歴書',
  shokumu: '職務経歴書',
};

/** 打印页里显示的记录摘要，帮助用户核对哪些记录被引用。 */
export function printSources(entries: ResumeEntry[]) {
  return entries.map((e) => resumeTitle(e));
}
