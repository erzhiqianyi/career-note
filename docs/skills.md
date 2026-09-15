# 求职技能与 MCP

技能决定如何分析与生成；MCP 提供当前用户的数据协议、读取、预览、写入和读回。技能无需源码仓库、网站 API Key 或其他技能即可单独使用。

|技能|用途|入口|
|---|---|---|
|完整求职准备|按请求串联各阶段|[career-job-prep](../.agents/skills/career-job-prep/SKILL.md)|
|履历收集与分析|整理用户提供的简历、项目经历和求职方向，形成有依据的履历摘要并按请求同步；不寻找公司或代写投递结果。|[career-profile-intake](../.agents/skills/career-profile-intake/SKILL.md)|
|岗位收集与匹配|根据已有履历和求职条件核验日本招聘岗位，比较匹配点与缺口并保存研究；不生成全套申请材料或提交申请。|[career-job-research](../.agents/skills/career-job-research/SKILL.md)|
|公司专属申请材料|围绕指定公司与岗位生成有事实依据的履歴書、職務経歴書、志望动机与研究材料，保存新版本；不自动发送申请。|[career-application-materials](../.agents/skills/career-application-materials/SKILL.md)|
|面试练习与回答复盘|按岗位生成面试练习题组，或基于用户真实回答逐项点评并保存；不把参考答案当作用户回答。|[career-interview-coach](../.agents/skills/career-interview-coach/SKILL.md)|
|投递结果与行动复盘|分析已有投递历史、面试记录和准备材料，找出阶段性瓶颈并保存复盘报告；不推断未记录的结果或代改状态。|[career-outcome-review](../.agents/skills/career-outcome-review/SKILL.md)|
|MCP 数据同步|将已有求职研究、材料、题组和点评同步到用户配置的 Career Note MCP，执行协议检查、预览、写入与读回；不生成新的求职结论。|[career-workspace-sync](../.agents/skills/career-workspace-sync/SKILL.md)|
|来源收集与状态核对|检查指定网站/邮件中的简历变化及投递事件，保存待确认报告|[career-source-sync](../.agents/skills/career-source-sync/SKILL.md)|

## 定时任务

见 [定时来源同步配置](scheduled-sync.md)。Agent 协作页可以生成配置草稿；调度器、来源连接与 Career Note MCP 分别配置。当前支持核对报告，尚不自动改写投递状态。

## 使用

在 Agent 协作下载单个技能包并安装到所用助手的技能目录。配置 Streamable HTTP MCP：`http://localhost:4210/api/career/mcp`（端口跟随当前网站），不填写令牌；客户端首次连接会打开浏览器授权页，登录并同意后自动获得令牌。服务仅在本机监听，远程助手需要 `npm run dev:tunnel` 或公开部署得到的地址；不能直接访问此 localhost。

工具：`career_get_contract`、`career_get_context`、`career_preview_import`、`career_import`、`career_update_profile`、`career_create_task`。列出的工具按授权时勾选的 scope 限定；没有自动投递或修改结果的工具。

每个包包含完整技能目录，不依赖仓库路径。下载包不包含账号、令牌或个人数据。修改后执行 `npm run skills:archive`，生成单技能 ZIP、完整备份与网站目录；历史备份按内容版本保留。
