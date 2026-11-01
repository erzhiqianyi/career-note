# 求职技能与 MCP

技能决定如何分析与生成；MCP 提供当前用户的数据协议、读取、预览、写入和读回。技能无需源码仓库、网站 API Key 或其他技能即可单独使用。

|技能|用途|入口|
|---|---|---|
|完整求职准备|按请求串联各阶段|[career-job-prep](../.agents/skills/career-job-prep/SKILL.md)|
|履历收集与分析|整理用户提供的简历、项目经历和求职方向，形成有依据的履历摘要并按请求同步；不寻找公司或代写投递结果。|[career-profile-intake](../.agents/skills/career-profile-intake/SKILL.md)|
|岗位收集与匹配|根据已有履历和求职条件核验日本招聘岗位，比较匹配点与缺口并保存研究；不生成全套申请材料或提交申请。|[career-job-research](../.agents/skills/career-job-research/SKILL.md)|
|公司专属申请材料|围绕指定公司与岗位生成有事实依据的履歴書、職務経歴書、志望动机与研究材料，保存新版本；不自动发送申请。|[career-application-materials](../.agents/skills/career-application-materials/SKILL.md)|
|日本求职文书盘点、定制与审核|从真实经历到岗位文书，保存事实盘点、匹配表、材料版本和审核结果；MCP 可直接返回完整技能说明。|[career-japanese-job-documents](../.agents/skills/career-japanese-job-documents/SKILL.md)|
|面试练习与回答复盘|按岗位生成面试练习题组，或基于用户真实回答逐项点评并保存；不把参考答案当作用户回答。|[career-interview-coach](../.agents/skills/career-interview-coach/SKILL.md)|
|投递结果与行动复盘|分析已有投递历史、面试记录和准备材料，找出阶段性瓶颈并保存复盘报告；不推断未记录的结果或代改状态。|[career-outcome-review](../.agents/skills/career-outcome-review/SKILL.md)|
|MCP 数据同步|将已有求职研究、材料、题组和点评同步到用户配置的 Career Note MCP，执行协议检查、预览、写入与读回；不生成新的求职结论。|[career-workspace-sync](../.agents/skills/career-workspace-sync/SKILL.md)|
|来源收集与状态核对|检查指定网站/邮件中的简历变化及投递事件，保存待确认报告|[career-source-sync](../.agents/skills/career-source-sync/SKILL.md)|
|日语假名注音|在日语资料正文保存学习用假名，按范围修订旧资料；不填写正式ふりがな字段。|[career-japanese-readings](../.agents/skills/career-japanese-readings/SKILL.md)|

## MCP 岗位研究技能入口

调用只读工具 `career_get_job_research_guide({})` 获取 `career-job-research` 全文、`references` 中的完整外部网站流程、处理阶段、前置读取工具及 `saveRoutes`。其他 Agent 即使没有安装技能或访问仓库，也能按返回的说明完成「拉取职位 → 公司分析 → 履历匹配 → 评价 → 按请求同步」。技能与 MCP 说明由同一份技能源码生成，单技能下载包也包含引用文件。

调用示例：「先读取 career_get_job_research_guide，再从我提供的网站筛选最多 5 个岗位，整理官网公司信息、匹配点和缺口，保存到 Career Note。」Agent 需要自己具备该网站的连接器或浏览器访问能力；MCP 不在后台抓取网站或调用模型。研究成果使用 agent:write，经预览、写入和读回确认；个人星级及志望群需要用户授权和 career:write。只预览时不保存，不自动投递。

新增入口需部署 Worker 并在客户端刷新工具列表后，远程 Agent 才能发现；本地更新技能或下载包不代表线上服务已更新。

## MCP 文书技能入口

调用只读工具 `career_get_application_document_guide({})` 获取完整技能说明、三个处理阶段和 `saveRoutes`。客户端不支持 MCP prompts、没有安装技能或无法读取仓库时，也可直接按返回的说明执行。该工具不调用模型、不读个人数据、不写成果；生成由当前 Agent 完成。

成果沿用现有账户隔离的存储：盘点/匹配表/审核存 reports，公司履歴書与職務経歴書存 materials（新 id、已有 jobId）。二者使用 agent:write，通过 `career_preview_import` → `career_import` → `career_get_context` 核验。通用简历草稿使用 career:write，通过 `career_save_personalized_resume` → `career_get_personalized_resumes` 核验。新增事实母版另用 `career_save_resume_entry`，需要用户请求与 career:write。不自动发布或投递。

## 定时任务

见 [定时来源同步配置](scheduled-sync.md)。Agent 协作页可以生成配置草稿；调度器、来源连接与 Career Note MCP 分别配置。当前支持核对报告，尚不自动改写投递状态。

## 使用

在 Agent 协作下载单个技能包并安装到所用助手的技能目录。配置 Streamable HTTP MCP：`http://localhost:4210/api/career/mcp`（端口跟随当前网站），不填写令牌；客户端首次连接会打开浏览器授权页，登录并同意后自动获得令牌。服务仅在本机监听，远程助手需要 `npm run dev:tunnel` 或公开部署得到的地址；不能直接访问此 localhost。

工具：`career_get_contract`、`career_get_context`、`career_preview_import`、`career_import`、`career_update_profile`、`career_create_task`、`career_get_readings`、`career_save_readings`。列出的工具按授权时勾选的 scope 限定；没有自动投递或修改结果的工具。

每个包包含完整技能目录，不依赖仓库路径。下载包不包含账号、令牌或个人数据。修改后执行 `npm run skills:archive`，生成单技能 ZIP、完整备份与网站目录；历史备份按内容版本保留。
