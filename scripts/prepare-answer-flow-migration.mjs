// Offline preparation only: use the authenticated MCP preview/import/read-back workflow to save.
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function prepareMigration(state) {
  const patches = [], review = [];
  for (const pack of state.questionSets ?? []) {
    const questions = [];
    for (const q of pack.questions) {
      if (q.answerFlow) continue;
      const outline = String(q.outline ?? '').trim();
      const lines = outline.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
      const numbered = lines.map(line => line.match(/^(?:\d+[.、．)）]|[①②③④⑤⑥⑦⑧⑨⑩])\s*(.+)$/u)?.[1]);
      let steps;
      // Mixed editorial notes need an Agent review; do not guess which lines are the answer.
      if (numbered.length >= 2 && numbered.every(Boolean)) steps = numbered;
      else if (!outline.includes('\n') && outline.length <= 160 && !/[。！？!?]/u.test(outline)) {
        const parts = outline.split('→').map(part => part.trim());
        if (parts.length >= 2 && parts.every(part => part && part.length <= 80)) steps = parts;
      }
      if (!steps || steps.length > 12 || steps.some(step => step.length > 200)) {
        review.push({ packId: pack.id, questionId: q.id, reason: '需要 Agent 依据原提纲及参考回答整理；不自动推断节点或关联。' });
        continue;
      }
      const followUps = String(q.followUps ?? '').trim();
      questions.push({ id: q.id, answerFlow: {
        version: 1,
        nodes: steps.map((title, i) => ({ id: `step-${i + 1}`, title })),
        // Preserve the original block rather than inventing semantic associations.
        followUps: followUps ? [{ id: 'legacy-follow-ups', question: followUps }] : [],
      } });
    }
    if (questions.length) patches.push({ id: pack.id, questions });
  }
  return { bundle: { schemaVersion: 1, questionSetPatches: patches, completeTaskIds: [] }, review };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [input, output] = process.argv.slice(2);
    if (!input || !output) throw new Error('Usage: node scripts/prepare-answer-flow-migration.mjs EXTERNAL_STATE_JSON EXTERNAL_OUTPUT_DIR');
    await mkdir(output, { recursive: true, mode: 0o700 });
    const repo = await realpath(fileURLToPath(new URL('..', import.meta.url)));
    const dir = await realpath(output);
    if (dir === repo || dir.startsWith(repo + path.sep)) throw new Error('Personal migration files must stay outside the repository');
    const state = JSON.parse(await readFile(input, 'utf8'));
    const result = prepareMigration(state);
    for (const [name, value] of Object.entries({ 'answer-flow-import.json': result.bundle, 'answer-flow-review.json': result.review })) {
      await writeFile(path.join(dir, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    }
    console.log(JSON.stringify({ prepared: result.bundle.questionSetPatches.reduce((sum, p) => sum + p.questions.length, 0), needsAgentReview: result.review.length }));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
