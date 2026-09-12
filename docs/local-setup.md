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

[http://localhost:4318](http://localhost:4318) を開く。サービス停止は Ctrl+C。状態の診断は別ターミナルで `npm run doctor`。

`npm run dev` / `npm start` は両方とも開発構成を起動する。ビルド成果物の公開配信を自動設定するコマンドではない。データ保存先は Node.js のホームディレクトリ配下 `~/.local/share/career-note/worker-state/`。スキーマは初回 API アクセスで作成される。

## ローカル設定

既存ファイルがある場合は上書きせず編集する。

```sh
cp -n .env.example .env
```

```dotenv
CAREER_DATA_DIR=/absolute/path/outside/repository/career-note-data
CAREER_WEB_PORT=4318
CAREER_API_PORT=4319
```

このパスは例であり、そのまま貼り付けず、自分の書込み可能な保存先へ変える。空欄なら既定の保存先。起動スクリプトは `.env` を読み、既にシェルにある環境変数を優先する。ポートが競合したら両ポートを空いている番号に変える。無関係なサービスを終了しない。

`CAREER_API_PROXY` は画面の転送先、`CAREER_WRANGLER_CONFIG` は Worker 設定パスを上書きする任意項目。既に API が動いているときは `CAREER_API_PROXY=http://127.0.0.1:4329 npm run dev:web` で画面だけ起動できる。`npm run dev` は転送先にかかわらず Worker も起動する。

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
CAREER_ALLOWED_EMAILS=you@example.com
CAREER_ALLOWED_UIDS=
CAREER_ADMIN_UIDS=
```

設定後に再起動し、Google ログインする。許可するメールはログインに使う確認済み Google メール。複数はカンマ区切り。Firebase Authentication のユーザー UID を `CAREER_ALLOWED_UIDS` に使う方法もある。管理機能が必要ならその UID を `CAREER_ADMIN_UIDS` にも設定する。管理者指定だけではアクセス許可にならない。

サービスアカウント秘密鍵は不要。Web 設定はブラウザーへ返す公開設定で、秘密の管理者資格情報ではない。API キーを含め、実プロジェクト設定は `.dev.vars` に保管し、サンプルへ入れない。

FIREBASE_PROJECT_ID が存在すると既定の認証モードは strict。明示的な off は本機モード専用。on / strict の両方で署名検証とアカウント許可判定を行う。空の許可リストはアクセス拒否。複数アカウントは同じ個人ワークスペースを共有する。

参考：[Google サインイン](https://firebase.google.com/docs/auth/web/google-signin)、[ID トークン検証](https://firebase.google.com/docs/auth/admin/verify-id-tokens)。

## デモと CLI

[架空サンプル](../examples/README.md)で試す。CLI は動作中の Worker に接続し、画面と同じデータを扱う。

```sh
node scripts/career-data.mjs state
node scripts/career-data.mjs preview examples/demo-jobs.json
node scripts/career-data.mjs import examples/demo-jobs.json
```

CLI の URL は `CAREER_API_URL`、認証は `CAREER_API_TOKEN` で指定する。CLI は `.env` や `.dev.vars` を自動読込みしない。API ポートを変えた場合は `CAREER_API_URL` をシェルで指定する。Google モードでは管理画面で必要な scope の Agent トークンを発行し、環境変数として渡す。トークンをコマンド例・Issue・Git に保存しない。

## よくある問題

| 症状 | 対応 |
| --- | --- |
| Node が古い | バージョンを確認し、対象 LTS へ切替後 npm ci |
| ポートが使用中 | 元のターミナルを停止するか `.env` でポートを変える |
| 画面だけ起動した | npm run dev を使用。doctor で API とプロキシを確認 |
| 設定が反映されない | `.env` と `.dev.vars` の役割を確認して再起動 |
| Google の unauthorized-domain | localhost を承認ドメインに追加し、localhost URL で開く |
| ログイン後に拒否 | メール / UID の許可設定、プロジェクト一致を確認 |
| 古いデータがない | データ保存先が変わっていないか確認。実データの上書きはしない |
| npm ci が OS バイナリで失敗 | 対象 OS で再インストール。ネット接続と対象 Node を確認 |

[バックアップ・復旧](lifecycle/10-operations.md)、[既知の制約](limitations.md)も確認する。
