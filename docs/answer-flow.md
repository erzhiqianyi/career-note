# 回答主流程与旧题迁移

`answerFlow` 是题目上的可选 JSON 字段。题组仍存入现有记录，不需要直接修改 D1 表或 SQLite 表。网页和 iOS 默认展示节点标题与简短提示，详细表达、注意点、关联追问及原始说明默认折叠。

## 上线顺序

1. 按 [部署说明](deployment.md) 部署新版 Worker，再发布网页与更新 iOS。
2. 刷新 MCP 工具列表。确认 `career_preview_import` 和 `career_import` 的 question / questionSetPatches schema 包含 answerFlow，且 `career_get_contract` 返回 answerFlow v1 说明。
3. 再迁移旧题。旧版 Worker 会忽略未知字段，导入成功计数不能证明新字段已保存。

旧客户端可以继续读取旧字段；未提交 answerFlow 的整组更新会保留已有流程。修改答案事实或主线时，Agent 应同步修订 answerFlow，避免流程与原文不一致。answerFlow 内部是完整替换，不能只发送一个节点。

## 结构

```json
{
  "version": 1,
  "nodes": [
    {"id": "background", "title": "项目背景", "cue": "一句话概述", "detail": "展开后的表达", "cautions": "表达注意点"},
    {"id": "action", "title": "本人的行动"}
  ],
  "followUps": [
    {"id": "responsibility", "question": "具体负责哪些部分？", "nodeId": "action", "questionId": "existing-question-id"},
    {"id": "other", "question": "还有什么想补充的？"}
  ]
}
```

节点顺序就是回答顺序。nodeId 引用当前流程的节点，questionId 引用同题组已有题目；两者均可省略。没有 nodeId 的追问单独折叠展示。稳定 ID 用于关联，不应因改标题而改变。题目链接跳转到对应练习页，返回沿用已有导航。

## 自行迁移

优先让已连接的 Agent 读取当前账号的题组，然后按 [Agent 协议](agent-workflow.md#回答流程-answerflow-v1) 整理并预览。可直接使用以下指令：

> 将当前题组中尚未包含 answerFlow 的题目迁移为 answerFlow v1。读取当前 contract 和题组，以原 outline、sampleAnswer 和 followUps 为依据，不添加事实。保留题组和题目 ID、原文及练习历史。长篇编辑记录由你逐题整理；关联不明确的追问留在题目层级。先给出预览和待确认项，再通过 questionSetPatches 写入授权范围，并逐项读回验证。已迁移题目跳过。

如果已有从正式接口导出的 state/context JSON，可先机械整理明确步骤：

```sh
node scripts/prepare-answer-flow-migration.mjs \
  /absolute/private/path/state.json \
  /absolute/private/path/flow-migration
```

输入输出均保存在仓库外。工具离线运行，生成：

- `answer-flow-import.json`：仅补充 answerFlow 的 questionSetPatches，可交给 MCP preview/import。
- `answer-flow-review.json`：混杂说明、长篇文字等无法安全机械转换的题目 ID，需 Agent 逐题整理。

工具保留追问原文，不猜测节点归属或目标题目；已有 answerFlow 的题目自动跳过，已有输出文件拒绝覆盖。它不会自动保存到服务。没有新 patch 时无需导入。

写入前重新读取题目，核对生成提纲的来源未发生变化；预览通过后再写入。按题组逐批导入，并读回核对 answerFlow、题目数量、旧字段与 ID。导入可能部分成功；失败时重新读取，只处理未完成部分。原始导出可用于对照，不要用整份 state 覆盖工作区。

## 验证

自动检查涵盖 schema 与关联校验、MCP 工具 schema、旧客户端保留流程、预览不写入、原回答快照保持不变、机械迁移重复运行，以及 iOS 新旧结构的 SQLite 读回。长文的语义整理仍需 Agent 核对来源；机械转换不代表语义审阅完成。
