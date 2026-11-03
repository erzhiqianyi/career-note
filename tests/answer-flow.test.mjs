import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerFlowSchema } from '../lib/answer-flow.ts';
import { prepareMigration } from '../scripts/prepare-answer-flow-migration.mjs';

test('answer flow validates stable links, bounds and versions', () => {
  const flow = { version: 1, nodes: [{ id: 'background', title: '背景' }], followUps: [{ id: 'why', question: 'なぜ？', nodeId: 'background' }] };
  assert.equal(answerFlowSchema.safeParse(flow).success, true);
  for (const bad of [null, { ...flow, version: 2 }, { ...flow, nodes: [] }, { ...flow, nodes: [flow.nodes[0], flow.nodes[0]] }, { ...flow, followUps: [{ ...flow.followUps[0], nodeId: 'missing' }] }])
    assert.equal(answerFlowSchema.safeParse(bad).success, false);
});

test('migration preserves source text, skips ambiguous notes and existing flows', () => {
  const state = { questionSets: [{ id: 'pack', questions: [
    { id: 'clear', outline: '1. 背景\n2. 行動', followUps: 'なぜ？\nどうやって？' },
    { id: 'notes', outline: '更新メモ\n1. 背景\n2. 行動' },
    { id: 'prose', outline: '処理時間は2時間→45分。' },
    { id: 'done', answerFlow: { version: 1 } },
  ] }] };
  const before = JSON.stringify(state);
  const { bundle, review } = prepareMigration(state);
  assert.equal(JSON.stringify(state), before);
  assert.equal(bundle.questionSetPatches[0].questions.length, 1);
  assert.equal(review.length, 2);
  const patch = bundle.questionSetPatches[0].questions[0];
  assert.equal(patch.answerFlow.followUps[0].question, state.questionSets[0].questions[0].followUps);
  assert.equal(answerFlowSchema.safeParse(patch.answerFlow).success, true);
  Object.assign(state.questionSets[0].questions[0], patch);
  assert.equal(prepareMigration(state).bundle.questionSetPatches.length, 0);
});
