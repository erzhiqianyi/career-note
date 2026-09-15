# @erzhiqian/agent-gateway

把**你已有的用户和数据**，以标准 **MCP + OAuth 2.1** 的方式授权给外部 AI Agent（Claude、ChatGPT、Cursor、Claude Code、任何 MCP 客户端）。你不需要自己接 AI 模型：用户带着自己的 Agent 来，读你的数据、在他们那边分析、再通过写工具把结果送回你的应用。

- **身份不绑定任何厂商。** 你的应用已经有登录（Firebase / Supabase / Auth0 / Clerk / session cookie / 自研）——只需实现一个 `resolve(request) → { id }`。
- **框架自己当 OAuth 授权服务器。** MCP 客户端要求的动态注册（RFC 7591）、PKCE、资源指示（RFC 8707）、refresh 轮换、按 Agent 撤销，消费级 IdP 普遍不提供，所以这一层必须在你手里。
- **工具表 = 你的产品的 Agent 面。** 每个工具声明所需 scope，`tools/list` 按用户实际授权裁剪。
- **公开可发现。** `/.well-known/*`、`GET <basePath>/mcp/schema`、匿名 `initialize` / `tools/list` 都不需要 token，可直接提交官方 MCP Registry / Claude 连接器目录。
- 运行在 Cloudflare Workers + D1（任何满足 `SqlDatabase` 接口的 SQLite 驱动也可以）。

## 接入七步

### 1. 决定 scope

```ts
scopes: {
  'jlpt:read':  { description: '阅读学习记录与错题', required: true },   // 锁定，永远授予
  'jlpt:write': { description: '写入讲解、计划与练习', default: true },   // 同意页默认勾选
}
```

`description` 会通过 `GET <basePath>/oauth/client` 交给同意页显示。读一个、写一个起步；写 scope 只允许 Agent 写**它自己的产出物**，不要让它改用户主数据。

### 2. 实现身份

```ts
import { sessionIdentity, jwtIdentity, firebaseIdentity, fixedIdentity } from '@erzhiqian/agent-gateway';

// 服务端 session（NextAuth、Rails、Django、Laravel、自研 cookie）
identity: sessionIdentity(async (req) => await mySessions.userFromCookie(req))   // 返回 { id } 或 null

// 前端持有 JWT（Supabase、Auth0、Clerk、Cognito……任何 OIDC）
identity: jwtIdentity({ jwksUrl, issuer, audience })

// Firebase 预设
identity: firebaseIdentity(env.FIREBASE_PROJECT_ID)

// 单用户 / 本机开发（切勿放到公网 origin 后面）
identity: fixedIdentity('local')
```

契约只有一条：`id` 必须稳定、不可重用。之后每个 Agent token 都绑定它，工具 handler 拿到的 `ctx.ownerId` 就是它。

### 3. 定义工具

```ts
import { z } from 'zod';

tools: [
  {
    name: 'jlpt_get_mistakes',
    scope: 'jlpt:read',
    description: '最近 30 天的错题与正答率。',
    inputSchema: { days: z.number().int().max(90).optional() },
    annotations: { readOnlyHint: true, openWorldHint: false },
    handler: async ({ days }, ctx) => ({ content: [{ type: 'text', text: JSON.stringify(await mistakes(ctx.ownerId, days)) }] }),
  },
  {
    name: 'jlpt_save_explanation',
    scope: 'jlpt:write',
    description: '为一道错题保存 Agent 写的讲解。只写讲解，不改题目和作答。',
    inputSchema: { questionId: z.string(), explanation: z.string().max(4000) },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    handler: async (args, ctx) => { /* UPDATE … WHERE owner = ctx.ownerId */ },
  },
]
```

`ctx` 里有 `ownerId / scopes / grantId / clientId / clientName / request`——全部来自已验证的 token，绝不来自工具输入。如果你的工具只是已有 REST API 的薄包装，可以像 Career Note 那样用 `ctx.request` 的 `Authorization` 头把请求转回自己的 handler（见 `worker/agent-tools.ts`），并用 `gateway.authenticate(request)` 让 REST 层接受 Agent token。

### 4. 创建网关并挂路由

```ts
import { createAgentGateway } from '@erzhiqian/agent-gateway';

const gateway = createAgentGateway({
  name: 'jlpt-note',
  basePath: '/api/jlpt',            // → /api/jlpt/mcp, /api/jlpt/mcp/schema, /api/jlpt/oauth/*
  consentPath: '/oauth/authorize',  // 你的前端页面
  scopes, identity, tools,
  storage: env.JLPT_DB,             // D1
  origins: { publicOrigin: 'https://jlpt.example.com', webOrigin: 'https://jlpt.example.com' },
  onEvent: (e) => audit.write(e),   // authorized / refreshed / revoked / tool（不含 payload）
});

export default {
  async fetch(request, env) {
    await gateway.ensureSchema();               // 幂等，四张表
    const handled = await gateway.fetch(request);
    if (handled) return handled;                // well-known / oauth / mcp / schema
    // …你原有的路由
  },
};
```

其他可选项：`accessTokenDays`（默认 30）、`refreshTokenDays`（默认 90）、`tokenPrefix`（默认 `agt_`，用于在自己的路由里识别 Agent token）、`tables`（沿用已有表名）、`anonymousDiscovery`（默认 true）、`contract`（随 schema 一起发布的数据契约 markdown）。

### 5. 同意页

授权服务器会把用户 302 到 `webOrigin + consentPath`（原样带 query）。页面用你自己的登录，用 headless hook 完成其余部分：

```tsx
import { useAgentConsent } from '@erzhiqian/agent-gateway/react';

const { client, chosen, toggle, decide, error, busy, destination, missingClient } = useAgentConsent({
  basePath: '/api/jlpt',
  authHeaders: () => ({ authorization: 'Bearer ' + session.token }), // 或留空，靠 cookie
});
// client.scopeDetails → 渲染复选框（required 的禁用）；decide('approve' | 'deny') 会跳回 Agent
```

### 6. 让用户管理授权

```ts
gateway.listGrants(ownerId)             // 哪些 Agent 连着我、什么权限、最后使用时间
gateway.revokeGrant(ownerId, grantId)   // 撤销并切断整条 refresh 链
```

### 7. 验证与发布

- 跑一次 `tests/gateway.test.mjs` 那样的 Miniflare 端到端（注册 → 授权 → 同意 → 换 token → 调工具 → 刷新 → 撤销）；fixture 在 `tests/fixtures/notes-host.ts`，30 行就是一个完整宿主。
- 真连一次：`claude mcp add --transport http jlpt https://jlpt.example.com/api/jlpt/mcp`，然后在 Claude Code 里 `/mcp` → Authenticate。
- `gateway.serverJson(request, 'io.github.<you>', '一句话描述')` 生成官方 MCP Registry 的 `server.json`；`mcp-publisher publish` 即可上架。Claude / ChatGPT 连接器目录另需人工提交（固定 HTTPS 地址、隐私政策）。

## 端点一览

| 路径 | 认证 | 作用 |
| --- | --- | --- |
| `GET /.well-known/oauth-protected-resource[<mcpPath>]` | 无 | 资源元数据（RFC 9728） |
| `GET /.well-known/oauth-authorization-server` | 无 | 授权服务器元数据（RFC 8414） |
| `GET <base>/mcp/schema` | 无 | 服务器名、端点、scope、全部工具的 JSON Schema |
| `POST <base>/mcp`（`initialize`/`ping`/`tools/list`） | 无 | 匿名发现；返回全量工具 |
| `POST <base>/mcp`（其他） | Agent token | MCP Streamable HTTP |
| `POST <base>/oauth/register` | 无（限速） | 动态客户端注册 |
| `GET <base>/oauth/authorize` | 无 | 校验后 302 到同意页 |
| `GET <base>/oauth/client` | 无 | 同意页读取客户端与 scope 说明 |
| `POST <base>/oauth/approve` | **宿主身份** | 用户同意/拒绝 → 授权码 |
| `POST <base>/oauth/token` | 客户端 | 授权码换 token、refresh 轮换 |

## 安全边界

- 用户身份只来自 `identity.resolve`；Agent token 不能用来 approve。
- 授权码 10 分钟、一次性；重放会吊销它签发的 token。refresh 轮换；重放已轮换的 refresh 会切断整条链。
- token 只存 SHA-256；audience 绑定 `publicOrigin + mcpPath`，换域名后旧 token 自动失效。
- `tools/call` 永远要 token；匿名发现只暴露工具元数据，不暴露数据。
- 跨站 `Origin` 的 MCP 请求被拒绝（loopback 除外）。

## 与 Cloudflare `workers-oauth-provider` 的区别

它解决同一层的 OAuth 问题（KV 存储）。本包多出：D1/SQL 存储、可插拔宿主身份、scope 化工具表、按授权裁剪的 `tools/list`、公开 schema 与匿名发现、同意页 hook、授权管理 API、以及一套可复用的端到端测试。如果你只需要 OAuth 而不需要以上任何一项，用官方库即可。
