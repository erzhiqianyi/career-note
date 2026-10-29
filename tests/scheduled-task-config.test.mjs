import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scheduledTaskTemplates } from '../lib/scheduled-templates.ts';
import {
  buildConfiguredTask,
  defaultTaskConfiguration,
  taskGuides,
} from '../lib/scheduled-task-config.ts';

test('every template exposes inputs, outputs, checks and an executable configured handoff', () => {
  for (const template of scheduledTaskTemplates) {
    const guide = taskGuides[template.id];
    for (const key of ['inputs', 'prerequisites', 'outcomes', 'checks'])
      assert.ok(guide[key], `${template.id}: ${key}`);
    const config = {
      ...defaultTaskConfiguration(template),
      cadence: '每天 14:25',
      timezone: 'UTC',
      source: '示例账号：指定文件夹',
      days: 9,
    };
    const prompt = buildConfiguredTask(template, config);
    assert.ok(prompt.includes('每天 14:25'));
    assert.ok(prompt.includes('时区：UTC'));
    assert.ok(prompt.includes('每次运行：'));
    assert.ok(prompt.includes('无需指定 AI 厂商或模型'));
    assert.ok(!prompt.includes('<填写'));
    assert.ok(!prompt.includes(['', 'Users', ''].join('/')));
    assert.ok(!prompt.includes('每天 08:00'));
    assert.ok(!prompt.includes('每天 07:30 与 18:30'));
    if (guide.sourceRequired) assert.ok(prompt.includes('最近 9 天'));
  }
});

test('preparation consent is explicit and recommendation-only is the default', () => {
  const template = scheduledTaskTemplates.find(
    (t) => t.id === 'invitation-prep',
  );
  const config = {
    ...defaultTaskConfiguration(template),
    source: '示例邮箱',
    recommendationLimit: 8,
    preparationLimit: 3,
  };
  assert.ok(
    buildConfiguredTask(template, config).includes(
      '仅筛选推荐，不生成申请材料或题组',
    ),
  );
  const automatic = buildConfiguredTask(template, {
    ...config,
    preparation: 'top-matches',
  });
  assert.ok(automatic.includes('推荐上限：8'));
  assert.ok(automatic.includes('本人授权'));
  assert.ok(automatic.includes('前 3 个岗位'));
  const queued = buildConfiguredTask(template, {
    ...config,
    preparation: 'existing-tasks',
  });
  assert.ok(queued.includes('只处理本人已创建'));
});

test('practice config uses its analysis window without requiring an external source', () => {
  const template = scheduledTaskTemplates.find(
    (t) => t.id === 'practice-analysis',
  );
  const config = {
    ...defaultTaskConfiguration(template),
    days: 14,
    conditions: '重点分析自我介绍',
  };
  const prompt = buildConfiguredTask(template, config);
  assert.ok(prompt.includes('练习分析窗口：最近 14 天'));
  assert.ok(prompt.includes('重点分析自我介绍'));
  assert.ok(prompt.includes('Career Note 当前账号已保存记录'));
  assert.ok(!prompt.includes('推荐上限：'));
  assert.ok(!prompt.includes('准备策略：'));
});

test('invalid or incomplete configuration cannot produce a task handoff', () => {
  const template = scheduledTaskTemplates.find(
    (t) => t.id === 'invitation-prep',
  );
  const config = { ...defaultTaskConfiguration(template), source: '示例邮箱' };
  for (const change of [
    { source: '' },
    { cadence: ' ' },
    { timezone: 'Invalid/Zone' },
    { days: 0 },
    { days: 91 },
    { days: 1.5 },
    { recommendationLimit: 21 },
    { preparationLimit: 6 },
    { preparation: 'unknown' },
  ]) {
    assert.throws(() =>
      buildConfiguredTask(template, { ...config, ...change }),
    );
  }
});
