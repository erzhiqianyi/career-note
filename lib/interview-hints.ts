import type { Job, Question } from './career';
import type { ResumeEntry } from './resume';

/**
 * Per-question hints for interview practice, derived locally from the job posting and the
 * structured résumé: which terms the answer can use, which of the employer's terms the résumé
 * lacks, and which posting lines / résumé records the question is really about.
 */
export type Hints = {
  /** Terms from the question or posting that the résumé also uses — safe to say out loud. */
  keywords: string[];
  /** Terms the posting asks for around this question that the résumé never mentions. */
  gaps: string[];
  /** Posting lines that overlap with the question, with the field they came from. */
  company: { field: string; text: string }[];
  /** Résumé records that overlap with the question, with the lines that matched. */
  resume: { id: string; kind: string; title: string; lines: string[] }[];
};

const JOB_FIELDS: Array<[Exclude<keyof Job, 'history' | 'revision'>, string]> = [
  ['requirements', '応募要件'],
  ['description', '仕事内容'],
  ['matchNotes', 'マッチ理由'],
  ['business', '企業情報'],
  ['japanese', '日本語要件'],
  ['unknowns', '未確認事項'],
];
// Katakana words too generic to be worth a chip.
const KATAKANA_STOP = new Set(['データ', 'システム', 'エンジニア', 'プロジェクト', 'チーム', 'メンバー', 'レベル', 'サービス', 'ツール', 'ユーザー', 'ドキュメント', 'スキル', 'タイプ', 'ポジション', 'エピソード', 'キャッチアップ']);
const LATIN_STOP = new Set(['the', 'and', 'for', 'with', 'etc', 'star', 'or', 'of', 'to', 'in', 'on', 'api', 'it', 'ok', 'web', 'os', 'ms', 'ec', 'pos', 'id', 'ai', 'ui', 'faq', 'jlpt', 'co', 'ltd', 'inc', 'group']);
// Product names that span two tokens; matched before single tokens so "Cloud" and "Composer" do not become separate chips.
const PHRASES = ['Cloud Composer', 'Cloud Run', 'Cloud Functions', 'Vertex AI', 'GitHub Actions', 'Looker Studio', 'Power BI', 'SQL Server', 'Spring Boot', 'Spring Data JPA', 'App Store', 'Data Factory', 'Compute Engine', 'Cloud Workers', 'Cloudflare Pages', 'Cloudflare Workers', 'Vision OCR', 'Code Review'];
// Kanji concepts that interviewers and postings share; substring match because kanji has no word boundary.
const CONCEPTS = [
  '設計', '運用', '品質', '障害', '性能', '改善', '分散', '金融', '医療', '決済', '要件定義', '要件', '監視', '冪等', '再実行', '自動化',
  '移行', '最適化', '基盤', '規制', '可視化', '標準化', '共通化', 'リリース', '回帰', '保守', '負荷', '再現性', '集計', '抽出', '取り込み',
  '検知', '鮮度', '変換', '整合性', '調査', '切り分け', '要件整理', '顧客対応', '英語', '日本語', '在留資格', '個人開発', '受託', '常駐',
  '育成', '指導', '協業', '顧客', 'コスト', 'ボトルネック', 'スケジューリング', 'パフォーマンス', 'リファクタリング', 'ドメイン', 'テスト', 'レビュー',
];

const normalize = (s: string) => s.toLowerCase();

/** Terms in a text: Latin tokens, katakana runs and known kanji concepts, keyed by lower case. */
export function terms(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const phrase of PHRASES) {
    if (text.toLowerCase().includes(phrase.toLowerCase())) {
      found.set(normalize(phrase), phrase);
      text = text.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ');
    }
  }
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9+#./-]*[A-Za-z0-9+#]/g)) {
    const key = normalize(m[0]);
    if (key.length < 2 || LATIN_STOP.has(key) || /^\d/.test(key)) continue;
    if (!found.has(key)) found.set(key, m[0]);
  }
  for (const m of text.matchAll(/[ァ-ヶー]{3,}/g)) {
    if (KATAKANA_STOP.has(m[0]) || m[0].length > 14) continue;
    if (!found.has(m[0])) found.set(m[0], m[0]);
  }
  for (const c of CONCEPTS) if (text.includes(c) && !found.has(c)) found.set(c, c);
  // "要件定義" also matches "要件"; keep the longer concept only.
  for (const c of CONCEPTS) for (const other of CONCEPTS) if (c !== other && c.includes(other) && found.has(c)) found.delete(other);
  return found;
}

const splitLines = (text: string) =>
  text.split(/\n|(?<=[。！？])/).map((l) => l.replace(/^[-・•\s]+/, '').trim()).filter((l) => l.length >= 6);

const RESUME_TITLE: Record<string, (d: Record<string, string>) => string> = {
  achievement: (d) => d.title,
  employment: (d) => [d.employer, d.role].filter(Boolean).join(' · '),
  project: (d) => d.name,
  skill: (d) => d.name,
  language: (d) => d.name,
  basics: (d) => d.headline || d.name,
  education: (d) => [d.school, d.major].filter(Boolean).join(' · '),
  preferences: (d) => d.role || d.roles,
};
// Fields whose lines are worth quoting back; identifiers and dates are not.
const RESUME_SKIP = new Set(['url', 'website', 'github', 'email', 'phone', 'startDate', 'endDate', 'date', 'birthDate', 'status', 'version', 'title', 'name']);

export function buildHints(question: Question, job: Job | undefined, resume: ResumeEntry[]): Hints {
  const qTerms = terms([question.title, question.questionJa, question.meaning, question.outline, question.followUps, question.why].join('\n'));
  const jobLines = job
    ? JOB_FIELDS.flatMap(([key, field]) => splitLines(job[key] || '').map((text) => ({ field, text, terms: terms(text) })))
    : [];
  // Relevant terms: the question's own, plus what the posting says in the same breath.
  const relevant = new Map(qTerms);
  const hits = (t: Map<string, string>) => [...t.keys()].filter((k) => qTerms.has(k)).length;
  for (const line of jobLines) if (hits(line.terms)) for (const [k, v] of line.terms) if (!relevant.has(k)) relevant.set(k, v);
  const jobTerms = new Map<string, string>();
  for (const line of jobLines) for (const [k, v] of line.terms) if (!jobTerms.has(k)) jobTerms.set(k, v);

  const entries = resume
    .filter((e) => !e.archived && e.kind !== 'document')
    .map((e) => {
      const lines = Object.entries(e.data).filter(([k, v]) => v && !RESUME_SKIP.has(k)).flatMap(([, v]) => splitLines(v));
      return { entry: e, lines: lines.map((text) => ({ text, terms: terms(text) })), terms: terms(Object.values(e.data).join('\n')) };
    });
  const resumeTerms = new Set<string>();
  for (const e of entries) for (const k of e.terms.keys()) resumeTerms.add(k);

  const score = (t: Map<string, string>) => [...t.keys()].reduce((n, k) => n + (qTerms.has(k) ? 2 : relevant.has(k) ? 1 : 0), 0);
  // Question terms first, then product / language names before kanji concepts, in a locale-independent order.
  const latin = (k: string) => Number(/^[\x20-\x7e]+$/.test(k));
  const order = (a: string, b: string) => Number(qTerms.has(b)) - Number(qTerms.has(a)) || latin(b) - latin(a) || a.localeCompare(b, 'en');
  const pick = () => [...relevant.keys()].filter((k) => resumeTerms.has(k)).sort(order).slice(0, 12).map((k) => relevant.get(k)!);
  let keywords = pick();
  // Broad questions (opening, motivation) share few terms with the résumé; the match notes say what to bring up for this company.
  if (keywords.length < 3) {
    for (const l of jobLines) if (l.field === 'マッチ理由') for (const [k, v] of l.terms) if (!relevant.has(k)) relevant.set(k, v);
    keywords = pick();
  }
  const gaps = [...relevant.keys()].filter((k) => jobTerms.has(k) && !resumeTerms.has(k)).sort(order).slice(0, 6).map((k) => relevant.get(k)!);

  const company = jobLines
    .map((l) => ({ ...l, score: score(l.terms) }))
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(({ field, text }) => ({ field, text }));
  // Broad questions (self-introduction, motivation) rarely share terms with a posting line; fall back to the match notes.
  if (job && company.length < 2) {
    for (const l of jobLines) if (l.field === 'マッチ理由' && company.length < 3 && !company.some((c) => c.text === l.text)) company.push({ field: l.field, text: l.text });
  }

  const resumeRefs = entries
    .map((e) => ({ e, score: score(e.terms) + (question.category === '先练必答' && ['basics', 'achievement'].includes(e.entry.kind) ? 1 : 0) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ e }) => ({
      id: e.entry.id,
      kind: e.entry.kind,
      title: RESUME_TITLE[e.entry.kind]?.(e.entry.data) || e.entry.kind,
      lines: e.lines
        .map((l) => ({ text: l.text, score: score(l.terms) }))
        .filter((l) => l.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 2)
        .map((l) => l.text),
    }));
  return { keywords, gaps, company, resume: resumeRefs };
}
