import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyQuestionOrder, moveQuestionAfter, unfamiliarFirst } from '../lib/question-order.ts';

const q = ids => ids.map(id => ({ id }));

void test('saved orders skip removed questions and keep new ones at the end', () => {
  assert.deepEqual(applyQuestionOrder(q(['a', 'b', 'c', 'd']), ['c', 'gone', 'a']).map(x => x.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(applyQuestionOrder(q(['a', 'b']), undefined).map(x => x.id), ['a', 'b']);
});

void test('a question moves to sit right after another one', () => {
  assert.deepEqual(moveQuestionAfter(['q140', 'q150', 'q160', 'q175'], 'q175', 'q140'), ['q140', 'q175', 'q150', 'q160']);
  assert.deepEqual(moveQuestionAfter(['a', 'b', 'c'], 'c', null), ['c', 'a', 'b']);
  assert.deepEqual(moveQuestionAfter(['a', 'b', 'c'], 'a', 'c'), ['b', 'c', 'a']);
  assert.deepEqual(moveQuestionAfter(['a', 'b'], 'a', 'missing'), ['a', 'b']);
});

void test('unfamiliar questions come first from the real practice record', () => {
  const attempts = [
    { id: 't1', questionSetId: 'p', questionId: 'reviewed', createdAt: '2026-11-01' },
    { id: 't2', questionSetId: 'p', questionId: 'tried', createdAt: '2026-11-02' },
    { id: 't3', questionSetId: 'p', questionId: 'twice', createdAt: '2026-11-03' },
    { id: 't4', questionSetId: 'p', questionId: 'twice', createdAt: '2026-11-04' },
    { id: 'other', questionSetId: 'x', questionId: 'new', createdAt: '2026-11-05' },
  ];
  const reviewed = new Set(['t1', 't3', 't4']);
  assert.deepEqual(unfamiliarFirst(['twice', 'reviewed', 'tried', 'new'], 'p', attempts, reviewed), ['new', 'tried', 'reviewed', 'twice']);
});
