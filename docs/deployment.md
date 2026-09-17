# Cloudflare へのデプロイ（Pages + Workers）

Career Note は本来ローカル向けですが、フロントエンドとバックエンドを分けて **自分の Cloudflare アカウント** に公開できます。公開後も `npm run dev` のローカル運用はそのまま使えます。

リポジトリにはホスト名やアカウント固有の id を一切含めていません。fork した人は **コードを書き換えずに**、自分の GitHub リポジトリの Secrets / Variables を設定するだけで同じ手順で公開できます。以下では `career.example.com`（画面）と `career-api.example.com`（API）を例にします。自分のドメインに読み替えてください。

## 構成

| 役割 | 実体 | ホスト名（例） | 配置先 |
| --- | --- | --- | --- |
| 画面 | `npm run build` の静的出力 `dist/client`（`next.config.ts` の `output: 'export'`） | `career.example.com` | Cloudflare Pages プロジェクト `career-note` |
| API / MCP | `worker/index.ts`（`wrangler.toml`） | `career-api.example.com` | Cloudflare Worker `career-note-api` + D1 |

画面は API のアドレスをビルド時に `NEXT_PUBLIC_CAREER_API_URL` から埋め込みます（[lib/api-base.ts](../lib/api-base.ts)）。未設定なら同一オリジン扱いで、ローカルでは Vite のプロキシが `/api/career` を Worker へ渡します。Worker は `CAREER_WEB_ORIGIN` と `CAREER_CORS_ORIGINS` に列挙したオリジンにだけ CORS を許可します。画面以外のクライアント（Agent、CLI、ネイティブアプリ）はブラウザーではないので CORS の影響を受けず、同じ API をそのまま使えます。

OAuth と MCP の公開アドレスは API 側（`CAREER_PUBLIC_ORIGIN`）、同意画面は画面側（`CAREER_WEB_ORIGIN`）です。MCP クライアントには `https://career-api.example.com/api/career/mcp` を登録します。

## 設定値はどこに置くか

| 値 | 置き場所 | 理由 |
| --- | --- | --- |
| API ホスト名、画面ホスト名、D1 名、Pages プロジェクト名 | GitHub **Variables**（`vars.*`） | 秘密ではないが、アカウントごとに違う。リポジトリに書くと fork が壊れる |
| D1 の `database_id` | どこにも書かない | デプロイ時に `wrangler d1 list` で名前から引く |
| Cloudflare Account ID / API Token | GitHub **Secrets** | 認証情報 |
| Firebase 設定、`CAREER_WEB_ORIGIN` などの Worker 実行時設定 | Worker の **secrets**（`wrangler secret put`） | 実行時に必要。`[vars]` に置くとローカルの off モードまで変わる |

`wrangler.toml` は汎用のまま commit し、デプロイ時に [scripts/render-wrangler-config.mjs](../scripts/render-wrangler-config.mjs) が `CAREER_API_HOST` と D1 の id を差し込んだ `wrangler.deploy.toml`（gitignore 済み）を生成します。`wrangler dev` は `routes` も `database_id` も読まないので、ローカルは汎用ファイルのままで動きます。

## 初回だけ行う準備

1. **D1 を作る**

   ```sh
   npx wrangler d1 create career-note
   ```

   名前を変えた場合は後述の Variable `CAREER_D1_NAME` に同じ名前を設定します。`database_id` をメモする必要はありません。テーブルは初回リクエスト時に `CREATE TABLE IF NOT EXISTS` で作られるため、マイグレーション作業はありません。

2. **API Worker を一度手元からデプロイし、secrets を登録する**

   ```sh
   CAREER_API_HOST=career-api.example.com npm run wrangler:config
   npx wrangler deploy --config wrangler.deploy.toml
   ```

   `custom_domain = true` により DNS レコードは自動作成されます（ドメインがその Cloudflare アカウントのゾーンにあることが前提）。続けて次を `npx wrangler secret put <NAME> --name career-note-api` で登録します。

   | NAME | 値 |
   | --- | --- |
   | `CAREER_AUTH_MODE` | `strict`（公開環境では必須。off はエッジ経由のリクエストを 403 で拒否します） |
   | `FIREBASE_API_KEY` / `FIREBASE_AUTH_DOMAIN` / `FIREBASE_PROJECT_ID` / `FIREBASE_APP_ID` | Firebase Web アプリの設定 |
   | `CAREER_ADMIN_UIDS` | 管理者の Firebase UID（任意） |
   | `CAREER_WEB_ORIGIN` | `https://career.example.com`（画面のオリジン。CORS と OAuth 同意画面の行き先） |
   | `CAREER_PUBLIC_ORIGIN` | `https://career-api.example.com`（API 自身のオリジン。OAuth メタデータに載る） |
   | `CAREER_CORS_ORIGINS` | 追加で許可するブラウザーオリジン（カンマ区切り、任意） |

3. **Pages プロジェクトを作り、カスタムドメインを付ける**

   ```sh
   npx wrangler pages project create career-note --production-branch main
   ```

   Dashboard → Workers & Pages → `career-note` → Custom domains で `career.example.com` を追加します（DNS は自動）。プロジェクト名を変えた場合は Variable `CAREER_PAGES_PROJECT` に設定します。

4. **Firebase Console** → Authentication → Settings → Authorized domains に `career.example.com` を追加します。

5. **GitHub リポジトリの設定**（Settings → Secrets and variables → Actions）

   Secrets タブ：

   | Secret | 値 |
   | --- | --- |
   | `CLOUDFLARE_ACCOUNT_ID` | `npx wrangler whoami` に表示される Account ID |
   | `CLOUDFLARE_API_TOKEN` | 「Edit Cloudflare Workers」テンプレートで作成し、**Account › D1: Edit**、**Account › Cloudflare Pages: Edit**、**Zone › Workers Routes: Edit**（対象ゾーン限定）を追加 |

   Variables タブ：

   | Variable | 値 | 省略時 |
   | --- | --- | --- |
   | `CAREER_API_HOST` | `career-api.example.com`（`https://` なし） | 必須 |
   | `CAREER_WEB_HOST` | `career.example.com` | 必須 |
   | `CAREER_D1_NAME` | 手順 1 の D1 名 | `career-note` |
   | `CAREER_PAGES_PROJECT` | 手順 3 の Pages プロジェクト名 | `career-note` |

## main への push で自動デプロイ

- [.github/workflows/api-deploy.yml](../.github/workflows/api-deploy.yml)：`worker/`、`lib/`、`wrangler.toml` などが変わったとき。`npm test` → `typecheck` → `npm run wrangler:config` → `wrangler deploy --config wrangler.deploy.toml` → `GET /api/career/auth/config` が `mode: strict` を返すか確認。
- [.github/workflows/web-deploy.yml](../.github/workflows/web-deploy.yml)：画面側が変わったとき。`npm test` → `typecheck` → `check:public` → `NEXT_PUBLIC_CAREER_API_URL=https://$CAREER_API_HOST` で `npm run build` → `wrangler pages deploy dist/client` → `/` と `/oauth/authorize` を確認。
- どちらも Actions 画面から `workflow_dispatch` で手動実行できます。[ci.yml](../.github/workflows/ci.yml) は従来どおり PR と main の検証だけを行います。Variables が未設定なら最初のステップで止まり、どれが足りないかを表示します。

ホスト名を変える場合は、GitHub Variables と Worker secrets（`CAREER_WEB_ORIGIN` / `CAREER_PUBLIC_ORIGIN`）、Firebase の Authorized domains を揃えて更新します。コードの変更は不要です。

## 手元から手動でデプロイする

CI を使わずに手元から出す場合も同じスクリプトを使います。`wrangler.deploy.toml` は gitignore 済みなので誤って commit しません。

```sh
CAREER_API_HOST=career-api.example.com npm run wrangler:config
npx wrangler deploy --config wrangler.deploy.toml
NEXT_PUBLIC_CAREER_API_URL=https://career-api.example.com npm run build
npx wrangler pages deploy dist/client --project-name career-note --branch main
```

## 公開後の注意

- 公開環境に載るのは求人・履歴・練習記録などの個人データです。Google ログインは必須（strict）で、ユーザーごとに独立したワークスペースになります。管理者権限は `CAREER_ADMIN_UIDS` にだけ与えてください。
- `npm run dev:tunnel` の隧道公開と本番公開は別物です。隧道はローカル Worker を一時的に公開するもので、本番 Worker のデータとは共有されません。
- ローカルの `wrangler dev` は `database_id` を見ず、`~/.local/share/career-note/worker-state/` のローカル SQLite を使います。本番 D1 のバックアップは `npx wrangler d1 export career-note --remote --output backup.sql` で取れます。
