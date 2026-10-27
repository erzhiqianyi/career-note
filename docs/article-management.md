# AI 求职文章管理

文章的正式内容保存在 Worker 的 D1 `agent_articles` 表中。第一次建立表时，旧版六篇静态文章会作为初始数据写入一次；之后列表、详情页和 MCP 的经历生成指引都从 D1 读取，修改文章不需要重新构建网站。

在网站「Agent 协作 → AI 求职技巧」下，管理员可以新建或编辑文章。表单提供地址、标题、摘要、分类、步骤、正文、可复制提示词和草稿/已发布状态。地址创建后固定；同一文章的保存使用 revision 防止覆盖其他人刚完成的修改。草稿只在管理列表显示，公开列表与详情页均不返回草稿。

本地 `CAREER_AUTH_MODE=off` 可管理文章。公开环境只允许 `CAREER_ADMIN_UIDS` 中的登录账号或带管理员 Firebase claim 的账号管理；MCP 令牌不能管理文章。文章正文作为纯文本保存并做 HTML 转义，编辑器不接受任意 HTML。

已发布文章由 Worker 在 `/api/career/articles/view/<slug>` 输出完整 HTML，包含标题、摘要、canonical、Open Graph 和 Article 结构化数据。`/api/career/articles/sitemap.xml` 根据 D1 中当前已发布的文章生成，更新后约一分钟内可刷新。公开页面位于 API Worker 域名；Pages 首页通过构建时配置的 API 地址链接过去。公开构建还会把 API 站点地图地址写入 Pages 的 `robots.txt`。
