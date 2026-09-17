import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const bank = JSON.parse(readFileSync(new URL('../lib/data/interview-bank.json', import.meta.url)));

void test('built-in interview bank is complete and consistent', () => {
  const packIds = new Set();
  for (const pack of bank) {
    assert.ok(pack.id.startsWith('builtin-'), pack.id);
    assert.ok(!packIds.has(pack.id)); packIds.add(pack.id);
    for (const key of ['title', 'scenario', 'plan', 'sourceNotes']) assert.ok(pack[key]?.trim(), `${pack.id}.${key}`);
    assert.ok(pack.questions.length >= 5, pack.id);
    const ids = new Set();
    for (const q of pack.questions) {
      assert.ok(!ids.has(q.id), `${pack.id}/${q.id}`); ids.add(q.id);
      for (const key of ['title', 'questionJa', 'simpleQuestionJa', 'meaning', 'why', 'outline', 'followUps', 'category', 'personalize', 'vocabulary'])
        assert.ok(typeof q[key] === 'string' && q[key].trim(), `${pack.id}/${q.id}.${key}`);
      assert.ok(Number.isInteger(q.targetSeconds) && q.targetSeconds >= 30 && q.targetSeconds <= 300, `${pack.id}/${q.id}`);
      for (const field of q.profileFields) assert.ok(['summary', 'skills', 'experience', 'targetRoles', 'japanese', 'conditions'].includes(field), field);
    }
  }
  // The international-student pack is the reason the bank exists.
  assert.ok(bank.some((pack) => pack.id === 'builtin-international'));
});
