---
name: career-japanese-job-documents
description: 盘点真实经历、按日本招聘岗位定制履歴書与職務経歴書，或审核已有文书；通过 Career Note MCP 保存盘点报告、材料新版本和审核结果，不自动发布或投递。
---

# 日本求职文书：盘点、定制、审核

按用户请求选择一个或多个阶段，不要求每次重做全部流程。通过已配置的 Career Note MCP 使用本技能，无需访问源码仓库。MCP 的 `career_get_application_document_guide` 返回本说明及保存路径；不读取邮箱、不在后台调用模型、不自动保存。

## 共同准备

- 先读 `career_get_contract` 获取当前字段协议，再读 `career_get_context` 获取目标职位、已有材料和报告。履历使用 `career_get_resume_overview` → `career_list_resume` → 必要的 `career_get_resume_details`；文档正文按需通过 `career_get_resume_document_chunk` 读取。默认排除已归档条目。
- 公司定制需要明确 jobId；未指定公司时可盘点、审核或做岗位通用版，不编造公司动机，不创建虚拟职位来关联材料。
- 区分雇主与客户、本人行动与团队成果、已完成工作与计划。日期、人数、指标、客户名称的公开许可、语言水平有缺口时列待确认；岗位要求不能充当个人经历证据。

## inventory：经历盘点

把相关经历整理为事实卡：期间、项目背景、规模、本人角色、具体行动、技术及使用程度、可观察成果、来源记录 id/revision 或文件章节、待确认项。先尽量收集，再按目标筛选。

将“沟通能力强”等抽象评价还原为对象、场景、本人行动和结果；没有量化证据时保留可核实的定性成果，不补造百分比。输出事实卡、能力清单与需要本人补充的问题。盘点结果保存为 reports，不自动改写履历事实母版。

## tailor：岗位定制

先生成“招聘要求 → 个人证据 → 文稿位置 → 缺口”的匹配表，再组织文书。

- 履歴書侧重基本信息、学历职历、资格、志望動機。核对正式名称、日期与年号一致性。敏感或未确认字段留空或 `＿＿＿`，正式ふりがな只使用本人确认的值。联系邮箱按当前投递平台已核实的 accountEmail 选择。
- 職務経歴書侧重能力证据。按经历选择项目式、编年式或逆编年式；工程师可优先考虑项目式。摘要突出最相关经历，项目描述说明角色、行动及成果，技能体现实际使用程度，自己PR配具体事例。志望動機、转职理由及后续面试叙述应一致。
- 篇幅与排版以招聘方要求优先；无指定时以易读、突出相关证据为准。文章中的页数与提交礼仪是参考，不固化为所有申请的硬性规则。
- 公司文书保存为独立 materials，kind 为履歴書、職務経歴書（需要时另存志望動機）。每个新版本使用新 id 和已存在的 jobId。正文仅放正式内容，标题为 `# 履歴書` 或 `# 職務経歴書`；缺失事实留空，确认事项放 reviewItems（field、note），来源及取舍放 sourceNotes，匹配表另存 reports。
- 日语学习读音随正文使用 `{漢字|かな}`，不猜姓名或公司名读音；投递与打印版去除学习标记。
- 没有具体公司且需要保存通用简历时，读取 `career_get_personalized_resumes`，使用 `career_save_personalized_resume` 的当前 schema 保存草稿。sourceRefs 引用真实记录 id/revision，privateNotes 保存私有取舍；不能将证据或待确认项混入公开 content。新目标用新 id、revision 0，更新时使用最新 revision 并保留完整字段。保存不等于发布。

## review：提交前审核

检查两份文书之间及与事实来源之间的日期、公司、职责、资格和数字；检查岗位证据是否充分，是否区分团队与个人贡献，有无含糊、夸大、冗长、漏填与错字。

每条问题记录严重程度、文书 id/revision 或材料 id、栏目/原句、事实依据、修改建议和待确认项。正文准确性限制必须反映在措辞中，不能仅藏进备注。输出“可修正文案”与“仍需本人核实的事实”。

仅在实际拿到导出文件时检查断行、表格、分页及学习标记是否残留；未检查文件就注明“仅审核文本，导出版面未验证”。PDF/DOCX 按用户需要生成，不把纯文本审核称为可直接提交。审核报告存 reports；用户要求修订时另存 materials 新版本，保留旧材料。

## 成果保存与读回

1. 用户只要求分析/预览时不写；用户要求执行并保存成果时按已授权范围保存，不重复询问。reports/materials 需要 agent:write；通用简历草稿和事实母版需要 career:write。新增或更新事实母版需用户要求，使用 `career_save_resume_entry` 的最新 revision，不能把推导草稿自动升为 confirmed。
2. 盘点、匹配表及审核用 reports：id（新版本）、date（Asia/Tokyo 当天 YYYY-MM-DD）、title、content（Markdown）、sourceNotes。来源说明记录阶段、依据记录 id/revision、目标 jobId（若有）、参考材料版本与未核实项。不要用不存在的 report kind/jobId 字段建立关联。
3. reports/materials 组成 `{ "schemaVersion": 1, "reports": [], "materials": [], "completeTaskIds": [] }`，调用 `career_preview_import`，修正问题后 `career_import`。新职位需先单独保存并读回再关联。导入不是整批原子操作，部分失败后先读回，只补未完成项。
4. 用 `career_get_context` 核对报告和材料的 id、正文、来源、reviewItems 及 jobId；通用简历用 `career_get_personalized_resumes` 核对 revision、sourceRefs 与 privateNotes；事实母版用 `career_get_resume_details` 读回。仅工具返回成功不足以声称成果已核验。
5. 汇报保存位置、id/版本和待确认项；有任务时仅在全部指定成果完成且读回后完成对应 task id。无发布、发送邮件、提交申请或修改投递状态的动作。

## 方法来源

以下为写作方法参考，不是候选人事实或具体岗位证据，整理日期 2026-10-30：

- https://type.jp/tensyoku-knowhow/technique/rirekisyo/
- https://type.jp/tensyoku-knowhow/technique/resume/

与招聘方明确要求冲突时以本次要求为准。附件密码、邮资等会变化的细节在实际提交前另行核实，不从参考文章固化为默认动作。
