# ローカル導入手順

## 対象環境

Node.js 22.13 以上、npm、Git、ブラウザー。22 LTS / 24 LTS を対象にする。macOS / Linux はターミナル、Windows は WSL2 の Linux 環境で以下のコマンドを実行する。Windows ネイティブは参考対応で、受入検証範囲外。Python と Docker は不要。

初回は依存のダウンロードにネット接続が必要。通常のローカル D1 に Cloudflare ログインは不要。`npm ci` は OS ごとのバイナリをインストールするので、別 OS の node_modules をコピーしない。

## 取得と起動

```sh
git clone https://github.com/erzhiqianyi/career-note.git
cd career-note
node --version
npm ci
npm run dev
```

[http://localhost:4210](http://localhost:4210) を開く。サービス停止は Ctrl+C。状態の診断は別ターミナルで `npm run doctor`。

`npm run dev` / `npm start` は両方とも開発構成を起動する。ビルド成果物の公開配信を自動設定するコマンドではない。データ保存先は Node.js のホームディレクトリ配下 `~/.local/share/career-note/worker-state/`。スキーマは初回 API アクセスで作成される。

## ローカル設定

既存ファイルがある場合は上書きせず編集する。

```sh
cp -n .env.example .env
```

```dotenv
CAREER_DATA_DIR=/absolute/path/outside/repository/career-note-data
CAREER_WEB_PORT=4210
CAREER_API_PORT=4211
```

このパスは例であり、そのまま貼り付けず、自分の書込み可能な保存先へ変える。空欄なら既定の保存先。起動スクリプトは `.env` を読み、既にシェルにある環境変数を優先する。ポートが競合したら両ポートを空いている番号に変える。無関係なサービスを終了しない。

### ポート番号の規約

本機のローカルプロジェクトは 10 番ごとの区画で管理する（`42x0` 起点、末尾の桁が役割）。登記簿は `~/.cloudflared/config.yml` 冒頭のコメント。

| 末尾 | 役割 |
|---|---|
| `x0` | 画面（dev サーバー） |
| `x1` | API / バックエンド |
| `x2` | MCP（独立プロセスの場合） |
| `x3` | ビルド プレビュー |
| `x9` | 予備（臨時デバッグ） |

| プロジェクト | 区画 | 画面 | API | トンネル |
|---|---|---|---|---|
| Career Note | 4210–4219 | 4210 | 4211 | `career-local` → 4210（画面ごと公開。Vite が `/api/career` と `/.well-known` を 4211 へ転送） |
| JLPT | 4220–4229 | 4220 | 4221 | `jlpt-local` → 4220（画面ごと公開） |
| 次のプロジェクト | 4230–4239 | 4230 | 4231 | |

`4317/4318`（OTLP）、`5000/7000`（macOS AirPlay）、`8787`（wrangler 既定）は避ける。全プロセスは `127.0.0.1` / `localhost` にのみ束縛し、LAN 公開は行わない。

`CAREER_API_PROXY` は画面の転送先、`CAREER_WRANGLER_CONFIG` は Worker 設定パスを上書きする任意項目。既に API が動いているときは `CAREER_API_PROXY=http://127.0.0.1:4219 npm run dev:web` で画面だけ起動できる。`npm run dev` は転送先にかかわらず Worker も起動する。

初回導入では空の保存先を使用する。旧版のデータを読み込む互換処理・移行機能は提供しない。

## Google ログイン（任意）

1. Firebase Console で自分のプロジェクトを作成または選択する。
2. 「プロジェクト設定 → 全般 → マイアプリ」で **Web アプリ**を登録する。iOS / Android アプリの設定を流用しない。Hosting は本手順で不要。
3. 「Authentication → Sign-in method」で Google を有効にする。必要な公開名とサポートメールを設定する。
4. 「Authentication → Settings → Authorized domains」に `localhost` があることを確認する。
5. `cp -n .dev.vars.example .dev.vars` を実行し、Web SDK の firebaseConfig を対応する項目へコピーする。

| firebaseConfig | `.dev.vars` |
| --- | --- |
| apiKey | FIREBASE_API_KEY |
| authDomain | FIREBASE_AUTH_DOMAIN |
| projectId | FIREBASE_PROJECT_ID |
| appId | FIREBASE_APP_ID |

```dotenv
CAREER_AUTH_MODE=strict
FIREBASE_API_KEY=your-web-api-key
FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
FIREBASE_PROJECT_ID=your-project
FIREBASE_APP_ID=your-web-app-id
CAREER_ADMIN_UIDS=
```

設定後に再起動し、Google ログインする。すべての確認済み Google アカウントが利用でき、初回は空の専用ワークスペースから始まる。メールの許可リストは不要。データはプロジェクト ID と検証済み UID ごとに分離する。

サービスアカウント秘密鍵は不要。Web 設定はブラウザーへ返す公開設定で、秘密の管理者資格情報ではない。API キーを含め、実プロジェクト設定は `.dev.vars` に保管し、サンプルへ入れない。

FIREBASE_PROJECT_ID が存在すると既定の認証モードは strict。on / strict の両方で署名を検証する。明示的な off は本機モード専用で、従来のローカル資料を保持する。既存資料は新しい Google アカウントへ自動移行しない。AI Agent は MCP の OAuth 認可（ブラウザーでログインして同意）でトークンを受け取る。手動発行はない。Google ユーザーは Agent 協作で許可済み Agent を確認・失効できる。トークンでは別ユーザーの資料にアクセスできない。

参考：[Google サインイン](https://firebase.google.com/docs/auth/web/google-signin)、[ID トークン検証](https://firebase.google.com/docs/auth/admin/verify-id-tokens)。

## AI Agent の接続（MCP + OAuth）

Claude Code、Codex CLI、Cursor、VS Code など本機で動く Agent は、`http://127.0.0.1:4211/api/career/mcp`（または `http://localhost:4210/api/career/mcp`）を Streamable HTTP の MCP サーバーとして追加するだけでよい。トークンは入力しない。初回接続時に Agent がブラウザーで `http://localhost:4210/oauth/authorize` を開き、（Google モードでは）ログインして権限を選び同意すると、Agent が自動でトークンを受け取る。

```sh
claude mcp add --transport http career-note http://127.0.0.1:4211/api/career/mcp
```

Claude Code では `/mcp` → career-note → Authenticate で認可を開始する。許可済み Agent は画面の「Agent 協作 → 訪問設定」で確認・失効できる。

### トンネルで公開する（`npm run dev:tunnel`）

`npm run dev` は本機専用で、公開アドレスを一切使わない。claude.ai や ChatGPT のコネクターのようにホスト型の Agent は `127.0.0.1` に届かないので、その場合だけ `npm run dev:tunnel` を使う。ingress を画面ポート 4210 へ向けると画面・同意ページ・MCP（`/api/career/mcp`）がすべて公開アドレスで使える（Vite が `/api/career` と `/.well-known` を 4211 へ転送）。API ポート 4211 へ向けた場合は MCP だけ公開され、同意ページは本機の `localhost:4210` で開く。`.dev.vars` は `CAREER_AUTH_MODE=strict` が必要（off のままだとトンネル経由の要求は 403、OAuth エンドポイントは 503）。Google ユーザーごとにワークスペースは分離されるため、他人がログインしても自分の資料は見えない。

**A. 名前付きトンネルを使う（固定アドレス、推奨）** — `.env` に 2 行書く：

```sh
CAREER_TUNNEL=<cloudflared のトンネル名>
CAREER_PUBLIC_ORIGIN=https://career-local.example.com
```

`~/.cloudflared/config.yml` の ingress に、**catch-all（`service: http_status:404`）より前に**追加する。ingress は上から順に評価されるため、後ろに置くと届かない。

```yaml
  - hostname: career-local.example.com
    service: http://127.0.0.1:4210
```

DNS がトンネルへ向いていなければ `cloudflared tunnel route dns <name> career-local.example.com`。ローカル管理のトンネルは設定ファイルを自動で読み直さないので、**同じトンネルを走らせている cloudflared をすべて再起動する**（launchd なら `launchctl kickstart -k gui/$(id -u)/<Label>`、別プロジェクトのスクリプトが起動した connector も）。`cloudflared tunnel info <name>` で connector の一覧と起動時刻を確認できる。古い connector が残っていると、そこへ振り分けられた要求だけ 404 になる。

```sh
npm run dev:tunnel
```

起動時に次を行う：ingress が該当ホスト名を `127.0.0.1:4210`（画面）または `:4211`（API）へ向けているか（`cloudflared tunnel ingress rule`）、connector がオンラインか（`cloudflared tunnel info`）を確認し、connector がなければこのセッションだけ `cloudflared tunnel run <name>` を起動する。その後 `Public web: https://…`（画面ポート公開時）と `Public MCP endpoint: https://…/api/career/mcp` を表示し、数秒後に公開アドレスの `/.well-known/oauth-protected-resource` を実際に取得して `Public check OK` または原因（404 = 古い connector、名前解決不可 = DNS キャッシュ）を表示する。Agent には表示されたアドレスを登録する。

**B. 名前付きトンネルがない（使い捨てアドレス）** — `.env` に上の 2 行がなければ、[cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) の quick tunnel で `https://<random>.trycloudflare.com` を開く。`~/.cloudflared/config.yml` があっても専用の設定ファイルで起動するため影響しない。アドレスは起動ごとに変わり、トークンの audience も変わるため、再起動後は Agent で再認可する。

### 起動コマンドの一覧

| 状況 | コマンド | 公開アドレス |
| --- | --- | --- |
| 本機だけで使う | `npm run dev` | なし（`127.0.0.1:4211` / `localhost:4210`） |
| 名前付きトンネル（`.env` に `CAREER_TUNNEL` と `CAREER_PUBLIC_ORIGIN`） | `npm run dev:tunnel` | `CAREER_PUBLIC_ORIGIN`（固定） |
| トンネル未作成、一時的に試す（`.env` に上記なし） | `npm run dev:tunnel` | 起動ごとに変わる `https://<random>.trycloudflare.com` |

公開アドレスが変わると既存の許可は audience 不一致で無効になり、Agent 側で再認可する。

## デモと CLI

[架空サンプル](../examples/README.md)で試す。CLI は動作中の Worker に接続し、画面と同じデータを扱う。

```sh
node scripts/career-data.mjs state
node scripts/career-data.mjs preview examples/demo-jobs.json
node scripts/career-data.mjs import examples/demo-jobs.json
```

CLI の URL は `CAREER_API_URL`、認証は `CAREER_API_TOKEN` で指定する。CLI は `.env` や `.dev.vars` を自動読込みしない。API ポートを変えた場合は `CAREER_API_URL` をシェルで指定する。Google モードでは手動トークンがないため、この CLI は本機 off モード専用。

## よくある問題

| 症状 | 対応 |
| --- | --- |
| Node が古い | バージョンを確認し、対象 LTS へ切替後 npm ci |
| ポートが使用中 | 元のターミナルを停止するか `.env` でポートを変える |
| 画面だけ起動した | npm run dev を使用。doctor で API とプロキシを確認 |
| 設定が反映されない | `.env` と `.dev.vars` の役割を確認して再起動 |
| Google の unauthorized-domain | localhost を承認ドメインに追加し、localhost URL で開く |
| ログイン後に拒否 | Google ログインの再試行、プロジェクト一致を確認 |
| 古いデータがない | データ保存先が変わっていないか確認。実データの上書きはしない |
| npm ci が OS バイナリで失敗 | 対象 OS で再インストール。ネット接続と対象 Node を確認 |

[バックアップ・復旧](lifecycle/10-operations.md)、[既知の制約](limitations.md)も確認する。

## 表示言語

ログイン画面とワークスペース上部の言語メニューから、中文（簡体字）・日本語・English を切り替えられる。初回はブラウザーの言語を使用し、対応外の場合は簡体字中国語を表示する。選択はこのブラウザーに保存され、再読み込み後も維持される。

表示言語は履歴書、企業メモ、準備資料、面接回答の原文や回答言語とは独立している。応募状況やプラットフォームのカテゴリも、保存する値を変えずに表示のみ翻訳する。
