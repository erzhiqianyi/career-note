/** Keep drafting notes visible in the editor while excluding them from the application copy. */
function normalizeSpacedTables(content: string) {
  const lines = content.split('\n');
  const tableRow = (line: string) => /^\s*\|.+\|\s*$/.test(line);
  const separator = (line: string) => /^\s*\|(?:\s*:?-{3,}:?\s*\|){2,}\s*$/.test(line);
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    if (!tableRow(lines[i])) {
      result.push(lines[i]);
      continue;
    }
    let next = i + 1;
    while (next < lines.length && !lines[next].trim()) next++;
    if (!separator(lines[next] || '')) {
      result.push(lines[i]);
      continue;
    }

    result.push(lines[i], lines[next]);
    i = next;
    while (i + 1 < lines.length) {
      next = i + 1;
      while (next < lines.length && !lines[next].trim()) next++;
      if (!tableRow(lines[next] || '')) break;
      result.push(lines[next]);
      i = next;
    }
  }
  return result.join('\n');
}


export type ApplicationKind = '履歴書' | '職務経歴書';
/** A review item is something the applicant still has to fill in, confirm or reword; it never enters the document body. */
export type MaterialReviewItem = { field: string; note: string };

const internalStart = /^(?:内部核对|内部確認|内部审阅|内部備考|internal (?:review|note))(?=[\s，,:：、（(]|$)/i;
/** Whole sections that only help the applicant draft: memos, sources, change logs, pre-submission checks. */
const noteHeading = /^(?:記入メモ|作成メモ|内部メモ|メモ|備忘|备注|备忘|说明|說明|注意事項|変更履歴|変更点|变更|参照|参考|出典|來源|来源|提出前|記載内容の確認|応募に向けた補強|待確認|待确认|notes?|memo)(?=[\s（(：:、・]|$)/i;
/** Drafting metadata lines such as 応募先 or 提出期限 that belong to the record, not the document. */
const metaLine = /^\s*(?:[-*]\s+)?(?:\*\*)?(?:応募先|応募企業|応募職種|応募求人|求人番号|提出期限|提出予定|提出先|応募媒体|ステータス|版数|バージョン)[^：:|]*[：:]/;
const inlineNote = /【[^】]*(?:確認|メモ|TODO|未定|備考|核对|待)[^】]*】|[（(][^（）()]*(?:要確認|本人確認|送信前|提出前|確認中|未確認|TODO|メモ|核对|待确认|待確認)[^（）()]*[）)]/g;

function cleanLine(line: string, notes: string[]) {
  const heading = /^(#{1,6})\s+(.*)$/.exec(line);
  let cleaned = line.replace(inlineNote, note => { notes.push(note); return ''; });
  if (heading) cleaned = cleaned.replace(/\s*[（(](?:案|草稿|下書き|draft)[）)]/gi, '');
  return cleaned.replace(/[ \t]+$/, '');
}

/** The printed title is the document kind; whatever title the draft carried is treated as a note. */
function fixTitle(content: string, kind: ApplicationKind | undefined, notes: string[]) {
  const heading = /^#\s+(.+)$/m.exec(content);
  const resolved = kind || (heading && (/職務経歴書/.test(heading[1]) ? '職務経歴書' : /履歴書/.test(heading[1]) ? '履歴書' : undefined));
  if (!resolved) return content;
  if (!heading) return `# ${resolved}\n\n${content}`;
  if (heading[1].trim() !== resolved) notes.push(heading[1].trim());
  return content.slice(0, heading.index) + '# ' + resolved + content.slice(heading.index + heading[0].length);
}

export function prepareMaterialPrint(content: string, kind?: ApplicationKind) {
  const blocks = content.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const printable: string[] = [];
  const internalNotes: string[] = [];
  let internalHeadingLevel = 0;

  for (const block of blocks) {
    const trimmed = block.trim();
    const heading = /^(#{1,6})\s+(.+)/.exec(trimmed);
    if (internalHeadingLevel && heading && heading[1].length <= internalHeadingLevel) internalHeadingLevel = 0;
    const start = (heading ? heading[2] : trimmed).replace(/^(?:>\s*|[-*]\s*|\*\*)+/, '');
    const internal = internalStart.test(start) || (!!heading && noteHeading.test(start));
    if (internal && heading) internalHeadingLevel = heading[1].length;
    if (internal || internalHeadingLevel) { internalNotes.push(trimmed); continue; }
    const lines = block.split('\n').filter(line => {
      if (!metaLine.test(line)) return true;
      internalNotes.push(line.trim());
      return false;
    }).map(line => cleanLine(line, internalNotes));
    if (lines.some(line => line.trim())) printable.push(lines.join('\n'));
  }

  const printableContent = fixTitle(normalizeSpacedTables(printable.join('\n\n')).trim(), kind, internalNotes);
  const hasPlaceholders = /＿{3,}|_{4,}|本人記入|未記入|待填写|待確認|TODO|XXX|〇〇/.test(printableContent);
  return { printableContent, internalNotes, hasPlaceholders };
}

/** Text in an application body that is not part of the formal document; saving such a body is refused. */
export function applicationBodyIssues(content: string, kind: ApplicationKind) {
  return prepareMaterialPrint(content, kind).internalNotes;
}
