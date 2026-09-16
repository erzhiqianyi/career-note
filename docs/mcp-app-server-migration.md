# 迁移到 npm 版 `@ninomae/mcp-app-server`

Career Note 是这个包的来源:`worker/index.ts` 里的接法就是标准范式——工具是已认证 REST API 的薄包装,scope 与租户检查只在 REST 层做一次,包只负责 OAuth、token 和 MCP 传输。**架构不用动**,要做的是把 workspace 里的旧拷贝换成 npm 发布版,并适配 0.1.0 的三处 API 变化。

## 现状

- `packages/agent-gateway/` 是早期拷贝(`@ninomae/agent-gateway`),通过 `"workspaces": ["packages/*"]` 解析。它没有存储抽象、限流接口和可选 scope,和发布版已经分叉。
- 工作区里有未提交的改动(`package.json`、`components/oauth-consent.tsx`、两份文档),把 `@erzhiqian/agent-gateway` 改成了过渡名 `@ninomae/agent-gateway`。这些改动会被下面的步骤覆盖。

## API 对照(0.1.0)

| 旧(workspace 拷贝) | 新(`@ninomae/mcp-app-server@0.1.0`) |
| --- | --- |
| `createAgentGateway` | `createMcpAppServer` |
| `AgentGateway` | `McpAppServer` |
| `GatewayError` | `AppServerError` |
| `GatewayConfig` / `GatewayEvent` | `McpAppServerConfig` / `AppServerEvent` |
| `storage: db` + `tables: {…}` | `storage: sqlStore(db, {…})`,从 `/sql` 子路径导入 |
| `SqlDatabase` 类型从根导出 | 从 `@ninomae/mcp-app-server/sql` 导出 |
| `@ninomae/agent-gateway/react` | `@ninomae/mcp-app-server/react`(hook 不变) |

`AgentTool` / `ToolContext` / `ToolResult` / `Origins` / `Grant` 名字不变。

## 步骤

### 1. 换依赖

```bash
git rm -r packages/agent-gateway
npm pkg delete workspaces
npm pkg delete dependencies.@ninomae/agent-gateway
npm install @ninomae/mcp-app-server@^0.1.0
```

`@modelcontextprotocol/sdk`、`zod`、`jose`、`react` 已经在 `dependencies` 里,peer 依赖满足。

### 2. `worker/index.ts`

导入:

```ts
import { createMcpAppServer, AppServerError, type McpAppServer, type Origins, type ToolContext } from '@ninomae/mcp-app-server';
import { sqlStore } from '@ninomae/mcp-app-server/sql';
```

`createGateway()` 里的配置,只改两行:

```ts
const gateway: McpAppServer = createMcpAppServer({
  name: 'career-note',
  basePath: '/api/career',
  scopes: CAREER_SCOPES,
  contract: CAREER_CONTRACT,
  tools: createCareerTools(invoke),
  // 旧:storage: db, tables: {…}
  storage: sqlStore(db, { clients: 'oauth_clients', codes: 'oauth_codes', refreshTokens: 'oauth_refresh_tokens', accessTokens: 'mcp_tokens' }),
  origins: (request) => resolveOrigins(request, env),
  tokenPrefix: 'mcp_',
  accessTokenDays: envDays(env.MCP_TOKEN_TTL_DAYS, 30),
  refreshTokenDays: envDays(env.CAREER_OAUTH_REFRESH_DAYS, 90),
  identity: { /* 不变 */ },
  onEvent: async (event) => { /* 不变 */ },
});
```

表名映射保留,列结构和 0.1.0 之前完全一致,**线上 D1 数据不需要迁移**。

全文件把 `GatewayError` 替换为 `AppServerError`、`AgentGateway` 替换为 `McpAppServer`(约 8 处:`getAuthContext`、`identity.resolve` 的 catch、`revokeGrant` 的 catch)。

### 3. `worker/agent-tools.ts` 和 `components/oauth-consent.tsx`

只改 import 路径:

```ts
import type { AgentTool, ToolContext, ToolResult } from '@ninomae/mcp-app-server';
```

```tsx
import { useAgentConsent } from '@ninomae/mcp-app-server/react';
```

### 4. 验证

```bash
npm run typecheck && npm test && npm run test:smoke
```

`tests/` 里的端到端用例覆盖注册 → 授权 → 同意 → 换 token → 调工具 → 刷新 → 撤销,能过说明表名映射和 API 替换都对。

## 迁移之外,建议顺手做的三件事

### a. `ensureSchema` 不要每个请求都调

`worker/index.ts:854-855` 每个请求都执行 4 条 `CREATE TABLE IF NOT EXISTS` + activity 表,每次多 5 个 D1 往返。改成 isolate 生命周期内只跑一次:

```ts
let schemaReady: Promise<void> | undefined;
// fetch 里:
schemaReady ??= ensureSchema(rawDb, gateway);
await schemaReady;
```

### b. 注册限流接 Cloudflare 的共享计数器

默认 `memoryRateLimiter()` 在 Workers 上每个 isolate 各算各的,基本不起作用。`wrangler.toml` 加一个 rate-limiting binding,三行接上:

```toml
[[unsafe.bindings]]
name = "REGISTER_LIMIT"
type = "ratelimit"
namespace_id = "1001"
simple = { limit = 20, period = 3600 }
```

```ts
registrationLimit: { limiter: { allow: async (key) => (await env.REGISTER_LIMIT.limit({ key })).success } },
```

不接也能上线——注册被刷只是 `oauth_clients` 多几行垃圾,不影响安全。

### c. 文档里的名字

`docs/mcp-oauth-design.md`、`docs/lifecycle/06-api.md`、`README` 里所有 `agent-gateway` 字样改成 `mcp-app-server`,并链接到 <https://github.com/erzhiqianyi/mcp-app-server>。

## 不需要改的

- `identity.resolve` 的实现(Firebase ID token / 本地 workspace)——包的 `IdentityProvider` 契约没变。
- `invoke()` 回调 REST 的模式、`ensureScopes`、租户过滤——包仍然不做任何权限判断。
- `components/oauth-consent.tsx` 的 UI 和 `SCOPE_TEXT`——`useAgentConsent` 返回值一致。
- `CAREER_SCOPES` 三个 scope——包现在允许省略 `scopes`,但 Career Note 的 `career:write` 默认不勾选是有意的产品设计,保留。

## 检查清单

- [ ] 删 `packages/agent-gateway`、`workspaces`,装 `@ninomae/mcp-app-server@^0.1.0`
- [ ] `worker/index.ts`:import、`sqlStore(db, tables)`、`AppServerError` / `McpAppServer` 替换
- [ ] `worker/agent-tools.ts`、`components/oauth-consent.tsx`:import 路径
- [ ] `npm run typecheck && npm test && npm run test:smoke`
- [ ] (可选)`ensureSchema` 只跑一次;rate-limiting binding;文档改名
- [ ] 部署后用 `claude mcp add --transport http career https://<域名>/api/career/mcp` 走一遍授权,确认旧的 `mcp_` token 仍然有效
