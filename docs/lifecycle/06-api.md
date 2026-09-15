# 06 API・詳細設計

状態：v0.1.0 の実装に対応。JSON を使用し、ベースパスは `/api/career`。

## エンドポイント

| メソッド / パス | 用途 | 権限 |
| --- | --- | --- |
| GET `/auth/config` | 公開 Firebase Web 設定・認証モード | 未認証可。公開 SDK 設定のみ |
| GET `/auth/me` | 検証済みログインコンテキスト | 認証有効時は Bearer 必須 |
| GET `/state` | 全ワークスペース状態 | career:read |
| POST `/profile` | プロフィール保存 | career:write |
| POST `/jobs` | 求人・ユーザーの応募情報保存 | career:write |
| POST `/platforms` | 求人サービス設定 | career:write |
| POST `/tasks` | 作業依頼 | agent:write |
| POST `/attempts` | 面接の元回答保存 | career:write |
| POST `/import/preview` | Agent パッケージの部分的な検証・件数確認 | agent:write |
| POST `/import` | Agent パッケージ取込 | agent:write |
| GET `/mcp/tokens` | 許可済み Agent の一覧（失効・期限切れも `revoked` / `expired` 付きで返す） | ログイン本人（off モードはローカル） |
| POST `/mcp/tokens/revoke` | 許可の失効（refresh も同時失効） | ログイン本人 |
| GET `/mcp/activity?tokenId=&limit=` | Agent の操作履歴（authorized / refreshed / revoked / tool:<path>、ツール名と件数のみ、所有者ごとに 500 件・180 日で自動削除） | ログイン本人 |
| POST `/oauth/register` | OAuth 動的クライアント登録（RFC 7591） | 未認証可、IP ごとに制限 |
| GET `/oauth/authorize` | 認可要求の検証 → 同意ページへ 302 | 未認証可 |
| GET `/oauth/client` | 同意ページ用のクライアント名・戻り先 | 未認証可 |
| POST `/oauth/approve` | 利用者の同意 → 認可コード発行 | ログイン本人（off モードはローカル） |
| POST `/oauth/token` | authorization_code / refresh_token → `mcp_` アクセストークン | クライアント認証 |
| GET `/.well-known/oauth-protected-resource`、`/.well-known/oauth-authorization-server` | OAuth ディスカバリー（`/api/career` 外） | 未認証可 |
| POST `/mcp` | Streamable HTTP MCP | OAuth で発行された Bearer token |

MCP・OAuth・Agent トークンの実装は `packages/agent-gateway`（`@erzhiqian/agent-gateway`）に切り出し、Career Note は `worker/agent-tools.ts` のツール表と Firebase 身元だけを供給する（[README](../../packages/agent-gateway/README.md)）。標準 MCP の接続先は `/api/career/mcp`。初期化、ツール一覧、ツール呼出しに対応する。`career_get_contract`、`career_get_context`、`career_preview_import`、`career_import`、`career_create_task`、`career_update_profile` を scope に応じて公開し、トークン所有者のワークスペースだけを操作する。ブラウザーの任意 WebMCP と HTTP データ CLI は別の経路。

`GET /api/career/mcp/schema` は認証なしで読める公開スキーマ。サーバー名、エンドポイント、OAuth の resource metadata と scope 一覧、全ツールの名前・必要 scope・説明・入力 JSON Schema・annotations、データ契約本文を返す（ユーザーデータは含まない）。また `/api/career/mcp` への Authorization なしの `initialize`・`ping`・`tools/list` は全 scope 分のツール一覧を返し（レジストリーやクライアントが認可前に確認できる）、`tools/call` を含む要求は 401 チャレンジになる。

## 入出力例

```json
{
  "revision": 0,
  "summary": "架空のプロフィール",
  "skills": "TypeScript",
  "experience": "",
  "targetRoles": "Web エンジニア",
  "japanese": "",
  "conditions": "",
  "sourcePath": ""
}
```

`POST /profile` の入力例。実際にはまず state.profile を取得し、現在の revision を使う。成功時は更新後オブジェクトを返す。失敗は `{"error":"説明"}`。

- 400：入力不正、関連不在、既存のプロフィール等との revision 不一致。
- 401：認証情報なし、無効・期限切れのトークン。
- 403：権限不足、Agent scope 不足。
- 404：未実装のパス。
- 409：求人サービス設定の競合。
- 503：認証設定不正。
- 500：バインディング不在・内部処理失敗等。

## Google 認証

Firebase SDK の Google popup → Firebase ID トークン → Bearer → `jose` と Google 公開鍵で RS256 / issuer / audience / exp 等を検証 → Google プロバイダー・確認済みメールを確認し、検証済み UID に資料の読み書きを限定する。ブラウザーだけのログイン表示をアクセス許可としない。

## Agent の OAuth 認可

Agent のトークンは OAuth 2.1 の認可コードフロー（PKCE S256 必須、動的クライアント登録、RFC 8707 resource、refresh トークンのローテーション）でのみ発行する。`/mcp` は未認証時に `WWW-Authenticate: Bearer resource_metadata=…` を返し、クライアントがディスカバリーと認可を開始する。認可コードは 10 分・一回限りで、再利用は発行済みトークンの失効を伴う。アクセストークンは `mcp_` 形式、SHA-256 ハッシュ・owner_uid・client_id・audience（`CAREER_PUBLIC_ORIGIN` + `/api/career/mcp`）・有効期限（`MCP_TOKEN_TTL_DAYS`、既定 30 日）を DB に保存し、audience が一致しないトークンは拒否する。refresh トークンは `mcr_` 形式、既定 90 日（`CAREER_OAUTH_REFRESH_DAYS`）、使用のたびに新しい組に置き換え、失効済み refresh の再利用は連鎖ごと失効させる。同意ページは `CAREER_WEB_ORIGIN` の `/oauth/authorize` で、`career:write` は既定で未選択。off モードでは同意ページがログインなしでローカルワークスペースとして許可するが、`CAREER_PUBLIC_ORIGIN` が https の場合は OAuth エンドポイントを 503 で拒否する。失効・期限切れのトークン行は削除せずに残す（refresh 再利用検知と履歴の参照先になるため）。すべての MCP ツール呼出しと許可・更新・失効は `agent_activity` に記録し、内容は保存しない。Firebase 側のログアウトだけで発行済み Agent トークンが失効するわけではない。設計の詳細は [MCP OAuth 設計](../mcp-oauth-design.md)。

## Agent データパッケージ

トップレベルは `schemaVersion: 1`、`jobs`、`materials`、`reports`、`questionSets`、`reviews`、`completeTaskIds`。省略できる配列と、必須の `completeTaskIds` を区別する。例は [examples](../../examples/README.md)。型ごとの上限は現行コード参照。Web import の 3 MB 制限はサーバー全体の一律制限ではない。

現在の import は逐次書込みで、完全なバッチ原子性を保証しない。preview も全保存処理と同等の検証ではない。新規求人とその資料は別々のパッケージで順に取り込む。失敗時は保存済み ID を読戻してから再試行する。

## 同期と障害

state は全件取得、画面は定期更新。ページネーション、完全な同時編集制御、リトライの冪等キー、DB マイグレーションは未実装。処理の成功と、利用者が新しい内容を読めたことを別々に検証する。
