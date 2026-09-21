# 構造化された履歴管理

履歴情報を `resume_entries` の独立したレコードとして保存する。種類は基本資料、職歴、学歴、個人・業務プロジェクト、技能、成果、言語、希望条件、文書版。種類別のフィールド定義と入力検証は `lib/resume.ts` を共有する。年月、URL、必須値、未知フィールドをAPI側でも検証する。

各レコードはユーザーの名前空間、id、kind、language（ja/zh/en、省略時はja）、revision、parent_id、archived、構造化JSONのbody、更新日時を持つ。言語ごとに独立したレコードを保持し、画面は表示言語に一致する記録だけを表示する。基本資料と希望条件は言語ごとに1件。bodyは単一のMarkdownではなく、employer、client、role、startDateなどの種類別フィールドを持つ。プロジェクトは職歴へ、技能・成果は職歴またはプロジェクトへ関連付けられる。由来と確認状態は各レコードに保存する。

- `GET /api/career/resume`：本人の全レコード（アーカイブを含む）。
- `POST /api/career/resume`：1レコードの作成・編集・アーカイブ・復元。新規はrevision 0、更新は最新revision。idと種類は変更しない。
- `GET /api/career/resume/history?id=...`：本人の対象レコードの版履歴。
- `GET /api/career/state`：既存データに加えてresume配列を返す。

MCPは `career_get_resume`、`career_save_resume_entry`、`career_resume_history` を公開する。読み込みにcareer:read、変更にcareer:writeが必要。ユーザーIDはクライアントから指定できない。career_get_resumeは種類別フィールドの一覧も返す。

更新はSQLのrevision条件で競合を拒否する。DBトリガーが同じトランザクション内で `resume_history` へ各版を記録する。変更時は既存profileのrevisionも進め、以前の資料生成時点から変更されたことを検出できる。原文フィールドは変更しない。

文書の本文は作成後に上書きできない。別のidと版名で新しい文書を作る。アーカイブ・復元は可能。履歴の削除APIは提供しない。

旧profileは互換用に残し、画面では折り畳んで原文を表示する。Markdownの自動解析で雇用関係や成果を作らない。Agentが本人の依頼に従って原文を読み、新規レコードを作り、読み戻しで照合する。元の文書は文書版として保存する。連続した複数レコードの移行は一括トランザクションではないため、失敗時は既存idを読んで再開する。

ローカルD1の永続化場所と認証設定は[導入手順](local-setup.md)を参照。個人の移行JSONや検証画像はリポジトリ外に保存する。

## Agent の段階的な読み込み

MCP の `career_get_resume` は構造化レコードと文書版のメタデータを返す。document の `data.content` は含めない。id、revision、data.title、data.version、language、archived、updatedAt、sourceNotes は保持する。`career_get_context` の resume 配列も同じ方針。`career_resume_history({ id })` は data を除いた修訂一覧を返す。

本文や過去の構造化データが必要な場合だけ `career_get_resume_version({ id, revision })` で1版を取得する。data.version は表示用の版名であり、取得キーは id と数値の revision。文書の新しい版は別 id、同じ id の revision はアーカイブなどの変更履歴を表す。存在しない版は404、無効な指定は400。取得は本人の名前空間と career:read に制限する。

REST では `GET /api/career/resume?view=summary`、`GET /api/career/state?resumeView=summary`、`GET /api/career/resume/history?id=...&view=summary` に対応し、単一版は `GET /api/career/resume/version?id=...&revision=...` で取得する。既存のWeb編集画面との互換性のため、REST のパラメータなしの読み込みは従来の完全データを維持する。MCP ツールは必ず summary を指定する。
### 求职方向的记录边界

`preferences` 不再把多个目标岗位视为一个事实字段。新记录应使用一条记录对应一个 `data.role`，并在 `data.rationale` 中说明投递理由和匹配依据；`sourceNotes` 记录依据来源，`verification` 表示本人确认状态。旧版 `data.roles` 多行或逗号文本仅作兼容读取，不会在读取时自动拆分、覆盖或写回真实资料。

同一语言下可以保存多个未归档的 `preferences` 记录。每条记录独立拥有 id、revision、来源和确认状态；归档一个方向不会影响其他方向。未确认的方向不应被当作已确认事实，也不会自动生成或更新応募書類。
