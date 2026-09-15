# 个性化简历草稿格式

以下是虚构的最小示例。将值替换为用户有依据的事实，不能复制示例经历作为用户事实。

```json
{
  "id": "example-backend-en",
  "revision": 0,
  "title": "Backend résumé · English",
  "targetRole": "Backend Engineer",
  "targetCompany": "",
  "language": "en",
  "content": {
    "name": "Example Candidate",
    "headline": "Backend Engineer",
    "summary": "Summary based on the supplied evidence.",
    "location": "",
    "links": [],
    "sections": [
      {
        "heading": "Experience",
        "items": [
          {
            "title": "Engineer",
            "subtitle": "Example employer",
            "period": "2020–2022",
            "bullets": ["An evidence-based contribution."]
          }
        ]
      }
    ]
  },
  "sourceRefs": [],
  "privateNotes": "Source document and unresolved questions.",
  "archived": false
}
```

- 所有显示内容为纯文本，不能包含可执行 HTML。链接仅允许 HTTP、HTTPS 或 mailto。
- 章节最多 12 个，每章最多 30 条，每条最多 30 个要点。links 最多 12 个，每项为 `{ "label": "Portfolio", "url": "https://example.com" }`。
- 引用应用中已有来源时，sourceRefs 每项为 `{ "id": "source-record-id", "revision": 1 }`。服务端检查来源归属和版本存在性；不能引用别人的记录。
- 外部文件没有 MCP 记录 id 时不要伪造 sourceRefs；在 privateNotes 记录文件名及对应事实。
- 本机 JSON 导入总是赋予新 id、revision 0；MCP 保存同 id 的新版本要求传最新 revision，不能传 updatedAt。
- 发布只取 content 和 language 的快照。管理名称、目标公司、privateNotes、sourceRefs 不进入公开 HTML。
