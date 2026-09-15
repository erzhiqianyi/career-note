# 个性化简历与公开管理

结构化履历是事实母版。个性化简历是独立草稿，外部 AI 可通过 MCP 创建，用户可以编辑、复制、归档及导入 JSON。每次保存使用 revision 乐观锁并记录历史。真实数据继续存于外部 CAREER_DATA_DIR 对应的本地 D1 中。

`GET/POST /api/career/personalized-resumes` 分别读取和保存本用户草稿。MCP 提供 `career_get_personalized_resumes` 和 `career_save_personalized_resume`；需要 career:read / career:write。输入结构见 lib/personalized-resume.ts。来源引用校验本租户的记录历史。

用户在应用中预览并确认公开内容，再调用 `POST /api/career/resume-publications`，输入 draftId、draftRevision、mode（public/unlisted）、expiresAt（ISO 时间或空字符串）。服务器只从对应版本复制 content 和 language。草稿随后更新或归档不改变快照。更新公开内容时创建新链接，旧链接可单独撤下。

`POST /api/career/resume-publications/revoke` 输入 id，立即撤下本用户链接。MCP 令牌无法发布或撤下；应用登录或本地 auth-off 开发模式可管理。所有管理接口仍需现有鉴权。

唯一匿名入口 `GET /api/career/public-resumes/:token` 返回转义后的 HTML，排除内部字段；无脚本、远程资源或公开工作区列表。unlisted 返回 noindex/nofollow，public 允许索引，均不保证搜索引擎行为。任何拥有链接的人均可访问，没有密码功能。过期或撤下均返回 404，响应禁止缓存。无法收回浏览者保存的副本。

当前服务仍仅监听 loopback，链接仅供本地预览。此变更不部署互联网服务，也不能把整个管理 Worker 直接公开。真正发布需用户选择独立公开服务和域名，并实现选定快照的传输、撤销同步；保持私人管理数据库在本机。skill 在 Agent 协作中可下载，名称 career-personalized-resume。
