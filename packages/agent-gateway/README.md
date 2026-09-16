# @ninomae/agent-gateway（workspace 副本）

这个目录是 [erzhiqianyi/agent-gateway](https://github.com/erzhiqianyi/agent-gateway) 的临时 workspace 副本，只为在 npm 版本发布前让 Career Note 能继续 `import '@ninomae/agent-gateway'`。

- 文档、示例、测试、发布流程都在独立仓库：本机路径 `../../../agent-gateway`，README 见那边的 `README.zh-CN.md`，发布见 `docs/publishing.zh-CN.md`，接入见 `docs/integration.zh-CN.md`。
- **不要在这里改代码**；改独立仓库，再把 `src/` 同步回来（`cp ../../../agent-gateway/src/* src/` 并把 `./x.js` 改回 `./x`，或直接等发布）。
- 发布 `0.1.0` 之后按 `docs/publishing.zh-CN.md` 末尾的四条命令切换：删掉本目录、去掉 `workspaces`、`npm install @ninomae/agent-gateway@^0.1.0`。
