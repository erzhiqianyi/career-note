export type McpClientKind = 'cli' | 'editor' | 'hosted';
export type McpStep = {
  title: string;
  detail?: string;
  code?: string;
  /** Screenshot under public/mcp-guides/. Omitted when none is captured yet. */
  image?: string;
  imageAlt?: string;
};
export type McpClient = {
  id: string;
  name: string;
  kind: McpClientKind;
  summary: string;
  /** Matches the OAuth client_name the assistant registers with. */
  match: RegExp;
  /** Steps to perform inside the client. */
  steps: (url: string) => McpStep[];
  /** What to type into the assistant to confirm the tools are reachable. */
  probe: string;
  /** Common failure → fix pairs. */
  troubleshooting: [string, string][];
};

export const mcpClientKinds: Record<McpClientKind, string> = {
  cli: '本机命令行',
  editor: '编辑器',
  hosted: '托管服务',
};
export const localEndpoint =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;
export const probeExpectation =
  '助手应调用 career_get_contract 并返回工作区约定；如果它说找不到工具或未授权，请看下方排查。';

export const mcpClients: McpClient[] = [
  {
    id: 'claude-desktop',
    name: 'Claude 桌面应用 / claude.ai',
    kind: 'hosted',
    summary:
      '全程在界面里操作：添加自定义连接器并点击 Connect，桌面应用的 Code 会话也会自动拿到它。',
    match: /claude(?!.*code)/i,
    steps: (url) => [
      {
        title: '打开连接器管理',
        detail:
          '在 Claude 桌面应用里点击输入框旁的 + → Connectors → Manage connectors；或者直接打开 Settings → Connectors。claude.ai 网页版路径相同。',
        image: 'claude-desktop-1.png',
        imageAlt: 'Claude 桌面应用输入框旁的 + 菜单，展开 Connectors',
      },
      {
        title: '添加自定义连接器',
        detail:
          '点击 Add custom connector，名称填 Career Note，Remote MCP server URL 填下面的地址。client ID / secret 留空。',
        code: url,
        image: 'claude-desktop-2.png',
        imageAlt: 'Add custom connector 对话框',
      },
      {
        title: '连接并授权',
        detail:
          '点击 Add，再在 Career Note 上点击 Connect。浏览器会打开 Career Note 的授权页，登录并勾选权限后点同意。',
        image: 'claude-desktop-3.png',
        imageAlt: 'Career Note 授权页',
      },
      {
        title: '在会话里启用',
        detail:
          '回到 Code 标签页，点击 + → Connectors，勾选 Career Note。claude.ai 对话的工具菜单里也会出现它。',
        image: 'claude-desktop-4.png',
        imageAlt: 'Connectors 菜单中勾选 Career Note',
      },
    ],
    probe: '调用 Career Note 的 career_get_contract，告诉我这个工作区的约定。',
    troubleshooting: [
      [
        '添加时提示 URL 无法访问',
        '地址必须是公网 https。运行 npm run dev:tunnel 后把打印的 Public MCP endpoint 填进去；.dev.vars 里 CAREER_AUTH_MODE 需为 strict。',
      ],
      [
        'Connect 后浏览器没有打开授权页',
        '检查桌面应用是否允许打开外部链接；也可以在 claude.ai 网页版完成 Connect，桌面应用会同步。',
      ],
      [
        'Code 会话里看不到 Career Note',
        '连接器只在本机与 SSH 会话可用，云端会话没有 + 按钮。重新开一个本机会话再看 + → Connectors。',
      ],
    ],
  },
  {
    id: 'claude-code',
    name: 'Claude Code（终端）',
    kind: 'cli',
    summary: '终端里一条命令添加，随后在会话内授权；本机地址可用。',
    match: /claude.*code/i,
    steps: (url) => [
      {
        title: '添加 MCP 服务',
        detail: '在任意终端执行：',
        code: `claude mcp add --transport http career-note ${url}`,
      },
      {
        title: '在会话里授权',
        detail:
          '启动 claude，输入 /mcp，选择 career-note → Authenticate。浏览器会打开授权页，登录并同意。',
        image: 'claude-code-2.png',
        imageAlt: 'Claude Code 的 /mcp 面板',
      },
      {
        title: '确认状态',
        detail: '再次输入 /mcp，career-note 应显示 connected，并列出 career_ 开头的工具。',
      },
    ],
    probe: '调用 career-note 的 career_get_contract，告诉我这个工作区的约定。',
    troubleshooting: [
      [
        '/mcp 里显示 failed',
        '确认 npm run dev 正在运行，并且地址与终端里打印的一致；用 claude mcp list 查看已注册地址。',
      ],
      [
        '授权页打不开',
        '手动复制终端里打印的 URL 到浏览器；授权成功后会自动回调到 localhost。',
      ],
      [
        '想删除重来',
        '执行 claude mcp remove career-note，然后重新添加。',
      ],
    ],
  },
  {
    id: 'codex',
    name: 'Codex CLI',
    kind: 'cli',
    summary: '添加后用 login 子命令完成浏览器授权。',
    match: /codex|openai/i,
    steps: (url) => [
      {
        title: '添加 Streamable HTTP 服务',
        code: `codex mcp add career-note --url ${url}`,
      },
      {
        title: '触发 OAuth 授权',
        detail: '浏览器会打开授权页，登录并同意：',
        code: 'codex mcp login career-note',
      },
      {
        title: '确认状态',
        detail: 'career-note 的 Auth 列应显示 Logged in：',
        code: 'codex mcp list',
      },
    ],
    probe: '调用 career-note 的 career_get_contract，告诉我这个工作区的约定。',
    troubleshooting: [
      [
        'codex mcp add 不认识 --url',
        '升级 Codex CLI 到支持 Streamable HTTP 的版本：npm i -g @openai/codex@latest。',
      ],
      [
        'login 后仍显示未登录',
        '删除后重新添加：codex mcp remove career-note，再执行添加与 login。',
      ],
    ],
  },
  {
    id: 'cursor',
    name: 'Cursor',
    kind: 'editor',
    summary: '写入 mcp.json，在 MCP 设置里点击登录。',
    match: /cursor/i,
    steps: (url) => [
      {
        title: '写入 mcp.json',
        detail:
          '在项目的 .cursor/mcp.json（或全局 ~/.cursor/mcp.json）中加入：',
        code: JSON.stringify(
          { mcpServers: { 'career-note': { url } } },
          null,
          2,
        ),
      },
      {
        title: '在设置里登录',
        detail:
          '打开 Cursor Settings → MCP，在 career-note 上点击 Needs Login。浏览器授权后会通过 cursor:// 链接跳回。',
        image: 'cursor-2.png',
        imageAlt: 'Cursor 设置中的 MCP 服务器列表',
      },
      {
        title: '确认状态',
        detail: 'career-note 前的圆点变绿，并展开显示 career_ 开头的工具。',
      },
    ],
    probe: '用 career-note 的 career_get_contract 工具，告诉我这个工作区的约定。',
    troubleshooting: [
      [
        '授权后没有跳回 Cursor',
        '浏览器会弹出"打开 Cursor"确认框，点允许；没有弹出时手动切回 Cursor 并刷新 MCP 列表。',
      ],
      [
        '圆点一直是红色',
        '确认 npm run dev 在运行；在 MCP 设置里关闭再打开 career-note 重新连接。',
      ],
    ],
  },
  {
    id: 'vscode',
    name: 'VS Code',
    kind: 'editor',
    summary: '用 code --add-mcp 或 .vscode/mcp.json 添加。',
    match: /visual studio|vs ?code/i,
    steps: (url) => [
      {
        title: '添加 MCP 服务',
        detail: '终端一次性添加：',
        code: `code --add-mcp '${JSON.stringify({ name: 'career-note', type: 'http', url })}'`,
      },
      {
        title: '或手动写入配置',
        detail: '项目的 .vscode/mcp.json：',
        code: JSON.stringify(
          { servers: { 'career-note': { type: 'http', url } } },
          null,
          2,
        ),
      },
      {
        title: '启动并授权',
        detail:
          '命令面板运行 MCP: List Servers → career-note → Start。出现授权提示时选择 Allow，在浏览器里完成登录与同意。',
        image: 'vscode-3.png',
        imageAlt: 'VS Code 的 MCP: List Servers 面板',
      },
      {
        title: '确认状态',
        detail:
          '打开 Chat 视图（Agent 模式），点击工具图标，列表里应出现 career-note 及其工具。',
      },
    ],
    probe: '使用 career-note 的 career_get_contract 工具，告诉我这个工作区的约定。',
    troubleshooting: [
      [
        '没有 MCP: List Servers 命令',
        '需要 VS Code 1.102 及以上，并确认 chat.mcp.enabled 未被关闭。',
      ],
      [
        'Start 后提示认证失败',
        '命令面板运行 MCP: Reset Trust 或在服务器上选择 Sign out，再重新 Start。',
      ],
    ],
  },
  {
    id: 'gemini',
    name: 'Gemini CLI',
    kind: 'cli',
    summary: '添加 http 传输后在会话里执行 /mcp auth。',
    match: /gemini|google/i,
    steps: (url) => [
      {
        title: '添加 MCP 服务',
        code: `gemini mcp add --transport http career-note ${url}`,
      },
      {
        title: '在会话里授权',
        detail: '启动 gemini 后输入以下命令，浏览器会打开授权页：',
        code: '/mcp auth career-note',
      },
      {
        title: '确认状态',
        detail: '输入 /mcp，career-note 应显示为 Ready 并列出工具。',
        code: '/mcp',
      },
    ],
    probe: '调用 career-note 的 career_get_contract，告诉我这个工作区的约定。',
    troubleshooting: [
      [
        '/mcp 显示 Disconnected',
        '检查 ~/.gemini/settings.json 里 career-note 的 httpUrl 是否正确；确认 npm run dev 在运行。',
      ],
    ],
  },
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    kind: 'hosted',
    summary: '开启开发者模式后创建连接器，认证方式选 OAuth。',
    match: /chatgpt|openai/i,
    steps: (url) => [
      {
        title: '开启开发者模式',
        detail: 'Settings → Connectors → Advanced settings，打开 Developer mode。',
        image: 'chatgpt-1.png',
        imageAlt: 'ChatGPT 连接器高级设置',
      },
      {
        title: '创建连接器',
        detail:
          '回到 Connectors 点击 Create，名称填 Career Note，MCP server URL 填：',
        code: url,
        image: 'chatgpt-2.png',
        imageAlt: 'ChatGPT 新建连接器对话框',
      },
      {
        title: '选择 OAuth 并授权',
        detail:
          'Authentication 选择 OAuth，点击 Create。浏览器会打开授权页，登录并同意。',
      },
      {
        title: '在对话里启用',
        detail: '新建对话，在 + → Developer mode 里勾选 Career Note。',
      },
    ],
    probe: '调用 Career Note 的 career_get_contract，告诉我这个工作区的约定。',
    troubleshooting: [
      [
        '看不到 Developer mode',
        '需要 Plus / Pro / Business 计划，并在 Advanced settings 里打开。',
      ],
      [
        '创建时提示无法连接',
        '地址必须是公网 https。运行 npm run dev:tunnel 并使用打印的 Public MCP endpoint；随机的 trycloudflare 地址每次重启都会变。',
      ],
    ],
  },
];

export const mcpSetupPage = '添加 AI 助手';
export const mcpSetupHash = '#connect';
export const mcpClientPage = (id: string) => '连接 ' + id;
export const mcpClientHash = (id: string) => '#connect-' + id;
export const findMcpClient = (page: string) =>
  mcpClients.find((c) => mcpClientPage(c.id) === page);
