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

export function prepareMaterialPrint(content: string) {
  const blocks = content.replace(/\r\n?/g, '\n').split(/\n\s*\n/);
  const printable: string[] = [];
  const internalNotes: string[] = [];
  let internalHeadingLevel = 0;

  for (const block of blocks) {
    const trimmed = block.trim();
    const heading = /^(#{1,6})\s+(.+)/.exec(trimmed);
    if (internalHeadingLevel && heading && heading[1].length <= internalHeadingLevel) internalHeadingLevel = 0;
    const start = (heading ? heading[2] : trimmed).replace(/^(?:>\s*|[-*]\s*|\*\*)+/, '');
    const internal = /^(?:内部核对|内部確認|内部审阅|内部備考|internal (?:review|note))(?=[\s，,:：、（(]|$)/i.test(start);
    if (internal && heading) internalHeadingLevel = heading[1].length;
    if (internal || internalHeadingLevel) internalNotes.push(trimmed);
    else printable.push(block);
  }

  const printableContent = normalizeSpacedTables(printable.join('\n\n')).trim();
  const hasPlaceholders = /＿{3,}|_{4,}|本人記入|未記入|待填写|待確認|TODO|XXX|〇〇/.test(printableContent);
  return { printableContent, internalNotes, hasPlaceholders };
}
