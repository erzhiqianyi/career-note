# MCP 连接指南截图

把截图按下列文件名放进本目录，Agent 协作 → 对应客户端页面会自动显示；文件不存在时该步骤不显示图片。
建议宽度 1200–1600px，PNG，裁掉个人信息（账号、邮箱、其他连接器）。

| 文件 | 步骤 |
| --- | --- |
| claude-desktop-1.png | Claude 桌面应用：输入框旁 + → Connectors 菜单 |
| claude-desktop-2.png | Claude：Add custom connector 对话框 |
| claude-desktop-3.png | Career Note 授权页 |
| claude-desktop-4.png | Claude：Connectors 菜单里勾选 Career Note |
| claude-code-2.png | Claude Code 的 /mcp 面板 |
| cursor-2.png | Cursor Settings → MCP 列表 |
| vscode-3.png | VS Code 的 MCP: List Servers 面板 |
| chatgpt-1.png | ChatGPT Settings → Connectors → Advanced settings |
| chatgpt-2.png | ChatGPT 新建连接器对话框 |

文件名在 [lib/mcp-clients.ts](../../lib/mcp-clients.ts) 的 `image` 字段里定义。
