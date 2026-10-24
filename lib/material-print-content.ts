/** Keep drafting notes visible in the editor while excluding them from the application copy. */
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

  const printableContent = printable.join('\n\n').trim();
  const hasPlaceholders = /＿{3,}|_{4,}|本人記入|未記入|待填写|待確認|TODO|XXX|〇〇/.test(printableContent);
  return { printableContent, internalNotes, hasPlaceholders };
}
