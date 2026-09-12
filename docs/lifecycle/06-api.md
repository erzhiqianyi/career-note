# 06 API・詳細設計

状態：v0.1.0 の実装に対応。JSON を使用し、ベースパスは `/api/career`。

## エンドポイント

| メソッド / パス | 用途 | 権限 |
| --- | --- | --- |
| GET `/auth/config` | 公開 Firebase Web 設定・認証モード | 未認証可。許可リストを返さない |
| GET `/auth/me` | 検証済みログインコンテキスト | 認証有効時は Bearer 必須 |
| GET `/state` | 全ワークスペース状態 | career:read |
| POST `/profile` | プロフィール保存 | career:write |
| POST `/jobs` | 求人・ユーザーの応募情報保存 | career:write |
| POST `/platforms` | 求人サービス設定 | career:write |
| POST `/tasks` | 作業依頼 | agent:write |
| POST `/attempts` | 面接の元回答保存 | career:write |
| POST `/import/preview` | Agent パッケージの部分的な検証・件数確認 | agent:write |
| POST `/import` | Agent パッケージ取込 | agent:write |
| GET `/mcp/tokens` | トークン一覧 | 管理者 |
| POST `/mcp/tokens` | トークン発行 | 管理者、admin scope |
| POST `/mcp/tokens/revoke` | トークン失効 | 管理者 |

`mcp/tokens` という名称は、この API 全体が標準 MCP サーバーのプロトコルを実装する意味ではない。ブラウザーの任意 WebMCP と HTTP データ CLI は別の経路。

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
- 403：許可アカウント外、権限不足。
- 404：未実装のパス。
- 409：求人サービス設定の競合。
- 503：認証設定不正。
- 500：バインディング不在・内部処理失敗等。

## Google 認証

Firebase SDK の Google popup → Firebase ID トークン → Bearer → `jose` と Google 公開鍵で RS256 / issuer / audience / exp 等を検証 → Google プロバイダー・確認済みメール・許可アカウントを確認する。ブラウザーだけのログイン表示をアクセス許可としない。

MCP 用トークンはランダム値を一度返し、SHA-256 ハッシュを DB に保存する。DB の owner_uid・有効期限・失効状態・scope を使用する。Firebase 側のログアウトだけで発行済み Agent トークンが失効するわけではない。

## Agent データパッケージ

トップレベルは `schemaVersion: 1`、`jobs`、`materials`、`reports`、`questionSets`、`reviews`、`completeTaskIds`。省略できる配列と、必須の `completeTaskIds` を区別する。例は [examples](../../examples/README.md)。型ごとの上限は現行コード参照。Web import の 3 MB 制限はサーバー全体の一律制限ではない。

現在の import は逐次書込みで、完全なバッチ原子性を保証しない。preview も全保存処理と同等の検証ではない。新規求人とその資料は別々のパッケージで順に取り込む。失敗時は保存済み ID を読戻してから再試行する。

## 同期と障害

state は全件取得、画面は定期更新。ページネーション、完全な同時編集制御、リトライの冪等キー、DB マイグレーションは未実装。処理の成功と、利用者が新しい内容を読めたことを別々に検証する。
