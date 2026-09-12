# コントリビューション

不具合は再現手順、期待値、実結果、OS、Node.js、対象コミットを添えて Issue に報告してください。個人プロフィール、応募資料、認証トークン、DB、実画面の個人情報を添付しないでください。

## 開発

1. Fork / clone し、Node.js 22.13 以上で npm ci。
2. `.env.example` を参考に、リポジトリ外の**テスト専用**保存先を指定。
3. ブランチで変更し、要件 ID または Issue と対応づける。
4. `npm test`、`npm run typecheck`、`npm run check:docs`、`npm run build` を実行。
5. 文書・スキル変更は `npm run skills:archive` で反映。
6. 対象ファイルだけを stage し、`npm run check:public` と `git diff --cached` を確認。
7. PR に問題、変更後の挙動、検証、残課題を書く。

`npm run lint` は既存 UI の未解消指摘も表示します。[制約](docs/limitations.md)を参照。既存の指摘を隠すためにルールを全体で無効にせず、触れた範囲の新しい問題を解消してください。

## 文書と画像

日本語の導入・設計文書を基本とします。実装、計画、記入例、未検証を明確にします。図の編集は `scripts/render-diagrams.mjs`、原稿は docs。実装を変えた場合は要件・API・テスト・CHANGELOG の対応箇所を更新します。

独立した新機能は Issue で範囲を先に合わせます。個人データの公開、外部送信、公開ホスティングは通常の文書修正に含めません。
