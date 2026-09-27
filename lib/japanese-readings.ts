import { z } from 'zod';

/**
 * Study furigana: a per-user glossary of kanji words and their readings, rendered as <ruby> over
 * Japanese text in the app. It is a reading aid only. Official ふりがな fields (name, address)
 * live on the résumé basics and never come from here, and nothing sent to employers carries it.
 */
export const READING_SOURCES = ['user', 'agent'] as const;
export type ReadingSource = (typeof READING_SOURCES)[number];
export type ReadingEntry = {
  word: string;
  reading: string;
  source: ReadingSource;
  /** Agent entries start unconfirmed and are drawn differently until the user accepts them. */
  confirmed: boolean;
  note: string;
  updatedAt: string;
};

export const MAX_READINGS = 5000;
const KANJI = /[㐀-䶿一-鿿豈-﫿々〆ヶ]/;
const KANA = /[ぁ-ゖァ-ヺー]/;

export const readingInputSchema = z.object({
  word: z.string().trim().min(1).max(32).refine((w) => KANJI.test(w), '只收录含汉字的词'),
  reading: z.string().trim().min(1).max(64).regex(/^[ぁ-ゖァ-ヺー・]+$/, '读音只能是假名'),
  note: z.string().trim().max(200).optional(),
  confirmed: z.boolean().optional(),
});
export type ReadingInput = z.infer<typeof readingInputSchema>;

/** Kana in the text means Japanese; Chinese shares many kanji words but never uses kana. */
export const isJapanese = (text: string) => KANA.test(text);

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

/** Split 取り組み/とりくみ into 取(と)り組(く)み so kana in the word is not annotated again. */
export function alignReading(word: string, reading: string): Array<{ text: string; reading?: string }> {
  const runs = word.match(/[㐀-䶿一-鿿豈-﫿々〆ヶ]+|[^㐀-䶿一-鿿豈-﫿々〆ヶ]+/g) || [word];
  if (runs.length > 1) {
    const pattern = runs.map((r) => (KANJI.test(r) ? '(.+?)' : toHiragana(r).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
    const match = new RegExp('^' + pattern + '$').exec(toHiragana(reading));
    if (match) {
      let group = 1;
      return runs.map((r) => (KANJI.test(r) ? { text: r, reading: match[group++] } : { text: r }));
    }
  }
  return [{ text: word, reading }];
}

export type Glossary = { byFirst: Map<string, string[]>; entries: Map<string, { reading: string; confirmed: boolean }> };

/** Later sources win: pass the user glossary first and a document's own overrides after it. */
export function buildGlossary(entries: Array<Pick<ReadingEntry, 'word' | 'reading'> & { confirmed?: boolean }>, overrides: Record<string, string> = {}): Glossary {
  const map = new Map<string, { reading: string; confirmed: boolean }>();
  for (const e of entries) if (KANJI.test(e.word)) map.set(e.word, { reading: e.reading, confirmed: e.confirmed !== false });
  for (const [word, reading] of Object.entries(overrides)) if (KANJI.test(word)) map.set(word, { reading, confirmed: true });
  const byFirst = new Map<string, string[]>();
  for (const word of map.keys()) {
    const first = String.fromCodePoint(word.codePointAt(0)!);
    byFirst.set(first, [...(byFirst.get(first) || []), word]);
  }
  for (const words of byFirst.values()) words.sort((a, b) => b.length - a.length);
  return { byFirst, entries: map };
}

export type Segment = { text: string; reading?: string; confirmed?: boolean };

/** One left-to-right pass with longest match, so annotated words are never matched again. */
function segmentLine(text: string, glossary: Glossary): Segment[] {
  const out: Segment[] = [];
  let plain = '';
  for (let i = 0; i < text.length; ) {
    const first = String.fromCodePoint(text.codePointAt(i)!);
    const word = glossary.byFirst.get(first)?.find((w) => text.startsWith(w, i));
    if (word) {
      if (plain) out.push({ text: plain });
      plain = '';
      out.push({ text: word, ...glossary.entries.get(word)! });
      i += word.length;
    } else {
      plain += first;
      i += first.length;
    }
  }
  if (plain) out.push({ text: plain });
  return out;
}

/**
 * `ja` annotates everything (fields that are always Japanese). `auto` annotates only lines that
 * contain kana, so Chinese notes that share kanji words (改善, 東京) stay untouched.
 */
export function annotate(text: string, glossary: Glossary, mode: 'ja' | 'auto' = 'auto'): Segment[] {
  if (!text || !glossary.entries.size) return text ? [{ text }] : [];
  if (mode === 'ja') return segmentLine(text, glossary);
  return text.split(/(\n)/).flatMap((line) => (line !== '\n' && isJapanese(line) ? segmentLine(line, glossary) : line ? [{ text: line }] : []));
}

export function rubyHTML(text: string, glossary: Glossary, escape: (s: string) => string, mode: 'ja' | 'auto' = 'auto') {
  return annotate(text, glossary, mode)
    .map((s) => (s.reading ? alignReading(s.text, s.reading).map((p) => (p.reading ? `<ruby>${escape(p.text)}<rt>${escape(p.reading)}</rt></ruby>` : escape(p.text))).join('') : escape(s.text)))
    .join('');
}

/** Readings travel with the sentence, so the same spelling can have different readings. */
const INLINE_READING = /\{([^{}|\n]*[㐀-䶿一-鿿豈-﫿々〆ヶ][^{}|\n]*)\|([ぁ-ゖァ-ヺー・]+)\}/g;
export function inlineReadings(text: string): Segment[] {
  const result: Segment[] = [];
  let offset = 0;
  for (const match of text.matchAll(INLINE_READING)) {
    const at = match.index;
    if (at > offset) result.push({ text: text.slice(offset, at) });
    result.push({ text: match[1], reading: match[2] });
    offset = at + match[0].length;
  }
  if (offset < text.length) result.push({ text: text.slice(offset) });
  return result;
}
export const plainJapanese = (text: string) => inlineReadings(text).map((part) => part.text).join('');
export function inlineRubyHTML(text: string, escape: (s: string) => string, show: boolean) {
  return inlineReadings(text).map((part) => part.reading && show
    ? alignReading(part.text, part.reading).map((piece) => piece.reading
      ? `<ruby>${escape(piece.text)}<rt>${escape(piece.reading)}</rt></ruby>` : escape(piece.text)).join('')
    : escape(part.text)).join('');
}
