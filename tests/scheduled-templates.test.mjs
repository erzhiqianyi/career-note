import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduledTaskTemplates } from '../lib/scheduled-templates.ts';
test('three common templates cover collection, status follow-up and practice without hiding specialized links', () => {
  assert.deepEqual(
    scheduledTaskTemplates.filter((t) => t.recommended).map((t) => t.id),
    ['invitation-prep', 'status-followup', 'practice-analysis'],
  );
  const status = scheduledTaskTemplates.find((t) => t.id === 'status-followup');
  assert.equal(status.writes, 'reports');
  assert.ok(status.prompt.includes('旧事件不得回退新状态'));
  assert.ok(status.prompt.includes('实际状态'));
  assert.ok(status.prompt.includes('今日及逾期'));
  const practice = scheduledTaskTemplates.find(
    (t) => t.id === 'practice-analysis',
  );
  assert.ok(practice.prompt.includes('仅处理本人已请求'));
  assert.ok(practice.prompt.includes('样本为空'));
  assert.ok(practice.prompt.includes('不读邮箱'));
  assert.ok(practice.prompt.includes('只补缺失结果'));
  assert.equal(scheduledTaskTemplates.filter((t) => !t.recommended).length, 5);
});
test('templates are distinct, self-contained drafts with the shared guardrails', () => {
  assert.equal(
    new Set(scheduledTaskTemplates.map((t) => t.id)).size,
    scheduledTaskTemplates.length,
  );
  for (const t of scheduledTaskTemplates) {
    assert.ok(t.prompt.includes('career_get_contract'), t.id);
    assert.ok(t.prompt.includes('网页没有创建或启用定时任务'), t.id);
    assert.ok(t.prompt.includes('不自动修改投递状态'), t.id);
    assert.ok(t.prompt.includes('不要在每次定时运行中再次创建定时任务'), t.id);
    assert.ok(!/RRULE|token=|Bearer /.test(t.prompt), t.id);
  }
});
test('event-driven queue task exits on empty queue and only local collection needs a browser', () => {
  const queue = scheduledTaskTemplates.find((t) => t.id === 'task-queue');
  assert.equal(queue.trigger, 'cron+event');
  assert.ok(queue.prompt.includes('队列为空'));
  assert.ok(queue.prompt.includes('不自行决定为哪个职位生成材料'));
  assert.deepEqual(
    scheduledTaskTemplates
      .filter((t) => t.environment === 'local')
      .map((t) => t.id),
    ['job-collect'],
  );
  const digest = scheduledTaskTemplates.find((t) => t.id === 'daily-digest');
  assert.ok(digest.prompt.includes('不做任何抓取'));
});
